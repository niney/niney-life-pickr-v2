# Life Pickr API — 외부 사용 가이드

다른 프로젝트에서 이 백엔드(`apps/friendly`, Fastify)를 호출할 때 보는 문서다. **어드민 API(`/api/v1/admin/**`)는 제외**한다.

| 파일 | 내용 | 갱신 |
|---|---|---|
| `README.md` (이 문서) | 공통 규칙: 기준 URL·CORS·인증·에러·한도·도메인 개요·데이터 이용 조건 | 수기 |
| [`endpoints.md`](endpoints.md) | 엔드포인트 색인: 메서드·경로·인증·한도·입력·한 줄 설명 (183개) | 자동 |
| [`openapi.json`](openapi.json) | OpenAPI 3.0: 요청·응답 스키마 전체 | 자동 |

자동 파일은 라우트·스키마를 바꾼 뒤 `pnpm --filter friendly export:openapi` 로 다시 만든다.

- 설명(`summary`·`description`)은 각 라우트 `schema` 에 적는다(`apps/friendly/src/modules/**/*.route.ts`).
- 인증 수준(`x-auth`)·한도(`x-rate-limit`)는 `apps/friendly/src/plugins/swagger.ts` 의 transform 이 라우트 훅·config 에서 자동으로 채운다.
- 요청·응답 스키마의 원천은 zod(`packages/api-contract/src/schemas/`)다.

## 1. 기준 URL

- 운영: `https://ninelife.kr` + 경로. 경로에 이미 `/api/v1` 이 들어 있다(예: `https://ninelife.kr/api/v1/weather/forecast`). 경로는 Cloudflare → nginx → friendly(:3000) 순으로 전달된다.
- 로컬: `http://localhost:3000` (`pnpm dev:api`).
- 버전: 경로 prefix `/api/v1` 하나뿐이다. 호환을 깨는 변경에 대한 정책은 없으니, 갱신한 `openapi.json` 의 git diff 로 변경을 확인한다.

## 2. CORS

- **어드민 외 모든 경로가 `Access-Control-Allow-Origin: *`** 다. 어떤 origin 의 브라우저에서도 호출할 수 있다.
- **credentials 는 허용하지 않는다.** fetch 에 `credentials: 'include'` 를 쓰지 않는다. 인증은 쿠키가 아니라 `Authorization` 헤더다.
- 요청 헤더(`Authorization`·`Content-Type`·`x-guest-key` 등)는 preflight 가 그대로 반사해 허용한다. preflight 캐시는 600초다.
- JS 에서 읽을 수 있게 노출한 응답 헤더: `x-ratelimit-limit`·`x-ratelimit-remaining`·`x-ratelimit-reset`·`retry-after`.
- 어드민(`/api/v1/admin/**`)은 `PUBLIC_ORIGIN`(`https://ninelife.kr`)만 허용한다.
- 운영 설정은 friendly `.env` 의 `CORS_ORIGIN` 이다. `*`(기본)이면 전부 허용, 콤마 구분 목록이면 그 origin 만 허용한다(어드민 외, prod 에서만 적용). 트래픽을 보고 좁힐 때 이 값을 바꾼다. 코드: `apps/friendly/src/plugins/cors.ts`.
- 네이티브 앱이나 서버→서버 호출은 CORS 와 무관하다.

## 3. 인증

endpoints.md 의 **인증** 열은 세 가지다.

| 표시 | 의미 | openapi.json |
|---|---|---|
| `공개` | 토큰 불필요 | `x-auth: public` |
| `선택` | 토큰 없이도 동작. 유효한 토큰이 있으면 회원으로 처리(한도·자동 저장·방장 표시 등). 무효 토큰은 401 이 아니라 게스트로 취급 | `x-auth: optional`, `security: [{}, {bearerAuth: []}]` |
| `로그인` | `Authorization: Bearer <token>` 필수 | `x-auth: user`, `security: [{bearerAuth: []}]` |

흐름:

1. 가입: `POST /api/v1/auth/register` `{ email, password }`(비밀번호 8~100자) → **201** `{ token, user }`. 중복 이메일이면 409.
2. 로그인: `POST /api/v1/auth/login` `{ email, password }` → **200** `{ token, user }`. 자격 증명이 틀리면 401.
3. 이후 요청: `Authorization: Bearer <token>`. 현재 사용자 확인은 `GET /api/v1/auth/me`.

- 토큰은 JWT 이고 기본 **7일** 뒤 만료된다(`JWT_EXPIRES_IN`). 갱신(refresh) API 는 없어서, 만료되면 다시 로그인해야 한다.
- 로그아웃 `POST /api/v1/auth/logout` → 204. 그 사용자의 **모든 기기 토큰**을 무효화한다(`tokenVersion` 증가).
- 401 메시지: 토큰이 없거나 위조·만료되면 `Invalid or missing token`, 로그아웃 등으로 무효화된 뒤면 `Session expired`.
- 웹(ninelife.kr)의 로그인 토큰은 origin 별 `localStorage` 에 있어서 다른 프로젝트와 공유되지 않는다. 다른 프로젝트는 같은 계정으로 따로 로그인한다.
- 로그인 필요 API 는 전부 **본인 데이터만** 다룬다. 남의 리소스에 접근하면 403(정산·단골·임시저장·투표 마감 등)이나 404 가 난다.

## 4. 요청·응답 규약

- 본문은 JSON(`Content-Type: application/json`)이다. 예외는 사진·영수증 업로드로, multipart 파일 1개를 보낸다(각 라우트 description 참고).
- 쿼리 값은 문자열로 와도 스키마대로 숫자·불리언으로 변환해 검증한다.
- **에러 본문은 공통으로 `{ statusCode, error, message }`** 다. 분기는 `statusCode` 로 한다. `error` 에는 `Bad Request` 같은 문구가 오기도 하고 `UnauthorizedError` 같은 예외 이름이 오기도 한다.

| 상태 | 언제 | message 예 |
|---|---|---|
| 400 | 입력 검증 실패(zod). 라우트 스키마 검증은 message 에 위치/필드가 들어가고, 서비스 내부 검증은 `Validation failed` + `details`(필드별 메시지)가 온다 | `querystring/lat Expected number, received nan` |
| 401 | 토큰 없음·무효 | `Invalid or missing token` |
| 403 | 남의 리소스 | |
| 404 | 없는 리소스·경로 | `Route GET:/api/v1/nope not found` |
| 409 | 중복·상한 초과·마감 후 제출 | |
| 410 | 만료된 공유 링크(정산·투표) | |
| 413 | 백업 복원 크기 초과 | |
| 429 | 레이트리밋 초과, 식단 인식·추천 일일 한도 초과(운세 일일 한도는 429 가 아니라 폴백) | `요청이 너무 많습니다. 60초 후 다시 시도해 주세요.` |
| 502 | 업스트림(공공 API 등) 호출 실패 | |
| 503 | 업스트림 키 미설정·인증 실패·쿼터 소진, 데이터 미적재 | |
| 500 | 서버 오류. 운영에서는 message 가 항상 `Something went wrong` | |

- 공공 API 프록시(날씨·대기·버스·지하철·바다)는 업스트림이 실패해도 **마지막 성공값을 `stale: true` 로** 주는 경우가 많다. 에러보다 먼저 이 플래그를 확인한다.
- 키가 없어 기능이 꺼진 경우(AWS 관측·VWorld 검색 등)는 503 이 아니라 `enabled: false` 와 함께 200 을 준다.

## 5. 한도

### 레이트리밋 (IP당)

- 전역 백스톱은 **IP당 분당 1000** 이다.
- 라우트별 프리셋은 endpoints.md 의 **한도** 열을 본다. 대표값:

| 대상 | 한도 |
|---|---|
| 로그인 | 20/분 |
| 가입 | 40/시간 |
| 실시간 교통·날씨·대기·바다 | 60/분 |
| 일상지도·집값 지도 조회 | 240/분 |
| 리뷰 Q&A | 15/분 |
| 타로·사주 | `설정값`(어드민 설정의 `ipPerMinute`) |

- IP 는 Cloudflare `CF-Connecting-IP` 로 판정하고, 없으면 요청 IP 를 쓴다.
- **브라우저에서 직접 호출하면 사용자 IP 별로 센다. 다른 프로젝트의 서버를 거쳐 호출하면 그 서버 IP 하나로 합산**되니 금방 걸린다.
- 초과하면 429 와 함께 `retry-after`·`x-ratelimit-*` 헤더가 온다.

### 일일 사용량 한도 (LLM 기능)

- 타로·사주(C)·사주(G)의 LLM 해석은 KST 날짜 기준 일일 한도가 있다. 기본값(어드민 설정에서 변경 가능):

| 기능 | 게스트 기기/일 | IP/일 | IP/분 | 전역/일 | 게스트 컷 |
|---|---|---|---|---|---|
| 타로 (`tarot-reading`) | 50 | 500 | 20 | 5000 | 전역의 90% |
| 사주(C) (`saju-reading`) | 30 | 300 | 20 | 3000 | 전역의 90% |
| 사주(G) (`saju-g-reading`) | 20 | 200 | 10 | 1000 | 전역의 90% |

- 게스트는 `x-guest-key` 헤더(`^[A-Za-z0-9_-]{8,64}$`, 기기마다 고정된 무작위 값. 예: UUID)로 센다.
  - 형식이 틀리거나 헤더가 없으면 IP 로 센다.
  - 이 키는 게스트 공유·receipt 의 소유자 판정에도 쓰이니, 기기에 저장해 두고 계속 같은 값을 보낸다.
- 소비 순서는 전역 예산 → (게스트만) IP 일일 → 기기 일일이다. 게스트는 전역 예산의 90% 까지만 쓸 수 있다.
- 회원(유효한 Bearer)은 전역 예산만 쓰고 개인 일일 한도가 없다.
- 한도를 넘어도 에러가 아니라 LLM 없는 해석으로 200 을 준다(6절 운세 참고).
- 식단 사진 인식(`POST /meals/recognize`, 사용자당 하루 30회)과 식단 추천(`POST /meals/recommendations`, 하루 20회, 캐시 미스일 때만 차감)도 일일 한도가 있고, 초과하면 429 다.

## 6. 도메인 개요

엔드포인트별 상세는 endpoints.md, 스키마는 openapi.json 을 본다. 좌표는 전부 **WGS84 위경도**다(날씨 단기예보만 예외 — 아래 참고).

### 대중교통·생활 정보 (공개, 공공 API 프록시)

- **날씨** (`/weather/*`): 기상청 단기·초단기·중기예보(data.go.kr)와 API허브 AWS 매분 관측.
  - 단기·초단기는 위경도가 아니라 **기상청 격자 `nx`·`ny`** 를 받는다(`@repo/utils` 의 `latLngToKmaGrid` 로 변환).
  - 중기는 구역·지점 코드를 받는다.
  - 다음 발표 시각까지 캐시하고, 업스트림이 실패하면 stale 폴백을 준다.
- **대기** (`/air/*`): 에어코리아 측정값·예보·측정소.
  - 캐시: 측정값 10분, 예보 20분, 측정소 목록 24시간.
  - 내 주변·측정소 검색은 캐시된 측정소 목록으로 로컬 계산한다.
- **버스** (`/bus/*`): 서울 버스만 다룬다.
  - 도착·위치는 15초 캐시, 정류장 검색은 30일 DB 캐시, 주변 정류장은 로컬 마스터를 쓴다.
  - `stId`(9자리)와 `arsId`(5자리 정류소번호)를 구분해야 한다. `arsId` `0` 은 가상정류장이라 400 이다.
- **지하철** (`/subway/*`): 수도권.
  - 역 검색·주변·경로는 로컬 데이터, 도착·위치는 서울 실시간 API(15초 캐시), 시간표는 1~9호선만, 혼잡도는 1~8호선 통계다.
  - `stationId` 는 `lineId:역명`(콜론·한글 포함)이라 **URL 인코딩**해야 한다. `lineId` 는 4자리 코드다(`1002` = 2호선).
  - 제공 범위 밖 노선은 404 가 아니라 `coverage: false` 로 200 을 준다.
- **바다** (`/sea/*`): 국립해양조사원 생활해양예보지수 6종(`activity`)과 물때.
  - 물때는 `lat`·`lng`·`date` 가 필수이고, 서버가 가장 가까운 조석 예보지점을 고른다.
  - 해수욕 지수에는 6~9월에만 이안류 정보가 붙는다.
- **즐겨찾기** (`/bus/favorites`·`/subway/favorites`, 로그인): 종류별 최대 100개. 변경 응답은 항상 전체 목록이다. `sync` 는 서버에 없는 것만 추가한다.
- **내 대기 위치** (`/air/location`, 로그인): 사용자당 1개. PUT 은 덮어쓰기다.

공공 API 쿼터(일일)는 이 서버 전체가 함께 쓴다. 대기 약 450, 버스 약 900, 지하철 실시간 약 900, 날씨 약 9000콜이다. 캐시 미스를 유발하는 호출(좌표·날짜를 계속 바꾸는 호출)이 많으면 모든 사용자가 503 을 받는다.

### 지도 데이터 (공개, 로컬 DB)

- **일상지도** (`/life-map/*`): CCTV·공중화장실·병의원·생활편의(상가) 레이어, 범죄 통계(시군구 등급), 지역 이동 검색(VWorld 프록시).
  - `bbox` 는 `minLng,minLat,maxLng,maxLat` 순서다.
  - 줌이 낮으면 격자 집계 셀을, 높으면 점(최대 4000개)을 준다.
- **집값** (`/housing/*`): 국토부 아파트 실거래가(매매·전월세) 5년, 공시가격, 단지 정보, 생활 인프라(반경 500m), 침수 흔적(서울, 반경 100m).
  - **가격 단위는 만원**이다. 지도·주변·검색은 아파트만 대상이다.
  - 축은 `dealType`(trade·jeonse·monthly) × `band`(전용면적) 이다.
- **여행로그** (`/tour/public/*`, `/restaurants/public/:placeId/tour-stats`): AI 허브 여행로그 4개 권역(제주·서부·동부·수도권)의 2023년 4~9월 여행자 표본. **집계만** 준다(7절 참고).
- **지도 설정** (`/settings/map/public`): 웹 지도에 쓰는 VWorld WMTS 키를 준다(브라우저 노출용 키).
- **미디어** (`/media/*`): 네이버·배민 이미지 호스트 전용 썸네일 리사이즈 프록시(30일 캐시)와 크롤 시 저장한 파노라마 사본.

### 맛집 (공개)

- `/restaurants/public/*`, `/restaurants/ranking`, `/restaurants/:placeId/clusters`: 네이버 플레이스·다이닝코드·테이블링을 크롤링해 합친 데이터다.
  - 리뷰 LLM 분석(감성·만족도·메뉴·팁)을 미리 계산해 두었다가 랭킹·인사이트·스마트 픽·리뷰 군집·메뉴 칼로리에 쓴다.
  - **읽기 API 는 요청마다 LLM 을 부르지 않는다.**
- **리뷰 Q&A** (`POST /restaurants/:placeId/qa`): 요청마다 임베딩 1회와 LLM 최대 3콜을 쓰고, 캐시하지 않는다. IP당 분당 15회다. 준비가 안 됐으면 200 과 `confidence: "none"` 을 준다. 준비 여부는 `GET /restaurants/:placeId/qa/ready` 로 먼저 확인한다(LLM 호출 없음).
- **스마트 픽** (`POST /restaurants/public/smart-pick`): 분석 점수로 가중한 랜덤 추천.
- **맛집 즐겨찾기** (`/restaurants/favorites`, 로그인): 최대 100개.

### 운세 (선택 인증, LLM)

- **타로** (`/tarot/*`), **사주(C)** (`/saju-c/*`), **사주(G)** (`/saju-g/*`): 생성 계열 POST 는 LLM 을 호출한다(endpoints.md 의 `선택` 인증 라우트).
  - 게스트는 `x-guest-key` 로 한도를 센다. 회원은 전역 예산만 쓴다.
  - **일일 한도를 넘거나 LLM 이 실패해도 에러가 아니다.** LLM 없는 해석으로 200 을 준다.
    - 타로·사주(C): `source: "static"`.
    - 사주(G): `source: "basic"` + `fallbackReason`(`quota` 한도 초과 / `unavailable` LLM 실패 / `not_configured` 미설정).
    - `quota.remainingToday` 는 게스트 기기의 남은 횟수다. 회원이면 `null`.
  - 같은 입력은 24시간 캐시돼서 다시 불러도 LLM·한도를 소비하지 않는다.
  - 분당 IP 한도(`설정값`)는 회원도 적용되고, 초과하면 429 다.
- **회원/게스트 차이**:
  - 타로: 회원은 자동 저장(응답 `readingId`)되고, 오늘의 카드는 하루 1장으로 고정된다. 게스트는 저장이 없다. 회원 전용 스프레드를 요청하면 403 이다.
  - 사주(C): 회원이면 전체 풀이·사주에 묻기·오늘의 운세(오늘 날짜일 때)가 자동 저장된다. 궁합·택일·음식은 저장하지 않는다.
  - 사주(G): 자동 저장이 없다. 풀이 응답의 `receipt`(발급자 본인만 쓸 수 있고, 서버 메모리에 24시간 보관)로 `POST /saju-g/me/readings` 를 호출해야 보관된다.
  - 저장 기록은 `/…/me/readings`, 프로필은 `/…/me/profiles`(로그인)로 다룬다.
  - 명식 계산(`/saju-g/chart`, `/saju-g/pair/chart`)은 LLM 없는 공개 계산이다(분당 30회).
- **사주(C) 비동기 잡**: `POST /saju-c/readings`(전체 풀이, LLM 4섹션)와 `POST /saju-c/themes`(테마, LLM 3개)는 즉시 200 을 준다.
  - 응답에는 정적 본문과 `jobId` 가 들어 있다. 아직 안 끝난 섹션은 `status: "pending"` 이다.
  - `jobId` 가 `null` 이면 그 응답으로 완결이다(전부 캐시 히트, 한도 초과, LLM 미설정 중 하나).
  - 폴링: `GET /saju-c/readings/jobs/:jobId?after=<version>&wait=<ms>`. 테마는 `/saju-c/themes/jobs/:jobId`.
    - `after` 는 기본 0, `wait` 는 0~25000(기본 20000)이다.
    - 서버는 `version > after` 가 되거나 `wait` 가 지나면 스냅샷을 응답한다.
    - 받은 `version` 을 다음 `after` 로 넘기면서 `done: true` 가 될 때까지 반복한다.
    - 회원이면 저장까지 끝난 뒤 `readingId` 가 실린다.
  - 잡은 서버 메모리에 있다. 완료 5분 뒤, 미완료 30분 뒤, 서버가 재시작되면 사라지고, 그때는 410 이다. 이미 받은 정적 본문을 그대로 쓰면 된다.
- **공유**: `POST …/shares`(분당 10회)로 토큰을 받고, `GET …/shares/:token` 은 인증 없이 조회한다.
  - 게스트 공유는 서버가 본문을 다시 만든다. 클라이언트가 보낸 텍스트를 그대로 게시하지 않는다.
  - 생년월일·질문은 공유할 때 포함을 고른 경우에만 보인다.
  - 사주(G) 공유는 발급 때 받은 `revokeToken` 으로 `DELETE /saju-g/shares/:token` 해서 취소한다.

### 개인 기록 (로그인)

- **식단** (`/meals/*`): 끼니 기록·달력·통계·선호.
  - 영양값은 서버가 카탈로그와 매칭해 저장한다(클라이언트가 보내지 않음).
  - 사진은 multipart 5MB, 사용자당 3000장까지. 사진 URL 은 JWT 가 필요해서 `<img src>` 에 바로 쓸 수 없다.
  - 사진 인식(`POST /meals/recognize`)은 비전 LLM, 추천(`POST /meals/recommendations`)은 텍스트 LLM 이고, 둘 다 일일 한도가 있다.
  - 백업·복원은 최대 75MB JSON 이고 시간당 10회다.
  - 전체 삭제는 본문에 확인 문구가 있어야 한다.
- **음식** (`/food/search`, `/food/:id/restaurants`): 음식 카탈로그 자동완성과 음식→식당 역검색. 역검색은 수집한 메뉴·리뷰 언급을 근거로 해서 현재 판매 여부는 보장하지 않는다.
- **정산** (`/settlements/*`): 차수 1~10개, 참여자 1~100명의 분담액을 서버가 계산한다.
  - PUT 은 전체 교체다.
  - 공유 링크는 10자 토큰에 만료 1·7·30일이다. 공개 조회(`/share/settlements/:token`)는 인증 없이 되며 만료되면 410 이다.
  - 영수증 추출(`/settlement-extraction/*`)은 비전 LLM 1콜이고 일일 한도가 없다.
- **정산 임시저장** (`/settlement-drafts`): 사용자×식당당 1개, 최대 50개. `payload` 는 형태 검증 없는 자유 JSON(200KB 이하)이다.
- **단골** (`/me/contacts`): 정산 저장 시 자동으로 쌓인다. 이 API 로는 조회·수정·삭제만 된다.
- **그룹 투표** (`/votes`, `/share/votes/:token`): 방장(로그인)이 식당 후보 2~8곳으로 만들면 7일짜리 공유 토큰이 나온다.
  - 참가자는 인증 없이 `voterKey`(기기별 UUID)로 투표한다. 다시 보내면 수정, 빈 배열이면 철회다.
  - 투표자 표시 이름은 링크를 아는 누구에게나 보인다.
- **픽** (`/picks`): 선택지 2~20개 묶음 CRUD 와 서버 랜덤 추첨.

## 7. 데이터 출처·이용 조건

화면에 데이터를 보여 줄 때는 출처를 따라 표기하고, 아래 제한을 지킨다. 원천별 상세는 [../data-sources.md](../data-sources.md) 에 있다.

- **공공데이터**(기상청·에어코리아·국립해양조사원·국토부·서울 열린데이터광장·심평원·소상공인 상가정보 등): 출처 표기가 기본이다. 데이터셋마다 공공누리 유형(변경 금지·상업 이용 금지 등)을 확인한다.
- **여행로그(AI 허브)**: 원본(개별 기록·사진·GPS)의 제3자 제공이 금지돼 있어 API 는 집계만 준다.
  - 여행자 5명 미만 셀은 빠지고, 표본이 적으면 `null` 이다.
  - 응답의 `sourceNote`·`sampleLabel` 을 화면에 그대로 표기한다.
  - 응답을 모아 원본 수준으로 재구성하거나 재배포하지 않는다.
- **맛집 데이터**: 네이버 플레이스 등을 크롤링한 것이다. 리뷰 원문·사진을 대량으로 재게시하면 원 서비스 약관 문제가 생길 수 있다. 개인 프로젝트 안에서 참고·요약 용도로 쓴다.
- **LLM·공공 API 비용**: 이 서버가 부담한다. 다른 프로젝트에서 반복 호출(폴링·배치)할 때는 캐시를 두고 한도를 지킨다.

## 8. 다른 프로젝트에서 타입 쓰기

```bash
# 경로·파라미터·응답 타입 생성
npx openapi-typescript <이 리포>/docs/api/openapi.json -o src/lifepickr-api.d.ts
```

- `openapi-fetch` 와 함께 쓰면 경로·쿼리·본문·응답이 타입 체크된다. 기준 URL 은 `https://ninelife.kr` 이다.
- 이 리포 안의 웹·앱은 `@repo/api-contract`(zod)와 `@repo/shared` API 함수를 쓴다. 외부 프로젝트는 openapi.json 을 기준으로 한다.

## 9. 알려진 한계

- `GET /api/v1/restaurants/public/:placeId/category-tree` 의 재귀 트리(`children`)는 스펙상 `any` 다(zod→JSON Schema 변환 한계).
- `x-guest-key` 같은 헤더는 스키마에 선언돼 있지 않아 openapi.json 에 나오지 않는다(위 5절 참고).
- 이미지 응답(썸네일·파노라마·식단 사진·공유 PNG)은 스키마가 JSON 이 아니다.
- 공유 미리보기 HTML(`/r/:placeId`, `/share/settlements/:token`, `/tarot/s/:token` 등)은 API 가 아니라 제외했다. 사람이 여는 링크로만 쓴다.
- 서버 푸시(SSE)는 어드민 전용이라 외부 API 에 없다.
