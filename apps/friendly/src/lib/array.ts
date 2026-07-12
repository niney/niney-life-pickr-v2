// 배열 헬퍼.

// n 개 단위 청크 분할. n <= 0 은 전체 1청크(무한루프 방지 가드).
export const chunk = <T>(arr: T[], n: number): T[][] => {
  if (n <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
