import { congestionBandLabel, type CongestionBandLabel } from '@repo/utils';

// 혼잡도 — 임계/슬롯/방향 매칭 로직은 @repo/utils subwayCongestion 단일 정의
// (앱과 문자 단위 중복이던 것을 승격). 여기는 웹 표현(Tailwind 클래스)만 남는
// facade — 소비처(SubwayArrivalPanel/SubwayTimetable)의 import 경로는 유지.
export {
  currentSlotKey,
  timeToSlotKey,
  matchCongestionDir,
  congestionDirForUpdn,
  slotLevel,
} from '@repo/utils';

export interface CongestionBand {
  label: CongestionBandLabel;
  // 색 dot / 텍스트 / 미니 바 — 라이트·다크 대응.
  dotClass: string;
  textClass: string;
  barClass: string;
}

// 밴드 라벨 → 웹 색 클래스. dot 과 bar 는 같은 -500 톤.
const BAND_CLASSES: Record<CongestionBandLabel, Omit<CongestionBand, 'label'>> = {
  여유: {
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
  },
  보통: {
    dotClass: 'bg-yellow-500',
    textClass: 'text-yellow-600 dark:text-yellow-400',
    barClass: 'bg-yellow-500',
  },
  붐빔: {
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-600 dark:text-orange-400',
    barClass: 'bg-orange-500',
  },
  혼잡: {
    dotClass: 'bg-red-500',
    textClass: 'text-red-600 dark:text-red-400',
    barClass: 'bg-red-500',
  },
};

export const congestionBand = (level: number): CongestionBand => {
  const label = congestionBandLabel(level);
  return { label, ...BAND_CLASSES[label] };
};
