// 혼잡도(10차) 정규화 순수 로직 — odcloud wide 행을 slots JSON 으로 접고 요일/
// 호선/상하구분을 관찰(2026-07-07 실측)대로 매핑한다. I/O(업스트림·DB·조인)는
// scripts/load-subway-congestion.ts 가 담당 — 단위 테스트 대상.
//
// 실측 표기: 요일구분 평일/토요일/일요일, 호선 '1호선'~'8호선', 역번호 정수(앞자리
// 0 없음 — 150 = 서울역, 우리 stationCd '0150' 과 4자리 zero-pad 조인), 상하구분
// '상선'/'하선' + 2호선 순환 '내선'/'외선'. 슬롯 39개(05:30~23:30 + 익일 00:00/00:30).

// '평일'/'토요일'/'일요일' → 시간표와 같은 dayType 코드 '1'/'2'/'3'.
export const congestionDayType = (v: string | null): string | null => {
  const t = (v ?? '').trim();
  if (t === '평일') return '1';
  if (t === '토요일') return '2';
  if (t === '일요일') return '3';
  return null;
};

// '{N}호선' → lineId '100N' (N 1~8). 그 외(9호선·광역은 데이터에 없음) null.
export const congestionLineId = (hoseon: string | null): string | null => {
  const m = /^(\d)호선$/.exec((hoseon ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 8 ? `100${n}` : null;
};

const strOrNull = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export interface CongestionSlot {
  time: string; // 'HH:MM'
  level: number | null;
}

// wide 슬롯 컬럼('5시30분'…'00시30분') → time 순 [{time,level}]. 자정 이후
// (00시xx)는 05:30~23:30 뒤로 정렬(익일). 값 공백/비수치는 null.
const SLOT_RE = /^(\d{1,2})시(\d{1,2})분$/;
export const parseCongestionSlots = (row: Record<string, unknown>): CongestionSlot[] => {
  const parsed: { sortKey: number; time: string; level: number | null }[] = [];
  for (const [k, v] of Object.entries(row)) {
    const m = SLOT_RE.exec(k);
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2]);
    // 0~4시는 익일(24~28시)로 취급해 23:30 뒤로. 실데이터는 00시만 존재.
    const sortKey = (h < 5 ? h + 24 : h) * 60 + min;
    const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    parsed.push({ sortKey, time, level: numOrNull(v) });
  }
  parsed.sort((a, b) => a.sortKey - b.sortKey);
  return parsed.map(({ time, level }) => ({ time, level }));
};

export interface NormalizedCongestion {
  lineId: string;
  stationName: string;
  stationCd: string; // 역번호 4자리 zero-pad(조인 키) — 예 150→'0150'
  dayType: string;
  updn: string; // 원문 '상선'/'하선'/'내선'/'외선'
  slots: CongestionSlot[];
}

// odcloud 행 → 정규화(적재 대상). 매핑 불가(호선/요일/역명/상하 누락)면 null.
export const normalizeCongestionRow = (
  row: Record<string, unknown>,
): NormalizedCongestion | null => {
  const lineId = congestionLineId(strOrNull(row['호선']));
  const dayType = congestionDayType(strOrNull(row['요일구분']));
  const stationName = strOrNull(row['출발역']);
  const updn = strOrNull(row['상하구분']);
  if (!lineId || !dayType || !stationName || !updn) return null;
  const stationNo = row['역번호'];
  const stationCd = stationNo != null ? String(stationNo).padStart(4, '0') : '';
  return { lineId, stationName, stationCd, dayType, updn, slots: parseCongestionSlots(row) };
};
