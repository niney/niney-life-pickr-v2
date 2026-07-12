import type { SubwayCongestionDirectionType } from '@repo/api-contract';
import { arrivalUpdnToTimetable } from '@repo/utils';

// 혼잡도 순수 헬퍼 — 도착 패널 게이지·시간표 뷰 dot 공용(웹 이식). 값은
// 서울교통공사 정적 통계의 '정원 대비 %'(좌석 만석 = 34%)이며 실시간이 아니다
// ('통계' 라벨 필수). 웹 원본은 Tailwind 클래스를 품고 있어 RN 용으로 색을
// hex 토큰(dot 공용 / text 라이트·다크)으로 치환했다 — 임계/매칭 로직은 동일.

export interface CongestionBand {
  label: string;
  // dot/미니 바 색(라이트·다크 공용 -500 톤).
  dot: string;
  // 텍스트 색 — 라이트(-600)/다크(-400).
  textLight: string;
  textDark: string;
}

// 임계 상수 1곳 — <40 여유 / <80 보통 / <120 붐빔 / ≥120 혼잡(웹과 동일).
export const CONGESTION_LEVELS: readonly { max: number; band: CongestionBand }[] = [
  {
    max: 40,
    band: { label: '여유', dot: '#10b981', textLight: '#059669', textDark: '#34d399' },
  },
  {
    max: 80,
    band: { label: '보통', dot: '#eab308', textLight: '#ca8a04', textDark: '#facc15' },
  },
  {
    max: 120,
    band: { label: '붐빔', dot: '#f97316', textLight: '#ea580c', textDark: '#fb923c' },
  },
  {
    max: Infinity,
    band: { label: '혼잡', dot: '#ef4444', textLight: '#dc2626', textDark: '#f87171' },
  },
] as const;

export const congestionBand = (level: number): CongestionBand =>
  (CONGESTION_LEVELS.find((l) => level < l.max) ??
    CONGESTION_LEVELS[CONGESTION_LEVELS.length - 1]!).band;

// 현재 시각 → 30분 슬롯 키('HH:MM', :00/:30).
export const currentSlotKey = (now: Date = new Date()): string => {
  const h = now.getHours();
  const m = now.getMinutes() < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};

// 'HH:MM:SS'(24+ 익일 표기 가능) → 30분 슬롯 키. 24+ 는 0시대로 접는다.
export const timeToSlotKey = (t: string): string => {
  const [hRaw, mRaw] = t.split(':');
  const h = (Number(hRaw) || 0) % 24;
  const m = (Number(mRaw) || 0) < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};

// 혼잡도 방향 updn 원문 → '1'(상)/'2'(하).
export const CONGESTION_UPDN_UP = new Set(['상선', '상행', '내선', '1']);
export const CONGESTION_UPDN_DOWN = new Set(['하선', '하행', '외선', '2']);
const congestionUpdnDir = (updn: string): '1' | '2' | null => {
  if (CONGESTION_UPDN_UP.has(updn)) return '1';
  if (CONGESTION_UPDN_DOWN.has(updn)) return '2';
  if (updn.includes('상') || updn.includes('내')) return '1';
  if (updn.includes('하') || updn.includes('외')) return '2';
  return null;
};

// 도착 updnLine 텍스트와 같은 방향의 혼잡 direction 매칭.
export const matchCongestionDir = (
  arrivalUpdnText: string,
  directions: SubwayCongestionDirectionType[],
): SubwayCongestionDirectionType | null => {
  const dir = arrivalUpdnToTimetable(arrivalUpdnText);
  if (!dir) return null;
  return directions.find((d) => congestionUpdnDir(d.updn) === dir) ?? null;
};

// 시간표 updn('1'/'2') 과 같은 방향의 혼잡 direction 매칭(시간표 뷰용).
export const congestionDirForUpdn = (
  timetableUpdn: string,
  directions: SubwayCongestionDirectionType[],
): SubwayCongestionDirectionType | null =>
  directions.find((d) => congestionUpdnDir(d.updn) === timetableUpdn) ?? null;

// 방향의 특정 슬롯 level(%) — 없거나 null 이면 null.
export const slotLevel = (
  dir: SubwayCongestionDirectionType | null,
  slotKey: string,
): number | null => {
  if (!dir) return null;
  return dir.slots.find((s) => s.time === slotKey)?.level ?? null;
};
