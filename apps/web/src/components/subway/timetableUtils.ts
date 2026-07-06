// 시간표 순수 헬퍼 — 시간표 뷰(SubwayTimetable)·도착 패널 푸터·SubwayPage 공용.

export type SubwayDayType = '1' | '2' | '3';

// 오늘의 dayType — 토=2·일=3·그 외 평일 1. 공휴일 자동 판정은 불가능해(달력 API
// 없음) 요일 기반이 한계 — 실제 공휴일엔 사용자가 토글로 '휴일'을 고른다.
export const dayTypeForToday = (now: Date = new Date()): SubwayDayType => {
  const d = now.getDay();
  return d === 6 ? '2' : d === 0 ? '3' : '1';
};

// 'HH:MM:SS' → 자정 기준 분. 종착행 시각은 자정을 넘겨 '24:xx'/'25:xx' 로 표기될 수
// 있어(익일 운행) 시 값을 24 이상 그대로 해석한다(막차 임박·정렬 기준의 단조성 유지).
export const parseTimeMin = (t: string): number => {
  const [h, m] = t.split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};

// 'HH:MM:SS' → 'HH:MM' 표기. 초만 떼고, 자정 넘김(24+, 실측 '24:46:00')은 지하철
// 관례대로 '24:46' 그대로 둔다(익일 운행 구분 — '00:46' 로 접지 않음). '00:00:00'
// 은 '00:00'.
export const formatHHMM = (t: string): string => {
  const [hRaw, mRaw] = t.split(':');
  const h = Number(hRaw) || 0;
  const m = Number(mRaw) || 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// 막차까지 남은 분 — 막차가 익일(24+)이고 현재가 자정 직후(새벽 04시 전)면 현재
// 시각도 24+ 로 올려 같은 축에서 뺀다. 막차 없음/이미 지남은 음수/null.
export const lastTrainRemainMin = (lastTrain: string | null, now: Date = new Date()): number | null => {
  if (!lastTrain) return null;
  const lastMin = parseTimeMin(lastTrain);
  let nowMin = now.getHours() * 60 + now.getMinutes();
  if (lastMin >= 1440 && nowMin < 240) nowMin += 1440;
  return lastMin - nowMin;
};

// 도착정보 updnLine 텍스트('상행'/'내선'/'하행'/'외선') → 시간표 updn('1'/'2').
// 도착 API 는 노선마다 표기가 달라(2호선은 내선/외선) 원문 매핑이 필요하다.
export const arrivalUpdnToTimetable = (updnText: string): '1' | '2' | null => {
  if (updnText.includes('상행') || updnText.includes('내선')) return '1';
  if (updnText.includes('하행') || updnText.includes('외선')) return '2';
  return null;
};

// 급행 판정 — 실측 확정(2026-07-06 9호선 신논현: 'G' 일반 126건 / 'D' 급행 118건).
// 'D' 가 급행이고, 안전망으로 'G'/null 외의 값도 급행 처리(신규 급행/특급 태그 대비).
// EXPRESS_YN 분포가 더 확정되면 이 한 곳(정상 태그 집합)만 조정한다.
const EXPRESS_NORMAL_TAGS = new Set(['G']);
export const isSubwayExpressTag = (tag: string | null): boolean =>
  tag !== null && !EXPRESS_NORMAL_TAGS.has(tag);

// 시간표 updn('1'/'2') → 방향 라벨. 2호선 내선/외선은 계약에 구분이 없어 일반 라벨.
export const updnLabel = (updn: string): string => (updn === '1' ? '상행' : '하행');
