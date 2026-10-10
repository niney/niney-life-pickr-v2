// zod 없는 런타임 상수 — 한도·헤더 이름·확인 문구처럼 FE 가 "값"으로 가져다 쓰는 것들.
//
// 스키마 파일(schemas/*.ts)에 두면 그 상수 하나를 import 하는 것만으로 파일 전체(zod 스키마 생성 코드)와
// zod 가 웹 번들에 딸려 온다. 엔트리가 닿는 스토어·API 클라이언트가 그런 상수를 쓰면 zod 가 첫 로드에
// 고정된다(2026-10 번들 실측: 첫 로드 JS 631kB → 515kB). 그래서 값만 여기 두고 스키마 파일이 여기서
// 가져다 쓴다. 반대 방향(이 파일이 스키마 파일을 값으로 import)은 금지 — 타입이 필요하면 `import type` 만.

// ── 즐겨찾기 상한 ────────────────────────────────────────────────────────────
// 사용자·종류당 상한 — localStorage 비대화와 서버 남용을 함께 막는다.
// PUT 단건은 초과 시 400, sync 는 상한까지만 채우고 나머지를 조용히 버린다
// (로그인 직후 병합이 에러로 끊기는 것보다 목록이 진실이 되는 쪽이 낫다).
export const BUS_FAVORITES_MAX = 100;
export const SUBWAY_FAVORITES_MAX = 100;
export const RESTAURANT_FAVORITES_MAX = 100;

// ── 게스트 키 헤더 ───────────────────────────────────────────────────────────
// 게스트 식별은 X-Guest-Key 헤더(기기 영속 UUID, 클라 선언값 — 기기 단위 한도용).
export const TAROT_GUEST_KEY_HEADER = 'x-guest-key';
export const SAJU_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER;
export const SAJU_G_GUEST_KEY_HEADER = 'x-guest-key';
// 공개 질문(리뷰 QA)의 게스트 기기 일일 한도 키 — 타로·사주와 같은 공용 게스트 키 헤더.
// 엔트리가 닿는 review-search API 클라이언트가 값으로 쓰므로 스키마 파일이 아니라 여기 둔다.
export const REVIEW_ASK_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER;

// ── 사주 ─────────────────────────────────────────────────────────────────────
export const SAJU_ASK_QUESTION_MAX_LENGTH = 200;
export const SAJU_G_PROFILES_MAX = 20;

// ── 그룹 투표 ────────────────────────────────────────────────────────────────
export const VOTE_OPTIONS_MIN = 2;
export const VOTE_OPTIONS_MAX = 8;
// 투표자 상한(새 voterKey) 409 메시지의 앞머리 — 마감 409 와 같은 상태 코드라 웹이 이것으로 구분해 서버 문구를 보여 준다.
export const VOTE_VOTERS_FULL_MESSAGE_PREFIX = '참여 인원이 가득 찼어요';

// ── 식단 ─────────────────────────────────────────────────────────────────────
export const MEAL_MAX_PHOTOS_PER_ENTRY = 5;
export const MEAL_MAX_ITEMS_PER_ENTRY = 20;

// 추천 이력 전체 삭제 — 추천과 그 반응 이벤트를 지운다(다음 추천 학습·수락률 통계에서도 빠진다). 식단 기록·
// 일일 추천 한도는 그대로. 화면은 확인창을 거친 뒤 이 문구를 실어 보낸다(실수 호출 방지).
export const MEAL_RECOMMENDATIONS_DELETE_CONFIRMATION = 'DELETE_MY_MEAL_RECOMMENDATIONS' as const;

// 단순 확인 버튼 한 번으로 개인 기록을 전부 지우지 않도록 클라이언트와 서버가 공유하는
// 정확 일치 문구다. 화면은 사용자가 이 문자열을 직접 입력한 뒤에만 DELETE 를 호출한다.
export const MEAL_DATA_DELETE_CONFIRMATION = 'DELETE_ALL_MY_MEAL_DATA' as const;
export const MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION = 'DELETE_OLD_MEAL_PHOTOS' as const;

// ── 대기정보 ─────────────────────────────────────────────────────────────────
// 측정소 시계열 기간(getMsrstnAcctoRltmMesureDnsty) / 예보통보 항목(getMinuDustFrcstDspth).
// 스키마(AirHistoryTerm·AirForecastCode)는 이 튜플로 z.enum 을 만든다.
export const AIR_HISTORY_TERMS = ['DAILY', 'MONTH', '3MONTH'] as const;
export const AIR_FORECAST_CODES = ['PM10', 'PM25', 'O3'] as const;

// ── 메뉴판 읽기(어드민) ──────────────────────────────────────────────────────
// 업로드 한도 — 캐치테이블 메뉴판 사진은 원본이 9MB 까지 있다(서버가 긴 변을 2,000px 로 맞춘 JPEG 로 바꿔 모델에 넘긴다).
export const MENU_BOARD_MAX_UPLOAD_MB = 20;
