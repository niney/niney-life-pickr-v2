---
topic: usage-quota
last_compiled: 2026-10-10
sources_count: 46
status: active
aliases: [usage-quota, 사용량 한도, 익명 한도, 게스트 한도, UsageQuotaService, UsageQuotaSetting, UsageQuotaCounter, USAGE_QUOTA_DEFAULTS, remainingForGuest, guestCutoffPct, ipPerMinute, X-Guest-Key, guestKeyStore, getGuestKey, setGuestKeyStorage, guest-key-v1, useUsageQuotaOverview, useUpdateUsageQuota, AdminQuotasPage, tarot-reading, saju-reading, saju-g-reading, resolveOptionalUser, kstToday, usage-quota-gc, review-ask, 맛집 리뷰 질문 한도, MEMBER_PER_DAY, MEMBER_LIMIT_LABEL, member_daily, 회원 하루 100회, 회원 일일 상한, persistKeyIfMissing, 게스트 키 저장 버그, REVIEW_ASK_GUEST_KEY_HEADER, admit, constants.ts]
---

# usage-quota — 로그인 없이 쓰는 비용성 기능의 공용 익명 사용량 한도

**2026-10-05 변경 흡수 — 회원 일일 상한·feature `review-ask`·게스트 키 저장 고침(`78cbb457`·`ab7dad28`·`d71fdb08`, 어드민 폴링 `c5052742`, 상수 이동 `da755684`)**: (1) **회원 기능별 하루 100회**(`78cbb457`, PLAN-perf-2 7차 F-4 · 결정 8) — `consume` 이 회원이면 전역 통과 뒤 `user` scope 를 `MEMBER_PER_DAY`(코드 상수 100, `null` 이면 예전처럼 무제한) 상한으로 원자 증가하고, 막히면 전역 증가분을 되돌리고 `{allowed:false, reason:'member_daily', remainingToday:null}`. 2026-09-02 "회원은 한도 없음" 결정의 변경이다 — 이메일 인증 없는 무료 계정 하나가 사주 라우트 7개(라우트별 분당 저장소라 합 140/분/IP)로 전역 3,000을 약 21분에 태워 그날 모든 게스트·회원을 정적으로 밀어낼 수 있었다(실측: 3,001번째부터 거부). 어드민 설정·스키마는 그대로라 화면에서 보이지도 바꾸지도 못한다. 소비처 라우트 설명은 `MEMBER_LIMIT_LABEL`("개인 일일 한도 기능별 100회")로 외부 API 문서를 따라가게 했다(리뷰 질문만 빠짐 — Gotchas). (2) **feature 4종**(`ab7dad28`, B-4) — 공개 맛집 리뷰 질문(RAG, 캐시 미스 1건 = 임베딩 1 + LLM 최대 3콜)이 `review-ask`(게스트 30·IP 300·분당 15·전역 3,000·컷 90%)로 들어왔다. enum 확장만(마이그레이션 없음), 소비는 서비스 `deps.quota` 가 아니라 라우트가 넘기는 `admit` 콜백(캐시 미스로 파이프라인을 실제로 돌릴 때만)이고, 거부는 정적 풀이 대신 confidence `"none"` 안내 답변 200([review-search](review-search.md)). (3) **게스트 키가 저장되지 않던 버그**(`d71fdb08`) — zustand `persist` 는 저장분이 없을 때 초기 상태를 쓰지 않는데 `guestKeyStore` 는 `set` 을 부르는 곳이 없어, 2026-09-03 도입 이후 **한 번도 저장되지 않았다** — 웹은 새로고침마다(앱은 실행마다) 새 키라 게스트 기기 일일 한도가 사실상 IP 일일 한도로만 걸렸다. 복원이 끝났을 때 저장분이 없으면 지금 키를 한 번 써 두는 `persistKeyIfMissing`(동기 localStorage 는 `hasHydrated()` 즉시, 앱 AsyncStorage 는 `onFinishHydration`) + 테스트 3건. (4) **어드민 사용량 폴링**(`c5052742`) — `useUsageQuotaOverview(date)` 는 오늘(date 미지정)만 30초 폴링, 지난 날짜는 `refetchInterval: false`(테스트 1건 추가). (5) **헤더 상수**(`da755684`) — `TAROT_GUEST_KEY_HEADER`·`SAJU_GUEST_KEY_HEADER`·`SAJU_G_GUEST_KEY_HEADER`·새 `REVIEW_ASK_GUEST_KEY_HEADER` 가 zod 없는 [constants.ts](../../packages/api-contract/src/constants.ts) 로. (6) **이전 흡수 누락분** — 2026-09-26 앱 타로·사주(C)가 네이티브가 되어 앱은 더 이상 WebView 에 게스트 키를 주입하지 않고 shared `getGuestKey()` 로 헤더를 직접 붙인다(웹의 임베드 주입 경로는 호환용으로만 남음). 같은 묶음의 게스트 공유 IP 하루 200(`lib/guest-share.ts`)은 이 모듈이 아니라 각 공유 서비스의 메모리 장부다([tarot](tarot.md)).

**2026-09-02 타로 1차(`cd5a29b`)에서 태어난 횡단 모듈.** 타로 리딩이 "로그인 없이 무료" 로 결정되면서 Ollama Cloud 호출 비용을 막을 장치가 필요했고, [meal](meal.md) 의 `MealDailyQuotaService`(회원 userId 기준 일일 카운터) 를 **feature × scope(global / ip / guest / user) × KST 날짜** 로 일반화해 `apps/friendly/src/modules/usage-quota/` 로 분리했다. 같은 날 4차(`fae8190`)에서 어드민 "설정 > 사용량 한도" 탭과 기본 한도 상향(5/60/6/300/80% → 50/500/20/5000/90%)이 들어왔고, 2026-09-06 사주(C)(`f8e5dd0`) 가 `saju-reading`, 사주(G) 리베이스(`e40b4c0`) 가 `saju-g-reading` 을 더해 **feature 3종**이 한 서비스·한 어드민 탭을 공유했다(→ 2026-10-05 `review-ask` 로 4종, 위). 한도에 걸려도 429 가 아니라 각 기능이 **정적 해석으로 강등**해 항상 응답한다. 패턴은 [anonymous-usage-quota](../concepts/anonymous-usage-quota.md), 요청 하나의 증폭률을 묶는 성능 감사 2차의 다른 상한들과의 관계는 [amplification-caps](../concepts/amplification-caps.md).

## Purpose [coverage: high — 10 sources]

무인증 공개 라우트에서 LLM 을 호출하는 기능(타로 해석·사주(C) 풀이·사주(G) 해석·→ 2026-10-05 맛집 리뷰 질문)의 **하루 호출 수를 네 층(+ 회원 일일)으로 제한**하고, 값을 어드민이 런타임에 조정하게 하는 단일 진입점. 회원과 게스트를 다르게 다룬다(사용자 결정 2026-09-02, 회원 부분은 2026-10-05 변경).

| 층 | 대상 | 설정 키 | 의미 |
|---|---|---|---|
| IP 분당 버스트 | 전원(회원 포함) | `ipPerMinute` | `@fastify/rate-limit` 의 `max` 를 설정 캐시에서 읽는 **함수**로 — 폭주 클라이언트 방어라 회원에게도 적용 |
| 전역 일일 예산 | 전원 | `globalPerDay` + `guestCutoffPct` | LLM 예산 안전망. 게스트는 예산의 `guestCutoffPct`% 에서 먼저 끊기고 회원은 100% 까지 |
| IP 일일 | 게스트만 | `ipPerDay` | 게스트 키 재생성 우회를 보완. CGNAT(한 IP 뒤 다수 사용자) 고려 게스트 기기의 10배 |
| 게스트 기기 일일 | 게스트만 | `guestPerDay` | `X-Guest-Key` 헤더(기기 영속 UUID) 기준. 없으면 `ip:<addr>` 로 대체 |
| 회원 일일(2026-10-05~) | 회원만 | 코드 상수 `MEMBER_PER_DAY`(100) | feature 별 회원 1인 하루 상한, `user` scope. 어드민 설정 없음 |

회원은 기기·IP 일일 한도를 **면제**받고 전역 예산 + 회원 일일 상한만 소비한다. ~2026-10-04 은 `user` scope 를 통계용으로만 셌고(한도 없음) → 2026-10-05(`78cbb457`) 같은 카운터에 `MEMBER_PER_DAY` 상한이 걸렸다(`null` 이면 예전 동작). `enabled=false` 면 전원 `disabled`. 값 0 은 "제한 없음"(`ipPerMinute` 제외, 최소 1). 행이 없으면 코드 기본값 `USAGE_QUOTA_DEFAULTS` — env 키는 두지 않는다([db-config-env-fallback](../concepts/db-config-env-fallback.md) 계열이되 env 폴백 없이 코드 상수).

| feature | 기본값 (게스트/IP일일/IP분당/전역/컷%) | 근거 |
|---|---|---|
| `tarot-reading` | 50 / 500 / 20 / 5000 / 90 | `fae8190` — "정상 사용자가 걸리지 않게, 비용이 문제면 어드민에서 내린다" |
| `saju-reading`(사주(C)) | 30 / 300 / 20 / 3000 / 90 | `f8e5dd0` — 전체 풀이 1건 = LLM 4호출(섹션 병렬)이라 전역 예산을 낮게. 오늘·궁합·택일·음식도 1건씩 |
| `saju-g-reading`(사주(G)) | 20 / 200 / 10 / 1000 / 90 | `1c60ad8`→`e40b4c0` — 별도 구현이라 카운터도 분리 |
| `review-ask`(맛집 리뷰 질문) | 30 / 300 / 15 / 3000 / 90 | `ab7dad28`(2026-10-05) — 캐시 미스 1건 = 임베딩 1 + LLM 최대 3콜. 분당은 기존 공개 질문 한도 15/분 그대로, 일일은 사주와 같은 수준에서 시작 |

회원 일일 상한은 네 feature 공통 100(feature 별로 따로 센다).

의존하는 곳: [tarot](tarot.md)·[saju-c](saju-c.md)·[saju-g](saju-g.md) 의 service(소비)와 route(분당 버스트), [review-search](review-search.md) 의 공개 질문 라우트(2026-10-05, 소비·분당 버스트 모두 라우트), 웹 어드민 `AdminQuotasPage`, shared `guestKeyStore`(게스트 키 발급·보관). 앱은 ~2026-09-25 WebView 임베드로 게스트 키를 주입했고 → 2026-09-26 네이티브 화면부터 shared `getGuestKey()` 를 직접 쓴다.

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts), [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md), [docs/PLAN-saju.md](../../docs/PLAN-saju.md), [meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts), [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md)

## Architecture [coverage: high — 15 sources]

### UsageQuotaService — 카운터·설정 (friendly)
[usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) 한 클래스. 생성자 `(prisma, { now?, settingsTtlMs? })` — 테스트가 시각 고정·캐시 해제에 쓴다.

- **설정** — `listSettings()` / `getSetting(feature)` 는 `usage_quota_settings` 전체를 읽어 feature 별 `Map` 으로 **30초 캐시**(`settingsTtlMs` 기본 30_000). 행이 없는 feature 는 `USAGE_QUOTA_DEFAULTS` 로 채우고 `updatedAt: null`. `updateSetting(feature, patch, updatedById)` 는 upsert(create 는 기본값 + patch) 후 `invalidate()`.
- **소비 `consume(feature, actor)`** — 순서는 **전역 → [게스트만] IP 일일 → 게스트 키 일일 / [회원만] 회원 일일**. 각 단계는 `consumeOne` 한 문장 원자 SQL(아래)이고, 뒤 단계가 막히면 앞 단계 증가분을 `release`(count-1, best effort)로 되돌린다. 회원은 전역 통과 후 `user` scope 를 ~2026-10-04 무제한(`limit null`) 증가하고 끝났고, → 2026-10-05 `consumeOne(feature, 'user', userId, date, MEMBER_PER_DAY)` 가 실패하면 전역을 되돌리고 `member_daily` 로 거부한다. 반환 `UsageQuotaDecision { allowed, reason, remainingToday }` — `reason` 은 `disabled | global_budget | guest_cutoff | ip_daily | guest_daily | member_daily`(2026-10-05 추가), `remainingToday` 는 게스트의 기기 일일 잔여(회원·무제한이면 null — 회원 잔여는 화면에 내지 않는다는 주석).
- **회원 상한 상수** — `MEMBER_PER_DAY: number | null = 100`(feature 별, 2026-10-05) · `MEMBER_LIMIT_LABEL`(null 이면 "개인 일일 한도 없음", 아니면 "개인 일일 한도 기능별 100회") — 타로·사주(C)·사주(G) 라우트 `description` 이 끼워 써서 상수를 바꾸면 OpenAPI 문서도 따라간다.
- **`consumeOne`** — `INSERT … ON CONFLICT(feature, scope, key, date) DO UPDATE SET count = count + 1 WHERE count < ${limit}` 의 변경 행 수가 1이면 통과. `limit === null` 이면 WHERE 없이 증가만, `limit <= 0` 이면 행도 만들지 않고 거부. 호출부가 `guestPerDay/ipPerDay/globalPerDay` 의 0 을 null(무제한)로 바꿔 넘기므로 실제로 0 이 도달하는 건 `guestCutoffPct=0` 의 전역 게스트 한도뿐.
- **`remainingForGuest(feature, actor, setting?, date?)`** — 소비 없이 잔여만(캐시 히트 응답 표시용). 회원 null, `enabled=false` 0, `guestPerDay<=0` null, 그 외 `max(0, guestPerDay - used)`.
- **집계 `usage(feature, date)`** — 그날 카운터를 scope 별 합계(`global/guestTotal/ipTotal/userTotal`) + 상위 10 키(`topGuests/topIps`)로.
- **정리 `cleanup(olderThanDays=30)`** — `date < KST(cutoff)` 행 삭제. `today()` / `kstToday()` 는 `toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })` 로 `yyyy-mm-dd`.

### 플러그인 — app 싱글턴 + GC cron
[plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts) 가 `app.usageQuota` 로 decorate(`dependencies: ['prisma']`). 설정 캐시를 기능 라우트(소비)와 어드민 라우트(편집·무효화)가 **같은 인스턴스**로 공유해야 저장이 즉시 반영된다 — [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 인스턴스. [schedule](schedule.md) 의 `scheduleRegistry.setCron('usage-quota-gc', '40 4 * * *', 'Asia/Seoul')` 로 매일 04:40 `cleanup()`, `onClose` 에서 `clearCron`. 타입 선언은 플러그인 파일 안의 `declare module 'fastify'`([types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) 에는 `resolveOptionalUser` 만).

### 소비처 공통 패턴 — actorOf + 함수형 rate-limit
세 기능 라우트(→ 2026-10-05 리뷰 질문 `askActorOf` 까지 넷)가 같은 모양으로 `UsageQuotaActor { userId, guestKey, ip }` 를 만든다: `app.resolveOptionalUser(req)`([plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — 유효 토큰이면 회원, 무효·부재면 null, 401 아님) + `X-Guest-Key` 헤더를 `/^[A-Za-z0-9_-]{8,64}$/` 로 검증(형식 밖이면 null → IP 대체) + `clientKey(req)`([plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `CF-Connecting-IP` 우선, 없으면 `req.ip`). LLM 을 부르는 POST 는 `config.rateLimit.max` 를 `async () => (await app.usageQuota.getSetting(feature)).ipPerMinute` 로 둬 어드민 값이 분당 버스트에도 반영된다. 헤더 상수는 ~2026-10-04 [schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) 의 `TAROT_GUEST_KEY_HEADER='x-guest-key'`(saju 는 재export, saju-g 는 같은 값의 자체 상수)였고 → 2026-10-05(`da755684`) 넷 다 zod 없는 [constants.ts](../../packages/api-contract/src/constants.ts) 에 있다 — `SAJU_GUEST_KEY_HEADER = REVIEW_ASK_GUEST_KEY_HEADER = TAROT_GUEST_KEY_HEADER`, `SAJU_G_GUEST_KEY_HEADER` 는 여전히 같은 문자열의 별도 상수(웹 엔트리의 리뷰 질문 API 클라이언트가 값으로 쓰므로 스키마 파일에 두면 zod 가 첫 로드에 실린다). 리뷰 질문 라우트는 소비를 서비스에 맡기지 않고 `service.askByPlaceId(placeId, query, { admit })` 의 `admit` 콜백 안에서 `app.usageQuota.consume('review-ask', actor)` 를 부른다 — 답변 캐시 히트·진행 중 합류면 `admit` 이 불리지 않아 소비 없음, 거부면 콜백이 안내 답변(`quotaDeniedAnswer(reason)` — `disabled` / 전역·컷 "오늘은 질문이 많아…" / 그 밖(IP·기기·회원) "오늘 질문할 수 있는 횟수를 모두 썼어요")을 돌려 파이프라인을 건너뛴다.

### 게스트 키 — shared 스토어 + 앱 주입
[guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts): zustand persist `guest-key-v1`(version 1), 첫 생성 시 `crypto.randomUUID()`(없으면 `c-<ts>-<rand>`). **재생성 API 를 두지 않는다** — 한도 우회를 UI 가 부추기지 않게. 저장소는 [injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts) 의 지연 위임 어댑터로, 웹은 localStorage 자동·앱은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 에서 `setGuestKeyStorage(AsyncStorage)`. 훅 밖에서는 `getGuestKey()`. **저장 시점**: 2026-10-05(`d71fdb08`) 전에는 persist 가 `set` 이 불릴 때만 쓰는데 이 스토어엔 `set` 호출이 없어 키가 한 번도 저장되지 않았다(웹은 새로고침마다, 앱은 실행마다 새 키). 지금은 `persistKeyIfMissing` 이 복원 직후 스토리지에 저장분이 없으면 현재 키를 `setState` 로 한 번 써 둔다 — 동기 localStorage 는 스토어 생성 순간 복원이 끝나 `hasHydrated()` 면 즉시, 앱은 AsyncStorage 주입 뒤 `bindRehydrate` 가 다시 복원하므로 `onFinishHydration` 리스너로(주입 전 no-op 스토리지에는 써도 남지 않음), 스토리지가 막힌 환경(프라이빗 모드)은 그 세션의 키만. 앱 WebView 임베드(~2026-09-25)는 [embedBridge.ts](../../packages/shared/src/embedBridge.ts) 의 `window.__LP_EMBED__ { token, guestKey }` 로 앱이 보관한 키를 주입하고 웹 [main.tsx](../../apps/web/src/main.tsx) 가 부팅 시 `useGuestKeyStore.setState` 해 앱과 WebView 가 같은 기기로 잡혔다(그 키도 앱 실행마다 바뀌었다 — 위 버그). → 2026-09-26 앱 타로·사주(C)가 네이티브가 되어 주입 경로를 여는 앱 화면은 없고, 앱은 같은 shared 스토어를 직접 읽는다([mobile](mobile.md)).

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts), [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts), [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [constants.ts](../../packages/api-contract/src/constants.ts), [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts)(+[test](../../packages/shared/src/stores/guestKeyStore.test.ts)), [injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts), [embedBridge.ts](../../packages/shared/src/embedBridge.ts), [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)

## Talks To [coverage: high — 17 sources]

**다운스트림(이 모듈이 의존):**
- `prisma` — `usageQuotaSetting` / `usageQuotaCounter`(raw SQL `$executeRaw` 로 카운터 증감).
- `scheduleRegistry`([schedule](schedule.md)) — GC cron 등록.
- `app.resolveOptionalUser`(jwt) · `clientKey`(rate-limit) — 소비처가 actor 를 만들 때. 서비스 자체는 둘을 모르고 `UsageQuotaActor` 만 받는다.

**업스트림(소비처)** — feature 당 하나의 service 가 `deps.quota` 로 주입받는다:
- [tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts) `TAROT_QUOTA_FEATURE='tarot-reading'` — `resolveBody`: 캐시 히트면 `remainingForGuest` 만, 미스면 `consume` → allowed 면 LLM, 아니면 정적 해석(`source:'static'`). 회원 오늘의 카드(`dailyLockKey`) 재반환은 한도 소비 없음. 응답 `quota.remainingToday`. 라우트 [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) 의 `POST /tarot/readings` 가 함수형 `ipPerMinute`. 상세 [tarot](tarot.md).
- [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts) `SAJU_QUOTA_FEATURE='saju-reading'` — 전체 풀이는 섹션 4개 캐시 미스가 하나라도 있으면 **1건** 소비 후 병렬 job, 전부 캐시면 미소비. `daily`/`match`/`datePick`/`food` 도 캐시 미스 시 각 1건. 회원 오늘 운세 잠금(`dailyLockKey`) 재반환 미소비. [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts) 는 POST 5개에 같은 `quotaRate`. 상세 [saju-c](saju-c.md).
- [saju-g.service.ts](../../apps/friendly/src/modules/saju-g/saju-g.service.ts) · [saju-g-pair.service.ts](../../apps/friendly/src/modules/saju-g/saju-g-pair.service.ts) `'saju-g-reading'` — provider 가 해석(resolved+model)될 때만 `consume`; 거부면 `fallbackReason:'quota'` + 기본(basic) 리포트. 결과 캐시 키가 `owner:requestKey`(owner = `user:<id>` | `guest:<key|ip>`)라 사용자 간 캐시 공유가 없다. [saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts) 의 `readings`·`pairReading` 이 함수형 `ipPerMinute`. 상세 [saju-g](saju-g.md).
- [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts) `REVIEW_ASK_FEATURE='review-ask'`(2026-10-05, `ab7dad28`) — 공개 `POST` 질문 라우트가 `askActorOf`(옵셔널 인증 + `REVIEW_ASK_GUEST_KEY_HEADER` 정규식 검증 + `clientKey`)로 actor 를 만들고, 함수형 `rateLimit.max = getSetting('review-ask').ipPerMinute`, 소비는 [review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts) `askByPlaceId` 에 넘기는 `admit` 콜백(답변 LRU 20분·진행 중 합류·LLM 동시 4 를 지난 실제 파이프라인 직전). 거부면 confidence `"none"` 안내 답변 200. 상세 [review-search](review-search.md).
- **같은 묶음의 이웃 상한(이 모듈 밖)** — 게스트 공유 발급 IP 하루 200(타로·사주(C)·사주(G) 서비스의 `GuestShareLedger`, 초과 429)은 카운터가 DB 가 아니라 메모리라 이 모듈에 넣지 않았다([tarot](tarot.md)).

**FE 경계:** [usage-quota.api.ts](../../packages/shared/src/api/usage-quota.api.ts) → [useUsageQuota.ts](../../packages/shared/src/hooks/useUsageQuota.ts) → 웹 [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx)(어드민). 게스트 키는 [useTarot.ts](../../packages/shared/src/hooks/useTarot.ts)·[useSaju.ts](../../packages/shared/src/hooks/useSaju.ts) 의 mutation 이 `getGuestKey()` 를 각 `*.api.ts` 에 넘겨 헤더로 붙인다(→ 2026-10-05 리뷰 질문도 [useReviewSearch.ts](../../packages/shared/src/hooks/useReviewSearch.ts)·[reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts) 가 `reviewSearchApi.publicAsk(placeId, query, getGuestKey())`). 타입은 [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) 단일 출처([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)). LLM provider 해석은 각 기능이 [ai](ai.md) 의 `AiConfigService` 로 — 이 모듈은 LLM 을 모른다.

## API Surface [coverage: high — 12 sources]

[routes.ts](../../packages/api-contract/src/routes.ts) 의 `UsageQuota` namespace. 둘 다 `app.authenticate + app.requireAdmin`.

| 메서드 · 경로 | 용도 | 계약 |
|---|---|---|
| `GET /api/v1/admin/quotas?date=` | 모든 feature 의 설정 + 그날 사용량(생략 시 KST 오늘) | `UsageQuotaOverviewQuery` → `UsageQuotaOverview { date, items: [{ setting, usage }] }` |
| `PUT /api/v1/admin/quotas/:feature` | feature 하나의 설정 부분 갱신(upsert) | `UpdateUsageQuotaSettingInput`(`UsageQuotaSetting` 에서 feature·updatedAt 뺀 partial) → `UsageQuotaSetting`. enum 밖 feature 는 400 |

**스키마 바운드**: `guestPerDay`·`ipPerDay` 0~100_000, `ipPerMinute` 1~10_000, `globalPerDay` 0~1_000_000, `guestCutoffPct` 0~100, 전부 int. `UsageQuotaFeature = z.enum(['tarot-reading', 'saju-reading', 'saju-g-reading', 'review-ask'])`(→ 2026-10-05 `review-ask` 추가). 회원 상한은 스키마·설정 행에 없다(코드 상수).

**서비스 export**: `UsageQuotaService`, `USAGE_QUOTA_DEFAULTS`, `USAGE_QUOTA_FEATURES`, `kstToday`, → 2026-10-05 `MEMBER_PER_DAY`·`MEMBER_LIMIT_LABEL`, 타입 `UsageQuotaActor` / `UsageQuotaDecision` / `UsageQuotaDenyReason`(+`member_daily`) / `UsageQuotaScope`. 소비처 테스트가 `USAGE_QUOTA_DEFAULTS[feature].guestPerDay` 를 기대값으로 써 기본값을 바꿔도 깨지지 않는다.

**shared**: `usageQuotaApi.overview(date?)` / `.update(feature, input)`; `useUsageQuotaOverview(date?)`(staleTime 15s, key `['admin','usage-quota', date ?? 'today']`, refetch 는 ~2026-10-04 늘 30s → 2026-10-05 `c5052742` 부터 오늘(date 미지정)만 30s·지난 날짜는 `false`), `useUpdateUsageQuota()`(성공 시 `['admin','usage-quota']` 무효화); `useGuestKeyStore`, `getGuestKey()`, `setGuestKeyStorage(storage)`.

**소비처 응답 계약**: 타로·사주(C) 는 `quota: { remainingToday: number | null }`(게스트만 숫자 — 회원은 `member_daily` 로 막혀도 null), 사주(G) 는 `remainingToday` + `fallbackReason: 'quota'`, 리뷰 질문(2026-10-05)은 `ReviewAskResult{answer: 안내문, confidence:'none', citations:[]}` 200. 웹 [TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx)(앱 `TarotReadingPanel` 도 같은 문구)가 "오늘 AI 해석 N회 남음 · 로그인하면 제한이 없어요" 로 노출 — 2026-10-05 회원 상한 뒤로는 문구 뒷부분이 사실과 다르다(Gotchas). 외부 문서 [docs/api/README.md](../../docs/api/README.md) 는 한도 표에 네 feature 와 "회원은 기능별 하루 100회" 를 적었다.

**웹 어드민**: [AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) 탭 "사용량 한도"(`Gauge` 아이콘, 5번째) → [AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) `settings/quotas` → `AdminQuotasPage`(→ 2026-10-05 `da755684` 로 어드민 페이지별 lazy). feature 카드마다 `FEATURE_META` 라벨('타로 해석'·'사주(C) 풀이'·'사주(G) 해석'·→ 2026-10-05 '맛집 리뷰 질문')과 enabled 체크 + 필드 5개(`noValidate` + 한국어 검증 "N은(는) 0~100의 정수여야 합니다"), 오른쪽에 그날 사용량(전역 진행률 바 — 컷 도달 amber·100% destructive, "게스트 컷 N회부터 정적 해석", scope 합계 3, 상위 게스트 키·IP). 날짜 입력(`max=오늘`)으로 과거 조회. 저장 후 폼 동기화는 `updatedAt` 변화를 렌더 중 비교(useEffect 없음).

소스: [routes.ts](../../packages/api-contract/src/routes.ts), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [usage-quota.route.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.route.ts), [usage-quota.api.ts](../../packages/shared/src/api/usage-quota.api.ts), [useUsageQuota.ts](../../packages/shared/src/hooks/useUsageQuota.ts), [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx)(+[test](../../apps/web/src/routes/admin/AdminQuotasPage.test.tsx)), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [docs/api/README.md](../../docs/api/README.md)

## Data [coverage: high — 6 sources]

[schema.prisma](../../apps/friendly/prisma/schema.prisma) 2 모델, 도입 마이그레이션 [20260903120000_add_tarot_reading_and_usage_quota](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql)(TarotReading 과 함께). feature 추가는 enum 확장만 — 마이그레이션 없음(feature 컬럼은 free TEXT).

- **`UsageQuotaSetting`**(`usage_quota_settings`) — `feature` PK, `enabled`(기본 true), `guestPerDay`·`ipPerDay`·`ipPerMinute`·`globalPerDay`·`guestCutoffPct`(Int, 기본값 없음 — upsert create 가 코드 기본값을 넣는다), `updatedAt`(@updatedAt), `updatedById?`(어드민 userId, **계약에는 노출 안 함**). 행이 없으면 코드 기본값으로 동작하고 어드민 화면은 "코드 기본값" 배지.
- **`UsageQuotaCounter`**(`usage_quota_counters`) — 복합 PK `(feature, scope, key, date)`, `count`(기본 0), `updatedAt`. 인덱스 `(feature, date, scope)`(그날 집계용). `scope` ∈ global | ip | guest | user, `key` 는 전역 `'*'` / IP 문자열 / 게스트 키(또는 `ip:<addr>`) / userId, `date` 는 KST `yyyy-mm-dd` 문자열. 04:40 cron 이 30일 지난 행 삭제. `user` 행은 ~2026-10-04 통계용이었고 → 2026-10-05 `count < MEMBER_PER_DAY` 조건부 증가로 실제 한도가 됐다(스키마·마이그레이션 변화 없음, 배포 당일 이미 쌓인 오늘 카운트가 그대로 이어진다). `review-ask` 도 같은 표에 feature 문자열로 들어간다.
- **인메모리** — `settingsCache { at, byFeature }` 30초(프로세스당 1, 저장 시 즉시 무효화). 카운터는 캐시 없이 매번 DB.
- **클라이언트** — localStorage/AsyncStorage `guest-key-v1` `{ state: { guestKey }, version: 1 }`. 초기화 = 새 기기. 앱은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 주입, WebView(~2026-09-25 앱 임베드)는 `__LP_EMBED__.guestKey` 로 앱 값을 덮어썼다. 2026-10-05(`d71fdb08`) 전에는 이 키가 실제로 저장된 적이 없다 — 고친 뒤 첫 로드에 그때의 키가 처음 저장된다.

기존 `meal_daily_quotas`(회원 식단 인식·추천 일일 한도, `MEAL_RECOGNIZE_DAILY_LIMIT` env)는 이 체계로 **옮기지 않았다** — 두 카운터가 공존한다([meal](meal.md)).

소스: [schema.prisma](../../apps/friendly/prisma/schema.prisma), [migration.sql](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql), [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts), [meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts), [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)

## Key Decisions [coverage: high — 10 sources]

- **2026-10-05 (`78cbb457`, PLAN-perf-2 결정 8 — 2026-09-02 결정 변경) 회원도 기능별 하루 100회** — F-4: 가입에 이메일 인증이 없고 `ipPerMinute` 가 라우트마다 독립 저장소라(사주 7개 라우트 합 140/분/IP, 타로 30/분, 사주(G) 20/분) 계정 하나로 사주 전역 3,000을 약 21분에 소진 → 그날 모든 게스트는 `guest_cutoff`, 다른 회원도 `global_budget`. 대안 셋 중 ① user scope 상한(코드 상수면 스키마 무변경)을 골랐다 — ② 회원에게 `ipPerDay` 적용은 CGNAT 회원을 함께 묶고, ③ 전체 풀이 4·테마 3 가중 소비는 `consume` 계약을 바꾼다. 어드민 설정으로 두려면 `UsageQuotaSetting` 열 추가(마이그레이션)가 필요해 하지 않았다. `MEMBER_PER_DAY = null` 로 되돌릴 수 있다.
- **2026-10-05 (`ab7dad28`, PLAN-perf-2 7차 B-4) 공개 리뷰 질문을 같은 모듈에 `review-ask` 로** — 일일·전역 LLM 한도와 답변 캐시 없이 IP 분당 15회 × LLM 3콜이었다. 마이그레이션 없이 enum 확장 + 타로식 게스트·IP·전역 일일, 같은 질문은 답변 LRU 20분·진행 중 합류로 소비 없음, 한도 초과는 강등 대신 "안내 답변 200"(답변형 기능에서의 강등). 분당은 기존 15/분을 그대로 `ipPerMinute` 기본값으로.
- **2026-10-05 (`d71fdb08`) 게스트 키는 복원 직후 없으면 한 번 써 둔다** — 재생성 API 를 두지 않는 원칙(아래 09-02)은 그대로, `set` 을 일부러 부르는 대신 persist 복원 완료 훅에서 "저장분 없음" 일 때만 현재 키를 기록. 저장분이 있으면 덮어쓰지 않는다(테스트 고정).
- **2026-09-06 (`e40b4c0`) 사주(G) 는 별도 feature `saju-g-reading`** — G 세션이 처음 같은 이름 `saju-reading`(기본 20/200/10/1000/90, `1c60ad8`)으로 들어왔다가 C 구현과 나란히 두기로 하면서 키를 분리, enum 3종. 두 사주 구현이 카운터·설정 행을 따로 가진다. 어드민 라벨도 '사주(G) 해석' / '사주(C) 풀이' 로 구분([saju-g](saju-g.md) "사주(C) 통합" 절).
- **2026-09-06 (`f8e5dd0`) 사주(C) 는 전체 풀이 1건 = 1 소비, 전역 예산은 타로의 60%** — 섹션 4개가 병렬 LLM 4호출이라 `globalPerDay` 3000(타로 5000)·게스트 30·IP 300 으로 시작. 오늘·궁합·택일·음식 단일 호출도 각 1건. 캐시 히트(같은 사주)는 미소비 — 카운터가 "LLM 호출 수" 가 아니라 "유료 요청 수" 를 센다.
- **2026-09-02 (`fae8190`) 기본 한도 상향 5/60/6/300/80% → 50/500/20/5000/90%** — 사용자 결정 "정상 사용자가 한도에 걸리지 않게 두고, 비용이 문제 되면 어드민에서 내린다". IP 일일 = 게스트 기기의 10배(CGNAT), 전역은 Ollama Cloud 예산 안전망. 같은 커밋에서 어드민 탭 신설.
- **2026-09-02 (`cd5a29b`) 회원은 기기·IP 일일 한도 면제** — 로그인 혜택(기록 동기화 + 한도 면제)의 일부. 전역 예산만 안전망으로 전원 적용하되 게스트가 `guestCutoffPct` 에서 먼저 끊겨 회원 몫을 남긴다. 분당 IP 버스트는 폭주 방어라 회원 포함. → 2026-10-05 "회원은 개인 한도 없음" 부분은 하루 100회로 바뀌었다(위). 기기·IP 면제는 그대로.
- **2026-09-02 (`cd5a29b`) env 대신 코드 기본값 + 어드민 DB 행** — 계획의 `TAROT_*_LIMIT` env 를 버리고 값의 단일 출처를 `USAGE_QUOTA_DEFAULTS` 로, 운영 조정은 어드민 탭으로 통일. 30초 캐시 + 저장 시 무효화라 재시작 없이 반영.
- **2026-09-02 (`cd5a29b`) MealDailyQuota 의 한 문장 원자 카운터를 scope 로 일반화** — `INSERT … ON CONFLICT … WHERE count < limit` 이라 동시 요청도 limit 을 넘겨 LLM 으로 가지 않는다. 소비 순서를 전역 → IP → 게스트로 두고 뒤 단계 거부 시 앞 단계를 되돌리는 건 best effort(단일 인스턴스 SQLite 전제 — CLAUDE.md 의 Redis 금지와 맞물림).
- **2026-09-02 (`cd5a29b`) 게스트 키는 추측 불가 UUID, 재생성 API 없음, 클라 선언값** — [vote](vote.md) 의 `voterKey` 와 같은 원리를 기능 간 공유하려고 별도 스토어로. 완벽한 식별이 아님을 제품 결정으로 수용하고 IP 일일·전역 층이 보완.
- **한도 초과는 오류가 아니라 강등** — 소비처 모두 `allowed=false` 면 정적 해석/기본 리포트(→ 2026-10-05 리뷰 질문은 안내 답변)로 응답(429 없음). 웹은 `source:'static'` 을 보고 "AI 해석 다시 시도" 를 띄운다. 회원 `member_daily` 도 같다.

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md), [docs/PLAN-saju.md](../../docs/PLAN-saju.md), [tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts), [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts), [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md), [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts)

## Gotchas [coverage: high — 13 sources]

- **회원 상한이 코드에만 있고 화면·설명 문구는 예전 그대로**(2026-10-05~, 코드 미수정) — 상한은 `MEMBER_PER_DAY` 상수뿐이라 어드민 탭에서 보이지도 조정되지도 않는데, 그 탭의 머리 주석·안내문([AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx) 11·66행 "회원은 기기·IP 일일 한도를 건너뛰고 전역 예산만 소비한다")과 계약 주석([schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) 7행 "회원은 … 전역 일일 예산만")이 그대로다. 게스트에게 보이는 웹 [TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx) 485행·앱 `TarotReadingPanel.tsx` 193행 "로그인하면 제한이 없어요" 도 사실과 다르다. 외부 문서는 둘로 갈린다 — 타로·사주(C)·사주(G) 라우트는 `MEMBER_LIMIT_LABEL` 을 끼워 맞췄고 `docs/api/README.md` 도 "회원은 기능별 하루 100회" 지만, [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts) 189행 `description`(→ 생성물 `docs/api/openapi.json`)은 여전히 "회원(Bearer)은 전역 일일 예산만 적용된다" 라 코드(`consume` 은 feature 를 가리지 않고 회원 상한을 건다)와 어긋난다.
- **회원은 막혀도 안내가 없다** — `member_daily` 거부도 `remainingToday: null` 이라 타로·사주(C)는 정적 해석 배지만, 사주(G)는 `fallbackReason: "quota"`, 리뷰 질문은 "오늘 질문할 수 있는 횟수를 모두 썼어요" 안내문이다. 100회는 feature 별이고 한 feature 안의 모든 라우트(사주(C) 7개, 사주(G) 풀이·궁합)가 나눠 쓴다.
- **2026-10-05 전의 기기 한도는 사실상 IP 한도였다**(`d71fdb08`) — 게스트 키가 저장되지 않아 웹은 새로고침마다 새 키였으므로 9월 운영 데이터의 `guestTotal`·`topGuests` 는 기기 수가 아니라 페이지 로드 수에 가깝다. 실질 방어는 IP 일일(타로 500)과 전역뿐이었다. persist 를 쓰는 스토어에서 `set` 없이 초기 상태만 두면 저장되지 않는 함정은 다른 스토어에도 같다([shared](shared.md)).
- **리뷰 질문 거부와 합류**(PLAN-perf-2 "리뷰 반영 → 남긴 것", 미수정) — 같은 질문 진행 중 요청에 합류한 요청은 한도를 세지 않는다. 앞선 요청이 그 사람 한도로 거부됐으면 합류한 쪽은 거부 답변을 받지 않고 캐시를 한 번 더 본 뒤 **자기 한도로 새로 돈다**(`askByPlaceId` 의 `outcome.denied` 분기). 다만 그 사이 다른 요청이 이미 새 진행을 시작했는지는 다시 보지 않아, 거부된 요청에 여럿이 합류해 있었으면 각자 파이프라인(LLM 최대 3콜)을 따로 돌리고 각자 한도를 소비할 수 있다 — 이것이 "합류 뒤 진행 중 요청 재확인" 후속 항목이다. 자세한 것은 [review-search](review-search.md).

- **PLAN 과 코드가 어긋난 곳(코드 우선)** — ① [PLAN-tarot](../../docs/PLAN-tarot.md) 결정 표 5 는 "게스트 80% 컷", 쿼터 표·코드는 90%(`fae8190` 상향 후 결정 표 미갱신). ② PLAN-tarot API 표의 `GET /admin/quotas/usage?date=` 별도 엔드포인트는 없다 — 코드는 `GET /admin/quotas?date=` 하나에 설정+사용량. ③ PLAN-tarot 파일 트리의 `routes/admin/settings/AdminQuotasPage.tsx` 는 실제 `routes/admin/AdminQuotasPage.tsx`. ④ PLAN-tarot 용어 표는 scope 를 guest/ip/global 3종으로 적었지만 코드는 `user` 도 센다(~2026-10-04 통계용, 2026-10-05 부터 회원 상한). ⑤ [PLAN-saju](../../docs/PLAN-saju.md) 설계 절은 "기본값 타로와 동일(50/500/5000)" 인데 코드·진행 기록은 30/300/20/3000. ⑥ PLAN-tarot 결정 표 5·11·쿼터 표의 "회원은 기기·IP 일일 한도 없음 / 한도 면제" 는 2026-10-05 회원 하루 100회를 반영하지 않았다(결정 변경은 [PLAN-perf-2](../../docs/PLAN-perf-2.md) 의 결정 8·share 묶음에만 있다).
- **0 의 의미가 필드마다 다르다** — `guestPerDay/ipPerDay/globalPerDay` 0 = 무제한(`globalPerDay` 0 이면 게스트 컷도 사라짐), `guestCutoffPct` 0 = **게스트 전면 차단**(회원만 허용), `enabled=false` = 전원 차단. `ipPerMinute` 는 0 불가(min 1). `MealDailyQuotaService` 의 "0 = 비활성" 계약과는 `consumeOne` 수준에서 반대(0 이면 항상 거부)지만 호출부가 0 을 null 로 바꿔 넘겨 결과적으로 같다.
- **게스트 키가 없으면 IP 가 기기다** — 헤더 부재·형식 밖(`bad key!`)이면 `ip:<addr>` 로 게스트 키를 대체하므로 키를 안 보내는 클라이언트들은 한 IP 가 한 기기로 묶여 `guestPerDay` 를 나눠 쓴다. 무효 JWT 도 401 이 아니라 게스트로 취급(`resolveOptionalUser`).
- **release 는 best effort** — 뒤 단계 거부 후 되돌리기가 원자 트랜잭션이 아니라 동시 요청이 겹치면 전역 카운터가 실제 LLM 호출보다 클 수 있다. 단일 인스턴스 SQLite 라 경합이 작다는 전제. 캐시 히트가 소비를 건너뛰므로 `usage.global` 은 "LLM 호출 수 상한" 이지 정확한 호출 수가 아니다.
- **분당 버스트는 테스트에서 검증되지 않는다** — [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) 가 `isTest` 면 플러그인을 등록하지 않아 `config.rateLimit` 이 무시된다. `ipPerMinute` 동작은 실구동에서만. 함수형 `max` 가 매 요청 `getSetting` 을 부르지만 30초 캐시라 DB 를 치지 않는다.
- **테스트 격리 함정** — [usage-quota.test.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.test.ts)(→ 2026-10-05 13건 — 회원 일일 상한 `it.runIf(MEMBER_PER_DAY !== null)`: user 카운터를 `limit-1` 로 심어 한 번 통과·다음 `member_daily`·거부분 전역 되돌림·다른 회원·다른 feature 무영향)는 `useSchemaDatabase()` + 서비스 인스턴스를 `settingsTtlMs: 0` 로 따로 만들되, 라우트 테스트가 갱신을 보려면 `app.usageQuota.invalidate()` 도 같이 호출해야 한다(두 인스턴스의 캐시가 별개). 소비처 테스트(tarot·saju)도 같은 패턴.
- **날짜 경계는 KST** — `today()` 가 서울 날짜라 UTC 자정이 아니라 한국 자정에 리셋. 어드민 날짜 입력도 `todayKst()`. 30일 이전 날짜는 cleanup 으로 비어 있어 조회해도 0.
- **운영 nginx 우회 시 IP 스푸핑** — `clientKey` 가 `CF-Connecting-IP` 를 신뢰하므로 `:3000` 을 직접 노출하면 IP 일일·분당 층이 무력화된다(rate-limit 플러그인 주석의 방화벽 경고 그대로).

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [usage-quota.test.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.test.ts), [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md), [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts), [review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts), [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts), [docs/api/README.md](../../docs/api/README.md), [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md)

## Sources [coverage: high — 46 sources]

- [apps/friendly/src/modules/usage-quota/usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) — 서비스·`USAGE_QUOTA_DEFAULTS`(4 feature)·소비 순서·원자 카운터·집계·정리, `MEMBER_PER_DAY`·`MEMBER_LIMIT_LABEL`(2026-10-05).
- [apps/friendly/src/modules/usage-quota/usage-quota.route.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.route.ts) — 어드민 GET overview / PUT setting.
- [apps/friendly/src/modules/usage-quota/usage-quota.test.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.test.ts) — 13건: 기본값·게스트/IP/회원/컷오프/0 의미·usage·cleanup·kstToday·어드민 라우트 + 회원 일일 상한(2026-10-05).
- [apps/friendly/src/plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts) — `app.usageQuota` 싱글턴 + 04:40 GC cron.
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `resolveOptionalUser`(옵셔널 인증, 무효 토큰 = 게스트).
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `clientKey`(CF-Connecting-IP 우선), 테스트 미등록.
- [apps/friendly/src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `resolveOptionalUser` 타입 선언.
- [apps/friendly/src/modules/meal/meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) — 원형(회원 일일 카운터, 옮기지 않음).
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `UsageQuotaSetting`·`UsageQuotaCounter`.
- [apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql) — 두 테이블 생성.
- [packages/api-contract/src/schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) — feature enum 4종(2026-10-05 `review-ask`)·설정/사용량/overview zod. 머리 주석의 회원 서술은 낡음.
- [packages/api-contract/src/schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) — ~2026-10-04 `TAROT_GUEST_KEY_HEADER` 가 있던 곳.
- [packages/api-contract/src/constants.ts](../../packages/api-contract/src/constants.ts) — 2026-10-05 게스트 키 헤더 상수 4종(`TAROT_`·`SAJU_`·`SAJU_G_`·`REVIEW_ASK_GUEST_KEY_HEADER`).
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.UsageQuota`.
- [packages/shared/src/api/usage-quota.api.ts](../../packages/shared/src/api/usage-quota.api.ts) — API 클라이언트.
- [packages/shared/src/hooks/useUsageQuota.ts](../../packages/shared/src/hooks/useUsageQuota.ts) — overview 쿼리(오늘만 30초 폴링, 2026-10-05)·update 뮤테이션.
- [packages/shared/src/stores/guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts) — `guest-key-v1` persist, `getGuestKey`, `setGuestKeyStorage`, `persistKeyIfMissing`(2026-10-05).
- [packages/shared/src/stores/guestKeyStore.test.ts](../../packages/shared/src/stores/guestKeyStore.test.ts) — 3건: 저장분 없으면 써 두고 다음 로드가 같은 키 / 저장분은 덮어쓰지 않음 / 비동기 스토리지.
- [packages/shared/src/hooks/useReviewSearch.ts](../../packages/shared/src/hooks/useReviewSearch.ts) · [stores/reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts) · [api/review-search.api.ts](../../packages/shared/src/api/review-search.api.ts) — 리뷰 질문이 게스트 키를 헤더로(2026-10-05).
- [packages/shared/src/stores/injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts) — 지연 위임 스토리지(앱 주입).
- [packages/shared/src/embedBridge.ts](../../packages/shared/src/embedBridge.ts) — `__LP_EMBED__.guestKey` 주입 계약.
- [packages/shared/src/hooks/useTarot.ts](../../packages/shared/src/hooks/useTarot.ts) — mutation 이 `getGuestKey()` 를 헤더로.
- [packages/shared/src/hooks/useSaju.ts](../../packages/shared/src/hooks/useSaju.ts) — 동일(풀이·오늘·궁합·택일·음식).
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx) — 임베드 부팅 시 게스트 키 스토어 덮어쓰기.
- [apps/web/src/routes/admin/AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx) — "사용량 한도" 탭(FEATURE_META 4·필드 5·사용량 패널). 회원 안내 문구는 낡음.
- [apps/web/src/routes/admin/AdminQuotasPage.test.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.test.tsx) — 3건(표시·저장 PUT, 오늘만 30초 폴링·지난 날짜 폴링 없음(2026-10-05), 검증 메시지).
- [apps/web/src/routes/admin/AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) — `settings/quotas` 라우트.
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) — 탭 목록(Gauge).
- [apps/web/src/components/tarot/TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx) — 게스트 잔여 횟수 문구.
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — `setGuestKeyStorage(AsyncStorage)`.
- [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md) — 결정 표 5·6·11, 쿼터·보안 표, 진행 기록 1차·4차.
- [docs/PLAN-saju.md](../../docs/PLAN-saju.md) — 결정 5, 한도 설계, 진행 기록 1차.
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — 성능 감사 2차 7차(F-4·B-4)·결정 8(회원 상한)·모듈 묶음 crawl(`review-ask`)·share(회원 100회)·리뷰 반영 남긴 것.
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — F-4 실측(3,001번째 거부·라우트별 분당 저장소·가입 이메일 인증 없음)·B-4.
- [docs/api/README.md](../../docs/api/README.md) — 외부 공개 한도 표(4 feature)·"회원은 기능별 하루 100회".

소비처(계측 호출자, cross-cutting): [tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts), [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts), [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts), [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts), [saju-g.service.ts](../../apps/friendly/src/modules/saju-g/saju-g.service.ts), [saju-g-pair.service.ts](../../apps/friendly/src/modules/saju-g/saju-g-pair.service.ts), [saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts), [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts)(`admit` 소비, 설명 문구 낡음), [review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts)(답변 캐시·합류).
