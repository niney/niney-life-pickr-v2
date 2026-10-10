import { describe, expect, it, vi } from 'vitest';
import type { MenuBoardItemType, NaverMenuBoardImageType } from '@repo/api-contract';
import { NaverMenuBoardReader } from './menu-board.naver.js';
import {
  buildMenuBoardMenus,
  carryMenuBoardReads,
  menuBoardPriceCheck,
  toPublicMenuBoard,
} from './menu-board.naver-match.js';
import { MenuBoardError } from './menu-board.service.js';

const item = (name: string, price: string | null = null): MenuBoardItemType => ({ name, price, description: null });
const image = (url: string, uploadedOn: string | null, items?: MenuBoardItemType[]): NaverMenuBoardImageType => ({
  url,
  uploadedOn,
  ...(items ? { read: { items, model: 'kimi-k3', readAt: '2026-10-10T00:00:00.000Z' } } : {}),
});

describe('buildMenuBoardMenus — 구분값 origin', () => {
  it('사진에만 있는 메뉴는 menu-board, 등록 메뉴와 같은 메뉴는 registered + 가격 비교', () => {
    const menus = buildMenuBoardMenus(
      [
        { name: '삼선간짜장', price: '10000' },
        { name: '짬뽕', price: '9000' },
        { name: '화덕족발', price: '39,000~49,000원' },
        { name: '물만두', price: null },
      ],
      [
        image('https://x/a.png', '2025-04-29', [
          item('삼선간짜장', '12,000'),
          item('짬뽕', '9,000'),
          item('화덕 족발', '54,000원'),
          item('물만두 (20P)', '7,000'),
          item('고량주', '9,000'),
        ]),
      ],
    );
    expect(menus.map((m) => [m.name, m.origin, m.registeredName, m.priceCheck])).toEqual([
      ['삼선간짜장', 'registered', '삼선간짜장', 'different'],
      ['짬뽕', 'registered', '짬뽕', 'same'],
      ['화덕 족발', 'registered', '화덕족발', 'range'],
      ['물만두 (20P)', 'registered', '물만두', 'unknown'],
      ['고량주', 'menu-board', null, null],
    ]);
    expect(menus[4]).toMatchObject({ imageUrl: 'https://x/a.png', uploadedOn: '2025-04-29', price: '9,000' });
  });

  it('같은 메뉴가 여러 사진에 있으면 최근 사진 것을 쓰고, 영문 병기는 빼고 짝짓는다', () => {
    const menus = buildMenuBoardMenus(
      [{ name: '커플세트', price: '49900' }],
      [
        image('https://x/old.png', '2025-02-21', [item('커플 세트 Couple SET', '45,9')]),
        image('https://x/new.png', '2026-05-13', [item('커플 세트 Couple SET', '49,9')]),
        image('https://x/none.png', null),
      ],
    );
    expect(menus).toHaveLength(1);
    expect(menus[0]).toMatchObject({ origin: 'registered', priceCheck: 'same', imageUrl: 'https://x/new.png' });
  });

  it('짝지은 등록 메뉴의 크기·옵션 변형은 registered 로 두되 가격은 견주지 않는다', () => {
    const menus = buildMenuBoardMenus(
      [{ name: '쟁반국수', price: '7000' }],
      [image('https://x/a.png', null, [item('쟁반국수', '7,000'), item('쟁반국수 대', '10,000')])],
    );
    expect(menus.map((m) => [m.name, m.origin, m.priceCheck])).toEqual([
      ['쟁반국수', 'registered', 'same'],
      ['쟁반국수 대', 'registered', null],
    ]);
  });

  it('읽은 사진이 없으면 빈 목록', () => {
    expect(buildMenuBoardMenus([{ name: 'a', price: null }], [image('https://x/a.png', null)])).toEqual([]);
  });

  it('가격 비교 — 범위·없음·같음·다름', () => {
    expect(menuBoardPriceCheck('39,000~49,000원', '54,000')).toBe('range');
    expect(menuBoardPriceCheck(null, '5,000')).toBe('unknown');
    expect(menuBoardPriceCheck('25900', '25,9')).toBe('same');
    expect(menuBoardPriceCheck('18900', '17,9')).toBe('different');
  });

  it('새 사진 목록에 같은 주소의 직전 읽기 결과를 이어 붙인다', () => {
    const previous = [image('https://x/a.png', null, [item('a')]), image('https://x/gone.png', null, [item('b')])];
    const next = carryMenuBoardReads([image('https://x/a.png', null), image('https://x/new.png', null)], previous);
    expect(next[0]!.read?.items).toEqual([item('a')]);
    expect(next[1]!.read).toBeUndefined();
  });
});

describe('toPublicMenuBoard — 공개 상세', () => {
  const different = (uploadedOn: string | null) => ({
    name: '짜장면',
    price: '7,000원',
    description: null,
    origin: 'registered' as const,
    registeredName: '북경짜장면',
    registeredPrice: '5000',
    priceCheck: 'different' as const,
    imageUrl: 'https://x/a.png',
    uploadedOn,
  });

  it('사진이 없으면 내보내지 않는다', () => {
    expect(toPublicMenuBoard({})).toBeUndefined();
    expect(toPublicMenuBoard({ menuBoardImages: [] })).toBeUndefined();
  });

  it('읽기 전이면 사진만, 가격 차이는 사진이 등록 메뉴 업데이트보다 최신일 때만', () => {
    expect(toPublicMenuBoard({ menuBoardImages: [image('https://x/a.png', '2025-04-29')] })).toEqual({
      images: [{ url: 'https://x/a.png', uploadedOn: '2025-04-29' }],
      addedMenus: [],
      newerPrices: [],
    });
    const images = [image('https://x/a.png', '2025-04-29')];
    expect(toPublicMenuBoard({ menuBoardImages: images, menuBoardMenus: [different('2025-04-29')], menuUpdatedOn: '2026-07-16' })?.newerPrices).toEqual([]);
    expect(toPublicMenuBoard({ menuBoardImages: images, menuBoardMenus: [different('2025-04-29')], menuUpdatedOn: null })?.newerPrices).toEqual([]);
    expect(toPublicMenuBoard({ menuBoardImages: images, menuBoardMenus: [different('2026-08-01')], menuUpdatedOn: '2026-07-16' })?.newerPrices).toEqual([
      { name: '북경짜장면', price: '7000', uploadedOn: '2026-08-01' },
    ]);
  });
});

describe('NaverMenuBoardReader', () => {
  const setup = (images: NaverMenuBoardImageType[] | undefined, read: ReturnType<typeof vi.fn>) => {
    const saveNaverMenuBoardReads = vi.fn(async (_placeId: string, reads: Map<string, unknown>) => ({
      attached: reads.size,
      menuBoardMenus: [
        {
          name: 'x',
          price: null,
          description: null,
          origin: 'menu-board' as const,
          registeredName: null,
          registeredPrice: null,
          priceCheck: null,
          imageUrl: 'https://x/a.png',
          uploadedOn: null,
        },
      ],
    }));
    const restaurants = {
      findNaverMenuBoardState: vi.fn(async () => (images === undefined ? null : { menus: [], menuBoardImages: images })),
      saveNaverMenuBoardReads,
    };
    const fetchImage = vi.fn(async (url: string) => Buffer.from(url));
    const reader = new NaverMenuBoardReader(restaurants as never, { read } as never, { fetchImage, maxReads: 2 });
    return { reader, saveNaverMenuBoardReads, fetchImage };
  };
  const ok = async () => ({ items: [item('메뉴', '1,000')], model: 'kimi-k3' });

  it('안 읽은 사진만 상한까지 읽어 저장한다', async () => {
    const read = vi.fn(ok);
    const { reader, saveNaverMenuBoardReads, fetchImage } = setup(
      [image('https://x/done.png', null, []), image('https://x/a.png', null), image('https://x/b.png', null), image('https://x/c.png', null)],
      read,
    );
    expect(await reader.pendingCount('p')).toBe(3);
    const summary = await reader.readPending('p');
    expect(fetchImage.mock.calls.map((c) => c[0])).toEqual(['https://x/a.png', 'https://x/b.png']);
    expect([...(saveNaverMenuBoardReads.mock.calls[0]![1] as Map<string, unknown>).keys()]).toEqual([
      'https://x/a.png',
      'https://x/b.png',
    ]);
    expect(summary).toMatchObject({ total: 4, alreadyRead: 1, read: 2, failed: [], added: 1, noProvider: false });
  });

  it('모델·키가 없으면 바로 멈추고, 사진 하나가 실패해도 나머지는 읽는다', async () => {
    const noProvider = vi.fn(async () => {
      throw new MenuBoardError('no_provider', '설정 없음');
    });
    const a = setup([image('https://x/a.png', null), image('https://x/b.png', null)], noProvider);
    expect(await a.reader.readPending('p')).toMatchObject({ read: 0, noProvider: true, failed: [] });
    expect(noProvider).toHaveBeenCalledTimes(1);
    expect(a.saveNaverMenuBoardReads).not.toHaveBeenCalled();

    const flaky = vi.fn().mockRejectedValueOnce(new Error('사진 HTTP 404')).mockImplementation(ok);
    const b = setup([image('https://x/a.png', null), image('https://x/b.png', null)], flaky);
    expect(await b.reader.readPending('p')).toMatchObject({
      read: 1,
      failed: [{ url: 'https://x/a.png', error: '사진 HTTP 404' }],
    });
  });

  it('사진 목록을 모르는 가게는 null', async () => {
    const { reader } = setup(undefined, vi.fn(ok));
    expect(await reader.readPending('p')).toBeNull();
    expect(await reader.pendingCount('p')).toBe(0);
  });
});
