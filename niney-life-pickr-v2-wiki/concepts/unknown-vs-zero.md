---
concept: 모름과 없음을 계약에서 가른다 — null(관측 안 됨·범위 밖)·0(관측된 없음)·억제(말하지 않음)
last_compiled: 2026-10-31
topics_connected: [housing, parking, sea, tour, air-quality, api-contract, web, life-map, meal, meal-nutrition, mobile]
status: active
---

# 모름과 없음을 계약에서 가른다 — null(관측 안 됨·범위 밖)·0(관측된 없음)·억제(말하지 않음)

## Pattern

공공데이터를 붙이는 도메인이 늘면서 "숫자가 없다" 가 세 가지 다른 뜻을 갖게 됐다. **없음** — 관측했고 0 이다(반경 100m 안 침수 기록 0건). **모름** — 관측하지 않았거나 원천이 다루지 않는 범위다(침수흔적도는 서울만 있다, 요금 정보가 비어 있다, 아직 적재 전이다). **말하지 않음** — 알지만 표본이 작아 공개하지 않는다(여행자 5명 미만 칸). 셋을 한 값(0 이나 빈 배열)으로 뭉개면 화면은 "서울 밖 아파트는 전부 침수 안전", "요금 0원 = 무료", "이 시간대엔 여행자가 없다" 처럼 **틀린 문장**을 쓴다.

이 리포의 계약(`@repo/api-contract`)은 그 구분을 타입에 싣는다. 쓰는 인코딩은 네 가지다:

| 인코딩 | 예 | 읽는 쪽이 할 일 |
|---|---|---|
| 필드 전체 `null` | `HousingPoint.flood`·`HousingComplexDetail.flood` — 범위 밖(현재 서울 외)·좌표 없음·미적재면 `null`, 범위 안이면 0 이상 | `null` 이면 표시 자체를 생략("자료 범위 밖"), 0 이면 "기록 없음" |
| 값 `null` + 별도 의미 값 | 바다 지수 `level` 1~5(매우나쁨~매우좋음) · **0 = 체험불가** · `null` = 모름(원문 라벨은 `label`) / 주차 요금 `null` = 정보 없음, 무료 여부 Y/N/`null`(모름 — 현장 확인) | 0 과 `null` 을 다른 색·문구로 |
| 0 + 형제 필드 `null` | 집값 생활 인프라 — 상가 미적재면 `counts` 가 전부 0 이고 `baseDate` 가 `null` | **counts 만 읽으면 속는다** — `baseDate` 를 먼저 봐야 0 이 진짜 0 인지 안다 |
| 플래그·enum | 여행로그 인사이트 `insufficient`(필터 뒤 여행 20건 미만) · 셀 n<5 는 `null`(억제) · 국세청 사업자 상태 `'unknown'`(미등록 번호) | 억제는 "없음" 이 아니라 "비공개" 로 표시 |

적재 쪽에도 같은 구분이 있다 — 집값 실거래 파티션 교체(`replaceHousingTradePartition`)는 받은 결과에 없는 유형도 요청한 유형이면 **0건으로 장부에 남긴다**(주석: *"받았는데 없음" 과 "안 받음" 구분*). 장부의 0 행이 "이 달은 확인했다" 는 증거라, 재시도 계획이 "안 받은 달" 만 고를 수 있다.

## Instances

- **2026-10-25** in [meal](../topics/meal.md) / [mobile](../topics/mobile.md) (`6ae0a4c5`): 앱 기록 목록의 고정 날짜 머리글 '3끼 · 2,148kcal' 은 **하한 표시 '+'** 라는 네 번째 인코딩을 들였다 — 열량을 보이는 기록(`mealNutritionLabel` 기준)만 더하고, 열량이 빠진 끼니가 있으면 `kcal+`, 다음 페이지에 같은 날이 더 있을 수 있는 마지막 날은 끼니 수에 `+`. 0 으로 채우지도 않고(열량 있는 기록이 하나도 없으면 열량 칸을 아예 안 씀) 합계를 숨기지도 않는다. 다만 하한이 새는 길이 둘 남았다 — ① 마지막 날의 '+' 는 끼니 수에만 붙어, 불러온 기록이 전부 열량을 가지면 다음 페이지 몫이 빠진 열량이 하한 표시 없이 나가고([app/meal/index.tsx](../../apps/mobile/app/meal/index.tsx) 479~493행) ② '+' 가 끼니 단위라 카드가 '일부 반영'인 끼니(항목 넷 중 셋만 값)는 모르는 항목을 뺀 채 '+' 없이 더해진다. 서버 달력 `days[].kcal`(값 있는 모든 항목 합)과도 규칙이 달라 같은 날 숫자가 어긋날 수 있다(코드 미수정, [meal](../topics/meal.md) Gotchas).
- **2026-10-24** in [tour](../topics/tour.md) (`a382e01c`, 15차): 관광정보 쉬는 날 문구를 읽는 `parseKtoClosedDays` 가 세 값을 낸다 — `[]`(연중무휴 등 매주 쉬는 요일 없음) · `[요일…]` · `null`(읽지 못함: 시설마다 따로 적은 문구·격주·월 n회·철이 붙은 괄호). `null` 은 "쉬는 날 없음" 으로 다뤄지지 않고 일정에서 빼는 데만 안 쓰이며 **원문은 그대로 보여 준다**(받은 882건 중 요일 읽음 153 · 없음 647 · 읽지 않음 82). 공개 계약 `TourPlanPlaceInfo` 는 네 문구 각각 `null`(없는 항목)이고 넷 다 없으면 `info` 자체가 `null` — 관광정보와 못 맞춘 장소(맞추기 대상 2,649곳 중 903곳)도 `null` 이라 "정보 없음" 과 "운영 정보상 쉬는 날 없음" 이 응답에서 갈린다. 해석을 원문 저장 위에 얹은 덕분이다([raw-store-calibrate-on-read](raw-store-calibrate-on-read.md)).
- **2026-10-04** in [meal](../topics/meal.md) / [meal-nutrition](../topics/meal-nutrition.md) / [api-contract](../topics/api-contract.md) (`186d2bc`·`3d067a0`): 식단 도메인으로 번졌다. 달력 `days[].kcal` 은 kcal 이 있는 항목만 더하고 하나도 없으면 `null`(0 으로 채우지 않음). 영양 점검은 영양소 상태에 `unknown` 을 두고(`MealNutrientStatus = low|borderline|ok|high|unknown`), 카탈로그에 그 영양소 값이 없으면 `notMeasured` 로 따로 보여 "부족"과 "모름"을 가른다. 기록이 적으면 판정 자체를 보류(`status: insufficient`) — 세 번째 종류인 **말하지 않음**이다. 음료·주류는 "0 으로 안다", 정보 없는 과일·채소는 "모른다"로 구분한다.
- **2026-09-24** in [housing](../topics/housing.md) / [life-map](../topics/life-map.md) / [api-contract](../topics/api-contract.md) (`ad48f96`): 침수 흔적 — 계약 주석이 세 경우를 적는다(범위 밖·좌표 없음·미적재 → `null`). 웹은 `null` 이면 상세의 '침수 흔적' 섹션과 지도 물방울을 아예 그리지 않는다. **경계를 어디서 얻느냐가 약점으로 드러났다** — 커버리지 시도는 메타데이터가 아니라 **적재된 행의 시군구 코드 앞 두 자리**(`HousingFloodIndex.sidos`)에서 뽑는다. 로컬 적재에 잘못된 `ADM_CD` 4행(`10350` 3행·`12345` 1행)이 검증 없이 들어가 `sidos = {10, 11, 12}` 가 됐다(housing 토픽 Gotchas). 지금은 무해하지만, 오류 코드가 실제 시도 코드와 겹쳤다면 그 시도 전체가 "모름" 이 아니라 "0건(안전)" 으로 표시됐을 것이다. 적재 여부를 알려 주는 API 도 없어 범례는 적재와 무관하게 늘 보인다.
- **2026-09-24** in [sea](../topics/sea.md) (`4a2bff1`): 지수 단계가 세 겹 — 1~5 정상 단계, **0 = 체험불가**(원천이 명시한 단계), `null` = 모름(원문 라벨은 `label` 에 그대로). D+3 이후 '일'(하루) 예보는 오전/오후 구분이 없어 `period` 가 `null` — "오후 없음" 이 아니라 "하루 단위라 구분 없음" 이다.
- **2026-09-25** in [parking](../topics/parking.md) (`2ff2c31`): 요금 필드 `null` = 정보 없음(무료가 아니다 — 무료는 별도 Y/N), 무료 여부 `null` = 모름(현장 확인). 서울 노상 주차는 구획마다 한 행이라, 여러 행이면 행 수가 면수지만 한 행뿐이면 **면수를 모른다**(1 이 아니다). 실시간 값의 `updatedAt` 은 원천이 밝힌 갱신 시각(밝히지 않으면 `null`), `fetchedAt` 은 폴링 시각으로 둘을 따로 둔다.
- **2026-09-13** in [tour](../topics/tour.md) (`99991da`): **세 번째 종류 — 억제.** 공개 집계는 여행자 5명 미만 칸을 `null` 로, 필터 뒤 여행 20건 미만이면 `insufficient: true` 로 낸다. 값이 없어서가 아니라 이용 조건·재식별 위험 때문에 말하지 않는 것이라, 화면은 "표본 부족" 으로 쓰고 0 으로 그리지 않는다([quantile-graded-overlay](quantile-graded-overlay.md) 의 소셀 억제와 같은 규칙).
- **2026-09-12** in [housing](../topics/housing.md) / [life-map](../topics/life-map.md) (`bc39a79`): 생활 인프라는 **0 + 형제 `null`** 인코딩 — 상가(`LifeStore`) 미적재면 업소 수가 전부 0 이고 `baseDate` 만 `null` 이다(단지 좌표가 없으면 `infra` 자체가 `null`). 필드 하나(`counts`)만 보는 소비자는 "편의점 0곳" 을 사실로 읽는다 — 네 인코딩 중 가장 오독하기 쉽다.
- **2026-09-02** in [housing](../topics/housing.md) (`254fb76`): 적재 장부의 0 — 실거래 파티션(시군구 × 계약년월 × 유형)을 교체할 때 결과가 없는 유형도 0건 행으로 `HousingSync` 장부에 남긴다. "받았는데 없음" 과 "안 받음" 이 갈려야 일일 한도로 끊긴 적재를 이어서 계획할 수 있다.
- **2026-08-21** in [air-quality](../topics/air-quality.md) (에어코리아 1차): 측정값 결측을 등급 0(회색 `#9ca3af` 마커)으로 따로 칠하고, 통합지수가 결측이면 PM2.5 → PM10 등급으로 폴백한다 — "나쁨 아님" 과 "측정 안 됨" 을 색으로 가른 첫 사례.

## What This Means

1. **"숫자 없음" 은 세 가지다: 모름·없음·말하지 않음.** 새 공공데이터 필드를 계약에 넣을 때 첫 질문은 타입이 아니라 "이 값이 비는 경우가 몇 가지인가" 다. 두 가지 이상이면 `null` 과 0(또는 플래그)을 나눠야 하고, 그 주석을 계약에 적는다(침수·인프라·바다·주차 모두 계약 주석이 규칙의 정본이다).
2. **경계는 메타데이터에서 와야 한다.** "어디까지가 모름인가(커버리지)" 를 적재된 데이터에서 역추론하면, 불량 행 하나가 경계를 옮긴다(침수 커버리지 시도). 원천의 공식 범위(서울시 데이터 = 서울)나 적재 이력(`LifeMasterSync` 의 범위 필드)을 쓰는 편이 안전하다.
3. **인코딩이 약할수록 소비자가 틀린다.** 필드 전체 `null` 은 타입이 강제하지만(`null` 체크 없이는 못 씀), "0 + 형제 `null`" 은 타입이 아무것도 막지 않는다. 새로 설계한다면 인프라도 `counts: null` 로 가는 편이 오독이 적다.
4. **억제는 개인정보·이용 조건의 표현이다.** 여행로그처럼 표본 하한이 있는 집계는 "없음" 과 구분되는 별도 상태를 가져야 하고, 그 상태가 응답에 식별자 없이 드러나야 한다(`insufficient`·셀 `null`). 0 으로 채우면 하한을 둔 의미가 사라진다.

5. **이상치는 모름으로 강등한다** (2026-10, 주차). 원천 값이 형식은 맞지만 상식 밖일 때(기본 0분 유료, 시간당 5만 원) 고칠 근거가 없으면 `null` 로 내린다 — 틀린 숫자는 "없음" 보다 해롭다. 강등은 원천 공통 함수 하나에서, 몇 행을 내렸는지 적재 리포트에 카운터로 남겨 다음 원천 갱신 때 비교할 수 있게 한다([open-data-master-load](open-data-master-load.md)).

6. **(31차) 합계가 일부만 셌다면 하한임을 밝힌다.** 화면 합계(하루 열량)처럼 모름이 섞인 값을 더할 때는 0 으로 채우거나 합계를 숨기는 대신 '+' 로 "이상" 을 밝힐 수 있다. 다만 하한이 되는 원인이 둘 이상(열량 빠진 끼니·아직 안 불러온 페이지)이면 표시 조건이 원인마다 맞물려야 한다 — 앱 식단은 한 원인에만 열량 '+' 를 걸었다. 그리고 해석기가 "읽지 못함" 을 따로 낼 수 있어야 한다 — 관광정보 쉬는 날처럼 못 읽은 문구를 `[]` 로 떨어뜨리면 쉬는 곳이 일정에 그대로 들어간다.

관련: [open-data-master-load](open-data-master-load.md) — "미적재" 가 모름의 흔한 원인이고, 이력 행이 그 판정의 진실이다. [quantile-graded-overlay](quantile-graded-overlay.md) — 소셀 억제. [external-api-proxy-fixture](external-api-proxy-fixture.md) — 원천이 비운 필드를 어댑터가 0 으로 채우지 않는 것이 이 구분의 입력단이다.

## Sources

- [housing](../topics/housing.md)
- [life-map](../topics/life-map.md)
- [api-contract](../topics/api-contract.md)
- [sea](../topics/sea.md)
- [parking](../topics/parking.md)
- [tour](../topics/tour.md)
- [air-quality](../topics/air-quality.md)
- [web](../topics/web.md)
- [packages/api-contract/src/schemas/housing.ts](../../packages/api-contract/src/schemas/housing.ts) — `flood`·`HousingInfra.baseDate` 주석
- [packages/api-contract/src/schemas/sea.ts](../../packages/api-contract/src/schemas/sea.ts) — `level` 0/`null`
- [packages/api-contract/src/schemas/parking.ts](../../packages/api-contract/src/schemas/parking.ts) — 요금·무료 여부 `null`
- [packages/api-contract/src/schemas/tour.ts](../../packages/api-contract/src/schemas/tour.ts) — `insufficient`·`'unknown'` · 31차 `TourPlanPlaceInfo`(항목별 `null`, 넷 다 없으면 `info: null`)
- [apps/friendly/src/modules/tour/tour-kto-info.ts](../../apps/friendly/src/modules/tour/tour-kto-info.ts) — 31차 `parseKtoClosedDays`(`[]`·요일·`null`)
- [apps/mobile/app/meal/index.tsx](../../apps/mobile/app/meal/index.tsx) — 31차 하루 머리글 '+'
- [meal](../topics/meal.md) · [mobile](../topics/mobile.md)
- [apps/friendly/src/modules/housing/housing-flood.service.ts](../../apps/friendly/src/modules/housing/housing-flood.service.ts) — 커버리지 `sidos`
- [apps/friendly/src/modules/housing/housing-trade-master.service.ts](../../apps/friendly/src/modules/housing/housing-trade-master.service.ts) — `replaceHousingTradePartition` 0건 장부
- [open-data-master-load](open-data-master-load.md)
- [quantile-graded-overlay](quantile-graded-overlay.md)
- [external-api-proxy-fixture](external-api-proxy-fixture.md)
