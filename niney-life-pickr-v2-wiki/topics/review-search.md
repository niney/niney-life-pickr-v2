---
topic: review-search
last_compiled: 2026-10-10
sources_count: 36
status: active
aliases: [리뷰 문맥검색, 리뷰 RAG, review-search, ReviewSearchService, enrich, ENRICH_VERSION, embeddingJson, aspectsJson, contextLine, bge-m3, OLLAMA_EMBED_BASE_URL, OLLAMA_EMBED_MODEL, hybrid, BM25, RRF, rerank, RERANK_POOL, ASK_EVIDENCE, verifier, span-grounding, HyDE, reviewAskStore, AskTab, ReviewAskToaster, ReviewAskBanner, qa/ready, probe:review-search, probe:embed-health, buildLlmProviderEnv, review-ask, 리뷰 질문 한도, 답변 캐시, askCache, askInflight, normalizeAskQuery, ASK_CACHE_TTL_MS, ASK_CACHE_MAX, ASK_CHAT_CONCURRENCY, askChatGate, ConcurrencyGate, CORPUS_CACHE_MAX_BYTES, CORPUS_CACHE_TTL_MS, estimateCorpusBytes, corpusGeneration, corpusCacheStats, Float32Array, PublicAskOptions, admit, quotaDeniedAnswer, REVIEW_ASK_GUEST_KEY_HEADER, x-guest-key, getGuestKey]
---

# review-search — 리뷰 문맥검색·RAG(enrich → 하이브리드 회수 → 리랭크 → 근거 생성 → 검증)

**2026-10-05 변경 흡수 — 공개 질문 일일 한도 `review-ask`·답변 캐시 20분·진행 중 합류·질문 LLM 동시 4·코퍼스 캐시 48MB 바이트 상한(`ab7dad28`, 성능 감사 2차 B-4·B-8)**: (1) **일일 한도(B-4)** — 예전 방어는 IP 분당 15회(`RATE.publicAsk`)뿐이라 IP 하나로 하루 2.16만 건 = chat 6.48만 콜이 가능했다. 이제 [usage-quota](usage-quota.md) 에 기능 `'review-ask'`(마이그레이션 없음 — feature 는 문자열)를 더해 기본값 게스트 기기 30·IP 300·전역 3,000/일·`guestCutoffPct` 90·IP 분당 15. 라우트([review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts))는 `app.resolveOptionalUser`(선택 인증, `security: OPTIONAL_BEARER`) + `x-guest-key`(`REVIEW_ASK_GUEST_KEY_HEADER` = 타로와 같은 공용 게스트 키 헤더, `^[A-Za-z0-9_-]{8,64}$` 밖이면 없는 것으로) + `clientKey(req)` 로 actor 를 만들고, 분당 한도도 `app.usageQuota.getSetting('review-ask').ipPerMinute` 를 읽는 async `max` 로 바꿨다(어드민 "설정 > 사용량 한도" 에서 조정 — [AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx) 라벨 '맛집 리뷰 질문'). **한도는 캐시 미스로 파이프라인을 실제로 돌릴 때만** 센다 — 서비스의 `askByPlaceId(placeId, query, { admit })` 가 답변 캐시 적중·같은 질문 합류·준비 안 됨(enrich 0건)에선 `admit` 을 부르지 않는다. 거부는 오류가 아니라 200 + `confidence:'none'` 안내문(`quotaDeniedAnswer` — disabled / 전역·게스트 컷오프 / 그 외 "오늘 질문할 수 있는 횟수를 모두 썼어요"), 기존 '준비 안 됨·일시 장애' 와 같은 계약이라 웹·앱 답변 카드가 그대로 보여 준다. 클라이언트는 shared `reviewSearchApi.publicAsk(placeId, query, guestKey)` 가 `getGuestKey()` 를 헤더로 보낸다(`useReviewAskPublic`·`reviewAskStore`). (2) **답변 캐시 + 합류** — 키 = (대표 `primaryId`, 검색가능 수 `ready`, enrich 세대 `corpusGeneration`, verify 여부, `normalizeAskQuery(query)` — NFC·trim·소문자·공백 축약·끝 `?!.~…？！。` 제거)를 `\u0000` 으로 이음. `askCache` LRU(`ASK_CACHE_MAX` 500, `ASK_CACHE_TTL_MS` 20분), `askInflight` 로 동시에 들어온 같은 질문은 진행 중 결과에 합류(실측: 같은 질문 동시 10건 LLM 30콜 → 3콜). 리뷰가 늘거나(ready↑) 재enrich 로 임베딩이 바뀌면(`ensureEnriched` 가 `enriched > 0` 일 때 세대 +1) 키가 달라져 자연 무효. 답변 생성·검증이 LLM 일시 실패로 빠진 결과는 캐시하지 않는다(`cacheable = parsed !== null && verified`). (3) **질문 경로 LLM 동시 4** — `chatJson` 이 ollama-cloud 어댑터의 계정 `ConcurrencyGate` 를 거치지 않아 몰리는 공개 질문이 요약·enrich 의 계정 동시성을 잠식할 수 있었다 → 리랭크·답변·검증 3콜을 로컬 `askChatGate = new ConcurrencyGate(ASK_CHAT_CONCURRENCY=4)` 안에서만(어드민 `ask` 도 같은 경로). enrich 는 자체 `ENRICH_CONCURRENCY` 로 따로 — 같이 묶으면 질문이 enrich 뒤에 줄 선다. (4) **코퍼스 캐시 바이트 상한(B-8)** — `max: 16`(개수) → `max: 64`(백스톱) + `maxSize: CORPUS_CACHE_MAX_BYTES` 48MB + `sizeCalculation: estimateCorpusBytes`(벡터 `byteLength` + 본문 글자 × 40(UTF-16 + BM25 trigram Map) + 항목당 400B, 1,032건 가게 실측으로 맞춘 계수) + `ttl` 30분·`updateAgeOnGet`. 코퍼스 벡터는 `Float32Array`(bge-m3 는 원래 float32 정밀도라 코사인 순위 사실상 동일, 메모리 절반) — [retrieval.ts](../../apps/friendly/src/modules/review-search/retrieval.ts) `cosine` 이 `ArrayLike<number>` 를 받는다. 예전엔 1,000건급 16곳 ≈ 190MB 가 TTL 없이 재시작까지 상주했다. 측정용 `corpusCacheStats()`. (5) **배선** — 랜덤 크롤 플러그인·자동 발견 라우트가 만들던 보조 `ReviewSearchService` 가 사라졌다(`app.crawl` 싱글톤, [crawl](crawl.md)) — 이제 인스턴스는 plugins/summaries 의 `app.reviewSearch` 하나라 enrich 중복 가드·코퍼스 무효화·enrich 완료 → 군집화가 모든 진입점에 먹는다. 아래 2026-08-22 문단의 "보조 인스턴스도 동일" 은 역사. 테스트: 신규 [review-search.test.ts](../../apps/friendly/src/modules/review-search/review-search.test.ts)(질문 정규화, 캐시 재사용 — 두 번째는 임베딩·LLM·한도 0, 동시 합류 1회, 한도 거부는 캐시 안 함, LLM 실패 결과 캐시 안 함, LLM 동시 ≤4, Float32·바이트 크기, enrich 0건은 한도 안 셈, 라우트 게스트 기기 한도 200+none), shared [review-search.api.test.ts](../../packages/shared/src/api/review-search.api.test.ts)(게스트 키 헤더 유무). 외부 API 문서(`docs/api`)의 공개 질문 summary·description 도 바뀌었다. 계획·원문: [PLAN-perf-2.md](../../docs/PLAN-perf-2.md) 7차·"모듈 묶음 → crawl", [PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) B-4·B-8. 관련 컨셉: [bounded-byte-caches](../concepts/bounded-byte-caches.md)(코퍼스 48MB)·[amplification-caps](../concepts/amplification-caps.md)(요청 하나 = 임베딩 1 + LLM 3)·[anonymous-usage-quota](../concepts/anonymous-usage-quota.md).

**2026-08-22 변경 흡수 — provider env 조립 `buildLlmProviderEnv()`(`cc8399a`)**: 이 도메인은 라우트가 아니라 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts) 가 `ReviewSearchService` 싱글턴을 조립하는데, 그 `AiConfigService` 의 `.env` 블록이 자체 리터럴에서 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 로 바뀌었다(자동 발견 라우트·random-crawl 플러그인이 만드는 보조 인스턴스도 동일 — *그 보조 인스턴스는 2026-10-05 에 없어졌다*). 연구 자산 `research/review-search/probe-*.ts` **10종**(ask-clean·completeness·e2e·embed-health·eval·hyde·latency·rerank-value·stage-clean·verify-rate)도 각자 들고 있던 `buildEnvBlock` 을 지우고 같은 함수를 import — `probe-model-tier.ts` 만 원래 env 블록이 없어 제외. chat purpose 해석·임베딩 경로(`OLLAMA_EMBED_*` 직접 fetch)는 변경 없음. 배경(purpose 5종, `defaultModels` 5키)은 [ai](ai.md).

리뷰 문맥검색 / RAG 도메인 — 크롤된 식당 리뷰에 대해 "리뷰 목록"이 아니라
**질문에 근거 있는 답(RAG)** 을 준다. 어드민 운영 도구가 1차이고, 공개 식당 상세의
"질문" 탭(placeId 기반, 선택 인증 — 2026-10-05 부터 IP 분당 + `review-ask` 일일 한도와 20분 답변 캐시)이
같은 엔진을 소비한다.

## Purpose [coverage: high — 6 sources]

리뷰를 임베딩으로 enrich → 하이브리드 회수(임베딩 dense ⊕ 키워드 BM25) → listwise LLM
리랭크 → RAG 답변 생성 → 검증 가드레일로 근거 없는 주장 제거, 이 파이프라인을 식당
단위로 돌린다. 제품 표면은 **RAG(질문)만** — standalone 시맨틱/관점 검색 엔드포인트는
제거됐고, 내부 검색 엔진(`search()`)은 RAG 안에서만 쓰인다
([review-search.ts](../../packages/api-contract/src/schemas/review-search.ts) 주석).

세 가지 사용 모드:

- **어드민 RAG 콘솔** — 식당을 골라 수동 enrich + 질문(인용·확신도·검증 결과 노출).
- **어드민 enrich 상태 관리** — 식당별/일괄 백그라운드 enrich + SSE 진행률.
- **공개 QA** — 공개 식당 상세의 "질문" 탭. placeId 로 식별, 선택 인증(게스트는 기기 키 `x-guest-key`
  + IP 로 일일 한도), IP 분당 한도. 비동기(전역 스토어 + 완료 토스트/배너 + 식당별 마지막 Q&A 영속).

이 도메인의 검증·연구 자산은 `apps/friendly/research/review-search/`(README + probe-*.ts)에
별도로 산다. enrich 가 채운 임베딩은 자매 토픽 [review-clustering](review-clustering.md)도
그대로 읽어 군집화한다(같은 `embeddingJson` 컬럼).

## Architecture [coverage: high — 11 sources]

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

**서비스 상태(app 싱글톤)** — `corpusCache`(2026-10-05 부터 바이트 상한 LRU: `maxSize` 48MB +
`sizeCalculation: estimateCorpusBytes` + `ttl` 30분 `updateAgeOnGet`, 개수 `max: 64` 는 작은 가게가 많을 때만
닿는 백스톱 — 예전 `max: 16` 은 큰 가게가 몰리면 ~190MB 가 TTL 없이 상주했다. 값은 `{ items(벡터 Float32Array), bm25 }`),
`corpusGeneration`(대표 키 → enrich 세대, 답변 캐시 키용 — 임베딩이 실제로 바뀐 enrich 만 +1),
`askCache`(LRU 500·20분)·`askInflight`(같은 질문 합류)·`askChatGate`(질문 경로 LLM 동시 4),
`enriching`(restaurantId→진행률 Map, 중복 트리거 가드 + 상태 뷰 + SSE), `enrichListeners`(SSE 구독자 Set).
라우트·요약 종료 훅이 같은 인스턴스를 공유해야 하므로 [plugins/summaries.ts](../../apps/friendly/src/plugins/summaries.ts)에서
한 번 생성해 `app.reviewSearch` 로 decorate + `SummaryService` 에 주입한다(2026-10-05 부터 랜덤 크롤·자동 발견이
따로 만들던 보조 인스턴스가 없어져 **진짜로** 하나다).

**공개 질문 흐름(2026-10-05)** — `askByPlaceId(placeId, query, { verify?, admit? })`: canonical 멤버 해석(없으면 null →
404) → enrich 0건이면 graceful `none`(한도 안 셈) → 캐시 키 계산 → `askCache` 적중이면 반환 → `askInflight` 에 같은
키가 있으면 합류(그쪽이 한도 거부로 끝났으면 `askCache` 를 한 번 더 보고 내 한도로 직접 돈다) → `runPublicAsk` 가
`admit()`(= 라우트의 `usageQuota.consume('review-ask', actor)`)을 부르고, 거부면 그 안내 답변으로 대신(캐시 안 함),
허용이면 `askDetailed` → `cacheable` 일 때만 `askCache.set`. 어드민 `ask(restaurantId, query)` 는 캐시·한도 없이
`askDetailed(...).result`.

**canonical 정합** — 검색·enrich·상태집계 모두 단일 행이 아니라 **그 가게(canonical)의
공개 멤버 행 전체**를 대상으로 한다. `loadCorpus`/`ensureEnriched` 는
`resolveCanonicalMembersByRestaurantId`, 공개 QA 는 `resolveCanonicalMembersByPlaceId`,
상태집계는 `listPublicPlaces` 를 쓴다([canonical-members.ts](../../apps/friendly/src/modules/restaurant/canonical-members.ts)).
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

## Talks To [coverage: high — 11 sources]

- **[usage-quota](usage-quota.md)** (2026-10-05) — 공개 질문의 `admit` 이 `app.usageQuota.consume('review-ask',
  { userId, guestKey, ip })`, 분당 한도는 `getSetting('review-ask').ipPerMinute`. 기본값은
  [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) `USAGE_QUOTA_DEFAULTS['review-ask']`
  (게스트 30·IP 300·IP 분당 15·전역 3,000·게스트 컷오프 90%), enum 은 api-contract `UsageQuotaFeature`. 회원은 같은
  서비스 규칙대로 전역 예산 + 회원 기능별 일일 상한 `MEMBER_PER_DAY`(100 — `78cbb457`)를 본다.
- **ai `ConcurrencyGate`** ([concurrency-gate.ts](../../apps/friendly/src/modules/ai/concurrency-gate.ts)) — 계정 게이트와
  같은 FIFO 클래스를 **로컬 인스턴스**로 써서 질문 경로 chat 3콜을 동시 4로 묶는다(어댑터 계정 게이트를 타는 것은 아님).

- **로컬 Ollama 임베딩 엔드포인트** — `${OLLAMA_EMBED_BASE_URL}/api/embed`(기본
  `http://localhost:11434`), model `bge-m3`. enrich 의 문서 임베딩 + **매 질문의 질의
  임베딩** 양쪽에 쓰여 회피 불가.
- **ollama-cloud chat** — `${baseUrl}/api/chat`(`aiConfig.getResolved('ollama-cloud','chat')`
  로 baseUrl/apiKey/defaultModel 해석 — `AiConfigService` 는 plugins/summaries 가
  `buildLlmProviderEnv()` 로 조립). 관점/문맥 추출, listwise 리랭크, RAG 생성, 검증,
  HyDE(평가 하니스용)에 사용. `chatJson` 이 코드펜스 제거 + 첫 `[{...}]` 매칭으로 견고 파싱,
  실패 시 null.
- **Prisma / SQLite** — `ReviewSummary` 행(`embeddingJson`/`aspectsJson`/`contextLine`/
  `enrichVersion`)이 검색 코퍼스의 영속 소스. `Restaurant`/`ReviewSummary` 조인으로 로드.
- **[restaurant](friendly.md) canonical-members** — `resolveCanonicalMembersBy*` /
  `listPublicPlaces` 로 가게 정체 통합(멤버 행 합산).
- **[summary](friendly.md) SummaryService** — 요약 종료 직후 자동 enrich → 군집화를
  fire-and-forget 로 체이닝. **reviewId 기반 해석**(commit 7407de9): 요약 큐 키(`placeId`
  인자)는 소스별 자유형(naver=placeId, diningcode=`dc:..`, tabling=`tb:..`)이라 placeId 로
  canonical 을 풀면 비-네이버는 null → 자동 enrich/군집이 조용히 스킵됐다. 그래서 훅이
  `reviewIds[0]` 로 실제 `restaurantId` 를 조회해 `ensureEnrichedByRestaurantId` 를 호출 —
  **모든 소스** 커버. 미주입(테스트)이면 훅 비활성. 군집화는 2026-07-13(`1f5ed30`)부터 요약 훅이 직접 부르지 않고
  plugins/summaries 가 `reviewSearch.onEnrichProgress`(done) 에 배선한 [review-clustering](review-clustering.md)
  `ensureClusteredByRestaurantId` 가 맡는다 — 이 배선은 `app.reviewSearch` 에만 걸려 있어, 2026-10-05 전
  랜덤 크롤·자동 발견의 보조 인스턴스로 흐른 enrich 는 군집화로 이어지지 않았다.
  ([summary.service.ts](../../apps/friendly/src/modules/summary/summary.service.ts) L1146~1165)
- **[review-clustering](review-clustering.md)** — 같은 `embeddingJson` 임베딩을 읽어
  군집화. `isJunk` 헬퍼와 `chatJson` 견고 파싱 관례를 review-search 에서 차용.
- **FE 공유 레이어** — [@repo/shared](../../packages/shared/src/api/review-search.api.ts)
  `reviewSearchApi` (경로 하드코딩 — `Routes.ReviewSearch` 가 vite prebundle 에서 드롭될 수
  있어), [useReviewSearch.ts](../../packages/shared/src/hooks/useReviewSearch.ts) React Query
  훅, [reviewAskStore.ts](../../packages/shared/src/stores/reviewAskStore.ts) zustand 전역 스토어.
  2026-10-05 부터 `publicAsk(placeId, query, guestKey)` 가 [guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts)
  `getGuestKey()` 를 `x-guest-key` 로 보낸다(스토어·`useReviewAskPublic` 둘 다). 같은 날 `d71fdb08` 이 게스트 키가
  스토리지에 한 번도 저장되지 않던 결함(웹 새로고침마다 새 키 → 기기 한도가 새로고침으로 풀림)을 고쳤다.

## API Surface [coverage: high — 8 sources]

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

**공개 QA** (`qa/ready` 는 무인증, `qa` 는 2026-10-05 부터 선택 인증 `OPTIONAL_BEARER`):

| 메서드·경로 | 핸들러 | 비고 |
|---|---|---|
| `GET /restaurants/:placeId/qa/ready` | `qaReady` | enrich 리뷰 수만 카운트(LLM 호출 없음 → 레이트리밋 불필요). 식당 없음 404 |
| `POST /restaurants/:placeId/qa` | `askByPlaceId` | 비싼 LLM 파이프라인. 본문 `{query}`(min1, max200), 헤더 `x-guest-key`(선택). 같은 가게·같은 질문은 리뷰 분석이 그대로인 동안 20분 같은 답변(한도 소비 없음). 한도 초과·준비 안 됨·일시 장애는 200 + `confidence:'none'` 안내. 식당 없음 404. summary "맛집 리뷰 기반 질문 답변(RAG) — 근거 리뷰 인용, 선택 인증, 같은 질문 20분 캐시, 일일 한도"(docs/api 반영) |

**`ReviewAskResult`** = `{ answer, confidence: 'high'|'medium'|'low'|'none', hyde: string|null,
citations: ReviewSearchHit[], verification: {applied, dropped: string[]}|null }`.
`hyde` 는 항상 `null`(HyDE 제거 후 계약 호환용으로 잔존). `verification.applied`=검증 패스
실행됨, `dropped`=근거 부족으로 제거된 주장 목록.

**한도** — 공개 ask 만, 두 겹. ① IP 분당 — `@fastify/rate-limit` 라우트 설정 `max: async () =>
(await app.usageQuota.getSetting('review-ask')).ipPerMinute`(기본 15, `timeWindow: '1 minute'`, 키는
[plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) `clientKey`). ② 일일 — `usageQuota.consume('review-ask', actor)`
(게스트 기기 30·IP 300·전역 3,000, 게스트는 전역의 90% 에서 먼저 끊김; 회원은 전역 + 회원 상한), 파이프라인을 실제로
돌릴 때만. *(역사: 2026-06-22 도입 땐 인메모리 고정창 `ASK_RATE_MAX=15`·`ASK_RATE_WINDOW_MS`(settlement 패턴), 2026-07-13
`bc2db00` 에 `RATE.publicAsk`(15/분) 프리셋으로, 2026-10-05 `ab7dad28` 에 위 두 겹으로.)* `GET /qa/ready` 는 LLM 호출이 없어
제한 없음.

## Data [coverage: medium — 4 sources]

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
`ENRICH_CONCURRENCY=6`, `RERANK_POOL=30`(env `RS_RERANK_POOL`), `ASK_EVIDENCE=6`. 2026-10-05 추가:
`CORPUS_CACHE_MAX_BYTES=48MB`·`CORPUS_CACHE_TTL_MS=30분`·`CORPUS_BYTES_PER_CHAR=40`·`CORPUS_ITEM_OVERHEAD_BYTES=400`,
`ASK_CACHE_TTL_MS=20분`·`ASK_CACHE_MAX=500`, `ASK_CHAT_CONCURRENCY=4`. 한도 기본값(`review-ask`)은 DB `usage_quota_settings`
행이 없을 때의 `USAGE_QUOTA_DEFAULTS` — 어드민에서 바꾸면 행이 생긴다. 서버 캐시·세대·합류 Map 은 전부 프로세스 메모리.
**클라 영속**(`reviewAskStore`): 식당별 마지막 `{query, result, answeredAt}` 만 `partialize`,
`MAX_KEPT=20`(최근순 cap), 키 `review-ask-v1`(웹 localStorage / 앱 AsyncStorage 주입).

## Key Decisions [coverage: high — 10 sources]

연구 자산(`research/review-search/`)이 모든 결정을 측정으로 뒷받침한다. 판정은
self-bias 회피를 위해 **독립 Claude(`EVAL_JUDGE=claude`, 헤드리스 `claude -p`, API 키
불필요)** 로 한다(생성기와 같은 gpt-oss 판정 시 faithfulness 100% 로 부풀려짐 — 실측 67~83%).

**2026-10-05 성능 감사 2차(`ab7dad28`)**:

- **2026-10-05: 공개 질문에 타로식 일일 한도 `review-ask` — 마이그레이션 없이 기능 하나 추가** (B-4) — 분당 15회만으로는
  IP 하나가 하루 LLM 6만여 콜을 쓸 수 있었다. 이미 있는 [usage-quota](usage-quota.md) 체계(게스트 기기·IP·전역 일일 + 게스트
  컷오프)에 기능 enum 하나를 더해 어드민 화면에서 조정 가능하게 했다. 기본값은 "분당은 기존 15 그대로, 일일은 사주와 같은
  수준에서 시작"(코드 주석).
- **2026-10-05: 한도는 캐시 미스로 파이프라인을 돌릴 때만 센다 — 거부는 200 안내 답변** — 예시 칩 29개처럼 같은 질문이 많아
  캐시 적중이 흔하고, 적중은 비용이 0 이라 한도를 깎을 이유가 없다. 그래서 한도 판정을 라우트 앞이 아니라 서비스 안 `admit`
  콜백으로 넘겼다. 거부를 오류 대신 `confidence:'none'` 안내로 한 것은 기존 '준비 안 됨·일시 장애' 와 같은 계약이라 웹·앱을
  바꾸지 않아도 되기 때문.
- **2026-10-05: 답변 캐시 키에 "코퍼스 버전" 을 넣어 무효화를 키로 해결** — 검색가능 수(`ready`) + 프로세스 내 enrich 세대.
  리뷰가 늘거나 재enrich 로 임베딩만 바뀐 경우까지 키가 달라져 명시적 무효화 경로가 필요 없다. LLM 일시 실패 결과는 캐시하지
  않아 다음 질문이 다시 시도한다.
- **2026-10-05: 질문 경로 LLM 은 로컬 게이트 4로 — 계정 게이트 통일은 미룸** — `chatJson` 을 어댑터 경유로 바꾸는 것(직전 감사
  DEFERRED #8)보다 작게, 로컬 세마포어로 공개 질문이 요약·enrich 의 계정 동시성을 잠식하지 않게만 묶었다. enrich 는 따로 둔다
  (묶으면 질문이 enrich 뒤에 줄 선다).
- **2026-10-05: 코퍼스 캐시는 개수가 아니라 바이트로, 벡터는 Float32** (B-8) — 가게마다 코퍼스 크기가 30건~3천 건으로 흔들려
  개수 16 은 메모리 상한이 아니었다([bounded-byte-caches](../concepts/bounded-byte-caches.md)). Float32 는 bge-m3 의 원래
  정밀도라 순위가 사실상 같고 메모리가 절반 — findings 의 "Float32 면 cosine 도 빨라짐" 은 실측으로 반박돼(동일 속도) 메모리
  효과만 근거로 삼았다.

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

## Gotchas [coverage: high — 9 sources]

- **회원 한도 서술이 문서와 코드에서 다르다** (2026-10-05) — 라우트 description(그리고 거기서 생성된
  `docs/api/openapi.json`)은 "회원(Bearer)은 전역 일일 예산만 적용된다" 고 하지만, 같은 날 `78cbb457` 이
  [usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) `consume` 에 회원 기능별
  일일 상한 `MEMBER_PER_DAY = 100`(user scope)을 넣어 `review-ask` 에도 걸린다. 회원이 100회를 넘으면 기본 안내
  "오늘 질문할 수 있는 횟수를 모두 썼어요"(사유 `member_daily`).
- **한도에 거부된 요청에 합류한 사람은 다시 자기 한도로 돈다 — 그 사이 재확인이 얇다** — 합류한 요청이 거부 결과를 받으면
  `askCache` 를 한 번 보고 바로 새 `runPublicAsk` 를 시작한다. 그 사이 같은 키로 이미 다른 사람이 새로 돌고 있어도
  `askInflight` 를 다시 보지 않아 파이프라인이 겹칠 수 있다(PLAN-perf-2 "리뷰 반영 → 남긴 것" 의 낮음 항목 — 미수정).
- **답변 캐시·enrich 세대·합류는 프로세스 메모리** — 재시작하면 비고(첫 질문들은 다시 한도를 센다), 세대가 0 으로
  돌아가도 캐시도 함께 비어 오래된 답이 남지는 않는다. 다중 인스턴스라면 성립하지 않는 설계(CLAUDE.md 단일 인스턴스 전제).
- **바이트 상한은 근사치** — `estimateCorpusBytes` 는 본문 글자 × 40 + 항목당 400B 로 BM25 trigram Map 을 근사한다(1,032건
  가게 실측으로 맞춤). 본문이 아주 길거나 짧은 가게는 실제와 어긋날 수 있다. 측정은 `corpusCacheStats()`.
- **`lru-cache` 호환 래퍼에 옵션을 더할 때** — `createRequire` 로 받은 생성자의 타입 `LruCacheConstructor` 를 손으로
  적어 두었다. 2026-10-05 에 `maxSize`·`sizeCalculation`·`ttl`·`updateAgeOnGet`·`calculatedSize` 를 추가했는데, 새 옵션을
  쓰면 이 인터페이스도 같이 넓혀야 타입이 통과한다(실제 v11 은 다 지원).
- **세마포어가 두 벌** — 질문 게이트는 `modules/ai/concurrency-gate` 의 `ConcurrencyGate`, perf-2 의 다른 묶음은
  `lib/async-gate`. 통합은 PLAN 의 후속 항목이다.

- **임베딩 엔드포인트 운영 필수** — Ollama Cloud 엔 임베딩 모델이 없다(401). 생성/리랭크/
  검증은 원격 OK 지만 **임베딩(bge-m3)만은 도달 가능한 Ollama 가 따로** 필요하고, enrich
  뿐 아니라 매 질문의 질의 임베딩에도 써서 회피 불가. 단일 인스턴스(Docker 금지)라 운영
  호스트에 Ollama 네이티브 실행(systemd) + `ollama pull bge-m3` + `OLLAMA_EMBED_BASE_URL`.
  배포 전 `pnpm --filter friendly probe:embed-health` 로 도달성·차원 검증.
- **부팅 헬스체크는 경고만** — 임베딩 미도달 시 부팅 로그에 `[review-search] 임베딩 미도달`
  warn 만 찍고 서버는 계속 뜬다(review-search 만 동작 불가). `NODE_ENV==='test'` 면 스킵.
- **공개 질문은 graceful 폴백** — 임베딩/LLM 일시 장애를 공개 사용자에게 500 대신
  `confidence:'none'` 안내로 처리. enrich 안 된 식당도 graceful none(자동 enrich 안 함 — 비용). 2026-10-05 부터 한도 거부도
  같은 모양이라, 화면만으로는 "준비 안 됨"·"장애"·"한도" 를 문구로만 구분한다.
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
- **lru-cache ESM interop** — `corpusCache` 의 `lru-cache` 는 `import { LRUCache }` 대신
  `createRequire(import.meta.url)` 로 require 해 default/named export 양쪽을 흡수한다(commit
  808c447). 번들·모듈 해석 차이로 named import 가 깨지는 걸 회피하는 ESM/CJS 상호운용 처리.

## Sources [coverage: high — 36 sources]

- [apps/friendly/src/modules/review-search/review-search.test.ts](../../apps/friendly/src/modules/review-search/review-search.test.ts) (신규 2026-10-05 — 답변 캐시·합류·한도·LLM 동시 4·Float32·바이트 크기·라우트 게스트 한도)
- [packages/shared/src/api/review-search.api.test.ts](../../packages/shared/src/api/review-search.api.test.ts) (신규 2026-10-05 — `x-guest-key` 헤더)
- [apps/friendly/src/modules/usage-quota/usage-quota.service.ts](../../apps/friendly/src/modules/usage-quota/usage-quota.service.ts) (`USAGE_QUOTA_DEFAULTS['review-ask']`·`consume`·`MEMBER_PER_DAY`)
- [packages/api-contract/src/schemas/usage-quota.ts](../../packages/api-contract/src/schemas/usage-quota.ts) (`UsageQuotaFeature` 에 `'review-ask'`)
- [apps/friendly/src/modules/ai/concurrency-gate.ts](../../apps/friendly/src/modules/ai/concurrency-gate.ts) (`ConcurrencyGate` — 질문 경로 로컬 게이트로 재사용)
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) (`clientKey` — 이제 `RATE.publicAsk` 프리셋은 쓰이지 않음)
- [packages/shared/src/stores/guestKeyStore.ts](../../packages/shared/src/stores/guestKeyStore.ts) (`getGuestKey` — 2026-10-05 `d71fdb08` 저장 결함 수정)
- [apps/web/src/routes/admin/AdminQuotasPage.tsx](../../apps/web/src/routes/admin/AdminQuotasPage.tsx) ('맛집 리뷰 질문' 한도 행)
- [apps/friendly/src/plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) (2026-10-05 — 보조 `ReviewSearchService` 를 없앤 앱 싱글톤 크롤)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) (7차 B-4 수정안·"모듈 묶음 → crawl"·리뷰 반영 남긴 것)
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) (B-4·B-8 측정 원문)
- [docs/api/endpoints.md](../../docs/api/endpoints.md) (공개 질문 summary — 선택 인증·20분 캐시·일일 한도)
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) (`buildLlmProviderEnv()` — 플러그인·research probe 10종의 env 조립, 2026-08-22)
- [apps/friendly/src/modules/review-search/retrieval.ts](../../apps/friendly/src/modules/review-search/retrieval.ts) (2026-10-05 — `cosine(ArrayLike)`)
- [apps/friendly/src/modules/review-search/review-search.service.ts](../../apps/friendly/src/modules/review-search/review-search.service.ts) (2026-10-05 — 바이트 상한 코퍼스 캐시·답변 캐시·합류·`askChatGate`·`admit`)
- [apps/friendly/src/modules/review-search/review-search.route.ts](../../apps/friendly/src/modules/review-search/review-search.route.ts) (2026-10-05 — `review-ask` 한도·선택 인증·`quotaDeniedAnswer`)
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
