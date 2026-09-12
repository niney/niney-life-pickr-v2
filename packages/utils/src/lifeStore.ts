// 상가(상권)정보 — 소상공인시장진흥공단 전국 상가업소(data.go.kr 15083033, 분기 CSV ~250만 행,
// 상권업종 대 10·중 75·소 247 분류)에서 이 서비스가 쓰는 업종만 골라 9종(kind)으로 접는다. 세 곳이
// 같은 표를 쓴다: 일상지도 "생활편의" 레이어(6종 칩), 맛집 ↔ 상가업소 매칭(음식·카페), 집값 단지
// 생활 인프라(반경 500m 개수). 서버(적재 판정)와 웹(칩·범례)이 같은 코드를 쓰도록 한 곳에 둔다.
//
// 코드 근거(2026-06 분기 실측): 편의점 G20405 · 종합 소매 G204(백화점·대형마트·슈퍼마켓, 편의점 제외) ·
// 약국 G21501 · 세탁 S209(세탁소·셀프 빨래방) · 동물병원 M11101 · 미용실 S20701(피부관리·네일 제외) ·
// 카페 I212(비알코올 음료점) · 음식 I2 대분류(한식~주점, 카페 제외) · 학원 P105 입시·교과 + P106 기타 교육.

export const LIFE_STORE_KINDS = [
  'convenience',
  'mart',
  'pharmacy',
  'laundry',
  'vet',
  'beauty',
  'cafe',
  'food',
  'academy',
] as const;
export type LifeStoreKind = (typeof LIFE_STORE_KINDS)[number];
export const LIFE_STORE_KIND_LABEL: Record<LifeStoreKind, string> = {
  convenience: '편의점',
  mart: '마트·슈퍼',
  pharmacy: '약국',
  laundry: '세탁',
  vet: '동물병원',
  beauty: '미용실',
  cafe: '카페',
  food: '음식점',
  academy: '학원',
};
export const isLifeStoreKind = (v: unknown): v is LifeStoreKind => (LIFE_STORE_KINDS as readonly unknown[]).includes(v);

// 일상지도 "생활편의" 레이어 칩 6종 — 카페·음식점·학원은 점이 너무 많고(음식점만 70만) 맛집 도메인과
// 겹쳐 지도 레이어에는 안 올린다(적재는 하되 매칭·인프라 집계에만 쓴다).
export const LIFE_STORE_LAYER_KINDS = ['convenience', 'mart', 'pharmacy', 'laundry', 'vet', 'beauty'] as const;
export type LifeStoreLayerKind = (typeof LIFE_STORE_LAYER_KINDS)[number];
export const isLifeStoreLayerKind = (v: unknown): v is LifeStoreLayerKind =>
  (LIFE_STORE_LAYER_KINDS as readonly unknown[]).includes(v);

// 맛집 매칭 후보 업종 — 크롤 맛집(식당·카페·술집)이 상가 데이터에서 속할 수 있는 kind.
export const LIFE_STORE_RESTAURANT_KINDS = ['food', 'cafe'] as const;

// 상권업종 코드(대/중/소) → kind. 관심 밖이면 null(적재 제외). 순서가 중요 — 편의점(G20405)은 종합
// 소매(G204)보다 먼저, 카페(I212)는 음식 대분류(I2)보다 먼저 본다.
export const lifeStoreKindOf = (
  lclsCd: string | null | undefined,
  mclsCd: string | null | undefined,
  sclsCd: string | null | undefined,
): LifeStoreKind | null => {
  const l = (lclsCd ?? '').trim();
  const m = (mclsCd ?? '').trim();
  const s = (sclsCd ?? '').trim();
  if (s === 'G20405') return 'convenience';
  if (m === 'G204') return 'mart';
  if (s === 'G21501') return 'pharmacy';
  if (m === 'S209') return 'laundry';
  if (s === 'M11101') return 'vet';
  if (s === 'S20701') return 'beauty';
  if (m === 'I212') return 'cafe';
  if (l === 'I2') return 'food';
  if (m === 'P105' || m === 'P106') return 'academy';
  return null;
};

// 쉼표 구분 kind 파라미터 → 유효 kind 배열(중복 제거, 모르는 값 무시). 빈 배열 = 전체.
export const parseLifeStoreKinds = (raw: string | null | undefined): LifeStoreKind[] => {
  if (!raw) return [];
  const out: LifeStoreKind[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (isLifeStoreKind(s) && !out.includes(s)) out.push(s);
  }
  return out;
};

// 표시명 — "상호 지점명"(지점명이 상호에 이미 들어 있으면 상호만).
export const lifeStoreDisplayName = (name: string, branch: string | null | undefined): string => {
  const b = (branch ?? '').trim();
  if (b.length === 0 || name.includes(b)) return name;
  return `${name} ${b}`;
};

// 상호 정규화 — 매칭·검색용. 공백·괄호·특수문자 제거, 소문자, 흔한 접미("점"·"본점"·"1호점")와 법인 표기 제거.
export const normalizeLifeStoreName = (raw: string): string =>
  raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(주\)|\(유\)|주식회사|유한회사|㈜/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/(본점|직영점|\d+호점|[가-힣]+점)$/u, '')
    .replace(/[^0-9a-z가-힣]/g, '');

// 집값 단지 "생활 인프라" 7항목 — 단지 좌표 반경 500m 안 개수. 병원(hospital)만 LifeStore 가 아니라 심평원
// 병의원(LifeHospital)에서 센다(상가 데이터엔 의료기관이 없다). 표시 순서 고정.
export const LIFE_STORE_INFRA_ITEMS = ['convenience', 'mart', 'cafe', 'food', 'academy', 'hospital', 'pharmacy'] as const;
export type LifeStoreInfraItem = (typeof LIFE_STORE_INFRA_ITEMS)[number];
export const LIFE_STORE_INFRA_LABEL: Record<LifeStoreInfraItem, string> = {
  convenience: LIFE_STORE_KIND_LABEL.convenience,
  mart: LIFE_STORE_KIND_LABEL.mart,
  cafe: LIFE_STORE_KIND_LABEL.cafe,
  food: LIFE_STORE_KIND_LABEL.food,
  academy: LIFE_STORE_KIND_LABEL.academy,
  hospital: '병의원',
  pharmacy: LIFE_STORE_KIND_LABEL.pharmacy,
};
export const LIFE_STORE_INFRA_RADIUS_M = 500;
