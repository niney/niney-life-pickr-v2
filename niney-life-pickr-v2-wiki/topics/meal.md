---
topic: meal
last_compiled: 2026-08-24
sources_count: 57
status: active
aliases: [식단, 식사기록, meal-log, meal-entry, meal-photo, meal-recognition, 식단인식, meal-recommendation, 식단추천, meal-preference, 알레르기, 식단통계, meal-reminder, 식단알림, meal-backup, 식단백업, photo-retention, 사진보존, MealMutationBarrier]
---

# meal — 개인 식단 기록·인식·추천·휴대성

**2026-08-22~24 신설·확장**: 로그인 사용자의 식사 기록, 사진 인식, 카탈로그 연결, 선호·알레르기, 추천과 행동 학습, 통계, 로컬 초안·알림, 백업·복원과 사진 보존까지 잇는 개인 도메인이다. 공개/공유 표면은 없고, 건강 진단이 아니라 기록 기반 관찰과 선택 보조에 한정한다.

## Purpose [coverage: high — 16 sources]

- 한 끼를 시각·끼니(`breakfast|lunch|dinner|snack|late_night`)·식사 방식·장소 스냅샷·음식·양·사진·메모로 남긴다. 항목은 수동 입력, [food](food.md) 카탈로그, 사진 인식, 추천에서 올 수 있다.
- 목록은 음식명·장소·메모 검색과 날짜·끼니·식사 방식·출처 필터를 서버 페이지네이션 전에 적용한다. 웹과 앱 모두 같은 무한 목록 계약을 쓴다.
- 앱에서 최대 5장 사진을 업로드하고 vision LLM이 최대 20개 음식을 제안한다. 결과는 바로 확정하지 않고 사용자가 이름·분류·양을 고친 뒤 저장하며, 인식 계보와 원본 스냅샷도 함께 남긴다.
- 최근 90일 패턴, 선호·비선호·제외, 최근 균형, 행동 이벤트, 날씨를 조합해 3~5개 후보를 추천한다. LLM이 실패하거나 설정되지 않아도 결정적 점수 순서로 결과가 남는다.
- 선호 알레르기 19종을 추천 후보 이름·재료·카탈로그 근거와 best-effort로 대조한다. 메타데이터가 없다는 사실을 안전하다는 뜻으로 취급하지 않는다.
- 달력, 연속 기록, 반복률, 분포, 영양정보 출처·커버리지, 추천 노출→선택→기록 funnel, 최근 7일 대 직전 7일 인사이트를 제공한다. 비교 표본이 3끼 미만이면 시작 안내만 보여 준다.
- 앱은 계정별 초안·대기 사진·사진 캐시·로컬 알림을 격리한다. 네트워크가 끊긴 동안 고른 사진은 앱 소유 저장소에 두고 재시도할 수 있다.
- 메타데이터 JSON export, 사진까지 포함한 검증 가능한 JSON+base64 백업·멱등 복원, 텍스트를 남기는 사진 보존 정리, 식단 전체 삭제를 제공한다.

## Architecture [coverage: high — 29 sources]

| 층 | 핵심 | 책임 |
|---|---|---|
| 계약 | `packages/api-contract/src/schemas/meal.ts`, `Routes.Meal` | 요청·응답, enum, 제한값, 확인 문자열과 백업 형식의 Zod SSOT |
| 기록 | `meal.route.ts` → `MealService` | 검색·필터·compound cursor 목록, 단건·달력·최근 음식·시간 preset과 CRUD; 모든 쿼리를 `userId`로 한정 |
| 사진 | `MealPhotoService` | JPEG 정규화, 원본·320px 썸네일, 소유권·토큰 검증, 복제, 고아·미추적 파일 청소 |
| 인식 | `MealRecognitionService` | vision 호출, 결과 복구 재시도, 카탈로그 exact/alias/fuzzy 매칭, dish lineage·confidence·match 근거 영속 |
| 인식 평가 | `meal-recognition-eval.ts`, `eval-meal-recognition.ts` | 개인정보 보호형 v2·legacy 덤프 파싱, 모델별 호출/파싱과 raw 표본 품질·선택 라벨 집계 |
| 추천 | `MealPatternService` + `MealRecommendationService` | 패턴·균형·선호·날씨 후보 점수화, 알레르기 평가, LLM 선택/fallback, immutable event 학습 |
| 사용량 | `MealDailyQuotaService` | `(userId,date,purpose)` SQLite 원자적 upsert로 인식·추천의 KST 일일 한도 영속 |
| 통계 | `MealStatsService` + `computeWeeklyMealInsights` | 영양 provenance/coverage, 추천 funnel, 표본 안전한 주간 관찰 |
| 권리·휴대성 | `MealDataService` | metadata export, portable backup/restore, retention preview/delete, 전체 삭제 |
| 파일 삭제 복구 | `MealPhotoDeletion` outbox | retention DB commit과 삭제 의도를 함께 기록하고, 커밋 뒤 strict unlink 및 부팅·매일 재시도 |
| 공통 쓰기 | `mealMutationBarrier` | 같은 사용자의 기록·사진·추천·선호·복원·정리를 FIFO 직렬화; 다른 사용자는 병렬 |
| FE 공통 | `meal.api.ts`, `useMeal.ts`, `mealDraftStore.ts` | React Query 캐시, cursor 페이지, JWT 사진 바이트, 계정별 draft와 플랫폼 저장소 주입 |
| 앱 로컬 | `mealDraftPhotos`, `mealPhotoCache`, `mealReminders` | 계정 namespace의 대기 업로드, 인증 사진 cache, 로컬 알림 lifecycle |
| UI | 웹 `routes/meal/`, 앱 `app/meal/`·`components/meal/` | 웹은 조회·분석·추천·설정, 앱은 촬영·편집·오프라인 대기·백업·알림까지 전체 흐름 |

`mealDraftStore`는 principal이 확정되기 전 읽기·쓰기를 하지 않고 `lp:meal-draft-v1:principal:<id>`에만 저장한다. 계정 전환은 이전 메모리·legacy 초안과 namespace를 동기적으로 버리며, session generation 검사로 늦게 끝난 hydrate가 새 계정을 덮지 못하게 한다. 웹은 `sessionStorage`, 앱은 `AsyncStorage`를 주입하는 [platform-ui-split](../concepts/platform-ui-split.md) 인스턴스다.

앱의 대기 사진은 picker/camera URI를 먼저 `documentDirectory/meal-draft-photos-v1/files`로 복사하고 `pendingPhotos`에 남긴다. 한 장씩 단일-flight로 올려 성공 토큰만 승격하며, 남은 대기/누락 사진이 있으면 인식과 저장을 막는다. 서버 사진 캐시는 별도의 `cacheDirectory`와 auth-token fingerprint를 쓰고, 모든 다운로드에 Bearer를 붙인다.

인증 주체 전환은 전역 private-cache 경계다. 공통 API client가 요청 시작 token과 401 callback을 캡처하고 응답 시 현재 token과 같을 때만 세션을 정리한다. 웹·앱은 유효한 현재 세션의 401에서 QueryClient 요청을 취소하고 캐시를 비우며, 로그인/가입 성공도 새 principal을 넣기 전에 기존 query를 취소·제거한다.

## Talks To [coverage: high — 15 sources]

- **[food](food.md)** — 이름 매칭, 분류·영양·알레르기 근거, 추천 후보와 식당 역검색을 소비한다. meal은 이름·영양·매칭 근거를 확정 시점 스냅샷으로 남긴다.
- **AI provider** — 인식은 image purpose, 추천은 chat purpose를 쓴다. model/version을 저장하는 [versioned-llm-prompts](../concepts/versioned-llm-prompts.md) 인스턴스이며 provider 실패에도 추천 fallback은 동작한다.
- **날씨/대기 위치** — 저장 위치 또는 요청 좌표가 있으면 기상청 현재 날씨를 추천 context에 넣고, 실패하면 계절 fallback을 쓴다.
- **operation-log** — 인식·추천의 모델/단계/실패를 범용 작업 로그에 남긴다. 사진·메모·사용자 식별자는 어드민 품질 aggregate에 노출하지 않는다([operation-log-instrumentation](../concepts/operation-log-instrumentation.md)).
- **SQLite quota + route rate limit** — 인식·추천의 일일 사용자 quota는 DB에 남아 재시작을 우회하지 못한다. 추천 cache hit와 같은 요청의 in-flight join은 다시 소비하지 않고, `force` cache miss는 소비한다. multipart/route 제한은 별도로 겹친다.
- **앱 파일·알림 API** — Expo FileSystem/DocumentPicker/Sharing/Notifications로 대기 사진, backup 파일, 로컬 일일 알림을 다룬다. 알림은 서버·다른 기기와 동기화하지 않는다.

관련 횡단 결정은 [zod-ssot-buildless](../concepts/zod-ssot-buildless.md), [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md), [platform-ui-split](../concepts/platform-ui-split.md), [versioned-llm-prompts](../concepts/versioned-llm-prompts.md)에 연결된다. 단, 영속 일일 quota는 메모리 singleton이 아니라 SQLite가 진실이다.

## API Surface [coverage: high — 15 sources]

전부 Bearer 로그인 필수이며 공개·공유 API가 없다.

| 메서드 | 경로 | 역할 |
|---|---|---|
| `GET` / `POST` | `/api/v1/meals` | 날짜·slot·mealType·source·`q` 검색/필터 + `(eatenAt,id)` cursor 목록 / 기록 생성 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/meals/:id` | 소유자 단건 조회·전량 교체 성격 수정·삭제 |
| `GET` | `/api/v1/meals/calendar`, `/stats`, `/time-presets`, `/items/recent` | 달력·기간 통계·개인 시각 preset·최근 음식 보조 |
| `POST` / `GET` / `DELETE` | `/api/v1/meals/photos...` | 업로드, JWT 원본·썸네일, 독립 복제, 고아 토큰 삭제 |
| `POST` | `/api/v1/meals/recognize` | 소유 사진 토큰 배열 동기 인식 |
| `GET` / `PUT` | `/api/v1/meals/preference` | 기본값 합성 조회 / 알레르기 포함 사용자당 1행 upsert |
| `GET` / `POST` | `/api/v1/meals/recommendations` | 최근 이력 / 추천 생성(`force`는 cache 우회) |
| `GET` | `/api/v1/meals/recommendations/context` | 기록 수·최근 음식·선호·최신 추천 진입 context |
| `POST` | `/api/v1/meals/recommendations/:id/events` | 후보 노출·선택·평가·식당 열기·dismiss 이벤트; client의 `logged` 제출은 금지 |
| `POST` | `/api/v1/meals/recommendations/:id/feedback` | 구버전 호환 latest projection 갱신 |
| `GET` | `/api/v1/meals/data/export` | 사진 binary가 없는 metadata JSON 스냅샷 |
| `GET` / `POST` | `/api/v1/meals/data/backup[/restore]` | version 1 JSON+base64 백업 / 참조·hash 검증 후 멱등 추가 복원 |
| `GET` / `DELETE` | `/api/v1/meals/data/photos/retention` | 대상·용량 preview / `DELETE_OLD_MEAL_PHOTOS` 확인 후 텍스트 보존 사진 정리 |
| `DELETE` | `/api/v1/meals/data` | `DELETE_ALL_MY_MEAL_DATA` 확인 후 도메인 전체 삭제; 계정 유지 |

사진은 `<img src>`에 Bearer header를 실을 수 없어 인증 fetch 후 웹은 object URL, 앱은 인증 cache의 `file://` URI를 쓴다. 목록 cursor는 opaque이고 구버전 ISO cursor는 읽기 호환만 제공한다.

## Data [coverage: high — 18 sources]

| 모델/형식 | 핵심 데이터와 수명 |
|---|---|
| `MealEntry` | `userId`, UTC `eatenAt` + 로컬 `eatenDate`, slot/type/place snapshot/memo/source/originRecommendationId, `photoPurgedAt` |
| `MealItem` | 이름·분류·양·source·`foodId` 힌트, kcal/protein/sodium snapshot, `nutritionBasis=direct|donor_estimate|missing`, `nutritionFrom`, recognition lineage·confidence·match 근거 |
| `MealPhoto` | token, `userId`, nullable `entryId`, 크기·byte·순서. 원본과 thumb는 사용자 전용 디렉터리 |
| `MealPreference` | 사용자당 1행, 가중치·liked/disliked/excluded, 19종 allergens, 허용 mealTypes/slots |
| `MealRecommendation` | 후보/context/profile, model/version/fallback, latest `feedbackJson`; 반응 없는 옛 행만 제한 정리 |
| `MealRecommendationEvent` | `shown|candidate_picked|set_rated|candidate_rated|restaurant_opened|logged|dismissed` 불변 이벤트, candidate/rank/rating/platform/rankingVersion |
| `MealDailyQuota` | `(userId,date,purpose)` unique count. DB 재시작 뒤에도 인식·추천 일일 한도를 유지 |
| `MealDataImport` | `(userId,archiveId)` 복원 결과 ledger. 같은 archive의 재전송을 중복 생성 없이 응답 |
| `MealPhotoDeletion` | `userId+token` unique, attempts/lastError. User FK 없이 전체 삭제 뒤에도 파일 재시도 가능 |

영양 합계는 kcal가 알려진 항목만 더하므로 coverage와 provenance를 반드시 함께 읽는다. `mainItemCoverage < 0.6`이거나 영양 표본이 없으면 일평균은 `null`; direct/estimated/missing 항목 수와 `averageReliable`가 화면의 신뢰 경계다. 값이 있는 항목만 합친 합계도 실제 섭취량보다 작을 수 있다.

인식 결과는 각 dish의 UUID `recognitionDishId`, 선택 후보 rank, `catalogMatchedBy`, score, confidence를 draft에서 최종 `MealItem`까지 보존한다. 품질 비교는 lineage를 최우선으로 하고, 구형 데이터만 food/name 및 마지막 order fallback을 쓴다. confidence bucket은 low `<0.4`, medium `<0.75`, high 그 이상이다.

portable backup은 `format='niney-life-pickr.meal-backup'`, `version=1` JSON이다. 연결 사진 JPEG를 canonical base64로 넣고 byteSize·SHA-256·모든 참조를 strict 검증한다. 최대 사진 100개/개별 5MB/합계 50MB/JSON 75MB, 기록 5,000개, 추천 1,000개, 추천당 이벤트 200개다. 복원은 새 id/token을 만들고 기존 preference는 유지한다.

## Key Decisions [coverage: high — 25 sources]

- **확정 전 인간 교정 + lineage** — vision 출력은 draft 제안이다. 원본 snapshot과 최종 항목 사이의 dish id·match·confidence를 보존해 순서 변화에도 교정 품질을 비교한다.
- **카탈로그는 참조, 기록은 스냅샷** — `foodId`만 믿지 않고 이름·분류·영양·provenance를 복사한다. 마스터 변경이 과거 식단과 통계를 소급 변경하지 않는다.
- **알레르기는 best-effort 차단** — 검수된 카탈로그 값은 그대로 쓰고, 미검수 행은 공개 재료 문자열에서만 알려진 일치를 추론해 제외한다. `possible|none_known|unknown`을 구분하며, 음식명이나 빈 metadata는 안전 보증도 교차접촉 보증도 아니다.
- **결정적 후보 생성 → 제한된 LLM 선택** — hard excluded와 알려진 알레르기를 제거한 pool을 먼저 점수화한다. LLM은 후보 밖 음식을 만들 수 없고 실패하면 점수 상위 결과를 쓴다.
- **추천 행동은 불변 event** — 노출, 후보 선택, 후보별 평가, 식당 열기, dismiss를 append한다. 실제 기록 저장 transaction만 `logged`를 만들며 `feedbackJson`은 호환용 최신 projection이다.
- **latest candidate learning** — 같은 추천·정규화 후보의 최신 rating만 쓰고, 최신 pick/logged를 시간 감쇠한다. `logged`는 선택보다 강하고 옛 set rating을 모든 후보에 임의 분배하지 않는다.
- **funnel denominator 보존** — feedback 없는 추천도 `shown` 분모에 포함한다. `pickRate=chosen/shown`, `loggedFromShown=logged/shown`을 구분한다.
- **영속 quota와 단일-flight 분리** — DB quota가 일일 사용권을 원자적으로 소비하고, in-flight map은 동일 요청 중복만 join한다. 사용자 write barrier는 더 넓은 mutation 순서 경계다.
- **표본에 맞춘 통계** — 최근 7일 대 직전 7일을 결정적으로 비교하며 합계 3끼 미만이면 비의료 시작 안내만 표시한다.
- **계정별 local-first 상태** — 초안·알림·대기 사진·사진 cache는 principal/token fingerprint namespace다. 계정 전환은 이전 schedule·파일·cache를 지우고 늦은 비동기 완료를 epoch/token guard로 거부한다.
- **백업은 추가 복원 + ledger 멱등성** — restore는 기존 기록을 지우지 않고 새 id로 추가한다. 동일 `archiveId`는 원래 결과를 반환하며 기존 preference를 덮어쓰지 않는다.
- **retention은 DB outbox first** — 사진 행 삭제와 `photoPurgedAt`, 삭제 의도를 한 transaction에 commit한 뒤 strict unlink한다. 성공 outbox만 지우고 실패는 `pendingFileSets`로 알리며 재호출·부팅·매일 04:30 drain으로 복구한다.
- **전체 삭제의 파일 성공 경계** — DB commit 뒤 사용자 사진 폴더 strict 삭제가 실패하면 200을 막는다. 재호출은 DB가 비어도 파일을 재시도하고, 폴더 성공 뒤 outbox를 비운다.
- **token guard + principal cache barrier** — A 요청의 늦은 401은 B session을 해제하지 않는다. 현재 session 401과 로그인/가입 전환은 query cancel/clear를 session 변경보다 먼저 수행한다.

## Gotchas [coverage: high — 24 sources]

- **검색은 페이지를 받은 뒤 하는 client filter가 아니다.** `q`, 날짜·slot·mealType·source를 server cursor 전에 적용한다. cursor는 `(eatenAt,id)`라 같은 시각 기록도 건너뛰지 않는다.
- **`late_night`는 자정을 넘는다.** preset 계산은 KST 자정 뒤를 다음 날 축으로 펼쳤다가 감는다. `eatenAt`은 UTC, 달력은 저장된 `eatenDate`를 쓴다.
- **사진 제한과 저장소가 여러 겹이다.** 기록당 5장, 사용자 3,000장, backup 별도 한도가 있다. 앱 대기 저장소(document)와 내려받기 cache(cache)는 수명·정리 규칙이 다르다.
- **웹의 사진 실패는 앱과 다르다.** native는 앱 소유 파일을 재시도하지만 web은 즉시 업로드하며 실패한 picker 파일을 다시 골라야 한다.
- **대기 사진은 저장·인식을 차단한다.** 관리 파일 copy가 실패해 원래 picker URI만 남은 사진은 현재 session에서만 쓸 수 있다. 앱은 관리 디렉터리의 직계 자식만 삭제한다.
- **사진 cache의 stale fallback은 제한적이다.** 같은 principal의 network/5xx에서만 허용한다. 401/403/404는 cache를 지우며, token이 바뀐 뒤 끝난 download는 채택하지 않는다.
- **재인식은 모든 현재 사진을 다시 본다.** `userEdited`와 manual/catalog/recommendation 항목은 보존하고 untouched recognition 항목만 교체하는 draft merge 규칙을 지켜야 한다.
- **알레르기 `unknown`을 `none_known`으로 표시하면 안 된다.** `inferred`의 빈 목록도 공개 재료에서 알려진 항목을 못 찾았다는 뜻뿐이다. 음식명은 배합 근거가 아니며 숨은 재료·미표기·교차접촉은 알 수 없다.
- **인식 prompt 버전 필터는 손상 데이터 제외용이다.** 정상적인 과거 model/version snapshot도 품질 비교에 포함하고, version별로 필터할 수 있다. top correction/unmatched는 서로 다른 사용자 2명 이상만 노출한다.
- **추천 event는 수정·삭제가 아니라 append다.** client는 `logged`를 보낼 수 없고 식단 저장이 만든다. 후보 rating은 누적 합이 아니라 후보별 최신값이 학습 신호다.
- **추천 cache hit는 quota를 쓰지 않는다.** `force=true`는 cache를 우회하므로 quota를 소비한다. quota `limit<=0`은 기능을 막는 값이 아니라 해당 quota 검사를 끄는 무제한 설정이다.
- **일일 quota만 SQLite 영속이다.** write barrier와 동일 추천 single-flight는 단일 프로세스 메모리라 다중 인스턴스 확장 시 분산 조정이 필요하다([in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)).
- **영양 합계와 평균에는 누락 편향이 있다.** `averageReliable`과 main/direct/estimated coverage 없이 kcal 숫자만 해석하지 않는다.
- **base64는 암호화가 아니다.** backup은 사진·메모·선호를 담은 민감한 평문 JSON 구조다. 파일을 안전한 위치에 보관하고 전체 body limit을 75MB 이상으로 넓히지 않는다.
- **복원 archive는 strict하다.** canonical base64, byteSize/hash, ref, 개수·문자열 한도 중 하나라도 어긋나면 전체 거부한다. 실패 뒤 임시 사진 행·파일도 정리한다.
- **retention과 전체 삭제는 다르다.** retention은 텍스트·항목을 남기고 `before` 이전 및 고아 사진만 지운다. `before`가 없으면 모든 사진이 대상이다. 전체 삭제는 import ledger와 quota까지 비운다.
- **retention 성공 응답에도 pending이 있을 수 있다.** DB 상태는 이미 정리됐고 outbox가 파일 삭제를 재시도한다. 낮은 attempts 순으로 제한 batch를 돌려 poison row 독점을 피한다.
- **사진을 다시 붙이면 purge 표시를 되돌린다.** nonempty `photoTokens` PATCH는 attach transaction에서 `photoPurgedAt=null`로 만든다.
- **전체 삭제는 부분 성공 오류를 낼 수 있다.** DB는 이미 commit됐지만 폴더 삭제 실패로 응답은 error다. 같은 요청을 다시 보내는 것이 복구 절차다.
- **meal query key는 user id namespace가 아니다.** 공식 bootstrap과 auth hook의 cancel/clear 및 request-token guard가 보안 계약의 일부다.

## Sources [coverage: high — 53 sources]

- [docs/PLAN-meal.md](../../docs/PLAN-meal.md)
- [packages/api-contract/src/schemas/meal.ts](../../packages/api-contract/src/schemas/meal.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Meal`
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — Meal/Food 모델
- [apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql](../../apps/friendly/prisma/migrations/20260822113321_add_meal_log/migration.sql)
- [apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql](../../apps/friendly/prisma/migrations/20260823000000_add_meal_item_nutrition/migration.sql)
- [apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql](../../apps/friendly/prisma/migrations/20260823160000_add_meal_recommendation_origin/migration.sql)
- [apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql](../../apps/friendly/prisma/migrations/20260823170000_add_meal_photo_user_fk/migration.sql)
- [apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql](../../apps/friendly/prisma/migrations/20260823180000_add_meal_disliked_foods/migration.sql)
- [apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql](../../apps/friendly/prisma/migrations/20260823190000_meal_safety_events_lineage/migration.sql)
- [apps/friendly/prisma/migrations/20260823210000_meal_backup_restore/migration.sql](../../apps/friendly/prisma/migrations/20260823210000_meal_backup_restore/migration.sql)
- [apps/friendly/prisma/migrations/20260823220000_meal_photo_deletion_outbox/migration.sql](../../apps/friendly/prisma/migrations/20260823220000_meal_photo_deletion_outbox/migration.sql)
- [apps/friendly/src/modules/meal/meal.route.ts](../../apps/friendly/src/modules/meal/meal.route.ts)
- [apps/friendly/src/modules/meal/meal.service.ts](../../apps/friendly/src/modules/meal/meal.service.ts)
- [apps/friendly/src/modules/meal/meal.service.test.ts](../../apps/friendly/src/modules/meal/meal.service.test.ts)
- [apps/friendly/src/modules/meal/meal-photo.service.ts](../../apps/friendly/src/modules/meal/meal-photo.service.ts)
- [apps/friendly/src/modules/meal/meal-photo-delete.test.ts](../../apps/friendly/src/modules/meal/meal-photo-delete.test.ts)
- [apps/friendly/src/modules/meal/meal-data.service.ts](../../apps/friendly/src/modules/meal/meal-data.service.ts)
- [apps/friendly/src/modules/meal/meal-data.route.test.ts](../../apps/friendly/src/modules/meal/meal-data.route.test.ts)
- [apps/friendly/src/modules/meal/meal-mutation-barrier.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.ts)
- [apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts](../../apps/friendly/src/modules/meal/meal-mutation-barrier.test.ts)
- [apps/friendly/src/modules/meal/meal-preference.service.ts](../../apps/friendly/src/modules/meal/meal-preference.service.ts)
- [apps/friendly/src/modules/meal/meal-preference.service.test.ts](../../apps/friendly/src/modules/meal/meal-preference.service.test.ts)
- [apps/friendly/src/modules/meal/meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) (+[test](../../apps/friendly/src/modules/meal/meal-daily-quota.service.test.ts))
- [apps/friendly/src/modules/meal/meal-stats.service.ts](../../apps/friendly/src/modules/meal/meal-stats.service.ts)
- [apps/friendly/src/modules/meal/meal-stats.service.test.ts](../../apps/friendly/src/modules/meal/meal-stats.service.test.ts)
- [apps/friendly/src/modules/meal/meal-stats.insights.ts](../../apps/friendly/src/modules/meal/meal-stats.insights.ts) (+[test](../../apps/friendly/src/modules/meal/meal-stats.insights.test.ts))
- [apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.route.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition-quota.test.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-quota.test.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition.prompts.ts) · [service test](../../apps/friendly/src/modules/meal-recognition/meal-recognition.service.test.ts)
- [apps/friendly/src/modules/meal-recognition/meal-recognition-eval.ts](../../apps/friendly/src/modules/meal-recognition/meal-recognition-eval.ts) (+[test](../../apps/friendly/src/modules/meal-recognition/meal-recognition-eval.test.ts))
- [apps/friendly/scripts/eval-meal-recognition.ts](../../apps/friendly/scripts/eval-meal-recognition.ts)
- [apps/friendly/scripts/probe-meal-e2e.ts](../../apps/friendly/scripts/probe-meal-e2e.ts)
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
- [apps/mobile/src/components/meal/MealEntryEditor.tsx](../../apps/mobile/src/components/meal/MealEntryEditor.tsx) · [MealItemRow.tsx](../../apps/mobile/src/components/meal/MealItemRow.tsx) · [MealEntryCard.tsx](../../apps/mobile/src/components/meal/MealEntryCard.tsx) · [MealPhotoGallery.tsx](../../apps/mobile/src/components/meal/MealPhotoGallery.tsx)
- [apps/mobile/src/components/meal/MealCalendarView.tsx](../../apps/mobile/src/components/meal/MealCalendarView.tsx) · [MealStatsView.tsx](../../apps/mobile/src/components/meal/MealStatsView.tsx) · [MealRecommendView.tsx](../../apps/mobile/src/components/meal/MealRecommendView.tsx) · [MealPreferenceView.tsx](../../apps/mobile/src/components/meal/MealPreferenceView.tsx)
- [apps/mobile/src/components/meal/MealDataManagementCard.tsx](../../apps/mobile/src/components/meal/MealDataManagementCard.tsx) · [MealReminderSettingsCard.tsx](../../apps/mobile/src/components/meal/MealReminderSettingsCard.tsx)
- [apps/mobile/src/lib/mealDraftPhotos.ts](../../apps/mobile/src/lib/mealDraftPhotos.ts) · [MealPendingPhotoThumb.tsx](../../apps/mobile/src/components/meal/MealPendingPhotoThumb.tsx)
- [apps/mobile/src/lib/mealPhotoCache.ts](../../apps/mobile/src/lib/mealPhotoCache.ts) · [useCachedMealPhoto.ts](../../apps/mobile/src/hooks/useCachedMealPhoto.ts)
- [apps/mobile/src/lib/mealReminders.ts](../../apps/mobile/src/lib/mealReminders.ts)
- [apps/mobile/src/components/home/TodayMealCard.tsx](../../apps/mobile/src/components/home/TodayMealCard.tsx) · [apps/mobile/app/_layout.tsx](../../apps/mobile/app/_layout.tsx)
- [packages/shared/src/api/client.ts](../../packages/shared/src/api/client.ts) (+[test](../../packages/shared/src/api/client.test.ts))
- [packages/shared/src/hooks/useAuth.ts](../../packages/shared/src/hooks/useAuth.ts) · [apps/web/src/main.tsx](../../apps/web/src/main.tsx)
- [apps/mobile/src/lib/api-setup.ts](../../apps/mobile/src/lib/api-setup.ts) · [queryClient.ts](../../apps/mobile/src/lib/queryClient.ts)
