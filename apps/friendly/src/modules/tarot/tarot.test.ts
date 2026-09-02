import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TarotCardId, TarotSpreadId, TarotTopic, type TarotDrawnCardType } from '@repo/api-contract';
import { TAROT_CARDS, TAROT_SPREADS, TAROT_SPREAD_IDS, TAROT_TOPICS, getTarotCard } from '@repo/utils';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { AiConfigService, type LlmProviderEnv } from '../ai/ai.config.service.js';
import type { AdapterCache } from '../ai/adapter-cache.js';
import type { LLMCompleteOptions, LLMCompleteResult, LLMProvider } from '../ai/adapters/llm-provider.js';
import { UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { buildStaticReading } from './tarot-static.js';
import type { TarotPromptCard } from './tarot.prompts.js';
import {
  TarotError,
  TarotService,
  parseTarotOutput,
  readingCacheKey,
  type TarotServiceDeps,
} from './tarot.service.js';

// 타로 — 계약↔utils 동기화, 정적 해석, LLM 출력 파싱은 순수 함수로, 서비스(캐시·한도·수리·저장·
// 오늘의 카드 잠금)는 FakeProvider + 격리 DB 로, 라우트는 provider 비활성 행으로 정적 경로만 친다.

const promptCards = (cards: readonly TarotDrawnCardType[], spreadId: keyof typeof TAROT_SPREADS): TarotPromptCard[] =>
  cards.map((drawn, i) => ({
    drawn,
    card: getTarotCard(drawn.cardId)!,
    positionLabel: TAROT_SPREADS[spreadId].positions[i]!.label,
    positionHint: TAROT_SPREADS[spreadId].positions[i]!.hint,
  }));

const THREE: TarotDrawnCardType[] = [
  { cardId: 'major-17', position: 'situation', reversed: false },
  { cardId: 'wands-08', position: 'advice', reversed: true },
  { cardId: 'cups-10', position: 'outcome', reversed: false },
];
const CHOICE: TarotDrawnCardType[] = [
  { cardId: 'major-19', position: 'optionA', reversed: false },
  { cardId: 'swords-03', position: 'optionB', reversed: true },
  { cardId: 'pentacles-09', position: 'advice', reversed: false },
];

const llmJson = (positions: string[], extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    cards: positions.map((p) => ({ position: p, text: `${p} 자리 해석입니다.` })),
    summary: '종합 해석입니다.',
    advice: '조언입니다.',
    keyword: '희망',
    choice: null,
    ...extra,
  });

describe('계약 ↔ utils 동기화', () => {
  it('스프레드·주제 enum 이 같은 값·순서', () => {
    expect(TarotSpreadId.options).toEqual(TAROT_SPREAD_IDS);
    expect(TarotTopic.options).toEqual(TAROT_TOPICS);
  });

  it('TarotCardId 는 78장을 전부 받고 밖은 거부', () => {
    for (const c of TAROT_CARDS) expect(TarotCardId.safeParse(c.id).success, c.id).toBe(true);
    for (const bad of ['major-22', 'coins-01', 'wands-11', 'wands-00', 'wands-1', 'Major-00']) {
      expect(TarotCardId.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('buildStaticReading', () => {
  it('카드 정적 의미를 자리 라벨과 조립하고 조언 자리 카드로 키워드를 뽑는다', () => {
    const r = buildStaticReading(TAROT_SPREADS['three-sar'], 'work', promptCards(THREE, 'three-sar'), null);
    expect(r.cards).toHaveLength(3);
    expect(r.cards[0]).toMatchObject({ cardId: 'major-17', positionLabel: '상황', nameKo: '별', reversed: false });
    expect(r.cards[0]!.text).toContain('별(정방향)');
    expect(r.cards[1]!.text).toContain('완드 8(역방향)');
    expect(r.keyword).toBe(getTarotCard('wands-08')!.keywordsReversed[0]);
    expect(r.summary).toContain('일과 공부의 흐름');
    expect(r.advice).toContain('조언 자리의 완드 8 역방향');
    expect(r.choice).toBeNull();
  });

  it('선택 타로: 정·역이 갈리면 정방향 쪽, 같으면 either', () => {
    const split = buildStaticReading(TAROT_SPREADS.choice, 'choice', promptCards(CHOICE, 'choice'), { a: '치킨', b: '피자' });
    expect(split.choice).toMatchObject({ recommended: 'A', confidence: 'mid' });
    const same = buildStaticReading(
      TAROT_SPREADS.choice,
      'choice',
      promptCards(CHOICE.map((c) => ({ ...c, reversed: false })), 'choice'),
      { a: '치킨', b: '피자' },
    );
    expect(same.choice).toMatchObject({ recommended: 'either', confidence: 'low' });
  });
});

describe('parseTarotOutput', () => {
  const pos = ['situation', 'advice', 'outcome'];
  it('잡음 섞인 JSON 을 건져 검증한다', () => {
    expect(parseTarotOutput(`물론이죠!\n${llmJson(pos)}\n끝`, pos)?.keyword).toBe('희망');
  });
  it('자리가 빠지면 null', () => {
    expect(parseTarotOutput(llmJson(['situation']), pos)).toBeNull();
  });
  it('JSON 이 아니면 null', () => {
    expect(parseTarotOutput('그냥 텍스트', pos)).toBeNull();
    expect(parseTarotOutput('{"cards":[]}', pos)).toBeNull();
  });
});

describe('readingCacheKey', () => {
  it('질문 공백·대소문자 차이는 같은 키, 카드가 다르면 다른 키', () => {
    const a = readingCacheKey('three-sar', 'work', '이직  할까요?', null, THREE);
    const b = readingCacheKey('three-sar', 'work', ' 이직 할까요? ', null, THREE);
    const c = readingCacheKey('three-sar', 'work', '이직 할까요?', null, [{ ...THREE[0]!, reversed: true }, THREE[1]!, THREE[2]!]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

class FakeProvider implements LLMProvider {
  calls: LLMCompleteOptions[] = [];
  responses: string[] = [];
  fail = false;

  async complete(opts: LLMCompleteOptions): Promise<LLMCompleteResult> {
    this.calls.push(opts);
    if (this.fail) throw new Error('boom');
    return { text: this.responses.shift() ?? '', model: opts.model, promptTokens: 1, completionTokens: 1 };
  }
}

const envBlock = (tarotModel: string, apiKey = 'k'): LlmProviderEnv => ({
  apiKey,
  baseUrl: 'https://ollama.test',
  timeoutMs: 5000,
  maxConcurrent: 2,
  defaultModels: {
    chat: 'text',
    image: 'vision',
    'log-analysis': 'text',
    'meal-photo': 'vision',
    'meal-recommend': 'text',
    tarot: tarotModel,
  },
});

const guest = { userId: null, guestKey: 'guest-key-00000001', ip: '10.0.0.1' };
const member = { userId: 't-user', guestKey: null, ip: '10.0.0.2' };

describe('TarotService (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let provider: FakeProvider;
  let cache: AdapterCache;
  let quota: UsageQuotaService;

  const build = (model = 'gpt-oss:120b', apiKey = 'k', deps: Partial<TarotServiceDeps> = {}) =>
    new TarotService(app.prisma, new AiConfigService(app.prisma, envBlock(model, apiKey)), {
      quota,
      cache,
      ...deps,
    });

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 't-user', role: 'USER' }]);
    quota = new UsageQuotaService(app.prisma, { settingsTtlMs: 0 });
  });

  beforeEach(async () => {
    await app.prisma.tarotReading.deleteMany();
    await app.prisma.usageQuotaCounter.deleteMany();
    await app.prisma.usageQuotaSetting.deleteMany();
    quota.invalidate();
    provider = new FakeProvider();
    cache = { get: () => provider } as unknown as AdapterCache;
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const input = (over: Partial<Parameters<TarotService['createReading']>[0]> = {}) => ({
    spreadId: 'three-sar' as const,
    topic: 'work' as const,
    question: '이직할까요?',
    choices: null,
    cards: THREE,
    ...over,
  });

  it('LLM 경로: 카드 메타는 서버 데이터, 문장은 LLM, 게스트는 저장 없이 잔여 횟수만', async () => {
    provider.responses = [llmJson(['situation', 'advice', 'outcome'])];
    const res = await build().createReading(input(), guest);
    expect(res).toMatchObject({ readingId: null, source: 'llm', model: 'gpt-oss:120b', keyword: '희망', choice: null });
    expect(res.cards[0]).toMatchObject({ nameKo: '별', nameEn: 'The Star', positionLabel: '상황', text: 'situation 자리 해석입니다.' });
    expect(res.cards[1]).toMatchObject({ reversed: true, keywords: getTarotCard('wands-08')!.keywordsReversed });
    expect(res.quota.remainingToday).toBe(4);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.prompt).toContain('이직할까요?');
    expect(provider.calls[0]!.prompt).toContain('별 (The Star), 정방향');
    expect(provider.calls[0]!.think).toBe('low');
    expect(await app.prisma.tarotReading.count()).toBe(0);
  });

  it('같은 조합은 캐시 — LLM 재호출도 한도 소비도 없다', async () => {
    provider.responses = [llmJson(['situation', 'advice', 'outcome'])];
    const svc = build();
    await svc.createReading(input(), guest);
    const again = await svc.createReading(input({ question: ' 이직할까요?  ' }), guest);
    expect(again.source).toBe('llm');
    expect(again.quota.remainingToday).toBe(4);
    expect(provider.calls).toHaveLength(1);
    expect(svc.cacheSize).toBe(1);
  });

  it('JSON 이 깨지면 수리 재시도 1회, 그래도 실패면 정적 해석', async () => {
    provider.responses = ['not json', 'still bad'];
    const res = await build().createReading(input(), guest);
    expect(res.source).toBe('static');
    expect(res.model).toBeNull();
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]!.prompt).toContain('다시 출력하라');
    expect(res.cards[0]!.text).toContain('별');
    expect(res.summary.length).toBeGreaterThan(10);
  });

  it('자리가 빠진 응답은 수리 재시도에서 채택된다', async () => {
    provider.responses = [llmJson(['situation']), llmJson(['situation', 'advice', 'outcome'])];
    const res = await build().createReading(input(), guest);
    expect(res.source).toBe('llm');
    expect(provider.calls).toHaveLength(2);
  });

  it('provider 예외·키 미설정은 정적 해석', async () => {
    provider.fail = true;
    expect((await build().createReading(input(), guest)).source).toBe('static');
    expect((await build('gpt-oss:120b', '').createReading(input(), guest)).source).toBe('static');
    expect(provider.calls).toHaveLength(1);
  });

  it('게스트 한도를 넘으면 정적 해석, remainingToday 0', async () => {
    await quota.updateSetting('tarot-reading', { guestPerDay: 1 });
    provider.responses = [llmJson(['situation', 'advice', 'outcome'])];
    const svc = build();
    const first = await svc.createReading(input(), guest);
    expect(first).toMatchObject({ source: 'llm', quota: { remainingToday: 0 } });
    const second = await svc.createReading(input({ question: '다른 질문' }), guest);
    expect(second).toMatchObject({ source: 'static', quota: { remainingToday: 0 } });
    expect(provider.calls).toHaveLength(1);
  });

  it('회원: 한도 면제 + 자동 저장 + 기록 조회·삭제', async () => {
    await quota.updateSetting('tarot-reading', { guestPerDay: 1, ipPerDay: 1 });
    provider.responses = [llmJson(['situation', 'advice', 'outcome']), llmJson(['situation', 'advice', 'outcome'], { keyword: '두번째' })];
    const svc = build();
    const a = await svc.createReading(input(), member);
    const b = await svc.createReading(input({ question: '두 번째 질문' }), member);
    expect(a.source).toBe('llm');
    expect(b.source).toBe('llm');
    expect(a.readingId).toBeTypeOf('string');
    expect(a.quota.remainingToday).toBeNull();

    const list = await svc.listMine('t-user', { limit: 20 });
    expect(list.items.map((i) => i.keyword)).toEqual(['두번째', '희망']);
    expect(list.items[0]!.cards).toEqual(THREE.map((c) => ({ cardId: c.cardId, reversed: c.reversed })));
    expect(list.nextCursor).toBeNull();

    const paged = await svc.listMine('t-user', { limit: 1 });
    expect(paged.nextCursor).toBe(b.readingId);
    expect((await svc.listMine('t-user', { limit: 1, cursor: paged.nextCursor! })).items[0]!.id).toBe(a.readingId);

    const detail = await svc.getMine('t-user', a.readingId!);
    expect(detail).toMatchObject({ readingId: a.readingId, question: '이직할까요?', source: 'llm', keyword: '희망' });
    expect(detail.cards[0]!.nameKo).toBe('별');

    await svc.deleteMine('t-user', a.readingId!);
    await expect(svc.getMine('t-user', a.readingId!)).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.deleteMine('other-user', b.readingId!)).rejects.toBeInstanceOf(TarotError);
    expect((await svc.listMine('t-user', { limit: 20 })).items).toHaveLength(1);
  });

  it('오늘의 카드: 회원은 하루 1장 고정, 다시 뽑아도 처음 것', async () => {
    provider.responses = [llmJson(['today']), llmJson(['today'])];
    const svc = build();
    const first = await svc.createReading(
      input({ spreadId: 'daily', cards: [{ cardId: 'major-00', position: 'today', reversed: false }] }),
      member,
    );
    const second = await svc.createReading(
      input({ spreadId: 'daily', cards: [{ cardId: 'major-05', position: 'today', reversed: true }] }),
      member,
    );
    expect(second.readingId).toBe(first.readingId);
    expect(second.cards[0]!.cardId).toBe('major-00');
    expect(provider.calls).toHaveLength(1);
  });

  it('선택 타로: 선택지가 프롬프트에 들어가고 LLM 판정이 전달된다', async () => {
    provider.responses = [
      llmJson(['optionA', 'optionB', 'advice'], {
        choice: { recommended: 'B', confidence: 'high', reason: '피자 쪽이 편합니다.' },
      }),
    ];
    const res = await build().createReading(
      input({ spreadId: 'choice', topic: 'choice', question: '', choices: { a: '치킨', b: '피자' }, cards: CHOICE }),
      guest,
    );
    expect(res.choice).toEqual({ recommended: 'B', confidence: 'high', reason: '피자 쪽이 편합니다.' });
    expect(res.choices).toEqual({ a: '치킨', b: '피자' });
    expect(provider.calls[0]!.prompt).toContain('A: 치킨 / B: 피자');
  });

  it('검증 오류는 TarotError 코드로', async () => {
    const svc = build();
    await expect(svc.createReading(input({ spreadId: 'celtic', cards: [] }), guest)).rejects.toMatchObject({ code: 'spread_unavailable' });
    await expect(svc.createReading(input({ cards: THREE.slice(0, 2) }), guest)).rejects.toMatchObject({ code: 'invalid_cards' });
    await expect(
      svc.createReading(input({ cards: [THREE[0]!, { ...THREE[1]!, cardId: 'major-17' }, THREE[2]!] }), guest),
    ).rejects.toMatchObject({ code: 'invalid_cards' });
    await expect(svc.createReading(input({ spreadId: 'choice', cards: CHOICE }), guest)).rejects.toMatchObject({
      code: 'choices_required',
    });
    expect(provider.calls).toHaveLength(0);
  });
});

describe('tarot routes (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let token: string;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [{ id: 'r-user', role: 'USER' }]);
    // .env 의 실제 키로 클라우드를 부르지 않게 tarot 용도 row 를 비활성 — 정적 경로만 친다.
    await app.prisma.llmProviderConfig.create({
      data: { provider: 'ollama-cloud', purpose: 'tarot', apiKey: 'x', enabled: false },
    });
    token = app.jwt.sign({ userId: 'r-user', email: 'r@x.com', role: 'USER' });
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  const post = (payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/v1/tarot/readings', payload, headers });

  it('게스트 리딩 — 200, 정적 해석, 저장 없음, 잔여 횟수', async () => {
    const res = await post(
      { spreadId: 'three-ppf', topic: 'love', question: '연락이 올까요?', cards: [
        { cardId: 'cups-02', position: 'past', reversed: false },
        { cardId: 'swords-09', position: 'present', reversed: true },
        { cardId: 'major-17', position: 'future', reversed: false },
      ] },
      { 'x-guest-key': 'guest-key-00000001' },
    );
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ readingId: null, source: 'static', spreadId: 'three-ppf', question: '연락이 올까요?' });
    expect(body.cards).toHaveLength(3);
    expect(body.cards[2]).toMatchObject({ cardId: 'major-17', nameKo: '별', positionLabel: '미래' });
    expect(body.quota.remainingToday).toBe(4);
    expect(await app.prisma.tarotReading.count()).toBe(0);
  });

  it('잘못된 요청은 400 — 카드 부족, 미제공 스프레드, 모르는 카드', async () => {
    expect((await post({ spreadId: 'three-ppf', cards: [{ cardId: 'cups-02', position: 'past', reversed: false }] })).statusCode).toBe(400);
    expect((await post({ spreadId: 'celtic', cards: [] })).statusCode).toBe(400);
    expect((await post({ spreadId: 'daily', cards: [{ cardId: 'coins-01', position: 'today', reversed: false }] })).statusCode).toBe(400);
  });

  it('회원 — 저장되고 기록 라우트로 조회·삭제, 무인증은 401', async () => {
    const created = await post(
      { spreadId: 'daily', cards: [{ cardId: 'major-19', position: 'today', reversed: false }] },
      { authorization: `Bearer ${token}` },
    );
    expect(created.statusCode).toBe(200);
    const id = created.json().readingId as string;
    expect(id).toBeTypeOf('string');
    expect(created.json().quota.remainingToday).toBeNull();

    const list = await app.inject({ method: 'GET', url: '/api/v1/tarot/me/readings', headers: { authorization: `Bearer ${token}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({ id, spreadId: 'daily', cards: [{ cardId: 'major-19', reversed: false }] });

    const one = await app.inject({ method: 'GET', url: `/api/v1/tarot/me/readings/${id}`, headers: { authorization: `Bearer ${token}` } });
    expect(one.statusCode).toBe(200);
    expect(one.json().cards[0].nameKo).toBe('태양');

    expect((await app.inject({ method: 'GET', url: '/api/v1/tarot/me/readings' })).statusCode).toBe(401);

    const del = await app.inject({ method: 'DELETE', url: `/api/v1/tarot/me/readings/${id}`, headers: { authorization: `Bearer ${token}` } });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/v1/tarot/me/readings/${id}`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(404);
  });

  it('무효 토큰은 401 이 아니라 게스트로 처리된다', async () => {
    const res = await post(
      { spreadId: 'daily', cards: [{ cardId: 'major-01', position: 'today', reversed: false }] },
      { authorization: 'Bearer nope', 'x-guest-key': 'bad key!' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().readingId).toBeNull();
    expect(res.json().quota.remainingToday).toBeTypeOf('number');
  });
});
