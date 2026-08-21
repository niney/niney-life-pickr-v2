// 일상지도 표시 문자열 — 컴포넌트 파일과 분리(react-refresh 는 컴포넌트만 export 하는 파일을 원한다).

// 개방시간 한 줄 — 24시간이면 그것만, 아니면 구분 + 상세.
export const openLabel = (openType: string, openDetail: string | null, open24: boolean): string => {
  if (open24) return '24시간';
  if (openType === '미개방') return '미개방';
  if (openDetail) return openType === '미상' ? openDetail : `${openType} ${openDetail}`;
  return openType === '미상' ? '개방시간 미상' : openType;
};
