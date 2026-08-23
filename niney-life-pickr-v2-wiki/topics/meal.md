---
topic: meal
last_compiled: 2026-08-23
sources_count: 46
status: active
aliases: [식단, 식사기록, meal-log, meal-entry, meal-photo, meal-recognition, 식단인식, meal-recommendation, 식단추천, meal-preference, 식단통계, meal-reminder, 식단알림, meal-data-export, 식단데이터삭제, MealMutationBarrier]
---

# meal — 개인 식단 기록·사진 인식·추천

**2026-08-22~23 신설**: 로그인 사용자가 먹은 것을 사진 또는 수동으로 기록하고, 음식 카탈로그 매칭·선호·통계·추천까지 한 흐름으로 잇는 개인 도메인이다. 기록 입력은 **앱** 중심이고 웹은 조회·분석·추천·설정 중심이다. 공개/공유 표면은 없으며, 건강 진단이 아니라 기록 기반 관찰과 선택 보조에 한정한다.

## Purpose [coverage: high — 12 sources]

- 한 끼를 시각·끼니(`breakfast|lunch|dinner|snack|late_night`)·식사 방식(`home|dining_out|delivery|convenience|other`)·장소 스냅샷·음식·양·사진·메모로 남긴다. 항목은 수동 입력, [food](food.md) 카탈로그, 사진 인식, 추천에서 올 수 있다.
- 앱에서 최대 5장 사진을 업로드하고 vision LLM이 최대 20개 음식을 제안한다. 결과는 바로 확정하지 않고 사용자가 이름·분류·양을 고친 뒤 기록 저장 시 원본 인식 스냅샷과 함께 영속한다.
- 최근 90일 패턴·선호·최근 균형·피드백·날씨를 조합해 3~5개 후보를 추천한다. LLM이 실패하거나 설정되지 않아도 결정적 점수 순서로 결과가 남는다.
- 달력, 연속 기록, 반복률, 분포, 영양정보 커버리지, 추천 선택→기록 전환, 최근 7일 대 직전 7일 인사이트를 제공한다. 낮은 표본에서는 과도한 결론을 내리지 않는다.
- 선호/비선호/절대 제외, 추천 가중치, 기록할 끼니를 사용자별로 저장한다. 앱의 로컬 알림은 선택한 끼니 시각에 기록을 상기시킨다.
- 전체 JSON 내보내기와 식단 도메인 전체 삭제를 제공한다. 계정은 유지하며 사진 바이너리는 export에서 제외한다.

## Architecture [coverage: high — 22 sources]

| 층 | 핵심 | 책임 |
|---|---|---|
| 계약 | `packages/api-contract/src/schemas/meal.ts`, `Routes.Meal` | 모든 요청·응답, 제한값, source/slot/type enum, export/delete 확인 문자열의 Zod SSOT |
| 기록 | `meal.route.ts` → `MealService` | 목록/단건/달력/최근 음식/시간 프리셋과 기록 CRUD; 모든 쿼리를 `userId`로 한정 |
| 사진 | `MealPhotoService` | JPEG 정규화, HEIC 폴백, 원본·320px 썸네일, 소유권·토큰 검증, 복제, 고아 청소 |
| 인식 | `MealRecognitionService` | `meal-photo` purpose vision 호출, 구조화 결과 복구 재시도, 카탈로그 exact/alias/fuzzy 매칭 |
| 추천 | `MealPatternService` + `MealRecommendationService` | 90일 패턴/14일 균형/선호/날씨 후보 점수화, LLM 선택, fallback, 캐시·quota·피드백 |
| 통계 | `MealStatsService` + `computeWeeklyMealInsights` | 기간 집계, 영양 커버리지, 추천 funnel, 표본 안전한 주간 관찰 |
| 권리 | `MealDataService` | 트랜잭션 스냅샷 export, 강한 확인문구 전체 삭제, 사진 디렉터리 정리 |
| 공통 쓰기 | `mealMutationBarrier` | 라우트별 서비스 인스턴스를 넘어 같은 사용자의 모든 쓰기와 전체 삭제를 FIFO 직렬화 |
| FE 공통 | `meal.api.ts`, `useMeal.ts`, `mealDraftStore.ts` | React Query 캐시·cursor 페이지·JWT 사진 바이트, draft와 플랫폼 저장소 주입 |
| UI | 웹 `routes/meal/`, 앱 `app/meal/`·`components/meal/` | 웹은 조회/분석/추천/설정, 앱은 사진 촬영·편집·상세·복사까지 전체 흐름 |

`mealDraftStore`는 웹 `sessionStorage`, 앱 `AsyncStorage`를 런타임 주입하는 [platform-ui-split](../concepts/platform-ui-split.md) 인스턴스다. 재인식 시 `userEdited` 항목과 manual/catalog/recommendation 항목은 보존하고, 사용자가 손대지 않은 recognition 항목만 교체한다.

인증 주체 전환은 전역 private-cache 경계다. 공통 API client가 **각 요청이 실제 사용한 token과 401 callback을 요청 시작 시점에 캡처**하고, 응답 시 현재 token과 같을 때만 세션을 정리한다. 웹·앱은 유효한 현재 세션의 401에서 QueryClient 요청을 취소하고 전체 캐시를 비우며, 로그인/가입 성공도 새 principal을 넣기 전에 기존 query를 취소·제거한다. meal query key에 user id가 없는 구조에서도 이전 계정 응답/캐시가 다음 계정으로 넘어가지 않는다.

사진 저장소는 `data/meal-photos/<userId>/<token>.jpg`와 `<token>_t.jpg`다. `sharp.rotate()` 뒤 최대 1600px JPEG(품질 80)로 만들어 EXIF를 제거하고, DB 행은 처음 `entryId=null`인 업로드 토큰으로 생성된다. 기록 트랜잭션이 토큰을 attach한 뒤 커밋 후에만 떼어진 파일을 지운다.

## Talks To [coverage: high — 11 sources]

- **[food](food.md)** — 인식·수동 입력 이름을 `FoodItem`에 exact → alias → fuzzy로 매칭하고 `foodId`, 분류, 영양 스냅샷을 기록한다. 추천 후보와 "파는 곳 보기" 역검색도 카탈로그를 사용한다.
- **AI provider** — 인식은 image purpose, 추천은 chat purpose를 쓴다. `MEAL_RECOGNITION_VERSION`/`MEAL_RECOMMENDATION_VERSION`과 model을 결과에 저장하는 [versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 인스턴스다.
- **날씨/대기 위치** — 저장된 대기 위치 또는 요청 좌표가 있으면 기상청 현재 날씨를 추천 context에 넣고, 실패하면 계절 fallback을 쓴다. 좌표를 주지 않아도 추천은 동작한다.
- **operation-log** — 인식·추천 실행은 모델/단계/실패를 범용 작업 로그에 남긴다([operation-log-instrumentation](../concepts/operation-log-instrumentation.md)). 원본 사진·메모 같은 개인 내용은 품질 집계/로그 응답 경계를 넘기지 않는다.
- **rate-limit + 일일 quota** — 사진 업로드·인식·추천 라우트 제한과 사용자별 인메모리 일일 호출량을 겹쳐 적용한다. 추천 캐시 hit와 동일 요청 in-flight join은 quota를 다시 쓰지 않는다.
- **앱 알림** — `expo-notifications` 로 기기 로컬 일일 알림만 예약한다. 권한은 사용자가 켤 때 요청하며 서버·다른 기기와 동기화하지 않는다.

관련 횡단 결정은 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md), [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md), [platform-ui-split](../concepts/platform-ui-split.md), [versioned-llm-prompts](../concepts/versioned-llm-prompts.md)에 연결된다.

## API Surface [coverage: high — 9 sources]

전부 Bearer 로그인 필수이며 공개·토큰 공유 API가 없다.

| 메서드 | 경로 | 역할 |
|---|---|---|
| `GET` / `POST` | `/api/v1/meals` | compound cursor `(eatenAt,id)` 목록 / 기록 생성 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/meals/:id` | 소유자 단건 조회·전체 필드 수정·삭제 |
| `GET` | `/api/v1/meals/calendar?month=YYYY-MM` | 일자별 기록 요약 |
| `GET` | `/api/v1/meals/stats?from=&to=` | 분포·반복·streak·영양·추천 funnel·주간 insight |
| `GET` | `/api/v1/meals/time-presets` | 최근 90일 끼니별 중앙 시각; 표본 3개 미만은 기본값 |
| `GET` | `/api/v1/meals/items/recent?name=` | 같은 음식의 최근 양·분류·참조 사진 |
| `POST` | `/api/v1/meals/photos` | multipart 사진 업로드, 토큰/원본·썸네일 URL 반환 |
| `GET` | `/api/v1/meals/photos/:token[/thumb]` | 소유자 JWT 사진 바이트(`private, max-age=3600`) |
| `POST` / `DELETE` | `/api/v1/meals/photos/:token/copy`, `/photos/:token` | 독립 사진 복제 / 고아 업로드 삭제 |
| `POST` | `/api/v1/meals/recognize` | 소유 사진 토큰 배열 동기 인식 |
| `GET` / `PUT` | `/api/v1/meals/preference` | 기본값 합성 조회 / 사용자당 1행 upsert |
| `GET` / `POST` | `/api/v1/meals/recommendations` | 최근 이력 / 추천 생성(`force`는 캐시 우회) |
| `GET` | `/api/v1/meals/recommendations/context` | 기록 수·최근 음식·선호·최신 추천 진입 context |
| `POST` | `/api/v1/meals/recommendations/:id/feedback` | 후보 선택, `-1|1|null` 평가, 먹은 기록 연결 |
| `GET` | `/api/v1/meals/data/export` | 일관된 JSON 스냅샷 내보내기 |
| `DELETE` | `/api/v1/meals/data` | `DELETE_ALL_MY_MEAL_DATA` 정확 입력 후 전체 삭제 |

사진은 `<img src>`에 Bearer header를 실을 수 없어 공통 API가 인증 fetch 후 웹에서는 object URL, 앱에서는 data URL로 변환한다. 목록의 cursor는 base64url opaque 값이며 구버전 ISO cursor도 읽기만 허용한다.

## Data [coverage: high — 13 sources]

| 모델 | 핵심 데이터와 수명 |
|---|---|
| `MealEntry` | `userId`, UTC `eatenAt` + 로컬 `eatenDate`, slot/type/place snapshot/memo/source/originRecommendationId. 사용자 삭제 cascade |
| `MealItem` | 이름·정규화명·분류·양·source와 `foodId` 힌트, kcal/protein/sodium/`nutritionFrom` **기록 시점 스냅샷** |
| `MealPhoto` | 토큰, `userId` FK, nullable `entryId`, 크기·바이트·정렬. 기록 밖 고아 업로드도 사용자 소유 |
| `MealPreference` | 사용자당 1행, 7개 가중치(0~5), liked/disliked/excluded, 허용 mealTypes/slots, onboarded |
| `MealRecommendation` | 날짜·slot/type, 3~5 후보·context/profile JSON·profileHash·model/version·fallback, `feedbackJson`의 chosen/rating/eatenEntryId |

`MealEntry.placeId`, `MealItem.foodId`, `originRecommendationId`는 마스터/추천에 FK로 묶지 않고 스냅샷 생존성을 택했다. 어드민이 식당/음식을 바꾸거나 추천 이력을 정리해도 과거 기록은 표시된다. 반대로 `MealPhoto.userId`는 FK cascade이며 모든 읽기·쓰기에서 소유자를 다시 검증한다.

영양 통계는 알려진 영양 항목만 합산하고 `coverage`를 함께 반환한다. 일평균은 기록한 날 기준이다. `nutritionFrom`이 있으면 같은 음식 계열의 중앙값 donor를 빌린 추정치임을 UI가 밝힐 수 있다.

내보내기는 한 DB transaction에서 기록(인식 포함)·사진 메타·고아 사진·선호·추천을 읽는다. 사진 바이너리는 넣지 않으며 손상된 과거 context/profile JSON은 `{}`로 낮춰 나머지 export를 막지 않는다.

## Key Decisions [coverage: high — 19 sources]

- **확정 전 인간 교정** — vision 출력은 draft 제안이다. 사용자가 최종 저장한 항목과 strict 원본 recognition snapshot을 함께 두어 재현성과 어드민 품질 측정을 동시에 얻는다.
- **카탈로그는 참조, 기록은 스냅샷** — `foodId`만 저장하지 않고 이름·분류·영양을 복사한다. 마스터 변경이 과거 식단·통계를 소급 변경하지 않는다.
- **추천은 결정적 후보 생성 → 제한된 LLM 선택** — 이력/liked/popular/novel pool을 먼저 점수화하고 hard excluded는 이름·재료에서 제거한다. disliked는 taste 감점만 준다. LLM은 주어진 후보 밖 음식을 만들 수 없고 실패 시 점수 상위 후보가 그대로 반환된다.
- **피드백 강도 분리** — 선택보다 실제 기록 연결을 더 강한 신호로 보고, 평가는 방향성 신호로 시간 감쇠한다. 추천에서 "먹었어요"를 누르면 `originRecommendationId`를 가진 draft를 만들고 기록 저장 transaction에서만 immutable 연결을 확정한다.
- **표본에 맞춘 통계** — 주간 insight는 최근 7일과 직전 7일을 결정적으로 비교한다. 두 비교 구간의 합계가 3끼 미만이면 시작 안내만 보여 주고 의료·영양 처방 문구를 만들지 않는다.
- **사진 복사는 참조 공유가 아님** — 지난 기록에서 복사한 사진은 새 토큰/행/파일이다. 원본 기록 삭제가 새 기록 사진을 깨뜨리지 않는다.
- **사용자 단위 공통 write barrier** — `create/update/remove`, preference update, 추천 전체(날씨·quota·LLM·저장)와 feedback, 사진 `store/copy/remove`, 고아 DB 행 정리, `deleteAll`을 같은 FIFO에 둔다. 다른 사용자는 병렬이고 실패 뒤에도 queue가 진행하며 마지막 tail key를 지운다. 동일 추천 요청은 첫 Promise만 barrier에 들어가고 나머지는 join한다.
- **DB 커밋과 파일 side effect 순서** — attach/detach는 transaction 안에서 DB만 변경하고 파일은 커밋 뒤 지운다. 전체 삭제도 DB를 먼저 비운 뒤 사용자 전용 폴더를 strict 삭제한다. 폴더 삭제 실패는 200으로 숨기지 않으며, 같은 삭제를 다시 호출하면 DB가 이미 비어도 파일 삭제를 재시도한다.
- **플랫폼 역할 분리** — 앱은 카메라/앨범·편집·재기록·알림·파일 공유를 제공한다. 웹은 사진 입력 없이 기록/달력/통계 조회, 추천/선호, 브라우저 JSON 다운로드·삭제에 집중한다.
- **token guard + principal cache barrier** — 지연된 A 계정 요청의 401이 B 계정 로그인 뒤 도착해도 request token이 현재 token과 다르면 무시한다. 실제 현재 세션의 401과 명시적 로그인/가입 전환에서는 진행 query를 먼저 취소하고 캐시를 제거한 뒤 세션을 바꿔 private meal 응답의 계정 간 노출을 막는다.

## Gotchas [coverage: high — 17 sources]

- **`late_night` 시간대는 자정을 넘는다.** 시간 preset은 KST 최근 90일 중앙값을 구할 때 자정 뒤 시간을 다음 날 축으로 펼쳤다가 다시 감는다. `eatenAt`은 UTC, 달력 grouping은 저장된 로컬 `eatenDate`를 사용한다.
- **사진 제한은 두 겹이다.** 한 기록 최대 5장이고 사용자 전체 최대 3,000장이다. 업로드만 하고 저장을 포기한 DB 고아와 DB 생성 전 프로세스 종료로 생긴 미추적 파일을 24시간 뒤 부팅+매일 04:30 청소한다. 미추적 스캔은 직계 사용자 디렉터리·정해진 JPEG 이름·2,000개 상한이며 symlink를 따라가지 않는다.
- **재인식은 모든 현재 사진을 다시 본다.** 앱에서 사진을 추가하면 기존+신규 토큰 전체로 인식한다. draft merge 규칙을 우회해 응답으로 항목 배열을 통째 교체하면 사용자의 교정이 사라진다.
- **인식 debug dump는 민감할 수 있다.** `MEAL_RECOGNITION_DEBUG=1`은 개발 진단용으로 raw 모델 응답/토큰을 저장할 수 있다. 기본은 off이며 운영 상시 활성화 대상이 아니다.
- **추천 캐시는 context까지 포함한다.** 같은 날짜/slot/profile/context는 재사용하고 `force=true`만 우회한다. explicit `mealType: null`은 자동 선호 선택과 다르므로 `undefined`와 합치면 안 된다.
- **추천 이력은 전부 무한 보존하지 않는다.** 반응 없는 과거 추천은 최근 50개만 유지하지만 피드백/기록 연결이 있는 행은 남긴다.
- **전체 삭제 확인은 UI 확인창만으로 부족하다.** 서비스 직접 호출도 `DELETE_ALL_MY_MEAL_DATA`를 검사한다. 삭제 결과는 계정이 아니라 식단 entry/item/photo/recommendation/preference만 포함한다. 앱은 성공 뒤 식단 draft와 **식단 알림 ID만** 정리한다.
- **파일 삭제 실패 상태는 의도적으로 부분 완료다.** DB transaction은 이미 커밋됐으므로 롤백할 수 없다. API가 실패를 반환하고 재호출로 남은 사용자 폴더를 제거하는 것이 복구 절차다.
- **현재 장벽은 단일 프로세스 메모리다.** Fastify 단일 인스턴스 전제에서는 라우트별 서비스 인스턴스도 직렬화하지만, 다중 프로세스로 확장하면 분산 lock/queue가 필요하다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).
- **웹은 기록 편집기가 아니다.** 기록 생성·사진 촬영·수정/삭제·"이 식단 다시 기록"은 앱에서 한다. 웹 `/meal`의 기록/달력은 조회 전용이다.
- **meal query key 자체는 user id namespace가 아니다.** 공식 웹·앱 bootstrap과 `useLogin/useRegister`의 전역 cancel/clear 경계가 보안 계약의 일부다. 새 클라이언트가 `configureApi`만 복사하고 token 비교·QueryClient 정리를 빼면 이전 principal의 캐시 또는 늦은 401 회귀가 생긴다.

## Sources [coverage: high — 46 sources]

- [docs/PLAN-meal.md](../../docs/PLAN-meal.md)
- [packages/api-contract/src/schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Meal`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — Meal/Food 모델
- [apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql](../../apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql)
- [apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql](../../apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql)
- [apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql](../../apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql)
- [apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql](../../apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql)
- [apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql](../../apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql)
- [apps/friendly/src/modules/meal/meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts)
- [apps/friendly/src/modules/meal/meal.service.ts](../../apps/friendly/src/modules/meal/meal.service.ts)
- [apps/friendly/src/modules/meal/meal.service.test.ts](../../apps/friendly/src/modules/meal/meal.service.test.ts)
- [apps/friendly/src/modules/meal/meal-photo.service.ts](../../apps/friendly/src/modules/meal/meal-photo.service.ts)
- [apps/friendly/src/modules/meal/meal-data.service.ts](../../apps/friendly/src/modules/meal/meal-data.service.ts)
- [apps/friendly/src/modules/meal/meal-data.route.test.ts](../../apps/friendly/src/modules/meal/meal-data.route.test.ts)
- [apps/friendly/src/modules/meal/meal-mutation-barrier.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.ts)
- [apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts)
- [apps/friendly/src/modules/meal/meal-preference.service.ts](../../apps/friendly/src/modules/meal/meal-preference.service.ts)
- [apps/friendly/src/modules/meal/meal-preference.service.test.ts](../../apps/friendly/src/modules/meal/meal-preference.service.test.ts)
- [apps/friendly/src/modules/meal/meal-quota.ts](../../apps/friendly/src/modules/meal/meal-quota.ts)
- [apps/friendly/src/modules/meal/meal-stats.service.ts](../../apps/friendly/src/modules/meal/meal-stats.service.ts)
- [apps/friendly/src/modules/meal/meal-stats.service.test.ts](../../apps/friendly/src/modules/meal/meal-stats.service.test.ts)
- [apps/friendly/src/modules/meal/meal-stats.insights.ts](../../apps/friendly/src/modules/meal/meal-stats.insights.ts) (+[test](../../apps/friendly/src/modules/meal/meal-stats.insights.test.ts))
- [apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts) (+[test](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.test.ts))
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.route.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.test.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.test.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts](../../apps/friendly/src/modules/meal-recommendation/meal-pattern.service.ts)
- [apps/friendly/src/modules/meal-recommendation/meal-recommendation.prompts.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.prompts.ts) · [meal-recommendation.feedback.ts](../../apps/friendly/src/modules/meal-recommendation/meal-recommendation.feedback.ts)
- [apps/friendly/src/plugins/meal.ts](../../apps/friendly/src/plugins/meal.ts)
- [packages/shared/src/api/meal.api.ts](../../packages/shared/src/api/meal.api.ts) (+[test](../../packages/shared/src/api/meal.api.test.ts))
- [packages/shared/src/hooks/useMeal.ts](../../packages/shared/src/hooks/useMeal.ts)
- [packages/shared/src/stores/mealDraftStore.ts](../../packages/shared/src/stores/mealDraftStore.ts) (+[test](../../packages/shared/src/stores/mealDraftStore.test.ts))
- [apps/web/src/routes/meal/MealPage.tsx](../../apps/web/src/routes/meal/MealPage.tsx) (+[test](../../apps/web/src/routes/meal/MealPage.test.tsx))
- [apps/web/src/routes/meal/MealPreferenceTab.tsx](../../apps/web/src/routes/meal/MealPreferenceTab.tsx) · [MealRecommendTab.tsx](../../apps/web/src/routes/meal/MealRecommendTab.tsx) · [MealPhotoImg.tsx](../../apps/web/src/routes/meal/MealPhotoImg.tsx)
- [apps/mobile/app/meal/](../../apps/mobile/app/meal/) — 목록·신규·상세 라우트
- [apps/mobile/src/components/meal/MealEntryEditor.tsx](../../apps/mobile/src/components/meal/MealEntryEditor.tsx) · [MealItemRow.tsx](../../apps/mobile/src/components/meal/MealItemRow.tsx) · [MealEntryCard.tsx](../../apps/mobile/src/components/meal/MealEntryCard.tsx) · [MealPhotoThumb.tsx](../../apps/mobile/src/components/meal/MealPhotoThumb.tsx)
- [apps/mobile/src/components/meal/MealCalendarView.tsx](../../apps/mobile/src/components/meal/MealCalendarView.tsx) · [MealStatsView.tsx](../../apps/mobile/src/components/meal/MealStatsView.tsx) · [MealRecommendView.tsx](../../apps/mobile/src/components/meal/MealRecommendView.tsx) · [MealPreferenceView.tsx](../../apps/mobile/src/components/meal/MealPreferenceView.tsx)
- [apps/mobile/src/components/meal/MealDataManagementCard.tsx](../../apps/mobile/src/components/meal/MealDataManagementCard.tsx) · [MealReminderSettingsCard.tsx](../../apps/mobile/src/components/meal/MealReminderSettingsCard.tsx) · [mealReminders.ts](../../apps/mobile/src/lib/mealReminders.ts)
- [apps/mobile/src/components/home/TodayMealCard.tsx](../../apps/mobile/src/components/home/TodayMealCard.tsx) · [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts) (+[test](../../packages/shared/src/api/client.test.ts)) — request token 401 guard
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts) — principal 전환 전 query 취소·제거
- [apps/web/src/main.tsx](../../apps/web/src/main.tsx) — 현재 세션 401의 QueryClient clear
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) · [queryClient.ts](../../apps/mobile/src/lib/queryClient.ts) — 앱도 Provider와 같은 cache instance 정리
