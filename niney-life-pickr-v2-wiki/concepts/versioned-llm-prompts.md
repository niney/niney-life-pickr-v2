---
concept: 도메인별 LLM 프롬프트/스키마 버전 상수
last_compiled: 2026-06-25
topics_connected: [ai, friendly, menu-grouping, analytics, auto-discover, settlement, review-search, review-clustering, logs]
status: active
---

# 도메인별 LLM 프롬프트/스키마 버전 상수

## Pattern

LLM 호출이 있는 모든 도메인이 **같은 모양의 versioning 규약**을 채택한다. 프롬프트는 코드처럼 진화하지만 모델 출력은 외부 세계 — 그래서 코드와 데이터 사이에 명시적 "조약"이 필요하다. 이 코드베이스는 그 조약을 다음 4가지 요소로 표준화했다:

1. **도메인 모듈 안의 `*_VERSION` 상수** — `ANALYSIS_VERSION`, `MENU_GROUPING_VERSION`, `GLOBAL_MERGE_VERSION` 같은 정수 단조증가 상수. 프롬프트 / JSON schema / few-shot 중 어느 하나라도 바뀌면 +1.
2. **DB 컬럼 동반 기록** — LLM 응답을 영속화할 때 그 시점의 `*_VERSION` 을 같이 박는다 (`ReviewSummary.analysisVersion`, `MenuCanonical.version`, `GlobalMenuCanonical.version`).
3. **상수 옆에 변경 사유 코멘트** — `// vN: 변경 이유` 형태로 상수 정의 바로 위에 줄단위 히스토리. PR diff 와 git blame 만으로 "이 버전에서 뭐가 바뀌었나" 가 추적 가능.
4. **stale 표시 + 명시적 재실행** — 통계/조회 쿼리는 `stored < current` 인 행을 "재실행 권장" 또는 "stale" 로 분류, 관리자 UI 가 배지로 노출. 실제 재실행은 사용자가 명시적으로 트리거.

자동 마이그레이션은 안 한다. LLM 호출은 비용 + 비결정성이 있어서 "버전 올라갔으니 일괄 재호출" 은 위험하고 비싸다. 그래서 **수동 트리거 + UI 배지** 가 자연스러운 합의점.

## Instances

- **summary** in [[../topics/friendly]] (`apps/friendly/src/modules/summary/summary.service.ts`): `ANALYSIS_VERSION = 4` (v3: structured output 도입, v4: traits + `menus[].sentiment` 필수 필드 추가). 저장 컬럼은 `ReviewSummary.analysisVersion`. 재실행 진입점: `POST /admin/restaurants/place/:placeId/reanalyze` — 실패한 행 + `analysisVersion < current` 인 행을 자동으로 큐잉해 다시 돌린다. 리뷰 단위 자동 재시도(총 3회)와 결합되어 stale 흡수 비용을 낮춤.
- **menu-grouping** in [[../topics/menu-grouping]] (`apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts`): `MENU_GROUPING_VERSION = 2` (18차 bump). 저장 컬럼은 `MenuCanonical.version`. 재실행: 단건 `POST /admin/restaurants/place/:placeId/menus/group`, batch `POST /admin/analytics/grouping-jobs`. UI 노출은 두 군데 — ranking 응답이 `modelVersion` vs `currentVersion` 을 같이 내려서 클라이언트가 "재실행 권장" 배지를 띄우고, 식당 상태 테이블의 `storedVersion` 컬럼(`storedVersion < MENU_GROUPING_VERSION` 이면 attention)이 일괄 모니터링 뷰가 됨. **v1→v2(18차) 는 출력 계약 변경 bump** — v1 의 "전 항목 에코"(O(N) 출력)가 reasoning 토큰·maxTokens 와 다퉈 큰 식당에서 잘리던 `parse_failed` 운영 장애를, 출력을 "병합 그룹만, 인덱스 배열"(`{"groups":[[0,1,2]]}`)로 축소해 구조적으로 제거. canonical 이름은 이제 LLM 이 아니라 코드(`pickCanonicalName`: 최단→빈도→사전순)가 결정 — 프롬프트는 membership 판정만. 4 요소 풀세트(상수·DB 컬럼·stale 비교·재실행) 유지.
- **analytics (global merge)** in [[../topics/analytics]] (`apps/friendly/src/modules/analytics/global-merge.prompts.ts`): `GLOBAL_MERGE_VERSION = 3` (v1: string→string 매핑, v2: `{canonical, categoryPath}` 객체로 schema 변경, v3: 택소노미 축 전환). 저장 컬럼은 `GlobalMenuCanonical.version`. 재실행: `POST /admin/analytics/global-merge-jobs` 에 `full=true` 를 붙여 이전 버전 잔여 행을 다시 돌림. v1→v2 가 단순 prompt tweak 이 아니라 schema 단위 변경이었다는 점에서, 이 패턴이 schema 변형까지 흡수함을 보여줌.
- **auto-discover** in [[../topics/auto-discover]] (`apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts`): `AUTO_DISCOVER_PROMPT_VERSION = 1`. **얇은 인스턴스** — 4 요소 세트 중 (1) `*_VERSION` 상수만 채택, (2) DB 컬럼 / (3) stale 비교 / (4) UI 배지+재실행은 **해당 없음**. 이유: AI 출력(키워드 8개)이 영속화되지 않고 잡 안에서 한 번만 쓰이고 버려짐. 등록 결과(가게 행)는 LLM 응답이 아니라 그 키워드로 검색한 네이버 API 결과에서 옴 → 프롬프트 버전이 데이터에 박힐 자리가 없다. 그래도 상수를 둔 이유는 향후 fallback 결정(예: AI 응답이 자주 빈 케이스의 통계 분석)이나 새 잡 도메인이 LLM 출력을 영속화하기 시작할 때 자연스럽게 4 요소로 확장 가능하게 — **패턴이 새 도메인 추가 시 기본 디자인으로 자리 잡았음**을 보여주는 5 번째 인스턴스. 4 요소 중 1 요소만 채택해도 코스트 ~0.
- **settlement-extraction** in [[../topics/settlement]] / [[../topics/ai]] (`apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts`): `EXTRACTION_VERSION` 상수. 영수증 사진(image purpose vision LLM) → 구조화 항목 (name, unitPrice, quantity, amount, category 4 enum) 추출. **얇은 인스턴스 — 1 요소 채택** (`*_VERSION` 상수만). DB 컬럼 / stale 비교 / UI 배지+재실행 = 해당 없음 — 이유: 추출 결과가 그대로 영속화되지 않는다. 서버가 추출 결과를 client 에 내려주고 사용자가 Step3 에서 편집한 다음에야 `SettlementItem` 으로 저장됨. 저장 시점엔 "사용자 확정 항목" 이지 "AI 추출 항목" 이 아니므로 추출 버전을 박을 자리도 stale 의미도 없음 (영수증을 다시 올리면 새 버전으로 재추출). **첫 vision LLM 컨슈머** — 텍스트만 다루던 기존 4개 도메인과 다른 modality 이지만 같은 4-요소 표준에 1 요소만 빌려서 자연스럽게 흡수. 6 번째 인스턴스 — 패턴이 modality 차이(text → image)도 흡수.
- **2026-05-28** in [[../topics/settlement]] / [[../topics/ai]]: **`EXTRACTION_VERSION` v1 → v2 첫 bump**. 변경 내용은 프롬프트 envelope 만 — `buildExtractionUserPrompt(roundHint)` 가 "N차 영수증" 컨텍스트 라인을 system 프롬프트에 추가해 다라운드 정산에서 한 영수증의 차수를 모델에게 힌트로 줌. **출력 JSON 스키마(`EXTRACTION_JSON_SCHEMA`) 는 손대지 않음** — 모델 응답 모양은 그대로(items[] + totalAmount), 입력 envelope 만 진화. 얇은 인스턴스의 성격도 그대로 — DB 컬럼 / stale 비교 / UI 배지 / 자동 재실행 모두 여전히 해당 없음. 추출 결과는 사용자가 Step3 에서 확정해야 영속화되므로 버전을 박을 자리도 stale 의미도 없음. **새 영수증을 다음 번 올리면 v2 가 자연히 적용** — vision 추출 도메인의 "stale 흡수 비용 0" 특성을 다시 확인.

- **2026-06-01** in [[../topics/settlement]] / [[../topics/ai]]: **`EXTRACTION_VERSION` v2 → v3** — 영수증 OCR 빈 항목 회귀 수정. 빈 결과를 허용하던 소극적 시스템 프롬프트 문구를 제거해, vision 모델이 항목을 통째로 빠뜨리던 회귀를 잡음. 출력 JSON 스키마는 불변, system 프롬프트 envelope 만 진화 — v1→v2(N차 컨텍스트 라인)와 같은 "envelope-only bump". 얇은 인스턴스 성격 유지(DB 컬럼/stale 비교/UI 배지/자동 재실행 모두 해당 없음 — 추출 결과는 Step3 사용자 확정 후에야 `SettlementItem` 으로 영속). 같은 vision 도메인의 **2번째 bump** — 텍스트 도메인과 똑같이 버전 상수가 프롬프트 회귀의 추적 단위가 됨(다음 영수증 업로드부터 v3 자연 적용).

- **2026-06**(17차) in [[../topics/analytics]] (`global-merge.prompts.ts`): **`GLOBAL_MERGE_VERSION` 2 → 3 — 진짜 bump(envelope-only 가 아닌 의미 변경)**. settlement-extraction 의 v2/v3 가 입력 envelope 만 진화한 "얇은 bump" 였다면, 이번은 **출력 의미(택소노미 축)** 자체가 바뀐 무거운 bump — 최상위 카테고리를 음식 종류(한식/일식/양식)에서 재료·메뉴군(고기/면/김치/반찬…)으로 전환(상수 위 코멘트에 v3 사유 기록, `analytics.service` 의 `TOP_WHITELIST` 와 동기화 필수). **4 요소 풀세트 인스턴스** — 5번째 auto-discover(1요소)·6번째 extraction(1요소) 같은 얇은 인스턴스와 달리 4점 세트를 모두 채택: (1) `GLOBAL_MERGE_VERSION` 상수 3, (2) DB 저장(`MenuCanonical.categoryPath` + `globalMergeVersion`/`GlobalMenuCanonical.version`), (3) stale 비교(어드민 UI 가 `storedVersion < currentVersion` 배지), (4) 수동 재실행. **재실행 시 주의: `full=true` 필수** — 증분 머지만으로는 기존 행의 categoryPath 가 안 바뀌므로(v2 path 가 그대로 남음) 전체 재머지가 있어야 새 축이 반영됨. version bump 가 "데이터 재마이그레이션이 자동이 아니다" 를 가장 선명하게 보여주는 케이스 — 축 전환 같은 의미 변경은 증분 흡수가 불가능하고 전량 재호출만이 정답.

- **2026-06-25**(18차) in [[../topics/settlement]] / [[../topics/ai]]: **`EXTRACTION_VERSION` v3 → v4 — 주류 일반단어형 제품명 오분류 보정**. '새로'(진로)·'대선'·'시원' 같은 일반 단어와 겹치는 국내 주류 브랜드를 vision 모델이 SIDE(안주)/UNCATEGORIZED 로 찍던 오류를 **이중 안전망**으로 잡음: (1) system 프롬프트 ALCOHOL 설명에 `DRINK_BRAND_PROMPT_HINT`(= `@repo/api-contract` 의 `DRINK_KINDS` 사전에서 자동 생성) 삽입, (2) 서버 후보정 `matchDrinkKind([matchedMenuName, name])` 가 결정적으로 카테고리를 덮어씀(`categoryCorrections` 계측). **출력 JSON 스키마는 불변**(category 4 enum 동일) — envelope+후보정 bump. 얇은 인스턴스 성격 유지(영속 전 Step3 사용자 확정). vision 도메인의 3번째 bump. 곁들여 **"결정적 후보정 > LLM 프롬프트 신뢰"** 설계 — 프롬프트는 best-effort, 순수 함수가 모델 교체에도 동작 보장(summary `extractFirstJsonObject` 후처리와 같은 결).
- **2026-06-25**(18차) in [[../topics/review-search]] (`apps/friendly/src/modules/review-search/review-search.service.ts`): **`ENRICH_VERSION = 1`** — 리뷰 enrich(관점+문맥+bge-m3 임베딩) 의 프롬프트/모델 버전. `ReviewSummary.enrichVersion` 컬럼에 박히고, 재enrich 게이트가 `enrichVersion: null OR { lt: ENRICH_VERSION }` 인 행을 다시 처리. **4 요소 중 3 채택** — (1) 상수, (2) DB 컬럼, (3) stale 비교 게이트는 있으나 (4) UI 배지는 없고 enrich-status 페이지가 그 자리. 신규 도메인이 첫 버전부터 versioning 규약을 기본 장착한 사례.
- **2026-06-25**(18차) in [[../topics/review-clustering]] (`apps/friendly/src/modules/review-clustering/review-clustering.service.ts`): **`CLUSTERING_VERSION = 4`** — 군집 알고리즘/프롬프트 버전(`// v2:극성주입 v3:corpusSize v4:canonical 통합 코퍼스`). `ReviewCluster.clusterVersion` 컬럼 + `corpusSize` 동반. 재군집 게이트 `shouldRecluster` 가 (현재 버전 군집 없으면 무조건 / 있으면 corpusSize 가 max(GATE_MIN=20, base×0.2) 이상 늘었을 때만) 트리거 — **버전 게이트 + 코퍼스 증가 게이트 결합**. 4 요소 풀세트의 군집 변형([[canonical-corpus-fanout]] 의 corpusSize 와 직결).
- **2026-06-25**(18차) in [[../topics/logs]] (`apps/friendly/src/modules/logs/log-analysis.service.ts`): **명시 버전 토큰 없는 변형** — 실패 run LLM 분석의 `SYSTEM_PROMPT` + `REPORT_JSON_SCHEMA`(Ollama structured output)가 `summary.service` 의 `ANALYSIS_JSON_SCHEMA` 선례를 **손으로 미러링**(주석 명시). `*_VERSION` 상수는 없지만 "프롬프트/스키마를 손으로 미러링하고 변경 시 함께 갱신" 컨벤션을 공유 — 이 패턴의 versioning-less 사촌. 프롬프트 인젝션 방어(`<logs>` 펜싱 + 닫는 태그 이스케이프)도 동반.

## What This Means

이 패턴이 알려주는 것:

1. **프롬프트는 코드처럼 진화하지만 출력은 외부**. 코드 배포만으로는 데이터를 못 따라잡는다. `*_VERSION` 상수는 그 간극을 명시적으로 만든 "조약" 으로, 코드 변경(프롬프트 수정)과 데이터 마이그레이션(재호출)을 분리한다.
2. **자동 일괄 마이그레이션이 어렵다는 것을 받아들임**. LLM 호출 비용 + 결과 비결정성 때문에 "deploy 가 자동으로 모든 stale 을 재호출" 은 위험. 그래서 **수동 트리거 + UI 배지** 가 자연스러운 합의점이 된다 — 관리자가 비용/우선순위를 보고 직접 결정.
3. **같은 패턴이 3+ 도메인에 박혀 있고 새 LLM 도메인도 같은 모양으로 흡수될 가능성이 크다**. 새 LLM 호출 도메인이 추가되면 (a) `*_VERSION` 상수, (b) 응답 저장 테이블의 `version` 컬럼, (c) stale 비교 쿼리, (d) UI 배지 + 재실행 엔드포인트 — 이 4점 세트가 그대로 복제된다. 이미 표준이 됐다.
4. **자주 발생하는 실수: VERSION 안 올리고 프롬프트만 수정**. 그 결과 새/구 데이터가 같은 `version` 으로 섞여서 통계가 noise 를 가진다. 매 PR 리뷰의 체크리스트가 됨 — "프롬프트 / schema / few-shot 변경했으면 `*_VERSION` 올렸나?". 이 체크가 빠지면 데이터 신뢰도가 조용히 무너진다.
5. **summary 의 자동 재실행 vs grouping/global-merge 의 수동 재실행** 차이가 의미 있음. summary 는 행 단위가 작고(리뷰 1건) 비용이 낮아서 `analysisVersion < current` 를 자동 큐잉. grouping/global-merge 는 batch 단위가 크고 비용이 무거워서 명시적 job 생성을 요구. 같은 패턴 안에서도 "자동 흡수 vs 명시 트리거" 의 다이얼이 도메인 비용에 맞춰 조정된다.

## Sources

- [summary in friendly](../topics/friendly.md)
- [menu-grouping](../topics/menu-grouping.md)
- [analytics](../topics/analytics.md)
- [ai](../topics/ai.md)
- [auto-discover](../topics/auto-discover.md)
- [settlement](../topics/settlement.md)
