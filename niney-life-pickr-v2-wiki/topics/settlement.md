---
topic: settlement
last_compiled: 2026-05-28
sources_count: 95
status: active
aliases: [정산, 정산하기, settlement, share-bill, receipt-split, 영수증 추출, 단골, contact, share token, edited badge, rounds, N차, settlement-draft, draft-autosave, multi-receipt, MultiReceiptSplitDialog, RoundDiscountEditor, RoundCategoryAdjuster, SettlementBreakdownTable, RoundExceptionsEditor, leftover-routing, roundUnit-100-1000, calculateMultiRoundShares, fromDraftId, EXTRACTION_VERSION, ExtractReceiptSplit, roundIndex, roundTotal, universal-links, app-links, deep-link, settlement-mobile, RestaurantSearchDialog, confirm-dialog, attendees-100, items-200]
---

# settlement — 정산하기 도메인

식당에서 일행이 영수증을 나눠 부담할 때 "주류 안 마신 사람은 술값 빼고" 같은 카테고리별 제외 규칙으로 자동 분배해 주는 도메인. 영수증 사진을 vision LLM 으로 OCR/분류하거나 직접 입력으로 만들고, 결과를 저장/공유/수정하며 정산에 자주 나오는 사람은 "단골" 로 자동 적립된다.

**2026-05-28 14차 컴파일 — 정산 도메인의 출생 이후 가장 큰 단일 재작성.** 차수(N차) 정산 + 서버 임시저장(draft auto-save) + 한 사진 N등분(multi-receipt split) + 모바일 정산 풀 구현 + Universal/App Links 딥링크 + UX 다듬기가 한꺼번에 들어왔다. 이전 1식당-1라운드 모델은 사라졌고, items 불변·`PATCH /:id/participants` 같은 옛 정책도 폐기됐다. 핵심 변경:

- **N차 정산** — 한 세션은 1~10 round, 각 round 는 자기 식당·source·items·attendees(부분집합)·할인·분담 보정을 가진다. 분배는 round 별로 계산해서 마스터 인덱스에 합산.
- **차수 할인 + 분담 다듬기** — round 단위 단일 카테고리 할인(쿠폰/멤버십)과 카테고리별 잔여 처리 규칙(leftover 받는 사람 + 100/1000원 단위 반올림).
- **정산표(breakdown matrix)** — 참여자 × (차수 × 카테고리) 매트릭스. 결과/공유 페이지의 핵심 시각화.
- **분할 영수증** — 한 사진에 영수증 N장 가로 배치 → 같은 imageToken 으로 index 만 다르게 N번 extract 호출. 서버가 sharp 로 X 축만 잘라 vision LLM 에 넘긴다.
- **서버 임시저장(SettlementDraft)** — `(userId, placeId)` unique upsert. debounce 5s(또는 3s) 자동 저장으로 다기기 동기화, 정산 완성 시 `fromDraftId` 로 트랜잭션 자동 삭제.
- **모바일 정산 풀 구현** — 4단계 wizard·결과·이력·단골·공유까지 expo-router 라우트로 모두 이식. Universal Links/App Links 로 공유 링크가 앱을 직접 연다.
- **PUT /:id 전체 replace** — items 불변·participants 만 PATCH 정책 폐기. UpdateSettlementInput = CreateSettlementInput.
- **참여자 100명·아이템 200개로 한도 확장** + RFC1918 사설 LAN origin 자동 CORS 허용(Expo Web 모바일 단말).

## Purpose [coverage: high — 9 sources]

`settlement` 은 로그인 사용자가 일행의 분담액을 계산·저장·공유·수정할 수 있게 한다. 한 세션은 1~10 차수로 구성되며 각 차수는 영수증 사진(vision LLM 추출) 또는 직접 입력으로 만들 수 있다. 차수마다 다른 식당·다른 참석자 부분집합·다른 할인을 가질 수 있다. 저장된 정산은 본인만 보지만, 공유 토큰을 발급하면 비로그인 사용자도 read-only 로 결과를 본다.

자동 적립되는 **단골(SettlementContact)** 은 같은 사람을 매번 다시 입력하지 않게 한다 — 정산 저장 시마다 (userId, normalizedKey) 기준 upsert 되어, 자동완성 드롭다운과 다중 선택 모달의 데이터원이 된다.

서버 임시저장 **(SettlementDraft)** 은 자동 저장으로 다기기 동기화 — 폰에서 입력 시작한 정산을 데스크톱에서 이어 입력. `(userId, placeId)` 키로 식당당 하나, 식당 미지정 슬롯(`/me/settlements/new`)은 sentinel `placeIdKey=''`.

의존자: `apps/web` 의 정산 라우트 + `apps/mobile` 의 expo-router 라우트가 직접 호출. `restaurant` 모듈을 `RestaurantService.getPublicDetail` 로 호출해 식당명 스냅샷·메뉴 힌트를 가져온다. `ai` 모듈의 vision LLM provider (purpose=`image`) 가 영수증 추출에 쓰인다. 공유 링크는 `well-known` 모듈이 발급하는 AASA/assetlinks.json 으로 검증돼 iOS/Android 앱이 직접 가로챈다.

## Architecture [coverage: high — 17 sources]

**Backend 모듈 4개 (`apps/friendly/src/modules/`)**:

- [`settlement-extraction/`](../../apps/friendly/src/modules/settlement-extraction/) — 영수증 이미지 업로드/저장 + vision LLM 호출 + 추출 결과 정규화
  - [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — `upload` / `extract` / `preview/:token` 3 엔드포인트. extract 가 `roundIndex/roundTotal/split` 까지 받는다.
  - [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) — `storeImage` (sharp 로 JPEG 정규화 + 1600px 다운스케일), `readImage`, `cropForSplit` (한 사진을 X 축 N등분), `extract` (vision LLM 호출 + 응답 파싱 + warning 산출)
  - [settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts) — `EXTRACTION_SYSTEM_PROMPT` + `EXTRACTION_JSON_SCHEMA` + `EXTRACTION_VERSION`. `buildExtractionUserPrompt` 가 roundHint 를 받아 "2차 영수증" 컨텍스트를 라인으로 추가.
- [`settlement/`](../../apps/friendly/src/modules/settlement/) — 정산 세션 CRUD + 공유 토큰 + 전체 replace
  - [settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts) — `create`/`list`/`one`/`update`(PUT)/`delete` + `share` POST/DELETE + `shared` GET(비인증). 이전 PATCH `/:id/participants` 는 폐기.
  - [settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) — `create`/`update` 가 transaction 안에서 마스터 participants + N round + N round × M attendees + items + categoryAdjustments 직렬화까지 전체 wipe/rebuild. `create` 는 `fromDraftId` 가 있으면 같은 트랜잭션에서 draft 도 삭제.
  - `normalizeContactKey(name, nickname)` — `lower(trim(name))+"|"+lower(trim(nickname))`. **single source of truth** — backfill 스크립트와 클라이언트(`Step1Participants`, `ContactPickerDialog`) 도 같은 정의.
- [`settlement/settlement-draft.{route,service}.ts`](../../apps/friendly/src/modules/settlement/) — 서버 임시저장
  - [settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts) — `GET /settlement-drafts` (list), `PUT /settlement-drafts` (upsert by body), `DELETE /settlement-drafts/:id`.
  - [settlement-draft.service.ts](../../apps/friendly/src/modules/settlement/settlement-draft.service.ts) — `(userId, placeIdKey)` upsert. payload 는 JSON 문자열로 통과만 (서버 검증 없음, 클라 진화 유연성). `static deleteByIdInTxIfOwner` 가 settlement.create 트랜잭션 안에서 호출됨.
- [`contact/`](../../apps/friendly/src/modules/contact/) — 사용자별 단골 list/update/delete (생성은 settlement 모듈 upsert)
- [`well-known/well-known.route.ts`](../../apps/friendly/src/modules/well-known/well-known.route.ts) — `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 동적 응답 (env 미설정 시 404).

기타:
- [plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — 5MB / 1 file limit
- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — dev 에서 RFC1918 사설 IP origin 자동 허용 (Expo Web 모바일 단말 대응)
- [scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)

**API Contract (`packages/api-contract/src/`)**:
- [schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 마스터 `SettlementParticipant`, `SettlementRound`(차수), `SettlementRoundAttendee`(차수 attendance), `SettlementCategoryAdjustment(s)` (분담 다듬기), `CreateSettlementInput` (rounds + participants + optional fromDraftId), `UpdateSettlementInput = CreateSettlementInput`. round.items.max(200), participants/attendees.max(100), rounds.max(10).
- [schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — `ReceiptItemCategory` 4-state, `ExtractReceiptSplit` (count 2..5, index 1..count), `ExtractReceiptInput` 에 `roundIndex/roundTotal/split` 옵션 필드.
- [schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) — `SettlementDraft`, `UpsertSettlementDraftInput` (payload `z.unknown()` + 200KB JSON 크기 refine), `ListSettlementDraftsResult`.
- [schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateShares` (할인 + categoryAdjustments 옵션 추가) + 신규 `calculateMultiRoundShares` (라운드별 호출 + 마스터 인덱스 합산) + `effectiveExcludes` (master + round override merge).
- [routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Settlement.update(id)` PUT 추가, `Routes.SettlementDraft` namespace 추가.
- [index.ts](../../packages/api-contract/src/index.ts) — 모든 신규 스키마 re-export.

**FE Shared (`packages/shared/src/`)**:
- API 래퍼 — [settlement.api.ts](../../packages/shared/src/api/settlement.api.ts), [settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts), [settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts), [settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts) (NEW)
- React Query 훅 — [useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts), [useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts), [useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts), [useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts) (NEW) — `useListSettlementDrafts`, `useUpsertSettlementDraft`, `useDeleteSettlementDraft`, `useSettlementDraftHydrate` (진입 시 한 번 hydrate), `useSettlementDraftAutoSync` (debounce 자동 저장).
- Zustand 스토어 — [settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — N차 모델로 전면 재구성. `version: 4`, v1→v4 migration 포함. `setSettlementDraftStorage(storage)` 로 RN AsyncStorage 어댑터 주입 가능 (미주입 시 브라우저 sessionStorage 자동 선택). 차수 추가/삭제, attendance 동기화, 영수증 주입, 할인/카테고리 보정 액션 모두 포함.

**Web Routes (`apps/web/src/routes/settlement/`)** — App.tsx 에 등록:
- `/restaurants/:placeId/settle/new` → [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx) — 4단계 stepper. Step2Source 폐기, Step2Rounds 로 직행.
  - [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx) — 참여자 단일 필드 + alias 토글 + Enter 추가 + 기본 제외 토글(localStorage). 자동완성 + 단골 모달.
  - [Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx) — 차수 N개 입력. 각 round 의 식당 선택, MANUAL/RECEIPT 분기, 영수증 업로드, 다중 영수증 분할 다이얼로그, 참석자 선택, 할인, 카테고리 보정.
  - [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx) — 차수별 항목 편집 + 영수증 미리보기 + warning.
  - [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx) — 분담 미리보기(클라이언트 `calculateMultiRoundShares`) + 정산표 + 저장.
- `/restaurants/:placeId/settle/:id` → [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx) — 결과 보기 + 공유/삭제/수정. 차수별 카드 + 영수증 썸네일 + 정산표. 헤더 z-30.
- `/me/settlements` → [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx) — 행별 삭제 + 다중 선택 일괄 삭제 + "이어 입력"(draft) 행.
- `/me/contacts` → [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- `/share/settlements/:token` → [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx) — 비인증 read-only. 차수별 카드 + 정산표. z-30.

**다이얼로그/카드 (web)** — [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx), [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx), [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx), [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx), [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx), [RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx) (NEW — 2차 식당 검색), [MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx) (NEW), [RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx) (NEW), [RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx) (NEW), [RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx) (NEW), [SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx) (NEW), [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx), 공용 [confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx) (NEW). [settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts) (NEW, localStorage) — Step1 기본 제외 토글 등 사용자 선호.

**Mobile (`apps/mobile/`)** — expo-router 라우트로 정산 도메인 전체 이식:
- `/restaurant/[placeId]/settle/new` → [restaurant/[placeId]/settle/new.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/new.tsx) — 4단계 wizard 진입
- `/restaurant/[placeId]/settle/[id]/index` → […/[id]/index.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/index.tsx)
- `/restaurant/[placeId]/settle/[id]/edit` → […/[id]/edit.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/edit.tsx)
- `/settlement/new` → [settlement/new.tsx](../../apps/mobile/app/settlement/new.tsx) (placeless)
- `/settlement/history` → [settlement/history.tsx](../../apps/mobile/app/settlement/history.tsx)
- `/settlement/contacts` → [settlement/contacts.tsx](../../apps/mobile/app/settlement/contacts.tsx)
- `/share/settlements/[token]` → [share/settlements/[token].tsx](../../apps/mobile/app/share/settlements/[token].tsx) — 딥링크가 직접 연다.
- 컴포넌트는 [apps/mobile/src/components/settlement/](../../apps/mobile/src/components/settlement/) 디렉터리: [SettlementWizard.tsx](../../apps/mobile/src/components/settlement/SettlementWizard.tsx), Step1~4, ContactPickerSheet, ContactSuggestions, MenuPickerSheet, RestaurantPickerSheet, MultiReceiptSplitSheet, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor, SettlementBreakdownTable, SettlementShareSheet.
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts) — RN 전용 선호 (AsyncStorage).
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts) — `ios.associatedDomains: ["applinks:${WEB_HOST}"]` + `android.intentFilters` autoVerify:true / pathPrefix `/share/settlements`. 보조용 커스텀 scheme `lifepickr://` 유지.
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md) — Universal/App Links 설정 가이드 (env, fingerprint 등록).

## Talks To [coverage: medium — 5 sources]

- **`ai` 모듈 (vision LLM)** — `settlement-extraction.service.ts` 가 `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision provider 를 해결하고, `adapterCache` 에 등록된 `LLMProvider.complete` 를 호출. `format=EXTRACTION_JSON_SCHEMA` 로 토큰 샘플링 단계부터 JSON 모양 강제. `VISION_TIMEOUT_MS=60_000` 별도 타임아웃, `AbortController` 시그널.
- **`restaurant` 모듈** — `RestaurantService.getPublicDetail(placeId)` 를 (1) `settlement-extraction.route.ts` 가 식당명 + 메뉴 이름을 LLM 프롬프트 힌트로 주입, (2) `settlement.service.ts` 가 모든 round 의 식당명 snapshot 으로 `restaurantName` 컬럼에 박는다. update 에선 기존에 가지고 있던 placeId 의 이름은 재사용하고 새로 추가된 placeId 만 fresh 조회 — 식당이 나중에 삭제돼도 차수 편집은 통과.
- **`summary` 모듈** — `extractFirstJsonObject` 유틸을 LLM 응답에서 첫 JSON 블록만 잘라낼 때 재사용.
- **`well-known` 모듈** — 정산 도메인의 외부 통신은 아니지만, 공유 링크 딥링크를 가능하게 만드는 동반 모듈. iOS/Android 가 시스템 단에서 `/.well-known/{apple-app-site-association,assetlinks.json}` 을 fetch 해 앱이 `/share/settlements/*` 를 가로채는 권한을 검증.
- **인증** — 모든 라우트 `app.authenticate` JWT onRequest. 예외: **`Routes.Settlement.shared(:token)` 만 비인증** — 토큰을 안다 = 접근 허용. 응답에서 `userId` 와 round 별 `receiptPreviewUrl` 가 빠진다. `well-known` 두 엔드포인트도 비인증(시스템이 호출).

## API Surface [coverage: high — 8 sources]

| Method | Path | Auth | Body / Params | 응답 (200) |
|---|---|---|---|---|
| POST | `/api/v1/settlement-extraction/upload` | JWT | `multipart/form-data` — file 1개, ≤5MB | `UploadReceiptResult` `{ imageToken, previewUrl, byteSize }` |
| POST | `/api/v1/settlement-extraction/extract` | JWT | `ExtractReceiptInput` `{ imageToken, placeId, roundIndex?, roundTotal?, split? }` | `ExtractReceiptResult` `{ items[], totalAmount, itemsSubtotal, warning, model }` |
| GET | `/api/v1/settlement-extraction/preview/:token` | JWT | UUID v4 정규식 | `image/jpeg`, `Cache-Control: private, max-age=3600` |
| POST | `/api/v1/settlements` | JWT | `CreateSettlementInput` `{ rounds[1..10], participants[1..100], fromDraftId? }` | `SettlementSession` (rounds+items+attendees+participants) |
| GET | `/api/v1/settlements?placeId=&offset=&limit=` | JWT | `ListSettlementsQuery` | `ListSettlementsResult` (summary 에 `roundCount/itemCount` 포함, `grandTotal` 대표) |
| GET | `/api/v1/settlements/:id` | JWT | — | `SettlementSession` (소유자만, 비소유자 403) |
| **PUT** | `/api/v1/settlements/:id` | JWT | `UpdateSettlementInput = CreateSettlementInput` (전체 replace) | `SettlementSession` (서버 재계산 + `editedAt` 갱신) |
| DELETE | `/api/v1/settlements/:id` | JWT | — | 204 |
| POST | `/api/v1/settlements/:id/share` | JWT | — | `SettlementShare` `{ token, shareUrl }` (멱등) |
| DELETE | `/api/v1/settlements/:id/share` | JWT | — | 204 |
| GET | `/api/v1/share/settlements/:token` | **none** | base64url 20~64자 | `SharedSettlementSession` (userId/receiptPreviewUrl 제거) |
| **GET** | `/api/v1/settlement-drafts` | JWT | — | `ListSettlementDraftsResult` `{ items[] }` |
| **PUT** | `/api/v1/settlement-drafts` | JWT | `UpsertSettlementDraftInput` `{ placeId, placeNameHint?, payload }` | `SettlementDraft` |
| **DELETE** | `/api/v1/settlement-drafts/:id` | JWT | — | 204 |
| GET | `/api/v1/me/contacts?q=&take=` | JWT | `ListContactsQuery` | `ListContactsResult` |
| PATCH | `/api/v1/me/contacts/:id` | JWT | `UpdateContactInput` | `SettlementContact` (충돌 409) |
| DELETE | `/api/v1/me/contacts/:id` | JWT | — | 204 (`participant.contactId` SetNull) |
| **GET** | `/.well-known/apple-app-site-association` | none | — | JSON (env 미설정 시 404) |
| **GET** | `/.well-known/assetlinks.json` | none | — | JSON array (env 미설정 시 404) |

폐기: `PATCH /api/v1/settlements/:id/participants` — `PUT /:id` 가 대체. items 불변 정책도 동시에 폐기 (items/round 까지 모두 한 번에 교체).

에러 매핑 (`throwAsHttp`):
- `settlement-extraction`: `invalid_image`/`invalid_token` → 400, `image_not_found`/`restaurant_not_found` → 404, `no_provider` → 503, `llm_failed` → 502
- `settlement`: `not_found`/`restaurant_not_found` → 404, `forbidden` → 403, `invalid_participant`/`invalid_round`/`invalid_receipt_token` → 400
- `settlement-draft`: `not_found` → 404, `forbidden` → 403, 그 외 → 400
- `contact`: `not_found`/`forbidden`/`conflict` → 404/403/409, `invalid_input` → 400

## Data [coverage: high — 13 sources]

**Prisma 모델 6개** (전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma)):

- **`SettlementSession`** (`settlement_sessions`) — `userId`, `restaurantPlaceId`/`restaurantName` (1차 식당 스냅샷, `rounds[0]` 과 항상 동기화), `grandTotal` (모든 round.itemsSubtotal 합), `shareToken? @unique`, `editedAt?`, `createdAt`, `updatedAt`. **차수 단위 필드(source/totalAmount/warning/receiptImageToken/itemsSubtotal) 는 round 로 이동**. user `onDelete: Cascade`.
- **`SettlementRound`** (`settlement_rounds`, NEW) — `sessionId`, `orderIndex`, `restaurantPlaceId`/`restaurantName` (차수 식당 스냅샷), `source`('MANUAL'|'RECEIPT'), `totalAmount?`, `warning?`, `receiptImageToken?`, `itemsSubtotal` (= items.amount 합 - discountAmount), `discountAmount?`, `discountCategory?`, `categoryAdjustments?` (JSON 문자열). session `onDelete: Cascade`. 인덱스 `(sessionId)`.
- **`SettlementItem`** (`settlement_items`) — **`sessionId` → `roundId` 로 이동**. `name`, `unitPrice?`, `quantity?`, `amount`, `category`, `matchedMenuName?`, `orderIndex`. round `onDelete: Cascade`.
- **`SettlementParticipant`** (`settlement_participants`) — 마스터 명단. `sessionId`, `name?`, `nickname?`, `excludeAlcohol/NonAlcohol/Side` (default — round override 가 없을 때 사용), `shareAmount` (모든 round 합 — grand total per person), `orderIndex`, `contactId?`. contact `onDelete: SetNull`.
- **`SettlementRoundParticipant`** (`settlement_round_participants`, NEW) — round × 마스터 참여자 join. `roundId`, `participantId`, `attended` (default true), `excludeAlcoholOverride?`/`NonAlcohol`/`Side` (null = 마스터 default 사용), `shareAmount` (이 차수에서의 분담, 비참석이면 0). 유니크 `(roundId, participantId)`. 양쪽 모두 Cascade.
- **`SettlementContact`** (`settlement_contacts`) — 변동 없음. 유니크 `(userId, normalizedKey)`.
- **`SettlementDraft`** (`settlement_drafts`, NEW) — 서버 임시저장. `userId`, `placeIdKey` (NULL 대신 `''` sentinel — SQLite multi-NULL unique 회피), `payload` (JSON 문자열), `placeNameHint?`, `createdAt`, `updatedAt`. 유니크 `(userId, placeIdKey)`, 인덱스 `(userId, updatedAt)`. user `onDelete: Cascade`.

**영수증 파일** — `apps/friendly/data/receipts/<token>.jpg`. 토큰 `randomUUID()`. sharp 가 EXIF rotate + ≤1600px + JPEG 80 + mozjpeg. 분할 입력일 땐 `cropForSplit` 가 X 축 N등분 후 vision LLM 호출.

**`normalizedKey` 정책** — `lower(trim(name))+"|"+lower(trim(nickname))`. server export `normalizeContactKey` 가 single source of truth — backfill 스크립트, `Step1Participants`, `ContactPickerDialog` 4 곳에 같은 정의 복사.

**`shareToken`** — 32바이트 `randomBytes` → `base64url` 43자. unique 인덱스. 회수 = `null` 업데이트, 재발급 = 새 randomBytes (이전 토큰 영구 무효).

**`editedAt`** — participants/rounds/items 의 통합 update(PUT) 시에만 갱신. `updatedAt` 은 share token 발급/회수에서도 자동 bump 되어 부적합.

**`categoryAdjustments` 직렬화** — settlement.service 의 `serializeCategoryAdjustments` 가 입력 clientId 를 db id 로 치환해 `{ [Category]: { leftoverParticipantId, roundUnit } }` JSON 문자열로. 매칭 안 되는 clientId 의 카테고리는 default 로 떨어트림 (조용히 drop).

**Zustand persist 스토어** ([settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)) — `settlement-draft-v1` 키. **storage 어댑터 주입**: 모듈 로드 시점엔 플랫폼 미상이라 lazy resolver 사용. 앱은 entry 에서 `setSettlementDraftStorage(AsyncStorage)` 주입, 웹은 `window.sessionStorage` 자동 선택, SSR/테스트는 no-op. **version: 4** 까지의 migration:
- v1 → v2 : 평면 draft(한 식당 1 round) → rounds 배열 (1차 round 1개로 변환). placeId 없으면 비움.
- v2 → v3 : `discountAmount/discountCategory` 추가 (null).
- v3 → v4 : `categoryAdjustments` 추가 (null).

**서버 임시저장 vs 클라이언트 persist** — store 의 sessionStorage(웹) 또는 AsyncStorage(앱) 가 즉시 반영용, `SettlementDraft` 테이블이 다기기 동기화용. `useSettlementDraftHydrate(placeId)` 가 진입 시 한 번 list 조회해 store 에 overwrite. `useSettlementDraftAutoSync` 가 store subscribe 후 debounce 자동 upsert.

**Migrations 8개** (시간순):
1. [`20260523012752_add_settlement_models`](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
2. [`20260523030833_add_settlement_share_token`](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
3. [`20260524000000_add_settlement_contacts`](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
4. [`20260524112443_add_settlement_edited_at`](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)
5. [`20260525100000_add_settlement_rounds`](../../apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql) — `SettlementRound` + `SettlementRoundParticipant` 신설, `items.sessionId → roundId` 이동, session 컬럼 정리(grandTotal 추가). backfill 규약: round.id = session.id, 모든 참여자 attended=true.
6. [`20260525110000_add_settlement_round_discount`](../../apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql) — round 에 `discountAmount/discountCategory` 추가.
7. [`20260525220309_add_settlement_round_category_adjustments`](../../apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql) — round 에 `categoryAdjustments` 추가.
8. [`20260525235559_add_settlement_drafts`](../../apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql) — `SettlementDraft` 신설 + 유니크/인덱스.

## Key Decisions [coverage: high — 18 sources]

시간순 진화 (MVP → 공유 → 단골 → 편집+배지 → **N차/할인/분담다듬기/임시저장/모바일/딥링크/UX**):

**MVP 진입 (2026-05-23)** — 카테고리별 풀 + 제외 플래그 분배 알고리즘, 영수증 vision 추출, 서버 권위 + 클라 미리보기, 토큰 server 발급 + 정규식 검증, 멱등 shareToken, shared 응답에서 userId/receiptPreviewUrl 제거.

**단골 자동 적립 (2026-05-24)** — `(userId, normalizedKey)` upsert + 클라 contactId 힌트 미신뢰, 삭제 SetNull, backfill 멱등.

**편집 + "수정됨" 배지 (2026-05-24)** — `editedAt` 분리, items 불변 + participants 만 PATCH (이번 컴파일에 폐기됨).

**차수(N차) 정산 도입 (2026-05-25, 14차 컴파일 핵심)**
- **세션 vs 차수 분리** — session 본체는 사용자/식당-1차-스냅샷/grandTotal/shareToken/editedAt 만, 차수 단위 정보(source/totalAmount/warning/영수증/items/attendees)는 모두 `SettlementRound` 로. backfill 은 session 1개 = round 1개로 자동 변환, round.id = session.id 규약으로 items 의 roundId 재매핑이 단순.
- **마스터 vs 차수 attendance 이중 구조** — 마스터 `SettlementParticipant.excludeXxx` 는 default, `SettlementRoundParticipant.excludeXxxOverride` 가 null 이면 default 사용, true/false 면 round 단위 override. `effectiveExcludes(master, override)` 헬퍼가 merge — 계산기와 service 둘 다 사용.
- **clientId ↔ db id 매핑** — 입력 시점엔 마스터 cuid 가 아직 없어 클라이언트가 `participantClientId` 부여, round.attendees 는 그 키로 마스터 참조. 서버가 트랜잭션 안에서 cuid 부여 후 매핑 폐기. categoryAdjustments 의 `leftoverParticipantClientId` 도 같은 매핑으로 db id 치환.
- **계산기 분기** — `calculateMultiRoundShares` 가 round 별로 참석자 부분집합만으로 `calculateShares` 호출, 마스터 인덱스 단위로 share 부풀려 합산. `perRound[].shareAmounts` 와 `perCategoryShares` 둘 다 마스터 인덱스 단위로 반환. PerRound 결과는 결과 페이지의 "차수별 카드" 와 정산표 매트릭스가 모두 사용.
- **참여자 100명 / items 200개 한도** — 회사 회식·동호회 규모까지 안전 커버. 계산기는 선형 비용이라 100 × 200 = 20k 곱셈도 ms 이하.

**차수 할인 (round discount)**
- **단일 카테고리 단일 라인** — `discountAmount` (양수) + `discountCategory` (enum) 페어. 양쪽 다 null 이거나 둘 다 set. zod refine 두 개 — (1) 페어 일관성, (2) `pool >= discountAmount` (해당 카테고리 풀이 음수가 되지 않도록).
- **calculator 자연 반영** — `Math.max(0, rawPool - discount.amount)` 클램프(스키마가 막아도 안전망). UI 상 정산표는 풀 컬럼이 줄어들고, 항목 카드는 '할인 -X' 줄.

**분담 다듬기 (refinement)**
- **leftover 받는 사람** — 카테고리별 `leftoverParticipantId`. 풀이 인원수로 나눠 떨어지지 않을 때 잔여 1~(n-1)원을 누가 흡수할지. 지정 안 하면 첫 활성자.
- **roundUnit (100/1000원 단위 반올림)** — null|100|1000. 양수면 풀을 그 단위로 round 한 뒤 균등 분배. 단 round 한 풀이 인원수로 나눠 떨어져야 함 — 안 떨어지면 calculator 가 안전망으로 무시 + 잔여 가산 모드로 fallback. UI 가 활성 조건 검사 + 서비스 검증.
- **마스터→참석자 인덱스 변환** — categoryAdjustments 입력은 마스터 clientId 단위인데 calculator 는 참석자 배열 인덱스만 안다. `calculateMultiRoundShares` 가 `masterToAttendee` Map 으로 변환 — 마스터 참여자가 그 차수에 참석하지 않으면 -1 로 두고 calculateShares 가 첫 활성자로 fallback.

**분할 영수증 (multi-receipt split) — 한 사진 좌→우 N등분**
- **`ExtractReceiptSplit`** — `count: 2..5`, `index: 1..count` (1-based, 왼쪽=1), `index <= count` refine.
- **같은 imageToken N번 사용** — 클라이언트가 N번 extract 호출, index 만 다르게. 서버 `cropForSplit` 가 `floor(totalWidth / count) * (index-1)` 부터 자르고 마지막 슬롯은 남은 픽셀 모두 흡수해 누락 없게. 메타데이터 비면 잘라내지 않고 원본 그대로.
- **roundIndex/roundTotal 프롬프트 힌트** — 두 값 모두 있고 `index<=total` 이면 user prompt 에 "2차 영수증" 컨텍스트 라인 추가. LLM 이 영수증 본문에 그 컨텍스트를 반영하지는 못해도 무관 — 사용자 의도 명시용.

**서버 임시저장 (SettlementDraft) — 다기기 동기화**
- **payload 자유형** — z.unknown() + 200KB JSON 크기 refine 만. 서버는 형태 검증 안 함 (클라 store 진화 유연성). 응답에서 다시 JSON parse 해서 unknown 으로 노출.
- **`(userId, placeId)` upsert** — PUT 요청 body 의 placeId 로 server 가 매칭. id 를 클라가 모르고도 호출 가능. `placeId=null` (식당 미지정) 슬롯은 DB 의 `placeIdKey=''` sentinel — SQLite 의 NULL unique 가 다중 NULL 을 허용하기 때문.
- **debounce 자동 저장** — `useSettlementDraftAutoSync` 가 store subscribe 후 default 3s (호출자 5s 도 가능) debounce 로 upsert. 마운트 시점에 baseline snapshot 을 잡아 실제 편집이 있을 때만 저장 (마운트 직후 spurious save 방지).
- **정산 저장 시 draft 자동 삭제** — `CreateSettlementInput.fromDraftId` 가 들어오면 `SettlementService.create` 트랜잭션 안에서 `SettlementDraftService.deleteByIdInTxIfOwner` 호출. 본인 소유 아니거나 없는 id 면 조용히 무시(저장 자체는 성공).
- **이력 페이지 "이어 입력" 행** — `placeNameHint` 캐시로 매번 payload parse 없이 식당 이름 라벨 표시.

**통합 update (전체 replace)**
- **PUT /:id 가 PATCH /:id/participants 대체** — items/rounds/attendees/participants 모두 한 번에 교체. items 불변 정책 폐기 — N차 모델에서 차수 추가/삭제·attendance 변경 등이 빈번해 부분 엔드포인트로 다루기 복잡.
- **트랜잭션 wipe + rebuild** — 자식 모두 deleteMany 후 다시 create. SettlementContact `useCount` 가 다시 증가하는 부작용은 create 와 동일 정책(매 수정 = 사용).
- **update 의 식당명 캐시** — 기존 round 의 placeId 는 이름 재사용, 새로 추가된 placeId 만 fresh 조회. 식당이 나중에 삭제돼도 기존 차수 편집은 통과(테스트도 시드 없이 update 가능).

**모바일 정산 풀 구현**
- **expo-router 라우트 미러링** — 웹의 5개 정산 라우트를 같은 의미로 모바일에도. `[placeId]` 가 디렉터리로 승격되어 `restaurant/[placeId]/index.tsx` + `restaurant/[placeId]/settle/...` 가 한 번에 가능.
- **bottom-sheet 변종** — 웹 다이얼로그(ContactPickerDialog, MenuPickerDialog, RestaurantSearchDialog, MultiReceiptSplitDialog, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor) 의 모바일 대응은 `…Sheet.tsx` 로 별도 카피. RN 의 키보드 + 스크롤 + safe area 처리가 달라 dialog 패턴 그대로 못 옮긴다.
- **storage 어댑터 주입** — `setSettlementDraftStorage(AsyncStorage)` 를 mobile entry 에서 호출. 호출 안 하면 sessionStorage 가 없는 RN 환경에서 no-op 폴백으로 메모리만 유지.

**Universal Links / App Links (deep link)**
- **공유 토큰 URL = 앱 진입점** — `https://${WEB_HOST}/share/settlements/<token>` 한 URL 로 iOS Universal Links + Android App Links + 웹 SPA fallback 셋 다 처리. 앱 설치되어 있으면 시스템이 검증 후 가로채 expo-router 가 `[token].tsx` 로 라우팅, 미설치면 같은 URL 이 웹 `SharedSettlementPage` 로.
- **AASA/assetlinks 동적 응답** — 정적 파일 대신 fastify 라우트로. env 미설정 시 404 (잘못된 빈 JSON 로 검증 실패하는 사고 회피), `Cache-Control: public, max-age=300` (env 바꾸면 빨리 반영).
- **Android autoVerify:true + sha256 fingerprints** — `ANDROID_SHA256_FINGERPRINTS` 콤마 분리 env 로 dev/release 둘 다 지원. 실패 시 사용자에게 "어떤 앱?" 디스앰비규에이터가 떠 좋지 않으니 prod fingerprint 정확히 박아야 한다.
- **scheme `lifepickr://` 보조 유지** — push 콜백·OAuth 등에서 사용 가능. 메인은 https Universal Links.

**UX 다듬기**
- **Step2Source 폐기, Step2Rounds 직행** — N차 모델에선 입력 방식 분기가 round 단위라 별도 step 불필요. 한 step 안에서 차수 카드를 늘리며 source 도 같이 정함.
- **Step1 단일 필드 + alias 토글** — name + nickname 두 칸 → 단일 입력 + "별명도 따로" 토글. Enter 로 새 행 추가 + focus 이동. 새 행 기본 제외 토글은 localStorage(`settlementPrefsStore`) 에 저장.
- **공용 confirm-dialog** — `apps/web/src/components/ui/confirm-dialog.tsx` 가 inline `confirm()` 호출들을 대체.
- **결과/공유 페이지 z-30** — 데스크톱 2-col 레이아웃의 sticky 정산표 헤더와 상단 헤더가 겹치는 문제. z-10 → z-30.
- **이력 페이지 — 행별 trash + 다중 선택 일괄 삭제 + 이어 입력 행** — draft 들이 history list 위에 노출.
- **Tailwind v4 dark variant fix** — `.dark` 클래스 토글이 children 에 안 적용되는 v4 동작 변경 — `@custom-variant dark` 정의로 우회.

**기타 환경**
- **RFC1918 사설 IP CORS 자동 허용 (dev)** — `cors.ts` 의 `PRIVATE_LAN_ORIGIN` 정규식이 localhost/127.0.0.1/10.x/192.168.x/172.16-31.x 매칭. Expo Web 을 폰에서 LAN IP 로 볼 때 friendly API 도 같은 LAN IP 로 호출되므로 .env 에 매번 IP 안 박아도 통과.
- **AI keys 모델 미리보기** — `GET /admin/ai/providers/:id/:purpose/models/preview` 가 폼에 입력한 키(아직 저장 안 됨)로 model list 를 받아옴. 신규 등록 시 키 검증 + 모델 선택을 한 번에.

## Gotchas [coverage: high — 10 sources]

- **차수 attendee 의 마스터→인덱스 변환** — 입력 시 `participantClientId` 기준, 저장 시 db id, 계산기는 참석자 배열 인덱스. 두 번의 변환 — clientIdToDbId(serialize)와 masterToAttendee(calculator) 모두 같이 동작해야 함. categoryAdjustments 의 `leftoverParticipantClientId` 가 그 차수에 참석 안 한 마스터를 가리키면 calculator 가 -1 → 첫 활성자 fallback. zod 가 아니라 service/calculator 가 정합성을 떠받친다.
- **`roundUnit` 안전망** — UI 가 활성 조건(`rounded % activeCount === 0`)을 검사하고 서버 zod 도 refine 으로 막지만, calculator 는 그래도 안전망으로 무시(잔여 가산 모드) 한다. 안 떨어지는 값이 들어와도 calculator 가 crash 하지 않음.
- **할인 페어 일관성** — `discountAmount` 와 `discountCategory` 는 양쪽 null 또는 양쪽 set. 한쪽만 들어오면 zod refine 이 거부. 풀 음수도 refine 가 거부 — calculator 의 `Math.max(0, …)` 클램프는 안전망.
- **영수증 토큰 디스크 검증 + IMAGE_TOKEN_PATTERN 두 곳 복사** — `settlement.service.IMAGE_TOKEN_PATTERN` 과 `settlement-extraction.service.IMAGE_TOKEN_PATTERN` 가 동일 정규식을 따로 둔다(모듈 결합도 축소). 패턴 변경 시 두 곳 모두 손대야 한다.
- **`normalizedKey` 정의 4곳 복사** — server `normalizeContactKey` 가 single source of truth지만 클라이언트 두 파일과 backfill 스크립트가 정의 복사. 바꾸려면 4 곳 동시에.
- **shareToken 재발급 시 새 토큰 (이전 영구 무효)** — 회수→재생성 직후 같은 호출이라도 새 randomBytes. `settlement.route.test.ts` 의 "재발급 후 이전 토큰은 무효" 시나리오로 검증. UX 측에서 confirm 메시지로 사용자에게 명시.
- **`editedAt` 과 `updatedAt` 분리** — `@updatedAt` 은 share token 발급/회수에도 자동 bump 되어 "수정됨" 배지에 부적합. `editedAt` 은 PUT update 시에만 채움. 코드/마이그레이션 두 곳에 주석.
- **draft payload 자유형 → 형 검증 책임은 클라** — 서버는 z.unknown() + 200KB 크기만 본다. 클라가 깨진 payload 를 보내면 hydrate 단계에서 `Array.isArray(p.participants)` 등 type guard 로 방어. 안 그러면 store 가 깨진 데이터로 mount 됨.
- **`?? null` 폴백 제거 사례** — store `setRoundReceipt` 에서 `totalAmount/warning` 을 명시 `?? null` 로 클리어. 이전 영수증의 warning 이 새 영수증에 잘못 잔존하는 회귀 회피.
- **storage 어댑터 주입 미흡 = no-op 폴백** — RN entry 에서 `setSettlementDraftStorage(AsyncStorage)` 호출 누락하면 모듈은 NO_OP_STORAGE 로 동작 → persist 가 메모리만, 앱 재실행 시 draft 손실. SSR/테스트엔 의도된 동작이지만 RN prod 에선 사고.
- **Vision LLM 타임아웃 별도** — `VISION_TIMEOUT_MS=60_000`. chat 모델보다 vision 호출이 느려서 — `AbortController` 시그널을 `provider.complete({ signal })` 에 명시 묶음.
- **Preview 라우트 JWT 필요 → `<img src>` 직접 호출 불가** — 같은 origin 이라도 Authorization 헤더가 필요해 `Step3Edit` 등이 `fetch` → `Blob` → `URL.createObjectURL` 패턴. unmount 시 `revokeObjectURL`.
- **`SharedSettlementSession` 은 SettlementSession 의 omit + receiptPreviewUrl 빠진 round 배열** — `SettlementCards` 가 두 type 을 구조적 subtyping 으로 같이 받으므로 카드 안에서 의도적으로 `userId`/`receiptPreviewUrl` 을 안 본다.
- **`split.count` 가 1 이면 cropForSplit 가 no-op** — 클라가 잘못 count=1 로 보내도 안전. metadata 비면 잘라내지 않음(원본 LLM 전달).
- **AASA/assetlinks 미설정 시 404, 잘못된 JSON 보다 안전** — env 빠진 채 200 빈 JSON 응답하면 iOS/Android 검증이 통과해 버려 앱이 잘못된 권한을 얻을 수 있음 → 의도적으로 404. dev/staging 에서 의도하지 않게 매칭되는 사고 방지.

## Sources [coverage: high — 95 sources]

**Backend — settlement-extraction 모듈**
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.test.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.test.ts)

**Backend — settlement 모듈**
- [apps/friendly/src/modules/settlement/settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)
- [apps/friendly/src/modules/settlement/settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts)
- [apps/friendly/src/modules/settlement/settlement.calculator.test.ts](../../apps/friendly/src/modules/settlement/settlement.calculator.test.ts)
- [apps/friendly/src/modules/settlement/settlement.route.test.ts](../../apps/friendly/src/modules/settlement/settlement.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.service.ts](../../apps/friendly/src/modules/settlement/settlement-draft.service.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.test.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.test.ts)

**Backend — contact 모듈**
- [apps/friendly/src/modules/contact/contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)
- [apps/friendly/src/modules/contact/contact.service.ts](../../apps/friendly/src/modules/contact/contact.service.ts)
- [apps/friendly/src/modules/contact/contact.route.test.ts](../../apps/friendly/src/modules/contact/contact.route.test.ts)

**Backend — well-known 모듈**
- [apps/friendly/src/modules/well-known/well-known.route.ts](../../apps/friendly/src/modules/well-known/well-known.route.ts)

**Backend — infra/scripts/plugins**
- [apps/friendly/scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts)
- [apps/friendly/src/plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
- [apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
- [apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
- [apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)
- [apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql](../../apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql)
- [apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql](../../apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql)
- [apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql](../../apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql)
- [apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql](../../apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql)

**API Contract**
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [packages/api-contract/src/schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)

**FE shared**
- [packages/shared/src/api/settlement.api.ts](../../packages/shared/src/api/settlement.api.ts)
- [packages/shared/src/api/settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts)
- [packages/shared/src/api/settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts)
- [packages/shared/src/api/settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts)
- [packages/shared/src/hooks/useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts)
- [packages/shared/src/hooks/useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts)
- [packages/shared/src/hooks/useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts)
- [packages/shared/src/hooks/useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)

**Web — 정산 라우트 디렉터리 (`apps/web/src/routes/settlement/`)**
- [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx)
- [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx)
- [Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx)
- [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx)
- [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx)
- [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
- [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
- [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
- [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx)
- [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)
- [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)
- [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx)
- [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)
- [MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx)
- [RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx)
- [RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx)
- [RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx)
- [RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx)
- [SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx)
- [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx)
- [apps/web/src/stores/settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts)
- [apps/web/src/components/ui/confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx)
- [apps/web/src/styles/tailwind.css](../../apps/web/src/styles/tailwind.css)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)

(폐기되어 더 이상 존재하지 않는 파일 — 기록용)
- `apps/web/src/routes/settlement/Step2Source.tsx` — Step2Rounds 로 대체
- `apps/web/src/routes/settlement/ParticipantEditDialog.tsx` — Step1 인라인 + RestaurantSearchDialog 흐름으로 대체

**Mobile — 정산 라우트 + 컴포넌트**
- [apps/mobile/app/restaurant/[placeId]/index.tsx](../../apps/mobile/app/restaurant/[placeId]/index.tsx)
- [apps/mobile/app/restaurant/[placeId]/settle/new.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/new.tsx)
- [apps/mobile/app/restaurant/[placeId]/settle/[id]/index.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/index.tsx)
- [apps/mobile/app/restaurant/[placeId]/settle/[id]/edit.tsx](../../apps/mobile/app/restaurant/[placeId]/settle/[id]/edit.tsx)
- [apps/mobile/app/settlement/new.tsx](../../apps/mobile/app/settlement/new.tsx)
- [apps/mobile/app/settlement/history.tsx](../../apps/mobile/app/settlement/history.tsx)
- [apps/mobile/app/settlement/contacts.tsx](../../apps/mobile/app/settlement/contacts.tsx)
- [apps/mobile/app/share/settlements/[token].tsx](../../apps/mobile/app/share/settlements/[token].tsx)
- [apps/mobile/src/components/settlement/SettlementWizard.tsx](../../apps/mobile/src/components/settlement/SettlementWizard.tsx)
- [apps/mobile/src/components/settlement/Step1Participants.tsx](../../apps/mobile/src/components/settlement/Step1Participants.tsx)
- [apps/mobile/src/components/settlement/Step2Rounds.tsx](../../apps/mobile/src/components/settlement/Step2Rounds.tsx)
- [apps/mobile/src/components/settlement/Step3Edit.tsx](../../apps/mobile/src/components/settlement/Step3Edit.tsx)
- [apps/mobile/src/components/settlement/Step4Review.tsx](../../apps/mobile/src/components/settlement/Step4Review.tsx)
- [apps/mobile/src/components/settlement/ContactPickerSheet.tsx](../../apps/mobile/src/components/settlement/ContactPickerSheet.tsx)
- [apps/mobile/src/components/settlement/ContactSuggestions.tsx](../../apps/mobile/src/components/settlement/ContactSuggestions.tsx)
- [apps/mobile/src/components/settlement/MenuPickerSheet.tsx](../../apps/mobile/src/components/settlement/MenuPickerSheet.tsx)
- [apps/mobile/src/components/settlement/MultiReceiptSplitSheet.tsx](../../apps/mobile/src/components/settlement/MultiReceiptSplitSheet.tsx)
- [apps/mobile/src/components/settlement/RestaurantPickerSheet.tsx](../../apps/mobile/src/components/settlement/RestaurantPickerSheet.tsx)
- [apps/mobile/src/components/settlement/RoundCategoryAdjuster.tsx](../../apps/mobile/src/components/settlement/RoundCategoryAdjuster.tsx)
- [apps/mobile/src/components/settlement/RoundDiscountEditor.tsx](../../apps/mobile/src/components/settlement/RoundDiscountEditor.tsx)
- [apps/mobile/src/components/settlement/RoundExceptionsEditor.tsx](../../apps/mobile/src/components/settlement/RoundExceptionsEditor.tsx)
- [apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx](../../apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx)
- [apps/mobile/src/components/settlement/SettlementShareSheet.tsx](../../apps/mobile/src/components/settlement/SettlementShareSheet.tsx)
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts)
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md)
