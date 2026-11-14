// 메뉴 구성 읽기(LLM) — 식당 메뉴의 이름 + 설명에서 구성 음식과 택1 묶음을 뽑아 저장한다(menu_llm_compositions).
//
// 글(이름 + 설명) 단위 영구 캐시 — 같은 글이면 식당이 달라도 한 번만 묻는다. 무엇을 물을지·답을 믿을지는 menu-composition.ts
// (순수 함수)가 정하고, 여기는 호출·저장·실패 간격만 맡는다. 세트 분해(menu-llm-decompose.service)와 같은 틀이다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { thinkOptionForModel } from '@repo/utils';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import { FailureBackoff, MENU_FAILURE_GIVE_UP_AFTER } from './menu-failure-backoff.js';
import {
  MENU_COMPOSITION_VERSION,
  compositionKey,
  decideComposition,
  parseCompositionOutput,
  parseStoredComposition,
  type CompositionOutput,
  type MenuComposition,
} from './menu-composition.js';

const LLM_TIMEOUT_MS = 30_000;
const LLM_CONCURRENCY = 3;
const MAX_ASK_PER_CALL = 30;
const DESCRIPTION_MAX = 400;

export const MENU_COMPOSITION_SYSTEM_PROMPT = `너는 한국 식당 메뉴 한 줄(메뉴명과 설명)을 읽고, 그 메뉴를 시키면 나오는 음식 구성을 적는 판독기다.
**메뉴명이나 설명에 적혀 있는 음식만** 적는다. 짐작으로 더하지 않는다.

[구성 fixed]
- 코스·세트·정식처럼 **따로 담겨 나오는 음식 여럿**이 함께 나오는 메뉴면, 적혀 있는 음식을 적힌 차례대로 적는다.
  ("춘권샐러드 + 유산슬 + 칠리새우" → 춘권샐러드, 유산슬, 칠리새우)
- 메뉴명이 **음식 하나의 이름**이고 설명에는 거기 곁들여 나오는 것만 적혀 있으면, 메뉴명의 음식을 맨 앞에 적는다.
  (메뉴명 "모듬카츠", 설명 "샐러드+카레+공기밥" → 모듬카츠, 샐러드, 카레, 공기밥)
  메뉴명이 세트·정식·한상·코스·박스의 이름이면("다복정식", "커플세트", "낙지한상", "스낵박스") 그 이름은 음식이 아니다 —
  적지 않고 설명에 적힌 음식만 적는다. 설명이 이미 그 메뉴의 내용을 늘어놓았으면("모둠수육" 설명 "머리고기+순대+순대국")
  메뉴명을 또 적지 않는다.
- 설명이 맛·재료·조리법·원산지를 알리는 글이면 구성이 아니다 → fixed 는 빈 배열, confidence 는 low.
  ("새우, 오징어, 돼지고기 삼선 토핑의 간짜장" 은 재료 설명이다. "깊고 진한 국물의 짬뽕" 은 홍보 문구다.)
- **음식 하나에 든 것**을 늘어놓은 글도 구성이 아니다 — 올린 토핑, 들어간 건더기, 섞는 재료다.
  ("타코야끼+마늘후레이크+갈릭소스+가쓰오부시" 는 타코야끼 하나에 올린 것이다. "복숭아아이스티+에스프레소" 는 음료 한 잔의 재료다.
   "닭튀김, 누들떡, 어묵볼, 삶은 계란까지 담아낸 떡볶이" 는 떡볶이 한 그릇의 건더기다. "불고기+새우" 피자는 토핑이다.)
  다만 모둠·모듬·반반처럼 **여러 가지를 한 접시에 함께 낸 메뉴**는 그 가지들이 구성이다.
  ("제주숙성모둠" 설명 "오겹살+목살+가브리살" → 오겹살, 목살, 가브리살 / "등안카츠" 설명 "등심+안심" → 등심카츠, 안심카츠)
  고기 한 덩이가 어느 부위로 이루어졌는지 알리는 글은 구성이 아니다("돈마호크" 설명 "갈비, 등심, 가브리살로 구성된 부위").
- 음식 하나짜리 메뉴에 그 음식을 꾸미는 말이 붙은 것도 구성이 아니다.
- 메뉴명이 음식이 아니라 안내문·공지면("기본반찬, 추가요금 안받습니다", "매장에서 식사 시 … 제공", "리뷰 이벤트") 구성이 아니다 → low.
- 소스·양념·국물·일회용품(소스, 머스타드, 소금, 우동국물, 물티슈)과 '서비스'·'리뷰 이벤트'로 주는 것은 적지 않는다. 음료·술은 적혀 있으면 적는다.

[고르기 choices]
- "택1"·"중 1택"·"A or B"·"A/B 중 선택"처럼 그중 하나만 고르는 음식이 적혀 있으면 choices 에 묶음으로 적고 fixed 에는 넣지 않는다.
  ("(짜장,짬뽕 택1)" → options: 짜장면, 짬뽕 / "함흥냉면(비빔/물)" → options: 비빔냉면, 물냉면)
- 한 음식의 종류·속재료를 고르는 것이면 선택지를 완성된 음식 이름으로 적고, 그 음식을 fixed 에 따로 넣지 않는다.
  ("따꼬(비프/치킨/새우)" → options: 비프따꼬, 치킨따꼬, 새우따꼬 — fixed 는 빈 배열)
- 선택지 음식 이름이 적혀 있지 않으면("음료 택1", "식사류 택1") 그 묶음은 만들지 않는다.
- 둘 이상을 고르는 것("택2", "3가지 중 2가지 선택", "중 선택2")은 묶음을 만들지 않는다.
- 선택지가 음식 하나의 이름이 아니라 묶음·종류의 이름이면("요리코스 또는 스시코스", "커피 or 에이드 종류") 만들지 않는다.
- 맛·맵기·소스·온도(HOT/ICE)·크기(소/중/대)·부위·굽기를 고르는 것은 음식 고르기가 아니다 → 묶음을 만들지 않는다.
  ("찜닭(뼈/순살)", "늑간살(생/간장/미소)" 는 같은 음식의 부위·양념만 다르다 — choices 는 빈 배열.)
- label 은 그 묶음이 무엇인지 글에 적혀 있으면 그 말("식사"), 없으면 null.

[이름]
- 각 음식은 수량·중량·수식어·브랜드를 뺀 2~10자 음식명 하나. 숫자·기호 금지. ("닭꼬치 10개" → 닭꼬치, "미니 탕수육" → 탕수육)
- 줄임말은 통용되는 음식 이름으로 편다("짜장" → 짜장면, 냉면의 "비빔/물" → 비빔냉면, 물냉면). 그 밖에는 **적힌 말을 바꾸지 않는다** —
  같은 음식의 다른 이름으로 고쳐 쓰지 않고("닭도리탕"을 닭볶음탕으로 쓰지 않는다), 글에 없는 음식 이름을 붙이지도 않는다.
- "고기"·"야채"·"해물"·"음료"·"식사"·"후식" 같은 범주어만 있으면 음식이 아니다 — 적지 않는다.

[confidence]
- 구성이나 고르기가 글에 분명히 적혀 있으면 high, 반쯤 짐작이면 medium, 구성이 아니거나 모르면 low.

JSON 만 출력: {"fixed": ["<음식명>", ...], "choices": [{"label": "<말>" 또는 null, "options": ["<음식명>", ...]}], "confidence": "high"|"medium"|"low", "reason": "<20자 이내>"}`;

export const MENU_COMPOSITION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    choices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: ['string', 'null'] },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['options'],
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
  required: ['fixed', 'choices', 'confidence'],
} as const;

export const buildCompositionUserPrompt = (name: string, description: string | null | undefined): string => {
  const desc = (description ?? '').replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX);
  return `메뉴명: ${name.trim()}\n설명: ${desc || '(없음)'}\n\nJSON 으로만 답하라.`;
};

export interface MenuLine {
  name: string;
  description: string | null | undefined;
}

export interface MenuCompositionServiceOptions {
  model?: string;
  logger?: FastifyBaseLogger;
  cache?: AdapterCache;
  // 실패한 글의 재시도 간격(테스트 주입용). 기본 30분, 응답 해석 실패 3회면 '포기'를 저장한다.
  failures?: FailureBackoff;
}

export class MenuCompositionService {
  private readonly failures: FailureBackoff;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: MenuCompositionServiceOptions = {},
  ) {
    this.failures = opts.failures ?? new FailureBackoff();
  }

  /**
   * 캐시만. 키는 compositionKey(이름, 설명). 값 null = "물어봤고 구성 없음", 키 없음 = 아직 안 물어봄.
   * 최근 실패해 재시도 간격 안인 글도 null 로 준다.
   */
  async lookupCached(lines: MenuLine[]): Promise<Map<string, MenuComposition | null>> {
    const out = new Map<string, MenuComposition | null>();
    const keys = [...new Set(lines.map((l) => compositionKey(l.name, l.description)))];
    if (keys.length === 0) return out;
    const rows = await this.prisma.menuLlmComposition.findMany({
      where: { textHash: { in: keys }, version: { gte: MENU_COMPOSITION_VERSION } },
      select: { textHash: true, resultJson: true },
    });
    for (const r of rows) out.set(r.textHash, parseStoredComposition(r.resultJson));
    for (const key of keys) {
      if (!out.has(key) && this.failures.isBackingOff(key)) out.set(key, null);
    }
    return out;
  }

  /** 캐시에 없는 글만 묻고 저장한다. 반환은 이번에 새로 판정한 것만(키 → 구성 또는 null). */
  async readMany(lines: MenuLine[], opts: { signal?: AbortSignal } = {}): Promise<Map<string, MenuComposition | null>> {
    const out = new Map<string, MenuComposition | null>();
    const cached = await this.lookupCached(lines);
    const pending = new Map<string, MenuLine>();
    for (const line of lines) {
      const key = compositionKey(line.name, line.description);
      if (!cached.has(key) && !pending.has(key) && pending.size < MAX_ASK_PER_CALL) pending.set(key, line);
    }
    if (pending.size === 0) return out;
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    const model = (this.opts.model?.trim() || resolved?.defaultModel?.trim()) ?? '';
    if (!resolved || !model) {
      this.opts.logger?.warn('[menu-composition] chat provider/모델 미설정 — 건너뜀');
      return out;
    }
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    const queue = [...pending.entries()];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        if (opts.signal?.aborted) return;
        const [key, line] = queue[next++]!;
        const verdict = await this.askOne(provider, model, key, line, opts.signal);
        if (verdict !== undefined) out.set(key, verdict);
      }
    };
    await Promise.all(Array.from({ length: Math.min(LLM_CONCURRENCY, queue.length) }, worker));
    return out;
  }

  private async askOne(
    provider: LLMProvider,
    model: string,
    key: string,
    line: MenuLine,
    outerSignal?: AbortSignal,
  ): Promise<MenuComposition | null | undefined> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
    const onAbort = (): void => ac.abort();
    outerSignal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await provider.complete({
        prompt: buildCompositionUserPrompt(line.name, line.description),
        systemPrompt: MENU_COMPOSITION_SYSTEM_PROMPT,
        model,
        temperature: 0,
        maxTokens: 400,
        numCtx: 4096,
        format: MENU_COMPOSITION_JSON_SCHEMA as unknown as Record<string, unknown>,
        think: thinkOptionForModel(model),
        signal: ac.signal,
      });
      const parsed = parseCompositionOutput(res.text);
      if (!parsed) {
        this.opts.logger?.warn({ name: line.name, text: res.text.slice(0, 120) }, '[menu-composition] 파싱 실패');
        // 글에 묶인 실패 — 간격을 두고, 거듭되면 '포기'(구성 없음)로 저장해 다시 묻지 않는다.
        if (this.failures.record(key, true) < MENU_FAILURE_GIVE_UP_AFTER) return undefined;
        await this.save(key, line, model, null, 'low', `응답 해석 실패 ${MENU_FAILURE_GIVE_UP_AFTER}회 — 판정 포기`);
        this.failures.clear(key);
        return null;
      }
      const composition = decideComposition(parsed, line);
      await this.save(key, line, model, composition, parsed.confidence, parsed.reason);
      this.failures.clear(key);
      return composition;
    } catch (e) {
      this.opts.logger?.warn(
        { err: e instanceof Error ? e.message : String(e), name: line.name },
        '[menu-composition] 호출 실패',
      );
      // 업스트림 장애 — 간격만 두고 포기하지 않는다(호출자 취소는 제외).
      if (!outerSignal?.aborted) this.failures.record(key, false);
      return undefined;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onAbort);
    }
  }

  private async save(
    key: string,
    line: MenuLine,
    model: string,
    composition: MenuComposition | null,
    confidence: CompositionOutput['confidence'],
    reason: string | null,
  ): Promise<void> {
    const data = {
      menuName: line.name.trim().slice(0, 200),
      description: (line.description ?? '').replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX),
      resultJson: JSON.stringify(composition),
      confidence,
      reason: reason?.slice(0, 120) ?? null,
      model,
      version: MENU_COMPOSITION_VERSION,
    };
    await this.prisma.menuLlmComposition.upsert({
      where: { textHash: key },
      create: { textHash: key, ...data },
      update: data,
    });
  }
}
