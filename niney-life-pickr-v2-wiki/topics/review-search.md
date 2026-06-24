---
topic: review-search
type: codebase
last_compiled: 2026-06-25
source_count: 18
status: active
---

# review-search

리뷰 문맥검색 / RAG 도메인 — 크롤된 식당 리뷰에 대해 "리뷰 목록"이 아니라
**질문에 근거 있는 답(RAG)** 을 준다. 어드민 운영 도구가 1차이고, 공개 식당 상세의
"질문" 탭(placeId 기반, 무인증·레이트리밋)이 같은 엔진을 소비한다.

## Purpose [coverage: high — 6 sources]

리뷰를 임베딩으로 enrich → 하이브리드 회수(임베딩 dense ⊕ 키워드 BM25) → listwise LLM
리랭크 → RAG 답변 생성 → 검증 가드레일로 근거 없는 주장 제거, 이 파이프라인을 식당
단위로 돌린다. 제품 표면은 **RAG(질문)만** — standalone 시맨틱/관점 검색 엔드포인트는
제거됐고, 내부 검색 엔진(`search()`)은 RAG 안에서만 쓰인다
([review-search.ts](../../packages/api-contract/src/schemas/review-search.ts) 주석).

세 가지 사용 모드:

- **어드민 RAG 콘솔** — 식당을 골라 수동 enrich + 질문(인용·확신도·검증 결과 노출).
- **어드민 enrich 상태 관리** — 식당별/일괄 백그라운드 enrich + SSE 진행률.
- **공개 QA** — 공개 식당 상세의 "질문" 탭. placeId 로 식별, 인증 없음, IP 레이트리밋.
  비동기(전역 스토어 + 완료 토스트/배너 + 식당별 마지막 Q&A 영속).

이 도메인의 검증·연구 자산은 `apps/friendly/research/review-search/`(README + probe-*.ts)에
별도로 산다. enrich 가 채운 임베딩은 자매 토픽 [review-clustering](review-clustering.md)도
그대로 읽어 군집화한다(같은 `embeddingJson` 컬럼).

## Architecture [coverage: high — 8 sources]

확정 파이프라인 (`research/review-search/README.md` §1):

```
질문
 → 하이브리드 회수: BM25(char-trigram, 인앱) ⊕ bge-m3 dense → RRF 융합
 → listwise LLM 리랭크 (hybrid 풀 top-RERANK_POOL 재정렬)
 → RAG 생성: 근거 ASK_EVIDENCE(6)건으로만 답 + 인용[n] + confidence
 → 검증 가드레일: 2차 LLM 이 claim↔근거 축자 대조 → 미지원 제거 + confidence 강등
```

(연구 README 다이어그램은 HyDE 단계를 포함하지만 운영 코드에서는 제거됨 — Key Decisions 참조.)

**모델 구성** — 임베딩은 로컬 Ollama `bge-m3`(dim 1024), 생성/리랭크/검증은
`ollama-cloud` chat(gpt-oss). Ollama Cloud 엔 임베딩 모델이 없어(401) 임베딩만 따로
도달 가능한 Ollama 가 필요하다 (Gotchas).

**서버측 핵심 파일**:

- [retrieval.ts](../../apps/friendly/src/modules/review-search/retrieval.ts) — LLM/DB 의존
  없는 순수 검색 헬퍼. `cosine`, char 3-gram `tokenizeTrigrams`, 인메모리 `Bm25`(k1=1.5,
  b=0.75), `RRF_K=60`, `ASPECTS`(9개 관점), `isJunk`(정보가치 없는 초단문 제외). vector-lab
  프로토타입에서 포팅. 순수 함수만 둬서 테스트·재사용 용이.
- [review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts)
  — `ReviewSearchService`. 인메모리 캐시 대신 `ReviewSummary`(embeddingJson/aspectsJson/
  contextLine)에서 코퍼스를 로드해 검색. enrich·search·ask·verify·공개 QA·상태관리·SSE 전부.
- [review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts)
  — HTTP 레이어. 어드민 라우트는 `app.authenticate + app.requireAdmin` 가드, 공개 QA 2개는
  무가드, SSE 는 `?token=` 폴백 인증.

**검색 모드** — `'dense'` | `'hybrid'` | `'rerank'`. ask() 는 항상 `'rerank'` 로 근거를
회수한다. hybrid 는 dense/lex 두 랭킹을 RRF(`1/(K+denseRank) + 1/(K+lexRank)`)로 융합하고,
rerank 는 그 top-`RERANK_POOL`(기본 30, `RS_RERANK_POOL` env)을 listwise LLM 으로 재정렬한다.

**서비스 상태(app 싱글톤)** — `corpusCache`(LRUCache `max:16`, 식당당 코퍼스가 ~수MB라
바운드), `enriching`(restaurantId→진행률 Map, 중복 트리거 가드 + 상태 뷰 + SSE),
`enrichListeners`(SSE 구독자 Set). 라우트·요약 종료 훅이 같은 인스턴스를 공유해야 하므로
[plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)에서 한 번 생성해
`app.reviewSearch` 로 decorate + `SummaryService` 에 주입한다.

**canonical 정합** — 검색·enrich·상태집계 모두 단일 행이 아니라 **그 가게(canonical)의
공개 멤버 행 전체**를 대상으로 한다. `loadCorpus`/`ensureEnriched` 는
`resolveCanonicalMembersByRestaurantId`, 공개 QA 는 `resolveCanonicalMembersByPlaceId`,
상태집계는 `listPublicPlaces` 를 쓴다([canonical-members.js](../../apps/friendly/src/modules/restaurant/canonical-members.js)).
캐시·진행상태·SSE 키는 모두 대표 `primaryId`(placeId 보유 네이버 행)로 통일 — 부수 행
(다이닝코드/테이블링)으로 트리거돼도 같은 가게로 합쳐 추적된다. 공개 리뷰 탭이 보여주는
통합 코퍼스와 동일.

**enrich = on-demand·멱등** — 검색되는 식당만 첫 1회 관점+문맥+임베딩 생성→DB 저장,
이후 멱등 스킵(`embeddingJson` null 이거나 `enrichVersion < ENRICH_VERSION` 인 행만 대상).
한 enrich 사이클: `extractMeta`(관점+문맥 LLM 1콜, `ENRICH_BATCH=12`개씩) → `(문맥+본문)`
임베딩(`EMBED_BATCH=64`) → persist. 배치는 `ENRICH_CONCURRENCY=6` 으로 병렬.

**프론트엔드**:

- 어드민: [AdminReviewSearchPage.tsx](../../apps/web/src/routes/admin/AdminReviewSearchPage.tsx)
  — 식당 선택·enrich·RAG 질문 + 하단 "식당별 enrich 상태"/"식당별 군집 상태" 표.
- 공개 Ask 탭: [web AskTab](../../apps/web/src/components/restaurant/detail/AskTab.tsx),
  [mobile AskTab](../../apps/mobile/src/components/restaurantDetail/AskTab.tsx) — 29개 예시
  질문 칩 + 답변/확신도/검증/근거 리뷰. 둘 다 전역 `reviewAskStore` 를 구독.
- 비동기 완료 알림: [ReviewAskToaster.tsx](../../apps/web/src/components/ReviewAskToaster.tsx)
  (웹, sonner 토스트), [ReviewAskBanner.tsx](../../apps/mobile/src/components/ReviewAskBanner.tsx)
  (앱, reanimated 하단 배너 — 앱엔 지속형 토스트 인프라가 없어 직접 만듦).

## Talks To [coverage: high — 7 sources]

- **로컬 Ollama 임베딩 엔드포인트** — `${OLLAMA_EMBED_BASE_URL}/api/embed`(기본
  `http://localhost:11434`), model `bge-m3`. enrich 의 문서 임베딩 + **매 질문의 질의
  임베딩** 양쪽에 쓰여 회피 불가.
- **ollama-cloud chat** — `${baseUrl}/api/chat`(`aiConfig.getResolved('ollama-cloud','chat')`
  로 baseUrl/apiKey/defaultModel 해석). 관점/문맥 추출, listwise 리랭크, RAG 생성, 검증,
  HyDE(평가 하니스용)에 사용. `chatJson` 이 코드펜스 제거 + 첫 `[{...}]` 매칭으로 견고 파싱,
  실패 시 null.
- **Prisma / SQLite** — `ReviewSummary` 행(`embeddingJson`/`aspectsJson`/`contextLine`/
  `enrichVersion`)이 검색 코퍼스의 영속 소스. `Restaurant`/`ReviewSummary` 조인으로 로드.
- **[restaurant](friendly.md) canonical-members** — `resolveCanonicalMembersBy*` /
  `listPublicPlaces` 로 가게 정체 통합(멤버 행 합산).
- **[summary](friendly.md) SummaryService** — 요약 종료 직후 `ensureEnrichedByPlaceId(placeId)`
  를 fire-and-forget 호출(자동 enrich), 이어서 [review-clustering](review-clustering.md)
  `ensureClusteredByPlaceId` 로 체이닝. 미주입(테스트)이면 훅 비활성.
  ([summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) L1146~1157)
- **[review-clustering](review-clustering.md)** — 같은 `embeddingJson` 임베딩을 읽어
  군집화. `isJunk` 헬퍼와 `chatJson` 견고 파싱 관례를 review-search 에서 차용.
- **FE 공유 레이어** — [@repo/shared](../../packages/shared/src/api/review-search.api.ts)
  `reviewSearchApi` (경로 하드코딩 — `Routes.ReviewSearch` 가 vite prebundle 에서 드롭될 수
  있어), [useReviewSearch.ts](../../packages/shared/src/hooks/useReviewSearch.ts) React Query
  훅, [reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts) zustand 전역 스토어.

## API Surface [coverage: high — 5 sources]

경로 정의는 [routes.ts](../../packages/api-contract/src/routes.ts) `ReviewSearch` namespace,
스키마는 [review-search.ts](../../packages/api-contract/src/schemas/review-search.ts).
검색 단위는 식당(`restaurantId`), 공개 QA 는 `placeId`(공개 상세와 동일 식별자).

**어드민** (`/api/v1/admin/review-search`, `authenticate + requireAdmin`):

| 메서드·경로 | 핸들러 | 입출력 |
|---|---|---|
| `GET /restaurants` | `listRestaurants` | 리뷰 있는 식당(많은 순, take 100) 드롭다운용 |
| `POST /enrich` | `ensureEnriched(restaurantId)` | 동기 enrich → `{enriched, total, ms}` |
| `POST /ask` | `ask(restaurantId, query)` | RAG → `ReviewAskResult` |
| `GET /status` | `enrichStatus(query)` | 식당별 enrich 상태(canonical 집계, 페이지네이션) |
| `POST /enrich-bg` | `enrichInBackground` | 즉시 반환 `{started, inProgress}`, 상태는 폴링 |
| `POST /enrich-pending` | `enrichAllPendingInBackground` | 검색가능 0 식당 전부 순차 큐잉 → `{queued}` |
| `GET /enrich-events` | SSE | enrich 진행률 멀티플렉스. `?token=` 인증 |

**공개 QA** (무인증):

| 메서드·경로 | 핸들러 | 비고 |
|---|---|---|
| `GET /restaurants/:placeId/qa/ready` | `qaReady` | enrich 리뷰 수만 카운트(LLM 호출 없음 → 레이트리밋 불필요). 식당 없음 404 |
| `POST /restaurants/:placeId/qa` | `askByPlaceId` | 비싼 LLM 파이프라인 → IP 레이트리밋. 본문 `{query}`(min1, max200) |

**`ReviewAskResult`** = `{ answer, confidence: 'high'|'medium'|'low'|'none', hyde: string|null,
citations: ReviewSearchHit[], verification: {applied, dropped: string[]}|null }`.
`hyde` 는 항상 `null`(HyDE 제거 후 계약 호환용으로 잔존). `verification.applied`=검증 패스
실행됨, `dropped`=근거 부족으로 제거된 주장 목록.

**레이트리밋** — 공개 ask 만. 인메모리 고정창(settlement 패턴 차용): IP·분당 `ASK_RATE_MAX=15`,
`ASK_RATE_WINDOW_MS=60_000`, hit map 이 10_000 넘으면 clear. `GET /qa/ready` 는 LLM 호출이
없어 제한 없음.

## Data [coverage: medium — 3 sources]

enrich 결과는 기존 `review_summaries` 테이블에 컬럼으로 얹는다 — 새 테이블 없음
([migration.sql](../../apps/friendly/prisma/migrations/20260621220422_add_review_search_enrichment/migration.sql),
[schema.prisma](../../apps/friendly/prisma/schema.prisma) L553~561):

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `embeddingJson` | `String?` | bge-m3 임베딩(float[1024]) JSON 직렬화 — 인앱 코사인용. **검색가능 여부의 기준**(not null) |
| `aspectsJson` | `String?` | 관점→극성 `{맛:"neg", 주차:"pos"}` 직렬화(구조 필터/검색·연구 라벨) |
| `contextLine` | `String?` | Contextual Retrieval 한 줄 — 임베딩 입력에 prepend(짧은 리뷰 recall↑) |
| `enrichVersion` | `Int?` | enrich 버전. `ENRICH_VERSION`(현재 1) 변경 시 재enrich 트리거 |

요약된 리뷰만 코퍼스에 든다(미요약/junk 제외 — `ReviewSummary` 행 기준). 코퍼스 로드 시
`isJunk` + 본문 dedup. `ReviewClusterMember`/`ReviewCluster` 의 임베딩 의존도 같은 컬럼을
공유한다(자매 토픽 [review-clustering](review-clustering.md)).

**튜닝 상수**(service): `EMBED_BATCH=64`, `MAX_CHARS=2000`, `ENRICH_BATCH=12`,
`ENRICH_CONCURRENCY=6`, `RERANK_POOL=30`(env `RS_RERANK_POOL`), `ASK_EVIDENCE=6`.
**클라 영속**(`reviewAskStore`): 식당별 마지막 `{query, result, answeredAt}` 만 `partialize`,
`MAX_KEPT=20`(최근순 cap), 키 `review-ask-v1`(웹 localStorage / 앱 AsyncStorage 주입).

## Key Decisions [coverage: high — 6 sources]

연구 자산(`research/review-search/`)이 모든 결정을 측정으로 뒷받침한다. 판정은
self-bias 회피를 위해 **독립 Claude(`EVAL_JUDGE=claude`, 헤드리스 `claude -p`, API 키
불필요)** 로 한다(생성기와 같은 gpt-oss 판정 시 faithfulness 100% 로 부풀려짐 — 실측 67~83%).

**채택**:

- **HyDE 제거** (commit 9aee98c) — A/B(`probe-hyde`) 측정상 짧은 한국어 리뷰에선 가상
  리뷰가 다관점으로 신호를 희석해 dense recall 을 오히려 떨어뜨림(raw 65% vs HyDE 54%).
  제거로 품질↑ + LLM 1콜 절감. `hyde` 필드는 계약에 null 로 잔존, `hyde()` 메서드는 평가
  하니스용으로만 public 유지.
- **listwise LLM 리랭크** — Ollama 네이티브 rerank 없음 + Qwen3-Reranker 사용불가 →
  후보를 함께 보고 의미로 정렬하는 LLM 리랭크가 현실 최적.
- **verifier span-grounding** — claim별 축자 근거 span 강제 + 근거 모순 시 제거. 가드레일
  lift `0 → +9~16pp`(기존 verifier 는 환각에 제거=0이었음).
- **generator 과추론 억제(완화판)** — "구체적 미지원 한정어(요일·시간·수치) 금지"는 유지,
  "전반적 경향 결론은 허용". relevance 100% 유지하며 강도 과장 감소. 무딘 버전(결론까지
  차단)은 relevance 83%로 떨어뜨려 폐기.
- **verifier revisedAnswer 삭제 위주** — 원문에 없는 새 내용 추가 금지. 재작성이 환각을
  주입하던 역효과 제거. `downgradeConfidence` 로 dropped 있을 때 한 단계 강등.
- **on-demand·멱등 enrich + 자동 enrich 훅** (commit 8281223) — 요약 종료 직후 자동 enrich
  (fire-and-forget). 요약이 끝난 뒤라 같은 `ReviewSummary` 행 동시 쓰기(SQLite lock) 없음.
- **질문 답변 비동기화** (commit 6d49874/cb1b7ed) — 답변은 LLM 3콜이라 15초+ 걸려 사용자가
  탭/화면을 떠나기 쉬움. in-flight·결과를 컴포넌트 로컬이 아니라 **전역 스토어**에 둬 store
  가 직접 `publicAsk` 를 호출 → 언마운트와 무관하게 완료, 전역 watcher 가 토스트/배너로 알림.
  식당별 마지막 Q&A 만 영속(진행 중/완료/에러는 메모리).
- **인메모리 BM25 + 인앱 코사인** — 검색 단위가 식당(~1000건)이라 ~ms. sqlite-vec/FTS5 미사용.

**기각**:

- **rerank 풀 = dense∪hybrid 합집합** — rerank {56,78,44} vs baseline {67,44,67} 완전 겹침
  = 효과 0(rerank LLM 노이즈). 짧은 한국어 리뷰 임베딩 한계라 후보 추가로 안 풀림 → 되돌림.

## Gotchas [coverage: medium — 4 sources]

- **임베딩 엔드포인트 운영 필수** — Ollama Cloud 엔 임베딩 모델이 없다(401). 생성/리랭크/
  검증은 원격 OK 지만 **임베딩(bge-m3)만은 도달 가능한 Ollama 가 따로** 필요하고, enrich
  뿐 아니라 매 질문의 질의 임베딩에도 써서 회피 불가. 단일 인스턴스(Docker 금지)라 운영
  호스트에 Ollama 네이티브 실행(systemd) + `ollama pull bge-m3` + `OLLAMA_EMBED_BASE_URL`.
  배포 전 `pnpm --filter friendly probe:embed-health` 로 도달성·차원 검증.
- **부팅 헬스체크는 경고만** — 임베딩 미도달 시 부팅 로그에 `[review-search] 임베딩 미도달`
  warn 만 찍고 서버는 계속 뜬다(review-search 만 동작 불가). `NODE_ENV==='test'` 면 스킵.
- **공개 질문은 graceful 폴백** — 임베딩/LLM 일시 장애를 공개 사용자에게 500 대신
  `confidence:'none'` 안내로 처리. enrich 안 된 식당도 graceful none(자동 enrich 안 함 — 비용).
- **회수 천장(완전성형 질문)** — top-6 만 읽어 "요지/합의"형엔 충분하나 "단점 다 알려줘"류
  열거형은 전수 부정 테마의 ~58%만 포착(`probe:completeness` baseline). 임베딩이 극성을
  못 잡음(맛없다↔맛있다, 폴라리티 recall 44~78% 변동). 회수 개선 착수 게이트가 이 지표.
- **faithfulness ~83% 천장(어려운 질의)** — 짧고 잡다한 한국어 리뷰 + Ollama 제약. 안전망 =
  confidence + 인용 + "정보 없음". 관측된 실패는 전부 "생성 과추론"이지 "리뷰 누락"이 아님.
- **SSE 인증** — `EventSource` 는 Authorization 헤더를 못 실어 `?token=` 쿼리로 인증(crawl/
  summary SSE 와 동일 패턴). 진행률은 SSE 라이브 push + 폴링 10s 안전망(SSE 끊김 대비).
- **eval 노이즈** — rerank·생성·판정이 다 LLM(N=12)이라 run 간 절대치 비교는 노이즈. **같은
  생성 within-run on/off 비교만** 깨끗이 귀인. recall 메트릭 정답이 aspects 라벨이므로 aspect
  라벨을 회수 레버로 쓰면 순환(무의미).

## Sources [coverage: high — 18 sources]

- [apps/friendly/src/modules/review-search/retrieval.ts](../../apps/friendly/src/modules/review-search/retrieval.ts)
- [apps/friendly/src/modules/review-search/review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts)
- [apps/friendly/src/modules/review-search/review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts)
- [apps/friendly/research/review-search/README.md](../../apps/friendly/research/review-search/README.md)
- [apps/friendly/research/review-search/probe-rerank-value.ts](../../apps/friendly/research/review-search/probe-rerank-value.ts)
- [apps/friendly/research/review-search/probe-latency.ts](../../apps/friendly/research/review-search/probe-latency.ts)
- [apps/friendly/research/review-search/probe-model-tier.ts](../../apps/friendly/research/review-search/probe-model-tier.ts)
- [apps/friendly/research/review-search/probe-verify-rate.ts](../../apps/friendly/research/review-search/probe-verify-rate.ts)
- [packages/api-contract/src/schemas/review-search.ts](../../packages/api-contract/src/schemas/review-search.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) (`ReviewSearch` namespace)
- [packages/shared/src/api/review-search.api.ts](../../packages/shared/src/api/review-search.api.ts)
- [packages/shared/src/hooks/useReviewSearch.ts](../../packages/shared/src/hooks/useReviewSearch.ts)
- [packages/shared/src/stores/reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts)
- [apps/web/src/routes/admin/AdminReviewSearchPage.tsx](../../apps/web/src/routes/admin/AdminReviewSearchPage.tsx)
- [apps/web/src/components/restaurant/detail/AskTab.tsx](../../apps/web/src/components/restaurant/detail/AskTab.tsx)
- [apps/web/src/components/ReviewAskToaster.tsx](../../apps/web/src/components/ReviewAskToaster.tsx)
- [apps/mobile/src/components/restaurantDetail/AskTab.tsx](../../apps/mobile/src/components/restaurantDetail/AskTab.tsx)
- [apps/mobile/src/components/ReviewAskBanner.tsx](../../apps/mobile/src/components/ReviewAskBanner.tsx)

추가 참조: [apps/friendly/src/plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)
(싱글톤 wiring), [apps/friendly/src/modules/summary/summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts)
(자동 enrich 훅), [apps/friendly/prisma/migrations/20260621220422_add_review_search_enrichment/migration.sql](../../apps/friendly/prisma/migrations/20260621220422_add_review_search_enrichment/migration.sql),
[apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma),
[docs/deploy-friendly.md](../../docs/deploy-friendly.md).
