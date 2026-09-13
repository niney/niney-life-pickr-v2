import { Fill, Stroke, Style, Text as OlText } from 'ol/style';
import { LIFE_CRIME_GRADE_COLOR, TOUR_DENSITY_GRADE_COLOR, type LifeCrimeGrade, type TourDensityGrade } from '@repo/utils';

// 일상지도 배경(면) 스타일 — 범죄 통계 5등급 색을 시군구 폴리곤에 반투명으로 깐다(아래 지명·도로와
// 위의 점 마커가 비치게). 선택(카드가 보여 주는 시군구)은 진한 외곽선 + 이름 라벨. 등급별 비선택
// Style 5종은 캐시 — 메트릭을 바꿀 때마다 면 250개가 새 Style 을 만들지 않게. 선택 스타일은 라벨이
// 들어가 면마다 다르지만 한 번에 하나뿐이라 매번 만든다.

const FILL_ALPHA = 0.42;
const FILL_ALPHA_SELECTED = 0.58;

const hexToRgba = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const styleCache = new Map<LifeCrimeGrade, Style>();

export const lifeCrimeAreaStyle = (grade: LifeCrimeGrade, selected: boolean, label: string | null): Style => {
  if (!selected) {
    let s = styleCache.get(grade);
    if (!s) {
      s = new Style({
        fill: new Fill({ color: hexToRgba(LIFE_CRIME_GRADE_COLOR[grade], FILL_ALPHA) }),
        stroke: new Stroke({ color: 'rgba(30, 41, 59, 0.45)', width: 0.8 }),
      });
      styleCache.set(grade, s);
    }
    return s;
  }
  return new Style({
    fill: new Fill({ color: hexToRgba(LIFE_CRIME_GRADE_COLOR[grade], FILL_ALPHA_SELECTED) }),
    stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.9)', width: 2.2 }),
    zIndex: 1,
    text: label
      ? new OlText({
          text: label,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
          overflow: true,
        })
      : undefined,
  });
};

// ── 여행자 밀도 격자(AI 허브 71780) — 청록 램프, 칸 테두리는 얇게. 선택 칸은 진한 외곽선 + 방문 수 라벨. ──
const TOUR_FILL_ALPHA = 0.45;
const TOUR_FILL_ALPHA_SELECTED = 0.65;
const tourStyleCache = new Map<TourDensityGrade, Style>();

export const tourDensityAreaStyle = (grade: TourDensityGrade, selected: boolean, label: string | null): Style => {
  if (!selected) {
    let s = tourStyleCache.get(grade);
    if (!s) {
      s = new Style({
        fill: new Fill({ color: hexToRgba(TOUR_DENSITY_GRADE_COLOR[grade], TOUR_FILL_ALPHA) }),
        stroke: new Stroke({ color: 'rgba(19, 78, 74, 0.35)', width: 0.6 }),
      });
      tourStyleCache.set(grade, s);
    }
    return s;
  }
  return new Style({
    fill: new Fill({ color: hexToRgba(TOUR_DENSITY_GRADE_COLOR[grade], TOUR_FILL_ALPHA_SELECTED) }),
    stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.9)', width: 2.2 }),
    zIndex: 1,
    text: label
      ? new OlText({
          text: label,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
          overflow: true,
        })
      : undefined,
  });
};
