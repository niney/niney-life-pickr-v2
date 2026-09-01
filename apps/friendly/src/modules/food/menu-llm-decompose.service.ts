// 구성이 이름에 없는 세트("모듬회 대", "돼지한판", "커플세트")를 LLM 이 구성요소로 분해한다.
//
// 엔진은 결합 기호(A+B) 세트만 스스로 나눈다. 그 밖의 세트는 메뉴판을 봐야 알 수 있는 정보라 LLM 의
// 일반 상식 추정이다 — 그래서 결과는 `partsEstimated` 로 표시하고, 구성요소의 칼로리는 다시 엔진(규칙)·
// LLM 매칭으로 잡는다(숫자는 LLM 이 만들지 않는다). 어휘 단위 영구 캐시(menu_llm_decompositions).
//
// 채택 조건: confidence high|medium, 구성 2~8개, 각 구성은 짧은 음식명(2~15자, 숫자·기호 없음).
// "커플세트"처럼 식당마다 다른 이름은 LLM 이 low 를 주거나 null 을 주므로 자연히 빠진다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { thinkOptionForModel } from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';

export const MENU_LLM_DECOMPOSE_VERSION = 1;
const LLM_TIMEOUT_MS = 30_000;
const LLM_CONCURRENCY = 3;
const MAX_ASK_PER_CALL = 30;
const MIN_PARTS = 2;
const MAX_PARTS = 8;

export const MENU_LLM_DECOMPOSE_SYSTEM_PROMPT = `너는 한국 식당의 세트 메뉴명을 보고 구성 음식을 추정하는 분해기다.
메뉴명에서 **일반적으로 함께 나오는 음식**만 짧은 표준 음식명으로 나열한다.
- 메뉴명에 재료·음식이 적혀 있으면 그것을 우선한다 ("돼지모듬" → 삼겹살, 목살, 항정살 / "모듬회" → 광어, 우럭, 연어).
- 식당마다 다른 이름("커플세트", "A세트", "런치정식")은 구성을 알 수 없으므로 components 를 null 로 두고 confidence 를 low 로 한다.
- 밥·국·반찬 같은 기본 찬은 넣지 않는다. 술·음료는 이름에 있을 때만.
- 각 구성은 브랜드·수식어·중량을 뺀 2~10자 음식명 하나. 숫자·기호를 넣지 마라.
- confidence 는 이 구성이 실제와 맞을 확신이다. 이름만으로 확실한 것(삼겹살+목살 같은 "돼지모듬")만 high.
JSON 만 출력: {"components": ["<음식명>", ...] 또는 null, "confidence": "high"|"medium"|"low", "reason": "<20자 이내>"}`;

export const MENU_LLM_DECOMPOSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    components: { type: ['array', 'null'], items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['components', 'confidence'],
} as const;

export interface DecomposeOutput {
  components: string[] | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string | null;
}

export const parseDecomposeOutput = (text: string): DecomposeOutput | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const conf = o['confidence'];
    if (conf !== 'high' && conf !== 'medium' && conf !== 'low') return null;
    const comps = Array.isArray(o['components'])
      ? (o['components'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : null;
    return { components: comps, confidence: conf, reason: typeof o['reason'] === 'string' ? o['reason'] : null };
  } catch {
    return null;
  }
};

const PART_OK_RE = /^[\p{Script=Hangul}\p{L}\s]{2,15}$/u;

/** 채택 규칙 — 채택되면 정리한 구성 목록, 아니면 null. 순수 함수. */
export const decideDecomposition = (out: DecomposeOutput): string[] | null => {
  if (out.confidence === 'low' || !out.components) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of out.components) {
    const t = c.trim().replace(/\s+/g, ' ');
    if (!PART_OK_RE.test(t)) continue;
    const key = normalizeTerm(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(t);
  }
  if (parts.length < MIN_PARTS || parts.length > MAX_PARTS) return null;
  return parts;
};

export interface MenuLlmDecomposeServiceOptions {
  model?: string;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
}

export class MenuLlmDecomposeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: MenuLlmDecomposeServiceOptions = {},
  ) {}

  /** 캐시만. 값 null = "물어봤고 분해 안 됨", 키 없음 = 아직 안 물어봄. */
  async lookupCached(names: string[]): Promise<Map<string, string[] | null>> {
    const out = new Map<string, string[] | null>();
    if (names.length === 0) return out;
    const byNorm = new Map<string, string[]>();
    for (const n of names) {
      const norm = normalizeTerm(n);
      if (norm) byNorm.set(norm, [...(byNorm.get(norm) ?? []), n]);
    }
    const rows = await this.prisma.menuLlmDecomposition.findMany({
      where: { nameNorm: { in: [...byNorm.keys()] }, version: { gte: MENU_LLM_DECOMPOSE_VERSION } },
      select: { nameNorm: true, componentsJson: true },
    });
    for (const r of rows) {
      let parts: string[] | null = null;
      try {
        const v = JSON.parse(r.componentsJson) as unknown;
        parts = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
      } catch {
        parts = null;
      }
      for (const n of byNorm.get(r.nameNorm) ?? []) out.set(n, parts && parts.length > 0 ? parts : null);
    }
    return out;
  }

  /** 캐시에 없는 이름만 묻고 저장. 반환은 이번에 새로 판정한 것만. */
  async decomposeMany(names: string[], opts: { signal?: AbortSignal } = {}): Promise<Map<string, string[] | null>> {
    const out = new Map<string, string[] | null>();
    const cached = await this.lookupCached(names);
    const pending = [...new Set(names.filter((n) => normalizeTerm(n) && !cached.has(n)))].slice(0, MAX_ASK_PER_CALL);
    if (pending.length === 0) return out;
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    const model = (this.opts.model?.trim() || resolved?.defaultModel?.trim()) ?? '';
    if (!resolved || !model) {
      this.opts.logger?.warn('[menu-llm-decompose] chat provider/모델 미설정 — 건너뜀');
      return out;
    }
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    const queue = [...new Map(pending.map((n) => [normalizeTerm(n), n])).entries()];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        if (opts.signal?.aborted) return;
        const [norm, name] = queue[next++]!;
        const verdict = await this.askOne(provider, model, name, opts.signal);
        if (verdict === undefined) continue;
        for (const n of pending) if (normalizeTerm(n) === norm) out.set(n, verdict);
      }
    };
    await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, worker));
    return out;
  }

  private async askOne(provider: LLMProvider, model: string, name: string, outerSignal?: AbortSignal): Promise<string[] | null | undefined> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
    const onAbort = (): void => ac.abort();
    outerSignal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await provider.complete({
        prompt: `세트 메뉴명: ${name}\n\nJSON 으로만 답하라.`,
        systemPrompt: MENU_LLM_DECOMPOSE_SYSTEM_PROMPT,
        model,
        temperature: 0,
        maxTokens: 300,
        numCtx: 2048,
        format: MENU_LLM_DECOMPOSE_JSON_SCHEMA as unknown as Record<string, unknown>,
        think: thinkOptionForModel(model),
        signal: ac.signal,
      });
      const parsed = parseDecomposeOutput(res.text);
      if (!parsed) {
        this.opts.logger?.warn({ name, text: res.text.slice(0, 120) }, '[menu-llm-decompose] 파싱 실패');
        return undefined;
      }
      const parts = decideDecomposition(parsed);
      const norm = normalizeTerm(name);
      const data = {
        menuName: name,
        componentsJson: JSON.stringify(parts ?? []),
        confidence: parsed.confidence,
        reason: parsed.reason,
        model,
        version: MENU_LLM_DECOMPOSE_VERSION,
      };
      await this.prisma.menuLlmDecomposition.upsert({ where: { nameNorm: norm }, create: { nameNorm: norm, ...data }, update: data });
      return parts;
    } catch (e) {
      this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e), name }, '[menu-llm-decompose] 호출 실패');
      return undefined;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onAbort);
    }
  }
}
