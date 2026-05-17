---
concept: 도메인별 LLM 프롬프트/스키마 버전 상수
last_compiled: 2026-05-17
topics_connected: [ai, friendly, menu-grouping, analytics, auto-discover]
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
- **menu-grouping** in [[../topics/menu-grouping]] (`apps/friendly/src/modules/menu-grouping/menu-grouping.prompts.ts`): `MENU_GROUPING_VERSION = 1`. 저장 컬럼은 `MenuCanonical.version`. 재실행: 단건 `POST /admin/restaurants/place/:placeId/menus/group`, batch `POST /admin/analytics/grouping-jobs`. UI 노출은 두 군데 — ranking 응답이 `modelVersion` vs `currentVersion` 을 같이 내려서 클라이언트가 "재실행 권장" 배지를 띄우고, 식당 상태 테이블의 `storedVersion` 컬럼이 일괄 모니터링 뷰가 됨.
- **analytics (global merge)** in [[../topics/analytics]] (`apps/friendly/src/modules/analytics/global-merge.prompts.ts`): `GLOBAL_MERGE_VERSION = 2` (v1: string→string 매핑, v2: `{canonical, categoryPath}` 객체로 schema 변경). 저장 컬럼은 `GlobalMenuCanonical.version`. 재실행: `POST /admin/analytics/global-merge-jobs` 에 `full=true` 를 붙여 v1 잔여 행을 v2 로 다시 돌림. v1→v2 가 단순 prompt tweak 이 아니라 schema 단위 변경이었다는 점에서, 이 패턴이 schema 변형까지 흡수함을 보여줌.
- **auto-discover** in [[../topics/auto-discover]] (`apps/friendly/src/modules/auto-discover/auto-discover.prompts.ts`): `AUTO_DISCOVER_PROMPT_VERSION = 1`. **얇은 인스턴스** — 4 요소 세트 중 (1) `*_VERSION` 상수만 채택, (2) DB 컬럼 / (3) stale 비교 / (4) UI 배지+재실행은 **해당 없음**. 이유: AI 출력(키워드 8개)이 영속화되지 않고 잡 안에서 한 번만 쓰이고 버려짐. 등록 결과(가게 행)는 LLM 응답이 아니라 그 키워드로 검색한 네이버 API 결과에서 옴 → 프롬프트 버전이 데이터에 박힐 자리가 없다. 그래도 상수를 둔 이유는 향후 fallback 결정(예: AI 응답이 자주 빈 케이스의 통계 분석)이나 새 잡 도메인이 LLM 출력을 영속화하기 시작할 때 자연스럽게 4 요소로 확장 가능하게 — **패턴이 새 도메인 추가 시 기본 디자인으로 자리 잡았음**을 보여주는 5 번째 인스턴스. 4 요소 중 1 요소만 채택해도 코스트 ~0.

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
