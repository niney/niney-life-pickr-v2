import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuBoardItemType } from '@repo/api-contract';
import { buildMenuBoardReport, runMenuBoardEval } from './menu-board.eval.js';
import { MENU_BOARD_PROMPT, parseMenuBoardItems } from './menu-board.prompt.js';
import {
  headName,
  nameScore,
  normalizeName,
  pairTruth,
  parsePrice,
  parseTruth,
  scoreBoard,
  summarize,
} from './menu-board.score.js';
import {
  MenuBoardError,
  MenuBoardService,
  listMenuBoardSamples,
  prepareMenuBoardImage,
  readMenuBoardEvalReport,
  readMenuBoardSampleImage,
} from './menu-board.service.js';

const item = (name: string, price: string | null = null): MenuBoardItemType => ({ name, price, description: null });

describe('parseMenuBoardItems', () => {
  it('코드 블록·앞뒤 말 속 JSON 에서 items 를 꺼낸다', () => {
    const text = '메뉴입니다.\n```json\n{"items": [{"name": " 김치찌개 ", "price": "9,000"}, {"name": ""}]}\n```';
    expect(parseMenuBoardItems(text)).toEqual([{ name: '김치찌개', price: '9,000', description: null }]);
  });

  it("'</think>' 뒤의 답을 먼저 본다", () => {
    const text = '생각 {"items": [{"name": "틀림"}]} </think> {"items": [{"name": "공기밥", "price": 1000}]}';
    expect(parseMenuBoardItems(text)).toEqual([{ name: '공기밥', price: '1000', description: null }]);
  });

  it('JSON 이 없으면 null', () => {
    expect(parseMenuBoardItems('메뉴판이 아닙니다')).toBeNull();
    expect(parseMenuBoardItems('{"menu": 1}')).toBeNull();
  });

  it('규칙 보강 두 줄이 프롬프트에 들어 있다', () => {
    expect(MENU_BOARD_PROMPT).toContain('"LUNCH COURSE A"');
    expect(MENU_BOARD_PROMPT).toContain('price 를 null 로 따로 넣는다');
    expect(MENU_BOARD_PROMPT.trimEnd().endsWith('- 설명 없이 JSON 만 출력.')).toBe(true);
  });
});

describe('채점', () => {
  it('이름 정규화 — 앞 번호·기호·괄호·수식어', () => {
    expect(normalizeName('1. 김치 찌개!')).toBe('김치찌개');
    expect(headName('치즈새우초밥 (12p) | 추천')).toBe('치즈새우초밥');
    expect(nameScore('김치찌개', '김치찌개(2인기준)')).toBe(1);
    // 한국어 메뉴명은 수식어가 앞에 붙는다.
    expect(nameScore('바질쌈', '향긋한 바질쌈')).toBeGreaterThanOrEqual(0.75);
    expect(nameScore('청하', '성하')).toBeLessThan(0.75);
  });

  it('가격 표기를 원 단위로 — 수량이 앞에 붙으면 쉼표 숫자', () => {
    expect(parsePrice('10,000')).toBe(10000);
    expect(parsePrice('11.0')).toBe(11000);
    expect(parsePrice('1만5천')).toBe(15000);
    expect(parsePrice('12000원')).toBe(12000);
    expect(parsePrice('4P 22,000')).toBe(22000);
    // 천 원 단위 소수 표기 — 쉼표도 소수점으로 쓰는 메뉴판이 많다.
    expect(parsePrice('25,9')).toBe(25900);
    expect(parsePrice('38,0')).toBe(38000);
    expect(parsePrice('시가')).toBeNull();
    expect(parsePrice(null)).toBeNull();
  });

  it('이름이 같으면 가격이 맞는 항목과 짝짓는다', () => {
    const truth = parseTruth({ items: [['왕새우 후라이 (3p)', '29,000']], optional: ['왕새우 후라이 (1p)'] });
    const items = [item('왕새우 후라이 (1p)', '8,000'), item('왕새우 후라이 (3p)', '29,000')];
    const { pairs, wrong } = pairTruth(truth, items);
    expect(pairs.get(0)).toBe(1);
    expect(wrong).toEqual([]); // 사이드는 optional
  });

  it('놓침·지어냄·오독·가격 오류를 나눠 센다', () => {
    const truth = parseTruth({
      shop: '가게',
      items: [
        ['청하', '6,000'],
        { name: '콜라.사이다', price: '2,000', alt: ['콜라', '사이다'] },
        ['비풍당 쉘크랩', '48,000'],
        ['라면사리', '3,000'],
      ],
      optional: ['식사'],
    });
    const score = scoreBoard(truth, [
      item('성하', '6,000'),
      item('콜라', '2,000'),
      item('사이다', '2,000'), // 이미 맞힌 묶음의 낱개 — 틀림 아님
      item('비풍당 웰크랩', '50,000'),
      item('식사'),
      item('식사'), // 같은 이름은 한 번만
    ]);
    expect(score.matched).toBe(2);
    expect(score.missed).toEqual(['청하', '라면사리']);
    expect(score.wrong).toEqual(['성하']);
    expect(score.misread).toEqual([{ expected: '비풍당 쉘크랩', got: '비풍당 웰크랩' }]);
    expect(score.priceMismatch).toEqual([{ name: '비풍당 쉘크랩', expected: '48,000', got: '50,000' }]);
  });

  it('합계 — 실패한 사진은 지표에서 빼고, 메뉴 없는 사진의 항목은 표지 오인으로', () => {
    const menu = parseTruth({ items: [['A', '1,000'], ['B', '2,000']] });
    const cover = parseTruth({ items: [] });
    const totals = summarize(
      [
        { score: scoreBoard(menu, [item('A', '1,000'), item('B', '2,000')]), durationMs: 3000 },
        { score: scoreBoard(cover, [item('가게 소개')]), durationMs: 1000 },
        { score: null, durationMs: 9000 },
      ],
      [menu, cover, menu],
    );
    expect(totals).toMatchObject({ boards: 3, failed: 1, required: 2, matched: 2, wrong: 1, coverFalseItems: 1, medianMs: 2000 });
    expect(totals.precision).toBeCloseTo(2 / 3);
    expect(totals.recall).toBe(1);
    expect(totals.exactName).toBe(1);
  });
});

describe('회귀 평가 리포트', () => {
  const truths = new Map([
    ['s__board-1', parseTruth({ shop: '가게', items: [['김치찌개', '9,000']] })],
    ['s__board-2', parseTruth({ shop: '가게', items: [['공기밥', '1,000']] })],
  ]);

  it('사진마다 차례로 읽고, 실패도 남긴다', async () => {
    const read = vi.fn(async (key: string) => {
      if (key === 's__board-2') throw new Error('시간 초과');
      return { items: [item('김치찌개', '9,000')], durationMs: 5000 };
    });
    const report = await runMenuBoardEval({ truths, keys: ['s__board-1', 's__board-2'], model: 'kimi-k3', read });
    expect(read).toHaveBeenCalledTimes(2);
    expect(report.model).toBe('kimi-k3');
    expect(report.totals).toMatchObject({ boards: 2, failed: 1, matched: 1, f1: 1 });
    expect(report.boards[1]).toMatchObject({ key: 's__board-2', error: '시간 초과', matched: 0 });
  });

  it('정답에 없는 사진이면 알린다', () => {
    expect(() =>
      buildMenuBoardReport([{ key: 'x__board-1', items: [], durationMs: 1, error: null }], truths, 'm'),
    ).toThrow('검수 정답이 없는 사진');
  });
});

describe('MenuBoardService', () => {
  const resolved = { provider: 'ollama-cloud', purpose: 'menu-board', apiKey: 'k', baseUrl: 'u', defaultModel: 'kimi-k3' };
  const makeService = (complete: ReturnType<typeof vi.fn>, model = 'kimi-k3') => {
    const aiConfig = { getResolved: vi.fn(async () => (model ? { ...resolved, defaultModel: model } : null)) };
    const cache = { get: vi.fn(() => ({ complete })) };
    return new MenuBoardService(aiConfig as never, { cache: cache as never });
  };
  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

  it('긴 변을 2,000px 로 맞춘 JPEG — 큰 사진은 줄이고 작은 사진은 키우며, 투명 배경은 흰색으로', async () => {
    const out = await prepareMenuBoardImage(await png(3000, 1000));
    expect([out.width, out.height]).toEqual([2000, 667]);
    const { data } = await sharp(out.jpeg).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(250);
    const small = await prepareMenuBoardImage(await png(420, 596));
    expect([small.width, small.height]).toEqual([1409, 2000]);
  });

  it('사진 + 규칙 프롬프트로 한 번 부르고 생각 모드는 끈다', async () => {
    const complete = vi.fn(async () => ({
      text: '{"items": [{"name": "김치찌개", "price": "9,000", "description": null}]}',
      model: 'kimi-k3',
      promptTokens: 2400,
      completionTokens: 30,
    }));
    const result = await makeService(complete).read(await png(800, 600));
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: MENU_BOARD_PROMPT, model: 'kimi-k3', temperature: 0, think: false }),
    );
    expect((complete.mock.calls[0] as unknown as [{ images: string[] }])[0].images).toHaveLength(1);
    expect(result).toMatchObject({
      model: 'kimi-k3',
      items: [{ name: '김치찌개', price: '9,000', description: null }],
      promptTokens: 2400,
      image: { width: 2000, height: 1500 },
    });
  });

  it('모델이 없으면 no_provider, 사진이 아니면 invalid_image, 형식이 어긋나면 parse_failed', async () => {
    const complete = vi.fn(async () => ({ text: '죄송합니다', model: 'kimi-k3', promptTokens: 1, completionTokens: 1 }));
    await expect(makeService(complete, '').read(await png(10, 10))).rejects.toMatchObject({ code: 'no_provider' });
    await expect(makeService(complete).read(Buffer.from('not an image'))).rejects.toMatchObject({
      code: 'invalid_image',
    });
    await expect(makeService(complete).read(await png(10, 10))).rejects.toBeInstanceOf(MenuBoardError);
    await expect(makeService(complete).read(await png(10, 10))).rejects.toMatchObject({ code: 'parse_failed' });
  });
});

describe('샘플·리포트 파일', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'menu-board-'));
    await mkdir(join(root, 'boards', 'abc_-1'), { recursive: true });
    await mkdir(join(root, 'golden'));
    await writeFile(
      join(root, 'boards', 'abc_-1', 'meta.json'),
      JSON.stringify({ shopRef: 'abc_-1', shopName: '가게', boards: [{ file: 'board-1.png' }, { file: 'board-2.jpg' }] }),
    );
    await writeFile(join(root, 'boards', 'abc_-1', 'board-1.png'), 'png');
    await writeFile(join(root, 'golden', 'abc_-1__board-1.json'), '{"items": []}');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('메타에서 사진 목록과 정답 여부를 만든다', async () => {
    expect(await listMenuBoardSamples(join(root, 'boards'), join(root, 'golden'))).toEqual([
      { key: 'abc_-1__board-1', shopRef: 'abc_-1', shopName: '가게', file: 'board-1.png', hasTruth: true },
      { key: 'abc_-1__board-2', shopRef: 'abc_-1', shopName: '가게', file: 'board-2.jpg', hasTruth: false },
    ]);
    expect(await listMenuBoardSamples(join(root, 'none'))).toEqual([]);
  });

  it('키 모양이 아니거나 파일이 없으면 사진을 주지 않는다', async () => {
    const dir = join(root, 'boards');
    expect(await readMenuBoardSampleImage('abc_-1__board-1', dir)).toMatchObject({ contentType: 'image/png' });
    expect(await readMenuBoardSampleImage('abc_-1__board-2', dir)).toBeNull();
    expect(await readMenuBoardSampleImage('../abc_-1__board-1', dir)).toBeNull();
    expect(await readMenuBoardSampleImage('abc_-1/board-1', dir)).toBeNull();
  });

  it('리포트가 없거나 형식이 어긋나면 null', async () => {
    expect(await readMenuBoardEvalReport(join(root, 'none.json'))).toBeNull();
    await writeFile(join(root, 'bad.json'), '{"model": 1}');
    expect(await readMenuBoardEvalReport(join(root, 'bad.json'))).toBeNull();
    const report = buildMenuBoardReport(
      [{ key: 'abc_-1__board-1', items: [], durationMs: 10, error: null }],
      new Map([['abc_-1__board-1', parseTruth({ items: [] })]]),
      'kimi-k3',
    );
    await writeFile(join(root, 'ok.json'), JSON.stringify(report));
    expect(await readMenuBoardEvalReport(join(root, 'ok.json'))).toEqual(report);
  });
});
