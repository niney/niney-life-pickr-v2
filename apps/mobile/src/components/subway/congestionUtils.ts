import { congestionBandLabel, type CongestionBandLabel } from '@repo/utils';

// 혼잡도 — 임계/슬롯/방향 매칭 로직은 @repo/utils subwayCongestion 단일 정의
// (웹과 문자 단위 중복이던 것을 승격). 여기는 RN 표현(hex 색 토큰)만 남는
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
  // dot/미니 바 색(라이트·다크 공용 -500 톤).
  dot: string;
  // 텍스트 색 — 라이트(-600)/다크(-400).
  textLight: string;
  textDark: string;
}

// 밴드 라벨 → RN hex 토큰(웹 Tailwind 팔레트와 동일 계열).
const BAND_COLORS: Record<CongestionBandLabel, Omit<CongestionBand, 'label'>> = {
  여유: { dot: '#10b981', textLight: '#059669', textDark: '#34d399' },
  보통: { dot: '#eab308', textLight: '#ca8a04', textDark: '#facc15' },
  붐빔: { dot: '#f97316', textLight: '#ea580c', textDark: '#fb923c' },
  혼잡: { dot: '#ef4444', textLight: '#dc2626', textDark: '#f87171' },
};

export const congestionBand = (level: number): CongestionBand => {
  const label = congestionBandLabel(level);
  return { label, ...BAND_COLORS[label] };
};
