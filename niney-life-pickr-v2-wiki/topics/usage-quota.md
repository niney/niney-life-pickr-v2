---
topic: usage-quota
last_compiled: 2026-09-07
sources_count: 36
status: active
aliases: [usage-quota, 사용량 한도, 익명 한도, 게스트 한도, UsageQuotaService, UsageQuotaSetting, UsageQuotaCounter, USAGE_QUOTA_DEFAULTS, remainingForGuest, guestCutoffPct, ipPerMinute, X-Guest-Key, guestKeyStore, getGuestKey, setGuestKeyStorage, guest-key-v1, useUsageQuotaOverview, useUpdateUsageQuota, AdminQuotasPage, tarot-reading, saju-reading, saju-g-reading, resolveOptionalUser, kstToday, usage-quota-gc]
---

# usage-quota — 로그인 없이 쓰는 비용성 기능의 공용 익명 사용량 한도

**2026-09-02 타로 1차(`cd5a29b`)에서 태어난 횡단 모듈.** 타로 리딩이 "로그인 없이 무료" 로 결정되면서 Ollama Cloud 호출 비용을 막을 장치가 필요했고, [meal](meal.md) 의 `MealDailyQuotaService`(회원 userId 기준 일일 카운터) 를 **feature × scope(global / ip / guest / user) × KST 날짜** 로 일반화해 `apps/friendly/src/modules/usage-quota/` 로 분리했다. 같은 날 4차(`fae8190`)에서 어드민 "설정 > 사용량 한도" 탭과 기본 한도 상향(5/60/6/300/80% → 50/500/20/5000/90%)이 들어왔고, 2026-09-06 사주(C)(`f8e5dd0`) 가 `saju-reading`, 사주(G) 리베이스(`e40b4c0`) 가 `saju-g-reading` 을 더해 지금은 **feature 3종**이 한 서비스·한 어드민 탭을 공유한다. 한도에 걸려도 429 가 아니라 각 기능이 **정적 해석으로 강등**해 항상 응답한다.

## Purpose [coverage: high — 8 sources]

무인증 공개 라우트에서 LLM 을 호출하는 기능(타로 해석·사주(C) 풀이·사주(G) 해석)의 **하루 호출 수를 네 층으로 제한**하고, 값을 어드민이 런타임에 조정하게 하는 단일 진입점. 회원과 게스트를 다르게 다룬다(사용자 결정 2026-09-02).

| 층 | 대상 | 설정 키 | 의미 |
|---|---|---|---|
| IP 분당 버스트 | 전원(회원 포함) | `ipPerMinute` | `@fastify/rate-limit` 의 `max` 를 설정 캐시에서 읽는 **함수**로 — 폭주 클라이언트 방어라 회원에게도 적용 |
| 전역 일일 예산 | 전원 | `globalPerDay` + `guestCutoffPct` | LLM 예산 안전망. 게스트는 예산의 `guestCutoffPct`% 에서 먼저 끊기고 회원은 100% 까지 |
| IP 일일 | 게스트만 | `ipPerDay` | 게스트 키 재생성 우회를 보완. CGNAT(한 IP 뒤 다수 사용자) 고려 게스트 기기의 10배 |
| 게스트 기기 일일 | 게스트만 | `guestPerDay` | `X-Guest-Key` 헤더(기기 영속 UUID) 기준. 없으면 `ip:<addr>` 로 대체 |

회원은 기기·IP 일일 한도를 **면제**받고 전역 예산만 소비하며 `user` scope 에 통계용으로만 센다(한도 없음). `enabled=false` 면 전원 `disabled`. 값 0 은 "제한 없음"(`ipPerMinute` 제외, 최소 1). 행이 없으면 코드 기본값 `USAGE_QUOTA_DEFAULTS` — env 키는 두지 않는다([db-config-env-fallback](../concepts/db-config-env-fallback.md) 계열이되 env 폴백 없이 코드 상수).

| feature | 기본값 (게스트/IP일일/IP분당/전역/컷%) | 근거 |
|---|---|---|
| `tarot-reading` | 50 / 500 / 20 / 5000 / 90 | `fae8190` — "정상 사용자가 걸리지 않게, 비용이 문제면 어드민에서 내린다" |
| `saju-reading`(사주(C)) | 30 / 300 / 20 / 3000 / 90 | `f8e5dd0` — 전체 풀이 1건 = LLM 4호출(섹션 병렬)이라 전역 예산을 낮게. 오늘·궁합·택일·음식도 1건씩 |
| `saju-g-reading`(사주(G)) | 20 / 200 / 10 / 1000 / 90 | `1c60ad8`→`e40b4c0` — 별도 구현이라 카운터도 분리 |

의존하는 곳: [tarot](tarot.md)·[saju-c](saju-c.md)·[saju-g](saju-g.md) 의 service(소비)와 route(분당 버스트), 웹 어드민 `AdminQuotasPage`, shared `guestKeyStore`(게스트 키 발급·보관), 앱 WebView 임베드(게스트 키 주입).

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts), [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md), [docs/PLAN-saju.md](../../docs/PLAN-saju.md), [meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts), [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx)

## Architecture [coverage: high — 9 sources]

### UsageQuotaService — 카운터·설정 (friendly)
[usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) 한 클래스. 생성자 `(prisma, { now?, settingsTtlMs? })` — 테스트가 시각 고정·캐시 해제에 쓴다.

- **설정** — `listSettings()` / `getSetting(feature)` 는 `usage_quota_settings` 전체를 읽어 feature 별 `Map` 으로 **30초 캐시**(`settingsTtlMs` 기본 30_000). 행이 없는 feature 는 `USAGE_QUOTA_DEFAULTS` 로 채우고 `updatedAt: null`. `updateSetting(feature, patch, updatedById)` 는 upsert(create 는 기본값 + patch) 후 `invalidate()`.
- **소비 `consume(feature, actor)`** — 순서는 **전역 → [게스트만] IP 일일 → 게스트 키 일일**. 각 단계는 `consumeOne` 한 문장 원자 SQL(아래)이고, 뒤 단계가 막히면 앞 단계 증가분을 `release`(count-1, best effort)로 되돌린다. 회원은 전역 통과 후 `user` scope 를 무제한 증가하고 끝. 반환 `UsageQuotaDecision { allowed, reason, remainingToday }` — `reason` 은 `disabled | global_budget | guest_cutoff | ip_daily | guest_daily`, `remainingToday` 는 게스트의 기기 일일 잔여(회원·무제한이면 null).
- **`consumeOne`** — `INSERT … ON CONFLICT(feature, scope, key, date) DO UPDATE SET count = count + 1 WHERE count < ${limit}` 의 변경 행 수가 1이면 통과. `limit === null` 이면 WHERE 없이 증가만, `limit <= 0` 이면 행도 만들지 않고 거부. 호출부가 `guestPerDay/ipPerDay/globalPerDay` 의 0 을 null(무제한)로 바꿔 넘기므로 실제로 0 이 도달하는 건 `guestCutoffPct=0` 의 전역 게스트 한도뿐.
- **`remainingForGuest(feature, actor, setting?, date?)`** — 소비 없이 잔여만(캐시 히트 응답 표시용). 회원 null, `enabled=false` 0, `guestPerDay<=0` null, 그 외 `max(0, guestPerDay - used)`.
- **집계 `usage(feature, date)`** — 그날 카운터를 scope 별 합계(`global/guestTotal/ipTotal/userTotal`) + 상위 10 키(`topGuests/topIps`)로.
- **정리 `cleanup(olderThanDays=30)`** — `date < KST(cutoff)` 행 삭제. `today()` / `kstToday()` 는 `toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })` 로 `yyyy-mm-dd`.

### 플러그인 — app 싱글턴 + GC cron
[plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts) 가 `app.usageQuota` 로 decorate(`dependencies: ['prisma']`). 설정 캐시를 기능 라우트(소비)와 어드민 라우트(편집·무효화)가 **같은 인스턴스**로 공유해야 저장이 즉시 반영된다 — [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 인스턴스. [schedule](schedule.md) 의 `scheduleRegistry.setCron('usage-quota-gc', '40 4 * * *', 'Asia/Seoul')` 로 매일 04:40 `cleanup()`, `onClose` 에서 `clearCron`. 타입 선언은 플러그인 파일 안의 `declare module 'fastify'`([types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) 에는 `resolveOptionalUser` 만).

### 소비처 공통 패턴 — actorOf + 함수형 rate-limit
세 기능 라우트가 같은 모양으로 `UsageQuotaActor { userId, guestKey, ip }` 를 만든다: `app.resolveOptionalUser(req)`([plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — 유효 토큰이면 회원, 무효·부재면 null, 401 아님) + `X-Guest-Key` 헤더를 `/^[A-Za-z0-9_-]{8,64}$/` 로 검증(형식 밖이면 null → IP 대체) + `clientKey(req)`([plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `CF-Connecting-IP` 우선, 없으면 `req.ip`). LLM 을 부르는 POST 는 `config.rateLimit.max` 를 `async () => (await app.usageQuota.getSetting(feature)).ipPerMinute` 로 둬 어드민 값이 분당 버스트에도 반영된다. 헤더 상수는 [schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) 의 `TAROT_GUEST_KEY_HEADER='x-guest-key'` 이고 saju 는 재export, saju-g 는 같은 값의 자체 상수.

### 게스트 키 — shared 스토어 + 앱 주입
[guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts): zustand persist `guest-key-v1`(version 1), 첫 생성 시 `crypto.randomUUID()`(없으면 `c-<ts>-<rand>`). **재생성 API 를 두지 않는다** — 한도 우회를 UI 가 부추기지 않게. 저장소는 [injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts) 의 지연 위임 어댑터로, 웹은 localStorage 자동·앱은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 에서 `setGuestKeyStorage(AsyncStorage)`. 훅 밖에서는 `getGuestKey()`. 앱 WebView 임베드는 [embedBridge.ts](../../packages/shared/src/embedBridge.ts) 의 `window.__LP_EMBED__ { token, guestKey }` 로 앱이 보관한 키를 주입하고 웹 [main.tsx](../../apps/web/src/main.tsx) 가 부팅 시 `useGuestKeyStore.setState` — 앱과 WebView 가 **같은 기기**로 잡혀 기기 일일 한도·오늘의 카드 잠금이 일치한다([mobile](mobile.md)).

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts), [plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts), [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts), [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts), [injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts), [embedBridge.ts](../../packages/shared/src/embedBridge.ts), [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts)

## Talks To [coverage: high — 10 sources]

**다운스트림(이 모듈이 의존):**
- `prisma` — `usageQuotaSetting` / `usageQuotaCounter`(raw SQL `$executeRaw` 로 카운터 증감).
- `scheduleRegistry`([schedule](schedule.md)) — GC cron 등록.
- `app.resolveOptionalUser`(jwt) · `clientKey`(rate-limit) — 소비처가 actor 를 만들 때. 서비스 자체는 둘을 모르고 `UsageQuotaActor` 만 받는다.

**업스트림(소비처)** — feature 당 하나의 service 가 `deps.quota` 로 주입받는다:
- [tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts) `TAROT_QUOTA_FEATURE='tarot-reading'` — `resolveBody`: 캐시 히트면 `remainingForGuest` 만, 미스면 `consume` → allowed 면 LLM, 아니면 정적 해석(`source:'static'`). 회원 오늘의 카드(`dailyLockKey`) 재반환은 한도 소비 없음. 응답 `quota.remainingToday`. 라우트 [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts) 의 `POST /tarot/readings` 가 함수형 `ipPerMinute`. 상세 [tarot](tarot.md).
- [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts) `SAJU_QUOTA_FEATURE='saju-reading'` — 전체 풀이는 섹션 4개 캐시 미스가 하나라도 있으면 **1건** 소비 후 병렬 job, 전부 캐시면 미소비. `daily`/`match`/`datePick`/`food` 도 캐시 미스 시 각 1건. 회원 오늘 운세 잠금(`dailyLockKey`) 재반환 미소비. [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts) 는 POST 5개에 같은 `quotaRate`. 상세 [saju-c](saju-c.md).
- [saju-g.service.ts](../../apps/friendly/src/modules/saju-g/saju-g.service.ts) · [saju-g-pair.service.ts](../../apps/friendly/src/modules/saju-g/saju-g-pair.service.ts) `'saju-g-reading'` — provider 가 해석(resolved+model)될 때만 `consume`; 거부면 `fallbackReason:'quota'` + 기본(basic) 리포트. 결과 캐시 키가 `owner:requestKey`(owner = `user:<id>` | `guest:<key|ip>`)라 사용자 간 캐시 공유가 없다. [saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts) 의 `readings`·`pairReading` 이 함수형 `ipPerMinute`. 상세 [saju-g](saju-g.md).

**FE 경계:** [usage-quota.api.ts](../../packages/shared/src/api/usage-quota.api.ts) → [useUsageQuota.ts](../../packages/shared/src/hooks/useUsageQuota.ts) → 웹 [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx)(어드민). 게스트 키는 [useTarot.ts](../../packages/shared/src/hooks/useTarot.ts)·[useSaju.ts](../../packages/shared/src/hooks/useSaju.ts) 의 mutation 이 `getGuestKey()` 를 각 `*.api.ts` 에 넘겨 헤더로 붙인다. 타입은 [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) 단일 출처([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)). LLM provider 해석은 각 기능이 [ai](ai.md) 의 `AiConfigService` 로 — 이 모듈은 LLM 을 모른다.

## API Surface [coverage: high — 6 sources]

[routes.ts](../../packages/api-contract/src/routes.ts) 의 `UsageQuota` namespace. 둘 다 `app.authenticate + app.requireAdmin`.

| 메서드 · 경로 | 용도 | 계약 |
|---|---|---|
| `GET /api/v1/admin/quotas?date=` | 모든 feature 의 설정 + 그날 사용량(생략 시 KST 오늘) | `UsageQuotaOverviewQuery` → `UsageQuotaOverview { date, items: [{ setting, usage }] }` |
| `PUT /api/v1/admin/quotas/:feature` | feature 하나의 설정 부분 갱신(upsert) | `UpdateUsageQuotaSettingInput`(`UsageQuotaSetting` 에서 feature·updatedAt 뺀 partial) → `UsageQuotaSetting`. enum 밖 feature 는 400 |

**스키마 바운드**: `guestPerDay`·`ipPerDay` 0~100_000, `ipPerMinute` 1~10_000, `globalPerDay` 0~1_000_000, `guestCutoffPct` 0~100, 전부 int. `UsageQuotaFeature = z.enum(['tarot-reading', 'saju-reading', 'saju-g-reading'])`.

**서비스 export**: `UsageQuotaService`, `USAGE_QUOTA_DEFAULTS`, `USAGE_QUOTA_FEATURES`, `kstToday`, 타입 `UsageQuotaActor` / `UsageQuotaDecision` / `UsageQuotaDenyReason` / `UsageQuotaScope`. 소비처 테스트가 `USAGE_QUOTA_DEFAULTS[feature].guestPerDay` 를 기대값으로 써 기본값을 바꿔도 깨지지 않는다.

**shared**: `usageQuotaApi.overview(date?)` / `.update(feature, input)`; `useUsageQuotaOverview(date?)`(staleTime 15s·refetch 30s, key `['admin','usage-quota', date ?? 'today']`), `useUpdateUsageQuota()`(성공 시 `['admin','usage-quota']` 무효화); `useGuestKeyStore`, `getGuestKey()`, `setGuestKeyStorage(storage)`.

**소비처 응답 계약**: 타로·사주(C) 는 `quota: { remainingToday: number | null }`(게스트만 숫자), 사주(G) 는 `remainingToday` + `fallbackReason: 'quota'`. 웹 [TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx) 가 "오늘 AI 해석 N회 남음 · 로그인하면 제한이 없어요" 로 노출.

**웹 어드민**: [AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) 탭 "사용량 한도"(`Gauge` 아이콘, 5번째) → [AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) `settings/quotas` → `AdminQuotasPage`. feature 카드마다 `FEATURE_META` 라벨('타로 해석'·'사주(C) 풀이'·'사주(G) 해석')과 enabled 체크 + 필드 5개(`noValidate` + 한국어 검증 "N은(는) 0~100의 정수여야 합니다"), 오른쪽에 그날 사용량(전역 진행률 바 — 컷 도달 amber·100% destructive, "게스트 컷 N회부터 정적 해석", scope 합계 3, 상위 게스트 키·IP). 날짜 입력(`max=오늘`)으로 과거 조회. 저장 후 폼 동기화는 `updatedAt` 변화를 렌더 중 비교(useEffect 없음).

소스: [routes.ts](../../packages/api-contract/src/routes.ts), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [usage-quota.route.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.route.ts), [usage-quota.api.ts](../../packages/shared/src/api/usage-quota.api.ts), [useUsageQuota.ts](../../packages/shared/src/hooks/useUsageQuota.ts), [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx)

## Data [coverage: high — 5 sources]

[schema.prisma](../../apps/friendly/prisma/schema.prisma) 2 모델, 도입 마이그레이션 [20260903120000_add_tarot_reading_and_usage_quota](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql)(TarotReading 과 함께). feature 추가는 enum 확장만 — 마이그레이션 없음(feature 컬럼은 free TEXT).

- **`UsageQuotaSetting`**(`usage_quota_settings`) — `feature` PK, `enabled`(기본 true), `guestPerDay`·`ipPerDay`·`ipPerMinute`·`globalPerDay`·`guestCutoffPct`(Int, 기본값 없음 — upsert create 가 코드 기본값을 넣는다), `updatedAt`(@updatedAt), `updatedById?`(어드민 userId, **계약에는 노출 안 함**). 행이 없으면 코드 기본값으로 동작하고 어드민 화면은 "코드 기본값" 배지.
- **`UsageQuotaCounter`**(`usage_quota_counters`) — 복합 PK `(feature, scope, key, date)`, `count`(기본 0), `updatedAt`. 인덱스 `(feature, date, scope)`(그날 집계용). `scope` ∈ global | ip | guest | user, `key` 는 전역 `'*'` / IP 문자열 / 게스트 키(또는 `ip:<addr>`) / userId, `date` 는 KST `yyyy-mm-dd` 문자열. 04:40 cron 이 30일 지난 행 삭제.
- **인메모리** — `settingsCache { at, byFeature }` 30초(프로세스당 1, 저장 시 즉시 무효화). 카운터는 캐시 없이 매번 DB.
- **클라이언트** — localStorage/AsyncStorage `guest-key-v1` `{ state: { guestKey }, version: 1 }`. 초기화 = 새 기기. 앱은 [api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) 주입, WebView 는 `__LP_EMBED__.guestKey` 로 앱 값을 덮어쓴다.

기존 `meal_daily_quotas`(회원 식단 인식·추천 일일 한도, `MEAL_RECOGNIZE_DAILY_LIMIT` env)는 이 체계로 **옮기지 않았다** — 두 카운터가 공존한다([meal](meal.md)).

소스: [schema.prisma](../../apps/friendly/prisma/schema.prisma), [migration.sql](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql), [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts), [meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts)

## Key Decisions [coverage: high — 6 sources]

- **2026-09-06 (`e40b4c0`) 사주(G) 는 별도 feature `saju-g-reading`** — G 세션이 처음 같은 이름 `saju-reading`(기본 20/200/10/1000/90, `1c60ad8`)으로 들어왔다가 C 구현과 나란히 두기로 하면서 키를 분리, enum 3종. 두 사주 구현이 카운터·설정 행을 따로 가진다. 어드민 라벨도 '사주(G) 해석' / '사주(C) 풀이' 로 구분([saju-g](saju-g.md) "사주(C) 통합" 절).
- **2026-09-06 (`f8e5dd0`) 사주(C) 는 전체 풀이 1건 = 1 소비, 전역 예산은 타로의 60%** — 섹션 4개가 병렬 LLM 4호출이라 `globalPerDay` 3000(타로 5000)·게스트 30·IP 300 으로 시작. 오늘·궁합·택일·음식 단일 호출도 각 1건. 캐시 히트(같은 사주)는 미소비 — 카운터가 "LLM 호출 수" 가 아니라 "유료 요청 수" 를 센다.
- **2026-09-02 (`fae8190`) 기본 한도 상향 5/60/6/300/80% → 50/500/20/5000/90%** — 사용자 결정 "정상 사용자가 한도에 걸리지 않게 두고, 비용이 문제 되면 어드민에서 내린다". IP 일일 = 게스트 기기의 10배(CGNAT), 전역은 Ollama Cloud 예산 안전망. 같은 커밋에서 어드민 탭 신설.
- **2026-09-02 (`cd5a29b`) 회원은 기기·IP 일일 한도 면제** — 로그인 혜택(기록 동기화 + 한도 면제)의 일부. 전역 예산만 안전망으로 전원 적용하되 게스트가 `guestCutoffPct` 에서 먼저 끊겨 회원 몫을 남긴다. 분당 IP 버스트는 폭주 방어라 회원 포함.
- **2026-09-02 (`cd5a29b`) env 대신 코드 기본값 + 어드민 DB 행** — 계획의 `TAROT_*_LIMIT` env 를 버리고 값의 단일 출처를 `USAGE_QUOTA_DEFAULTS` 로, 운영 조정은 어드민 탭으로 통일. 30초 캐시 + 저장 시 무효화라 재시작 없이 반영.
- **2026-09-02 (`cd5a29b`) MealDailyQuota 의 한 문장 원자 카운터를 scope 로 일반화** — `INSERT … ON CONFLICT … WHERE count < limit` 이라 동시 요청도 limit 을 넘겨 LLM 으로 가지 않는다. 소비 순서를 전역 → IP → 게스트로 두고 뒤 단계 거부 시 앞 단계를 되돌리는 건 best effort(단일 인스턴스 SQLite 전제 — CLAUDE.md 의 Redis 금지와 맞물림).
- **2026-09-02 (`cd5a29b`) 게스트 키는 추측 불가 UUID, 재생성 API 없음, 클라 선언값** — [vote](vote.md) 의 `voterKey` 와 같은 원리를 기능 간 공유하려고 별도 스토어로. 완벽한 식별이 아님을 제품 결정으로 수용하고 IP 일일·전역 층이 보완.
- **한도 초과는 오류가 아니라 강등** — 세 소비처 모두 `allowed=false` 면 정적 해석/기본 리포트로 응답(429 없음). 웹은 `source:'static'` 을 보고 "AI 해석 다시 시도" 를 띄운다.

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts), [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md), [docs/PLAN-saju.md](../../docs/PLAN-saju.md), [tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts), [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts)

## Gotchas [coverage: medium — 4 sources]

- **PLAN 과 코드가 어긋난 곳(코드 우선)** — ① [PLAN-tarot](../../docs/PLAN-tarot.md) 결정 표 5 는 "게스트 80% 컷", 쿼터 표·코드는 90%(`fae8190` 상향 후 결정 표 미갱신). ② PLAN-tarot API 표의 `GET /admin/quotas/usage?date=` 별도 엔드포인트는 없다 — 코드는 `GET /admin/quotas?date=` 하나에 설정+사용량. ③ PLAN-tarot 파일 트리의 `routes/admin/settings/AdminQuotasPage.tsx` 는 실제 `routes/admin/AdminQuotasPage.tsx`. ④ PLAN-tarot 용어 표는 scope 를 guest/ip/global 3종으로 적었지만 코드는 `user` 도 센다(통계용). ⑤ [PLAN-saju](../../docs/PLAN-saju.md) 설계 절은 "기본값 타로와 동일(50/500/5000)" 인데 코드·진행 기록은 30/300/20/3000.
- **0 의 의미가 필드마다 다르다** — `guestPerDay/ipPerDay/globalPerDay` 0 = 무제한(`globalPerDay` 0 이면 게스트 컷도 사라짐), `guestCutoffPct` 0 = **게스트 전면 차단**(회원만 허용), `enabled=false` = 전원 차단. `ipPerMinute` 는 0 불가(min 1). `MealDailyQuotaService` 의 "0 = 비활성" 계약과는 `consumeOne` 수준에서 반대(0 이면 항상 거부)지만 호출부가 0 을 null 로 바꿔 넘겨 결과적으로 같다.
- **게스트 키가 없으면 IP 가 기기다** — 헤더 부재·형식 밖(`bad key!`)이면 `ip:<addr>` 로 게스트 키를 대체하므로 키를 안 보내는 클라이언트들은 한 IP 가 한 기기로 묶여 `guestPerDay` 를 나눠 쓴다. 무효 JWT 도 401 이 아니라 게스트로 취급(`resolveOptionalUser`).
- **release 는 best effort** — 뒤 단계 거부 후 되돌리기가 원자 트랜잭션이 아니라 동시 요청이 겹치면 전역 카운터가 실제 LLM 호출보다 클 수 있다. 단일 인스턴스 SQLite 라 경합이 작다는 전제. 캐시 히트가 소비를 건너뛰므로 `usage.global` 은 "LLM 호출 수 상한" 이지 정확한 호출 수가 아니다.
- **분당 버스트는 테스트에서 검증되지 않는다** — [rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) 가 `isTest` 면 플러그인을 등록하지 않아 `config.rateLimit` 이 무시된다. `ipPerMinute` 동작은 실구동에서만. 함수형 `max` 가 매 요청 `getSetting` 을 부르지만 30초 캐시라 DB 를 치지 않는다.
- **테스트 격리 함정** — [usage-quota.test.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.test.ts)(12건)는 `useSchemaDatabase()` + 서비스 인스턴스를 `settingsTtlMs: 0` 로 따로 만들되, 라우트 테스트가 갱신을 보려면 `app.usageQuota.invalidate()` 도 같이 호출해야 한다(두 인스턴스의 캐시가 별개). 소비처 테스트(tarot·saju)도 같은 패턴.
- **날짜 경계는 KST** — `today()` 가 서울 날짜라 UTC 자정이 아니라 한국 자정에 리셋. 어드민 날짜 입력도 `todayKst()`. 30일 이전 날짜는 cleanup 으로 비어 있어 조회해도 0.
- **운영 nginx 우회 시 IP 스푸핑** — `clientKey` 가 `CF-Connecting-IP` 를 신뢰하므로 `:3000` 을 직접 노출하면 IP 일일·분당 층이 무력화된다(rate-limit 플러그인 주석의 방화벽 경고 그대로).

소스: [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts), [usage-quota.test.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.test.ts), [plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts), [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md)

## Sources [coverage: high — 36 sources]

- [apps/friendly/src/modules/usage-quota/usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) — 서비스·`USAGE_QUOTA_DEFAULTS`·소비 순서·원자 카운터·집계·정리.
- [apps/friendly/src/modules/usage-quota/usage-quota.route.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.route.ts) — 어드민 GET overview / PUT setting.
- [apps/friendly/src/modules/usage-quota/usage-quota.test.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.test.ts) — 12건: 기본값·게스트/IP/회원/컷오프/0 의미·usage·cleanup·kstToday·어드민 라우트.
- [apps/friendly/src/plugins/usage-quota.ts](../../apps/friendly/src/plugins/usage-quota.ts) — `app.usageQuota` 싱글턴 + 04:40 GC cron.
- [apps/friendly/src/plugins/jwt.ts](../../apps/friendly/src/plugins/jwt.ts) — `resolveOptionalUser`(옵셔널 인증, 무효 토큰 = 게스트).
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — `clientKey`(CF-Connecting-IP 우선), 테스트 미등록.
- [apps/friendly/src/types/fastify.d.ts](../../apps/friendly/src/types/fastify.d.ts) — `resolveOptionalUser` 타입 선언.
- [apps/friendly/src/modules/meal/meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) — 원형(회원 일일 카운터, 옮기지 않음).
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `UsageQuotaSetting`·`UsageQuotaCounter`.
- [apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql](../../apps/friendly/prisma/migrations/20260903120000_add_tarot_reading_and_usage_quota/migration.sql) — 두 테이블 생성.
- [packages/api-contract/src/schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) — feature enum 3종·설정/사용량/overview zod.
- [packages/api-contract/src/schemas/tarot.ts](../../packages/api-contract/src/schemas/tarot.ts) — `TAROT_GUEST_KEY_HEADER='x-guest-key'`(saju 가 재export).
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.UsageQuota`.
- [packages/shared/src/api/usage-quota.api.ts](../../packages/shared/src/api/usage-quota.api.ts) — API 클라이언트.
- [packages/shared/src/hooks/useUsageQuota.ts](../../packages/shared/src/hooks/useUsageQuota.ts) — overview 쿼리(30초 폴링)·update 뮤테이션.
- [packages/shared/src/stores/guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts) — `guest-key-v1` persist, `getGuestKey`, `setGuestKeyStorage`.
- [packages/shared/src/stores/injectableStorage.ts](../../packages/shared/src/stores/injectableStorage.ts) — 지연 위임 스토리지(앱 주입).
- [packages/shared/src/embedBridge.ts](../../packages/shared/src/embedBridge.ts) — `__LP_EMBED__.guestKey` 주입 계약.
- [packages/shared/src/hooks/useTarot.ts](../../packages/shared/src/hooks/useTarot.ts) — mutation 이 `getGuestKey()` 를 헤더로.
- [packages/shared/src/hooks/useSaju.ts](../../packages/shared/src/hooks/useSaju.ts) — 동일(풀이·오늘·궁합·택일·음식).
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx) — 임베드 부팅 시 게스트 키 스토어 덮어쓰기.
- [apps/web/src/routes/admin/AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx) — "사용량 한도" 탭(FEATURE_META·필드 5·사용량 패널).
- [apps/web/src/routes/admin/AdminQuotasPage.test.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.test.tsx) — 2건(표시·저장 PUT, 검증 메시지).
- [apps/web/src/routes/admin/AdminRoutes.tsx](../../apps/web/src/routes/admin/AdminRoutes.tsx) — `settings/quotas` 라우트.
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) — 탭 목록(Gauge).
- [apps/web/src/components/tarot/TarotOverlay.tsx](../../apps/web/src/components/tarot/TarotOverlay.tsx) — 게스트 잔여 횟수 문구.
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) — `setGuestKeyStorage(AsyncStorage)`.
- [docs/PLAN-tarot.md](../../docs/PLAN-tarot.md) — 결정 표 5·6·11, 쿼터·보안 표, 진행 기록 1차·4차.
- [docs/PLAN-saju.md](../../docs/PLAN-saju.md) — 결정 5, 한도 설계, 진행 기록 1차.

소비처(계측 호출자, cross-cutting): [tarot.service.ts](../../apps/friendly/src/modules/tarot/tarot.service.ts), [tarot.route.ts](../../apps/friendly/src/modules/tarot/tarot.route.ts), [saju.service.ts](../../apps/friendly/src/modules/saju/saju.service.ts), [saju.route.ts](../../apps/friendly/src/modules/saju/saju.route.ts), [saju-g.service.ts](../../apps/friendly/src/modules/saju-g/saju-g.service.ts), [saju-g-pair.service.ts](../../apps/friendly/src/modules/saju-g/saju-g-pair.service.ts), [saju-g.route.ts](../../apps/friendly/src/modules/saju-g/saju-g.route.ts).
