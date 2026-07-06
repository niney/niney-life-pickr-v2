// 노선별 역 순서 — openapi SearchSTNBySubwayLineInfo 의 FR_CODE 로 본선/지선을
// 나누고 seq 를 매기는 순수 로직(단위 테스트 대상). I/O(업스트림·DB)는
// scripts/load-subway-line-orders.ts 가 담당한다.
//
// 판정 근거(2026-07-06 실측): FR_CODE 가 statnId 보다 우수하다 —
//   - 지선이 명시적: 2호선 성수 '211-1'~'211-4'·신정 '234-1'~'234-4', 5호선 마천
//     'P549'~'P555', 1호선 경인 'P…'·연천 '100-1'~'100-3'.
//   - statnId 의 순서 이상(9호선 올림픽공원)이 FR_CODE 에선 '936' 으로 정상.
// FR_CODE 는 '접두(선택) + 숫자 + 접미(-N, 선택)' 꼴('201','211-1','P549','K312','D4').

export interface ParsedFr {
  prefix: string; // 'P','K','D','X','S' 또는 '' (본선 숫자)
  num: number;
  sub: number | null; // '-N' 접미 (지선), 없으면 null
}

export const parseFrCode = (fr: string): ParsedFr => {
  const m = /^([A-Za-z]*)(\d+)(?:-(\d+))?$/.exec((fr ?? '').trim());
  if (!m) return { prefix: '', num: Number.POSITIVE_INFINITY, sub: null };
  return { prefix: m[1] ?? '', num: Number(m[2]), sub: m[3] ? Number(m[3]) : null };
};

// 지선 판별 규칙 — 지정한 조건(prefix/subBase/num범위)을 모두 만족하면 그 section.
// 규칙은 위에서부터 먼저 매칭. 매칭 안 되면 'main'(본선). key/name 은 계약의
// branchKey/branchName.
interface BranchRule {
  key: string;
  name: string;
  prefix?: string;
  subBase?: number; // '-N' 접미의 base num (예: 211-* → 211)
  numMin?: number;
  numMax?: number;
}

// 노선별 지선 정의. 없는 노선은 전부 본선(단일 prefix 선형).
const BRANCH_DEFS: Record<string, BranchRule[]> = {
  // 2호선 — 성수지선(211-N)·신정지선(234-N), 본선은 순환(201~243).
  '1002': [
    { key: 'seongsu', name: '성수지선', subBase: 211 },
    { key: 'sinjeong', name: '신정지선', subBase: 234 },
  ],
  // 5호선 — 마천지선(P접두), 본선은 방화~하남검단산(510~558).
  '1005': [{ key: 'macheon', name: '마천지선', prefix: 'P' }],
  // 1호선 — 다중 분기(근사). 연천(100-N)·광명(144-N)·서동탄(157-N)은 접미 base 로,
  // 경인선은 P접두로 분리. 광명/서동탄은 1역이라 적재 시 <2 로 drop+리포트된다.
  '1001': [
    { key: 'yeoncheon', name: '연천 방면', subBase: 100 },
    { key: 'gwangmyeong', name: '광명 셔틀', subBase: 144 },
    { key: 'seodongtan', name: '서동탄 방면', subBase: 157 },
    { key: 'gyeongin', name: '경인선', prefix: 'P' },
  ],
  // 경의중앙선 — 통행 순서가 FR_CODE 에 없어 근사 분리(리포트 대상): 중앙선(K1xx)
  // =본선, 경의선(K3xx)·서울역지선(P + K826)은 별도 section. FE 는 구간별 폴리라인.
  '1063': [
    { key: 'seoulyeok', name: '서울역 지선', prefix: 'P' },
    { key: 'gyeongui', name: '경의선(문산 방면)', prefix: 'K', numMin: 300, numMax: 399 },
    { key: 'seoulyeok', name: '서울역 지선', prefix: 'K', numMin: 800, numMax: 899 },
  ],
};

// 순환 구간 — 서버는 첫 역을 끝에 복제하지 않고 FE 가 isLoop 로 닫는다.
// 키는 `${lineId}:${branchKey}`. 2호선 본선만.
export const LOOP_SECTIONS = new Set<string>(['1002:main']);
export const isLoopSection = (lineId: string, branchKey: string): boolean =>
  LOOP_SECTIONS.has(`${lineId}:${branchKey}`);

const matchesRule = (p: ParsedFr, rule: BranchRule): boolean => {
  if (rule.prefix !== undefined && p.prefix !== rule.prefix) return false;
  if (rule.subBase !== undefined && !(p.sub !== null && p.num === rule.subBase)) return false;
  if (rule.numMin !== undefined && !(p.num >= rule.numMin && p.num <= (rule.numMax ?? Infinity)))
    return false;
  return rule.prefix !== undefined || rule.subBase !== undefined || rule.numMin !== undefined;
};

const sectionFor = (p: ParsedFr, lineId: string): { key: string; name: string | null } => {
  for (const rule of BRANCH_DEFS[lineId] ?? []) {
    if (matchesRule(p, rule)) return { key: rule.key, name: rule.name };
  }
  return { key: 'main', name: null };
};

export interface FrRow<T> {
  frCode: string;
  ref: T;
}
export interface AssignedStation<T> {
  seq: number;
  ref: T;
}
export interface AssignedSection<T> {
  branchKey: string;
  branchName: string | null;
  stations: AssignedStation<T>[];
}

// FR_CODE 행들 → section 배열. section 내 seq 는 (num, sub) 오름차순 1부터 연속.
// section 순서는 main 먼저, 그 뒤 첫 등장 순. <2 역 section 은 그대로 반환하며
// (호출측이 계약 min 2 로 걸러 리포트) — 여기선 판정만 한다.
export const assignSections = <T>(rows: FrRow<T>[], lineId: string): AssignedSection<T>[] => {
  const buckets = new Map<string, { name: string | null; items: { p: ParsedFr; ref: T }[] }>();
  const order: string[] = [];
  for (const row of rows) {
    const p = parseFrCode(row.frCode);
    const sec = sectionFor(p, lineId);
    let b = buckets.get(sec.key);
    if (!b) {
      b = { name: sec.name, items: [] };
      buckets.set(sec.key, b);
      order.push(sec.key);
    }
    b.items.push({ p, ref: row.ref });
  }

  // main 먼저, 나머지는 첫 등장 순.
  order.sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : 0));

  return order.map((key) => {
    const b = buckets.get(key)!;
    const sorted = [...b.items].sort((x, y) =>
      x.p.num !== y.p.num ? x.p.num - y.p.num : (x.p.sub ?? 0) - (y.p.sub ?? 0),
    );
    return {
      branchKey: key,
      branchName: b.name,
      stations: sorted.map((it, i) => ({ seq: i + 1, ref: it.ref })),
    };
  });
};
