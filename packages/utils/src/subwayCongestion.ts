import { arrivalUpdnToTimetable } from './subwayTimetable.js';

// 지하철 혼잡도 파생 — 웹·앱 components/subway/congestionUtils.ts 가 문자
// 단위로 같던 임계/슬롯/방향 매칭 로직의 단일 정의. 값은 서울교통공사 정적
// 통계의 '정원 대비 %'(좌석 만석 = 34%)이며 실시간이 아니다(FE 는 '통계'
// 라벨 필수). 색·클래스 같은 표현은 플랫폼별(웹 Tailwind / 앱 hex)이라 각
// facade 에 남고, 여기는 판정만 담는다.

// 구조적 타입 — api-contract 의 SubwayCongestionDirection 과 호환되는 부분집합.
// utils 는 의존 0 인 leaf 를 유지해야 하므로 계약 타입을 import 하지 않는다.
export interface CongestionDirectionLike {
  updn: string;
  slots: { time: string; level: number | null }[];
}

// 임계 상수 1곳 — <40 여유 / <80 보통 / <120 붐빔 / ≥120 혼잡. 실측 분포
// (8.0~90.7 관측)에 맞춰 이 표만 조정하면 웹·앱 전 화면에 반영된다.
export const CONGESTION_BANDS = [
  { max: 40, label: '여유' },
  { max: 80, label: '보통' },
  { max: 120, label: '붐빔' },
  { max: Infinity, label: '혼잡' },
] as const;
export type CongestionBandLabel = (typeof CONGESTION_BANDS)[number]['label'];

export const congestionBandLabel = (level: number): CongestionBandLabel =>
  (CONGESTION_BANDS.find((b) => level < b.max) ?? CONGESTION_BANDS[CONGESTION_BANDS.length - 1]!)
    .label;

// 현재 시각 → 30분 슬롯 키('HH:MM', :00/:30). 자정 이후(00:00/00:30)도 그대로.
export const currentSlotKey = (now: Date = new Date()): string => {
  const h = now.getHours();
  const m = now.getMinutes() < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};

// 'HH:MM:SS'(24+ 익일 표기 가능) → 30분 슬롯 키. 24+ 는 0시대로 접어 슬롯
// ('00:xx')과 맞춘다(막차 '24:46'→'00:30'). 슬롯 밖(데이터 없는 새벽)은
// 조회에서 자연히 미스.
export const timeToSlotKey = (t: string): string => {
  const [hRaw, mRaw] = t.split(':');
  const h = (Number(hRaw) || 0) % 24;
  const m = (Number(mRaw) || 0) < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};

// 혼잡도 방향 updn 원문 → '1'(상)/'2'(하). 원문 표기('상선'/'하선' 등)는 BE
// 적재 관찰 기반 토큰 집합 — 새 표기가 관찰되면 이 집합만 조정.
export const CONGESTION_UPDN_UP = new Set(['상선', '상행', '내선', '1']);
export const CONGESTION_UPDN_DOWN = new Set(['하선', '하행', '외선', '2']);
const congestionUpdnDir = (updn: string): '1' | '2' | null => {
  if (CONGESTION_UPDN_UP.has(updn)) return '1';
  if (CONGESTION_UPDN_DOWN.has(updn)) return '2';
  // 접미 등이 붙은 원문 대비 부분 포함 폴백.
  if (updn.includes('상') || updn.includes('내')) return '1';
  if (updn.includes('하') || updn.includes('외')) return '2';
  return null;
};

// 도착 updnLine 텍스트('상행'/'내선'/'하행'/'외선')와 같은 방향의 혼잡
// direction 매칭. 제네릭이라 호출자의 구체 타입(계약 타입)이 보존된다.
export const matchCongestionDir = <T extends CongestionDirectionLike>(
  arrivalUpdnText: string,
  directions: T[],
): T | null => {
  const dir = arrivalUpdnToTimetable(arrivalUpdnText);
  if (!dir) return null;
  return directions.find((d) => congestionUpdnDir(d.updn) === dir) ?? null;
};

// 시간표 updn('1'/'2')과 같은 방향의 혼잡 direction 매칭(시간표 뷰용).
export const congestionDirForUpdn = <T extends CongestionDirectionLike>(
  timetableUpdn: string,
  directions: T[],
): T | null => directions.find((d) => congestionUpdnDir(d.updn) === timetableUpdn) ?? null;

// 방향의 특정 슬롯 level(%) — 없거나 null 이면 null.
export const slotLevel = (
  dir: CongestionDirectionLike | null,
  slotKey: string,
): number | null => {
  if (!dir) return null;
  return dir.slots.find((s) => s.time === slotKey)?.level ?? null;
};
