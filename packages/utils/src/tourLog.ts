// 여행로그(AI 허브 71780 「국내 여행로그 데이터(제주도 및 도서지역)」) 공통 상수 — 적재기·집계·화면이 같은 값을 쓴다.
// 계획·이용조건은 docs/PLAN-tour-log.md.

// tour-c 파생표의 장소 유형 축약(VIS 코드 → type_short). 공개 화면의 색·필터 축.
export const TOUR_TYPE_SHORTS = [
  '자연',
  '역사',
  '문화',
  '상업',
  '레저',
  '테마',
  '산책',
  '축제',
  '교통',
  '상점',
  '식당',
  '기타',
  '체험',
  '숙소',
] as const;
export type TourTypeShort = (typeof TOUR_TYPE_SHORTS)[number];

// 비공개 방문(집 21 · 친구/친지집 22 · 사무실 23)의 type_short — 이름·주소·좌표가 NULL 인 행. 집계에서 항상 제외.
export const TOUR_PRIVATE_TYPE_SHORTS = ['집', '친지', '사무실'] as const;

// 맛집 매칭 대상 유형 — 식당/카페 외에 시장·상점으로 잘못 기록된 식당이 있어(2차 분석) 상업·상점도 후보.
export const TOUR_RESTAURANT_TYPE_SHORTS = ['식당', '상업', '상점'] as const;

// 소셀 억제 — 집계 셀의 여행자(또는 방문) 수가 이 값 미만이면 공개 응답에서 null. 장소 평점은 평가 3건 미만이면 숨긴다.
export const TOUR_K_MIN = 5;
export const TOUR_RATING_MIN_N = 3;

// 출처 표기(AI 허브 이용정책 — NIA 사업결과·데이터명·aihub.or.kr 필수). 집계를 쓰는 모든 섹션 하단에 그대로.
export const TOUR_DATASET_NAME = '국내 여행로그 데이터(제주도 및 도서지역)';
export const TOUR_SAMPLE_LABEL = '2023년 4~9월 여행자 표본';
export const TOUR_SOURCE_NOTE =
  '이 통계는 과학기술정보통신부·한국지능정보사회진흥원(NIA) 인공지능 학습용 데이터 구축사업 결과물인 ' +
  '「국내 여행로그 데이터(제주도 및 도서지역)」(AI 허브 aihub.or.kr, 2023)을 가공한 2차 저작물입니다. ' +
  '2023년 4~9월 패널 표본을 집계한 값이며 현재 영업 상태나 관광객 전체를 대표하지 않습니다.';
