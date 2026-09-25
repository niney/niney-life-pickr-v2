---
concept: 부팅 부수효과는 서버 프로세스에만 — 수명주기 훅 선택이 곧 가드
last_compiled: 2026-09-26
topics_connected: [friendly, parking, api-docs, logs, housing, review-clustering, canonical, life-map, schedule, random-crawl, telegram, food, meal]
status: active
---

# 부팅 부수효과는 서버 프로세스에만 — 수명주기 훅 선택이 곧 가드

## Pattern

friendly 의 `buildApp()` 을 부르는 프로세스는 서버 하나가 아니다. `app.inject()` 테스트(2026-09-26 기준 friendly 143파일), 외부 API 문서를 뽑는 `export:openapi`, 식단 e2e 프로브 `probe:meal-e2e` 가 같은 `buildApp()` 을 쓰고, 대부분 **같은 `.env` 와 같은 SQLite 파일(`apps/friendly/data/dev.db`)** 을 본다. 그런데 앱에는 "나는 방금 재시작한 유일한 서버다" 를 전제로 한 부수효과가 있다:

- **복구 sweep** — 직전 인스턴스가 남긴 `running`/`pending` 행을 `failed(server_restart)`·`interrupted` 로 마감한다(작업 로그 run·분석 보고서, 리뷰 요약, schedule·random-crawl·food-import run).
- **재큐잉** — 방금 마감한 요약 행을 가게 단위로 다시 큐에 넣는다(LLM 호출).
- **cron·폴러** — 외부 API 를 주기적으로 부른다(주차 실시간 5분·충전기 상태 10분, 집값 월간 갱신, 정규화→머지 파이프라인, 맛집 자동 발굴, 음식 카탈로그 월간 적재, 텔레그램 long-polling).

이것들이 보조 프로세스에서 다시 일어나면 살아 있는 dev 서버의 진행 중 작업이 "끊긴 것" 으로 기록되거나, 스펙 하나 뽑는 데 업스트림 일일 한도가 깎인다. 이 리포는 그 전제를 **코드를 어느 수명주기 지점에 거느냐** 로 관리한다 — 지점마다 그 효과를 겪는 프로세스 집합이 다르다:

| 지점 | 실행되는 프로세스 | 쓰는 곳 |
|---|---|---|
| 플러그인 등록 본문 | `buildApp()` 을 부르는 전부(테스트·스크립트·서버) | `plugins/logs.ts` — 부팅 sweep(`sweepStaleOperationRuns`) + 보존 정리 1회 + 매일 04:00 보존 cron. 가드는 `NODE_ENV !== 'test'` 하나 / `plugins/meal.ts` — 사진 GC 1회(삭제 outbox 처리·고아 사진·추적 안 된 파일·인식 디버그 덤프 정리) + 04:30 cron(`scheduleRegistry.setCron`). 테스트는 저장 폴더를 임시 디렉터리로 바꿔 격리하지만, `.env` 로 도는 스크립트는 실제 저장소·DB 에서 돈다 |
| `onReady` 훅 | `app.ready()` 를 부르는 전부 — inject 테스트·`export:openapi`·`probe:meal-e2e`·서버 | `housing.route.ts` 월간 거래 갱신 cron 등록(`unref`, 즉시 실행 없음), `plugins/summaries.ts` 군집 기동 리컨실(`CLUSTER_RECONCILE_DELAY_MS` 기본 60초 뒤, `setTimeout(...).unref()`) |
| `onListen` 훅 | 포트를 여는 서버뿐 | `parking.route.ts` 실시간 폴러·충전기 상태 폴러 (+ 테스트면 cron 을 `''` 로 꺼 이중 가드) |
| `server.ts` 의 `start()` | `pnpm dev:api`·pm2 서버뿐 | ① 요약 stale 정리(`cleanupStaleReviewSummaries`) ② 재큐잉(`rescheduleStaleSummaries`) ③ `schedule.bootstrap()` ④ `telegramConfig.bootstrap()` ⑤ `randomCrawl.bootstrap()` ⑥ `foodImport.bootstrap()` → `listen` → graceful shutdown |

`server.ts` 가 정본이다 — 순서가 주석으로 못박혀 있고(정리가 끝나야 재큐잉, 텔레그램 토큰이 확정돼야 자동 발굴 폴러), 각 `bootstrap()` 이 자기 run 테이블의 `running` 고아를 `interrupted` 로 닫은 뒤 DB 설정으로 cron 을 등록한다(`schedule` 의 `new Cron(..., { paused: true })` 는 cron 식 미리보기용일 뿐, 실제 등록은 `schedule-registry.setCron` 이 bootstrap·설정 변경 때만). 플러그인 안에 둘 수밖에 없는 것은 훅 선택으로 같은 효과를 낸다: **`onListen` 은 "포트를 열었다 = 서버다" 의 가장 정확한 신호**이고, `onReady` 는 스크립트도 통과하므로 `unref`·지연 같은 **보조 가드**가 있어야 안전하다. 등록 본문은 모든 프로세스가 통과하므로 `NODE_ENV` 만으로는 스크립트를 걸러내지 못한다.

## Instances

- **2026-09-25** in [parking](../topics/parking.md) (`2ff2c31`): 가장 명시적인 사례. `parking.route.ts` 가 `ParkingLiveService`(`PARKING_LIVE_CRON` 기본 5분)·`EvStatusPoller`(`EV_STATUS_CRON` 기본 10분)를 `onListen` 에서만 `start()` 하고 `onClose` 에서 `stop()` 하며, 주석이 이유를 적는다 — *"폴러는 실제로 포트를 열 때만(onListen) — export:openapi 처럼 app.ready() 만 하는 스크립트·inject 테스트에서 업스트림을 부르지 않게"*. 생성자에는 `cron: isTest ? '' : env.PARKING_LIVE_CRON`(빈 값 = 끔)을 넘겨 테스트에서 한 번 더 막는다. 폴러가 쓰는 예산이 작다(공항·서울 실시간 각 하루 ~290콜, 충전기 상태는 개발계정 일 1,000건 중 ~290) — 테스트 한 번이 하루 예산을 건드리지 않게 하는 게 이 배치의 목적.
- **2026-09-24** in [api-docs](../topics/api-docs.md) / [logs](../topics/logs.md) (`1b621c4`): `export:openapi` 는 `tsx --env-file=.env` 로 `buildApp({ logger: false })` → `app.ready()` → `app.swagger()` → `app.close()` 를 한다. `onListen` 은 타지 않으니 주차 폴러는 안전하지만, **등록 본문은 탄다** — `plugins/logs.ts` 는 `NODE_ENV !== 'test'` 이면 등록 시점에 `sweepStaleOperationRuns` 로 모든 `running` OperationRun 을 `failed`/`server_restart` 로, `pending`·`running` 분석 보고서를 `failed` 로 바꾸는데, 스크립트는 `.env` 의 `NODE_ENV=development` 로 돈다. 그래서 **dev 서버가 크롤·요약을 진행 중일 때 문서를 재생성하면 그 run 이 잠깐 `server_restart` 실패로 보인다**(`finishRun` 이 id 로 덮어써 작업이 끝나면 최종 상태는 복구되지만, 그 사이 로그 화면·실패 run 분석 판단이 틀어질 수 있다). CLAUDE.md 6번 규칙이 비-어드민 라우트를 바꿀 때마다 이 스크립트를 돌리라고 하므로 빈도가 낮지 않다. 같은 등록 본문에서 `plugins/meal.ts` 의 사진 GC(삭제 outbox·고아 사진·추적 안 된 파일 정리)도 실제 저장소를 상대로 한 번 돈다. 같은 스크립트에서 housing cron(`unref`)과 군집 리컨실(60초 지연 `unref`)은 프로세스가 먼저 끝나 실효가 없다 — 보조 가드가 설계대로 작동하는 예.
- **2026-09-26** in [friendly](../topics/friendly.md) / [canonical](../topics/canonical.md) (`420a6be`): 같은 부류의 테스트 사고 — 서버 부팅 ①단계 함수 `cleanupStaleReviewSummaries` 를 검증하던 테스트가 격리 DB 없이 실 `dev.db` 에서 돌아, 대기 중이던 요약 행 전체를 `failed(server_restart)` 로 바꿨다(작업 기록: 수동 크롤한 한 가게의 533행). 테스트를 `useIsolatedDatabase()` 로 옮겨 해결. 서버 전용 함수를 서버 밖에서 부를 때의 위험이 테스트 쪽에서 나타난 형태다.
- **(대조) probe 스크립트의 DB 거부 가드** in [meal](../topics/meal.md): `probe:meal-e2e` 는 `onReady` 까지 타는 대신 **DB 자체를 고른다** — `prod.db` 는 무조건 거부, `dev.db` 는 `--allow-shared-db` 없이는 거부하고 사본(`DATABASE_URL="file:/tmp/…"`) 사용을 헤더 주석으로 요구한다. 부수효과를 막는 대신 부수효과가 닿을 파일을 격리하는 다른 해법. `export:openapi` 에는 이런 가드가 없다.
- **2026-09-24** in [housing](../topics/housing.md) / [life-map](../topics/life-map.md) (`ad48f96`): 한 파일을 여러 프로세스가 나눠 쓰는 구조의 또 다른 비용 — dev 서버가 DB 를 잡아 `migrate deploy` 가 잠기자 SQL 을 직접 적용했는데, 새 테이블이 WAL 에만 있으면 격리 테스트 DB(`temp-db.ts` 가 dev.db **본체만** 복사)에서 빠진다 → WAL 체크포인트 필수(작업 기록).
- **2026-09-25** in [friendly](../topics/friendly.md) (`5d7b686`): 격리 DB 는 dev.db(3.6GB)를 통째로 복사해 비우므로 준비 훅이 기본 10초를 넘겨 콜드 캐시 전체 실행에서 간헐 실패 → `vitest.config.ts` `hookTimeout: 60_000`. 같은 파일의 `fileParallelism: false` 주석도 같은 전제("단일 dev.db 를 공유하기 때문에 파일 병렬 실행은 안전하지 않다"). 테스트가 서버와 같은 파일에서 출발한다는 사실이 격리 비용을 정한다.
- **2026-08-17 이후** in [review-clustering](../topics/review-clustering.md) / [housing](../topics/housing.md): 군집 "기동 리컨실"(끊긴 원샷 체인 회복, `1f5ed30`)은 `plugins/summaries.ts` 의 `onReady` 에서 `scheduleStartupReconcile` — `CLUSTER_AUTO_ENABLED` 가드 + 60초 지연 + `unref`. 집값 월간 갱신 `HousingRefreshScheduler.start()` 도 `onReady` 에서 cron 등록만(`unref: true, catch: true`) 하고 첫 실행은 cron 시각까지 기다린다. 둘 다 "ready 만 한 짧은 프로세스" 에선 아무 일도 일어나지 않게 짜여 있다.
- **정본(기존)** in [schedule](../topics/schedule.md) / [random-crawl](../topics/random-crawl.md) / [telegram](../topics/telegram.md) / [food](../topics/food.md): 네 모듈은 플러그인 등록 때 서비스만 만들고, 고아 정리(`running` → `interrupted`)·cron 등록·텔레그램 폴링 시작은 `server.ts` 의 `bootstrap()` 이 한다 — inject 테스트·스크립트는 이 단계를 아예 거치지 않는다. 요약 재큐잉도 같은 이유로 플러그인이 아니라 `server.ts` 에 있다.

## What This Means

1. **"부팅" 은 하나가 아니다.** 이 앱에서 부팅은 등록 → ready → listen → (server.ts 전용 단계) 의 네 겹이고, 각 겹을 통과하는 프로세스 집합이 줄어든다. 복구 sweep·재큐잉·폴러는 "마지막 겹" 에 둘수록 안전하다. 새 백그라운드 작업을 붙일 때 물을 것은 "언제 시작하나" 가 아니라 **"이걸 테스트·`export:openapi` 가 실행해도 되나"** 다 — 안 되면 `onListen` 또는 `server.ts`.
2. **`NODE_ENV` 가드는 테스트만 거른다.** `plugins/logs.ts` 의 `NODE_ENV !== 'test'`, `plugins/rate-limit.ts` 의 `if (isTest) return` 은 vitest 를 걸러내지만 `.env` 로 도는 스크립트(`development`)는 통과시킨다. 스크립트까지 거르려면 수명주기(onListen) 또는 DB 선택(`probe:meal-e2e` 식 거부)으로 막아야 한다. 2026-09-26 기준 logs 부팅 sweep 만 이 틈에 남아 있다(개선 후보: sweep 을 `server.ts` 로 옮기거나 `onListen` 으로).
3. **SQLite 단일 파일이 이 문제를 만든다.** Redis·별도 DB 서버 없이(CLAUDE.md "안 되는 것") 서버·스크립트·테스트가 한 파일을 여는 구조라, "누가 이 행의 주인인가" 를 프로세스 경계가 아니라 코드 배치로 지켜야 한다. 테스트 쪽 답은 `useIsolatedDatabase()`(복사 비용 → `hookTimeout` 60초, WAL 체크포인트 함정), 스크립트 쪽 답은 수명주기 훅, 운영 쪽 답은 `server.ts` 의 순서다.
4. **`onListen` 도 "서버마다" 다.** 이 가드는 테스트·스크립트를 걸러낼 뿐, 서버 프로세스가 둘이면 둘 다 돈다 — 로컬 `pnpm dev:api` 와 운영이 같은 `DATA_GO_KR_API_KEY` 로 각자 주차 폴러를 돌리면 원천별 하루 ~288콜이 두 배가 된다. 인천공항(일 1,000건)은 두 배(576)여도 한도 안이지만, 충전기 상태는 평소 폴링당 2페이지(하루 ~288콜)여도 코드가 폴링당 최대 5페이지(`MAX_PAGES`, 하루 최대 720콜)까지 받으므로 변경이 몰리는 날 두 서버가 같은 키로 돌면 개발계정 일 1,000건을 넘길 수 있다([parking](../topics/parking.md) Gotchas). 쿼터가 키 단위인 폴러는 `PARKING_LIVE_CRON=''`·`EV_STATUS_CRON=''` 처럼 **로컬에서 끄는 스위치**가 함께 있어야 한다 — 빈 값이면 끈다는 규약이 그 스위치다.
5. **보조 가드(`unref`·지연)는 우연히 맞는 게 아니라 짧은 프로세스를 위한 장치다.** `onReady` 에 둔 작업이 스크립트에서 무해한 건 cron 이 즉시 실행하지 않고(`unref`), 리컨실이 60초 뒤에야 돌기 때문이다. 지연을 0 으로 줄이거나 `unref` 를 빼면 `export:openapi` 가 군집 계산(LLM·Python 런타임)을 시작할 수 있다.

관련: [in-memory-singleton-gates](in-memory-singleton-gates.md) — 이 컨셉이 지키는 폴러·cron 들이 그 게이트(단일 inflight·overlap skip)의 주인이다. [operation-log-instrumentation](operation-log-instrumentation.md) — 부팅 sweep 이 마감하는 대상이 그 run 테이블. [quota-proportional-loading](quota-proportional-loading.md) — 폴러 예산을 테스트·스크립트가 쓰지 않게 하는 것이 쿼터 규율의 프로세스 차원 연장. [open-data-master-load](open-data-master-load.md) — 적재 스크립트는 `buildApp()` 을 쓰지 않고 Prisma 를 직접 열어 이 문제를 피한다.

## Sources

- [parking](../topics/parking.md)
- [api-docs](../topics/api-docs.md)
- [logs](../topics/logs.md)
- [friendly](../topics/friendly.md)
- [canonical](../topics/canonical.md)
- [housing](../topics/housing.md)
- [life-map](../topics/life-map.md)
- [review-clustering](../topics/review-clustering.md)
- [schedule](../topics/schedule.md)
- [random-crawl](../topics/random-crawl.md)
- [telegram](../topics/telegram.md)
- [food](../topics/food.md)
- [meal](../topics/meal.md)
- [apps/friendly/src/server.ts](../../apps/friendly/src/server.ts)
- [apps/friendly/src/plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts)
- [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)
- [apps/friendly/src/modules/parking/parking.route.ts](../../apps/friendly/src/modules/parking/parking.route.ts)
- [apps/friendly/src/modules/housing/housing.route.ts](../../apps/friendly/src/modules/housing/housing.route.ts)
- [apps/friendly/scripts/export-openapi.ts](../../apps/friendly/scripts/export-openapi.ts)
- [apps/friendly/scripts/probe-meal-e2e.ts](../../apps/friendly/scripts/probe-meal-e2e.ts)
- [apps/friendly/vitest.config.ts](../../apps/friendly/vitest.config.ts)
- [apps/friendly/src/test-utils/temp-db.ts](../../apps/friendly/src/test-utils/temp-db.ts)
- [in-memory-singleton-gates](in-memory-singleton-gates.md)
- [operation-log-instrumentation](operation-log-instrumentation.md)
- [quota-proportional-loading](quota-proportional-loading.md)
- [open-data-master-load](open-data-master-load.md)
