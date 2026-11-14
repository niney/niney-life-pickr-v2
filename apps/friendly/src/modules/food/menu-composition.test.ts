import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import { FailureBackoff } from './menu-failure-backoff.js';
import {
  compositionKey,
  decideComposition,
  isCompositionCandidate,
  parseCompositionOutput,
  parseStoredComposition,
  type CompositionOutput,
} from './menu-composition.js';
import { MenuCompositionService } from './menu-composition.service.js';

// 메뉴 구성 읽기 — 물어볼 메뉴를 고르는 규칙과, LLM 의 답을 믿을지 정하는 규칙. 사례는 운영 메뉴 표본 160개를 눈으로
// 채점하며(2026-11-14) 틀렸던 것들이다.

const high = (fixed: string[], choices: { label?: string | null; options: string[] }[] = []): CompositionOutput => ({
  fixed,
  choices: choices.map((c) => ({ label: c.label ?? null, options: c.options })),
  confidence: 'high',
  reason: null,
});

describe('isCompositionCandidate', () => {
  it("설명에 '+' 나열·고르기 표식이 있으면 묻는다", () => {
    expect(isCompositionCandidate('이 코스(2인이상)', '춘권샐러드 + 유산슬 + 칠리새우 + 탕수육 + (짜장,짬뽕 택1)')).toBe(true);
    expect(isCompositionCandidate('A 세트', '닭꼬치 5개 + 프리미엄 어묵탕 or 바싹 먹태')).toBe(true);
    expect(isCompositionCandidate('한상', '보쌈, 막국수, 된장국으로 구성')).toBe(true);
  });

  it('이름에 대안이 적혀 있으면 묻는다 — 온도·크기 고르기와 이름 앞 표식은 아니다', () => {
    expect(isCompositionCandidate('후식 냉면(물/비빔)', null)).toBe(true);
    expect(isCompositionCandidate('물,비빔냉면', '')).toBe(true);
    expect(isCompositionCandidate('아메리카노(HOT/ICE)', null)).toBe(false);
    expect(isCompositionCandidate('탕수육(소/중/대)', null)).toBe(false);
    expect(isCompositionCandidate('[NEW/순살] 찜닭', null)).toBe(false);
  });

  it('홍보 문구뿐인 메뉴는 묻지 않는다', () => {
    expect(isCompositionCandidate('짬뽕', '깊고 진한 국물의 짬뽕')).toBe(false);
    expect(isCompositionCandidate('한우 1++ 등심', '1+1 행사 중')).toBe(false);
    expect(isCompositionCandidate('김치찌개', null)).toBe(false);
  });
});

describe('compositionKey', () => {
  it('같은 글이면 띄어쓰기 차이가 있어도 같은 키, 설명이 다르면 다른 키', () => {
    expect(compositionKey('이 코스', '유산슬 +  탕수육')).toBe(compositionKey(' 이 코스 ', '유산슬 + 탕수육'));
    expect(compositionKey('이 코스', '유산슬 + 탕수육')).not.toBe(compositionKey('이 코스', '유산슬 + 깐풍기'));
    expect(compositionKey('이 코스', null)).toBe(compositionKey('이 코스', ''));
  });
});

describe('parseCompositionOutput', () => {
  it('JSON 을 풀고, 신뢰도가 없거나 JSON 이 아니면 null', () => {
    expect(
      parseCompositionOutput('{"fixed":["유산슬",3],"choices":[{"label":"식사","options":["짜장면","짬뽕"]},"x"],"confidence":"high","reason":"명시"}'),
    ).toEqual({
      fixed: ['유산슬'],
      choices: [{ label: '식사', options: ['짜장면', '짬뽕'] }],
      confidence: 'high',
      reason: '명시',
    });
    expect(parseCompositionOutput('{"fixed":[],"choices":[]}')).toBeNull();
    expect(parseCompositionOutput('모르겠습니다')).toBeNull();
  });
});

describe('decideComposition', () => {
  const course = { name: '이 코스(2인이상)', description: '춘권샐러드 + 유산슬 + 칠리새우 + 탕수육 + (짜장,짬뽕 택1)' };

  it('코스의 구성과 택1 을 채택한다 — 줄임말을 편 이름("짜장" → 짜장면)도 적힌 것으로 본다', () => {
    expect(
      decideComposition(high(['춘권샐러드', '유산슬', '칠리새우', '탕수육'], [{ label: '식사', options: ['짜장면', '짬뽕'] }]), course),
    ).toEqual({
      fixed: ['춘권샐러드', '유산슬', '칠리새우', '탕수육'],
      choices: [{ label: '식사', options: ['짜장면', '짬뽕'] }],
    });
    expect(
      decideComposition(high([], [{ options: ['물냉면', '비빔냉면'] }]), { name: '후식 냉면(물/비빔)', description: null }),
    ).toEqual({ fixed: [], choices: [{ label: null, options: ['물냉면', '비빔냉면'] }] });
    // 앞 두 글자만 적힌 줄임말("함박" → 함박스테이크).
    expect(
      decideComposition(high(['꼬치'], [{ options: ['육회', '타다끼', '함박스테이크'] }]), {
        name: '숯마카세 SET',
        description: '(각종꼬치11종)+(육회/타다끼/함박/ 택1)',
      })?.choices[0]?.options,
    ).toEqual(['육회', '타다끼', '함박스테이크']);
  });

  it('high 가 아니면 쓰지 않는다', () => {
    expect(decideComposition({ ...high(['유산슬', '탕수육']), confidence: 'medium' }, course)).toBeNull();
    expect(decideComposition({ ...high([]), confidence: 'low' }, course)).toBeNull();
  });

  it('글에 없는 이름이 구성에 끼면 통째로 쓰지 않는다 — 나머지만 남기면 틀린 구성이 된다', () => {
    const source = { name: '닭도리탕 + 옛날통닭', description: '닭도리탕 + 옛날통닭 할인된 가격' };
    expect(decideComposition(high(['닭볶음탕', '옛날통닭']), source)).toBeNull();
    expect(decideComposition(high(['닭도리탕', '옛날통닭']), source)).toEqual({ fixed: ['닭도리탕', '옛날통닭'], choices: [] });
    // 꾸밈말만 글에 있고 음식은 지어낸 것.
    expect(
      decideComposition(high(['반반치킨', '막국수']), { name: '[반반세트+막국수', description: '메인메뉴.막국수.반찬' }),
    ).toBeNull();
    // 수량이 섞인 이름.
    expect(decideComposition(high(['유산슬 2접시', '탕수육']), course)).toBeNull();
  });

  it('범주어는 빼고 나머지를 쓴다 — 무엇인지 적히지 않았을 뿐 구성은 맞다', () => {
    expect(
      decideComposition(high(['팝콘', '음료', '살사치즈나쵸']), { name: '세트F', description: '[팝콘L + 음료2 + 살사치즈나쵸]' }),
    ).toEqual({ fixed: ['팝콘', '살사치즈나쵸'], choices: [] });
    expect(
      decideComposition(high(['애피타이저', '음료'], [{ options: ['파스타', '메인'] }]), {
        name: '런치 코스',
        description: '애피타이저 + 파스타/메인 + 음료',
      }),
    ).toBeNull();
  });

  it('메뉴 자신의 이름(묶음 이름)을 구성에 끼워 넣었으면 그것만 빼고, 구성 하나가 묶음이면 통째로 쓰지 않는다', () => {
    expect(
      decideComposition(high(['다복정식', '메밀묵', '모듬전']), { name: '[친구들과]다복정식', description: '메밀묵+모듬전' }),
    ).toEqual({ fixed: ['메밀묵', '모듬전'], choices: [] });
    expect(
      decideComposition(high(['반반세트', '막국수']), { name: '[반반세트+막국수', description: '메인메뉴.막국수' }),
    ).toBeNull();
  });

  it('고르는 묶음 — 음식이 아닌 선택지는 빼고, 하나만 남으면 묶음을 쓰지 않는다', () => {
    expect(
      decideComposition(high([], [{ options: ['요리코스', '스시코스'] }]), {
        name: '심야코스',
        description: '요리코스 또는 스시코스입니다',
      }),
    ).toBeNull();
    // 같은 음식을 고정 구성에도 적었으면 고르는 쪽이 맞다.
    expect(
      decideComposition(high(['황도', '계절과일'], [{ options: ['계절과일', '과자'] }]), {
        name: '항아리 황도& 과자세트',
        description: '황도와 계절 과일 or 추억의 과자가 같이 나오는 디저트 메뉴',
      }),
    ).toEqual({ fixed: ['황도'], choices: [{ label: null, options: ['계절과일', '과자'] }] });
  });

  it('둘 이상 고르는 메뉴("선택2")는 묶음을 만들지 않는다', () => {
    const source = { name: '반반 보쌈', description: '보쌈 or 불보쌈 or 마늘보쌈 중 선택2' };
    expect(decideComposition(high([], [{ options: ['보쌈', '불보쌈', '마늘보쌈'] }]), source)).toBeNull();
    expect(decideComposition(high(['돔베한도마'], [{ options: ['국수', '국밥'] }]), {
      name: '한도마세트',
      description: '돔베한도마+식사류(택2) 국수 국밥',
    })).toEqual({ fixed: ['돔베한도마'], choices: [] });
  });
});

describe('parseStoredComposition', () => {
  it("저장된 구성을 풀고, 'null'·깨진 값·빈 구성은 null", () => {
    expect(parseStoredComposition('{"fixed":["유산슬"],"choices":[{"label":null,"options":["짜장면","짬뽕"]}]}')).toEqual({
      fixed: ['유산슬'],
      choices: [{ label: null, options: ['짜장면', '짬뽕'] }],
    });
    expect(parseStoredComposition('null')).toBeNull();
    expect(parseStoredComposition('{"fixed":[],"choices":[{"options":["하나"]}]}')).toBeNull();
    expect(parseStoredComposition('{broken')).toBeNull();
  });
});

// DB·provider 없이 — 필요한 Prisma 메서드와 provider 만 흉내낸다.
const makeFakes = (answer: (prompt: string) => string) => {
  const store = new Map<string, { textHash: string; resultJson: string; version: number }>();
  const calls: string[] = [];
  const prisma = {
    menuLlmComposition: {
      findMany: async ({ where }: { where: { textHash: { in: string[] }; version: { gte: number } } }) =>
        [...store.values()].filter((r) => where.textHash.in.includes(r.textHash) && r.version >= where.version.gte),
      upsert: async ({ where, create }: { where: { textHash: string }; create: { resultJson: string; version: number } }) => {
        store.set(where.textHash, { textHash: where.textHash, resultJson: create.resultJson, version: create.version });
        return {};
      },
    },
  } as unknown as PrismaClient;
  const provider: LLMProvider = {
    complete: async ({ prompt }) => {
      calls.push(prompt);
      return { text: answer(prompt), model: 'm', promptTokens: null, completionTokens: null };
    },
  };
  const aiConfig = {
    getResolved: async () => ({ apiKey: 'k', baseUrl: 'u', timeoutMs: 1000, maxConcurrent: 2, defaultModel: 'gemma4:31b' }),
  } as unknown as AiConfigService;
  const cache = { get: () => provider } as unknown as AdapterCache;
  return { prisma, aiConfig, cache, calls, store };
};

describe('MenuCompositionService', () => {
  const course = { name: '이 코스(2인이상)', description: '유산슬 + 탕수육 + (짜장,짬뽕 택1)' };
  const promo = { name: '짬뽕 or 우동', description: '깊고 진한 국물' };

  it('캐시에 없는 글만 묻고, 구성 없음까지 저장해 다시 묻지 않는다', async () => {
    const f = makeFakes((prompt) =>
      prompt.includes('이 코스')
        ? '{"fixed":["유산슬","탕수육"],"choices":[{"label":"식사","options":["짜장면","짬뽕"]}],"confidence":"high","reason":"명시"}'
        : '{"fixed":[],"choices":[],"confidence":"low","reason":"홍보 문구"}',
    );
    const service = new MenuCompositionService(f.prisma, f.aiConfig, { cache: f.cache });
    expect((await service.lookupCached([course, promo])).size).toBe(0);

    const fresh = await service.readMany([course, promo]);
    expect(fresh.get(compositionKey(course.name, course.description))).toEqual({
      fixed: ['유산슬', '탕수육'],
      choices: [{ label: '식사', options: ['짜장면', '짬뽕'] }],
    });
    expect(fresh.get(compositionKey(promo.name, promo.description))).toBeNull();
    expect(f.calls).toHaveLength(2);

    // 두 번째는 캐시 — 묻지 않는다. 부정 결과도 키가 있다(= 물어봤다).
    expect((await service.readMany([course, promo])).size).toBe(0);
    expect(f.calls).toHaveLength(2);
    const cached = await service.lookupCached([course, promo]);
    expect(cached.get(compositionKey(course.name, course.description))?.fixed).toEqual(['유산슬', '탕수육']);
    expect(cached.has(compositionKey(promo.name, promo.description))).toBe(true);
    expect(cached.get(compositionKey(promo.name, promo.description))).toBeNull();
  });

  it('응답을 못 읽으면 저장하지 않고 간격을 둔다 — 그동안은 구성 없음으로 본다', async () => {
    const f = makeFakes(() => '죄송합니다');
    const failures = new FailureBackoff();
    const service = new MenuCompositionService(f.prisma, f.aiConfig, { cache: f.cache, failures });
    expect((await service.readMany([course])).size).toBe(0);
    expect(f.store.size).toBe(0);
    // 재시도 간격 안 — 캐시 조회가 null 을 주므로 다시 묻지 않는다.
    expect((await service.lookupCached([course])).get(compositionKey(course.name, course.description))).toBeNull();
    expect((await service.readMany([course])).size).toBe(0);
    expect(f.calls).toHaveLength(1);
  });

  it('chat provider 가 없으면 묻지 않는다', async () => {
    const f = makeFakes(() => '{}');
    const service = new MenuCompositionService(
      f.prisma,
      { getResolved: async () => null } as unknown as AiConfigService,
      { cache: f.cache },
    );
    expect((await service.readMany([course])).size).toBe(0);
    expect(f.calls).toHaveLength(0);
  });
});
