---
topic: auto-discover
last_compiled: 2026-10-10
sources_count: 18
status: active
aliases: [자동 발견, auto-discover, AutoDiscoverService, AutoDiscoverRegistry, auto-discover-jobs, generating_keywords, awaiting_confirmation, 등록 시작, jobConfirm, useConfirmAutoDiscover, waitForConfirmation, buildFallbackKeywords, AUTO_DISCOVER_KEYWORD_COUNT, GROUP_SIZE, AUTO_DISCOVER_GROUP_SIZE, 순차 큐, group-of-5, waitForCrawlTerminal, waitForTerminal, CRAWL_WAIT_TIMEOUT_MS, crawlWaitTimeoutMs, already_registered, target_reached, activeAutoDiscoverJobStore, useAutoDiscoverJob, useStartAutoDiscover, AdminAutoDiscoverPage, AutoDiscoverJobCard, AutoDiscoverForm, buildLlmProviderEnv, app.crawl]
---

# auto-discover — 영역명 한 줄로 AI 검색어 생성 → 다중 검색 → 확인 후 한 곳씩 자동 크롤·등록

**2026-10-05 변경 흡수 — 앱 싱글톤 `app.crawl` 사용·후보 크롤 종료 대기 60분 상한·검색 타임아웃 합성(`ab7dad28`) + 작업 카드 재렌더 축소(`e50ccfe6`), 그리고 06-10 이후 누락 보정**: (1) **자체 조립 제거(A-1·A-3·A-V1)** — [auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) 가 `ReviewSearchService`·`SummaryService`·`CanonicalService`·`ProposalService`·`CrawlService` 를 직접 만들던 것을 지우고 [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 의 `app.crawl` 을 주입한다(`RestaurantService`·`AiConfigService` 는 여전히 라우트가 만든다 — 키워드 생성용). 예전 배선의 결함 셋: ① 자체 `CrawlService` 의 actor 대기열이 수동 크롤 라우트의 인스턴스와 갈라져, 같은 어드민이 수동 크롤로 슬롯 5개를 쓰는 동안 큐에 든 자동 발견 크롤이 **영영 시작되지 않았고** — 대기에 상한도 없어 잡이 끝나지 않으니 새 자동 발견은 재시작 전까지 409(findings A-V1, 재현 `v-queue.ts`), ② 결과 캐시 Map 이 하나 더 쌓였고, ③ 파생 요약이 전용 `SummaryService` → 전용 `ReviewSearchService` 로 흘러 enrich 완료 → 군집화 배선에 닿지 않아 이 경로로 등록한 가게는 재시작 전까지 군집 '대기'([review-clustering](review-clustering.md)). (2) **종료 대기 상한** — 서비스 자체 `waitForCrawlTerminal`(상한 없음) 대신 [job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts) `waitForTerminal(jobId, CRAWL_WAIT_TIMEOUT_MS = 60분)`(대기열 시간 포함, 테스트는 `crawlWaitTimeoutMs` 주입). `'timeout'` 이면 `crawl.cancel(jobId, actorId)` 후 후보를 `failed`("크롤이 60분 안에 끝나지 않아 취소했습니다.")로 닫고 다음 후보로 — 잡은 계속 진행해 정상 종료한다. (3) **검색 타임아웃(A-8)** — 키워드 검색은 잡 abort signal 을 `searchPlacesViaMapNaver` 에 넘기는데, 예전 어댑터는 signal 이 있으면 자체 타임아웃을 꺼서 업스트림이 멈추면 undici 기본(~300초)까지 매달렸다. 이제 signal 과 자체 8초 타임아웃을 합성한다([crawl](crawl.md)). (4) **웹(`e50ccfe6`)** — [AutoDiscoverJobCard.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx) 가 큐/사전 제외 분리와 상태별 건수(done·failed·skipped·큐 done)를 한 번의 순회로 세고(예전엔 후보 이벤트 1건마다 배열을 네 번 더 훑음), `CandidateRow` 를 `memo` 로 — 훅이 바뀐 후보만 새 객체로 바꾸므로 나머지 행은 bail-out. (5) **누락 보정(24~28차 위키가 놓친 2026-06-10 `5f050604`)** — 아래 본문이 "그룹 5개 병렬" 로 적혀 있었지만 실제로는 그날부터 **`GROUP_SIZE = 1` 순차 큐**(레스토랑 간 병렬 크롤이 네이버 블록을 유발할 수 있어서)이고, 검색이 끝나면 **`awaiting_confirmation` 단계에서 사용자의 "등록 시작"(`POST …/jobs/:id/confirm`)을 기다린 뒤** 크롤을 시작한다. 본문을 이에 맞춰 고쳤다. 테스트: [auto-discover.test.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.test.ts) +1(상한 초과 → 취소·실패·잡 정상 종료). 계약·라우트 변경 없음(전부 어드민).

**2026-08-22 변경 흡수 — 라우트 env 조립 `buildLlmProviderEnv()`(`cc8399a`)**: [auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) 가 자체 `LlmProviderEnv` 리터럴(`env.OLLAMA_*` 5필드 + `defaultModels` 3키) 대신 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 로 `AiConfigService` 를 조립한다 — purpose 가 5종으로 늘면서(`meal-photo`·`meal-recommend`) 리터럴 복제 26곳을 한 곳으로 모은 [ai](ai.md) 변경의 소비처. 키워드 생성 호출 자체(`getResolved('ollama-cloud', 'chat')` + fallback 정책)는 그대로. *(이때 라우트가 함께 만들던 `SummaryService`·`ReviewSearchService` 용 인스턴스는 2026-10-05 에 사라졌다 — 지금 이 `AiConfigService` 는 키워드 생성 전용.)*

## Purpose [coverage: high — 5 sources]

운영자가 영역명 한 줄("강남역") + 카테고리 칩 + 목표 등록 수만 던지면, AI 가 검색 키워드 8 개를 만들고 → 네이버 지도를 키워드별로 병렬 검색하고 → 결과를 dedupe 한 뒤 → 후보 큐를 보여 주고 운영자가 "등록 시작" 을 누르면 → **한 곳씩** Naver Place 크롤·등록까지 처리하는 백그라운드 잡. 기존 `/admin/discover` 의 수동 흐름(키워드 직접 입력 → 결과 보고 한 건씩 등록)은 그대로 두고 별도 메뉴로 추가됐다. 어드민이 한 영역의 신규 가게 N 개를 "그냥 채워라" 할 수 있는 게 의도.

잡은 actor 당 정확히 1 개로 제한된다. AI 호출 + 키워드 8 개 검색 + 순차 크롤이 동시에 두 개 돌면 부하 예측이 어려워, 다이닝코드 bulk-save 가 다중 동시 진행을 허용하던 것과 의도적으로 다른 결정이었다(다이닝코드도 2026-07-13 부터 actor 당 1잡 — [crawl](crawl.md)).

## Architecture [coverage: high — 8 sources]

코어는 `AutoDiscoverService` + `AutoDiscoverRegistry` 두 클래스. 라우트가 잡 생성 직후 `runAutoDiscover` 를 fire-and-forget 으로 호출하고 즉시 초기 snapshot 응답. 진행은 SSE 로 흐른다. 크롤은 [plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) 의 앱 싱글톤 `app.crawl`(2026-10-05~)을 쓴다 — 같은 어드민의 수동 크롤과 결과 캐시·actor 슬롯 5개·대기열을 공유한다.

```
POST /admin/auto-discover/jobs
   │
   ▼
[Registry.create] → pending → jobId 반환
   │
   ▼ (백그라운드, OperationRun feature='auto-discover')
Phase 1: generating_keywords
   ├─ AiConfigService.getResolved('ollama-cloud')
   ├─ provider.complete (Ollama JSON schema 강제 8개)
   └─ 실패/부족 → buildFallbackKeywords 로 보충 → 항상 정확히 8개
   │
   ▼
Phase 2: searching (Promise.all)
   ├─ 키워드 8개 병렬 searchPlacesViaMapNaver (잡 signal + 자체 8초 타임아웃)
   ├─ keyword 이벤트 8×(pending→searching→done|failed)
   └─ placeId 첫 등장만 보존하는 dedupe
   │      → 이미 등록된 placeId 는 skipped(already_registered, groupIndex=-1)
   │      → 남은 후보에 순번 groupIndex(GROUP_SIZE=1 이라 0,1,2,…)
   │
   ▼
Phase 2.5: awaiting_confirmation  ← 2026-06-10~
   └─ registry.waitForConfirmation — POST …/confirm 또는 취소(abort)까지 대기(상한 없음)
   │
   ▼
Phase 3: crawling (한 곳씩 순차)
   for each candidate:
     if abort or newlyRegistered >= targetCount: break
     runOneCrawl
        ├─ app.crawl.startCrawl(url, actorId, 'create')
        └─ jobRegistry.waitForTerminal(jobId, 60분)   ← 2026-10-05~
             'timeout' → crawl.cancel + 후보 failed
   │
   ▼
markFinished('done'|'cancelled'|'failed') + done 이벤트 + finishRun
잔여 후보 → skipped(target_reached | cancelled)
```

`GROUP_SIZE` 는 상수로 남아 있어(`AUTO_DISCOVER_GROUP_SIZE` 로 export — 테스트가 import) 그룹 루프 구조(`Promise.all(group.map(runOneCrawl))`, 그룹 사이 abort/target 체크, 잔여 skipped 의 시작 인덱스 `startedGroups * GROUP_SIZE`)는 그대로지만 그룹 = 후보 1곳이다.

Key files:
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) -- 3 단계(+확인 대기) 러너. `GROUP_SIZE=1`(2026-06-10 `5f050604` 에 5→1), `CRAWL_WAIT_TIMEOUT_MS=60분`(2026-10-05). 단계마다 `operationLog` 스텝(`queued`/`generating_keywords`/`searching`/`awaiting_confirmation`/`crawling`, 후보별 스텝은 `subjectId=placeId`).
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts) -- in-memory 잡 상태. `FINISHED_TTL_MS=10분` GC + per-actor 격리. `confirm`/`waitForConfirmation`(확인 대기 Promise 집합), `cancel` 은 abort + 확인 대기 해제.
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts) -- 시스템 프롬프트 + Ollama JSON schema (`minItems=maxItems=8`) + `buildFallbackKeywords`.
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) -- POST/GET/confirm/DELETE + SSE. SSE 는 token query 인증. 크롤은 `app.crawl`.
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts) -- zod 계약 + phase/state/skipReason enum(`AutoDiscoverPhase` 에 `awaiting_confirmation`).

## Talks To [coverage: high — 8 sources]

- **ai** (in-process: `AiConfigService.getResolved('ollama-cloud', 'chat')` + `adapterCache`) -- LLM provider/model 해석. 미설정이면 fallback 키워드로 진행(잡은 안 죽음). 라우트의 `AiConfigService` 는 `buildLlmProviderEnv()`(2026-08-22)로 조립 — `.env` 폴백 규칙은 [ai](ai.md).
- **crawl** (in-process: `app.crawl.startCrawl` + `jobRegistry.waitForTerminal`/`cancel`) -- 후보 한 건 등록은 Naver Place 파이프라인 그대로 호출. 2026-10-05 부터 앱 싱글톤이라 actor 대기열이 수동 크롤과 하나다(슬롯이 비면 이어서 시작). 종료 대기는 레지스트리의 공용 `waitForTerminal`(상한 60분) — 예전 서비스 자체 `waitForCrawlTerminal`(구독만, 상한 없음)은 삭제됐다. [crawl](crawl.md).
- **crawl/naver-search** (HTTP: `searchPlacesViaMapNaver`) -- 키워드별 `pageSize=50` 으로 nx-api 검색. 잡 `AbortSignal` 전파 + (2026-10-05~) 어댑터 자체 타임아웃 `CRAWL_SEARCH_HTTP_TIMEOUT_MS`(8000) 합성.
- **restaurant** (in-process: `findRegisteredByPlaceIds`, `findByPlaceId`) -- 이미 등록 placeId 사전 분리 + 크롤 종료 후 restaurant row 조회로 outcome 확인.
- **summary** (in-process: `extractFirstJsonObject`) -- LLM 응답에서 JSON 객체 추출 유틸 재사용. 등록된 가게의 요약 자체는 `app.crawl` 이 들고 있는 앱 싱글톤 `app.summaries` 로 큐잉 → enrich → 군집화(2026-10-05~).
- **logs** (in-process: `OperationLogService`) -- 잡 1회 = OperationRun 1개(`feature: 'auto-discover'`, `trigger: 'manual'`). 종료 경계(`finally`) 한 곳에서 registry 최종 상태 → run 상태로 매핑(done → done + 후보 집계 meta, cancelled → cancelled, 그 외 → failed). `awaiting_confirmation` 대기 동안 run 이 오래 `running` 인 것은 정상이고 재시작 고아는 부팅 sweep 이 `server_restart` 로 마감한다(코드 주석). [logs](logs.md).

## API Surface [coverage: high — 5 sources]

라우트 (`auto-discover.route.ts`, prefix `/api/v1`):

- `POST Routes.AutoDiscover.jobs` body=`AutoDiscoverJobInput` (`{q, categories[], targetCount 1..50}`) → `AutoDiscoverJobSnapshot`. per-actor 1잡 정책 — 같은 actor 의 `pending`/`running` 잡이 있으면 **409 conflict** ("이미 진행 중인 자동 발견 잡이 있습니다.").
- `GET Routes.AutoDiscover.job(:id)` → `AutoDiscoverJobSnapshot`. 새로고침/재접속 직후 SSE 보다 먼저 polling. 다른 actor 잡은 404.
- `POST Routes.AutoDiscover.jobConfirm(:id)` (`…/jobs/:id/confirm`, 2026-06-10) → 204. `awaiting_confirmation` 에서 기다리는 러너를 깨운다. idempotent — 이미 확인됐거나 아직 대기 단계 전이어도 204(확인 플래그가 먼저 서면 대기 없이 통과). 종료된 잡·다른 actor 는 404.
- `DELETE Routes.AutoDiscover.job(:id)` → 204 idempotent. `AbortController.abort()` + 확인 대기 해제 — 진행 중인 후보 크롤은 끝까지 가고(아래 Gotchas), 다음 후보는 시작 직전 abort 체크에서 차단.
- `GET Routes.AutoDiscover.jobEvents(:id)?token=...` → SSE. 이벤트 5 종: `snapshot`(연결 직후 1회), `keyword`, `candidate`, `phase`, `done`. `:` heartbeat 15 초.

서버 클래스:
- `AutoDiscoverService.runAutoDiscover(jobId, actorId)` — 라우트가 fire-and-forget 으로 호출. await 안 함.
- `AutoDiscoverRegistry` — `findInFlightByActor`, `create`, `markRunning`, `setPhase`, `upsertKeyword`, `upsertCandidate`, `incrementNewlyRegistered`, `getNewlyRegistered`, `confirm`, `waitForConfirmation`, `markFinished`, `subscribe`, `cancel`.

FE 훅 (`@repo/shared`):
- `useStartAutoDiscover()` — mutation, 성공 시 `activeAutoDiscoverJobStore` 에 jobId 박고 캐시에 초기 snapshot 저장.
- `useAutoDiscoverJob(jobId)` — GET + SSE 통합 훅. `useDiningcodeBulkSaveJob` 와 동형이지만 candidate 가 groupIndex(지금은 순번)로 정렬되고 phase 이벤트가 추가.
- `useConfirmAutoDiscover()` — POST confirm(phase 전환은 SSE 로 들어온다). 페이지가 카드의 "등록 시작" 버튼에 연결.
- `useCancelAutoDiscover()` — DELETE.

API: [packages/shared/src/api/autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts), 훅: [packages/shared/src/hooks/useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts), 경로: [routes.ts](../../packages/api-contract/src/routes.ts) `AutoDiscover`.

## Data [coverage: medium — 3 sources]

DB 테이블 없음 — 잡 상태는 전부 in-memory. 결과는 `Restaurant` 행을 새로 만드는 것 (crawl 도메인의 기존 파이프라인이 채움). 진행 기록은 operation_logs 의 run·스텝으로 남는다.

`AutoDiscoverRegistry` 의 `InternalJob` ([auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts)):

```
id, actorId, state, phase
input: AutoDiscoverJobInputType
keywords: Map<keyword, AutoDiscoverKeyword>      // 8개
keywordOrder: string[]                            // AI 응답 순 안정
candidates: Map<placeId, AutoDiscoverCandidate>
candidateOrder: string[]                          // 큐 순번 → 첫 등장 순
newlyRegistered: number                           // 등록 성공 카운트, targetCount 와 비교
confirmed: boolean                                // "등록 시작" 확인 여부 (2026-06-10)
confirmWaiters: Set<() => void>                   // 확인 대기 중인 러너의 resolve
events: AutoDiscoverJobEvent[]                    // EVENT_BUFFER_MAX=2000 ring
subscribers: Set<AutoDiscoverJobSubscriber>
abort: AbortController
```

`FINISHED_TTL_MS=10분` — 잡 종료 후 10 분 지나면 GC. 서버 재시작 시 in-flight 잡은 사라짐(사용자가 재실행 — AI/검색 비용은 다시 들지만 등록은 idempotent, 이미 등록된 placeId 는 다음 잡에서 `already_registered` 로 자동 스킵).

상수: `AUTO_DISCOVER_KEYWORD_COUNT=8`, `GROUP_SIZE=1`, `CRAWL_WAIT_TIMEOUT_MS=60분`(2026-10-05), `AI_TEMPERATURE=0.7`·`AI_MAX_TOKENS=800`·`AI_NUM_CTX=4096`, 검색 `pageSize=50`, `targetCount` 1~50.

FE 활성 잡 ID: [activeAutoDiscoverJobStore](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts) — zustand persist `lp:activeAutoDiscoverJob`. 페이지 새로고침/이동 후에도 진행 카드 이어보기. 404 응답 시 자동 clear.

## Key Decisions [coverage: high — 9 sources]

- **2026-10-05: 크롤은 앱 싱글톤 `app.crawl` 로, 종료 대기는 레지스트리의 공용 `waitForTerminal` 로** (`ab7dad28`) — 라우트가 따로 조립한 `CrawlService` 는 대기열이 수동 크롤과 갈라져 잡이 영원히 끝나지 않을 수 있었다(A-V1). 싱글톤 + 공유 대기열로 원인을 없애고, 60분 상한(대기열 시간 포함 — 리뷰 100페이지 크롤 ~15분이 다른 크롤 뒤에서 기다리는 경우까지)을 안전망으로 더했다. 초과한 크롤을 취소하는 것은 대기열에 남은 잡이 나중에 좀비로 시작되지 않게. 이 사례는 [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) 의 2026-10-05 항목.
- **2026-06-10: 그룹 5병렬 → 한 곳씩 순차 + 후보 확인 후 시작** (`5f050604`) — 레스토랑 간 병렬 크롤이 네이버 블록을 유발할 수 있어 `GROUP_SIZE` 를 1 로(레스토랑 1건 내부 병렬은 유지). 검색 결과(후보 큐)를 보고 시작하게 `awaiting_confirmation` 단계를 넣어, 엉뚱한 키워드로 50곳을 등록하는 일을 사람이 한 번 막는다. *(이전 결정 "MAX_CONCURRENT_PER_ACTOR 5 와 GROUP_SIZE 5 일치 — 그룹 5잡이 슬롯에 정확히 맞게" 는 이 변경으로 근거를 잃었다. 상수 5 는 crawl 쪽 발견 페이지 다중 선택 때문에 남아 있다.)*
- **per-actor 1잡** -- `findInFlightByActor` 가 in-flight 잡 있으면 409. auto-discover 는 AI + 8 키워드 검색 + 순차 크롤 모두 무거워 동시 두 개의 부하 예측이 어렵다고 봄.
- **키워드 정확히 8 개 + fallback 보충** -- `AUTO_DISCOVER_KEYWORD_COUNT=8` 을 Ollama JSON schema (`minItems=maxItems=8`) 로 강제. AI 가 모자라게 줘도 `buildFallbackKeywords` 가 결정론적 변형(영역명 + 카테고리 + 접미어 8 개)으로 보충. AI 미설정 / 호출 실패면 fallback 전체 — 잡은 절대 키워드 없이 끝나지 않는다.
- **CrawlService.startCrawl 재사용** -- Naver Place 등록은 기존 crawl 도메인의 파이프라인 그대로 호출. 같은 jobId 의 종료(`done`/`error`)를 기다려 outcome 결정. 새 파이프라인 안 만든다.
- **그룹 직렬(그룹 = 1곳)** -- 그룹이 끝나기 전엔 다음 그룹 시작 안 함 — abort 체크 + target 도달 체크 지점을 단순화하기 위함. 지금은 그룹이 1곳이라 사실상 "후보마다 체크".
- **종료 조건 = newlyRegistered ≥ targetCount** -- 도달 시점 이후 후보는 시작 자체 안 함. 잔여 후보는 `skipped(target_reached)` 로 마킹. 순차라 오버슈팅이 없다(5병렬 시절엔 진행 중 그룹이 끝까지 돌아 약간 넘칠 수 있었다).
- **이미 등록 placeId 사전 분리** -- `findRegisteredByPlaceIds` 로 dedupe 직후 분리해 `skipped(already_registered, groupIndex=-1)` 마킹. UI 가 "이미 등록된 후보" 섹션을 큐와 분리해 표시.
- **AI fallback 정책** -- LLM 미설정/호출 실패/응답 파싱 실패/0 개/부족 — 모든 케이스가 fallback 으로 보충되어 잡은 계속 진행. AI 가 그저 "검색어 다양성 향상기" 역할이고 critical path 가 아니라는 정책.
- **in-memory only** -- 잡 상태는 DB 안 박는다. 결과(=Restaurant 신규 행)는 영구화. 잡 자체는 재실행 가능한 idempotent 작업이라 영속화 비용 < 단순성.

## Gotchas [coverage: high — 8 sources]

- **확인 대기에는 상한이 없다 — 누르지 않으면 1잡 가드에 막힌다** -- `waitForConfirmation` 은 confirm 또는 abort 까지 기다리고, 그동안 잡은 `running` 이라 `findInFlightByActor` 가 새 자동 발견을 409 로 막는다(staleness 가드 없음). 카드를 닫고 잊었다면 취소(DELETE)하거나 재시작해야 한다. 작업 로그 run 도 그동안 `running`(정상 — 코드 주석).
- **후보 크롤 60분 초과는 '실패' 로 닫힌다** (2026-10-05) -- 상한은 대기열 시간을 포함한다. 같은 어드민이 수동 크롤을 많이 걸어 슬롯 5개가 오래 차 있으면 자동 발견 후보가 시작도 못 하고 60분이 지나 `cancel` + `failed`("크롤이 60분 안에 끝나지 않아 취소했습니다.")가 될 수 있다. 잡은 다음 후보로 계속 간다.
- **cache hit / 이미 종료된 crawl 잡** -- `startCrawl` 이 cache hit / `deduped: true` 로 즉시 종료되는 케이스. `waitForTerminal` 은 `job.status !== 'running'` 이면 즉시 `'terminal'`, 레지스트리에 없으면 `'missing'` 으로 바로 돌아온다 — 둘 다 이어서 `findByPlaceId` 로 결과를 확인.
- **cancel 시점 — 진행 중인 후보 크롤은 끝까지** -- abort 신호가 들어와도 진행 중인 Naver 크롤은 끝까지 가고(자동 발견의 abort 가 크롤 잡의 abort 와 연결돼 있지 않다), 그룹 종료 직후 `crawl.cancel` 을 부르지만 그때는 이미 끝난 잡이라 no-op. 다음 후보는 시작 직전 체크에서 차단되어 `skipped(cancelled)`. 즉시 멈춤은 아님 — 라우트 DELETE 주석의 "abort 신호 받고 즉시 중단" 은 코드와 다르다. 확인 대기 중의 취소는 즉시(대기 해제 → 잔여 전부 `skipped(cancelled)`).
- **AI 미설정에도 잡은 절대 키워드 없이 안 끝남** -- `resolveProvider()` 가 null 반환해도 fallback 8 개로 진행. 그래도 검색 결과 0 건이면 `state=done, candidates=[]` 로 정상 종료(failed 아님). 전부 기등록이어도 확인 대기 없이 `done`.
- **같은 actor 가 다른 탭에서 단일 크롤** -- auto-discover 진행 중에 어드민이 다른 탭에서 수동 크롤을 많이 던지면 crawl 의 actor 슬롯 5개를 나눠 쓴다(자동 발견은 한 번에 1슬롯). 넘치면 공유 대기열에서 FIFO — 2026-10-05 전엔 대기열이 인스턴스별이라 자동 발견 쪽 크롤이 영영 시작되지 않을 수 있었다.
- **SSE candidate 이벤트 자체 카운트** -- 훅이 candidate 이벤트만 받아도 `newlyRegistered` 를 `c.state==='done'` 카운트로 자체 계산. phase 이벤트가 늦게 와도 진행 바가 즉시 갱신 ([useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts)).
- **groupIndex = -1 은 already_registered 전용** -- UI 가 이 후보를 별도 섹션("이미 등록된 후보") 으로 분리. 처리 큐에 섞이지 않는다.
- **계약·경로 주석이 옛 설계를 말한다** -- [auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts) 머리 주석과 [routes.ts](../../packages/api-contract/src/routes.ts) `AutoDiscover` 주석은 여전히 "그룹 5 개씩 직렬 크롤"(웹 화면 문구는 이미 "처리 큐"), 스냅샷의 `newlyRegistered` 주석도 "그룹 직렬" — 실제는 확인 후 한 곳씩.
- **테스트의 cancel·확인 흐름** -- `autoFinish=false` fake crawl 로 크롤이 await 상태로 멈춘 다음 외부에서 error 이벤트를 흘리거나, `crawlWaitTimeoutMs` 를 짧게 주입해 상한 경로를 탄다. 러너는 확인 대기에서 멈추므로 테스트는 `autoConfirm(registry, id)` 로 먼저 확인을 걸어 둔다.

## Sources [coverage: high — 18 sources]

- [apps/friendly/src/plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) (신규 2026-10-05 — `app.crawl` 싱글톤, 이 라우트가 주입받음)
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts) (2026-10-05 — `waitForTerminal`·공유 대기열·대기 취소 abort)
- [apps/friendly/src/modules/crawl/adapters/naver-search.http.adapter.ts](../../apps/friendly/src/modules/crawl/adapters/naver-search.http.adapter.ts) (키워드 검색 — 2026-10-05 signal + 타임아웃 합성)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) (`AutoDiscover` — `jobConfirm` 포함, 주석은 옛 "그룹 5개")
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) (A-V1 자동 발견 무한 대기·A-3 배선 분리·A-8 검색 타임아웃 원문)
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) (`buildLlmProviderEnv()` — 라우트 env 조립, 2026-08-22)
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts) (`confirm`/`waitForConfirmation` — 2026-06-10)
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) (`GROUP_SIZE=1`·확인 대기·작업 로그 run; 2026-10-05 `CRAWL_WAIT_TIMEOUT_MS`)
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) (2026-10-05 — 자체 조립 제거, `crawl: app.crawl`)
- [apps/friendly/src/modules/auto-discover/auto-discover.test.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.test.ts) (2026-10-05 — 상한 초과 취소 테스트)
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts) (`AutoDiscoverPhase.awaiting_confirmation`)
- [packages/shared/src/api/autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts) (`confirm`)
- [packages/shared/src/hooks/useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts) (`useConfirmAutoDiscover`)
- [packages/shared/src/stores/activeAutoDiscoverJobStore.ts](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx) (처리 큐 + "등록 시작" 배너; 2026-10-05 — 한 번 순회 집계·`CandidateRow` memo)
- [apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx) (confirm mutation 연결)

관련 컨셉: [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md) · [sse-token-auth](../concepts/sse-token-auth.md) · [operation-log-instrumentation](../concepts/operation-log-instrumentation.md)
