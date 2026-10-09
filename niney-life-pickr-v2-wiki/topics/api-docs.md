---
topic: api-docs
last_compiled: 2026-10-10
sources_count: 74
status: active
aliases: [api-docs, 외부 API 문서, 외부용 API 문서, API 문서, 외부 사용 가이드, docs/api, docs/api/README.md, endpoints.md, 엔드포인트 색인, openapi.json, OpenAPI, openapi, OpenAPI 3.0.3, Life Pickr API, export:openapi, export-openapi, export-openapi.ts, swagger, "@fastify/swagger", swagger-ui, /docs, SwaggerTransform, jsonSchemaTransform, x-auth, x-rate-limit, RouteAuth, authOf, rateLimitOf, OPTIONAL_BEARER, bearerAuth, 선택 인증, optional-auth, resolveOptionalUser, optionalUserId, 한국어 summary, route summary, CORS, cors, CORS 개방, CORS_ORIGIN, PUBLIC_ORIGIN, buildCorsPolicy, isAdminPath, delegator, credentials-false, preflight, access-control-max-age, exposedHeaders, x-ratelimit-remaining, retry-after, 보안 감사 #42, "#42 번복", "#44", fail-closed, error-handler, 에러 본문, 429, Too Many Requests, errorResponseBuilder, replyUpstreamError, app.cors.test, app.openapi.test, app.errors.test, "app.*.test.ts", plugins-test-ban, CLAUDE.md 6번 규칙, openapi-typescript, openapi-fetch, 다른 프로젝트, 1b621c4, 678ecc0, 199개, 엔드포인트 199, /meals/nutrition, /meals/nutrition/advice, 영양소 점검, 영양제 조언, mealNutrition, mealSupplement, MEAL_SUPPLEMENT_DAILY_LIMIT, /meals/items/frequent, 추천 삭제, texture.jpg, cardTexture, 타로 카드 텍스처, README 드리프트, 중간 드리프트, 200개, 엔드포인트 200, d07281f0, 7587b470, 성능 2차 계약 변경, perf-2, /settlement-drafts/by-place, 임시저장 단건, 리뷰 Q&A 선택 인증, review-ask, 회원 하루 100회, MEMBER_LIMIT_LABEL, 업스트림 쿨다운, 쿨다운 503, 업스트림 8초, 지하철 IP 하루 한도, 게스트 공유 하루 200, 동반 enum, accompany 400, 중기 화이트리스트 400, 대기 시계열 404, 물때 date 범위, 썸네일 버킷, 식단 복원 대기, 복원 재시도, Cache-Control, 라우트 로컬 한도, STATUS_RATE, RECEIPT_UPLOAD_RATE, RECEIPT_EXTRACT_RATE, 던진 503, 주차 절, KOTSA]
---

# api-docs — 외부용 API 문서(docs/api)·OpenAPI 생성 파이프라인·어드민 외 CORS 개방

**2026-10-05~10-10 변경 흡수 — 성능 감사 2차의 외부 계약 변화를 재생성 1회 + 수기 README 첫 개정(243 → 264줄)으로 반영, 199 → 200개(공개 83·선택 16·로그인 101)(`d07281f0`·`7587b470`·`007ac899`·`36f07eb3`)**: (1) **재생성(`d07281f0`, 통합 끝에 1회 — PLAN-perf-2 "외부 API 계약 변화 — `export:openapi` 재생성(통합 끝에 1회)")** — 새 op 1개 로그인 `GET /settlement-drafts/by-place`(이어쓰기 단건, `draft: null` 200), 리뷰 Q&A `POST /restaurants/:placeId/qa` 가 **공개 → 선택 인증**(`OPTIONAL_BEARER`)·한도 `15/분` → `설정값`(usage-quota `review-ask` 의 `ipPerMinute`), 라우트 한도가 새로 걸린 op 6개(버스 노선 상세·정류장 검색 60/분, `/housing/status` 120/분, `/meals/data/export` 10/시간, 영수증 업로드·추출 20/분) — 한도 없는 op 118 → 113. 기존 op 39개의 스키마·문구가 바뀌었다: 대부분 description(쿼터·쿨다운·상한·HEIC·화이트리스트 — 성능 감사가 바꾼 동작을 라우트 설명에 적었다), 파라미터 enum 4(여행로그 동반 `accompany` 8종 — insights·lodging·regions 쿼리 + plan 본문, **외부 호환을 깨는 변경**), 응답 코드 1(대기 측정소 시계열에 404 — 모르는 측정소명은 업스트림 호출 없이), 응답 모양 2(임시저장 목록 = 메타만·PUT = `{id, updatedAt}`), 패턴 제거 2(식단 백업 응답·복원 본문의 base64 정규식). 물때 날짜 범위(zod refine)·식단 기록 상한(서버 상수)은 JSON Schema 로 나오지 않아 description 에만 있다. (2) **수기 README 가 처음으로 바뀌었다** — 09-24 이후 그대로였던 README 를 `d07281f0` 이 성능 2차 내용으로 고치고(+28/−13), 주차 기능 커밋 `007ac899`(같은 날 09:35)가 6절에 주차 절 5줄(원천 3·`std:`/`seoul:`/`kotsa:` 접두 id 인코딩·실시간은 서울 시영·공항뿐·요금 null = 정보 없음)을, `7587b470` 이 식단 복원 대기·재시도 문장을, `36f07eb3`(10-10)이 "원천 시간 요금이 말이 안 되면 기본·추가 요금을 null" 한 문장을 더했다. 바뀐 수기 규칙은 Architecture 의 "README 4·5·6절 — 2026-10-05 개정" 절에 정리했다(429·409·503·404 의미, 업스트림 8초·쿨다운, 쿼터 오퍼레이션별 분리, `Cache-Control`, 회원 하루 100회). (3) **남은 드리프트** — 파일 표 "(183개)"(실제 200), 5절 대표값 표 "리뷰 Q&A 15/분"(이제 `설정값`, 기본 15), 영양제 조언 일일 10회·429(28차부터 미기재), 9절 이미지 응답에 타로 텍스처 JPEG 없음, `Cache-Control` 은 여행로그만 언급(공개 맛집 목록·상세·메뉴 칼로리·집값/일상지도 status·주차 status/airports 에도 붙었는데 헤더라 스펙에도 없다), 리뷰 Q&A 라우트 description 의 "회원(Bearer)은 전역 일일 예산만 적용" 은 같은 날 들어온 회원 하루 100회와 어긋난다(Gotchas). **그리고 README·description 이 503 이라고 약속한 새 경로 중 식단 백업·복원 대기·HEIC 변환 대기·영수증 HEIC 대기는 라우트가 `httpErrors.serviceUnavailable` 를 던져 전역 에러 핸들러가 운영에서 500 으로 바꾼다**(Gotchas 13 의 실제 사례 — 코드 문제로 보고). (4) 규모: endpoints.md 344 → **345줄**, openapi.json 55,815 → **55,971줄**(2,095,016바이트 — 28차 기록 55,416줄 뒤 여행로그 10~14차 `fee9377a`·`8530b41d`·`067d89ed`(10-04, 코스 입력·일정표 스키마)의 재생성으로 이미 55,815줄·2,030,297바이트였다, 수는 199 그대로), paths 164 → 165, description 있는 op 64 → 70, 404 선언 13 → 14. `export-openapi.ts`·`swagger.ts`·`cors.ts`·`error-handler.ts`·`rate-limit.ts` 는 변경 없음(새 한도 3개는 `RATE` 가 아니라 라우트 로컬 상수). 계약 쪽 원천은 [api-contract](api-contract.md), 동작 상세는 [friendly](friendly.md)·도메인 토픽, 상한 설계는 [amplification-caps](../concepts/amplification-caps.md)·[quota-proportional-loading](../concepts/quota-proportional-loading.md).

**2026-09-25~10-04 변경 흡수 — 기능 커밋 5개가 각자 문서를 재생성해 192 → 199개(공개 84·선택 15·로그인 100), 수기 README 는 이번에도 그대로라 드리프트가 넓어졌다(`bfce1f8`·`162024d`·`867eb18`·`3d067a0`·`186d2bc`)**: (1) **+7 엔드포인트** — 공개 `GET /tarot/cards/:cardId/texture.jpg`(`bfce1f8`, 09-26 — 앱 3D 무대용 384px JPEG, 한도 없음, 193개) · 로그인 `GET /meals/items/frequent`(`162024d`, 10-02 — 빠른 추가 칩, 194개) · 로그인 `DELETE /meals/recommendations`(전체, body 확인 문구)·`DELETE /meals/recommendations/:id`(**204 를 스키마에 선언**)(`867eb18`, 10-04, 196개) · 로그인 `GET /meals/nutrition`(`RATE.mealNutrition` 30/분)·`GET`/`POST /meals/nutrition/advice`(POST 는 새 프리셋 `RATE.mealSupplement` **5/분** + 일일 `MEAL_SUPPLEMENT_DAILY_LIMIT` 10, 새 모듈 [meal-nutrition.route.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.route.ts))(`3d067a0`, 10-04, **199개**). 경로는 모듈 디렉터리가 아니라 `Routes.Meal.*` 라 전부 기존 `meal` 태그 절에 들어간다(28 → 34). `186d2bc` 는 달력 응답에 `kcal` 필드만 더해 openapi.json 5줄. (2) **기존 op 의 스키마 변화 15개** — 전부 식단(`/meals`·`/meals/{id}`·`/meals/calendar`·`/meals/preference`(성별·출생연도)·`/meals/data*`(삭제 결과 `nutritionAdvices`)·`/meals/recommendations*`) — 비-식단 op 는 그대로다. 정산 분류 이름 단일화(`d7f4ac1`)는 계약 상수만이라 스펙 무변화. (3) **중간 드리프트** — `9019cf5`(10-02)는 응답 enum `MealNutritionBasis` 에 `typical_portion` 을 더하고 재생성하지 않았다 — 같은 날 다음 기능 커밋 `162024d` 의 재생성이 흡수해 HEAD 는 코드와 일치하지만, 그 사이 커밋된 스펙은 enum 값 하나가 모자랐다(Gotchas 4 의 실제 사례). `e3afe9c` 의 `schemas/meal.ts` 변경은 상수(`MEAL_DEFAULT_WEIGHTS`·프리셋)뿐이라 스펙 무관. (4) **README 드리프트 확대** — 파일 표 "(183개)" 그대로, 5절·429 행·6절 식단에 영양 점검·영양제 조언(일일 10회, 초과 429)이 없고, 9절 이미지 응답 목록에 타로 텍스처 JPEG 가 없다(Gotchas 3). (5) 규모: endpoints.md 337 → **344줄**, openapi.json 53,919 → **55,416줄**(2,011,538바이트), paths 159 → 164, `x-rate-limit` 프리셋 20 → 22. CORS·swagger·export 파이프라인 코드는 변경 없음.

**2026-09-24~09-26 변경 흡수 — 신규 토픽: 외부용 API 문서 자동 생성 + 어드민 외 CORS `*` 개방 + 429 본문 수정**: 사용자의 다른 프로젝트가 브라우저·서버에서 friendly API 를 직접 쓰도록 `1b621c4`(2026-09-24)가 (1) [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) 를 "어드민(`/api/v1/admin/**`) 외 `origin:'*'` + `credentials:false`, 어드민은 `PUBLIC_ORIGIN` 만" 으로 바꿔 보안 감사 #42 의 prod fail-closed(`bc2db00`, 2026-07-13)를 **번복**하고, (2) [plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) 의 스펙 생성기를 전 환경에 등록하면서 transform 이 `x-auth`·`x-rate-limit`·bearer `security` 를 자동으로 싣게 했으며, (3) 비-어드민 라우트가 있는 route 파일 32개의 `schema` 에 한국어 `summary`(필요 시 `description`)를 달고(동작 변경 없음), (4) [scripts/export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts)(`pnpm --filter friendly export:openapi`)로 `docs/api/openapi.json`·`endpoints.md` 를 뽑아 수기 가이드 `docs/api/README.md` 와 함께 커밋했다 — 그 시점 **183개(공개 74·선택 15·로그인 94)**. 같은 날 `678ecc0` 은 레이트리밋 429 본문에서 `error` 필드가 빠지던 전역 에러 핸들러 결함을 고쳐 README 가 약속한 공통 에러 본문 `{ statusCode, error, message }` 를 지켰다. 이튿날 `2ff2c31`(2026-09-25, 주차)이 문서를 재생성해 **192개(공개 83·선택 15·로그인 94)** 가 됐고, `420a6be`(2026-09-26)는 어드민 라우트만 건드려 재생성 변화가 없다. 작업 규칙은 `CLAUDE.md` 6번 "외부 API 문서(`docs/api/`)" 로 박혔다 — 비-어드민 라우트를 추가·변경하면 summary·선택 인증이면 `OPTIONAL_BEARER`·`export:openapi` 재생성, `src/plugins/` 에 `*.test.ts` 금지(앱 연결 테스트는 `src/app.*.test.ts`).

## Purpose [coverage: high — 8 sources]

`docs/api/` 는 **이 리포 밖의 소비자**(사용자의 다른 프로젝트)를 위한 friendly API 문서다. 리포 안의 웹·앱은 여전히 `@repo/api-contract`(zod)와 `@repo/shared` API 함수로 호출하고 이 문서를 읽지 않는다 — 외부 프로젝트만 `openapi.json` 을 기준으로 한다([README 8절](../../docs/api/README.md)).

| 파일 | 내용 | 갱신 방식 | 규모(2026-10-10) |
|---|---|---|---|
| [docs/api/README.md](../../docs/api/README.md) | 공통 규칙 9절 — 기준 URL·CORS·인증·요청/응답 규약·한도·도메인 개요·데이터 출처/이용 조건·타입 쓰기·알려진 한계 | 수기 | 264줄(09-24 243줄 → 10-05 첫 개정 `d07281f0`·`007ac899`·`7587b470`, 10-10 `36f07eb3`) |
| [docs/api/endpoints.md](../../docs/api/endpoints.md) | 태그 27개 절로 나눈 엔드포인트 색인 — 메서드·경로·인증·한도·입력·한 줄 설명 | 자동(`export:openapi`) | 345줄 · 200개(10-04 엔 344줄 · 199개, 09-26 엔 337줄 · 192개) |
| [docs/api/openapi.json](../../docs/api/openapi.json) | OpenAPI 3.0.3 — 요청·응답 스키마 전체 | 자동 | 55,971줄 · 2,095,016바이트(`da4c4d85` 시점 55,815줄 · 2,030,297바이트, 10-04 `186d2bc` 엔 55,416줄 · 2,011,538바이트) |

이 토픽이 다루는 것:

1. **문서 생성 파이프라인** — zod 스키마 → 라우트 `schema`(한국어 summary) → `swagger.ts` transform(x-auth·x-rate-limit·security 추론) → `export-openapi.ts` → `docs/api/`.
2. **외부 공개 정책** — CORS 개방(어드민 외 `*`, credentials false)과 어드민 예외(`PUBLIC_ORIGIN` 만), `/docs` UI 의 dev 전용 유지, 보안 감사 #42·#44 결정과의 관계([docs/PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 3차 절).
3. **외부 계약이 된 공통 규약** — 에러 본문 `{ statusCode, error, message }`(429 수정 `678ecc0`), 레이트리밋 응답 헤더 노출, 인증 3등급(공개·선택·로그인) 표기.
4. **작업 규칙** — [CLAUDE.md](../../CLAUDE.md) 6번과 앱 연결 테스트 위치(`src/app.*.test.ts`).

도메인별 동작(파라미터 의미·캐시·폴백)은 각 도메인 토픽 소관이고, README 6절 "도메인 개요" 는 그 외부용 요약이다 — [weather](weather.md)·[air-quality](air-quality.md)·[bus](bus.md)·[subway](subway.md)·[sea](sea.md)·[parking](parking.md)·[life-map](life-map.md)·[housing](housing.md)·[tour](tour.md)·[tarot](tarot.md)·[saju-c](saju-c.md)·[saju-g](saju-g.md)·[meal](meal.md)·[food](food.md)·[settlement](settlement.md)·[vote](vote.md). 백엔드 공통 관점은 [friendly](friendly.md), 스키마 원천은 [api-contract](api-contract.md), LLM 기능의 일일 한도는 [usage-quota](usage-quota.md).

사용자 결정(2026-09-24, 작업 기록): "내 다른 프로젝트에서 쓸 것 — 운영도 CORS 다 풀고, 트래픽 보고 나중에 제한. 어드민 제외, 열 수 있는 건 다 열기(LLM 포함)." 커밋 본문은 "사용자의 다른 프로젝트가 브라우저에서 이 API 를 직접 쓰도록 운영 CORS 를 연다. 트래픽을 보고 CORS_ORIGIN 목록으로 다시 좁힌다" 로 적었고, PLAN-perf-security 는 같은 결정을 "2026-09-24 번복(사용자 결정)" 으로 남겼다.

소스: [README.md](../../docs/api/README.md), [endpoints.md](../../docs/api/endpoints.md), [openapi.json](../../docs/api/openapi.json), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [cors.ts](../../apps/friendly/src/plugins/cors.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [CLAUDE.md](../../CLAUDE.md), [PLAN-perf-security.md](../../docs/PLAN-perf-security.md)

## Architecture [coverage: high — 24 sources]

### 1. 생성 파이프라인

```
packages/api-contract/src/schemas/*.ts (zod)             ← 요청·응답 스키마 원천
        │ import
apps/friendly/src/modules/**/<x>.route.ts
   schema: { tags, summary, description?, security?, params/querystring/body, response }
   config: { rateLimit: RATE.xxx | { max: async fn, timeWindow } }
   onRequest: [app.authenticate(, app.requireAdmin)]
        │ 라우트 등록 때 @fastify/swagger 가 수집 (모든 환경)
plugins/swagger.ts transform
   jsonSchemaTransform(zod → JSON Schema) → authOf() / rateLimitOf()
   → x-auth · x-rate-limit · security 부착
        │ app.swagger()
scripts/export-openapi.ts   (tsx --env-file=.env · buildApp → ready → swagger → close)
   /api/v1/ 밖 제외 · x-auth=admin 제외 · info/servers 교체
        ├─ docs/api/openapi.json   (JSON.stringify 2칸 + 끝 개행)
        └─ docs/api/endpoints.md   (태그별 표 + 합계·인증별 개수 머리말)
        ▼
외부 프로젝트: npx openapi-typescript docs/api/openapi.json → openapi-fetch (README 8절)
```

### 2. swagger.ts — 인증 수준 추론과 security 자동 부착

[swagger.ts](../../apps/friendly/src/plugins/swagger.ts)(84줄)는 `RouteAuth = 'public' | 'optional' | 'user' | 'admin'` 를 export 하고, transform 안에서 `authOf(app, route, schema)` 로 라우트마다 등급을 정한다. 판정은 **첫 매치**:

| 순서 | 조건 | 결과 | 비고 |
|---|---|---|---|
| 1 | `isAdminPath(route.url)` 이거나 훅에 `app.requireAdmin` | `admin` | 어드민 SSE 는 핸들러 안에서 `?token=` 을 검증해 훅이 없다 → 경로로 판정(어드민 라우트는 전부 이 prefix 아래) |
| 2 | 훅에 `app.authenticate` | `user` | |
| 3 | 원본 schema 의 `security` 가 비어 있지 않음 | `{}` 원소가 있으면 `optional`, 없으면 `user` | picks 처럼 플러그인 단위 `addHook('onRequest', app.authenticate)` 는 route 훅에 안 보여 security 를 명시한다 |
| 4 | 그 외 | `public` | |

- 훅 목록은 `route.onRequest`·`preValidation`·`preHandler` 를 평탄화한 배열이고, 비교는 **함수 identity**(`includes`)다.
- `OPTIONAL_BEARER = [{}, { bearerAuth: [] }]` — OpenAPI 에서 빈 객체는 "인증 없이도 됨". 선택 인증은 핸들러 안에서 `app.resolveOptionalUser`(타로·사주(C)·사주(G) 의 `actorOf` 헬퍼) 또는 vote 의 `optionalUserId` 로 판정해 훅으로 안 보이므로 **라우트 schema 에 사람이 명시**해야 한다(현재 15개 — API Surface).
- 비-public 인데 schema 에 `security` 가 없으면 `[{ bearerAuth: [] }]` 를 채운다. public 은 security 를 싣지 않는다(`app.openapi.test` 가 `undefined` 확인).
- `rateLimitOf(route)`: `route.config.rateLimit` 이 있으면 `{ max: number | 'dynamic', timeWindow: String(timeWindow ?? '1 minute') }`. max 가 함수면 `'dynamic'` — 타로·사주의 분당 한도는 `async () => (await app.usageQuota.getSetting(feature)).ipPerMinute` 처럼 어드민 설정을 읽는다([tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts)). config 가 없으면 필드를 생략(= 전역 백스톱). 레이트리밋 플러그인이 테스트에서 미등록이어도 route config 를 읽으므로 스펙은 환경과 무관하다.
- `schema.hide` 면 부착 없이 통과 — 현재 `hide: true` 는 prefix 없는 `/health` 하나([health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)).
- 등록: `@fastify/swagger` 는 **모든 환경**(HTTP 노출 없음 — `app.swagger()` 로 스펙 객체만), `@fastify/swagger-ui`(`/docs`)는 `isDev` 일 때만 → prod·test 는 404. 앱 내부 스펙의 info 는 여전히 `title 'Friendly API'`·`servers: http://localhost:3000` 이고 외부용 값은 export 가 갈아 끼운다.
- `swagger.ts` 가 `cors.ts` 의 `isAdminPath` 를 import 한다 — "어드민이냐" 판정 한 함수가 CORS 정책 선택·문서 등급·export 제외를 모두 결정한다.

### 3. export-openapi.ts — 외부용 파일 추출

[export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts)(131줄), 스크립트 `"export:openapi": "tsx --env-file=.env scripts/export-openapi.ts"`([package.json](../../apps/friendly/package.json), `1b621c4` 추가).

1. `buildApp({ logger: false })` → `app.ready()`(**listen 없음**) → `app.swagger()` → `app.close()`.
2. 필터: path 가 `/api/v1/` 로 시작하는 것만(공유 미리보기 HTML `/r/`·`/share/settlements/`·`/s/`·`/vote/`·`/tarot/s/`·`/saju-c/s/`·`/saju-g/s/` 와 robots·sitemap·well-known 이 빠짐) × 메서드 `get·post·put·patch·delete` 중 `x-auth !== 'admin'`. 경로는 사전순 정렬.
3. 외부용 스펙: `info.title 'Life Pickr API'`, version 은 원본 그대로(`0.0.1`), description 에 README 안내와 x-auth·x-rate-limit 뜻, `servers: [{ url: env.PUBLIC_ORIGIN(끝 슬래시 제거) }]`, `components` 는 원본(bearerAuth) 그대로. 최상위 `tags` 배열은 없다.
4. endpoints.md: 첫 태그로 묶고(없으면 `(untagged)`) 태그 이름순. 열 = 메서드 · 경로(`{x}` → `:x`) · 인증(`user`→로그인, `optional`→선택, 나머지→공개) · 한도(`max/분·시간·일`, `dynamic`→`설정값`, 없으면 빈 칸 = 전역 1000/분) · 입력(query·header 파라미터, 필수는 `*`, 본문이 있으면 `body`) · 설명(`summary ?? description`, `|` 이스케이프·개행 평탄화). 머리에 "**자동 생성 — 직접 수정하지 말 것**" 과 합계 한 줄.
5. 콘솔 `docs/api — N개 엔드포인트(공개 a, 선택 b, 로그인 c), 태그 t개` 뒤 `process.exit(0)`.

부팅 부수효과: `ready()` 는 `onReady` 훅을 실행한다 — [housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) 의 월 갱신 스케줄러 `start()`(close 에서 stop), [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 의 군집 기동 리컨실 예약([review-clustering.service.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts) `scheduleStartupReconcile` — `setTimeout(...).unref()` 라 곧 exit 로 사라짐). 업스트림을 부르는 주차 실시간·충전기 폴러는 `2ff2c31` 에서 일부러 `onListen` 에 걸었다 — 코드 주석 "export:openapi 처럼 app.ready() 만 하는 스크립트·inject 테스트에서 업스트림을 부르지 않게"([parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [parking](parking.md), 컨셉 [server-only-boot-effects](../concepts/server-only-boot-effects.md)).

### 4. CORS — plugins/cors.ts

[cors.ts](../../apps/friendly/src/plugins/cors.ts)(66줄):

- `isAdminPath(url)`: `?` 앞만 떼어 `decodeURIComponent`(잘못된 인코딩이면 원문으로) 한 뒤 `/^\/api\/v1\/admin(?:\/|$)/` — 라우터가 `/api/v1/%61dmin` 도 `/api/v1/admin` 으로 매칭하므로 디코딩 후 판정. `/api/v1/administrator`·`/api/v1/weather/forecast?admin=1` 은 비어드민.
- `buildCorsPolicy({ dev, corsOrigin, publicOrigin })` → `{ open, admin }`. 공통 `base = { credentials: false, exposedHeaders: ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'], maxAge: 600 }`.

| 실행 환경 | `CORS_ORIGIN` | 어드민 외(`open.origin`) | 어드민(`admin.origin`) |
|---|---|---|---|
| dev (`NODE_ENV=development`) | 무시 | `'*'` | `true` (요청 origin 반사) |
| 비-dev (production·test) | `*`(기본) · 빈 값 · 목록에 `*` 포함 | `'*'` | `[PUBLIC_ORIGIN]`(끝 슬래시 제거) |
| 비-dev | 콤마 구분 목록 | 그 목록(trim) | `[PUBLIC_ORIGIN]` |

- 등록은 `@fastify/cors` 의 `delegator: (req, cb) => cb(null, isAdminPath(req.url) ? policy.admin : policy.open)` — 요청마다 두 정책 중 하나를 고른다. `allowedHeaders` 를 지정하지 않아 preflight 의 `Access-Control-Request-Headers`(Authorization·Content-Type·x-guest-key 등)를 그대로 반사한다.
- 비-dev 기동 때 info 로그 1줄 `CORS: 어드민 외 {모든 origin | 목록} 허용, 어드민은 {PUBLIC_ORIGIN} 만` — 운영에서 실제 적용값을 확인하는 곳.
- env: [env.ts](../../apps/friendly/src/config/env.ts) `CORS_ORIGIN: z.string().default('*')`(주석 "어드민 외 API 의 허용 origin(prod 만 적용)"), `PUBLIC_ORIGIN: z.string().url().default('https://ninelife.kr')`(원래 SEO·OG canonical 기준 origin 인데 어드민 CORS·외부 문서 `servers` 에도 쓰인다). [.env.example](../../apps/friendly/.env.example) 은 `CORS_ORIGIN=http://localhost:5173,http://localhost:8081` → `CORS_ORIGIN=*` + 3줄 주석.
- `9be2e10`(2026-05-30)부터 있던 dev 의 `PRIVATE_LAN_ORIGIN`(RFC1918) 분류 regex 와 "비-LAN origin 반사 허용" warn 은 이번에 삭제됐다.

CORS 정책 변천(`git log -- apps/friendly/src/plugins/cors.ts`):

| 날짜·커밋 | dev | prod | credentials |
|---|---|---|---|
| 2026-04-27 `96746da` 초기 | `CORS_ORIGIN='*'` 면 origin 반사(`true`), 아니면 목록 | dev 와 같음 | true |
| 2026-05-28 `fcc0def` | 목록 + RFC1918·localhost 자동 허용, 그 밖은 `cb(Error)` 거부 | 목록(`*` 면 반사) | true |
| 2026-05-30 `9be2e10` | 전부 반사 + 비-LAN origin 을 origin 당 1회 warn | 목록(`*` 면 반사) — 감사 #42 가 지적한 상태 | true |
| 2026-07-13 `bc2db00` | 전부 반사 | `*`·미설정이면 `PUBLIC_ORIGIN` 으로 폐쇄(fail-closed, warn), 목록이면 목록 | true |
| **2026-09-24 `1b621c4`** | 어드민 외 `*`, 어드민 반사 | 어드민 외 `*`(기본) 또는 목록, 어드민 `PUBLIC_ORIGIN` | **false** |

### 5. 에러 본문 — plugins/error-handler.ts

[error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts)(43줄) `setErrorHandler` 4분기 — 외부 문서가 약속하는 공통 본문 `{ statusCode, error, message }` 의 실제 구현:

| 분기 | 상태 | 본문 |
|---|---|---|
| `error instanceof ZodError`(서비스 내부 검증) | 400 | `error: 'Bad Request'`, `message: 'Validation failed'`, `details: flatten().fieldErrors` |
| `error.validation`(라우트 스키마 검증) | 400 | `message` = 검증 메시지(README 예 `querystring/lat Expected number, received nan`) |
| `statusCode < 500` | 그 코드 | `error: error.name ?? (typeof error.error === 'string' ? error.error : 'Error')` |
| 그 외(던진 5xx 포함) | 500 | `Internal Server Error`, message 는 dev 만 원문, 나머지 `Something went wrong` |

- 429 경로: `@fastify/rate-limit`(설치본 10.3.0)은 한도 초과 시 `x-ratelimit-limit/remaining/reset`·`retry-after` 헤더를 붙인 뒤 `throw params.errorResponseBuilder(req, respCtx)` 한다. 이 리포의 builder([rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts))는 Error 가 아닌 평객체 `{ statusCode: 429, error: 'Too Many Requests', message: '요청이 너무 많습니다. N초 후 다시 시도해 주세요.' }` 를 돌려주므로 `name` 이 없다. `678ecc0` 전에는 `error: error.name`(undefined)이라 JSON 직렬화에서 `error` 키가 사라졌다.
- 502/503/404 를 의미 있게 돌려줘야 하는 라우트는 던지지 않고 [reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) 의 `replyUpstreamError` 로 같은 모양(`error: 'Not Found' | 'Service Unavailable' | 'Bad Gateway'`)을 직접 보낸다 — air-quality·bus·subway·weather·sea·life-map·housing·parking 8개 route 파일. 던지면 4번째 분기가 500 으로 뭉갠다. 2026-10-05 성능 감사가 더한 **업스트림 쿨다운 503**(실패 뒤 30초→5분, 키·인증 오류는 서비스 전체 5분→1시간 — friendly `lib/upstream-guard`)은 이 8개 파일의 경로라 503 으로 나가고, 썸네일 변환 대기열 초과 503(`Retry-After: 5`)·업스트림 실패 502 는 [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) 가 `reply.code()` 로 직접 보낸다. 반면 **같은 날 생긴 식단 백업·복원 대기(`meal.route` `throwMealDataAsHttp`·복원 입구 `meal-restore-intake` 의 `busy()`)·식단 사진 HEIC 변환 대기(`throwAsHttp`)·영수증 HEIC 대기(`settlement-extraction.route`)는 `app.httpErrors.serviceUnavailable` 를 던진다** — 이 분기에 걸려 운영 응답은 `500 Something went wrong` 이다(복원 입구 테스트는 에러 핸들러 없는 맨 Fastify 라 503 을 본다 — Gotchas 13).
- 401/403 은 `@fastify/sensible` 의 `reply.unauthorized/forbidden`([jwt.ts](../../apps/friendly/src/plugins/jwt.ts)): `Invalid or missing token`(서명·만료 실패) / `Session expired`(`tokenVersion` 불일치 — 로그아웃·강등 후) / `Admin role required`. 토큰 기본 수명은 `JWT_EXPIRES_IN=7d`.

### 6. 레이트리밋 — 외부 문서 관점

[rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts): 전역 백스톱 IP당 분당 1000(`global: true`), 키 = `clientKey`(`CF-Connecting-IP` 우선, 없으면 `req.ip` — [app.ts](../../apps/friendly/src/app.ts) `trustProxy: true`). 라우트 프리셋 `RATE` 20개(→ 2026-10-04 `3d067a0` 의 `mealNutrition` 30/분·`mealSupplement` 5/분으로 **22개**)가 `config.rateLimit` 으로 걸리고 그대로 스펙의 `x-rate-limit` 이 된다. 2026-10-05 성능 감사는 `RATE` 를 늘리지 않고 **라우트 파일 안의 로컬 상수**로 한도를 걸기도 했다 — [housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) `STATUS_RATE`(120/분), [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) `RECEIPT_UPLOAD_RATE`·`RECEIPT_EXTRACT_RATE`(각 20/분). transform 은 `config.rateLimit` 만 보므로 문서엔 똑같이 실린다. 리뷰 Q&A 는 타로·사주처럼 `max: async () => (await app.usageQuota.getSetting('review-ask')).ipPerMinute` 라 `dynamic`. 테스트(`isTest`)에선 플러그인 자체를 등록하지 않는다(inject 요청이 한 IP 로 쌓여 429 오탐). 분포는 API Surface, LLM 기능의 KST 일일 한도(게스트 키·IP·전역 예산)는 별개 층 → [usage-quota](usage-quota.md)·[anonymous-usage-quota](../concepts/anonymous-usage-quota.md).

### 6-1. README 4·5·6절 — 2026-10-05 개정(성능 감사 2차·주차 KOTSA)

`d07281f0` 이 수기 README 를 처음 고쳤고(7개 감사 묶음의 문구 충돌을 README 한 곳에서 손으로 합쳤다 — PLAN-perf-2 "통합 완료 상태"), 같은 날
`007ac899`·`7587b470`, 10-10 `36f07eb3` 이 이어 붙였다. 외부 소비자가 분기해야 하는 규칙만 정리하면:

| 절 | 바뀐 규칙 | 근거 커밋·코드 |
|---|---|---|
| 4 상태 표 400 | 날씨 중기 구역·지점 화이트리스트 밖 → 400(utils 지점표의 짝만 — `ta` 는 `land` 구역 소속, `stn` 은 그 구역 전망 지점 또는 `108`, 해역 12곳) | `fd957320` weather.route |
| 4 상태 표 404 | (6절) 대기 측정소 시계열 — 측정소 목록·전국 실시간에 없는 이름은 업스트림 호출 없이 404 | `fd957320` air-quality |
| 4 상태 표 409 | 행 문구는 그대로("중복·상한 초과·마감 후 제출")지만 6절에 새 상한 — 식단 기록 계정 2만·하루 30끼, 임시저장 합계 2MB, 투표자 세션당 100명(새 voterKey 만, 기존 투표자 수정·철회는 허용) | `7b060ca4`·`622bfca2`·`78cbb457` |
| 4 상태 표 429 | 레이트리밋·식단 일일 한도에 더해 **지하철 실시간·시간표의 IP별 하루 업스트림 조회**(실시간 150·시간표 40, 캐시 히트 미집계)와 **게스트 공유 링크 하루 발급 상한**(기능별 IP당 200), 6절 영수증 추출 사용자 일일 50(`SETTLEMENT_EXTRACT_DAILY_LIMIT`). 운세·리뷰 Q&A 의 일일 한도는 여전히 429 가 아니라 200 폴백 | `fd957320`·`78cbb457`·`622bfca2` |
| 4 상태 표 503 | 키 미설정·인증 실패·쿼터 소진·데이터 미적재에 더해 **업스트림 장애 직후 쿨다운**(message 예 "… 잠시 조회를 멈췄습니다. 30초 뒤 다시 시도해 주세요.")과 **식단 백업·복원 대기 초과** — 후자는 운영에서 실제로는 500(Architecture §5) | `fd957320`·`7b060ca4`·`a026c6d9` |
| 4 공공 API 프록시 | 업스트림 1건당 최대 약 8초, 실패한 조회는 30초→5분(키·인증 오류는 API 전체 5분→1시간) 동안 다시 부르지 않고 stale 또는 503 | `fd957320` `lib/upstream-guard` |
| 5 일일 한도 | 표에 **리뷰 Q&A(`review-ask`)** 행(게스트 30·IP 300·분당 15·전역 3000·컷 90%), 회원은 "전역 예산만" → **IP·기기 한도 대신 기능별 하루 100회**(넘으면 게스트처럼 폴백) | `ab7dad28`·`78cbb457` |
| 6 공공 API 쿼터 | 일일 쿼터를 **기능(오퍼레이션)별로 나눠 센다** — 버스 검색·노선을 많이 불러도 도착·위치 몫은 남는다. 그래도 캐시 미스를 유발하는 호출이 많으면 그 기능은 모두에게 503 | `fd957320` |
| 6 캐시·`Cache-Control` | 대기 측정값은 다음 HH:20·예보는 다음 발표+15분까지(이전 "10분·20분"), 여행로그 GET 성공 응답 `Cache-Control: public, max-age=300`(데이터는 재적재 때만 바뀜). 미디어 썸네일 `w`·`q` 버킷 스냅(거부 안 함)·업스트림 실패 502·변환 대기 503 `Retry-After` | `fd957320`·`78ea38a5`·`622bfca2` |
| 6 입력 범위 | 바다 물때 `date` KST 오늘−2~+10(밖 400), 여행로그 `accompany` 원본 8종(밖 400), 대기 예보 `date` 오늘−2~+1 로 맞춤, 밀도 bbox 는 겹치는 칸만(칸 값은 칸 전체) | `fd957320`·`78ea38a5` |
| 6 리뷰 Q&A | 선택 인증, 같은 가게·같은 질문 20분 같은 답(한도 미차감), 한도·미준비·장애는 200 `confidence: "none"` | `ab7dad28` |
| 6 운세 공유 | 같은 게스트·같은 내용 재공유는 앞서 만든 링크(사주(G)는 같은 `revokeToken`), 게스트 발급 IP당 하루 200 → 429 | `78cbb457` |
| 6 식단 | 백업·복원은 서버 전체 동시 1건(복원은 본문 받기 전부터 차례), 복원 응답을 못 받았으면 **같은 백업을 그대로 재전송** — 앞선 시도 잔여를 치우고 한 벌만, 이미 끝났으면 `duplicate: true` | `7b060ca4`·`04dbab58`·`a026c6d9`(문서 `7587b470`) |
| 6 정산 | 영수증 업로드·추출 IP당 분당 20·사용자 일일 50·미참조 사진 30일 정리, 임시저장 목록 = 메타만·이어쓰기 `GET /settlement-drafts/by-place`·저장 응답 `id`·`updatedAt`·합계 2MB | `622bfca2` |
| 6 투표 | 투표자 세션당 100명(409), 응답 `voters` 는 후보마다 앞 100명 | `78cbb457`·`4710c617` |
| 6 주차(신설) | 원천 3(표준데이터·서울 공영·KOTSA 공영)·공항, `std:`/`seoul:`/`kotsa:` 접두 id 는 URL 인코딩, 실시간은 서울 시영·공항만, 요금 `null` = 정보 없음(0원과 다름), 원천 시간 요금이 말이 안 되면 기본·추가 요금 null | `007ac899`·`36f07eb3` |

### 7. 플러그인 로딩과 테스트 위치

[app.ts](../../apps/friendly/src/app.ts) 는 `plugins/` 를 **`matchFilter` 없이** autoload 하고(`modules/` 만 `/\.route\.(ts|js)$/`), [tsup.config.ts](../../apps/friendly/tsup.config.ts) entry 는 `src/plugins/*.ts` 를 통째로 잡는다. 설치된 `@fastify/autoload` 6.3.1 의 기본 `scriptPattern` 은 `.d.ts` 만 빼고 모든 `.ts/.js` 를 받으며 테스트 파일 기본 제외가 없다 → `src/plugins/x.test.ts` 는 런타임 플러그인으로 로드되고 dist 에도 빌드된다. 그래서 CORS·OpenAPI·에러 본문 테스트는 `src/` 루트의 `app.cors.test.ts`(7건)·`app.openapi.test.ts`(5건)·`app.errors.test.ts`(2건)에 두었다([vitest.config.ts](../../apps/friendly/vitest.config.ts) `include: ['src/**/*.test.ts']`). `CLAUDE.md` 6번의 마지막 줄이 이 규칙이다.

## Talks To [coverage: high — 20 sources]

- **[friendly](friendly.md)** — 네 플러그인(cors·swagger·error-handler·rate-limit)과 autoload 되는 route 파일 전체가 문서의 원천. 공유 미리보기 7경로는 `app.ts` 가 autoload 밖에서 명시 등록해 `/api/v1` 밖에 있고 문서에서 빠진다.
- **[api-contract](api-contract.md)** — 요청·응답 zod 가 `fastify-type-provider-zod` `jsonSchemaTransform` 으로 JSON Schema 가 되어 openapi.json 에 **인라인**으로 들어간다(`components.schemas` 0개). [zod-ssot-buildless](../concepts/zod-ssot-buildless.md) 의 "스키마 1개 → 검증·OpenAPI·FE 타입" 이 리포 밖 소비자(`openapi-typescript`)까지 연장된 것.
- **[usage-quota](usage-quota.md) · [tarot](tarot.md) · [saju-c](saju-c.md) · [saju-g](saju-g.md) · [review-search](review-search.md)** — `x-rate-limit.max = 'dynamic'` 10개(→ 2026-10-05 리뷰 Q&A 가 더해져 **11개**)가 usage-quota 설정 `ipPerMinute` 를 읽는 함수 max. README 5절이 기능별 일일 한도 기본값(50/500/20/5000/90%, 30/300/20/3000/90%, 20/200/10/1000/90%, 2026-10-05 `review-ask` 30/300/15/3000/90%)과 `x-guest-key` 규칙을 외부용으로 옮겨 적었다. 선택 인증 13개가 이 세 모듈의 `actorOf` → `resolveOptionalUser`([tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts)·[saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts)·[saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts)), 2026-10-05 부터 리뷰 Q&A 1개가 같은 방식(`askActorOf`, [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts))으로 더해져 14개. 회원 하루 100회는 friendly [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) 상수 `MEMBER_PER_DAY` 이고, 타로·사주(C)·사주(G) 라우트 description 은 같은 파일의 `MEMBER_LIMIT_LABEL`("개인 일일 한도 기능별 100회")을 끼워 상수가 바뀌면 재생성 문서도 따라간다 — 리뷰 Q&A description 만 이 라벨을 쓰지 않고 "회원은 전역 일일 예산만" 이라고 적혀 있다(Gotchas).
- **[vote](vote.md)** — 공유 조회 `GET /share/votes/:token`·투표 제출 `PUT …/ballot` 가 `OPTIONAL_BEARER`. 판정은 route 파일의 자체 `optionalUserId`(`req.jwtVerify()` 만)로 `isOwner` 표시용([vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts)).
- **picks** — 플러그인 단위 `app.addHook('onRequest', app.authenticate)` 라 6개 라우트 모두 `security: [{ bearerAuth: [] }]` 를 명시해 `user` 로 잡힌다([picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)) — authOf 3번 규칙으로 `user` 가 되는 유일한 모듈(`modules/` 에서 플러그인 단위 인증 훅은 picks 하나; 3번 규칙의 나머지는 선택 인증 15개).
- **[parking](parking.md)** — `2ff2c31` 재생성으로 +9(전부 공개, `parking` 태그 — `/restaurants/public/:placeId/parking-reviews` 포함). 폴러를 `onListen` 에 둔 이유가 export 스크립트. 2026-10-05 `007ac899`(KOTSA 공영 보강)는 라우트·스키마를 바꾸지 않아 재생성 없이 README 6절에 주차 절만 손으로 더했고(27차 Gotchas 3 "README 에 주차 없음" 해소), 10-10 `36f07eb3` 이 요금 null 규칙 한 문장을 덧붙였다.
- **[settlement](settlement.md) · [meal](meal.md) · [tour](tour.md) · [vote](vote.md) · [weather](weather.md) · [air-quality](air-quality.md) · [subway](subway.md) · [sea](sea.md)** — (2026-10-05) 성능 감사 2차가 바꾼 외부 계약의 원천: 정산 임시저장 목록 메타화·`by-place`(`622bfca2`), 식단 기록 상한·백업 25MB/복원 50MB·복원 대기/재시도(`7b060ca4`·`1c113488`·`04dbab58`·`a026c6d9`), 동반 enum(`78ea38a5`), 투표자 100명(`78cbb457`), 중기 화이트리스트·대기 시계열 404·지하철 IP 한도·물때 날짜·업스트림 쿨다운(`fd957320`). 문서 쪽 반영은 전부 `d07281f0`(+ 복원 문장 `7587b470`).
- **[meal](meal.md) · [meal-nutrition](meal-nutrition.md)** — (2026-10-02~04) 식단 쪽 재생성 4회로 `meal` 절이 28 → 34(전부 로그인): 빠른 추가 `GET /meals/items/frequent`(`162024d`), 추천 삭제 2(`867eb18`), 새 모듈 `meal-nutrition` 의 영양소 점검·영양제 조언 3(`3d067a0`). 새 모듈이지만 경로가 `Routes.Meal.nutrition`·`nutritionAdvice`(= `/meals/nutrition*`)이고 태그도 `['meal']` 이라 절이 새로 생기지 않는다 — 식단 3디렉터리가 `Routes.Meal` 하나를 나눠 갖던 규약에 넷째가 합류한 것. 영양제 조언은 텍스트 LLM(kimi-k3) 1콜이라 외부 비용 노출면에 들어간다(Gotchas 12).
- **[tarot](tarot.md) · [mobile](mobile.md)** — (2026-09-26 `bfce1f8`) 공개 `GET /tarot/cards/:cardId/texture.jpg` — 앱 3D 무대(expo-gl 이 WebP 를 못 읽음)를 위해 웹 정적 자산 `-512.webp` 를 384px JPEG 로 바꿔 주는 이미지 라우트([tarot-card-texture.ts](../../apps/friendly/src/modules/tarot/tarot-card-texture.ts), LRU 80·`cache-control` 1주). 리포 안 소비자(앱)를 위해 생긴 라우트지만 `/api/v1` 비-어드민이라 외부 문서에도 실린다 — `tarot` 절 6 → 7(공개 1 → 2).
- **[sea](sea.md)** — `4a2bff1` 이 `1b621c4` 보다 먼저라 183개 시점부터 2개 포함(`sea.route.ts` 의 summary 5줄은 `1b621c4` 가 추가).
- **[web](web.md) · [mobile](mobile.md)** — 이 문서의 소비자가 아니다. 웹은 운영에서 같은 origin(ninelife.kr), dev 는 Vite `/api` 프록시([vite.config.ts](../../apps/web/vite.config.ts) → localhost:3000)라 CORS 와 무관. 앱은 네이티브 fetch 라 무관하고 Expo Web dev(:8081)만 교차 origin — dev `*` 로 통과. `packages/shared`·`apps/web/src`·`apps/mobile/src` 어디에도 fetch `credentials` 옵션이 없어(기본 same-origin) `credentials:false` 전환에 따른 회귀가 없다.
- **운영 경로** — Cloudflare → nginx `location /api/` → `127.0.0.1:3000`([ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects)). nginx 는 CORS 헤더를 붙이지 않고 OPTIONS 도 그대로 넘긴다(`X-Real-IP $http_cf_connecting_ip`, XFF). `.env` 반영은 [deploy.sh](../../deploy.sh) 5번 ".env만" = `pm2 reload friendly --update-env; pm2 save`, 수동 절차는 [docs/deploy-friendly.md](../../docs/deploy-friendly.md) "`.env` 변경 후 반드시 `pm2 reload friendly --update-env`".
- **[project-overview](project-overview.md)** — `CLAUDE.md` 6번 규칙이 모노레포 작업 규칙 목록에 합류.
- **보안 감사** — [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 3차 절 LOW #42(CORS)·#44(swagger) — 이번 커밋이 #42 번복 문단을 추가.
- **외부** — `openapi-typescript`(타입 생성)·`openapi-fetch`(README 8절 권장, 기준 URL `https://ninelife.kr`).

소스(위 링크 외): [app.ts](../../apps/friendly/src/app.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [README.md](../../docs/api/README.md), [openapi.json](../../docs/api/openapi.json), [parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts), [routes.ts](../../packages/api-contract/src/routes.ts)(`Routes.Meal.nutrition*`·`Routes.Tarot.cardTexture`)

## API Surface [coverage: high — 14 sources]

### 인증 등급 (x-auth)

| x-auth | endpoints.md 표시 | 스펙 `security` | 판정 근거 | 개수 |
|---|---|---|---|---|
| `public` | 공개 | 없음 | 훅·security 없음 | 83(10-04 엔 84 — 리뷰 Q&A 가 선택으로, 09-26 엔 83) |
| `optional` | 선택 | `[{}, {bearerAuth: []}]` | schema 에 `OPTIONAL_BEARER` 명시 | 16(10-04 엔 15) |
| `user` | 로그인 | `[{bearerAuth: []}]` | `app.authenticate` 훅 또는 security 명시 | 101(10-04 엔 100, 09-26 엔 94) |
| `admin` | (제외) | `[{bearerAuth: []}]` | 경로 prefix 또는 `app.requireAdmin` 훅 | 문서에 없음 |

README 3절의 의미 정의: `선택` = 토큰 없이도 동작하고 유효한 토큰이면 회원 처리(한도 면제·자동 저장·방장 표시), **무효 토큰은 401 이 아니라 게스트**. 로그인 필요 API 는 전부 본인 데이터만(남의 리소스는 403·404). 인증 흐름은 `POST /auth/register`(201 `{ token, user }`, 중복 409) → `POST /auth/login`(200, 틀리면 401) → `Authorization: Bearer`, 갱신(refresh) API 없음, `POST /auth/logout` 은 전 기기 토큰 무효화.

### 도메인(태그)별 엔드포인트 — endpoints.md 절 기준 (2026-10-10, 200개 — 10-04 의 199개에서 settlement-draft +1, 리뷰 Q&A 공개 → 선택; 09-26 의 192개에서 meal +6·tarot +1)

| 태그(절) | 경로 | 계 | 공개 | 선택 | 로그인 | 라우트 한도(IP당) |
|---|---|---|---|---|---|---|
| air-location | `/air/location` | 3 | 0 | 0 | 3 | — |
| air-quality | `/air/*` | 8 | 8 | 0 | 0 | 전부 60/분 |
| auth | `/auth/*` | 4 | 2 | 0 | 2 | 로그인 20/분 · 가입 40/시간 |
| bus | `/bus/*` | 5 | 5 | 0 | 0 | 도착·위치·노선 상세·정류장 검색 60/분(10-05 부터 상세·검색 추가, 주변만 없음) |
| bus-favorite | `/bus/favorites*` | 6 | 0 | 0 | 6 | — |
| food | `/food/*` | 2 | 0 | 0 | 2 | 검색 120/분 · 역검색 60/분 |
| health | `/health` | 1 | 1 | 0 | 0 | — |
| housing | `/housing/*` | 6 | 6 | 0 | 0 | 지도·주변·거래 240/분 · 검색 120/분 · 적재 현황 120/분(10-05, 라우트 로컬) |
| life-map | `/life-map/*` | 6 | 6 | 0 | 0 | 지도·주변 240/분 · 검색 60/분 |
| meal | `/meals*` | 34 | 0 | 0 | 34 | 사진 30/분 · 인식·추천 10/분 · 백업·복원·내보내기 10/시간(내보내기는 10-05) · 영양 점검 30/분 · 영양제 조언 5/분 |
| media | `/media/*` | 2 | 2 | 0 | 0 | — |
| parking | `/parking/*` + `/restaurants/public/:placeId/parking-reviews` | 9 | 9 | 0 | 0 | status 외 240/분 |
| picks | `/picks*` | 6 | 0 | 0 | 6 | — |
| public | `/restaurants/public*`·`/restaurants/ranking`·`/restaurants/:placeId/{clusters,qa,qa/ready}`·`/settings/map/public` | 12 | 11 | 1 | 0 | 스마트 픽 60/분 · 리뷰 Q&A 설정값(10-04 까지 공개·15/분 고정) |
| restaurant-favorite | `/restaurants/favorites*` | 4 | 0 | 0 | 4 | — |
| saju | `/saju-c/*` | 18 | 3 | 8 | 7 | 설정값 7 · 공유 발급 10/분 · 잡 폴링·공유 조회 120/분 |
| saju-g | `/saju-g/*` | 16 | 5 | 3 | 8 | 설정값 2 · 명식 30/분 · 공유 발급·취소 10/분 · 조회·PNG 120/분 |
| sea | `/sea/*` | 2 | 2 | 0 | 0 | 60/분 |
| settlement | `/settlements*`·`/settlement-extraction/*`·`/share/settlements/:token` | 11 | 1 | 0 | 10 | 공유 조회 120/분 · 영수증 업로드·추출 20/분(10-05, 라우트 로컬) |
| settlement-contact | `/me/contacts*` | 3 | 0 | 0 | 3 | — |
| settlement-draft | `/settlement-drafts*` | 4 | 0 | 0 | 4 | —(10-05 `by-place` +1) |
| subway | `/subway/*` | 8 | 8 | 0 | 0 | 도착·위치·시간표 60/분 |
| subway-favorite | `/subway/favorites*` | 6 | 0 | 0 | 6 | — |
| tarot | `/tarot/*` | 7 | 2 | 2 | 3 | 설정값 1 · 공유 발급 10/분 · 조회 120/분 · 카드 텍스처 JPEG 없음 |
| tour | `/tour/public/*` + `/restaurants/public/:placeId/tour-stats` | 6 | 6 | 0 | 0 | 120/분 |
| vote | `/votes*`·`/share/votes/:token*` | 5 | 0 | 2 | 3 | 공유 조회 120/분 · 투표 30/분 |
| weather | `/weather/*` | 6 | 6 | 0 | 0 | 60/분 |
| **합계** | | **200** | **83** | **16** | **101** | |

- 태그 이름은 각 route schema 의 `tags[0]` 이지 경로가 아니다: `saju` = 사주(C)(`/saju-c/*`), `public` = 맛집 공개 읽기 + 지도 공개 설정, 맛집 상세 탭용 `tour-stats`·`parking-reviews` 는 각각 `tour`·`parking` 절에 있다.
- 메서드 분포: GET 118 · POST 44 · DELETE 23 · PUT 12 · PATCH 3. 경로(path) 165개(10-04: GET 117·164경로, 09-26: GET 113 · POST 43 · DELETE 21, 159경로).

### 한도(x-rate-limit) 분포

| 한도 | 개수 | 대표 프리셋 (`RATE`) |
|---|---|---|
| 없음 → 전역 1000/분 | 113(10-04 118) | — (10-05: 한도가 생긴 6개가 빠지고 `by-place` 1개가 더해짐) |
| 60/분 | 26(+2) | `transitRealtime`(대기·날씨·바다·버스/지하철 실시간 + 10-05 버스 노선 상세·정류장 검색), `lifeMapSearch`, `publicPick`, `foodRestaurants` |
| 120/분 | 17(+1) | `tourRead`, `publicShare`(공유 조회·PNG·사주(C) 잡 폴링), `housingSearch`, `foodSearch`, 10-05 `/housing/status`(라우트 로컬 `STATUS_RATE`) |
| 240/분 | 13 | `lifeMapRead` 2, `housingRead` 3, `parkingRead` 8 |
| 설정값/분(`dynamic`) | 11(+1) | 타로 1·사주(C) 7·사주(G) 2·**리뷰 Q&A 1**(10-05) — usage-quota `ipPerMinute` |
| 10/분 | 6 | `tarotShare`(세 운세의 공유 발급 + 사주(G) 공유 취소), `mealRecognize`, `mealRecommend` |
| 30/분 | 6 | `publicVote`, `mealPhotoUpload` 2, 사주(G) 명식 2(인라인 `{ max: 30 }`), `mealNutrition`(2026-10-04) |
| 20/분 | 3(+2) | `authLogin`, 10-05 영수증 업로드·추출(라우트 로컬 `RECEIPT_*_RATE` — 진짜 방어선은 사용자 일일 50) |
| 5/분 | 1 | `mealSupplement`(2026-10-04 — 영양제 조언 POST, 일일 10회가 진짜 방어선) |
| 10/시간 | 3(+1) | `mealDataArchive`(백업·복원 + 10-05 내보내기) |
| 40/시간 | 1 | `authRegister` |
| (15/분) | 0 | 10-04 까지의 `publicAsk`(리뷰 Q&A) — 10-05 설정값으로 |

### 선택 인증 16개 (OPTIONAL_BEARER)

- 사주(C) 8: `POST /saju-c/{readings, themes, ask, daily, match, date-pick, food, shares}`
- 사주(G) 3: `POST /saju-g/{readings, pair/readings, shares}`
- 타로 2: `POST /tarot/{readings, shares}`
- 투표 2: `GET /share/votes/:token`, `PUT /share/votes/:token/ballot`
- **리뷰 Q&A 1(2026-10-05 `ab7dad28`)**: `POST /restaurants/:placeId/qa` — 회원이면 게스트·IP 한도 대신 회원 상한, 게스트는 `x-guest-key`·IP. 태그는 여전히 `public` 절

### 문서에 없는 표면

어드민 `/api/v1/admin/**` 전부(SSE 포함 — README 9절 "서버 푸시(SSE)는 어드민 전용"), 공유 미리보기 HTML·PNG(`/r/:placeId`, `/share/settlements/:token(/image.png)`, `/s/`, `/vote/:token`, `/tarot/s/:token(/image.png)`, `/saju-c/s/…`, `/saju-g/s/:token`), prefix 없는 `/health`(`hide`), robots·sitemap·well-known, `/docs`(dev 전용 UI), 요청 헤더 `x-guest-key`(스키마 미선언 — 스펙 전체에 header 파라미터 0개, README 5·9절에만 설명).

소스: [endpoints.md](../../docs/api/endpoints.md), [openapi.json](../../docs/api/openapi.json), [README.md](../../docs/api/README.md), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts), [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts), [saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts), [vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts), [health.route.ts](../../apps/friendly/src/modules/health/health.route.ts)

## Data [coverage: high — 15 sources]

### 생성물 규모 이력

| 시점 | 엔드포인트(공개·선택·로그인) | openapi.json | endpoints.md | 비고 |
|---|---|---|---|---|
| `1b621c4` 2026-09-24 | 183 (74·15·94) | 신규 51,599줄 | 신규 323줄 | README 243줄 동시 작성 |
| `2ff2c31` 2026-09-25 | **192 (83·15·94)** | +2,320줄 → 53,919줄 | +15/−1 → 337줄 | 주차 9개(공개) 추가, README 는 손대지 않음 |
| `420a6be` 2026-09-26 | 변화 없음 | — | — | 새 라우트 `review-match` 는 어드민 |
| `bfce1f8` 2026-09-26 | 193 (84·15·94) | +26 → 53,945줄 | +2/−1 → 338줄 | 타로 카드 텍스처 JPEG(공개) |
| (`9019cf5` 10-02) | 수 변화 없음 | **재생성 안 함** | — | `schemas/meal.ts` 근거값 enum 에 `typical_portion` — 바로 다음 `162024d` 가 흡수 |
| `162024d` 2026-10-02 | 194 (84·15·95) | +204 → 54,149줄 | → 339줄 | 식단 빠른 추가 `GET /meals/items/frequent` + 위 `typical_portion` |
| `867eb18` 2026-10-04 | 196 (84·15·97) | +113 → 54,262줄 | → 341줄 | 추천 삭제 2(전체·단건 204) |
| `3d067a0` 2026-10-04 | **199 (84·15·100)** | +1,352/−200 → 55,411줄 | → 344줄 | 영양 점검·조언 3, 선호에 `sex`·`birthYear`, 삭제 결과 `nutritionAdvices` |
| `186d2bc` 2026-10-04 | 변화 없음 | +6/−1 → 55,416줄 | — | 달력 응답 `kcal` |
| (`fee9377a`·`8530b41d`·`067d89ed` 10-04) | 수 변화 없음 | → 55,815줄 | — | 여행로그 10~14차 코스 추천 입력·일정표 스키마(`/tour/public/plan` 본문·응답) — 28차 기록 뒤 같은 날 |
| `d07281f0` 2026-10-05 | **200 (83·16·101)** | +224/−68 → 55,971줄 | +17/−16 → 345줄 | 성능 감사 2차 15커밋의 재생성을 **통합 끝에 1회** — 문서만 담은 커밋. README 첫 개정(+28/−13 → 258줄) |
| `007ac899` 2026-10-05 | 변화 없음(재생성 없음) | — | — | README 6절 주차 절 +5줄(263줄) — 라우트·스키마 무변경이라 수기만 |
| `7587b470` 2026-10-05 | 변화 없음 | 1줄 교체(복원 description) → 55,971줄 | — | `a026c6d9`(복원 입구 게이트)의 라우트 설명 변경을 따로 재생성해 담은 문서 커밋 + README 복원 2문장(264줄) |
| `36f07eb3` 2026-10-10 | 변화 없음 | — | — | README 주차 요금 null 1문장(264줄) |

`git log -- docs/api/` 는 14커밋이다(`1b621c4`·`2ff2c31` + 28차 5 + 여행로그 10~14차 3 + 이번 4 — 28차 기록 "7커밋" 이후 10-04 의 달력 kcal 재커밋 `5a306f8d` 도 포함). 28차까지는 전부 "기능 커밋이 같은 커밋에서 재생성" 이었는데,
이번엔 **재생성 전용 문서 커밋이 둘**(`d07281f0`·`7587b470`)이다 — 성능 감사 15커밋을 워크트리 7개에서 따로 만든 뒤 3-way 패치로 통합하면서 재생성을 "통합 끝에
1회" 로 미뤘다(PLAN-perf-2 배포 주의). 그래서 그 사이 커밋(`78ea38a5`~`4710c617`)의 openapi.json 은 코드보다 뒤처져 있었고, 리뷰 반영(`a026c6d9`)도 라우트 설명을
바꾼 뒤 재생성을 `7587b470` 에 따로 담았다. README 는 2026-09-24 첫 커밋 이후 10-05 에 처음 바뀌었다.

### openapi.json 구조 (2026-09-26 실측, `node` 로 집계 — 2026-10-04 재집계는 각 줄 끝 "→")

- `openapi: "3.0.3"`, `info = { title: 'Life Pickr API', version: '0.0.1', description }`, `servers: [{ url: 'https://ninelife.kr' }]`, 최상위 키는 `openapi·info·servers·paths·components` 5개(`tags` 없음).
- `components.securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`, **`components.schemas` 0개** — 모든 요청·응답 스키마가 op 안에 인라인이라 1.96MB 가 됐다.
- paths 159 · operations 192, 192개 전부 `summary` 가 있고 57개는 `description` 도 있다. → paths 164 · operations 199, 199개 전부 summary, description 63개(새 라우트 7개 중 6개가 description 보유 — 최근 조언 GET 만 없음). → (2026-10-10 재집계) paths 165 · operations 200, 200개 전부 summary, description **70개**(`da4c4d85` 시점 64 — 여행로그 10~14차 몫 포함 — 에서 성능 감사가 설명을 단 기존 op·새 `by-place` 로 +6).
- 요청 본문은 전부 `application/json`(55개 op) — multipart 업로드 2개(`POST /meals/photos`, `POST /settlement-extraction/upload`)는 본문을 선언하지 않고 description 에 적었다. → 57개(+`DELETE /meals/recommendations` 확인 문구 · `POST /meals/nutrition/advice`).
- 응답 코드 선언: 200 186 · 201 4 · 204 2 · 404 13 · 502 26 · 503 40(응답 content type 은 전부 `application/json`). → 200 192 · 201 4 · **204 3** · 404 13 · 502 26 · 503 40. → (10-10) 200 193 · 201 4 · 204 3 · **404 14**(대기 측정소 시계열) · 502 26 · 503 40 — 성능 감사가 새로 만든 409·413·429·503 응답(기록 상한·HEIC 해상도·지하철 IP 한도·쿨다운)은 **응답 스키마로 선언되지 않고** description 문장에만 있다(라우트가 `response` 에 코드를 더하지 않았다).
- **2xx 응답 스키마가 없는 op 21개**(200 `Default Response` 만): 이미지 6(`/meals/photos/:token`·`/thumb`, `/media/panorama/:placeId`, `/media/thumbnail`, `/saju-g/shares/:token/image.png`, `/settlement-extraction/preview/:token`), 업로드 2, 실제로는 204 를 돌려주는 삭제·로그아웃 12(`POST /auth/logout`, `DELETE /me/contacts/:id`·`/picks/:id`·`/saju-c/me/profiles/:id`·`/saju-c/me/readings/:id`·`/saju-g/me/profiles/:id`·`/saju-g/me/readings/:id`·`/saju-g/shares/:token`·`/settlement-drafts/:id`·`/settlements/:id`·`/settlements/:id/share`·`/tarot/me/readings/:id`), `/health` 1. 204 를 스키마에 선언한 건 식단 2개(`DELETE /meals/:id`, `DELETE /meals/photos/:token`)뿐. → **22개**: 이미지 7(+`GET /tarot/cards/:cardId/texture.jpg` — `reply.type('image/jpeg')` 인데 200 응답 스키마가 없다). 204 선언은 식단 3개(+`DELETE /meals/recommendations/:id`, 본문 스키마 `enum ["null"]`). 반대로 전체 삭제 `DELETE /meals/recommendations` 는 200 + `{ deleted: { recommendations, recommendationEvents } }` 를 선언 — 식단 쪽은 새 라우트도 응답 스키마를 빠짐없이 단다.
- 재귀 스키마 한계: `GET /restaurants/public/:placeId/category-tree` 의 `children` 이 `items: {}`(zod → JSON Schema 변환이 재귀를 못 풀어 any) — README 9절이 명시.

### endpoints.md 형식

머리말 5줄(기준 URL `https://ninelife.kr` · 합계 "엔드포인트 192개 — 공개 83 · 선택 인증 15 · 로그인 94"(→ 2026-10-04 "엔드포인트 199개 — 공개 84 · 선택 인증 15 · 로그인 100" → 2026-10-05 "엔드포인트 200개 — 공개 83 · 선택 인증 16 · 로그인 101") · 인증/한도/입력 열 읽는 법) + 태그 27절 × 표 `| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |`. 설명 열은 summary 원문이라 "무엇 — 원천·캐시·한도·특이 응답" 형태가 그대로 보인다(예: `단기예보(격자, 시간별·일별) — 기상청 단기예보 API 프록시, 다음 발표까지 캐시`).

### README.md 9절 (수기, 243줄 → 2026-10-10 264줄 — 절 구성은 그대로, 4·5·6절 내용만 개정: Architecture §6-1)

1 기준 URL(운영 `https://ninelife.kr` + `/api/v1` 경로, Cloudflare → nginx → friendly:3000; 로컬 `http://localhost:3000`; 버전 정책 없음 — 변경은 openapi.json git diff 로) · 2 CORS · 3 인증(3등급 표·가입/로그인 흐름·JWT 7일·refresh 없음·logout 전 기기·401 메시지 2종·웹 토큰은 origin 별 localStorage 라 공유 안 됨) · 4 요청/응답 규약(JSON, 쿼리 문자열 자동 변환, 에러 본문, 상태 코드 표 400~503, 공공 API 프록시의 `stale: true`, 키 미설정은 `enabled: false` 200) · 5 한도(IP당 레이트리밋 표 + 운세 일일 한도 표 + 식단 인식 30/일·추천 20/일) · 6 도메인 개요(대중교통·생활 정보 / 지도 데이터 / 맛집 / 운세 / 개인 기록) · 7 데이터 출처·이용 조건(공공누리 유형, 여행로그 원본 제3자 제공 금지·집계만, 크롤 데이터 대량 재게시 금지, LLM·공공 API 비용은 이 서버 부담) · 8 타입 쓰기(`npx openapi-typescript` + `openapi-fetch`) · 9 알려진 한계.

### 관련 env

| 키 | 기본값 | 쓰임 |
|---|---|---|
| `CORS_ORIGIN` | `*` | 어드민 외 허용 origin — 비-dev 에서만, `*`·빈 값 = 전부, 콤마 목록 = 그 목록 |
| `PUBLIC_ORIGIN` | `https://ninelife.kr` | 어드민 CORS 허용 origin · export 의 `servers`/endpoints.md 기준 URL · (원래) OG/canonical |
| `NODE_ENV` | `development` | dev 면 CORS 전부 허용·`/docs` 등록, test 면 레이트리밋 미등록 |
| `JWT_EXPIRES_IN` | `7d` | README 3절 "토큰 7일" |

소스: [openapi.json](../../docs/api/openapi.json), [endpoints.md](../../docs/api/endpoints.md), [README.md](../../docs/api/README.md), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [env.ts](../../apps/friendly/src/config/env.ts), 204 실측은 [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts)·[contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)·[picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts)·[saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts)·[saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts)·[settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)·[settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts)·[tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) 의 `reply.code(204)`, 선언된 204 는 [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts)

## Key Decisions [coverage: high — 16 sources]

- **2026-10-05: 큰 묶음 작업은 재생성을 "통합 끝에 1회", 수기 README 는 묶음마다 합친다** (`d07281f0`) — 성능 감사 7묶음(15커밋)을 워크트리마다 만들고 3-way 패치로
  통합하면서 자동 생성물은 마지막에 한 번 다시 뽑고(PLAN-perf-2 "외부 API 계약 변화 — export:openapi 재생성(통합 끝에 1회)"), 묶음마다 쓴 README 문장은 손으로
  합쳤다("충돌은 수기 문서 docs/api/README.md 1곳만 — 양쪽 내용 합침"). 대가로 중간 커밋의 openapi.json 은 코드보다 뒤처진다 — "기능 커밋이 같은 커밋에서 재생성"
  관례(2026-09-25)의 의도적 예외. 리뷰 반영(`a026c6d9`)도 같은 방식으로 문서 커밋 `7587b470` 을 따로 냈다.
- **2026-10-05: 외부 호환을 깨는 계약 변경(동반 enum)도 받아들이고 README 에 명시** (`78ea38a5` → `d07281f0`) — README 1절이 "호환을 깨는 변경에 대한 정책은 없으니
  openapi.json 의 git diff 로 확인" 이라 버전을 올리지 않고 6절 여행로그에 "원본 표기 8가지(openapi.json 의 enum)만 받는다. 그 밖의 값은 400" 한 줄로 알렸다.
- **2026-10-05: 비용 한도 거부는 에러가 아니라 200 안내 — 리뷰 Q&A 도 운세와 같은 외부 계약** (`ab7dad28`) — 한도 초과·미준비·일시 장애를 `confidence: "none"`
  안내문 200 으로 돌려 외부 클라이언트가 답변 카드를 그대로 그리게 했다(식단 인식·추천·영양제 조언·영수증 추출의 일일 한도는 429 — 개인 기능은 에러, 공개 LLM 은
  폴백이라는 갈림이 유지된다).
- **2026-10-05: 회원 한도 문구는 상수에서 만든다** (`78cbb457`) — 라우트 description 이 `MEMBER_LIMIT_LABEL`(= `MEMBER_PER_DAY` 로 만든 문장)을 끼워, 상수를 바꾸고
  재생성하면 외부 문서가 따라간다. 수기 README 는 "기능별 하루 100회" 를 숫자로 적어 상수와 따로 움직인다.
- **2026-09-26~10-04: 재생성 동반 관례 유지, 단 "라우트를 바꾼 커밋만"** — `bfce1f8`·`162024d`·`867eb18`·`3d067a0`·`186d2bc` 5커밋이 모두 본문에 "docs/api 재생성(N개)" 를 적고 같은 커밋에 실었다. 반면 라우트 없이 응답 zod 만 바꾼 `9019cf5` 는 재생성하지 않았다 — 규칙(CLAUDE.md 6번)의 문구가 "비-어드민 **라우트**를 추가·변경하면" 이라 스키마만 바꾼 커밋은 사람이 놓치기 쉽다(Gotchas 4).
- **2026-09-26: 앱 전용 이미지 라우트도 `/api/v1` 공개 표면에 둔다** (`bfce1f8`) — 타로 카드 텍스처는 앱 3D 무대가 유일한 소비자지만 별도 경로·숨김(`hide`) 없이 일반 공개 라우트로 만들어 외부 문서에 실렸다. 한국어 summary·description("그림이 아직 없는 카드는 404")도 다른 라우트와 같은 규약으로 달았다. 카드 id 는 계약 `TarotCardId` zod 로 검증해 뒷면(`back`)·경로 조작은 400.
- **2026-09-25: 문서 재생성은 기능 커밋에 함께 싣고, 업스트림 폴러는 `onListen` 에서만** (`2ff2c31`) — 주차 기능 커밋이 `docs/api` 를 같이 재생성했다(183→192, openapi +2,320줄). 같은 커밋이 실시간·충전기 폴러를 `onReady` 가 아니라 `onListen` 에 걸었다 — `export:openapi` 처럼 `app.ready()` 만 하는 스크립트와 `app.inject()` 테스트가 공공 API 를 부르지 않게(코드 주석). 문서 생성이 "앱을 실제로 부팅" 하는 방식이라 생긴 부팅 단계 규율이다.
- **2026-09-24: 운영 CORS 를 어드민 외 `*` 로 개방 — 감사 #42 의 fail-closed 번복** (`1b621c4`, 사용자 결정) — 근거는 코드 주석과 PLAN 번복 문단: 인증은 `Authorization: Bearer` 헤더뿐이고 쿠키 세션이 없어, `credentials:false` 로 두면 #42 가 걱정한 "모든 사이트가 사용자 세션으로 호출" 이 성립하지 않는다. `'*'` + credentials 조합은 브라우저가 거부하기도 하고, 나중에 쿠키가 생겨도 타 사이트가 그 쿠키로 호출하지 못하게 미리 막아 둔다. **남는 위험은 비용**(LLM·업스트림 쿼터 소진 — 방문자 브라우저마다 IP 가 달라 IP당 한도가 약해짐)이고, 트래픽을 보고 `CORS_ORIGIN` 목록으로 좁힌다. 번복은 [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 3차 "수정" 절의 CORS 항목 밑에 들여쓴 문단으로 기록됐다.
- **2026-09-24: 어드민만 예외 — `PUBLIC_ORIGIN` 만, 퍼센트 인코딩까지 판정** — 웹은 API 와 같은 origin 이라 CORS 가 원래 필요 없고 어드민을 외부 origin 에 열 이유가 없다(방어심층). 전제는 "어드민 라우트는 SSE 포함 전부 `/api/v1/admin` 아래" 라는 불변식 — [public-admin-route-split](../concepts/public-admin-route-split.md) 의 "prefix 가 가드의 유일한 신호" 가 이제 인증 가드뿐 아니라 CORS 정책 선택·OpenAPI 등급·외부 문서 제외까지 하나의 `isAdminPath` 로 결정한다.
- **2026-09-24: preflight 캐시 600초·레이트리밋 헤더 4종 노출** — 캐시는 "정책을 좁혔을 때 10분 안에 반영되도록 짧게"(주석). `x-ratelimit-limit/remaining/reset`·`retry-after` 를 `Access-Control-Expose-Headers` 로 열어 외부 JS 가 잔량·재시도 시각을 읽게 했다. 요청 헤더는 목록을 두지 않고 반사(`x-guest-key` 같은 새 헤더도 설정 없이 통과).
- **2026-09-24: 스펙 생성기는 전 환경, `/docs` UI 는 dev 전용 유지** — #44("`/docs` + 전체 OpenAPI 가 prod 무인증 노출")의 결론(`bc2db00` 에서 swagger 를 dev 에서만 등록)은 지키면서, 생성기 등록만 모든 환경으로 풀어 export 스크립트·테스트가 운영과 같은 코드 경로로 스펙을 뽑게 했다. 외부 공개는 HTTP 가 아니라 **어드민을 뺀 파일을 리포에 커밋**하는 방식.
- **2026-09-24: 인증 수준·한도는 사람이 쓰지 않고 transform 이 추론** — 훅(`authenticate`/`requireAdmin`)·`config.rateLimit`·경로에서 자동으로 싣고, 사람이 쓰는 건 한국어 `summary`/`description` 과 훅으로 보이지 않는 선택 인증의 `OPTIONAL_BEARER` 뿐. 라우트 표기와 실제 가드가 어긋날 여지를 줄이려는 선택.
- **2026-09-24: 수기 README + 자동 색인·스펙의 분업** — 인증 흐름·에러 계약·한도·이용 조건(공공누리·AI 허브 제3자 제공 금지·크롤 데이터 재게시 주의)·알려진 한계는 코드에서 뽑을 수 없어 수기로, 라우트 목록·스키마는 자동으로. endpoints.md 는 머리말에 "직접 수정하지 말 것" 을 박았다.
- **2026-09-24: 외부 문서의 범위 = `/api/v1/` 아래 비-어드민** — 공유 미리보기 HTML(사람이 여는 링크)·robots·sitemap·well-known 은 API 가 아니라 제외하고, SSE 는 전부 어드민이라 자연히 빠진다.
- **2026-09-24: 한국어 summary 규약** — 비-어드민 라우트가 있는 route 파일 32개의 `schema` 에 "무엇 — 원천·캐시·한도·특이 응답" 꼴의 한 줄 `summary`(192개 op 전부 보유)와, 행동 규칙이 긴 경우 `description`(57개)을 달았다. schema 필드만 바꿔 동작 변경이 없다(`1b621c4` diff 의 삭제 줄은 한 줄 `schema: {…}` 를 여러 줄로 편 것뿐). 규칙화: `CLAUDE.md` 6번.
- **2026-09-24: 앱 연결 테스트는 `src/app.*.test.ts`** — `src/plugins/` 는 autoload·tsup 이 파일을 통째로 플러그인으로 잡으므로 테스트를 둘 수 없다(Architecture §7). `app.cors.test.ts` 는 `vi.hoisted` 로 `CORS_ORIGIN='*'`·`PUBLIC_ORIGIN='https://ninelife.kr'` 을 env 파싱 전에 넣어, 로컬 `.env` 의 dev 용 목록이 아니라 운영 기본값으로 비-dev 분기(테스트는 `NODE_ENV=test`)를 검증한다.
- **2026-09-24: 429 본문도 공통 계약에 맞춘다** (`678ecc0`) — 평객체의 `error` 문자열을 쓰도록 한 줄 분기. 회귀 테스트는 에러 핸들러만 붙인 맨 `Fastify()` 에 평객체를 던지는 방식 — 레이트리밋 플러그인이 테스트에서 미등록이라 실제 429 를 만들 수 없어서다. 같은 파일이 "Error 계열 4xx 는 error = 예외 이름" 도 고정한다.
- **2026-09-24: `.env.example` 기본값을 `CORS_ORIGIN=*` 로** — 이전 예시값 `http://localhost:5173,http://localhost:8081` 을 운영에 그대로 복사했다면 개방이 적용되지 않는다(Gotchas 1).
- (이력) **2026-07-13 `bc2db00`** — 감사 3차가 #42 를 "prod 에서 `*`/미설정이면 `PUBLIC_ORIGIN` 으로 폐쇄" 로, #44 를 "swagger `/docs`+스펙 prod 미등록" 으로 처리했다. 이번 라운드가 #42 는 번복(개방 + credentials false), #44 는 UI 만 유지·생성기는 전 환경으로 바꿨다.

소스: [cors.ts](../../apps/friendly/src/plugins/cors.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts), [app.errors.test.ts](../../apps/friendly/src/app.errors.test.ts), [app.cors.test.ts](../../apps/friendly/src/app.cors.test.ts), [PLAN-perf-security.md](../../docs/PLAN-perf-security.md), [CLAUDE.md](../../CLAUDE.md), [parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [.env.example](../../apps/friendly/.env.example), [README.md](../../docs/api/README.md), [endpoints.md](../../docs/api/endpoints.md), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [tsup.config.ts](../../apps/friendly/tsup.config.ts)

## Gotchas [coverage: high — 36 sources]

1. **운영 `.env` 의 `CORS_ORIGIN` 이 목록이면 개방되지 않는다** — 비-dev 는 목록이 있으면 그 목록만 허용한다. 운영 `.env` 가 옛 `.env.example`(`http://localhost:5173,http://localhost:8081`)에서 복사됐다면 외부 origin 은 계속 막힌다 → `*` 로 바꾸거나 줄을 지우고(기본 `*`) [deploy.sh](../../deploy.sh) 5번(".env만" = `pm2 reload friendly --update-env`) 로 반영, 기동 로그 `CORS: 어드민 외 모든 origin 허용, 어드민은 https://ninelife.kr 만` 으로 확인. [deploy-friendly.md](../../docs/deploy-friendly.md) 의 "환경 변수" 절은 `CORS_ORIGIN` 을 언급하지 않는다(작업 기록상 운영 확인 미완 ⚠️).
2. **dev 와 운영의 CORS 동작이 다르다** — dev 는 `CORS_ORIGIN` 목록을 무시하고 전부 `*`, 어드민은 요청 origin 을 반사한다. "로컬에서 되니 운영도 된다" 로 판단하면 운영 목록·어드민 제한을 놓친다. 반대로 테스트(`NODE_ENV=test`)는 운영 분기를 탄다 — 로컬 `.env` 의 `CORS_ORIGIN` 이 dev 목록이면 `buildApp` 테스트의 결과가 달라지므로 `app.cors.test.ts` 처럼 import 전에 env 를 고정해야 한다([vitest.config.ts](../../apps/friendly/vitest.config.ts) 는 `.env` 를 읽되 이미 있는 값은 덮지 않는다).
3. **수기 README 가 주차 추가를 따라가지 못했다** — *(2026-10-05~10 갱신: 주차 절은 `007ac899`·`36f07eb3` 가 6절에 더했고, 성능 감사 변경은 `d07281f0` 이 4·5·6절에 반영했다
   — Architecture §6-1. 그래도 남은 것: ① 파일 표 "(183개)" — 실제 200 ② 5절 대표값 표 "리뷰 Q&A 15/분" — 이제 `설정값`(기본 15)이고, 240/분 행 대상("일상지도·집값
   지도 조회")에 주차 조회가 없다 ③ 영양제 조언 일일 10회·429 미기재(아래 ①) ④ 9절 이미지 응답에 타로 텍스처 JPEG 없음 ⑤ `Cache-Control` 은 6절 여행로그(300초)만 —
   같은 날 공개 맛집 목록(`max-age=30, stale-while-revalidate=300`)·상세 계열(60초 + swr)·메뉴 칼로리 판정 완료(600초)·집값 status·일상지도 status/crime(300초)·주차
   status/airports(60초)에도 붙었는데 헤더라 openapi 에도 없다.)* 원래 서술(09-26): [README.md](../../docs/api/README.md) 파일 표는 여전히 "엔드포인트 색인 … (183개)" 이고, 5절 한도 표(240/분 = "일상지도·집값 지도 조회")와 6절 도메인 개요에 **주차(`/parking/*`) 가 없다** — `2ff2c31` 이 endpoints.md·openapi.json 만 재생성하고 README 를 고치지 않았다(현재 192개, `parkingRead` 240/분). **(2026-10-04 확대)** 이후 재생성 5회도 README 를 건드리지 않아 표는 여전히 "(183개)"(실제 199), 그리고 새로 빠진 것: ① 4절 상태 코드 표 429 행(`식단 인식·추천 일일 한도 초과`)과 5절 "일일 사용량 한도" 끝 문장에 **영양제 조언**(`POST /meals/nutrition/advice`, 사용자당 하루 `MEAL_SUPPLEMENT_DAILY_LIMIT` 기본 10회 — 같은 날·같은 점검이면 저장본이라 미차감, 초과 429)이 없다 ② 6절 식단 개요(`/meals/*`: 끼니 기록·달력·통계·선호, "사진 인식은 비전 LLM, 추천은 텍스트 LLM")에 영양소 점검(LLM 없음)·영양제 조언(텍스트 LLM)이 없다 ③ 9절 "이미지 응답(썸네일·파노라마·식단 사진·공유 PNG)" 에 타로 카드 텍스처 JPEG 가 없다 ④ 5절 대표 한도 표엔 5/분(`mealSupplement`)이 없다(대표값 표라 필수는 아님).
4. **재생성은 전적으로 수동** — `.github` 워크플로·git 훅·lint-staged 가 없고 turbo 파이프라인에도 export 태스크가 없다. `app.openapi.test.ts` 는 transform 주석(x-auth·x-rate-limit·security)만 검사하고 **커밋된 `docs/api` 와 코드의 일치는 아무도 검사하지 않는다**. 비-어드민 라우트를 바꾸고 `export:openapi` 를 잊으면 외부 문서가 조용히 낡는다(`420a6be` 는 수동으로 "변화 없음" 확인). summary 를 빠뜨린 새 라우트도 막는 장치가 없다 — 현재 192개 전부 summary 가 있는 건 규율의 결과. **(2026-10 실제 사례)** 라우트는 그대로 두고 응답 zod 만 바꾼 `9019cf5`(10-02, `MealNutritionBasis` 에 `typical_portion`)는 재생성을 빠뜨렸고, 같은 날 다음 기능 커밋 `162024d` 의 재생성이 흡수했다 — 그 사이 커밋된 openapi.json 은 응답 enum 값 하나가 모자랐다(같은 파일을 고친 `e3afe9c` 는 상수만이라 스펙 무관 — "스키마 파일을 고쳤다" 와 "스펙이 바뀐다" 가 늘 같지는 않다). HEAD(199개, 199개 전부 summary)는 코드와 일치한다(`b09e0a4` 는 웹만). **(2026-10-05 두 번째 사례 — 의도된 지연)** 성능 감사 15커밋은 재생성을 통합 끝 `d07281f0` 으로 미뤄 `78ea38a5`~`4710c617` 사이의 커밋된 openapi.json 은 동반 enum·`by-place`·리뷰 Q&A 선택 인증이 빠진 상태였다. 2026-10-10 HEAD(200개, 전부 summary)는 코드와 일치하는 것으로 보인다 — PLAN-perf-2 가 main 위로 옮긴 뒤 "docs/api 재생성 결과 커밋본과 같음" 을 확인했고, 그 뒤 비-어드민 라우트 설명을 바꾼 `a026c6d9` 는 `7587b470` 이 재생성분을 담았으며 나머지(`878e6bb9` 어드민 라우트·`04dbab58`·`fe0d59ab`·`36f07eb3` 서비스)는 스펙 무관이다(이번 라운드는 export 를 다시 돌려 대조하지 않았다).
5. **export 결과가 로컬 `.env` 에 좌우된다** — `servers` 와 endpoints.md 의 기준 URL 은 실행 환경의 `PUBLIC_ORIGIN` 이다. 로컬 `.env` 에서 `PUBLIC_ORIGIN` 을 바꿔 두고 재생성하면 커밋되는 외부 문서의 기준 URL 이 바뀐다. `tsx --env-file=.env` 라 `.env` 가 없으면 실패하고, env 스키마 검증(`JWT_SECRET` 32자 등)과 `DATABASE_URL` 연결을 거친다. 앱을 실제로 부팅하므로 `onReady` 훅(housing 스케줄러 start·군집 리컨실 예약)이 돈다 — 새 백그라운드 작업을 `onReady` 에 걸면 export·inject 테스트에서도 실행된다(주차가 `onListen` 을 쓴 이유).
6. **`src/plugins/` 에 테스트를 두면 앱이 그 파일을 플러그인으로 로드한다** — autoload 기본 패턴에 테스트 제외가 없고 tsup entry 가 `src/plugins/*.ts` 전체라 dist 에도 빌드된다. 앱 전체를 띄우는 테스트는 `src/app.*.test.ts`, 모듈 단위는 `modules/<domain>/*.test.ts`(route 만 autoload 되는 `matchFilter` 가 있어 안전).
7. **x-auth 는 훅 함수 identity 로 추론** — `onRequest: [app.authenticate]` 처럼 decorator 를 그대로 넣어야 `user` 로 잡힌다. 래퍼 함수로 감싸거나 플러그인 단위 `addHook` 을 쓰면 훅이 안 보여 `public` 으로 문서화된다 → schema 에 `security` 를 명시(picks). 선택 인증 라우트가 `OPTIONAL_BEARER` 를 빠뜨려도 `public` 이 된다. 반대로 문서 등급과 실제 가드는 서로를 검증하지 않는다.
8. **선택 인증 구현이 두 가지** — 타로·사주(C)·사주(G) 13개는 `resolveOptionalUser`(서명·만료 + DB `tokenVersion` 대조 — 로그아웃된 토큰은 게스트), 투표 2개는 route 파일의 `optionalUserId`(`req.jwtVerify()` 만 — tokenVersion 미대조). 투표 쪽은 `isOwner` 표시용이라 접근 제어 영향은 없지만, README 3절의 "무효 토큰은 게스트" 가 투표에선 "서명·만료만 본다" 는 뜻이다.
9. **스펙이 실제 응답과 다른 곳** — (a) 204 를 돌려주는 삭제·로그아웃 12개가 스펙엔 `200 Default Response`(스키마 없음)로 나온다 — `openapi-fetch` 로 상태별 타입 분기를 하면 어긋난다(204 를 선언한 건 식단 삭제 2개뿐). (b) 이미지 6개(→ 2026-09-26 `bfce1f8` 타로 카드 텍스처 JPEG 로 7개)·업로드 2개·`/health` 는 2xx 응답에 content 자체가 없다 — 이미지 MIME(`image/jpeg`·`image/png`)도 업로드 응답(사진 토큰)의 모양도 스펙에 안 나온다(README 9절은 이미지만 언급). (c) `x-guest-key` 헤더가 스키마에 없다. (d) 재귀 `children` 은 `items: {}`. (e) `components.schemas` 가 비어 있어 `openapi-typescript` 결과에 이름 있는 스키마 타입이 없다 — `paths['/api/v1/…']['get']['responses']['200']…` 로 꺼내야 한다.
10. **태그 이름과 경로가 다르다** — endpoints.md 절 `saju` 는 `/saju-c/*`(사주(C)), `public` 은 맛집 공개 읽기 + `/settings/map/public`, 맛집 상세 탭용 `/restaurants/public/:placeId/tour-stats`·`/parking-reviews` 는 `tour`·`parking` 절에 있다. 경로로 찾으려면 openapi.json 을 검색한다.
11. **(추정) 사주(G) 공유 PNG 가 운영 nginx 에서 정적 location 에 가로채일 수 있다** — docs/api 는 `GET /api/v1/saju-g/shares/:token/image.png` 를 공개 엔드포인트로 나열하고, `saju-g-preview.ts` 도 OG 이미지를 `${origin}${Routes.SajuG.shareImage(token)}`(= 이 `/api/v1` 경로)로 준다. 그런데 리포의 [nginx 설정](../../ops/nginx/niney_life_pickr_v2_projects) ninelife.kr 블록은 `location /api/` 가 `^~` 없는 일반 prefix 이고 뒤에 `location ~* \.(js|css|png|…)$`(정적 캐시)가 있다 — nginx 는 정규식 location 이 `^~` 없는 prefix 보다 우선하므로, [deploy-friendly.md](../../docs/deploy-friendly.md) 가 정산·타로·사주(C) 공유 이미지에 대해 스스로 설명한 "`.png` 로 끝나는 경로는 `^~` 필수(dev OK / prod 404)" 함정에 그대로 해당한다. 같은 문서와 nginx 주석은 "사주(G) PNG 는 기존 /api 프록시를 사용한다" 고 적었다. `.png` 로 끝나는 `/api/v1` 경로는 이 하나뿐. 운영 실측은 하지 않았다 — 실제 서버 설정이 리포와 같다면 `location ^~ /api/` 로 바꾸는 게 해법.
12. **개방 뒤의 비용 노출면** — CORS 는 브라우저만 막으므로 서버·curl 호출은 원래 가능했지만, 개방으로 **임의 웹사이트가 방문자 브라우저를 통해** 호출할 수 있게 됐고 요청 IP 가 방문자마다 흩어져 IP당 한도의 억제력이 약하다. LLM 을 부르는 외부 표면: 선택 인증 `POST /restaurants/:placeId/qa`(임베딩 1 + LLM ≤3콜 — *2026-10-04 까지는 캐시 없음·일일 한도 없이 IP당 15/분이었고, 10-05 `ab7dad28` 부터 같은 질문 20분 캐시·진행 중 합류·`review-ask` 일일 한도(게스트 30·IP 300·전역 3,000, 회원 100)·LLM 동시 4*), 선택 인증 타로·사주의 생성 계열 POST(usage-quota 전역 일일 예산이 상한), 로그인 식단 인식·추천(사용자당 30·20/일), **(2026-10-04)** 로그인 영양제 조언 `POST /meals/nutrition/advice`(kimi-k3 1콜 — 추론을 켜면 더 길다, 사용자당 10/일·IP당 5/분, 같은 날·같은 점검은 저장본), 로그인 `POST /settlement-extraction/extract`(비전 LLM 1콜 — 10-04 까지는 라우트 한도도 일일 한도도 없어 전역 1000/분만이었고, 10-05 `622bfca2` 부터 IP당 20/분 + 사용자 하루 50회(`SETTLEMENT_EXTRACT_DAILY_LIMIT`, 초과 429) — README 6절도 고쳐졌다; 가입은 IP당 40/시간). 운세는 회원도 2026-10-05 부터 기능별 하루 100회라 "무료 가입 계정 하나로 전역 예산 소진" 경로가 막혔다(`78cbb457`). 반대로 다른 프로젝트가 **자기 서버를 거쳐** 호출하면 그 서버 IP 하나로 합산돼 금방 429 가 난다(README 5절).
13. **던진 5xx 는 500 으로 뭉개진다** — 전역 핸들러는 `statusCode < 500` 만 그대로 돌려준다. README 4절 표의 502/503 은 라우트가 `replyUpstreamError` 로 직접 응답할 때만 나온다 — 새 공공 API 프록시가 `httpErrors.serviceUnavailable()` 을 던지면 외부엔 `500 Something went wrong` 으로 보인다. **(2026-10-05 실제 사례)** README 4절 503 행·식단 절이 약속한 "식단 백업·복원 대기 초과 503" 과 사진 업로드 description 의 "HEIC 변환 대기열이 가득하면 503" 은 `meal.route.ts` 의 `throw app.httpErrors.serviceUnavailable(...)`(백업 게이트 `busy`·복원 입구 `busy()`·HEIC `busy`)라 운영 응답이 500 이다 — 영수증 HEIC 대기(`settlement-extraction.route` `busy`)와 **사주(G) 공유 PNG 렌더 대기**(`GET /saju-g/shares/:token/image.png` — `78cbb457` 의 렌더 동시 1 게이트가 `ShareRenderBusyError` 를 내면 `serviceUnavailable` 을 던진다; 타로·사주(C)·정산 미리보기는 같은 에러를 직접 처리)도 같은 경로를 탄다. 복원 입구 테스트(`meal-restore-intake.test`)는 앱 에러 핸들러를 붙이지 않은 맨 Fastify 에서 503 을 확인해 이 차이를 못 본다. 외부 클라이언트는 500 도 "잠시 뒤 재시도" 로 다뤄야 한다.
14. **429 의 end-to-end 경로는 테스트되지 않는다** — 레이트리밋 플러그인이 테스트에서 미등록이라 실제 헤더(`x-ratelimit-*`·`retry-after`)와 429 본문의 결합은 실구동에서만 확인된다. `app.cors.test.ts` 도 `access-control-expose-headers` 문자열만 본다.
15. **`/docs` 는 dev 에서 어드민까지 전부 보여 준다** — prod·test 는 404(테스트 고정)지만 dev 서버를 외부에 노출하면 전체 표면(어드민 포함)이 무인증으로 보인다. 외부 공유는 `docs/api/` 파일로만.
16. **리뷰 Q&A description 이 회원 한도를 틀리게 적는다(2026-10-05~)** — `POST /restaurants/:placeId/qa` 의 description(openapi.json·endpoints.md 원천 [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts))은 "회원(Bearer)은 전역 일일 예산만 적용된다" 인데, 같은 날 `78cbb457` 의 `MEMBER_PER_DAY = 100` 이 `review-ask` 를 포함한 모든 usage-quota 기능에 회원 1인 하루 상한을 건다(README 5절은 "기능별 하루 100회" 로 맞다). 타로·사주 라우트는 `MEMBER_LIMIT_LABEL` 을 끼워 맞췄지만 이 라우트만 문자열을 손으로 적었다.
17. **새 409·413·429 는 스펙의 응답 코드에 없다** — 성능 감사가 만든 식단 기록 상한 409·HEIC 해상도 413·지하철 IP 한도 429·영수증 일일 429·게스트 공유 하루 429 는 description 문장에만 있고 `responses` 에 선언되지 않았다(스펙 전체 409·413·429 선언 0개). `openapi-typescript` 로 만든 타입엔 이 응답 본문 타입이 없으니 공통 에러 본문(README 4절)으로 처리한다.
18. **낡은 서술 주의** — [PLAN-perf-security.md](../../docs/PLAN-perf-security.md) 의 "감사에서 제외/이미 처리됨" 목록(`dev CORS 전체 반사: isDev 게이팅 + prod allowList — 정상`)과 진행 기록 "3차 완료 — CORS prod fail-closed" 는 계획·당시 기록이고, 현행은 3차 절의 2026-09-24 번복 문단이다. [friendly](friendly.md) 토픽의 CORS 서술(2026-05-28 RFC1918 자동 허용, "2026-05-31 갱신"(커밋 `9be2e10`, 2026-05-30)의 dev 전면 반사·비-LAN warn, `credentials: true`, "production 은 env `CORS_ORIGIN` list 로 엄격 차단")도 `1b621c4` 이전 상태다.

소스(위 링크 외): [cors.ts](../../apps/friendly/src/plugins/cors.ts), [.env.example](../../apps/friendly/.env.example), [app.cors.test.ts](../../apps/friendly/src/app.cors.test.ts), [app.openapi.test.ts](../../apps/friendly/src/app.openapi.test.ts), [env.ts](../../apps/friendly/src/config/env.ts), [endpoints.md](../../docs/api/endpoints.md), [openapi.json](../../docs/api/openapi.json), [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts), [housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts), [summaries.ts](../../apps/friendly/src/plugins/summaries.ts), [parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts), [app.ts](../../apps/friendly/src/app.ts), [tsup.config.ts](../../apps/friendly/tsup.config.ts), [swagger.ts](../../apps/friendly/src/plugins/swagger.ts), [picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts), [jwt.ts](../../apps/friendly/src/plugins/jwt.ts), [vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts), [auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts), [saju-g-preview.ts](../../apps/friendly/src/modules/saju-g/saju-g-preview.ts), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts), [error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts), [reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts)

## Sources [coverage: high — 74 sources]

외부 문서(생성물·수기):
- [docs/api/README.md](../../docs/api/README.md) — 수기 가이드 9절(기준 URL·CORS·인증·에러·한도·도메인 개요·이용 조건·타입 쓰기·한계). 264줄 — 2026-10-05 첫 개정(성능 2차·주차 절·복원 재시도), 10-10 주차 요금 null. 파일 표의 "183개"·5절 "리뷰 Q&A 15/분" 은 낡음, 영양제 조언 한도·타로 텍스처·대부분의 `Cache-Control` 미반영.
- [docs/api/endpoints.md](../../docs/api/endpoints.md) — 자동 색인, 200개(공개 83·선택 16·로그인 101), 태그 27절, 345줄(2026-10-05 `d07281f0`).
- [docs/api/openapi.json](../../docs/api/openapi.json) — 자동, OpenAPI 3.0.3, 55,971줄, paths 165, description 70, `components.schemas` 0(통째로 읽지 말 것 — node 로 집계).

2026-10-05~10-10 재생성·개정분의 원천:
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — "외부 API 계약 변화 — export:openapi 재생성(통합 끝에 1회)"·README 충돌 1곳 수기 합침·배포 체크리스트·"docs/api 재생성 결과 커밋본과 같음".
- [apps/friendly/src/modules/settlement/settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts) — 새 op `GET /settlement-drafts/by-place`·목록 메타·PUT 결과·합계 2MB 409(`622bfca2`).
- [apps/friendly/src/modules/usage-quota/usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) — `review-ask` 기본값·`MEMBER_PER_DAY`·`MEMBER_LIMIT_LABEL`(라우트 description 이 끼워 쓰는 회원 한도 문구).
- [apps/friendly/src/modules/meal/meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts) / [meal-restore-intake.ts](../../apps/friendly/src/modules/meal/meal-restore-intake.ts) / [meal-restore-intake.test.ts](../../apps/friendly/src/modules/meal/meal-restore-intake.test.ts) — 기록 상한·백업/복원 description, 던진 503(운영 500)·맨 Fastify 테스트.
- [apps/friendly/src/modules/media/media.route.ts](../../apps/friendly/src/modules/media/media.route.ts) — 썸네일 버킷 스냅·502·503 `Retry-After` 를 `reply.code()` 로 직접(던지지 않음).
- [apps/friendly/src/modules/weather/weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts) — 중기 화이트리스트 400·`replyUpstreamError` 쿨다운 503.
- [apps/friendly/src/modules/tour/tour-public.route.ts](../../apps/friendly/src/modules/tour/tour-public.route.ts) — 공개 GET `Cache-Control: public, max-age=300`·동반 enum 파라미터.
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — 공개 목록·상세·메뉴 칼로리 `Cache-Control`(README 미기재).
- [packages/api-contract/src/schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts) / [settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) / [sea.ts](../../packages/api-contract/src/schemas/sea.ts) — 스펙 변화의 계약 원천(동반 enum·임시저장 메타/단건·물때 refine — refine 은 스펙에 안 나옴).

2026-09-26~10-04 재생성분의 원천:
- [apps/friendly/src/modules/meal-nutrition/meal-nutrition.route.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition.route.ts) — *NEW(`3d067a0`)*: `GET /meals/nutrition`(`RATE.mealNutrition`)·`GET`/`POST /meals/nutrition/advice`(`RATE.mealSupplement`, 일일 한도 초과 429), summary·description.
- [apps/friendly/src/modules/tarot/tarot-card-texture.ts](../../apps/friendly/src/modules/tarot/tarot-card-texture.ts) — *NEW(`bfce1f8`)*: 웹 자산 webp → 384px JPEG, LRU 80 — 라우트는 [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) `T.cardTexture`.
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Tarot.cardTexture`·`Routes.Meal.{frequentItems, nutrition, nutritionAdvice}`·추천 삭제 경로.
- [packages/api-contract/src/schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts) — 기존 식단 op 15개 스키마 변화의 원천(`MealNutritionBasis` `typical_portion`·선호 `sex`/`birthYear`·삭제 결과 `nutritionAdvices`·달력 `kcal`).
- (기존 목록의) [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts) — `GET /meals/items/frequent`(`162024d`), [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts) — 추천 삭제 2(`867eb18`), [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE` 22개.

생성·정책 코드:
- [apps/friendly/scripts/export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts) — 추출 스크립트(`/api/v1/`·비-어드민 필터, info/servers 교체, endpoints.md 표 생성).
- [apps/friendly/src/plugins/swagger.ts](../../apps/friendly/src/plugins/swagger.ts) — 전 환경 스펙 생성기, transform(`authOf`·`rateLimitOf`), `OPTIONAL_BEARER`, `/docs` dev 전용.
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — `isAdminPath`·`buildCorsPolicy`·`delegator`, credentials false, 노출 헤더·preflight 600초.
- [apps/friendly/src/plugins/error-handler.ts](../../apps/friendly/src/plugins/error-handler.ts) — 공통 에러 본문 4분기, 429 평객체 `error` 보존(`678ecc0`).
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `RATE` 20개·전역 1000/분·`clientKey`·429 builder·테스트 미등록.
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `authenticate`·`resolveOptionalUser`(tokenVersion)·`requireAdmin`, 401/403 메시지.
- [apps/friendly/src/lib/reply-upstream-error.ts](../../apps/friendly/src/lib/reply-upstream-error.ts) — 502/503/404 를 같은 본문 모양으로 직접 응답.
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — plugins autoload(필터 없음)·modules `.route` 필터·미리보기 7경로 명시 등록·`trustProxy`.
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts) — `CORS_ORIGIN` 기본 `*`(주석)·`PUBLIC_ORIGIN`·`JWT_EXPIRES_IN`·`isDev/isTest`.
- [apps/friendly/.env.example](../../apps/friendly/.env.example) — `CORS_ORIGIN=*` + 주석 3줄(이전 localhost 목록).
- [apps/friendly/package.json](../../apps/friendly/package.json) — `export:openapi` 스크립트.
- [apps/friendly/tsup.config.ts](../../apps/friendly/tsup.config.ts) — entry `src/plugins/*.ts`(테스트 금지 근거).
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts) — `include: src/**/*.test.ts`, `.env` 로드(기존 값 유지).

테스트:
- [apps/friendly/src/app.cors.test.ts](../../apps/friendly/src/app.cors.test.ts) — 7건: 어드민 판정(퍼센트 인코딩)·정책(dev/`*`/목록/빈 값)·실제 preflight·응답 헤더.
- [apps/friendly/src/app.openapi.test.ts](../../apps/friendly/src/app.openapi.test.ts) — 5건: `/docs` 비-dev 404·public/optional(dynamic)/user(picks 포함)/admin(SSE 포함) 주석.
- [apps/friendly/src/app.errors.test.ts](../../apps/friendly/src/app.errors.test.ts) — 2건: 429 평객체 `error` 유지·Error 계열 4xx 는 예외 이름.

규칙·결정 문서:
- [CLAUDE.md](../../CLAUDE.md) — 6번 "외부 API 문서(`docs/api/`)".
- [docs/PLAN-perf-security.md](../../docs/PLAN-perf-security.md) — 3차 LOW #42·#44, 2026-09-24 번복 문단, 3차 완료 기록.
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — `location /api/` 예시·`.png` 정규식 우선 함정·`.env` 변경 후 reload.
- [deploy.sh](../../deploy.sh) — 5번 ".env만" = `pm_reload`.
- [ops/nginx/niney_life_pickr_v2_projects](../../ops/nginx/niney_life_pickr_v2_projects) — `/api/` 프록시(^~ 없음)·정적 정규식 location.
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts) — dev `/api` 프록시(웹은 CORS 무관).
- [TECH_STACK.md](../../TECH_STACK.md) — `@fastify/swagger`+`swagger-ui`·`fastify-type-provider-zod`·`@fastify/cors` 스택 표.

선택 인증·판정 예시와 부팅 훅:
- [apps/friendly/src/modules/tarot/tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) — `OPTIONAL_BEARER` 2·`actorOf`·함수 max(dynamic).
- [apps/friendly/src/modules/saju/saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts) — 사주(C) 선택 인증 8.
- [apps/friendly/src/modules/saju-g/saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts) — 사주(G) 선택 인증 3·인라인 30/분.
- [apps/friendly/src/modules/saju-g/saju-g-preview.ts](../../apps/friendly/src/modules/saju-g/saju-g-preview.ts) — OG 이미지를 `/api/v1/saju-g/shares/:token/image.png` 로.
- [apps/friendly/src/modules/vote/vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts) — 선택 인증 2·`optionalUserId`.
- [apps/friendly/src/modules/picks/picks.route.ts](../../apps/friendly/src/modules/picks/picks.route.ts) — 플러그인 단위 인증 훅 + security 명시.
- [apps/friendly/src/modules/health/health.route.ts](../../apps/friendly/src/modules/health/health.route.ts) — `/api/v1/health` summary, `/health` `hide`.
- [apps/friendly/src/modules/auth/auth.route.ts](../../apps/friendly/src/modules/auth/auth.route.ts) — logout 204(스펙은 200).
- [apps/friendly/src/modules/parking/parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts) — 폴러 `onListen`(export 대비 주석), 주차 9개.
- [apps/friendly/src/modules/housing/housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts) — `onReady` 스케줄러 start · 2026-10-05 `/housing/status` 로컬 `STATUS_RATE` 120/분·`Cache-Control` 300초.
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) — `onReady` 군집 리컨실 예약.
- [apps/friendly/src/modules/review-clustering/review-clustering.service.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.service.ts) — `scheduleStartupReconcile`(`setTimeout(...).unref()`).
- [apps/friendly/src/modules/review-search/review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts) — 공개 Q&A summary/description·어드민 SSE 핸들러 내 인증 · 2026-10-05: 선택 인증(`askActorOf`)·`review-ask` 함수 max(`dynamic`)·한도 거부 200 — description 의 "회원은 전역 예산만" 은 낡음.
- [apps/friendly/src/modules/restaurant/restaurant.route.ts](../../apps/friendly/src/modules/restaurant/restaurant.route.ts) — `420a6be` 변경은 어드민(`review-match`)뿐 → 재생성 불필요.
- [packages/api-contract/src/schemas/restaurant.ts](../../packages/api-contract/src/schemas/restaurant.ts) — `420a6be` 스키마 변경도 어드민 쪽(`RestaurantDetail`·`AdminVisitorReview`·`RestaurantReviewMatch*`).
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — 영수증 추출(10-04 까지 라우트 한도·일일 한도 없음 → 10-05 로컬 `RECEIPT_*_RATE` 20/분·사용자 일일 50·HEIC 대기 503 을 던짐).

`1b621c4` 에서 summary·description 을 단 나머지 route 파일 21개(동작 변경 없음): [air-location.route.ts](../../apps/friendly/src/modules/air-quality/air-location.route.ts), [air-quality.route.ts](../../apps/friendly/src/modules/air-quality/air-quality.route.ts), [bus.route.ts](../../apps/friendly/src/modules/bus/bus.route.ts), [bus-favorite.route.ts](../../apps/friendly/src/modules/bus/bus-favorite.route.ts), [contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts), [food.route.ts](../../apps/friendly/src/modules/food/food.route.ts), [life-map.route.ts](../../apps/friendly/src/modules/life-map/life-map.route.ts), [meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts), [meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts), [meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts), [media.route.ts](../../apps/friendly/src/modules/media/media.route.ts), [restaurant-favorite.route.ts](../../apps/friendly/src/modules/restaurant/restaurant-favorite.route.ts), [review-clustering.route.ts](../../apps/friendly/src/modules/review-clustering/review-clustering.route.ts), [sea.route.ts](../../apps/friendly/src/modules/sea/sea.route.ts), [map.route.ts](../../apps/friendly/src/modules/settings/map.route.ts), [settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts), [settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts), [subway.route.ts](../../apps/friendly/src/modules/subway/subway.route.ts), [subway-favorite.route.ts](../../apps/friendly/src/modules/subway/subway-favorite.route.ts), [tour-public.route.ts](../../apps/friendly/src/modules/tour/tour-public.route.ts), [weather.route.ts](../../apps/friendly/src/modules/weather/weather.route.ts).

관련 컨셉: [public-admin-route-split](../concepts/public-admin-route-split.md)(어드민 prefix 가 CORS·문서 등급까지 결정) · [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)(zod → OpenAPI → 외부 타입) · [anonymous-usage-quota](../concepts/anonymous-usage-quota.md)(개방 뒤 비용 상한) · [sse-token-auth](../concepts/sse-token-auth.md)(쿠키 없는 인증 — credentials false 의 전제) · [server-only-boot-effects](../concepts/server-only-boot-effects.md)(export 스크립트도 `buildApp` 을 부팅 — 폴러는 `onListen`) · [amplification-caps](../concepts/amplification-caps.md)(2026-10-05 성능 감사가 외부 계약에 더한 상한 — 동반 enum·기록 상한·투표자 100·임시저장 2MB) · [quota-proportional-loading](../concepts/quota-proportional-loading.md)(업스트림 쿼터를 오퍼레이션별로 나누고 실패 쿨다운 — README 6절의 쿼터 문단).
