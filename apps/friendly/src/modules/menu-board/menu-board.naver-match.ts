import type {
  MenuBoardItemType,
  MenuBoardMenuType,
  MenuBoardPriceCheckType,
  MenuItemType,
  NaverMenuBoardImageType,
  NaverPlaceDataType,
  RestaurantPublicMenuBoardType,
} from '@repo/api-contract';
import { MATCH, nameScore, normalizeName, pairTruth, parsePrice, parseTruth } from './menu-board.score.js';

// 네이버 메뉴판 사진에서 읽은 메뉴를 등록 메뉴와 짝짓는다(순수 함수 — 저장 때·자동 읽기 뒤·프리뷰가 같이 쓴다).
// 짝짓기는 메뉴판 읽기 채점기와 같다(이름 유사도, 같으면 가격이 맞는 쪽). 결과의 origin 이 구분값:
//   'menu-board' 등록 메뉴에 없고 사진에만 있는 메뉴 / 'registered' 등록 메뉴와 같은 메뉴(사진은 확인·가격 비교용).

// 한글 이름에 붙은 영문 병기('커플 세트 Couple SET')는 짝지을 때만 뺀다 — 등록 메뉴는 대개 한글만 적는다.
export const menuMatchName = (name: string): string =>
  /[가-힣]/.test(name)
    ? name.replace(/[A-Za-z][A-Za-z'&.\s]*[A-Za-z]/g, ' ').replace(/\s+/g, ' ').trim() || name
    : name;

export const menuBoardPriceCheck = (
  registeredPrice: string | null,
  photoPrice: string | null,
): MenuBoardPriceCheckType => {
  if (registeredPrice?.includes('~')) return 'range'; // 크기별 범위('39,000~49,000원') — 사진 쪽은 크기마다 따로라 한 값과 견줄 수 없다
  const expected = parsePrice(registeredPrice);
  const got = parsePrice(photoPrice);
  if (expected === null || got === null) return 'unknown';
  return expected === got ? 'same' : 'different';
};

// 올린 날짜 최근 순(모르면 뒤) — 같은 메뉴가 옛 가격판에도 있으면 최근 사진 것을 쓴다.
const newestFirst = (images: NaverMenuBoardImageType[]): NaverMenuBoardImageType[] =>
  images
    .map((image, index) => ({ image, index }))
    .sort(
      (a, b) =>
        (b.image.uploadedOn ?? '').localeCompare(a.image.uploadedOn ?? '') || a.index - b.index,
    )
    .map(({ image }) => image);

export const buildMenuBoardMenus = (
  registered: Pick<MenuItemType, 'name' | 'price'>[],
  images: NaverMenuBoardImageType[],
): MenuBoardMenuType[] => {
  const seen = new Set<string>();
  const read: { item: MenuBoardItemType; image: NaverMenuBoardImageType }[] = [];
  for (const image of newestFirst(images)) {
    for (const item of image.read?.items ?? []) {
      const key = normalizeName(item.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      read.push({ item, image });
    }
  }
  if (read.length === 0) return [];

  const truth = parseTruth({
    items: registered.map((m) => [menuMatchName(m.name), m.price] as [string, string | null]),
  });
  const forMatch = read.map(({ item }) => ({ ...item, name: menuMatchName(item.name) }));
  const { pairs } = pairTruth(truth, forMatch);
  const registeredOf = new Map([...pairs].map(([ti, ii]) => [ii, registered[ti]!]));

  return read.map(({ item, image }, ii) => {
    // 짝을 못 찾았어도 이미 짝지은 등록 메뉴와 거의 같은 이름(크기·옵션 변형)이면 그 등록 메뉴로 본다 — 가격은
    // 1:1 로 짝지은 것만 견준다(변형은 가격이 다른 게 당연하다).
    const paired = registeredOf.get(ii);
    const reg =
      paired ??
      registered.find(
        (m) =>
          [...registeredOf.values()].includes(m) &&
          nameScore(menuMatchName(m.name), forMatch[ii]!.name) >= MATCH,
      ) ??
      null;
    return {
      name: item.name,
      price: item.price,
      description: item.description,
      origin: reg ? 'registered' : 'menu-board',
      registeredName: reg?.name ?? null,
      registeredPrice: reg?.price ?? null,
      priceCheck: paired ? menuBoardPriceCheck(paired.price, item.price) : null,
      imageUrl: image.url,
      uploadedOn: image.uploadedOn,
    };
  });
};

// 새로 받은 사진 목록에 직전 스냅샷의 읽기 결과를 주소로 이어 붙인다 — 같은 사진은 다시 읽지 않는다.
export const carryMenuBoardReads = (
  next: NaverMenuBoardImageType[],
  previous: NaverMenuBoardImageType[] | undefined,
): NaverMenuBoardImageType[] => {
  const readOf = new Map((previous ?? []).filter((p) => p.read).map((p) => [p.url, p.read!]));
  return next.map((image) => {
    const read = image.read ?? readOf.get(image.url);
    return read ? { ...image, read } : image;
  });
};

// 공개 상세용 — 메뉴판 사진과 '등록 메뉴에 없는 메뉴'만 내보낸다(사진별 읽기 원문·짝 정보는 어드민 전용).
// 사진 가격이 등록 가격과 다른 메뉴는 사진이 등록 메뉴 업데이트보다 최신일 때만(날짜를 모르면 내보내지 않는다).
// 가격은 숫자로 읽히면 숫자 문자열('17,9' → '17900'), 아니면 사진 표기 그대로.
const publicPrice = (price: string | null): string | null => {
  const won = parsePrice(price);
  return won !== null ? String(won) : price;
};

export const toPublicMenuBoard = (
  snapshot: Pick<NaverPlaceDataType, 'menuBoardImages' | 'menuBoardMenus' | 'menuUpdatedOn'>,
): RestaurantPublicMenuBoardType | undefined => {
  const images = snapshot.menuBoardImages ?? [];
  if (images.length === 0) return undefined;
  const menus = snapshot.menuBoardMenus ?? [];
  const updatedOn = snapshot.menuUpdatedOn ?? null;
  return {
    images: images.map(({ url, uploadedOn }) => ({ url, uploadedOn })),
    addedMenus: menus
      .filter((m) => m.origin === 'menu-board')
      .map((m) => ({ name: m.name, price: publicPrice(m.price), description: m.description, uploadedOn: m.uploadedOn })),
    newerPrices: menus.flatMap((m) => {
      const price = publicPrice(m.price);
      return m.priceCheck === 'different' && m.registeredName && price && m.uploadedOn && updatedOn && m.uploadedOn > updatedOn
        ? [{ name: m.registeredName, price, uploadedOn: m.uploadedOn }]
        : [];
    }),
  };
};
