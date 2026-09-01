// 구성이 이름에 없는 세트("모듬회 대", "돼지한판", "커플세트")를 LLM 이 구성요소로 분해한다.
//
// 엔진은 결합 기호(A+B) 세트만 스스로 나눈다. 그 밖의 세트는 메뉴판을 봐야 알 수 있는 정보라 LLM 의
// 일반 상식 추정이다 — 그래서 결과는 `partsEstimated` 로 표시하고, 구성요소의 칼로리는 다시 엔진(규칙)·
// LLM 매칭으로 잡는다(숫자는 LLM 이 만들지 않는다). 어휘 단위 영구 캐시(menu_llm_decompositions).
//
// 채택 조건: confidence high, 구성 1~8개(1개는 주메뉴만 있는 세트), 각 구성은 짧은 음식명(2~15자, 숫자·기호·범주어 없음).
// "커플세트"처럼 식당마다 다른 이름은 LLM 이 low 를 주거나 null 을 주므로 자연히 빠진다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { thinkOptionForModel } from '@repo/utils';
import { normalizeTerm } from '../../lib/text.js';
import { DEFAULT_LEXICON } from './engine/lexicon.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';

// v2: high 만 채택. v3: 관용 구성도 high 로 지시, 범주어(고기·야채) 제거, 메뉴명에 없는 음식(찬·사이드)을 지어내지 않게, 음식명을 자르지 않게(골뱅이탕→뱅이탕 ✗).
export const MENU_LLM_DECOMPOSE_VERSION = 3;
const LLM_TIMEOUT_MS = 30_000;
const LLM_CONCURRENCY = 3;
const MAX_ASK_PER_CALL = 30;
// 한 개짜리(주메뉴만 있는 세트)도 받는다 — 서비스가 그 음식의 100g당으로 보여 준다.
const MIN_PARTS = 1;
const MAX_PARTS = 8;

export const MENU_LLM_DECOMPOSE_SYSTEM_PROMPT = `너는 한국 식당의 세트 메뉴명을 보고 구성 음식을 적는 분해기다.
메뉴명 **안에 적혀 있거나 그 이름이 관용적으로 뜻하는 음식**만 표준 음식명으로 나열한다.
- 메뉴명에 음식이 적혀 있으면 그 음식들을 그대로 적는다 ("족발+골뱅이탕 세트" → 족발, 골뱅이탕. 이름을 자르지 마라).
- "돼지모듬"·"소모듬"·"모듬회"처럼 관용적으로 구성이 정해진 이름은 그 구성을 적는다 (돼지모듬 → 삼겹살, 목살, 항정살).
- 메뉴명에 없는 찬·사이드·음료(도토리묵, 공기밥, 콜라)를 지어내지 마라. 술·음료는 이름에 있을 때만.
- 식당마다 다른 이름("커플세트", "A세트", "투게더 세트", "런치정식")은 구성을 알 수 없다 → components null, confidence low.
- 음식이 하나뿐이면 그 하나만 적는다 ("와규꽃살 2인 세트" → 와규꽃살).
- 각 구성은 브랜드·수식어·중량을 뺀 2~10자 음식명 하나. 숫자·기호를 넣지 마라.
- "고기"·"야채"·"해물"·"음료"·"안주" 같은 범주어는 음식이 아니다 — 적지 마라. 범주어뿐이면 null, low.
- confidence: 메뉴명에 적혀 있거나 관용적으로 정해진 구성(돼지모듬·모듬회)이면 high, 반쯤 짐작이면 medium, 모르면 low.
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
  // high 만 — medium 은 실측(2026-09-03)에서 '통뱅이탕세트 → 뱅이탕, 도토리묵' 처럼 지어낸 찬이 섞였다.
  if (out.confidence !== 'high' || !out.components) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of out.components) {
    const t = c.trim().replace(/\s+/g, ' ');
    if (!PART_OK_RE.test(t)) continue;
    const key = normalizeTerm(t);
    if (!key || seen.has(key)) continue;
    // 범주어(고기·야채·음료)는 구성이 아니다 — 카탈로그에도 없고 붙으면 엉뚱한 값이 된다.
    if (DEFAULT_LEXICON.suffixBlock.has(key)) continue;
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
