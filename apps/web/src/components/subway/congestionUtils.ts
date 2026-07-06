import type { SubwayCongestionDirectionType } from '@repo/api-contract';
import { arrivalUpdnToTimetable } from './timetableUtils';

// 혼잡도 순수 헬퍼 — 도착 패널 게이지·시간표 뷰 dot 공용. 값은 서울교통공사 정적
// 통계의 '정원 대비 %'(좌석 만석 = 34%)이며 실시간이 아니다(FE 는 '통계' 라벨 필수).

export interface CongestionBand {
  label: string;
  // 색 dot / 텍스트 / 미니 바 — 라이트·다크 대응.
  dotClass: string;
  textClass: string;
  barClass: string;
}

// 임계 상수 1곳 — 정원 대비 %(좌석 만석 34%). 잠정: <40 여유 / <80 보통 / <120 붐빔 /
// ≥120 혼잡. 실측 분포(8.0~90.7 관측)에 맞춰 이 표만 조정하면 전 화면에 반영된다.
export const CONGESTION_LEVELS: readonly { max: number; band: CongestionBand }[] = [
  {
    max: 40,
    band: {
      label: '여유',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      barClass: 'bg-emerald-500',
    },
  },
  {
    max: 80,
    band: {
      label: '보통',
      dotClass: 'bg-yellow-500',
      textClass: 'text-yellow-600 dark:text-yellow-400',
      barClass: 'bg-yellow-500',
    },
  },
  {
    max: 120,
    band: {
      label: '붐빔',
      dotClass: 'bg-orange-500',
      textClass: 'text-orange-600 dark:text-orange-400',
      barClass: 'bg-orange-500',
    },
  },
  {
    max: Infinity,
    band: {
      label: '혼잡',
      dotClass: 'bg-red-500',
      textClass: 'text-red-600 dark:text-red-400',
      barClass: 'bg-red-500',
    },
  },
] as const;

export const congestionBand = (level: number): CongestionBand =>
  (CONGESTION_LEVELS.find((l) => level < l.max) ?? CONGESTION_LEVELS[CONGESTION_LEVELS.length - 1]!)
    .band;

// 현재 시각 → 30분 슬롯 키('HH:MM', :00/:30). 자정 이후(00:00/00:30)도 그대로.
export const currentSlotKey = (now: Date = new Date()): string => {
  const h = now.getHours();
  const m = now.getMinutes() < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};

// 'HH:MM:SS'(24+ 익일 표기 가능) → 30분 슬롯 키. 24+ 는 0시대로 접어 슬롯('00:xx')과
// 맞춘다(막차 '24:46'→'00:30'). 슬롯 밖(데이터 없는 새벽)은 조회에서 자연히 미스.
export const timeToSlotKey = (t: string): string => {
  const [hRaw, mRaw] = t.split(':');
  const h = (Number(hRaw) || 0) % 24;
  const m = (Number(mRaw) || 0) < 30 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
};

// 혼잡도 방향 updn 원문 → '1'(상)/'2'(하). 원문 표기는 BE 적재 관찰로 확정될 예정
// ('상선'/'하선' 예상)이라 토큰 집합을 주입식으로 둔다 — 확정되면 이 집합만 조정.
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

// 도착 updnLine 텍스트('상행'/'내선'/'하행'/'외선') 와 같은 방향의 혼잡 direction 매칭.
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
