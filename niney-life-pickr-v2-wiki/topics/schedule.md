# schedule

> 인프로세스 cron 스케줄러. 관리자가 예약한 주기로 "메뉴 정규화 → 글로벌 머지" 파이프라인을 자동 실행한다. croner 기반, 단일 Fastify 인스턴스, 분산 락 없음.

## Purpose [coverage: high — 6 sources]

관리자가 cron 식으로 **"정규화 → 글로벌 머지"** 파이프라인을 주기 예약·자동 실행하게 하는 도메인이다. 지금까지 [menu-grouping](menu-grouping.md)(식당별 메뉴 정규화)과 [analytics](analytics.md)(글로벌 머지)를 수동으로 돌려야 했는데, 이를 야간 배치처럼 자동화한다.

단일 작업 타입 `normalize-merge` 하나만 존재한다(추후 다른 주기 작업을 대비해 `jobType` 으로 다중을 스키마 차원에서 열어둠). 한 번의 실행(run)은 세 단계로 진행한다:

1. **collecting** — "처리 필요"(미분류 메뉴 있거나 구버전) 식당 목록을 수집. 크롤 진행 중인 식당은 제외.
2. **grouping** — 식당별로 `menuGrouping.groupForRestaurant(placeId)` 를 순차 호출(증분 정규화).
3. **merging** — `analytics.runGlobalMerge({ full: false })` 로 전역 통계를 증분 갱신.

기본 권장 주기는 매일 03:00 (`DEFAULT_CRON = '0 3 * * *'`, `Asia/Seoul`)이며, 어드민이 cron 식·타임존·on/off 를 바꿀 수 있다. 진행 상황은 SSE 로 live 표시되고 실행 이력은 SQLite 에 영속된다.

## Architecture [coverage: high — 6 sources]

세 개의 협력 객체로 구성된다.

- **ScheduleService** ([`schedule.service.ts`](../../apps/friendly/src/modules/schedule/schedule.service.ts)) — 파이프라인 로직. `getConfig` / `updateConfig` / `applySchedule` / `bootstrap` / `runScheduled` / `collectTargets` / `listRuns` / `preview`. cron tick 과 어드민 "지금 실행"은 둘 다 `runScheduled(trigger)` 한 경로로 들어간다(차이는 `trigger` 값 `'cron'` vs `'manual'` 뿐).
- **scheduleRegistry** ([`schedule-registry.ts`](../../apps/friendly/src/modules/schedule/schedule-registry.ts)) — 모듈 singleton. 두 가지 메모리 상태만 관리: ① `Map<jobType, Cron>` cron 타이머, ② 시스템 전체 동시 1개인 `ActiveRun`(overlap 가드 + live 진행 + SSE 구독자 + graceful abort). 파이프라인 로직은 없고 상태/타이머만 담당.
- **schedule plugin** ([`plugins/schedule.ts`](../../apps/friendly/src/plugins/schedule.ts)) — `fastify-plugin`, `dependencies: ['prisma']`. `app.decorate('schedule', ...)` 로 ScheduleService 를 전역 singleton 으로 노출. 라우트와 부팅 cron tick 이 같은 인스턴스를 공유한다.

상태 분리가 핵심이다: **설정·이력은 SQLite 에 영속**(재시작 후 복원), **진행 중 상태·cron 타이머는 메모리**(registry). 이는 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 패턴 — `crawl` 의 `job-registry`, `analytics` 의 global-merge registry 와 같은 단일 모델이다.

### 실행 흐름 (runScheduled)

`beginRun` 으로 슬롯을 잡는다 → 이미 running 이면 `null` 반환 → 호출자가 `skipped` 행만 남기고 종료(overlap 방지). 슬롯을 잡으면 `running` 행 생성 후 collecting→grouping→merging 진행. 식당 경계마다 `signal.aborted` 와 `jobRegistry.isPlaceCrawling(placeId)` 를 재확인한다. 끝나면 registry 에서 카운트 스냅샷을 떠서 run 행을 마감(`done`/`failed`/`interrupted`)하고, `scheduleConfig.lastRunAt`/`lastStatus` 를 비정규화 갱신한다.

### 부팅·종료

- **부팅**: `server.ts` 가 `app.schedule.bootstrap()` 호출 → 직전 인스턴스에서 `running` 으로 남은 run 을 `interrupted`(`error: 'server restart'`)로 정리 → DB 설정을 읽어 cron 등록.
- **종료**: `server.ts` 의 SIGTERM/SIGINT 핸들러가 `scheduleRegistry.stopAllCrons()` + `abortInflight()` 후 `app.close()`. plugin 의 `onClose` 훅도 동일 정리(멱등 — 테스트 `app.close()` 에서도 작동). `app.ts` 에 `forceCloseConnections: 'idle'` 추가로 idle SSE keep-alive 가 close 를 매달지 않게 함. 15초 안전망 `setTimeout(() => process.exit(1))`(unref).

## Talks To [coverage: high — 5 sources]

- **[menu-grouping](menu-grouping.md)** — `groupForRestaurant(placeId)` 로 식당별 정규화(grouping 단계), `getRestaurantsStatus({ attention: true, ... })` 로 처리 대상 수집(collecting 단계). attention 정의를 그대로 재사용한다.
- **[analytics](analytics.md)** — `runGlobalMerge({ full: false })` 로 증분 글로벌 머지(merging 단계). `AnalyticsError` 코드 `no_inputs` 는 정상(머지할 신규 입력 없음)으로 간주하고 통과시킨다.
- **[crawl](crawl.md) job-registry** — `jobRegistry.isPlaceCrawling(placeId)` 로 크롤 진행 중인 식당을 제외. collecting 시점과 grouping 직전에 두 번 확인(수집 후 크롤이 시작됐을 수 있어서).
- **[friendly](friendly.md)** — `app.prisma`, `app.authenticate`/`app.requireAdmin`, `app.jwt`, `app.httpErrors`.
- **[shared](shared.md) / [web](web.md)** — `schedule.api.ts` + `useSchedule.ts` 훅을 통해 어드민 UI([AdminAnalyticsPage](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx))가 소비.

plugin 이 `AiConfigService` / `MenuGroupingService` / `AnalyticsService` 를 **자체 인스턴스화**한다(아래 Gotchas 참조 — `app.aiConfig` 재사용 불가).

## API Surface [coverage: high — 5 sources]

라우트([`schedule.route.ts`](../../apps/friendly/src/modules/schedule/schedule.route.ts)), `Routes.Schedule.*`([routes.ts](../../packages/api-contract/src/routes.ts)). 전부 `/api/v1/admin/schedule` prefix, `app.authenticate` + `app.requireAdmin` 보호(SSE 만 예외).

| 메서드 | 경로 (`Routes.Schedule.*`) | 설명 |
|---|---|---|
| `GET` | `config` (`/admin/schedule`) | 현재 설정 + 다음 실행 시각. 행 없으면 기본값으로 채워 반환. |
| `PUT` | `config` | `enabled`/`cronExpr`/`timezone` 변경. 잘못된 cron 은 `400`. 즉시 런타임 재등록. |
| `POST` | `run` (`/admin/schedule/run`) | "지금 실행"(manual). 진행 중이면 `skipped` run 반환. |
| `GET` | `runs` (`/admin/schedule/runs`) | 최근 실행 이력(최대 50) + `inflightRunId`. |
| `POST` | `preview` (`/admin/schedule/preview`) | cron 식 검증 + 다음 실행 시각 최대 5개. 저장 전 입력 검증용. |
| `GET` | `runEvents` (`/admin/schedule/run-events`) | 진행 SSE. |

### SSE (run-events)

EventSource 가 헤더를 못 보내므로 `?token=` 쿼리로 JWT 인증한다([sse-token-auth](../concepts/sse-token-auth.md)). ADMIN 이 아니면 `401`. 연결 시 즉시 `snapshot` 이벤트(현재/직전 run 스냅샷, 없으면 `null`)를 흘리고, **진행 중 run 이 없으면 바로 종료**한다. 진행 중이면 `progress`/`done` 이벤트를 push하고 15초마다 `: hb` heartbeat comment 를 보낸다. `done` 에서 스트림을 닫는다.

스키마([api-contract](api-contract.md), [`schedule.ts`](../../packages/api-contract/src/schemas/schedule.ts)): `ScheduleJobType('normalize-merge')` · `ScheduleTrigger(cron|manual)` · `ScheduleRunStatus(running|done|failed|skipped|interrupted)` · `SchedulePhase(collecting|grouping|merging|done)` · `ScheduleConfig` · `ScheduleConfigInput` · `ScheduleRun` · `ScheduleRunList` · `ScheduleProgressEvent` · `ScheduleDoneEvent` · `SchedulePreviewInput` · `SchedulePreviewResult`. **cron 검증 로직은 스키마에 없다** — 서버가 croner 로 한다(api-contract 는 croner 미의존, `shared → api-contract` 단방향 의존 규칙과 일관).

### FE 소비

- [`schedule.api.ts`](../../packages/shared/src/api/schedule.api.ts) — `getConfig`/`updateConfig`/`runNow`/`listRuns`/`preview` + `buildScheduleRunEventsUrl()`(token 을 query 로).
- [`useSchedule.ts`](../../packages/shared/src/hooks/useSchedule.ts) — React Query 훅 + `useScheduleRunEvents(enabled)` SSE 구독(지수 백오프 재연결, `done` 에서 `schedule`/`analytics` 캐시 무효화).
- [AdminAnalyticsPage](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) `ScheduleSection` — 어드민 분석 페이지에 통합. cron 프리셋 칩(매일 새벽3시/정오/6시간마다/매시간) + 커스텀 입력 + preview 다음 실행 시각 + on/off 토글 + "지금 실행" + 이력 테이블 + live SSE 진행 바.

## Data [coverage: high — 2 sources]

[Prisma](../../apps/friendly/prisma/schema.prisma), 마이그레이션 [`20260605135918_add_schedule_tables`](../../apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql).

**`schedule_configs`** — `jobType` `@unique`(행 식별 키), `enabled`, `cronExpr`, `timezone`(기본 `Asia/Seoul`), `lastRunAt`/`lastStatus`(빠른 표시용 비정규화), `createdAt`/`updatedAt`. **`nextRunAt` 은 저장하지 않는다** — croner 로 매번 계산(저장하면 stale).

**`schedule_runs`** — `id`(cuid), `jobType`, `trigger`, `status`, `totalTargets`(nullable, collecting 후 확정), `processedCount`/`skippedCount`(default 0), `error`, `startedAt`, `finishedAt`. `@@index([jobType, startedAt])`. `phase` 는 영속하지 않는다(live 진행은 SSE 메모리에만).

상수: `RUN_HISTORY_LIMIT = 50`(이력 조회 take), `MAX_TARGETS_PER_RUN = 200`(주기당 처리 상한).

## Key Decisions [coverage: high — 5 sources]

- **17차(2026-06) 신규 도메인.** 16차(`13c10a5`)→HEAD 사이 추가. menu-grouping/analytics 수동 실행을 cron 자동화로 묶은 첫 주기 작업 인프라.
- **croner 라이브러리, 인프로세스.** 별도 워커/큐 없이 단일 Fastify 인스턴스 안에서 cron 타이머가 돈다. CLAUDE.md 의 **no-Redis / 단일 인스턴스** 전제와 일관 — **분산 락 없음**. 동시성은 메모리 단일 슬롯(`ActiveRun`)으로 가드한다.
- **cron tick 과 manual 을 한 경로로.** 둘 다 `runScheduled(trigger)`. overlap 가드·진행 추적·abort 가 한 곳에 모인다.
- **시스템 전체 동시 1개.** 정규화→머지는 전역 작업이라 중첩이 무의미. `beginRun` 이 이미 running 이면 `null` → `skipped` 행. cron tick `onTick` 콜백은 fire-and-forget(즉시 반환, 작업은 백그라운드).
- **설정 영속 / 진행상태 메모리 분리.** 설정·이력은 SQLite(재시작 복원), cron 타이머·진행은 registry singleton. `bootstrap` 이 부팅 시 둘을 잇는다.
- **개별 식당 실패 ≠ 주기 실패.** grouping 중 한 식당이 throw 해도 로그만 남기고 계속(멱등이라 다음 주기 재시도). `no_inputs` 머지 에러도 정상 처리.

## Gotchas [coverage: high — 5 sources]

- **`app.aiConfig` 재사용 불가 → 자체 AiConfig 생성.** autoload 알파벳순상 `'schedule'` < `'summaries'` 라 schedule 플러그인이 먼저 로드된다. 이때 `app.aiConfig`(summaries 가 decorate)가 아직 없으므로, plugin 이 `AiConfigService`/`MenuGroupingService`/`AnalyticsService` 를 **새로 인스턴스화**한다. 같은 서비스를 여러 인스턴스가 가질 수 있음에 유의.
- **croner 는 패턴 in-place 변경 불가.** `setCron` 은 기존 Cron 을 `stop()` 한 뒤 새로 만든다. 등록 시 `unref: true`(타이머 혼자 프로세스 못 붙잡게) + `catch: true`.
- **overlap 시 `skipped` 행이 남는다.** 이전 실행이 안 끝난 채 tick/manual 이 오면 아무 작업 없이 `skipped` run 한 행만 기록. 이력에 `skipped` 가 자주 보이면 한 주기가 다음 tick 까지 안 끝난다는 신호.
- **서버 재시작 시 `running` → `interrupted` 정리.** abort 된 작업이 DB 에 `running` 으로 남으면 다음 부팅 `bootstrap()` 이 `interrupted`(`error: 'server restart'`)로 마감. 다음 tick 에 재개(멱등).
- **`MAX_TARGETS_PER_RUN = 200` 초과분은 다음 주기.** attention 식당이 200 을 넘으면 200개만 처리하고 경고 로그. 정규화가 멱등이라 나머지는 다음 cron tick 에 자연 처리.
- **`nextRunAt` 미저장.** croner 가 매번 `nextRun()` 으로 계산. `enabled=false` 면 cron 미등록이라 `null`.
- **v3 택소노미는 자동 반영 안 됨.** 스케줄러의 글로벌 머지는 `{ full: false }` 증분 — 기존 path 를 바꾸지 않는다. 새 택소노미 버전 적용은 여전히 **수동 full 재머지**가 필요.
- **SSE 연결 시 진행 중 run 이 없으면 즉시 종료.** snapshot 한 번만 흘리고 닫는다. FE 훅은 백오프 재연결하지만 idle 상태에선 계속 짧게 끊긴다.

## Sources [coverage: high — 13 sources]

- [`apps/friendly/src/modules/schedule/schedule.service.ts`](../../apps/friendly/src/modules/schedule/schedule.service.ts) — 파이프라인 로직
- [`apps/friendly/src/modules/schedule/schedule-registry.ts`](../../apps/friendly/src/modules/schedule/schedule-registry.ts) — cron 타이머 + ActiveRun singleton
- [`apps/friendly/src/modules/schedule/schedule.route.ts`](../../apps/friendly/src/modules/schedule/schedule.route.ts) — HTTP/SSE 레이어
- [`apps/friendly/src/modules/schedule/schedule.service.test.ts`](../../apps/friendly/src/modules/schedule/schedule.service.test.ts) — 단위 테스트
- [`apps/friendly/src/plugins/schedule.ts`](../../apps/friendly/src/plugins/schedule.ts) — fastify-plugin decorate
- [`apps/friendly/src/server.ts`](../../apps/friendly/src/server.ts) — bootstrap + graceful shutdown
- [`apps/friendly/src/app.ts`](../../apps/friendly/src/app.ts) — `forceCloseConnections: 'idle'`
- [`packages/api-contract/src/schemas/schedule.ts`](../../packages/api-contract/src/schemas/schedule.ts) — zod 스키마
- [`packages/api-contract/src/routes.ts`](../../packages/api-contract/src/routes.ts) — `Routes.Schedule`
- [`packages/shared/src/api/schedule.api.ts`](../../packages/shared/src/api/schedule.api.ts) — API 클라이언트
- [`packages/shared/src/hooks/useSchedule.ts`](../../packages/shared/src/hooks/useSchedule.ts) — React Query + SSE 훅
- [`apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql`](../../apps/friendly/prisma/migrations/20260605135918_add_schedule_tables/migration.sql) + [`schema.prisma`](../../apps/friendly/prisma/schema.prisma) — DB 모델
- [`apps/web/src/routes/admin/AdminAnalyticsPage.tsx`](../../apps/web/src/routes/admin/AdminAnalyticsPage.tsx) — 어드민 스케줄러 UI

관련 컨셉: [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) · [sse-token-auth](../concepts/sse-token-auth.md) · [zod-ssot-buildless](../concepts/zod-ssot-buildless.md)
