// 호선 매핑 보정 — 도착 API 관측(subwayList/statnList)으로 마스터 ROUTE 일률
// 매핑의 오라벨을 바로잡는 순수 로직. I/O(API·DB·파일)는 스크립트
// (scripts/verify-subway-lines.ts)가 담당하고, 여기 함수들은 관측 데이터만
// 받아 결정한다 — 단위 테스트 대상.
//
// 배경: 마스터 ROUTE 는 운행계통이 아닌 철도노선 기준이라 경원선 구간의 경의중앙
// 전용역(옥수·응봉·왕십리 등)이 1001(1호선)로 오라벨된다. 도착 API 는 행마다
// subwayList('1063,1005,1075,1002')·statnList(각 호선 statnId)를 주는데, 이 쌍이
// 그 역의 진짜 운행계통 집합이다 — 이것을 정답으로 삼아 대조한다.

// 관측 1행에서 쓰는 필드 — RawSubwayArrival 의 부분집합(구조적 호환).
export interface ObservedRow {
  subwayId: string | null; // 이 행의 호선
  statnId: string | null; // 이 행의 호선에서의 statnId (가장 신뢰)
  subwayList: string | null; // 역의 전 운행계통 '1002,1005,1063,1075'
  statnList: string | null; // 위와 정렬된 statnId 목록
  statnNm: string | null; // 관측 역명
}

// 한 물리 역(운행계통 집합) 후보 — subwayList 가 같은 행들이 한 클러스터.
export interface ObservedCluster {
  lineIds: string[]; // 오름차순 유니크
  lineToStatnId: Map<string, string>; // 호선 → statnId
}

const splitCsv = (v: string | null): string[] =>
  v ? v.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : [];

// 도착 응답 행들 → 운행계통 클러스터. subwayList 로 클러스터를 나눈다(동명이역은
// 서로 다른 subwayList 로 와서 자동 분리). lineToStatnId 는 statnList 정렬 매핑 +
// 행 자신의 subwayId/statnId(정렬이 어긋나도 정확) 를 합쳐 채운다.
export const parseArrivalClusters = (rows: ObservedRow[]): ObservedCluster[] => {
  const byKey = new Map<string, { lineIds: Set<string>; lineToStatnId: Map<string, string> }>();
  for (const row of rows) {
    const listLines = splitCsv(row.subwayList);
    const clusterLines = listLines.length > 0 ? listLines : row.subwayId ? [row.subwayId] : [];
    if (clusterLines.length === 0) continue;
    const key = [...clusterLines].sort().join(',');
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { lineIds: new Set(clusterLines), lineToStatnId: new Map() };
      byKey.set(key, bucket);
    }
    // statnList 정렬 매핑으로 빈 곳을 먼저 채운다.
    const listStatns = splitCsv(row.statnList);
    for (let i = 0; i < listLines.length; i++) {
      const l = listLines[i]!;
      const s = listStatns[i];
      if (s && !bucket.lineToStatnId.has(l)) bucket.lineToStatnId.set(l, s);
    }
    // 행 자신의 (subwayId → statnId)는 가장 신뢰 — 덮어쓴다.
    if (row.subwayId && row.statnId) bucket.lineToStatnId.set(row.subwayId, row.statnId);
  }
  return [...byKey.values()].map((b) => ({
    lineIds: [...b.lineIds].sort(),
    lineToStatnId: b.lineToStatnId,
  }));
};

export type ObservedResolution =
  | { cluster: ObservedCluster; reason: 'matched' }
  | { cluster: null; reason: 'empty' | 'unmatched' };

// 관측 클러스터 → 이 그룹(=한 물리 역)의 관측 운행계통. 그룹의 기존 lineId 와
// 교집합이 있는 클러스터를 **모두 병합**한다.
//
// 왜 '병합'인가(프로브 실측): 같은 물리 역이라도 운영사에 따라 subwayList 를 다르게
// 준다 — GTX-A(1032)는 자기만, 3·6호선은 서로만 표기해 연신내가 {1032}·{1003,1006}
// 두 클러스터로, 안산선은 4호선이 {1004}, 수인분당이 {1004,1075} 로 쪼개져 온다.
// 한 물리 역은 한 노선을 한 군데서만 세우므로, 그룹 노선과 교집합 있는 클러스터는
// 모두 이 역이다(동명이역은 노선이 겹치지 않아 교집합 0 → 자연 배제). 병합하면
// 오삭제(GTX-A)·누락(안산선 수인분당) 없이 실제 운행계통 합집합을 얻는다.
//
// 교집합 클러스터가 없으면(동명이역만 관측되거나 이 역 노선이 하나도 안 잡힘) —
// unmatched: 자동보정 불가(기존 매핑 유지, 리포트만).
export const resolveObserved = (
  clusters: ObservedCluster[],
  groupLineIds: Set<string>,
): ObservedResolution => {
  if (clusters.length === 0) return { cluster: null, reason: 'empty' };
  const matching = clusters.filter((c) => c.lineIds.some((l) => groupLineIds.has(l)));
  if (matching.length === 0) return { cluster: null, reason: 'unmatched' };
  const lineIds = new Set<string>();
  const lineToStatnId = new Map<string, string>();
  for (const c of matching) {
    for (const l of c.lineIds) lineIds.add(l);
    for (const [l, s] of c.lineToStatnId) if (!lineToStatnId.has(l)) lineToStatnId.set(l, s);
  }
  return { cluster: { lineIds: [...lineIds].sort(), lineToStatnId }, reason: 'matched' };
};

// 그룹의 기존 DB 행(대조 입력).
export interface GroupDbRow {
  id: string;
  lineId: string;
  statnId: string | null;
  realtimeName: string | null;
}

export interface ReconcilePlan {
  // DB 에 있는데 관측에 없음 → 행 삭제.
  extra: { id: string; lineId: string }[];
  // 관측에 있는데 DB 에 없음 → 행 생성 (지원 노선 + statnId 확보만).
  missing: {
    id: string;
    name: string;
    lineId: string;
    lineName: string;
    statnId: string;
    realtimeName: string | null;
    lat: number;
    lng: number;
  }[];
  // 정합 행의 statnId 채움/보정 (6차 실시간 위치 조인 준비).
  statnIdBackfill: { id: string; lineId: string; statnId: string }[];
  // 2단계 재시도로 실시간 조회명이 밝혀진 경우 그룹 전 행에 기록.
  realtimeNameUpdate: { id: string; realtimeName: string }[];
}

// 그룹 대조 — 순수. DB 행 집합과 선택된 관측 클러스터를 비교해 보정 계획을 낸다.
export const reconcileGroup = (p: {
  name: string;
  lat: number;
  lng: number;
  dbRows: GroupDbRow[];
  observed: ObservedCluster;
  // 조회 성공 역명이 name 과 다르면 그 값(realtimeName 오버라이드 후보), 아니면 null.
  realtimeName: string | null;
  lineName: (lineId: string) => string;
  // 1차 지원 노선인지 (SUBWAY_LINES 등재). 관측엔 제외 노선(인천1호선 1069 등)이나
  // 미지 코드(1091)가 섞여 오므로, 신규 생성은 지원 노선으로만 제한한다.
  isKnownLine: (lineId: string) => boolean;
}): ReconcilePlan => {
  const dbByLine = new Map(p.dbRows.map((r) => [r.lineId, r]));
  const observedSet = new Set(p.observed.lineIds);

  const extra = p.dbRows
    .filter((r) => !observedSet.has(r.lineId))
    .map((r) => ({ id: r.id, lineId: r.lineId }));

  const missing = p.observed.lineIds
    // 신규 생성 조건: DB 미보유 + 지원 노선 + statnId 확보(운행계통 정합의 증거).
    // 제외/미지 노선(1069·1091 등)과 statnId 없는 의심 관측(오염)은 만들지 않는다.
    .filter((l) => !dbByLine.has(l) && p.isKnownLine(l) && p.observed.lineToStatnId.get(l))
    .map((l) => ({
      id: `${l}:${p.name}`,
      name: p.name,
      lineId: l,
      lineName: p.lineName(l),
      statnId: p.observed.lineToStatnId.get(l)!,
      realtimeName: p.realtimeName,
      lat: p.lat,
      lng: p.lng,
    }));

  const statnIdBackfill: { id: string; lineId: string; statnId: string }[] = [];
  for (const l of p.observed.lineIds) {
    const row = dbByLine.get(l);
    if (!row) continue; // 신규는 missing 이 담당.
    const obsStatnId = p.observed.lineToStatnId.get(l);
    if (obsStatnId && row.statnId !== obsStatnId) {
      statnIdBackfill.push({ id: row.id, lineId: l, statnId: obsStatnId });
    }
  }

  const realtimeNameUpdate: { id: string; realtimeName: string }[] = [];
  if (p.realtimeName !== null) {
    for (const r of p.dbRows) {
      if (!observedSet.has(r.lineId)) continue; // 삭제될 extra 는 제외.
      if (r.realtimeName !== p.realtimeName) {
        realtimeNameUpdate.push({ id: r.id, realtimeName: p.realtimeName });
      }
    }
  }

  return { extra, missing, statnIdBackfill, realtimeNameUpdate };
};

// 역명 병기형('왕십리(성동구청)') → 괄호 제거형('왕십리'). 재시도 대상 판정.
export const stripParenName = (name: string): string =>
  name.replace(/\([^)]*\)/g, '').trim();
export const isParenName = (name: string): boolean =>
  /\([^)]*\)/.test(name) && stripParenName(name).length > 0 && stripParenName(name) !== name;
