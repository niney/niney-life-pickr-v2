---
topic: logs
last_compiled: 2026-10-10
sources_count: 37
status: active
aliases: [operation-log, operation-run, operation-report, log-analysis, failure-report, retention, log-retention, OperationLogService, LogAnalysisService, run-instrumentation, log-config, OperationFeature, FEATURE_LABEL, food-import, meal-recognition, meal-recommendation, meal-nutrition-advice, trigger-user, 자동 분석 게이트, visitorPagination, paginating_visitor, allocSeq, parentRunId, AdminLogsPage, AdminLogRunDetailPage, buildLlmProviderEnv, persist failed, FK 위반, 작업 로그 FK 오류, createRunRow, ensureRunRow, RUN_ROW_RETRY_GAP_MS, persisted, droppedLogs, logsDropped, RunFinalFields, cleanupExpiredOperationLogs, deleteInBatches, CLEANUP_LOG_BATCH, CLEANUP_RUN_BATCH, CLEANUP_PAUSE_MS, CleanupOptions, 보존 정리 배치, busy_timeout, socket_timeout, operationRunsPollInterval, operationRunPollInterval, OPERATION_RUN_SLOW_AFTER_MS, OPERATION_REPORT_STALL_MS, keepPreviousData, 폴링 완화]
---

# logs — 범용 작업(operation) 로그 + 실패 run LLM 분석 보고서

**2026-10-05 변경 흡수 — 작업 로그 FK 위반 수정(run 행 재생성)·보존 정리 배치 DELETE(`622bfca2`) + 어드민 로그 화면 폴링 완화(`c5052742`)**: (1) **FK 위반의 원인과 수정** — 운영 stderr 최근 3,000줄 중 `[operation-log] persist failed` FK 위반이 229건이었고 10/4 03:03 에 몰렸다(03:00 스케줄 창, [PLAN-perf-2](../../docs/PLAN-perf-2.md) "감사 범위 밖이지만 로그에서 나온 결함"). 원인은 연결별 busy_timeout 이다. 예전 [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) 는 `PRAGMA busy_timeout=30000` 을 풀의 첫 연결에만 걸어, 나머지 연결은 5초 만에 `database is locked` 로 실패했다(PLAN X-1, 실측 64연결 중 63개가 5000). 그 실패가 `startRun` 의 run 행 INSERT 이면 그 runId 로 가는 스텝 로그 INSERT 가 전부 FK(runId) 위반이 되고, `finishRun` 의 UPDATE 는 "No record" 로 끝났다. 근본 수정은 friendly 쪽 `2b072b53` 이다(`DATABASE_URL` 에 `socket_timeout=30`·`connection_limit=12` 를 붙여 모든 연결의 busy_timeout 을 30초로, [friendly](friendly.md)). 이 모듈은 그 위에 방어를 더했다([operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts)). `RunContext` 에 `persisted`·`retry`·`lastAttemptAt`·`droppedLogs`·`startedAt`·`parentRunId` 를 둔다. run 행이 없으면 스텝 로그를 쏘지 않고, `ensureRunRow` 가 run 행 INSERT 를 다시 해 본다. 재시도는 5초 간격(`RUN_ROW_RETRY_GAP_MS`)으로, 한 번에 하나만 돈다(같은 시도를 여러 로그가 기다린다). 끝까지 없으면 `finishRun` 이 UPDATE 대신 **최종 상태로 INSERT** 한다(`createRunRow(id, ctx, final, 'finishRun')` — 처음 `startedAt` 은 그대로). DB 에 못 남긴 스텝 로그 수는 run `meta.logsDropped` 로 남는다. 재시도 INSERT 가 P2002(unique 위반)면 앞선 INSERT 가 실제로는 커밋된 것으로 보고 성공으로 친다. 콘솔 실패 로그는 `[operation-log] startRun persist failed` 한 줄뿐이다(스텝마다 FK 오류가 찍히지 않는다). 신규 테스트 3건(행 없음 → 로그 0·finishRun INSERT·`logsDropped: 5` / 간격 뒤 재생성 성공 / P2002 = 있음). (2) **보존 정리를 배치로** — `cleanupExpiredOperationLogs` 의 로그·run 삭제가 `deleteMany` 한 문장에서 원시 SQL `DELETE … WHERE id IN (SELECT id … LIMIT n)` 반복으로 바뀌었다(`deleteInBatches`). 크기는 로그 5,000(`CLEANUP_LOG_BATCH`)·run 1,000(`CLEANUP_RUN_BATCH` — run 삭제는 남은 스텝 로그까지 cascade 로 지우므로 더 작게)이고, 배치 사이 50ms(`CLEANUP_PAUSE_MS`) 쉬어 대기 중인 쓰기가 끼어들게 한다. 근거는 [findings](../../docs/PLAN-perf-2-findings.md) G-3 이다: 로그 20만 행 한 문장 DELETE 가 쓰기 락 2,768ms, 하루치 플러드면 ~40초로, busy 대기를 넘긴 쓰기가 실패하고 그게 `startRun` 이면 (1) 로 번졌다. 세 번째 인자 `CleanupOptions` 는 테스트 seam 이다(배치 5/3 로 여러 배치에 걸친 정리를 고정하는 라우트 테스트 신규). 보고서 정리는 실패 run 당 1개라 적어 그대로 `deleteMany` 다. (3) **웹 폴링 완화** — [useLogs.ts](../../packages/shared/src/hooks/useLogs.ts) 의 폴링 주기가 순수 함수 `operationRunsPollInterval`/`operationRunPollInterval` 로 빠졌다. 목록은 running 행이 시작 30분 이내(`OPERATION_RUN_SLOW_AFTER_MS`)면 5초, 오래된 running 뿐이면 30초다. 상세는 3초이고, 시작 30분이 넘은 run 이나 10분 넘게 갱신 없는 보고서(`OPERATION_REPORT_STALL_MS`)면 30초다. 멈추지 않고 늦추기만 하는 이유는 스케줄·전역 머지가 실제로 오래 돌 수 있어서다(마감이 누락된 run 은 부팅 sweep 전까지 running 으로 남는다). 목록은 `keepPreviousData`, 스텝 로그는 같은 run 일 때만 이전 페이지를 유지하고 흐리게(`opacity-70`) 보여 준다(레벨을 바꾼 직후엔 '더 보기' 비활성). '다시 분석' 은 한 번만, 스텝 로그 무한 쿼리는 빼고 무효화한다(`predicate: queryKey[3] !== 'logs'` — 예전엔 상세 키와 `['logs','runs']` 를 따로 불러 겹친 쿼리가 두 번씩 나갔다). 고친 버그도 하나 있다. 멈춘 보고서의 '다시 분석' 버튼이 10분이 지나도 풀리지 않았다. 폴링 응답이 구조 공유로 같으면 다시 그리지 않아 "지금 시각" 판정이 갱신되지 않았기 때문이다 → 임계 시각 +250ms 에 타이머로 한 번 다시 그린다. 신규 테스트 웹 [AdminLogsPage.test](../../apps/web/src/routes/admin/AdminLogsPage.test.tsx)·[AdminLogRunDetailPage.test](../../apps/web/src/routes/admin/AdminLogRunDetailPage.test.tsx), shared [useLogs.test](../../packages/shared/src/hooks/useLogs.test.ts) 8건. (4) **계측 컨슈머 쪽 변화** — 글로벌 머지가 다른 머지와 겹쳐 busy 로 건너뛰면 global-merge run 을 만들지 않는다(pino warn 만, [analytics](analytics.md)). 스케줄 run 에는 merge 단계 `skipped: 'busy'` 스텝이 남는다([schedule](schedule.md)). 영수증 추출은 IP 분당 20·사용자 하루 50회로 묶였다 — findings G-3 의 "없는 imageToken 으로 분당 1000회면 하루 run 144만·log 288만 행/IP" 플러드에 상한이 생겼다([settlement](settlement.md)). 새 요청 로그 1줄(`req`/`slow request`)과 10분마다의 `mem` 로그([plugins/mem-telemetry.ts](../../apps/friendly/src/plugins/mem-telemetry.ts))는 pino 전용이라 이 시스템의 DB 테이블과 무관하다(소유 friendly). (5) **정정** — `OperationFeature` 는 2026-10-04 `3d067a0` 이후 **13종**이다(`meal-nutrition-advice` '영양제 조언', [meal-nutrition](meal-nutrition.md)). 아래 본문의 12종 서술을 고쳤다. 쓰기 락을 서버 전체 예산으로 보는 같은 라운드의 다른 사례는 [sqlite-write-lock-budget](../concepts/sqlite-write-lock-budget.md).

**2026-08-17~08-22 변경 흡수 — `OperationFeature` 12종(+`food-import`·`meal-recognition`·`meal-recommendation`), crawl run meta `visitorPagination`, 플러그인 env 조립 `buildLlmProviderEnv()`**: (1) [schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts) 의 `OperationFeature` enum 에 `food-import`(`102ccdb`)·`meal-recognition`·`meal-recommendation`(`c5b5fe2`, 둘 다 2026-08-22)이 더해져 **12종**, 웹 [AdminLogsPage](../../apps/web/src/routes/admin/AdminLogsPage.tsx) `FEATURE_LABEL` 에 '음식 카탈로그 적재'/'식단 사진 인식'/'식단 추천' 라벨(`Record<OperationFeatureType, string>` 이라 enum 추가 시 typecheck 가 누락을 잡는다). 셋 다 `channel` 미지정(= DB+pino) 이고 `operationLog` 는 optional dep. meal 두 feature 는 **`trigger: 'user'`** 로 시작하므로 실패해도 [operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts) 의 자동 분석 게이트(`(ctx?.trigger ?? null) !== 'user'`)에 걸려 LLM 비용을 만들지 않는다 — 인스턴스별 단계·status 매핑(폴백이 결과를 만든 run 은 `done` + `meta.status='fallback'`, food-import abort 는 `cancelled`/`interrupted`)은 [operation-log-instrumentation](../concepts/operation-log-instrumentation.md) 의 2026-08-22~23 항목과 [food](food.md)/[meal](meal.md) 참조. (2) crawl Naver 잡(`0d72380`, 2026-08-17)이 `paginating_visitor` 단계에 리뷰 페이지네이션 완료(info)/**부분 완료(warn)** 로그를 남기고, `done` 로그·`finishRun` meta 에 `visitorPagination`(`{ complete, reason, pagesAttempted, pagesFetched, reviewsFetched }`)을 싣는다 — 스키마 변경 없이 `run.meta` JSON 통과 규약 그대로. 사유 코드 8종은 [crawl](crawl.md). (3) [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) 의 자체 `LlmProviderEnv` 리터럴이 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 로(`cc8399a`) — "`app.aiConfig` 재사용 불가라 자체 `AiConfigService` 를 만든다"는 그대로이고 env 조립만 공용. `log-analysis` purpose 해석·`OLLAMA_LOG_ANALYSIS_MODEL` 폴백은 변경 없음([ai](ai.md)).

`apps/friendly/src/modules/logs/` 에 위치한 어드민 전용 **작업 로그 시스템**. 크롤·요약·메뉴 그룹핑·정산 추출·자동 발견·스케줄·글로벌 병합 등 **모든 기능**의 실행을 단위(run)로 묶어 영속 기록하고, 실패한 run 은 LLM 이 단계별 로그를 읽어 **원인 분석 보고서**를 자동 생성한다. 운영자는 어드민 화면에서 run 목록/상세/스텝 로그를 훑고, 실패 보고서를 보고, 보존 기간을 설정한다.

이 토픽은 [crawl](./crawl.md) 토픽의 `CrawlJobLog`(크롤+요약 잡 한정, 단계별 SSE 로그)와 구분된다. logs 는 그 3채널 fan-out 의미론을 **전 기능 가로지르는 operation-log 체계**로 일반화한 후속이며, 레거시 `crawl_job_logs` 데이터를 마이그레이션 시점에 합성 run 으로 백필해 끌어온다. 자세한 LLM provider/adapter 계층은 [ai](./ai.md), 어드민 서버 구조는 [friendly](./friendly.md) 참조.

## Purpose [coverage: high — 9 sources]

서비스 안의 모든 백그라운드/동기 작업이 "한 번 실행될 때 무슨 일이 있었는가"를 한 테이블 체계로 남기는 단일 진입점. 목적은 세 가지다.

1. **관측성** — 어드민이 어떤 기능의 어떤 실행이 언제 시작·종료했고 성공/실패했는지, 그 안에서 어떤 스텝 로그가 찍혔는지 한 화면에서 본다. crawl 외 feature 는 SSE 채널이 없으므로 진행 중인 run 은 폴링으로 따라간다.
2. **실패 자가 진단** — `status='failed'` 로 끝난 run 은 (일부 제외 코드를 빼고) finishRun 직후 LLM 분석을 자동으로 띄워 `OperationReport`(summary/rootCause/details/suggestions/severity)를 만든다. 운영자는 보고서를 읽거나 '다시 분석'으로 재시도한다.
3. **보존 관리** — 전역 보존 기간(`LogConfig`, 기본 30일)이 지난 로그/run 은 매일 04시 cron + 부팅 직후 정리된다(2026-10-05 부터 LIMIT 배치 DELETE 로 쓰기 락을 잘게 나눈다). 분석 보고서가 있는 run 은 영구 보존한다.

기존 크롤 전용 `job-log.service.ts`(2026-06-13 `9c0a1f9` 에서 이 모듈의 [operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts) 로 흡수·삭제됨) 의 3채널(pino / DB / SSE) fan-out 패턴을 그대로 일반화한 것이라, 크롤·요약 로그는 여전히 SSE 로 실시간 흐르면서도 동시에 이 시스템의 DB 에 영속된다.

소스: [operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts), [log-analysis.service.ts](../../apps/friendly/src/modules/logs/log-analysis.service.ts), [logs.route.ts](../../apps/friendly/src/modules/logs/logs.route.ts), [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts), [schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts), [AdminLogsPage.tsx](../../apps/web/src/routes/admin/AdminLogsPage.tsx), [AdminLogRunDetailPage.tsx](../../apps/web/src/routes/admin/AdminLogRunDetailPage.tsx), [AdminLogSettingsPage.tsx](../../apps/web/src/routes/admin/AdminLogSettingsPage.tsx), [useLogs.ts](../../packages/shared/src/hooks/useLogs.ts)

## Architecture [coverage: high — 8 sources]

두 서비스 + 한 라우트 + 보존 유틸로 구성된다.

### OperationLogService — 기록 진입점
[operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts) 가 run 경계와 스텝 로그를 기록한다. **프로세스당 정확히 1개** — `plugins/logs.ts` 가 app 전역 singleton 으로 decorate 한다. seq 카운터가 단일 공유여야 클라이언트의 `(jobId, seq)` dedup 이 깨지지 않기 때문 ([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 인스턴스).

- `startRun(input): Promise<string>` — `randomUUID()` 로 id 를 **사전 생성**하고, feature/jobId/subjectId/parentRunId/trigger/meta/startedAt 을 인메모리 `contexts` Map 에 둔 뒤 `operationRun` row 를 INSERT 한다(`createRunRow`). DB 쓰기가 실패해도 id 를 반환해 호출자의 비즈니스 흐름이 끊기지 않는다. 2026-10-05 부터 INSERT 결과를 `ctx.persisted` 로 기억한다 — 실패한 run 은 아래 `log`·`finishRun` 이 FK 위반 대신 재생성 경로를 탄다. INSERT 를 await 하므로 다른 연결이 쓰기 락을 오래 쥐면 호출자도 그만큼(최대 busy_timeout 30초) 기다린다.
- `log(input): void` — 동기 시그니처. 세 채널로 fan-out:
  1. **pino** — debug 포함 4종 level 분기 (운영 콘솔/파일).
  2. **SSE** — `channel='crawl'` 은 `jobRegistry` 로, subjectId(placeId)가 있으면 같은 seq 로 `summaryEventsBus` 에도 fan-out. `channel='summary'` 는 `summaryEventsBus`(placeId=subjectId)만. **`level='debug'` 는 SSE 로 절대 내보내지 않는다** — `CrawlLogLevel`(info|warn|error) 3종 계약을 깨지 않기 위함.
  3. **DB** — `operationLog` row INSERT (fire-and-forget). context 가 없으면(이미 finishRun 됐거나 잘못된 runId) FK/enum 오염을 피해 DB 기록만 생략한다. context 는 있는데 run 행이 없으면(`persisted=false`) `ensureRunRow` 가 run 행을 다시 만들어 보고(5초 간격·동시 1회), 성공하면 INSERT, 아니면 건너뛰고 `droppedLogs` 를 센다 — pino·SSE 흔적은 이미 남았다.
- `finishRun(runId, input): Promise<void>` — run 을 종료 상태로 update. **절대 던지지 않는다** (호출자 finally 보호). 진행 중 재생성 시도가 있으면 기다린 뒤, run 행이 끝내 없으면 UPDATE 대신 최종 필드(status·errorCode·errorMessage·meta·finishedAt)를 실은 INSERT 로 마지막 기회를 쓴다. 못 남긴 스텝 로그 수는 meta `logsDropped` 로 합쳐진다. 자동 분석 직전에 `pendingWrites` Set 의 미결 INSERT 를 `Promise.allSettled` 로 정착시킨다 — 마지막 error 로그가 DB 에 닿기 전에 분석이 로그를 수집하면 핵심 단서가 프롬프트에서 빠지기 때문.
- `allocSeq(): number` — 단일 seq 카운터를 외부에 노출. `CrawlService.emit` 이 같은 카운터를 공유해 progress/done 이벤트와 log 이벤트의 seq 가 한 소스에서 단조 증가한다.

### LogAnalysisService — 실패 run LLM 분석
[log-analysis.service.ts](../../apps/friendly/src/modules/logs/log-analysis.service.ts) 가 실패 run 1건의 스텝 로그를 'log-analysis' 용도 LLM(`ollama-cloud`)에 보내 보고서를 생성한다. 두 경로:

- **자동** — `finishRun` 이 fire-and-forget 으로 띄움. `analyzeRun(runId)` 전체 분석. 전역 세마포어(동시 1) + 대기열 상한 5 를 거쳐 실패 폭주 시 LLM 호출이 무한히 줄 서는 것을 막는다(초과분 드롭). LLM 미설정이면 **보고서 행을 만들지 않고 조용히 스킵**(pino info 만).
- **수동** — `requestAnalysis(runId)` (POST /analyze). 동기 검증 + `running` 보고서 upsert 까지 끝내고 LLM 호출은 백그라운드로 fire. 즉시 running 스냅샷을 반환해 웹이 폴링으로 완료를 확인한다.

`runId` 별 `inflight` Set 가 자동/수동 중복 실행을 막는다. LLM 호출은 첫 시도 + 재시도 2회(`MAX_ATTEMPTS=3`), `timeout`/`upstream_failed`/`parse_failed` 만 재시도. 프롬프트는 error/warn 전부(≤100행) + 마지막 info/debug 100행을 시간 오름차순으로 합쳐 16KB 캡 안에서 오래된 info/debug 부터 생략한다.

### 라우트 + 보존 유틸
[logs.route.ts](../../apps/friendly/src/modules/logs/logs.route.ts) 는 전부 `app.authenticate + app.requireAdmin` 가드 아래의 어드민 라우트. [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) 가 두 서비스를 decorate 하고, 부팅 sweep + 보존 cron(`0 4 * * *`, Asia/Seoul, croner `logs-retention` — `scheduleRegistry` 가 아니라 자체 `Cron`)을 건다. 보존 유틸 `cleanupExpiredOperationLogs(prisma, log, opts?)` 는 로그 → 미완 보고서 → run 순서로 지우고, 로그·run 은 `deleteInBatches`(LIMIT 5,000 / 1,000, 배치 사이 50ms)로 나눈다. 의존: `prisma`(autoload 선행 보장). `app.aiConfig` 는 'summaries' 가 decorate 하는데 알파벳순상('logs' < 'summaries') 재사용 불가라 자체 `AiConfigService` 를 만든다(2026-08-22 부터 env 블록은 `buildLlmProviderEnv()` 공용 — 리터럴 복제 없음).

소스: [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts), [operation-log.service.test.ts](../../apps/friendly/src/modules/logs/operation-log.service.test.ts), [logs.route.test.ts](../../apps/friendly/src/modules/logs/logs.route.test.ts), [config/env.ts](../../apps/friendly/src/config/env.ts), [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)

## Talks To [coverage: high — 18 sources]

**다운스트림(이 모듈이 의존):**
- `prisma` — `operationRun`/`operationLog`/`operationReport`/`logConfig` 4 테이블. 연결 설정은 [plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) 가 정한다 — 2026-10-05 부터 모든 연결 busy_timeout 30초(`socket_timeout=30`)·풀 12. 그 전엔 첫 연결만 30초라 run 행 INSERT 가 5초에 실패하던 것이 FK 위반 폭주의 뿌리였다.
- `jobRegistry`([crawl](./crawl.md)) — `channel='crawl'` SSE 발송 대상.
- `summaryEventsBus`(summary) — `channel='summary'` / crawl 의 subject fan-out 대상.
- `AiConfigService` + `adapterCache`([ai](./ai.md)) — 'log-analysis' 용도 LLM provider 해석. `OLLAMA_LOG_ANALYSIS_MODEL` env 가 기본 모델. row 없으면 미설정으로 취급.
- `classifyError` / `extractFirstJsonObject`([ai](./ai.md), summary.service) — LLM 에러 분류 + reasoning 모델 `<think>` 제거 후 JSON 추출 재사용.

**업스트림(이 모듈을 호출하는 계측 컨슈머)** — `OperationFeature` 13종을 각 모듈이 직접 기록한다:
- [crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts) — feature `crawl`, `channel='crawl'`. `allocSeq()` 를 공유해 emit 이벤트와 seq 정합. Naver 잡 `done` meta 에 `visitorPagination`(2026-08-17) — 부분 완료는 `paginating_visitor` warn.
- [summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) — feature `summary`, `channel='summary'`.
- [menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts), [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts), [auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts), [random-crawl.service.ts](../../apps/friendly/src/modules/random-crawl/random-crawl.service.ts), [analytics.service.ts](../../apps/friendly/src/modules/analytics/analytics.service.ts)(global-merge) — `channel='none'`(DB+pino만). 2026-10-05: global-merge 는 다른 머지와 겹쳐 `busy` 로 건너뛰면 run 을 아예 만들지 않는다. menu-grouping 은 같은 placeId 진행 중 호출에 합류하면(모듈 `groupingInFlight`) 새 run 을 만들지 않는다. settlement-extraction 은 `startRun` 뒤 일일 한도를 소비해, 한도 초과도 `errorCode: 'quota'` 실패 run 으로 남는다(`trigger:'user'` 라 자동 분석 제외).
- [schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts) — feature `schedule`. 자식 run(menu-grouping/global-merge)을 `parentRunId` 로 연계하는 중첩 run 의 대표 사례. 2026-10-05 부터 머지가 busy 면 `merge` 단계에 `'글로벌 머지 건너뜀 — 다른 머지 진행 중'`(meta `skipped: 'busy'`) 스텝을 남기고 run 은 done.
- [meal-nutrition-advice.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts) — feature `meal-nutrition-advice`(2026-10-04 `3d067a0`, 13번째), stage `llm`, `channel='none'`. 상세 [meal-nutrition](meal-nutrition.md).
- [food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts)(feature `food-import`, trigger cron/manual → 실패 시 자동 분석 대상), [meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts) / [meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts)(**`trigger: 'user'`** → 자동 분석 제외) — 2026-08-22 합류, 모두 `channel='none'`. meta 에 사용자·사진 토큰·메모를 넣지 않는다(photoCount/dishCount/model/durationMs 만). 상세는 [operation-log-instrumentation](../concepts/operation-log-instrumentation.md) · [food](food.md) · [meal](meal.md).

**FE 경계:** [logs.api.ts](../../packages/shared/src/api/logs.api.ts)(API 클라이언트) → [useLogs.ts](../../packages/shared/src/hooks/useLogs.ts)(React Query 훅 — 2026-10-05 폴링 주기 함수 `operationRunsPollInterval`/`operationRunPollInterval` 와 상수 `OPERATION_RUN_SLOW_AFTER_MS`(30분)·`OPERATION_REPORT_STALL_MS`(10분)를 export, 웹 상세 화면이 같은 상수로 '다시 분석' 재활성 시점을 맞춘다) → 웹 어드민 페이지 3종. 타입은 모두 `@repo/api-contract` 의 [schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts) 단일 출처 ([zod-ssot-buildless](../concepts/zod-ssot-buildless.md)).

**관측 로그와의 경계:** friendly 의 요청 로그 1줄(`req` — 메서드·라우트 패턴·상태·ms, 500ms 이상은 `slow request` warn + 토큰 가린 URL, [app.ts](../../apps/friendly/src/app.ts))과 10분 `mem` 로그([plugins/mem-telemetry.ts](../../apps/friendly/src/plugins/mem-telemetry.ts))는 2026-10-05 에 생긴 pino 전용 출력이다. operation_runs 와 연결되지 않으므로 "작업 로그 화면에 안 보이는 느린 요청" 은 pm2 로그에서 찾는다([friendly](friendly.md)).

## API Surface [coverage: high — 5 sources]

[routes.ts](../../packages/api-contract/src/routes.ts) 의 `Logs` namespace. 모든 경로 `/api/v1/admin/logs/*`, admin 전용.

| 메서드 · 경로 | 용도 | 계약 |
|---|---|---|
| `GET runs` | run 목록 — feature/status 필터 + 페이지네이션, startedAt DESC, logCount 포함 | `ListOperationRunsQuery` → `OperationRunList` |
| `GET runs/:id` | run 상세 + 보고서(없으면 null) | → `OperationRunDetail` |
| `GET runs/:id/logs` | run 의 스텝 로그 — cursor pagination(행 id 토큰, createdAt DESC), debug 포함 4종 level 필터 | `ListOperationLogsQuery` → `OperationLogsResult` |
| `POST runs/:id/analyze` | 실패 run 수동 재분석 — 검증 후 비동기 fire, 즉시 running 스냅샷 | → `AnalyzeRunResult`(discriminated union on `ok`) |
| `GET / PUT config` | 전역 보존 기간(동일 경로) | `UpdateLogConfigInput` → `LogConfig` |

핵심 의미론:
- **cursor pagination** — `runLogs` 는 레거시 크롤 로그와 같은 의미론. 응답은 최신순(`createdAt DESC, id DESC`), `nextCursor` 는 마지막 행 id. UI 가 표시 시 뒤집어 시간 오름차순으로 보여준다.
- **비동기 analyze** — `analyze` 는 항상 200. 수락하면 `ok:true` + running 보고서 스냅샷, 거절(`run_not_failed`/`no_analysis_llm`/`analysis_in_flight` 등)은 `ok:false` + 사유. 완료는 웹이 run 상세 폴링으로 확인.
- **검증** — `ListOperationLogsQuery.limit` 1~500(기본 100), `UpdateLogConfigInput.retentionDays` 1~365. `fastify-type-provider-zod` 자동 검증.

소스: [routes.ts](../../packages/api-contract/src/routes.ts), [schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts), [logs.route.ts](../../apps/friendly/src/modules/logs/logs.route.ts), [logs.api.ts](../../packages/shared/src/api/logs.api.ts), [logs.route.test.ts](../../apps/friendly/src/modules/logs/logs.route.test.ts)

## Data [coverage: high — 5 sources]

[schema.prisma](../../apps/friendly/prisma/schema.prisma) 의 4 모델. 최초 도입: [20260612164108_add_operation_logs](../../apps/friendly/prisma/migrations/20260612164108_add_operation_logs/migration.sql), 잡 인덱스 추가: [20260612181456_add_operation_log_job_index](../../apps/friendly/prisma/migrations/20260612181456_add_operation_log_job_index/migration.sql).

- **`OperationRun`**(`operation_runs`) — run 헤더. `feature`(13종 — free TEXT, enum 검증은 와이어 zod 만이라 feature 추가에 마이그레이션 없음), `jobId`/`subjectId`/`parentRunId`(전부 nullable), `status`(running|done|failed|cancelled, 기본 running), `trigger`(자유 문자열), `errorCode`/`errorMessage`(2000자 캡), `meta`(JSON 직렬화, 4096자 캡), `startedAt`/`finishedAt`. 인덱스: `(feature, startedAt)` / `(status, startedAt)` / `jobId` / `startedAt`. 자식: `logs[]`, `report?`.
- **`OperationLog`**(`operation_logs`) — 스텝 로그. `runId`(FK, cascade), 비정규화 `feature`/`jobId`/`subjectId`(레거시 크롤 로그 조회 호환), `stage`, `level`(debug|info|warn|error), `message`(2000자 캡), `meta`(JSON, 4096자 캡), `createdAt`. 인덱스: `(runId, createdAt)` / `(feature, createdAt)` / `(subjectId, createdAt)` / `(jobId, createdAt)` / `createdAt`.
- **`OperationReport`**(`operation_reports`) — run 당 0~1개(`runId` unique). `status`(pending|running|done|failed, 기본 pending), `provider`/`model`, `summary`/`rootCause`/`details`(markdown)/`suggestions`(string[] JSON)/`severity`(low|medium|high), `errorCode`/`errorMessage`, `promptTokens`/`completionTokens`/`durationMs`. pending/running 동안 분석 필드는 null — 웹이 status 를 폴링.
- **`LogConfig`**(`log_configs`) — 전역 단일 row(`key='global'` unique). `retentionDays`(기본 30).

직렬화 규약: `run.meta` 는 기능마다 모양이 달라 서버가 **파싱하지 않고 JSON 문자열 그대로 통과**(클라이언트가 파싱). 반면 `log.meta` 와 `report.suggestions` 는 서버가 파싱해 각각 객체/배열로 응답한다. meta JSON 이 4096자 캡을 넘으면 부분 절단이 파싱을 깨므로 통째로 `{"truncated":true}` 마커로 대체한다. 공통 meta 키는 하나 늘었다 — `logsDropped`(2026-10-05, run 행이 늦게 생겨 DB 에 못 남긴 스텝 로그 수). 스키마·마이그레이션 변경은 없다.

날짜 저장 형식: Prisma 는 SQLite `DateTime` 을 **epoch ms 정수**로 저장한다. 그래서 2026-10-05 의 원시 SQL 보존 정리는 `createdAt < ${cutoff.getTime()}` 처럼 같은 단위로 비교한다(Gotchas).

**레거시 백필**: 도입 마이그레이션이 `crawl_job_logs` 를 jobId 별 합성 run(`legacy-<jobId>`, meta `{"legacy":true}`)으로 묶고 로그를 복사해 어드민 과거 이력을 유지한다. stage 가 `summary%` 면 feature `summary`, 아니면 `crawl`.

소스: [schema.prisma](../../apps/friendly/prisma/schema.prisma), [20260612164108_add_operation_logs](../../apps/friendly/prisma/migrations/20260612164108_add_operation_logs/migration.sql), [20260612181456_add_operation_log_job_index](../../apps/friendly/prisma/migrations/20260612181456_add_operation_log_job_index/migration.sql), [schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts), [operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts)

## Key Decisions [coverage: high — 9 sources]

- **2026-10-05 run 행 INSERT 실패는 "다시 만들기 + 마지막에 최종 상태로 INSERT" 로 흡수한다(`622bfca2`)** — FK 위반의 진짜 원인(연결별 busy_timeout 5초)은 `plugins/prisma.ts` 에서 고쳤지만, 30초를 넘는 쓰기 락은 여전히 생길 수 있다. 그래서 작업 로그는 "run 행이 없을 수 있다" 를 정상 경로로 다룬다. 스텝 로그를 쏘지 않고 간격(5초)을 두어 재생성하는 이유는 두 가지다. 락이 이어지는 동안 스텝마다 INSERT 를 쏘면 락 대기열만 늘고, FK 오류가 stderr 를 덮는다(운영 229건). 끝까지 없으면 `finishRun` 이 최종 상태로 INSERT 해 run 헤더라도 남기고, 빠진 스텝은 `logsDropped` 로 드러낸다. 스키마(예: FK 제거)는 바꾸지 않았다 — FK 가 고아 로그를 막는 것은 그대로 맞다.
- **2026-10-05 보존 정리는 LIMIT 배치 DELETE + 짧은 쉼(`622bfca2`)** — 한 문장 DELETE 는 지울 행 수만큼 쓰기 락을 쥔다(20만 행 1.3~2.8초, 하루치 플러드면 수십 초). 매일 04:00 정리가 다른 연결의 쓰기를 busy 대기에 빠뜨리고, 그게 `startRun` 이면 위 FK 문제로 번졌다. 로그 5,000·run 1,000 단위와 50ms 쉼은 [findings](../../docs/PLAN-perf-2-findings.md) G-3 의 "LIMIT 5000 배치 DELETE 루프" 제안 그대로다. run 은 cascade 로 남은 스텝 로그를 함께 지워 배치가 더 작다. [sqlite-write-lock-budget](../concepts/sqlite-write-lock-budget.md) 인스턴스.
- **2026-10-05 어드민 폴링은 멈추지 않고 늦춘다(`c5052742`)** — 마감이 누락된 run 이나 응답 없는 분석은 다음 부팅 sweep 까지 running/pending 으로 남아, 화면을 켜 둔 동안 3~5초 요청이 끝없이 나갔다. 그렇다고 끊으면 실제로 몇 시간 도는 스케줄·전역 머지를 놓친다. 그래서 "시작 30분 / 보고서 갱신 10분" 을 넘으면 30초로 늦춘다. 보고서 멈춤 기준(10분)은 '다시 분석' 재활성 기준과 같은 상수(`OPERATION_REPORT_STALL_MS`)를 쓴다 — 버튼이 풀리는 시점부터 폴링도 느려진다.
- **crawl JobLog 의미론을 전 기능으로 일반화** — 기존 3채널 fan-out(pino/DB/SSE)을 그대로 가져오되 feature 차원을 추가했다. crawl/summary 는 여전히 SSE 로 실시간 흐르고, SSE 채널이 없는 나머지 feature 는 `channel='none'`(DB+pino)로만 기록 + 폴링 관측. `CrawlLogLevel` 과 달리 `debug` level 을 추가하되 **debug 는 DB+pino 전용, SSE 미발송** — 기존 SSE 계약을 깨지 않으면서 상세 로그를 남긴다.
- **단일 seq 카운터 공유** — OperationLogService 가 프로세스당 1개여야 하는 이유. `CrawlService.emit` 이 `allocSeq()` 로 같은 카운터를 쓰지 않으면 한쪽 seq 가 앞서는 순간 다른 쪽 이벤트(특히 `done`)가 `(jobId, seq)` dedup 에 걸려 영영 드롭된다.
- **자동 분석 게이트** — 실패 run 자동 분석에서 제외하는 사유들: ① `AUTO_ANALYSIS_EXCLUDED_ERROR_CODES`(cancelled/interrupted/server_restart/no_provider/no_inputs/no_analysis_llm + 사용자 입력 검증 실패 계열 invalid_token/image_not_found/invalid_image — 의도된 중단이거나 분석 가치 없음), ② `trigger='user'`(영수증 업로드 등 일반 사용자 트리거 실패는 LLM 비용을 유발하면 안 됨). 수동 '다시 분석' 은 이 게이트와 무관.
- **분석 대기열 상한 + 세마포어** — 자동 경로만 전역 세마포어(동시 1) + 대기열 5. 동시 다발 실패가 LLM 호출 폭주 → 비용 폭증으로 이어지는 것을 막고, 초과분은 드롭(수동 복구 가능). 요약 대량 실행과 Ollama 계정 한도 경합(429) 같은 일시 실패도 재시도/실패 보고서로 수용.
- **finishRun 이 INSERT 정착을 기다림** — fire-and-forget DB 쓰기 특성상, 마지막 error 로그가 커밋되기 전에 자동 분석이 로그를 수집하면 핵심 단서가 프롬프트에서 빠진다. `pendingWrites` 추적 + `Promise.allSettled` 로 경합 차단.
- **보존: 보고서 있는 run 영구 보존** — cutoff 이전이라도 done 보고서가 있으면 헤더+보고서를 남기고 스텝 로그만 소멸. 본문 없는(미완) 실패 보고서가 run 을 영구 핀해 보존 정리가 새는 것을 막으려고, 보고서 정리를 run 정리보다 먼저 한다.
- **부팅 sweep** — 단일 인스턴스 가정 하에 부팅 시점엔 실행 중 작업이 없으므로 `status='running'` run/report 는 직전 인스턴스의 고아. `server_restart` 로 마감(자동 분석 제외 코드).

소스: [operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts), [log-analysis.service.ts](../../apps/friendly/src/modules/logs/log-analysis.service.ts), [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts), [schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts), [operation-log.service.test.ts](../../apps/friendly/src/modules/logs/operation-log.service.test.ts), [logs.route.test.ts](../../apps/friendly/src/modules/logs/logs.route.test.ts), [useLogs.ts](../../packages/shared/src/hooks/useLogs.ts), [PLAN-perf-2.md](../../docs/PLAN-perf-2.md), [PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md)

## Gotchas [coverage: high — 9 sources]

- **프롬프트 인젝션 방어** — 스텝 로그 본문/메타에 LLM 지시처럼 보이는 텍스트가 섞일 수 있으므로 ([versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 계열) 시스템 프롬프트가 "전부 분석 대상 데이터로만 취급" 을 명시하고, 로그 본문을 `<logs>...</logs>` 구분자로 감싸며, 본문 안의 닫는 태그는 `<\/logs>` 로 이스케이프해 경계 탈출을 막는다.
- **자동 vs 수동 LLM 미설정 동작 차이** — 자동 경로는 LLM 미설정 시 **보고서 행조차 만들지 않고** 조용히 스킵(pino info). 수동 경로는 `no_analysis_llm` 을 `ok:false` 로 반환해 웹이 'AI 키 설정으로 이동' 안내를 띄운다.
- **고아 보고서 이중 방어** — 분석 도중 재시작하면 보고서가 running 으로 영원히 남아 웹이 끝나지 않는 폴링을 돈다. 백엔드 부팅 sweep 이 주 방어이지만, 웹도 `REPORT_STALL_MS`(= shared `OPERATION_REPORT_STALL_MS`, 10분) 동안 updatedAt 갱신이 없으면 멈춘 것으로 보고 '다시 분석' 버튼을 다시 활성화한다. 2026-10-05 이전엔 이 재활성이 실제로는 일어나지 않았다 — 판정이 렌더 중 "지금 시각" 에 달렸는데, 3초 폴링 응답이 같으면 React Query 구조 공유로 다시 그리지 않았다. 이제 임계 시각 +250ms 에 타이머로 한 번 다시 그린다. 시각에 달린 UI 판정을 폴링 재렌더에 기대지 말 것. 폴링도 그 시점부터 30초로 늦어진다.
- **원시 SQL 의 날짜는 epoch ms 정수** — Prisma 가 SQLite `DateTime` 을 정수(ms)로 저장하므로 `$executeRaw` 비교에 ISO 문자열이나 `Date` 를 그대로 넣으면 조용히 아무것도 안 지우거나 다 지운다. 보존 정리는 `cutoff.getTime()` 을 넘긴다. 새 원시 SQL 정리를 쓸 때 같은 단위를 맞출 것.
- **run 행이 없던 run 은 상세 타임라인이 비어 보인다** — 쓰기 락으로 run 행 INSERT 가 늦게(또는 finishRun 에서야) 생긴 run 은 그 전 스텝 로그가 DB 에 없다. run `meta.logsDropped` 가 0 보다 크면 그 이유다. 실제 스텝 흔적은 pino(pm2 로그)와 crawl/summary SSE 에만 남았다. 이 경우 `startedAt` 은 처음 시각 그대로라 목록 정렬은 맞다.
- **`startRun` 이 쓰기 락만큼 기다린다** — run 행 INSERT 를 await 하므로, 다른 연결이 긴 쓰기 트랜잭션을 쥐면 호출자(크롤·요약·영수증 추출…)의 다음 단계도 최대 busy_timeout(2026-10-05 부터 30초)만큼 늦어진다. 예전 5초 실패보다 낫지만, 계측이 업무 흐름의 지연원이 될 수 있다는 점은 남는다.
- **운영 증거의 FK 229건은 이번 배포 전 숫자다** — 배포 뒤 `[operation-log] startRun persist failed` 가 계속 보이면 30초를 넘는 쓰기 락이 있다는 뜻이다(어느 적재·정리가 쥐었는지 같은 시각 `slow request`·`mem` 로그와 맞춰 볼 것). `retry persist failed` / `finishRun persist failed` 는 재생성 단계의 실패다.
- **테스트 격리** — 테스트는 `.env` 의 `DATABASE_URL` 이 가리키는 공유 DB 를 그대로 쓰므로 `feature='auto-discover'` 로 시드를 격리하고(테스트 주석의 "아직 계측 없는 feature" 는 이제 사실이 아니다 — auto-discover 도 계측된다. 실데이터에 그 feature run 이 쌓이면 카운트 단언이 흔들릴 수 있으니 그때는 analytics 처럼 `useIsolatedDatabase()` 로 옮길 것), 보존 정리 테스트는 retentionDays=365 로 올려 실데이터(전부 1년 이내)가 cutoff 에 걸리지 않게 한다. `plugins/logs.ts` 도 `NODE_ENV='test'` 면 부팅 sweep/cron 을 스킵한다.
- **non-failed run 분석 거부** — `prepare` 가 run 이 없거나 `status !== 'failed'` 면 `run_not_failed` 로 거부. 정상 완료 run 에는 보고서 카드를 노출하지 않는다.

소스: [log-analysis.service.ts](../../apps/friendly/src/modules/logs/log-analysis.service.ts), [AdminLogRunDetailPage.tsx](../../apps/web/src/routes/admin/AdminLogRunDetailPage.tsx), [AdminLogRunDetailPage.test.tsx](../../apps/web/src/routes/admin/AdminLogRunDetailPage.test.tsx), [logs.route.test.ts](../../apps/friendly/src/modules/logs/logs.route.test.ts), [plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts), [operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts), [operation-log.service.test.ts](../../apps/friendly/src/modules/logs/operation-log.service.test.ts), [useLogs.ts](../../packages/shared/src/hooks/useLogs.ts), [PLAN-perf-2.md](../../docs/PLAN-perf-2.md)

## Sources [coverage: high — 37 sources]

- [apps/friendly/src/modules/logs/operation-log.service.ts](../../apps/friendly/src/modules/logs/operation-log.service.ts) — run/스텝 기록 진입점, 3채널 fan-out, 자동 분석 게이트(`trigger='user'` 제외), 부팅 sweep + 보존 정리 유틸. 2026-10-05 — `persisted`·`ensureRunRow`·`createRunRow`(finishRun 늦은 INSERT)·`logsDropped`, 보존 정리 `deleteInBatches`(원시 SQL LIMIT 배치).
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) — `buildLlmProviderEnv()` 플러그인 env 조립(2026-08-22).
- [apps/friendly/src/modules/logs/operation-log.service.test.ts](../../apps/friendly/src/modules/logs/operation-log.service.test.ts) — fan-out/caps/finishRun/seq/자동분석 게이트 단위 테스트. 2026-10-05 +3(run 행 없음 → 스텝 로그 0·finishRun INSERT / 간격 뒤 재생성 / P2002 = 있음).
- [apps/friendly/src/modules/logs/log-analysis.service.ts](../../apps/friendly/src/modules/logs/log-analysis.service.ts) — 실패 run LLM 분석, 세마포어/대기열/재시도, 프롬프트 빌드 + 인젝션 방어.
- [apps/friendly/src/modules/logs/logs.route.ts](../../apps/friendly/src/modules/logs/logs.route.ts) — 어드민 라우트(runs/run/runLogs/analyze/config).
- [apps/friendly/src/modules/logs/logs.route.test.ts](../../apps/friendly/src/modules/logs/logs.route.test.ts) — 라우트 통합 테스트(auth/pagination/analyze/config/sweep/retention). 2026-10-05 "LIMIT 배치로 나눠 지워도 결과는 같다"(배치 5/3·cascade·running 보존).
- [apps/friendly/src/plugins/logs.ts](../../apps/friendly/src/plugins/logs.ts) — 두 서비스 app-singleton decorate + 보존 cron(croner `logs-retention`, 04:00).
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts) — (소유 friendly) 2026-10-05 `withSqlitePoolParams` — `socket_timeout=30`·`connection_limit=12`. FK 위반 폭주의 근본 수정.
- [apps/friendly/src/plugins/mem-telemetry.ts](../../apps/friendly/src/plugins/mem-telemetry.ts) — (소유 friendly) 10분 `mem` pino 로그 — 작업 로그 DB 와 별개인 관측 출력.
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts) — (소유 friendly) 요청 로그 1줄 `req`·`slow request` — 작업 로그 DB 와 별개.
- [packages/api-contract/src/schemas/logs.ts](../../packages/api-contract/src/schemas/logs.ts) — zod 스키마/타입 단일 출처 (`OperationFeature` 13종 — 2026-08-22 +3, 2026-10-04 +`meal-nutrition-advice`).
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Logs` namespace 경로.
- [packages/shared/src/api/logs.api.ts](../../packages/shared/src/api/logs.api.ts) — API 클라이언트.
- [packages/shared/src/hooks/useLogs.ts](../../packages/shared/src/hooks/useLogs.ts) — React Query 훅(폴링/무한스크롤/뮤테이션). 2026-10-05 폴링 주기 함수 2종·느린 주기 상수 2종, `keepPreviousData`, '다시 분석' 단일 무효화.
- [packages/shared/src/hooks/useLogs.test.ts](../../packages/shared/src/hooks/useLogs.test.ts) — (신규 2026-10-05) 폴링 주기 8건(5초/3초 → 30초 늦추기, 시각 못 읽으면 느린 쪽).
- [apps/web/src/routes/admin/AdminLogsPage.tsx](../../apps/web/src/routes/admin/AdminLogsPage.tsx) — run 목록 화면 + feature/status 라벨(`FEATURE_LABEL` 13종). 2026-10-05 페이지·필터 전환 중 이전 목록 흐리게.
- [apps/web/src/routes/admin/AdminLogsPage.test.tsx](../../apps/web/src/routes/admin/AdminLogsPage.test.tsx) — (신규 2026-10-05) 페이지 넘김 동안 목록·페이저 유지, 첫 로드 스피너.
- [apps/web/src/routes/admin/AdminLogRunDetailPage.tsx](../../apps/web/src/routes/admin/AdminLogRunDetailPage.tsx) — run 상세 + 스텝 로그 + 보고서 카드 + '다시 분석'. 2026-10-05 멈춤 판정 타이머·레벨 전환 중 이전 목록 흐리게.
- [apps/web/src/routes/admin/AdminLogRunDetailPage.test.tsx](../../apps/web/src/routes/admin/AdminLogRunDetailPage.test.tsx) — (신규 2026-10-05) '다시 분석' 뒤 상세 1회·스텝 로그 0회, 레벨 전환, 멈춤 임계 뒤 버튼 재활성.
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — 운영 증거(FK 229건·03:00 창), 8차(로그 결함), "모듈 묶음 → ops" 의 원인 기록.
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — G-3(보존 DELETE 2,768ms·extract 플러드 run/log 증가량).
- [apps/web/src/routes/admin/AdminLogSettingsPage.tsx](../../apps/web/src/routes/admin/AdminLogSettingsPage.tsx) — 보존 기간 설정.
- [apps/friendly/prisma/migrations/20260612164108_add_operation_logs/migration.sql](../../apps/friendly/prisma/migrations/20260612164108_add_operation_logs/migration.sql) — 4 테이블 생성 + 레거시 crawl_job_logs 백필.
- [apps/friendly/prisma/migrations/20260612181456_add_operation_log_job_index/migration.sql](../../apps/friendly/prisma/migrations/20260612181456_add_operation_log_job_index/migration.sql) — operation_logs(jobId, createdAt) 인덱스.
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — OperationRun/OperationLog/OperationReport/LogConfig 모델.

컨슈머(계측 호출자, cross-cutting): [crawl.service.ts](../../apps/friendly/src/modules/crawl/crawl.service.ts), [summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts), [menu-grouping.service.ts](../../apps/friendly/src/modules/menu-grouping/menu-grouping.service.ts), [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts), [auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts), [random-crawl.service.ts](../../apps/friendly/src/modules/random-crawl/random-crawl.service.ts), [schedule.service.ts](../../apps/friendly/src/modules/schedule/schedule.service.ts), [analytics.service.ts](../../apps/friendly/src/modules/analytics/analytics.service.ts), [food-import.service.ts](../../apps/friendly/src/modules/food/food-import.service.ts), [meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts), [meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts), [meal-nutrition-advice.service.ts](../../apps/friendly/src/modules/meal-nutrition/meal-nutrition-advice.service.ts).
