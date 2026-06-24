---
concept: operation-log-instrumentation
last_compiled: 2026-06-25
topics_connected: [logs, friendly, crawl, schedule, analytics, menu-grouping, random-crawl, auto-discover, ai]
status: active
---

# operation-log-instrumentation — 전 기능을 가로지르는 범용 작업 로그

## Pattern

서비스 안의 모든 백그라운드/동기 작업이 자기만의 로그 채널을 따로 갖는 대신, **같은 모양의 계측 호출 세 개**로 한 테이블 체계에 기록한다: `startRun(feature, …)` 로 run 경계를 열고, 각 단계에서 `log({ runId, stage, level, message })` 를 찍고, `finishRun(runId, { status })` 로 닫는다. 도메인이 크롤이든 정산 추출이든 글로벌 머지든 호출 모양이 동일하므로, 어드민은 "어떤 기능의 어떤 실행이 언제 시작·종료했고 왜 실패했나"를 **한 화면·한 스키마**(`OperationRun`/`OperationLog`)에서 본다.

세 가지가 이 패턴을 단순한 로깅 헬퍼 이상으로 만든다:

1. **실패 자가 진단** — `status='failed'` 로 닫힌 run 은 `finishRun` 이 fire-and-forget 으로 LLM 분석을 띄워 `OperationReport`(summary/rootCause/details/suggestions/severity)를 자동 생성한다. 실패의 근거가 되는 스텝 로그가 이미 같은 테이블에 있으니, 분석기는 run id 하나로 단계별 로그를 읽어 원인을 진단한다.
2. **중첩 run** — 부모 run 이 `parentRunId` 로 자식 run 을 묶는다. 스케줄러 한 회차가 그 안에서 띄운 메뉴 그룹핑·글로벌 머지 run 을 자식으로 달아, 어드민에서 한 흐름으로 펼친다.
3. **3채널 fan-out + 단일 seq** — 한 번의 `log` 호출이 pino / DB / SSE 세 곳으로 흩어지되, SSE seq 는 프로세스당 1개인 `allocSeq()` 단일 발급기에서 나온다. 이 발급기를 크롤의 진행 이벤트(`CrawlService.emit`)가 공유하므로 로그와 진행 이벤트의 seq 가 한 소스에서 단조 증가한다.

기존엔 도메인마다 로그가 흩어져 있었고(크롤의 `CrawlJobLog` 가 크롤+요약 한정), 이 패턴은 그 3채널 fan-out 의미론을 feature 차원만 더해 전 기능으로 일반화한 후속이다.

## Instances

- **핵심 진입점** in [[../topics/logs]] (`operation-log.service.ts`): `OperationLogService` 가 패턴의 기록 진입점. `startRun` 은 `randomUUID()` 로 id 를 **사전 생성**한 뒤 INSERT — DB 쓰기가 실패해도 id 를 반환해 호출자의 비즈니스 흐름(스텝 log/finishRun)이 끊기지 않는다. feature/jobId/subjectId/trigger/meta 를 인메모리 `contexts` Map 에 보관해 후속 `log` 가 보충받는다. `log` 는 동기 시그니처로 3채널 fan-out: pino(debug 포함 4종 level), SSE(`channel='crawl'` → `jobRegistry`, subjectId 있으면 같은 seq 로 `summaryEventsBus` 동시 발송; `channel='summary'` → bus 만; **`level='debug'` 는 SSE 로 절대 안 보냄** — `CrawlLogLevel` info|warn|error 3종 계약 보호), DB(fire-and-forget INSERT; context 없으면 FK/enum 오염 피해 DB 만 생략). `finishRun` 은 **절대 던지지 않고**(호출자 finally 보호) 종료 상태로 update.
- **app-singleton decorate** in [[../topics/logs]] / [[../topics/friendly]] (`plugins/logs.ts`): `OperationLogService`·`LogAnalysisService` 를 app 전역 singleton 으로 decorate. **프로세스당 정확히 1개여야** seq 카운터/in-flight 가드가 한 곳에 모이고 `(jobId, seq)` dedup 이 안 깨진다 ([[in-memory-singleton-gates]] 인스턴스). `dependencies: ['prisma']` 로 autoload 순서를 강제(알파벳순 `logs` < `prisma`). `app.aiConfig` 는 `summaries` 가 decorate 하는데 `logs` < `summaries` 라 재사용 불가 → 자체 `AiConfigService` 생성.
- **단일 seq 공유 (78% 멈춤 fix)** in [[../topics/crawl]] (`crawl.service.ts` `emit`): `CrawlService.emit` 이 progress/visitor_progress/done 이벤트의 seq 를 `this.operationLog.allocSeq()` 로 받는다(미주입 테스트만 자체 `nextSeq++` 폴백). 로그 이벤트와 진행 이벤트가 같은 `crawl` SSE 스트림에 섞여 흐르므로, 둘이 각자 카운터를 쓰면 한쪽 seq 가 앞서는 순간 다른 쪽 이벤트(특히 `done`)가 클라이언트의 `(jobId, seq)` dedup 에 걸려 영영 드롭된다 — 진행률이 78% 같은 지점에서 멈추던 증상의 근본 원인. 이 `(jobId, seq)` 단일 발급 위탁은 [[stream-driven-cache-merge]] 의 "서버가 한 ID 공간을 미리 발급해 멀티 채널 dedup 을 가능케 한다"는 가장 강한 인스턴스와 직결.
- **요약 계측 + 자식 run** in [[../topics/crawl]] / [[../topics/friendly]] (`crawl.service.ts`, `summary.service.ts`): feature `summary`, `channel='summary'`. bulk 크롤 run 이 항목별 파생 요약 run 을 `parentRunId: runId` 로 자식 연계 — 한 크롤 잡이 안에서 띄운 요약들이 부모 run 아래로 묶인다.
- **SSE 없는 feature** in [[../topics/menu-grouping]] / [[../topics/analytics]] (`menu-grouping.service.ts`, `settlement-extraction.service.ts`, `auto-discover.service.ts`, `analytics.service.ts`): 같은 `startRun → log → finishRun` 모양을 `channel='none'`(DB+pino만)로 기록. SSE 채널이 없는 feature 라 진행 중 run 은 어드민이 폴링으로 따라가지만, 계측 호출 표면은 크롤과 한 글자도 다르지 않다. analytics 의 global-merge 가 대표.
- **2 run 분리** in [[../topics/random-crawl]] (`random-crawl.service.ts`): 한 회차가 **발굴 run**(`feature: 'random-crawl'`, 지역 선정→검색→후보 선택)을 띄우고, 후보가 정해지면 `crawl.startCrawl` 이 **자체 `crawl` run 을 따로 만든다**(소스 주석: "crawl.startCrawl 이 자체 oplog run 을 만든다"). 즉 한 사용자 행위가 서로 다른 feature 의 독립 run 두 개로 갈리는 사례 — 중첩(`parentRunId`)이 아니라 두 run 이 candidate/jobId 로 느슨하게 이어진다.
- **중첩 run 대표 사례** in [[../topics/schedule]] (`schedule.service.ts`): feature `schedule` 의 run 이 그 안에서 띄우는 자식 menu-grouping/global-merge run 을 `parentRunId: opRunId` 로 명시 연계(`analytics.runGlobalMerge({ parentRunId })`). 어드민 `/admin/logs` 에서 스케줄 회차를 펼치면 자식 작업들이 한 흐름으로 보인다. `finishRun` 전에 카운트 스냅샷을 확보(`finishRun` 이 status 를 바꾸기 전)해 meta 에 싣는다.
- **실패 run LLM 분석** in [[../topics/logs]] / [[../topics/ai]] (`log-analysis.service.ts`): `LogAnalysisService` 가 실패 run 1건의 스텝 로그를 'log-analysis' 용도 LLM(`ollama-cloud`)에 보내 보고서 생성. **자동**(`finishRun` fire-and-forget) 경로는 전역 세마포어(동시 1) + 대기열 상한 5 를 거쳐 실패 폭주 시 LLM 비용 폭증을 막는다(초과분 드롭, 수동 복구). **수동**(`requestAnalysis`, POST /analyze)은 running 보고서 upsert 후 즉시 running 스냅샷 반환, LLM 호출은 백그라운드 fire → 웹이 폴링으로 완료 확인. 자동 분석 게이트: `AUTO_ANALYSIS_EXCLUDED_ERROR_CODES`(cancelled/interrupted/server_restart/no_provider/no_inputs/no_analysis_llm + 사용자 입력 검증 실패 계열 invalid_token/image_not_found/invalid_image) **+ `trigger='user'`**(일반 사용자 트리거 실패는 LLM 비용 유발 금지). `runId` 별 `inflight` Set 가 자동/수동 중복 방지. `MAX_ATTEMPTS=3`, timeout/upstream_failed/parse_failed 만 재시도. 프롬프트 인젝션 방어로 로그 본문을 `<logs>…</logs>` 로 감싸고 닫는 태그를 이스케이프 ([[versioned-llm-prompts]] 계열).
- **finishRun barrier** in [[../topics/logs]] (`operation-log.service.ts` `pendingWrites` / `finishRun`): 부차적이지만 패턴의 정합성을 떠받치는 인스턴스. `log` 의 DB INSERT 가 fire-and-forget 이라, 마지막 error 로그가 커밋되기 전에 자동 분석이 로그를 수집하면 핵심 단서가 프롬프트에서 빠진다. `finishRun` 이 자동 분석을 띄우기 전 `pendingWrites` Set 의 미결 INSERT 를 `Promise.allSettled` 로 barrier — fire-and-forget 의 속도와 분석 정합성을 동시에 챙긴다.
- **레거시 백필** in [[../topics/logs]] / [[../topics/crawl]] (`20260612164108_add_operation_logs/migration.sql`): 패턴 도입 마이그레이션이 레거시 `crawl_job_logs` 를 jobId 별 합성 run(`legacy-<jobId>`, meta `{"legacy":true}`)으로 묶고 로그를 복사해 어드민 과거 이력을 보존. stage 가 `summary%` 면 feature `summary`, 아니면 `crawl` — 옛 로그도 새 스키마의 run 모양으로 흡수.

## What This Means

이 패턴이 알려주는 것:

1. **계측 표면을 한 모양으로 고정하면 관측성이 cross-cutting 으로 공짜가 된다** — 새 feature 가 `startRun → log → finishRun` 세 줄만 부르면 어드민 화면·실패 분석·보존 정리가 전부 따라온다. 도메인별 로그 화면을 따로 짤 필요가 없다. SSE 채널 유무는 `channel` 한 인자로만 갈리고, 나머지 표면은 동일.
2. **단일 seq 발급기가 멀티 채널 dedup 의 전제** — 크롤의 진행 이벤트와 로그 이벤트가 한 SSE 스트림에 섞이는 한, seq 는 반드시 한 카운터에서 나와야 한다. `OperationLogService` 가 프로세스당 1개여야 하는 이유가 바로 이것이고, 이는 [[stream-driven-cache-merge]] 의 "(jobId,seq) 단일 발급" 과 [[in-memory-singleton-gates]] 가 logs 모듈에서 만나는 지점이다.
3. **실패를 데이터로 남기면 진단을 자동화할 수 있다** — run/스텝 로그가 이미 구조화돼 있으니 LLM 분석기는 run id 하나만 받으면 된다. 다만 LLM 비용이 실패 횟수에 비례해 폭발할 수 있어, 자동 경로는 세마포어 + 대기열 + 제외 코드 + `trigger='user'` 게이트로 둘러싸였다([[in-memory-singleton-gates]] 비용 게이트, [[versioned-llm-prompts]] 인젝션 방어). 수동 '다시 분석' 은 이 게이트와 무관한 복구 경로.
4. **중첩과 분리는 둘 다 정당하다** — 스케줄러처럼 한 run 이 자식 작업을 직접 지휘하면 `parentRunId` 중첩이 맞고, random-crawl 처럼 발굴과 크롤이 책임 경계가 다른 독립 작업이면 두 run 으로 갈리는 게 맞다. 같은 테이블 체계가 두 관계를 다 표현한다.

이 패턴이 깨질 수 있는 시점:
- **fire-and-forget 경합** — `log` 의 DB 쓰기가 비동기라 `finishRun`/자동분석과 경합한다. `pendingWrites` barrier 가 마지막 단서를 지키지만, barrier 를 우회하는 새 경로가 생기면 분석 프롬프트가 핵심 로그를 놓친다.
- **debug 가 SSE 로 새는 순간** — `level='debug'` 가 SSE 로 나가면 `CrawlLogLevel` 3종 계약이 깨져 클라이언트 reducer 가 오염된다. debug 의 SSE 차단은 계약 경계이지 단순 노이즈 컷이 아니다.
- **seq 발급기가 둘로 갈릴 때** — `OperationLogService` singleton 이 깨지거나 `emit` 이 `allocSeq` 공유를 멈추면 78% 멈춤 증상이 재발한다.
- **자동 분석 게이트가 새는 순간** — 제외 코드/`trigger='user'` 분기가 빠지면 일반 사용자 실패(영수증 업로드 등)마다 LLM 비용이 발생한다.

## Sources

- [[../topics/logs]]
- [[../topics/friendly]]
- [[../topics/crawl]]
- [[../topics/schedule]]
- [[../topics/analytics]]
- [[../topics/menu-grouping]]
- [[../topics/random-crawl]]
- [[../topics/auto-discover]]
- [[../topics/ai]]
- [[stream-driven-cache-merge]]
- [[in-memory-singleton-gates]]
- [[versioned-llm-prompts]]
