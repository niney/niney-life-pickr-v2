// 외부 리뷰 출처가 내려주는 방문일은 ISO, `YY.M.D.요일`, `M.D.요일`처럼
// 형식이 섞여 있다. 특히 Naver는 올해 리뷰에서 연도를 생략하므로 수집 시각을
// 기준으로 연도를 복원해야 업데이트 배치끼리도 실제 방문일 최신순을 유지할 수 있다.

export type ReviewFetchedAt = string | number | Date | null | undefined;

export interface ReviewRecencyLike {
  visitedAt?: string | null;
  fetchedAt?: ReviewFetchedAt;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

const validDateKey = (year: number, month: number, day: number): number | null => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const key = Date.UTC(year, month - 1, day);
  const parsed = new Date(key);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return key;
};

const fetchedAtMs = (value: ReviewFetchedAt): number | null => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const numberParts = (match: RegExpMatchArray): [number, number, number] => [
  Number(match[1]),
  Number(match[2]),
  Number(match[3]),
];

/**
 * 리뷰 방문일을 UTC 자정 timestamp로 정규화한다.
 *
 * 지원 형식:
 * - `2026-08-15`, `2026.8.15.토`, `2026년 8월 15일`
 * - `26.8.15.토`
 * - `8.15.토` (수집 시각의 KST 연도 추론, 연말 역전 시 전년 보정)
 */
export const parseReviewVisitedAt = (
  visitedAt: string | null | undefined,
  fetchedAt?: ReviewFetchedAt,
): number | null => {
  const value = visitedAt?.trim();
  if (!value) return null;

  const full = value.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})(?:\D|$)/);
  if (full) {
    const [year, month, day] = numberParts(full);
    return validDateKey(year, month, day);
  }

  const korean = value.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) {
    const [year, month, day] = numberParts(korean);
    return validDateKey(year, month, day);
  }

  const shortYear = value.match(/^(\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})(?:\D|$)/);
  if (shortYear) {
    const [year, month, day] = numberParts(shortYear);
    return validDateKey(2_000 + year, month, day);
  }

  const monthDay = value.match(/^(\d{1,2})\s*\.\s*(\d{1,2})(?:\D|$)/);
  const referenceMs = fetchedAtMs(fetchedAt);
  if (!monthDay || referenceMs === null) return null;

  // Naver 방문일은 한국 날짜다. reference를 KST로 옮긴 뒤 UTC getter를 쓰면
  // 런타임의 로컬 timezone과 무관하게 연도/월/일을 얻을 수 있다.
  const referenceKst = new Date(referenceMs + KST_OFFSET_MS);
  const referenceYear = referenceKst.getUTCFullYear();
  const referenceDateKey = Date.UTC(
    referenceYear,
    referenceKst.getUTCMonth(),
    referenceKst.getUTCDate(),
  );
  const month = Number(monthDay[1]);
  const day = Number(monthDay[2]);
  let inferred = validDateKey(referenceYear, month, day);
  if (inferred === null) return null;

  // 1월 크롤에서 `12.31.수`가 미래로 해석되는 연말 경계를 보정한다.
  if (inferred > referenceDateKey) inferred = validDateKey(referenceYear - 1, month, day);
  return inferred;
};

/** 실제 방문일 최신순. 방문일을 해석하지 못하면 최근 수집 시각을 폴백으로 쓴다. */
export const compareReviewRecencyDesc = <T extends ReviewRecencyLike>(a: T, b: T): number => {
  const visitedA = parseReviewVisitedAt(a.visitedAt, a.fetchedAt);
  const visitedB = parseReviewVisitedAt(b.visitedAt, b.fetchedAt);
  if (visitedA !== null || visitedB !== null) {
    if (visitedA === null) return 1;
    if (visitedB === null) return -1;
    if (visitedA !== visitedB) return visitedB - visitedA;
  }

  const fetchedA = fetchedAtMs(a.fetchedAt);
  const fetchedB = fetchedAtMs(b.fetchedAt);
  if (fetchedA === null || fetchedB === null) {
    if (fetchedA === null && fetchedB !== null) return 1;
    if (fetchedA !== null && fetchedB === null) return -1;
    return 0;
  }
  return fetchedB - fetchedA;
};
