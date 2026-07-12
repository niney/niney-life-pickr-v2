// 거리(m) → 표기. 1km 미만은 정수 m, 이상은 소수 1자리 km.
export const formatDistanceM = (m: number): string =>
  m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;

// 갱신 시각 → '방금/N분/N시간/N일 전'(분 단위) — 캐시·마스터 갱신처럼 초
// 정밀도가 의미 없는 곳. nowMs 는 tick 주입·테스트용.
export const formatRelativeMin = (iso: string, nowMs = Date.now()): string => {
  const min = Math.floor((nowMs - new Date(iso).getTime()) / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};

// 실시간 폴링 갱신 시각 → '방금/N초/N분/N시간 전'(초 단위) — 30초 폴링처럼
// '방금/N초 전'이 의미를 가지는 곳.
export const formatRelativeSec = (iso: string, nowMs = Date.now()): string => {
  const sec = Math.floor(Math.max(0, nowMs - new Date(iso).getTime()) / 1000);
  if (sec < 10) return '방금 전';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
};

const parseWonNumber = (text: string): number | null => {
  const normalized = text.replace(/[,\s₩원]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const formatWonNumber = (value: number): string => `${value.toLocaleString('ko-KR')}원`;

export const formatWonPrice = (price: string | null | undefined): string | null => {
  const text = price?.trim();
  if (!text) return null;

  const single = parseWonNumber(text);
  if (single !== null) return formatWonNumber(single);

  const rangeParts = text.split(/\s*(?:~|〜|-|–|—)\s*/);
  if (rangeParts.length === 2) {
    const min = parseWonNumber(rangeParts[0]!);
    const max = parseWonNumber(rangeParts[1]!);
    if (min !== null && max !== null) return `${formatWonNumber(min)} ~ ${formatWonNumber(max)}`;
  }

  return text.replace(/(\d[\d,\s]*)원/g, (_, raw: string) => {
    const value = parseWonNumber(raw);
    return value === null ? `${raw}원` : formatWonNumber(value);
  });
};
