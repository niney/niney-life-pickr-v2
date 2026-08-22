// 예보 화면(날씨·대기) 공용 날짜 라벨 — 웹·앱이 같은 문구를 쓴다. KST 기준 "오늘"은 weather.ts 의
// kmaTodayIsoDate(Intl 없이 오프셋 계산 — Hermes 에서도 안전)를 그대로 빌린다.

export { kmaTodayIsoDate as todayKst } from './weather.js';

// 예보 대상일 → '오늘/내일/모레' 라벨(그 외는 M/D). todayYmd 는 KST 기준 YYYY-MM-DD.
export const relativeDayLabel = (ymd: string, todayYmd: string): string => {
  const toDays = (s: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
  };
  const a = toDays(ymd);
  const b = toDays(todayYmd);
  if (a === null || b === null) return ymd;
  const diff = a - b;
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[1])}/${Number(m[2])}` : ymd;
};

// "YYYY-MM-DD" → "8/21 (목)" — 주간예보 열 머리 등.
export const formatYmdWithWeekday = (ymd: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()] ?? '';
  return `${Number(m[2])}/${Number(m[3])} (${wd})`;
};
