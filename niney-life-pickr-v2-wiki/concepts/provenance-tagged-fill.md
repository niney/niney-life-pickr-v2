---
concept: 채운 값에 출처 꼬리표 — 빈칸을 다른 원천으로 메울 때 "어디서 왔나"를 값과 함께 저장하고, 화면 문구는 꼬리표를 따라간다
last_compiled: 2026-10-26
topics_connected: [hiking, meal, food, menu-board, parking, api-contract, web, mobile]
status: active
---

# 채운 값에 출처 꼬리표 — 빈칸을 다른 원천으로 메울 때 "어디서 왔나"를 값과 함께 저장하고, 화면 문구는 꼬리표를 따라간다

## Pattern

공공데이터·크롤 데이터는 늘 군데군데 비어 있다. 이 리포는 빈칸을 그대로 두지 않고 **다른 원천으로 메운다** — 근처 등산 기록의 고도를 빌리고, 같은 계열 음식의 영양을 빌리고, 메뉴판 사진에서 등록 메뉴에 없는 메뉴를 찾고, 세 군데 주차장 원천을 합친다. 그렇게 채운 값은 원래 값과 **정확도도, 책임 소재도 다르다.** 그래서 반복해서 같은 모양이 나왔다: **채우는 순간 출처 꼬리표(enum)를 값 옆에 저장하고**, 계약이 그 꼬리표를 그대로 내보내며, 웹·앱은 꼬리표마다 다른 문구("근처 등산 기록에서 가져와 계산", "○○ 기준 추정", "사진에만 있는 메뉴", 출처 표기)를 붙인다.

꼬리표가 "읽을 때 추론"이 아니라 **"쓸 때 기록"** 이라는 점이 핵심이다. 읽는 쪽이 값만 보고 출처를 짐작할 수는 없다(빌린 고도와 원래 고도는 같은 숫자 모양이다). 그리고 꼬리표가 있어야 나중에 **추정한 것만 골라 다시 채울 수 있다** — 식단 `backfill --estimate`, 메뉴판 프롬프트 버전이 오르면 그 버전 아래 읽기만 다시 읽기.

[unknown-vs-zero](unknown-vs-zero.md) 가 "값이 **없는** 경우를 몇 가지로 가르나" 라면, 이 컨셉은 그 짝 — "값이 **있지만 원래 것이 아닌** 경우를 몇 가지로 가르나" 다. 식단의 `MealNutritionBasis` 는 두 축을 한 enum 에 담았다(`missing` 은 없음, 나머지 셋은 출처).

## Instances

- **2026-10-26** in [hiking](../topics/hiking.md) / [api-contract](../topics/api-contract.md) / [web](../topics/web.md) / [mobile](../topics/mobile.md) (9차 `0e38c4ee` + 9차 보강, 작업 트리): 국립공원 공식 탐방로 선에는 고도가 없다. 조립이 **근처(30m) GPX 선 점 → 지형 고도(SRTM 30m) → 없음** 순서로 채우고 그 결과를 코스 문구 JSON 의 `elevationFrom: 'nearby' | 'terrain'`(계약 `HikingParkCourse.elevationFrom`, 없으면 `null`)에 남긴다. 웹·앱 코스 상세는 이 값으로 안내를 바꾼다("근처 등산 기록에서 가져와 계산" / "지형 자료(SRTM 30m)로 계산 — 봉우리가 수십 m 낮게 나올 수 있다" / "고도 기록이 없어 계산하지 못했다"). 코스 자체에도 원천 꼬리표 `source: top100 | peak | network | park` 가 있어 "봉우리 자료(선·고도만)", "이어 만든 길(실제 안내와 다를 수 있음)" 을 붙이고, GPX 내보내기 metadata desc 도 같은 꼬리표로 출처 문장을 만든다. 같은 길 GPX 코스에 붙인 공식 문구가 코스 방향과 반대면 문구를 고치지 않고(공공누리 변경금지) `reversed` 꼬리표만 단다. 코스 지점의 시설도 `source: 'facility' | 'park'`(일상지도 화장실·공영 주차 / 국립공원공단).
- **2026-10-23** in [meal](../topics/meal.md) / [food](../topics/food.md) (`92e79e9a`): 식단 항목 영양 근거 `MealNutritionBasis = direct | donor_estimate | typical_portion | missing`. 카탈로그에 없는 이름은 규칙 엔진 → LLM 매칭 캐시 → 웹 실측 캐시 순으로 채우되 **`basis: donor_estimate` + `foodId: null`** 로 저장해 카탈로그에서 빌린 값과 가른다. 화면은 "○○ 기준 추정" 으로 밝히고(`MealDetailPage`·`MealRecommendTab` 이 `nutritionBasis === 'donor_estimate'` 로 분기), 합계·영양 점검에는 넣는다(사용자 결정). 운영은 `backfill:meal-nutrition --estimate` 가 빈 이름만 다시 채운다.
- **2026-10-10** in [menu-board](../topics/menu-board.md) (`0408f2f2`·`ee70bc2d`): 네이버 메뉴판 사진에서 읽은 메뉴를 등록 메뉴와 짝지어 **`origin: 'registered' | 'menu-board'`**(등록 메뉴와 같은 메뉴 / 사진에만 있는 메뉴)와 가격 대조 **`same | different | range | unknown`** 을 남긴다(`menu-board.naver-match.ts`). 공개 메뉴 탭(`MenuBoardSection`)은 등록 메뉴 아래 '메뉴판 사진' 섹션에 **사진에만 있는 메뉴**를 따로 보이며 "AI 가 읽은 결과라 실제와 다를 수 있으니 사진으로 확인" 안내와 사진 날짜를 붙이고, 등록 메뉴 카드에는 사진이 더 최신이고 가격이 다를 때만 "메뉴판 사진 14,000원 · 날짜" 한 줄을 단다. 읽기 결과에는 `promptVersion` 이 붙어 있어, 프롬프트 v2 가 들어오면 낮은 버전만 다음 크롤·읽기 스크립트에서 다시 읽는다([versioned-llm-prompts](versioned-llm-prompts.md)).
- **2026-10-05** in [parking](../topics/parking.md) (`007ac899`): 주차장 마스터가 세 원천(전국 표준데이터·서울 공영·KOTSA)을 합치면서 행마다 `ParkingSource = std | seoul | kotsa` 를 남기고 상세가 출처를 적는다. KOTSA 의 "대표 좌표"(이름 다른 3곳 이상이 한 점)는 주소 지오코딩으로 바꾸거나 빼서, 채운 좌표와 원래 좌표가 섞이지 않게 했다.

## What This Means

1. **채우기는 공짜가 아니라 계약 변경이다.** 빈칸을 메우는 순간 "이 값은 어디서 왔나" 라는 새 필드가 생긴다. 그 필드 없이 채우면 화면이 빌린 값을 원래 값처럼 말하고, 나중에 원천이 좋아져도 무엇을 다시 계산할지 모른다.
2. **꼬리표는 쓸 때 기록한다.** 같은 숫자 모양에서 출처를 역추론할 수 없다. 조립·추정 함수가 값을 반환할 때 꼬리표를 같이 반환하게 만든 곳(등산 `build` 의 `{ course, elevationFrom }`, 식단 추정의 `basis`)이 깔끔했다.
3. **꼬리표가 문구의 정본이다.** 웹과 앱이 같은 enum 으로 분기하면 두 화면의 안내가 어긋나지 않는다. 대기 출처 표기가 웹·앱에서 갈린 것([license-shaped-surfaces](license-shaped-surfaces.md))은 반대로 꼬리표 없이 문자열을 각자 쓴 결과다.
4. **저장 위치가 들쭉날쭉하다.** 열(`ParkingSource`·`nutritionBasis`)도 있고 JSON 안 필드(등산 `park.elevationFrom`·`reversed`)도 있다. JSON 안에 두면 마이그레이션은 없지만 SQL 로 "추정한 것만" 고르기 어렵다 — 다시 채우기를 SQL 로 해야 하는 꼬리표라면 열이 낫다.

## Sources

- [hiking](../topics/hiking.md)
- [meal](../topics/meal.md)
- [food](../topics/food.md)
- [menu-board](../topics/menu-board.md)
- [parking](../topics/parking.md)
- [api-contract](../topics/api-contract.md)
- [web](../topics/web.md)
- [mobile](../topics/mobile.md)
- [unknown-vs-zero](unknown-vs-zero.md)
- [versioned-llm-prompts](versioned-llm-prompts.md)
