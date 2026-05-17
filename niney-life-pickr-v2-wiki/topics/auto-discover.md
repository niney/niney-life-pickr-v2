---
topic: Auto-Discover
slug: auto-discover
last_compiled: 2026-05-17
sources_count: 12
status: active
---

# auto-discover

## Purpose [coverage: high -- 5 sources]

운영자가 영역명 한 줄("강남역") + 카테고리 칩 + 목표 등록 수만 던지면, AI 가 검색 키워드 8 개를 만들고 → 네이버 지도를 키워드별로 병렬 검색하고 → 결과를 dedupe 한 뒤 → 그룹 5 개씩 직렬로 Naver Place 크롤·등록까지 한 번에 처리하는 백그라운드 잡. 기존 `/admin/discover` 의 수동 흐름(키워드 직접 입력 → 결과 보고 한 건씩 등록)은 그대로 두고 별도 메뉴로 추가됐다. 어드민이 한 영역의 신규 가게 N 개를 "그냥 채워라" 할 수 있는 게 의도.

잡은 actor 당 정확히 1 개로 제한된다. AI 호출 + 키워드 8 개 검색 + 그룹별 크롤이 동시에 두 개 돌면 부하 예측이 어려워, 다이닝코드 bulk-save 가 다중 동시 진행을 허용하는 것과 의도적으로 다른 결정. 검토 큐는 dedupe 후 사람 손이 결정하므로 동시성이 의미 있지만 자동 발견은 무거운 파이프라인 한 줄을 끝까지 도는 잡이라 1 개로 묶었다.

## Architecture [coverage: high -- 5 sources]

코어는 `AutoDiscoverService` + `AutoDiscoverRegistry` 두 클래스. 라우트가 잡 생성 직후 `runAutoDiscover` 를 fire-and-forget 으로 호출하고 즉시 초기 snapshot 응답. 진행은 SSE 로 흐른다.

```
POST /admin/auto-discover/jobs
   │
   ▼
[Registry.create] → pending → jobId 반환
   │
   ▼ (백그라운드)
Phase 1: generating_keywords
   ├─ AiConfigService.getResolved('ollama-cloud')
   ├─ provider.complete (Ollama JSON schema 강제 8개)
   └─ 실패/부족 → buildFallbackKeywords 로 보충 → 항상 정확히 8개
   │
   ▼
Phase 2: searching (Promise.all)
   ├─ 키워드 8개 병렬 searchPlacesViaMapNaver
   ├─ keyword 이벤트 8×(pending→searching→done|failed)
   └─ placeId 첫 등장만 보존하는 dedupe
   │      → 이미 등록된 placeId 는 skipped(already_registered, groupIndex=-1)
   │      → 남은 후보를 5개 단위로 groupIndex 부여
   │
   ▼
Phase 3: crawling (그룹 직렬, 그룹 내 5병렬)
   for each group:
     if abort or newlyRegistered >= targetCount: break
     await Promise.all(5 × runOneCrawl)
        ├─ CrawlService.startCrawl (Naver Place 파이프라인 재사용)
        └─ waitForCrawlTerminal — 같은 jobId 의 done/error 이벤트 await
   │
   ▼
markFinished('done'|'cancelled'|'failed') + done 이벤트
잔여 후보 → skipped(target_reached | cancelled)
```

Key files:
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) -- 3 단계 러너. `GROUP_SIZE=5`, `AUTO_DISCOVER_GROUP_SIZE` 로 테스트가 import.
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts) -- in-memory 잡 상태. `FINISHED_TTL_MS=10분` GC + per-actor 격리.
- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts) -- 시스템 프롬프트 + Ollama JSON schema (`minItems=maxItems=8`) + `buildFallbackKeywords`.
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts) -- POST/GET/DELETE + SSE. SSE 는 token query 인증.
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts) -- zod 계약 + phase/state/skipReason enum.

## Talks To [coverage: high -- 5 sources]

- **ai** (in-process: `AiConfigService.getResolved('ollama-cloud')` + `adapterCache`) -- LLM provider/model 해석. 미설정이면 fallback 키워드로 진행(잡은 안 죽음).
- **crawl** (in-process: `CrawlService.startCrawl` + `JobRegistry.subscribe`) -- 후보 한 건 등록은 Naver Place 파이프라인 그대로 호출. 자기 잡 안에서 `waitForCrawlTerminal` 로 done/error 이벤트 await.
- **crawl/naver-search** (HTTP: `searchPlacesViaMapNaver`) -- 키워드별 `pageSize=50` 으로 nx-api 검색. `AbortSignal` 전파.
- **restaurant** (in-process: `findRegisteredByPlaceIds`, `findByPlaceId`) -- 이미 등록 placeId 사전 분리 + 크롤 종료 후 restaurant row 조회로 outcome 확인.
- **summary** (in-process: `extractFirstJsonObject`) -- LLM 응답에서 JSON 객체 추출 유틸 재사용.

## API Surface [coverage: high -- 4 sources]

라우트 (`auto-discover.route.ts`, prefix `/api/v1`):

- `POST Routes.AutoDiscover.jobs` body=`AutoDiscoverJobInput` (`{q, categories[], targetCount}`) → `AutoDiscoverJobSnapshot`. per-actor 1잡 정책 — 같은 actor 의 in-flight 잡이 있으면 **409 conflict** ("이미 진행 중인 자동 발견 잡이 있습니다.").
- `GET Routes.AutoDiscover.job(:id)` → `AutoDiscoverJobSnapshot`. 새로고침/재접속 직후 SSE 보다 먼저 polling. 다른 actor 잡은 404.
- `DELETE Routes.AutoDiscover.job(:id)` → 204 idempotent. `AbortController.abort()` — 진행 중 그룹의 5 개 Naver 잡들은 끝나면 cancel 전파, 다음 그룹은 시작 직전 abort 체크에서 차단.
- `GET Routes.AutoDiscover.jobEvents(:id)?token=...` → SSE. 이벤트 5 종: `snapshot`(연결 직후 1회), `keyword`, `candidate`, `phase`, `done`. `:` heartbeat 15 초.

서버 클래스:
- `AutoDiscoverService.runAutoDiscover(jobId, actorId)` — 라우트가 fire-and-forget 으로 호출. await 안 함.
- `AutoDiscoverRegistry` — `findInFlightByActor`, `create`, `markRunning`, `setPhase`, `upsertKeyword`, `upsertCandidate`, `incrementNewlyRegistered`, `markFinished`, `subscribe`, `cancel`.

FE 훅 (`@repo/shared`):
- `useStartAutoDiscover()` — mutation, 성공 시 `activeAutoDiscoverJobStore` 에 jobId 박고 캐시에 초기 snapshot 저장.
- `useAutoDiscoverJob(jobId)` — GET + SSE 통합 훅. `useDiningcodeBulkSaveJob` 와 동형이지만 candidate 가 groupIndex 로 묶이고 phase 이벤트가 추가.
- `useCancelAutoDiscover()` — DELETE.

API: [packages/shared/src/api/autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts), 훅: [packages/shared/src/hooks/useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts).

## Data [coverage: high -- 3 sources]

DB 테이블 없음 — 잡 상태는 전부 in-memory. 결과는 `Restaurant` 행을 새로 만드는 것 (crawl 도메인의 기존 파이프라인이 채움).

`AutoDiscoverRegistry` 의 `InternalJob` ([auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts) line 36-55):

```
id, actorId, state, phase
input: AutoDiscoverJobInputType
keywords: Map<keyword, AutoDiscoverKeyword>      // 8개
keywordOrder: string[]                            // AI 응답 순 안정
candidates: Map<placeId, AutoDiscoverCandidate>
candidateOrder: string[]                          // 그룹 인덱스 → 그 안 첫 등장 순
newlyRegistered: number                           // 등록 성공 카운트, targetCount 와 비교
events: AutoDiscoverJobEvent[]                    // EVENT_BUFFER_MAX=2000 ring
subscribers: Set<AutoDiscoverJobSubscriber>
abort: AbortController
```

`FINISHED_TTL_MS=10분` — 잡 종료 후 10 분 지나면 GC. 서버 재시작 시 in-flight 잡은 사라짐(사용자가 재실행 — AI/검색 비용은 다시 들지만 등록은 idempotent, 이미 등록된 placeId 는 다음 잡에서 `already_registered` 로 자동 스킵).

FE 활성 잡 ID: [activeAutoDiscoverJobStore](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts) — zustand persist `lp:activeAutoDiscoverJob`. 페이지 새로고침/이동 후에도 진행 카드 이어보기. 404 응답 시 자동 clear.

## Key Decisions [coverage: high -- 6 sources]

- **per-actor 1잡** -- `findInFlightByActor` 가 in-flight 잡 있으면 409. 다이닝코드 bulk-save 가 다중 허용하는 것과 다른 결정 — auto-discover 는 AI + 8 키워드 검색 + 그룹별 크롤 모두 무거워 동시 두 개의 부하 예측이 어렵다고 봄.
- **키워드 정확히 8 개 + fallback 보충** -- `AUTO_DISCOVER_KEYWORD_COUNT=8` 을 Ollama JSON schema (`minItems=maxItems=8`) 로 강제. AI 가 모자라게 줘도 `buildFallbackKeywords` 가 결정론적 변형(영역명 + 카테고리 + 접미어 8 개)으로 보충. AI 미설정 / 호출 실패면 fallback 전체 — 잡은 절대 키워드 없이 끝나지 않는다 ([service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) line 448-508).
- **CrawlService.startCrawl 재사용** -- Naver Place 등록은 기존 crawl 도메인의 파이프라인 그대로 호출. 자기 잡 안에서 같은 jobId 의 SSE 이벤트(`done`/`error`) 를 await 해 outcome 결정. 새 파이프라인 안 만든다.
- **MAX_CONCURRENT_PER_ACTOR 5 와 GROUP_SIZE 5 일치** -- 그룹 내 5병렬 크롤이 crawl job-registry 의 actor 슬롯과 정확히 맞도록 글로벌 상수를 3→5 로 올렸다. 안 그러면 그룹의 5 잡 중 일부가 queue 에 밀려 그룹 직렬화가 깨진다.
- **그룹 직렬 + 그룹 내 5병렬** -- 한 번에 5 개씩 크롤. 그룹이 끝나기 전엔 다음 그룹 시작 안 함 — abort 체크 + target 도달 체크 지점을 단순화하기 위함.
- **종료 조건 = newlyRegistered ≥ targetCount** -- 도달 시점 이후 그룹은 시작 자체 안 함. 잔여 후보는 `skipped(target_reached)` 로 마킹. 진행 중 그룹의 5 개는 끝까지 도는 게 트레이드오프(약간 오버슈팅 가능).
- **이미 등록 placeId 사전 분리** -- `findRegisteredByPlaceIds` 로 dedupe 직후 분리해 `skipped(already_registered, groupIndex=-1)` 마킹. UI 가 "이미 등록된 후보" 섹션을 그룹 영역과 분리해 표시.
- **AI fallback 정책** -- LLM 미설정/호출 실패/응답 파싱 실패/0 개/부족 — 모든 케이스가 fallback 으로 보충되어 잡은 계속 진행. AI 가 그저 "검색어 다양성 향상기" 역할이고 critical path 가 아니라는 정책.
- **in-memory only** -- 잡 상태는 DB 안 박는다. 결과(=Restaurant 신규 행)는 영구화. 잡 자체는 재실행 가능한 idempotent 작업이라 영속화 비용 < 단순성.

## Gotchas [coverage: high -- 5 sources]

- **AI 가 8 개 부족 시 fallback 으로 보충** -- AI 가 5 개만 줘도 잡이 안 죽고 fallback 3 개로 채워 항상 정확히 8 개. dedup 도 `arr.indexOf(k) === i` 로 한 번 더 ([service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) line 487-500).
- **cache hit / 이미 종료된 crawl 잡** -- `CrawlService.startCrawl` 이 cache hit / `deduped: true` 로 즉시 종료되는 케이스. `waitForCrawlTerminal` 이 `job.status !== 'running'` 체크로 already-terminal 잡도 즉시 resolve ([service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts) line 417-435).
- **cancel 시점 — 진행 중 그룹은 끝까지** -- abort 신호가 들어와도 진행 중 그룹의 5 개 Naver 잡은 끝까지 가고, 그룹 종료 직후 cancel 전파. 다음 그룹은 시작 직전 체크에서 차단되어 `skipped(cancelled)`. 즉시 멈춤은 아님.
- **target 도달 시 약간 오버슈팅** -- 그룹 직전 체크라 진행 중 그룹의 나머지는 끝까지 등록. targetCount=5 인데 그룹 1 의 5 개가 모두 성공하면 newlyRegistered=5 로 끝, 하지만 만약 그룹 1 이 6 개였다면 6 등록. (실제로는 GROUP_SIZE=5 고정이라 보통 안 발생.)
- **AI 미설정에도 잡은 절대 키워드 없이 안 끝남** -- `resolveProvider()` 가 null 반환해도 fallback 8 개로 진행. 그래도 검색 결과 0 건이면 `state=done, candidates=[]` 로 정상 종료(failed 아님).
- **같은 actor 가 다른 탭에서 단일 크롤** -- auto-discover 진행 중에 어드민이 다른 탭에서 단일 placeId 크롤을 또 던지면 crawl 도메인의 5 슬롯이 다 차 있어 queue 에 밀린다. 의도된 동작.
- **SSE candidate 이벤트 자체 카운트** -- 훅이 candidate 이벤트만 받아도 `newlyRegistered` 를 `c.state==='done'` 카운트로 자체 계산. phase 이벤트가 늦게 와도 진행 바가 즉시 갱신 ([useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts) line 156-159).
- **groupIndex = -1 은 already_registered 전용** -- UI 가 이 후보를 별도 섹션("이미 등록된 후보") 으로 분리. 그룹 그리드에 섞이지 않는다.
- **테스트의 cancel 흐름** -- `autoFinish=false` fake crawl 로 그룹이 await 상태로 멈춘 다음 외부에서 error 이벤트 흘려야 잡이 진행됨. 실 서비스에서는 abort 가 crawl 잡 자체로는 안 가고, auto-discover service 가 그룹 끝난 뒤 cancel 호출로 전파.

## Sources

- [apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover-registry.ts](../../apps/friendly/src/modules/auto-discover/auto-discover-registry.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.service.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.service.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.route.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.route.ts)
- [apps/friendly/src/modules/auto-discover/auto-discover.test.ts](../../apps/friendly/src/modules/auto-discover/auto-discover.test.ts)
- [packages/api-contract/src/schemas/auto-discover.ts](../../packages/api-contract/src/schemas/auto-discover.ts)
- [packages/shared/src/api/autoDiscover.api.ts](../../packages/shared/src/api/autoDiscover.api.ts)
- [packages/shared/src/hooks/useAutoDiscover.ts](../../packages/shared/src/hooks/useAutoDiscover.ts)
- [packages/shared/src/stores/activeAutoDiscoverJobStore.ts](../../packages/shared/src/stores/activeAutoDiscoverJobStore.ts)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverForm.tsx)
- [apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx](../../apps/web/src/components/admin/auto-discover/AutoDiscoverJobCard.tsx)
- [apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx](../../apps/web/src/routes/admin/AdminAutoDiscoverPage.tsx)
