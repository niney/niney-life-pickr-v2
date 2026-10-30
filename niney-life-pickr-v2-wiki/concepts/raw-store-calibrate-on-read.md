---
concept: 원측정은 저장하고 해석은 읽을 때 — 보정·판정을 공용 순수 함수로 미뤄 "다시 맞추기"를 재적재 없는 코드 배포로
last_compiled: 2026-10-31
topics_connected: [hiking, utils, shared, parking, meal, tour]
status: active
---

# 원측정은 저장하고 해석은 읽을 때 — 보정·판정을 공용 순수 함수로 미뤄 "다시 맞추기"를 재적재 없는 코드 배포로

## Pattern

적재·저장 단계에서 **무엇을 굳히고 무엇을 미루나**가 반복해서 갈렸다. 등산·주차는 "측정에 가까운 값"(경사별 보행 함수로 낸 이동 분, 원천 요금 규칙, 3일치 예보 칸)만 저장하고, 사람이 보는 값(예상 시간·난이도·하산 마감·1~3시간 예상 요금)은 **읽을 때** `@repo/utils` 순수 함수로 계산한다. 그래서 보정 상수를 바꾸면 **배포만으로** 모든 코스·주차장에 반영되고, 서버 응답과 웹·앱 화면이 같은 함수를 쓰니 숫자가 어긋나지 않는다.

반대편엔 의도적으로 굳힌 값이 있다. 식단은 항목마다 영양(열량·근거 `basis`)을 저장해, 1인분 규칙이나 추정 단계가 바뀌면 `backfill:meal-nutrition` 을 돌려야 한다 — 지난 기록이 카탈로그 변화에 따라 소리 없이 바뀌지 않게 하려는 선택이다. 그리고 한 도메인 안에서도 둘이 섞인다: 등산의 예상 시간은 읽을 때지만, 국립공원 코스의 방향·고도 출처(지형 고도·`reversed`)는 적재 때 굳어 **재적재가 필요하다**.

## Instances

- **2026-10-24** in [tour](../topics/tour.md) (`a382e01c`, 15차): 한국관광공사 소개 정보는 `TourKtoIntro` 에 **태그만 지운 원문**(이용 시간·쉬는 날·주차·요금)으로 저장하고, 매주 쉬는 요일(`parseKtoClosedDays`)과 한 줄 표시 문구(`shortenKtoText`, 240자)는 코스 프로필이 읽을 때(`loadTourPlaceInfos`) 낸다 — 받은 문구 203가지를 보며 "※ 뒤 덧붙임은 보지 않는다"·"철이 붙은 괄호는 통째로 읽지 않는다" 같은 규칙을 여러 번 고쳤는데, 고칠 때마다 재호출(일 1,000건 한도)이 들지 않았다. **맞추기도 같은 결**이다: 반경 검색 API 대신 카탈로그 4.5만 건을 통째로 받아 두고 장소 ↔ 콘텐츠 매칭(`pickKtoMatch`, 이름 점수 구간 × 거리)을 로컬에서 돌려, 기준을 고쳐 다시 맞추는 데 호출이 0 이다. 다만 맞춘 결과(`TourPlaceKto`)는 표로 굳어 기준을 바꾸면 `sync:tour-kto` 의 맞추기 단계를 다시 돌려야 한다(호출 없음).
- **2026-10-26** in [hiking](../topics/hiking.md) / [utils](../topics/utils.md) (9차 보강, 작업 트리): 서버는 적재 때 Tobler 보행 함수로 낸 **이동 분**(`moveMin`·`moveRevMin`)만 저장하고(`hiking-gpx.ts` 주석 "보정값을 바꿔도 다시 적재하지 않게 여기서는 이동 분만 낸다"), 예상 시간·난이도는 `estimateHikingMinutes`·`hikingCourseTimes`·`hikingDifficulty` 가 읽을 때 낸다(서버 코스 요약·추천과 웹·앱이 같은 함수). 국립공원 공식 소요시간으로 식을 1.12/360/600 → 1.35/180/1500 으로 다시 맞춘 것은 **상수 세 개 변경 + 테스트**였고 재적재가 없었다. 같은 라운드의 지형 고도·`reversed` 는 적재 때 굳는 값이라 재적재가 필요했는데, `status:hiking` 의 `stale` 은 열이 빈 코스만 세서 이것을 감지하지 못한다(운영 배포 노트로 대신 — [hiking](../topics/hiking.md) 의 Gotchas 절).
- **2026-10-25** in [hiking](../topics/hiking.md) / [shared](../topics/shared.md) / [utils](../topics/utils.md) (`00804516`): 코스 "오늘의 조건" API 는 오늘·내일·모레 3일치 원자료(시각별 기온·가장 높은 곳 추정 기온·강수·바람, 산불 등급 면적, 대기 등급, 일출·일몰)를 한 번 주고, 날짜·출발 시각에 따른 판단(해 지기 전 하산·주의할 점)은 화면이 `@repo/utils` `hikingConditions` 로 접는다 — 출발 시각을 바꿔도 다시 받지 않는다(shared 훅 10분 캐시).
- **2026-09-25** in [parking](../topics/parking.md) (`2ff2c31`): 주차장은 원천 요금 규칙(기본 시간·기본 요금·추가 단위·일 최대·1일권)을 저장하고, 상세의 1·2·3시간 예상 요금은 웹이 `estimateParkingFee(rule, minutes)` 로 계산한다. 다만 원천 이상치 정리(`sanitizeParkingFeeRule`, 10-10)는 **적재 때** 걸려, 그 규칙을 바꾸면 재적재가 필요하다 — 같은 도메인 안에서 "정제는 적재 때, 해석은 읽을 때" 로 나뉜다.
- **2026-10-02~23** in [meal](../topics/meal.md) (`9019cf5`·`92e79e9a`, 대조 사례): 식단 항목은 영양 스냅숏(열량·`nutritionBasis`)을 저장한다. 1인분 중량 보정(`typical_portion`)·원재료 1회 분량·이름 추정이 들어올 때마다 운영은 `backfill:meal-nutrition`(`--estimate`)을 돌려야 했다. 기록의 과거 값이 안정적이고 목록·달력 조회가 계산 없이 빠른 대신, 규칙 변경이 데이터 작업이 된다.

## What This Means

1. **값마다 "측정인가, 해석인가" 를 먼저 묻는다.** 측정(이동 분·요금 규칙·예보 칸)은 저장하고, 해석(보정 배율·난이도 경계·하산 판단·예상 요금)은 공용 순수 함수로 읽을 때 낸다. 해석을 저장하면 보정이 데이터 작업이 된다.
2. **해석 함수는 서버와 클라이언트가 같은 것을 쓴다.** `@repo/utils` 에 두면 서버 응답(추천 점수)과 화면(코스 카드·조건 카드)이 한 정의를 공유한다. 단, 클라이언트가 직접 계산하는 값(주차 예상 요금·등산 하산 판단)은 **앱 바이너리가 옛 함수를 들고 있을 수 있다** — 앱이 생기면 서버 계산 필드로 옮길지 따져야 한다(등산 예상 시간은 서버가 계산해 내려 줘 앱 버전과 무관하다).
3. **굳히는 값엔 재적재 신호가 따라야 한다.** 적재 때 굳는 부분(등산 지형 고도·방향, 주차 요금 정제, 식단 영양 스냅숏)은 규칙이 바뀌면 다시 돌려야 한다. 그 신호(status 의 stale·백필 명령)가 굳는 값 전부를 덮는지 확인한다 — 등산 9차 보강은 덮지 못했다.
4. **식단처럼 일부러 굳히는 것도 정당하다.** 기록은 "그때 본 값" 이 바뀌지 않아야 하고, 그 대가가 백필 명령이다. 선택을 적어 두는 것이 중요하다.
5. **(31차) 한도가 빡빡한 외부 원천일수록 원문을 들고 있는 값이 크다.** 관광정보는 개발계정 일 1,000건이라 해석 규칙을 고칠 때마다 다시 받는다면 며칠이 걸린다. 원문 저장 + 읽을 때 해석이면 규칙 수정이 배포 한 번이고, 해석이 틀렸을 때(읽지 못한 문구)도 원문을 그대로 보여 줄 수 있다 — [unknown-vs-zero](unknown-vs-zero.md) 의 "읽지 못함 ≠ 쉬는 날 없음" 과 짝을 이룬다.

## Sources

- [hiking](../topics/hiking.md)
- [utils](../topics/utils.md)
- [shared](../topics/shared.md)
- [parking](../topics/parking.md)
- [meal](../topics/meal.md)
- [tour](../topics/tour.md) — 31차 관광정보 원문 저장·읽을 때 쉬는 요일
- [apps/friendly/src/modules/tour/tour-kto-info.ts](../../apps/friendly/src/modules/tour/tour-kto-info.ts) · [tour-kto.service.ts](../../apps/friendly/src/modules/tour/tour-kto.service.ts) — 31차
- [golden-set-precision-gate](golden-set-precision-gate.md)
- [provenance-tagged-fill](provenance-tagged-fill.md)
