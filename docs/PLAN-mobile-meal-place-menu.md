# 앱 작업 지시서 — 식당에서 먹은 기록(그 집 메뉴에서 넣기 · 근처 식당 · 인식 결과를 메뉴에 잇기)

2026-11-13 웹에 들어간 "식당에서 먹은 기록" 기능을 **앱(apps/mobile)** 에 옮기는 작업의 지시서다. 서버·계약·공유 스토어는
웹 작업 때 끝났다 — 앱은 화면과, 위치·사진 EXIF 처럼 플랫폼이 다른 부분만 만들면 된다.
배경·결정·실측 수치는 [PLAN-meal.md](PLAN-meal.md) 진행 기록 `2026-11-13` 항목이 원본이다.

- 대상: `apps/mobile` (Expo 54 · RN 0.81). 웹은 손대지 않는다(아래 1번의 '공용으로 올리기'에서 import 경로만 바뀐다).
- 서버 변경 없음. 마이그레이션 `20261113100000_meal_item_menu` 가 적용된 API 가 떠 있어야 한다.
- 새 네이티브 의존성 없음(`expo-location`·`expo-image-picker` 는 이미 있다). **`pnpm add` 를 하지 않는다.**

## 0. 이미 정해진 것 — 다시 정하지 않는다

사용자 결정(2026-11-13):

1. 위치로 근처 식당을 **제안**하되 직접 고를 수도 있어야 한다. 자동으로 식당을 정하지 않는다.
2. 항목 이름(`name`)은 통계가 묶는 **표준명 그대로**, 그 집 메뉴명·가격은 별도 칸(`menuName`·`menuPrice`).
   화면은 메뉴명을 앞세운다.

실측으로 정한 것:

- 메뉴 → 표준명은 서버가 "같은 음식"으로 볼 수 있는 매칭만 쓴다(운영 메뉴의 35%). 나머지는 메뉴명 그대로 온다 — 앱이
  이름을 더 바꾸려 하지 않는다.
- 사진 인식 프롬프트 문구는 바꾸지 않는다. 식당을 알고 인식하면 서버가 인식한 이름을 그 집 메뉴와 대조해
  `RecognizedDish.menuName` 으로 준다.
- 식당 메뉴 힌트는 **틀릴 수 있다**(공개 메뉴 사진 14장: 정답 메뉴 그대로 8장, 다른 메뉴로 잘못 고른 것 3장). 그래서
  이은 결과는 늘 눈에 보이게 하고(항목 줄의 '이 집 메뉴' 표시) "확인해 주세요"를 뺀 문구를 쓰지 않는다.

## 1. 이미 있는 것 — 앱이 그대로 쓴다

| 무엇 | 어디 | 쓰임 |
|---|---|---|
| `GET /api/v1/meals/place-menus?placeId=` | `Routes.Meal.placeMenus` · `mealApi.placeMenus` | 그 집 메뉴 → 넣을 음식(표준명·분류·1인분 열량). 식당이 없으면 404 |
| `useMealPlaceMenus(placeId)` | `@repo/shared` `hooks/useMeal.ts` | 화면용 조회(식당 없으면 꺼짐, 10분 캐시, 재시도 없음) |
| `mealPlaceMenusQuery(placeId)` | 같은 파일 | 이벤트 안에서 `queryClient.fetchQuery(...)` 로 같은 캐시를 쓴다 |
| `setPlace(place \| null)` | `@repo/shared` `stores/mealDraftStore.ts` | 식당 정하기·바꾸기·지우기. 식당이 바뀌면 앞 식당의 메뉴 연결을 풀고, 식사 방식이 비어 있으면 외식으로. `placeId: null` 로 이름만 줄 수 있다 |
| `toggleMenuItem(menu)` | 같은 파일 | 메뉴를 누르면 넣고 다시 누르면 뺀다. 같은 음식 줄이 있으면 새 줄 대신 그 줄에 잇는다. 세트는 구성요소마다 한 줄, 가격은 첫 줄에만 |
| `linkRecognizedToMenus(menus)` | 같은 파일 | 손대지 않은 인식 줄을 메뉴에 잇는다 → `{ linked, unmatched }` |
| `updateItem` | 같은 파일 | 이름을 바꾸면 메뉴 연결이 **저절로 풀린다**(메뉴를 함께 바꾸려면 patch 에 `menuName` 을 싣는다) |
| `MealDraftItem.menuName`·`menuPrice` | 같은 파일 | draft ↔ 기록 ↔ 저장 입력 매핑에 이미 들어 있다(`mealDraftInitFromEntry`·`mealDraftInitForRepeat`·`draftItemToInput`) |
| `mealItemLabels(items)` · `formatMenuPrice(n)` | `@repo/utils` `mealSlot.ts` | 화면에서 부르는 이름(메뉴명 우선, 풀어 넣은 세트는 구성요소 이름) · "9,000원" |
| `haversineM` · `formatDistanceM` | `@repo/utils` `geo.ts` · `format.ts` | 거리 계산·표기(`formatDistanceM` 은 **정수 m** 를 받는다 — 반올림해서 넘긴다) |
| `MealPlaceMenuType` 등 | `@repo/api-contract` `schemas/meal.ts` | `{ menuName, price, recommend, foods[] }`, `foods[]` 는 `{ name, foodId, dishType, mainIngredient, cuisine, isMain, kcal }` |

웹 참고 구현(동작·문구의 기준): `apps/web/src/routes/meal/` 의 `MealPlaceSection.tsx`(식당 고르기·근처 칩·잇기 알림),
`MealPlaceMenus.tsx`(메뉴 목록), `mealPlaceMenu.ts`(한 줄 표시 값), `mealPlaceLink.ts`(잇기), `useMealNearbyPlaces.ts`(근처 후보),
`MealHereButton.tsx`(식당 상세 입구), `MealItemInputRow.tsx`(항목 줄의 메뉴 표시), `MealDetailPage.tsx`(상세 표시).
동작을 고정한 테스트: `MealEntryFormPage.test.tsx` 의 '식당…'·'근처 식당'·'사진에서 찾은 음식을 식당 메뉴에 잇기' 묶음,
`packages/shared/src/stores/mealDraftStore.test.ts` 의 'meal draft 식당·식당 메뉴' 묶음.

## 2. 앱의 지금 상태

- 입력 화면 `src/components/meal/MealEntryEditor.tsx` — 순서가 사진 → 먹은 음식 → 언제·어떻게. **식당 선택은 맨 아래**
  (`890~929`줄, '식당 / 장소 (선택)')라 사진을 넣으면 식당 없이 먼저 인식된다.
- 식당 선택은 정산의 `src/components/settlement/RestaurantPickerSheet.tsx` 를 빌려 쓴다(`1002~1010`줄). 고르면
  `setField('placeId'…)`·`setField('placeName'…)` 를 직접 부른다 — **`setPlace` 를 쓰지 않아** 식당을 바꿔도 메뉴 연결이
  풀리지 않는다. 지우기(`914~923`줄)도 같다. 목록에 없는 식당의 이름만 적는 길은 없다.
- 인식은 `recognizeUploaded`(`483~524`줄)가 `placeId` 를 실어 보낸다. 그 뒤 메뉴에 잇는 단계는 없다.
  `925~929`줄의 "다시 인식하면 이 식당의 등록 메뉴를 힌트로 사용해요." 안내가 그 빈자리다.
- 앨범에서 고를 때 `exif: true` 가 없다(`191~199`줄, 카메라는 `234~238`줄에 있다). `firstExifTime`(`1022`줄)은
  `asset.exif` 를 읽으므로 **앨범 사진은 촬영 시각이 안 읽힐 수 있다**(코드로 본 추정 — 기기에서 확인할 것).
- 항목 줄 `MealItemRow.tsx`, 기록 상세 `app/meal/[id].tsx:320`, 목록 카드 `MealEntryCard.tsx:64·93·97` 은 `name` 만
  그린다(메뉴명·가격을 모른다).
- 맛집 상세 메뉴 탭 `src/components/restaurantDetail/MenuTab.tsx:28~55` 에 '이 메뉴로 정산하기'가 있다. 식단으로 가는 입구는 없다.
- 위치 훅 `src/hooks/useUserLocationNative.ts` 는 저정밀(`Accuracy.Low`)·5초 제한이고 오차를 돌려주지 않는다 — 동네 단위
  용도라 가게를 가리는 데는 못 쓴다.
- 앱에는 테스트 러너가 없다(`typecheck`·`lint` 만).

## 3. 작업

순서대로 하고, 각 단계가 끝나면 `pnpm --filter mobile typecheck` 를 돌린다.

### 3.1 공용으로 올리기 (웹 → 패키지)

웹에만 있는 순수 로직을 패키지로 옮겨 앱이 같은 규칙을 쓰게 한다. 옮길 때 웹의 import 만 바꾸고 동작은 그대로 둔다.

| 지금(웹) | 옮길 곳 | 내용 |
|---|---|---|
| `mealPlaceMenu.ts` 의 `placeMenuKcal`·`placeMenuSub`·`placeMenuMatches` | `@repo/shared`(`mealItemNameKey` 를 쓴다) | 메뉴 한 줄의 열량·아랫줄·찾기 |
| `mealPlaceLink.ts` 의 `linkRecognizedToPlaceMenus(queryClient)` | `@repo/shared` | 식당 메뉴를 받아 인식 줄에 잇기 |
| `useMealNearbyPlaces.ts` 의 반경·조회 범위·거리 걸러내기 | `@repo/utils` 순수 함수 | 예: `nearbyRadiusM(accuracyM)` · `bboxAround(lat, lng, radiusM)` · `pickNearbyPlaces(origin, items, radiusM)` |

- `packages/*` 에는 import 만으로 무언가를 등록하는 모듈을 두지 않는다(`sideEffects: false`).
- 상수는 그대로 옮긴다: 기본 반경 150m, 최대 500m, 오차 400m 초과면 후보 없음, 후보 최대 5곳, 조회 범위 여유 1.2배.
- 웹 테스트가 그대로 통과해야 한다: `pnpm --filter web test`·`pnpm --filter @repo/shared test`·`pnpm --filter @repo/utils test`.
  옮긴 순수 함수에는 패키지 쪽에 테스트를 붙인다(앱에는 러너가 없다).

### 3.2 식당 고르기를 맨 위로

`MealEntryEditor.tsx` 에서 '식당 / 장소' 줄을 **사진 위의 자체 `MealSection`** '어디서 먹었나요'로 옮긴다.

- 식당이 없을 때: [식당 찾기] 버튼(시트 열기) + 근처 식당 줄(3.6).
- 식당이 있을 때: 이름 + [바꾸기] [지우기].
- 고르기·지우기는 모두 **`draft.setPlace(...)`** 로 바꾼다(`setField('placeId'…)` 직접 호출을 없앤다). 식사 방식을
  외식으로 두는 것도 `setPlace` 가 한다 — `1008`줄의 수동 처리를 지운다.
- 시트는 식단 전용으로 새로 만든다: `src/components/meal/MealPlaceSheet.tsx`. 정산의 `RestaurantPickerSheet` 는 건드리지
  않는다(정산 차수 선택과 동작이 갈린다).
  - 검색: `useRestaurantsPublic({ q, limit: 8 }, { enabled: open && q !== '' })`, 300ms 디바운스(기존 시트와 같게).
  - 결과 줄: 이름 / 분류 · 도로명주소.
  - **이름만 적기**: 검색어가 있으면 목록 맨 아래에 `‘○○’ 이름만 적기` 줄. 누르면 `setPlace({ placeId: null, placeName })`.
    키보드의 '완료/검색'으로는 굳지 않는다 — 그 줄을 눌러야 한다(찾으려고 누른 것이 등록 안 된 이름으로 남지 않게).
    결과가 없으면 아랫줄을 "등록된 식당에서 찾지 못했어요 — 이름만 남겨요"로.
  - 이름 길이 한도 120자(`CreateMealEntryInput.placeName`).

### 3.3 그 집 메뉴에서 넣기

'먹은 음식' 섹션에서 빠른 추가 칩 **위**에 그 집 메뉴를 둔다. `placeId` 가 있고 메뉴가 1개 이상일 때만 그린다
(이름만 적은 식당·메뉴 없는 식당·404 는 아무것도 그리지 않는다).

- 새 컴포넌트 `src/components/meal/MealPlaceMenus.tsx`. 데이터는 `useMealPlaceMenus(draft.placeId)`.
- 한 줄: 메뉴명(굵게) / 아랫줄 `placeMenuSub(menu)`(가격 · 대표 · "김치찌개로 기록") / 오른쪽 `placeMenuKcal(menu)`kcal /
  넣었으면 ✓ 아니면 +. 눌림 상태는 `items.some((it) => it.menuName === menu.menuName)`.
- 누르면 `draft.toggleMenuItem(menu)`. 다른 처리를 덧붙이지 않는다(빈 줄 채우기·같은 음식 줄에 잇기·세트 풀기는 스토어가 한다).
- **목록이 길다**(식당당 중앙값 13개, 100개 넘는 집도 있다). 입력 화면은 `ScrollView` 라 안에 세로 목록을 중첩하지 않는다:
  입력 화면에는 앞의 6줄만 그리고 "메뉴 N개 모두 보기"를 눌러 시트(`FlatList` + 찾기 칸, `placeMenuMatches`)에서 고르게 한다.
  시트에서는 여러 개를 이어서 누를 수 있고 [완료]로 닫는다.
- 목록 아래 한 줄: "누르면 먹은 음식에 들어가요. 열량은 1인분 기준이라, 나눠 먹었으면 양을 맞춰 주세요."

### 3.4 항목 줄·상세·목록에 메뉴 표시

- `MealItemRow.tsx` — 이름 입력 아래에 `item.menuName` 이 있으면 한 줄: `[이 집 메뉴] 묵은지 김치찌개 · 9,000원`
  (가격은 `item.menuPrice != null` 일 때만, `formatMenuPrice`). 이름을 고치면 스토어가 연결을 풀어 이 줄이 사라진다 —
  따로 지우는 코드를 넣지 않는다.
- `app/meal/[id].tsx:320` — 이름 자리에 `mealItemLabels(data.items)[index]`. 아랫줄(`meta`) 앞에: 메뉴명으로 부른 줄이면
  기록 이름(표준명, 메뉴명과 다를 때만), 구성요소 이름으로 부른 줄(풀어 넣은 세트)이면 메뉴명, 그리고 가격.
  웹 `MealDetailPage.tsx` 의 `FoodRow` 와 같은 규칙이다.
- `MealEntryCard.tsx:64·93·97` — `titleItems`·`subItems` 의 이름을 `mealItemLabels(entry.items)` 로. 접근성 라벨도 같이.
- 새 칸이 없는 응답(앱이 API 보다 먼저 나간 사이)에서 터지지 않게 `!= null`·`?? null` 로 느슨하게 본다
  (웹은 `!== null` 로 썼다가 예전 응답 모양에서 `toLocaleString` 이 터졌다).

### 3.5 맛집 상세 입구

`MenuTab.tsx` 의 정산 CTA 아래에 '여기서 먹었어요' CTA 를 둔다(보조 버튼 — 정산보다 약하게).

```ts
// 로그인 전이면 로그인으로(정산 CTA 와 같다).
const store = useMealDraftStore.getState();
if (store.entryId !== null || store.eatenDate === '') {
  const now = new Date();
  store.start({ eatenAt: now.toISOString(), eatenDate: toLocalDateKey(now), slot: guessMealSlot(now) });
}
useMealDraftStore.getState().setPlace({ placeId: detail.placeId, placeName: detail.name });
router.push('/meal/new' as never);
```

쓰다 둔 새 기록이 있으면 그 위에 식당만 얹는다(추천의 '이거 먹었어요'와 같은 규칙). 입력 화면은 draft 가 이미 열려 있으면
새로 열지 않는다(`MealEntryEditor.tsx:161~173`).

### 3.6 근처 식당

새 훅 `src/hooks/useMealNearbyPlacesNative.ts`(웹 `useMealNearbyPlaces.ts` 의 앱 판). 계산은 3.1 에서 옮긴 순수 함수를 쓴다.

- 측위는 `expo-location` 으로 직접 한다(`useUserLocationNative` 는 저정밀이라 쓰지 않는다):
  `getCurrentPositionAsync({ accuracy: Location.Accuracy.High })` 를 10초 제한과 경주시키고, `pos.coords.accuracy` 를 오차로 쓴다.
- **권한 규칙**
  - [근처 식당]을 눌렀을 때만 `requestForegroundPermissionsAsync()` 를 부른다. 화면을 열었다고 권한 창을 띄우지 않는다.
  - 열자마자 찾아보는 것은 세 가지가 모두 맞을 때만: `getForegroundPermissionsAsync().granted` 가 이미 참 / 새 기록이고
    식당이 없다 / 먹은 시각이 지금에서 2시간 안쪽. 지난 끼니를 적거나 고칠 때는 찾지 않는다.
  - `canAskAgain === false` 로 거부된 상태면 안내와 함께 [설정 열기](`Linking.openSettings()` — `MyLocationCard.tsx:63` 과 같은 방식).
  - 묻지 않고 해 본 측위가 실패하면 아무것도 알리지 않는다(누른 적 없는 실패를 알리지 않는다).
- 후보: 반경 안의 등록 식당을 가까운 순 최대 5곳, 칩 `미스터유 22m`. 누르면 `setPlace`. **자동으로 정하지 않는다.**
- 오차가 400m 를 넘으면 후보를 내지 않고 알린다. 조회는 새 API 없이 `useRestaurantsPublic({ bbox, limit: 60 })`.
- 좌표는 조회에만 쓰고 저장하지 않는다(draft·서버 어디에도).
- 권한 문구는 `app.config.ts` 의 `locationWhenInUsePermission`("주변 식당을 보여주기 위해 위치를 사용합니다.") 그대로 맞는다 —
  바꾸지 않는다(바꾸면 네이티브 재빌드가 필요하다).
- **사진에 찍은 곳**(덤 — 안 돼도 [근처 식당]이 있다):
  - 앨범 선택에 `exif: true` 를 더한다(`191~199`줄). 촬영 시각도 이때부터 앨범 사진에서 읽힌다.
  - `asset.exif` 에서 위도·경도를 읽는 `firstExifLocation(assets)` 를 `firstExifTime` 옆에 둔다. 키 모양이 플랫폼마다 다르다고
    알려져 있다(iOS 는 `{GPS}` 아래 `Latitude`/`LatitudeRef`…, Android 는 평면 `GPSLatitude`/`GPSLatitudeRef`…) — **확인하지
    않은 내용이니** 먼저 기기에서 `asset.exif` 를 찍어 보고 정한다. (0, 0)·범위 밖 값은 버린다.
  - 사진 위치가 있으면 지금 위치를 묻지 않고 그 근처를 내놓고 [근처 식당] 단추를 치운다. 사진을 다 빼면 그 위치도 버린다.
  - 한계: iOS 는 카메라로 바로 찍은 사진의 EXIF 에 GPS 가 없고, Android 는 `ACCESS_MEDIA_LOCATION` 권한이 없으면 앨범 사진의
    위치를 가린다(expo-image-picker 문서·알려진 동작 — 미확인). 권한을 더하려면 네이티브 재빌드가 필요하니 **이번에는 더하지
    않는다**(아래 6번 열린 질문).

### 3.7 사진 인식 결과를 그 집 메뉴에 잇기

식당을 고른 직후와 인식이 끝난 직후 — 어느 쪽이 먼저든 — `linkRecognizedToPlaceMenus(queryClient)`(3.1 에서 옮긴 것)를 부른다.

- `recognizeUploaded`(`483~524`줄): `applyRecognition` 뒤에 부르고, 결과를 알림에 싣는다.
  `N개 음식을 찾았어요. M개는 ○○ 메뉴에 이었어요. 확인해 주세요.`(서버 경고가 있으면 경고가 먼저 — 지금과 같다.)
  잇는 동안 draft 가 바뀌었으면(`isMealDraftIdentityCurrent`) 알림을 쓰지 않는다.
- 식당을 고른 직후(시트·근처 칩 모두): 부르고, `linked > 0` 이면 식당 줄 아래에 "사진에서 찾은 음식 M개를 이 집 메뉴에
  이었어요.", `linked === 0 && unmatched > 0` 이고 사진이 있으면 "사진에서 찾은 음식이 이 집 메뉴와 맞지 않아요.
  [이 집 메뉴로 다시 인식]" — 누르면 기존 `runRecognize(undefined, 'replace-recognized')`. **이때만 인식 한도를 쓴다** —
  식당을 골랐다고 자동으로 다시 인식하지 않는다.
- `925~929`줄의 "다시 인식하면 이 식당의 등록 메뉴를 힌트로 사용해요." 안내는 지운다(위 알림이 대신한다).

## 4. 하지 말 것 · 걸리기 쉬운 곳

- 식당·메뉴 상태를 `setField` 로 직접 바꾸지 않는다 — `setPlace`·`toggleMenuItem`·`updateItem` 만 쓴다.
- 앱에서 메뉴명을 표준명으로 바꾸는 규칙을 새로 만들지 않는다(서버가 준 `foods[].name` 이 답이다).
- 인식 프롬프트·서버 코드는 건드리지 않는다. 문구를 바꾸려면 등록 식당에서 찍은 실제 사진으로 먼저 잰다.
- `formatDistanceM` 에 소수를 넘기지 않는다("44.47797065771984m" 가 그대로 찍힌다).
- 수정 저장은 항목 전량 교체다 — draft 항목에 `menuName`·`menuPrice` 가 실려 있어야 저장 뒤에도 남는다(공유 매핑이 이미
  한다. 앱에서 항목을 새로 만드는 코드가 있으면 그 두 값을 빼먹지 않는지 본다 — `MealEntryEditor.tsx:78` 의 `newItem` 은 빈 줄이라 괜찮다).
- 개발 서버가 떠 있는 채로 `pnpm install`·`pnpm add` 를 하지 않는다(`node_modules` 가 깨진다 — [PLAN-mobile-meal.md](PLAN-mobile-meal.md) 0번).
- 로컬 `apps/friendly/.env` 에 `OLLAMA_MEAL_PHOTO_MODEL` 이 없으면 사진 인식이 503 이다(2026-11-13 로컬이 그랬다 — 예시 파일 값
  `gemma4:31b`). 인식 흐름을 보려면 먼저 채운다.
- 한국어 본문에서 '모바일'은 웹의 작은 화면이다 — 문서·커밋에서 이 작업은 '앱'으로 쓴다. 커밋 스코프는 `(mobile)`.

## 5. 확인

앱에는 테스트가 없으니 화면으로 본다. 로컬 운영 사본(`apps/friendly/data/prod.db`)에 등록 식당 408곳이 있다 — 예: 검색어
"미스터" → 미스터유(메뉴 11개).

- [ ] `pnpm typecheck` 6개 워크스페이스 통과, `pnpm --filter mobile lint` 오류 0(경고 수가 늘지 않았는지).
- [ ] 3.1 뒤 웹·shared·utils 테스트 그대로 통과.
- [ ] 새 기록: 맨 위에서 식당을 찾아 고르면 식사 방식이 외식이 되고, 먹은 음식에 그 집 메뉴가 뜬다.
- [ ] 메뉴를 누르면 표준명 줄에 `[이 집 메뉴] … · 가격` 이 붙고, 다시 누르면 빠진다. 세트는 구성요소마다 한 줄, 가격은 첫 줄만.
- [ ] 줄 이름을 고치면 메뉴 표시가 사라진다. 식당을 바꾸거나 지우면 음식은 남고 메뉴 표시만 사라진다.
- [ ] 목록에 없는 식당은 이름만 적어 저장되고(`placeId` 없음) 메뉴 목록은 뜨지 않는다.
- [ ] 저장 → 상세·목록 카드에 메뉴명이 앞에 보이고, 상세 아랫줄에 표준명·가격이 있다. 수정해서 다시 저장해도 남는다.
- [ ] 웹에서 메뉴로 넣어 저장한 기록을 앱에서 고쳐 저장해도 메뉴명·가격이 남는다.
- [ ] 맛집 상세 메뉴 탭 '여기서 먹었어요' → 식당이 채워진 새 기록, 그 집 메뉴가 바로 뜬다.
- [ ] [근처 식당]: 처음엔 권한 창이 뜨고, 허용하면 가까운 순 칩. 거부·정확도 낮음·근처에 없음이 각각 문구로 구분된다.
      화면을 여는 것만으로는 권한 창이 뜨지 않는다. 허용해 둔 뒤 새 기록을 열면 묻지 않고 칩이 뜬다. 수정 화면에서는 안 뜬다.
- [ ] 사진을 먼저 넣고 식당을 고르면 인식한 줄에 메뉴가 붙고 **인식 요청은 한 번뿐**이다. 안 맞으면 [이 집 메뉴로 다시 인식]이 뜬다.
- [ ] 식당을 먼저 고르고 사진을 넣으면 알림에 "M개는 ○○ 메뉴에 이었어요"가 붙는다.
- [ ] 다크 모드·큰 글자에서 메뉴 줄·칩이 잘리지 않는다.

플랫폼:

- **Expo Web**(`pnpm --filter mobile web`, 8081) — 위치는 브라우저 권한으로 동작한다. 웹과 로그인 저장소가 달라 따로 로그인한다.
- **iOS 시뮬레이터** — Features › Location 으로 위치를 넣어 본다(예: 37.5543, 126.9368 신촌). 링크 오류가 나면
  [mobile-ios-build.md](mobile-ios-build.md).
- **Android·실기기** — 이 작업 전부터 미확인인 화면이 많다. 본 것과 못 본 것을 나눠 적는다.

## 6. 열린 질문 — 정해지면 진행

- **Android 사진 위치 권한**(`ACCESS_MEDIA_LOCATION`)을 더할지. 더하면 앨범 사진의 찍은 곳으로 근처 식당을 묻지 않고 내놓을 수
  있지만 권한 문구·네이티브 재빌드·스토어 심사 설명이 따른다. 기본은 **더하지 않음**([근처 식당] 버튼으로 충분한지 먼저 본다).
- **실제 사진으로 힌트 효과 재기** — 등록 식당에서 찍은 사진 10~20장이 있으면 `probe:meal-vision --place= --menus=` 로 잰다.
  앱 작업의 전제는 아니다.

## 7. 끝났다고 볼 기준

- 5번 체크리스트를 Expo Web 과 iOS(시뮬레이터 또는 실기기)에서 모두 확인했고, Android 는 확인했거나 못 한 항목을 적어 두었다.
- [PLAN-mobile-meal.md](PLAN-mobile-meal.md) 2번의 이 항목을 지우고, [PLAN-meal.md](PLAN-meal.md) 진행 기록에 앱 적용을 한 줄 남겼다.
- 웹의 동작·문구가 바뀌지 않았다(웹 테스트 통과).
