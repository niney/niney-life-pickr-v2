---
topic: settlement
last_compiled: 2026-05-25
sources_count: 49
status: active
aliases: [정산, 정산하기, settlement, share-bill, receipt-split, 영수증 추출, 단골, contact, share token, edited badge]
---

# settlement — 정산하기 도메인

식당에서 일행이 영수증을 나눠 부담할 때 "주류 안 마신 사람은 술값 빼고" 같은 카테고리별 제외 규칙으로 자동 분배해 주는 도메인. 영수증 사진을 vision LLM 으로 OCR/분류하거나 직접 입력으로 만들고, 결과를 저장/공유/수정하며 정산에 자주 나오는 사람은 "단골" 로 자동 적립된다.

**2026-05-25 신규 토픽 — 정산하기 도메인 통째로 추가됐다.** 백엔드 3 모듈(`settlement`, `settlement-extraction`, `contact`) + DB 4 테이블(session/item/participant/contact) + 웹 라우트 4종(`/restaurants/:placeId/settle/new`, `/restaurants/:placeId/settle/:id`, `/me/settlements`, `/me/contacts`) + 공유 라우트(`/share/settlements/:token`) 가 한꺼번에 들어왔다. 핵심 결정:

- **분배는 서버가 권위** — `calculateShares` 순수 함수가 카테고리별 풀 + 제외 플래그를 받아 분담액을 산출하고, 클라이언트는 같은 함수를 미리보기에 쓰되 저장 시 서버가 다시 계산한다.
- **영수증 토큰은 server 가 발급** — `randomUUID` 36자 형식 정규식으로 path traversal 차단. 파일은 `data/receipts/<token>.jpg`.
- **단골은 (userId, normalizedKey) upsert + 자동 적립** — 클라이언트의 `contactId` 힌트는 신뢰하지 않고 매번 정규화 키로 다시 매칭. 자동완성·"단골에서 추가" 모달이 같은 row 를 공유.
- **공유 토큰 + 편집 + 수정됨 배지** — 멱등 share token, items 불변 정책(participants 만 PATCH), `editedAt` 분리 컬럼으로 "수정됨" 배지 노출.

## Purpose [coverage: high — 8 sources]

`settlement` 은 로그인 사용자가 한 식당에서 일행 분담액을 계산·저장·공유·수정할 수 있게 한다. 두 갈래 입력 — 영수증 사진(vision LLM 추출) 또는 직접 입력 — 이 같은 4단계 stepper 로 합류한다. 저장된 정산은 본인만 보지만, 공유 토큰을 발급하면 비로그인 사용자도 read-only 로 결과를 본다.

자동 적립되는 **단골(SettlementContact)** 은 같은 사람을 매번 다시 입력하지 않게 한다 — 정산 저장 시마다 (userId, normalizedKey) 기준 upsert 되어, 자동완성 드롭다운과 다중 선택 모달의 데이터원이 된다.

의존자: `apps/web` 의 정산 라우트 4종 + 공유 라우트가 직접 호출. `restaurant` 모듈을 `RestaurantService.getPublicDetail` 로 호출해 식당명 스냅샷·메뉴 힌트를 가져온다. `ai` 모듈의 vision LLM provider (purpose=`image`) 가 영수증 추출에 쓰인다.

## Architecture [coverage: high — 12 sources]

**Backend 모듈 3개 (`apps/friendly/src/modules/`)**:

- [`settlement-extraction/`](../../apps/friendly/src/modules/settlement-extraction/) — 영수증 이미지 업로드/저장 + vision LLM 호출 + 추출 결과 정규화
  - [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — `upload` / `extract` / `preview/:token` 3 엔드포인트
  - [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) — `storeImage` (sharp 로 JPEG 정규화 + 1600px 다운스케일), `readImage` (토큰 검증 + 디스크 읽기), `extract` (vision LLM 호출 + 응답 파싱 + warning 산출)
  - [settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts) — `EXTRACTION_SYSTEM_PROMPT` + `EXTRACTION_JSON_SCHEMA` (Ollama structured output) + `EXTRACTION_VERSION`
- [`settlement/`](../../apps/friendly/src/modules/settlement/) — 정산 세션 CRUD + 공유 토큰 + 참여자 PATCH
  - [settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts) — `create`/`list`/`one`/`updateParticipants`/`delete` + `share` POST/DELETE + `shared` GET (비인증)
  - [settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) — `create` (transaction + contact upsert), `updateParticipants` (items 불변, participants 전부 교체 + `editedAt` 갱신), `createShare/revokeShare` (멱등), `getBySharedToken` (userId/receiptPreviewUrl 제거)
  - `normalizeContactKey(name, nickname)` — `lower(trim(name))+"|"+lower(trim(nickname))`. **여기가 단일 진실** — backfill 스크립트와 클라이언트(`Step1Participants`, `ContactPickerDialog`) 모두 같은 정의를 복사해 쓴다.
- [`contact/`](../../apps/friendly/src/modules/contact/) — 사용자별 단골 list/update/delete (생성은 settlement 모듈이 upsert 로 자동 처리)
  - [contact.service.ts](../../apps/friendly/src/modules/contact/contact.service.ts) — `update` 시 normalizedKey 충돌 검사 409

기타:
- [plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — 5MB / 1 file limit (multipart 플러그인이 자동 413)
- [scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts) — 기존 participant 들을 단골로 일괄 적립 (멱등, `createdAt asc + orderIndex asc` 정렬로 최신값이 `lastExclude*` 가 되게)

**API Contract (`packages/api-contract/src/`)**:
- [schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — `SettlementSession`, `SettlementItem(Input)`, `SettlementParticipant(Input)`, `CreateSettlementInput`, `UpdateSettlementParticipantsInput`, `SettlementShare`, `SharedSettlementSession` (`omit userId/receiptPreviewUrl`)
- [schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — `ReceiptItem`, `ReceiptItemCategory` (4-state enum), `UploadReceiptResult`, `Extract*`
- [schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts) — `SettlementContact`, `UpdateContactInput`, `ListContactsQuery`
- [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateShares` 순수 함수 (FE/BE 공유)
- [routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Settlement` / `Routes.SettlementExtraction` / `Routes.SettlementContact`

**FE Shared (`packages/shared/src/`)**:
- API 래퍼 — [settlement.api.ts](../../packages/shared/src/api/settlement.api.ts), [settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts), [settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts)
- React Query 훅 — [useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts), [useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts), [useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts)
- Zustand 스토어 — [settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) (sessionStorage persist, placeId 변경 시 reset)

**Web Routes (`apps/web/src/routes/settlement/`)** — [App.tsx](../../apps/web/src/App.tsx) 60-103 에 등록:
- `/restaurants/:placeId/settle/new` → [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx) — 4단계 stepper 컨테이너
  - [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx) — 참여자 + 자동완성 + "단골에서 추가" 모달
  - [Step2Source.tsx](../../apps/web/src/routes/settlement/Step2Source.tsx) — MANUAL/RECEIPT 분기 (업로드 + 추출 한 번에)
  - [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx) — 항목 편집 + 영수증 미리보기 + warning 배너
  - [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx) — 분담 미리보기 (클라이언트 `calculateShares`) + 저장
- `/restaurants/:placeId/settle/:id` → [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx) — 결과 보기 + 공유/삭제/수정
- `/me/settlements` → [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx) — 사용자별 이력 페이지네이션
- `/me/contacts` → [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx) — 단골 관리
- `/share/settlements/:token` → [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx) — 비인증 read-only

**다이얼로그/카드** — [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx), [ParticipantEditDialog.tsx](../../apps/web/src/routes/settlement/ParticipantEditDialog.tsx), [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx), [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx), [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx), [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx), [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx) (Result/Shared 페이지 공유 카드).

## Talks To [coverage: medium — 4 sources]

- **`ai` 모듈 (vision LLM)** — `settlement-extraction.service.ts` 가 `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision provider 를 해결하고, `adapterCache` 에 등록된 `LLMProvider.complete` 를 호출. `format=EXTRACTION_JSON_SCHEMA` (Ollama structured output) 로 토큰 샘플링 단계부터 JSON 모양을 강제. 타임아웃은 어댑터의 chat 기준과 별도로 `VISION_TIMEOUT_MS=60_000`.
- **`restaurant` 모듈** — `RestaurantService.getPublicDetail(placeId)` 를 두 곳에서 호출: (1) `settlement-extraction.route.ts` 가 식당명 + 등록 메뉴 이름을 LLM 프롬프트 힌트로 주입, (2) `settlement.route.ts` 가 `create` 시 식당명 스냅샷을 `restaurantName` 컬럼에 박는다 — 이후 식당 이름이 바뀌어도 이력의 이름은 정산 당시 그대로.
- **`summary` 모듈** — `extractFirstJsonObject` 유틸을 LLM 응답에서 첫 JSON 블록만 잘라낼 때 재사용.
- **인증** — Settlement/Extraction/Contact 라우트는 모두 `app.authenticate` (JWT) onRequest 훅. 예외: **`Routes.Settlement.shared(:token)` 만 비인증** — 토큰을 안다 = 접근 허용. 응답에서 `userId` / `receiptPreviewUrl` 가 빠진다 (영수증 사진은 토큰 받은 사람에게도 비공개).

## API Surface [coverage: high — 6 sources]

| Method | Path | Auth | Body / Params | 응답 (200) |
|---|---|---|---|---|
| POST | `/api/v1/settlement-extraction/upload` | JWT | `multipart/form-data` — file 필드 1개, ≤5MB | `UploadReceiptResult` `{ imageToken, previewUrl, byteSize }` |
| POST | `/api/v1/settlement-extraction/extract` | JWT | `ExtractReceiptInput` `{ imageToken, placeId }` | `ExtractReceiptResult` `{ items[], totalAmount, itemsSubtotal, warning, model }` |
| GET | `/api/v1/settlement-extraction/preview/:token` | JWT | UUID v4 정규식 검증 | `image/jpeg` binary, `Cache-Control: private, max-age=3600` |
| POST | `/api/v1/settlements` | JWT | `CreateSettlementInput` | `SettlementSession` (items/participants 포함) |
| GET | `/api/v1/settlements?placeId=&offset=&limit=` | JWT | `ListSettlementsQuery` | `ListSettlementsResult` `{ items: Summary[], total }` |
| GET | `/api/v1/settlements/:id` | JWT | — | `SettlementSession` (소유자만, 비소유자 403) |
| PATCH | `/api/v1/settlements/:id/participants` | JWT | `UpdateSettlementParticipantsInput` (participants only) | `SettlementSession` (서버가 재계산, `editedAt` 갱신) |
| DELETE | `/api/v1/settlements/:id` | JWT | — | 204 |
| POST | `/api/v1/settlements/:id/share` | JWT | — | `SettlementShare` `{ token, shareUrl }` (멱등) |
| DELETE | `/api/v1/settlements/:id/share` | JWT | — | 204 (이미 비공개여도 204) |
| GET | `/api/v1/share/settlements/:token` | **none** | base64url 20-64자 길이 검사 | `SharedSettlementSession` (userId/receiptPreviewUrl 제거) |
| GET | `/api/v1/me/contacts?q=&take=` | JWT | `ListContactsQuery` | `ListContactsResult` (lastUsedAt desc) |
| PATCH | `/api/v1/me/contacts/:id` | JWT | `UpdateContactInput` `{ name, nickname }` | `SettlementContact` (normalizedKey 충돌 시 409) |
| DELETE | `/api/v1/me/contacts/:id` | JWT | — | 204 (과거 정산의 `participant.contactId` 는 SetNull) |

에러 매핑 (`throwAsHttp`):
- `settlement-extraction`: `invalid_image`/`invalid_token` → 400, `image_not_found`/`restaurant_not_found` → 404, `no_provider` → 503, `llm_failed` → 502
- `settlement`: `not_found` → 404, `forbidden` → 403, `invalid_participant`/`invalid_receipt_token` → 400
- `contact`: `not_found`/`forbidden`/`conflict` → 404/403/409, `invalid_input` → 400

## Data [coverage: high — 8 sources]

**Prisma 모델 4개** (전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma) 35-155):

- **`SettlementSession`** (`settlement_sessions`) — `userId`, `restaurantPlaceId`, `restaurantName`(스냅샷), `source`(MANUAL|RECEIPT), `totalAmount?`(영수증 표기), `warning?`, `receiptImageToken?`, `itemsSubtotal`, `shareToken? @unique`, `editedAt?`, `createdAt`, `updatedAt`. 인덱스: `(userId, createdAt)`, `(restaurantPlaceId)`. user `onDelete: Cascade`.
- **`SettlementItem`** (`settlement_items`) — `name`, `unitPrice?`, `quantity?`, `amount`, `category`, `matchedMenuName?`, `orderIndex`. session `onDelete: Cascade`.
- **`SettlementParticipant`** (`settlement_participants`) — `name?`, `nickname?`, `excludeAlcohol/NonAlcohol/Side`, `shareAmount`(스냅샷), `orderIndex`, `contactId?`. contact `onDelete: SetNull` — 단골 삭제해도 정산 본체 보존.
- **`SettlementContact`** (`settlement_contacts`) — `userId`, `name?`, `nickname?`, `normalizedKey`, `lastExcludeAlcohol/NonAlcohol/Side`, `useCount`, `lastUsedAt`. 유니크 `(userId, normalizedKey)` — 같은 사용자 안에서 정확 일치 매칭의 키. 인덱스 `(userId, lastUsedAt)`. user `onDelete: Cascade`.

**영수증 파일** — `apps/friendly/data/receipts/<token>.jpg`. 토큰은 `randomUUID()` (server 발급). `sharp` 가 EXIF rotate + ≤1600px + JPEG quality 80 + mozjpeg 으로 재인코딩 후 저장. 저장 직전 디코딩 실패 시 `invalid_image` (PDF 등 비이미지가 여기서 걸림).

**`normalizedKey` 정책** — `lower(trim(name))+"|"+lower(trim(nickname))`. 빈 문자열 케이스(`"|"`)는 application layer 가 거부하므로 row 가 안 생긴다. **이 정의는 4 곳에서 동일**:
1. server [settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) `normalizeContactKey` (export, single source of truth)
2. backfill 스크립트가 import
3. [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx) — "단골에서 추가" 모달에서 사용자가 직접 타이핑한 행도 중복 후보에서 제외
4. [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx) — `existingKeys` 판정

**`shareToken`** — 32바이트 `randomBytes` → `base64url` 43자. unique 인덱스로 `GET /share/settlements/:token` 이 O(1). 회수 = `null` 로 업데이트, 재발급 = `randomBytes` 새로 호출 (이전 토큰 영구 무효).

**`editedAt`** — participants PATCH 시에만 갱신되는 별도 컬럼. `updatedAt` 은 share token 발급/회수에서도 자동 bump 되어 "수정됨" 배지 기준으로 부적합 → 분리.

**Zustand persist 스토어** ([settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)) — `sessionStorage` 에 `settlement-draft-v1` 키로 저장. 새로고침 살리고 탭 닫으면 사라진다. `startFor(placeId)` 가 같은 placeId 면 draft 보존, 다른 placeId 면 `emptyDraft()` 로 초기화. 한 식당당 한 draft 만 유지 (브라우저 탭마다 다른 placeId 정산 동시 진행은 미지원).

**Migrations 4개** (시간순):
1. [`20260523012752_add_settlement_models`](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql) — session/item/participant 3 테이블 신설
2. [`20260523030833_add_settlement_share_token`](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql) — `shareToken` 컬럼 + 유니크 인덱스
3. [`20260524000000_add_settlement_contacts`](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql) — `settlement_contacts` 신설 + participants 에 `contactId` FK SetNull (SQLite redefine table 패턴)
4. [`20260524112443_add_settlement_edited_at`](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql) — `editedAt DATETIME` 추가

## Key Decisions [coverage: high — 12 sources]

시간순 진화 (MVP → 공유 → 단골 → 편집+배지):

**MVP 진입 (2026-05-23 첫 마이그)**
- **분배 알고리즘 = 카테고리별 풀 + 제외 플래그** ([settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts)) — ALCOHOL/NON_ALCOHOL/SIDE 각각의 풀 금액을 "그 카테고리를 제외하지 않은 인원" 으로 나눈다. UNCATEGORIZED 는 전원 균등. 1원 단위 나머지는 항상 첫 참여자에게. **edge case**: 한 카테고리를 전원이 제외했는데 그 풀에 금액이 있으면 미분류처럼 전원 균등 분담 — 사용자 입력 모순이지만 안전 폴백 (calculator.test.ts L66 "falls back to even split").
- **영수증 vision 추출** — purpose=`image` 인 ollama-cloud provider 만 사용. `EXTRACTION_JSON_SCHEMA` 의 structured output 으로 토큰 샘플링 단계에서 JSON 강제. 카테고리 4-state(ALCOHOL/NON_ALCOHOL/SIDE/UNCATEGORIZED). 식당 등록 메뉴를 힌트로 주입하고 `matchedMenuName` 으로 매칭. **추출 결과는 사용자 수정 필수** — Step3 에서 항목/카테고리를 손볼 수 있고, warning 배너가 항목 합 vs `totalAmount` 불일치를 표시.
- **클라+서버 양쪽에서 계산** — `calculateShares` 가 zod 와 함께 api-contract 에 있어 Step4Review 가 미리보기에 그대로 호출. 저장 시 서버가 다시 계산하는 게 권위 있는 값. 클라가 변조한 값을 서버가 받아주지 않는다.
- **영수증 토큰 server 발급 + 정규식 검증** — `randomUUID()` 36자 hex+hyphen 만 통과. `../etc/passwd` 같은 path traversal 은 정규식 단계에서 차단.

**공유 도입 (2026-05-23 두번째 마이그)**
- **shareToken 멱등** ([settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) `createShare`) — 같은 세션 두 번 호출해도 동일 토큰. 회수 시 `null` 로 비우고, 재발급 시 `randomBytes(32)` 새로 — 이전 링크 영구 무효.
- **shared 응답에서 userId/receiptPreviewUrl 제거** — 토큰 받은 사람도 영수증 원본 사진은 못 본다 (개인정보). 라우트도 비인증 read-only.

**단골 자동 적립 (2026-05-24 세번째 마이그)**
- **(userId, normalizedKey) upsert + 자동 적립** — 정산 저장/수정 시 모든 participant 가 트랜잭션 안에서 contact 로 upsert. `useCount` 증가, `lastExclude*` 갱신, `lastUsedAt` 갱신.
- **클라이언트의 `contactId` 힌트는 신뢰하지 않음** — 자동완성에서 단골을 골랐을 때 hint 로 같이 보내지만, 서버는 결국 `normalizedKey` 로 다시 매칭. 사용자가 직접 같은 이름을 타이핑한 행도 같은 contact 로 합쳐진다. 정책 단일화.
- **삭제 시 SetNull** — 단골을 지워도 과거 정산의 `participant.contactId` 만 null 로 떨어지고 정산 본체는 보존 (이력 보존 정책).
- **backfill 스크립트 멱등** — 기존 participants 를 `createdAt asc + orderIndex asc` 로 정렬해 순회. 마지막 update 가 `lastExclude*` 의 최신값이 되도록.

**편집 + "수정됨" 배지 (2026-05-24 네번째 마이그)**
- **편집 정책 = 무제한 + items 불변** — 저장 후 `PATCH /:id/participants` 로 participants/제외 옵션만 수정. items 는 그대로, 서버가 `calculateShares` 로 `shareAmount` 재계산. participants 는 deleteMany → 재삽입으로 orderIndex 정합성을 단순 보장.
- **`editedAt` 분리 컬럼** — `updatedAt` 은 share token 발급/회수에도 갱신되어 "수정됨" 배지 기준에 부적합. 별도 nullable `editedAt` 컬럼을 두고 PATCH 시에만 채운다. UI 는 `editedAt != null` 일 때만 SessionSummaryCard 에 "수정됨" dt/dd 노출.
- **Stepper UX — 완료된 단계만 자유 점프** ([SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx) `canJumpTo`) — Step N+1 은 Step N 산출물이 draft 에 있을 때만 활성화. **Step1 → Step3 직행** 특례: 같은 세션 안에서 참여자만 고치고 돌아왔을 때 `draft.source` 가 이미 있으면 Step2(입력 방식 선택)를 건너뛰고 바로 Step3 로 (영수증 사진 재업로드 회피).

**기타 회피·결정**
- **`?? null` 폴백 제거** ([settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) `setReceipt`) — 영수증 교체 시 `totalAmount`/`warning` 을 명시적 `?? null` 로 클리어. 폴백을 안 쓰면 이전 영수증의 warning 이 새 영수증에 잘못 남는다 (커밋 `14196ea` 의 회귀 수정).
- **sessionStorage persist** — localStorage 가 아니라 sessionStorage 인 이유: "정산 입력 중에 새로고침은 살리고, 탭 닫으면 깔끔히 사라지길" 의도. 다른 사용자가 그 탭을 열어도 이전 draft 가 안 보인다.

## Gotchas [coverage: high — 7 sources]

- **영수증 이미지 디스크 존재 검증 필수** ([settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) L91-100) — `CreateSettlementInput.receiptImageToken` 이 들어오면 정규식 검증 + `stat()` 으로 파일 존재 확인. 클라이언트가 토큰만 위조해 보내도 `invalid_receipt_token` 400. `extraction.service.IMAGE_TOKEN_PATTERN` 과 동일 정규식이 두 모듈에 복사돼 있다 (모듈 간 결합도 축소 의도) — 패턴 바꾸면 두 곳 다 손대야 한다.
- **`normalizedKey` 정의가 4 곳에 복사돼 있다** — server export 가 single source of truth 지만, 클라이언트 두 파일(`Step1Participants`, `ContactPickerDialog`) 은 동기화를 위해 정의를 다시 적었다. **server 정의를 바꾸면 4 곳 다** — 또는 backfill 후 NormalizedKey 가 어긋나면 같은 사람이 두 row 로 갈라진다.
- **shareToken 무효화 후 재발급 시 새 토큰** — 회수 직후 다시 `POST /share` 호출하면 `randomBytes(32)` 가 다시 도는데 동일 토큰이 아니다 (`settlement.route.test.ts` "재발급 후 이전 토큰은 무효" 시나리오로 검증). UX 측에서 "공유 해제하면 이전 링크는 영구 무효" 라고 명시 (SettlementShareDialog 의 confirm 메시지).
- **`editedAt` 과 `updatedAt` 분리** — Prisma 의 `@updatedAt` 은 모든 컬럼 변경에 자동 bump. share token 발급/회수도 update 라 `updatedAt` 이 바뀐다. "수정됨" 배지가 share token 켰을 때 잘못 켜지는 버그를 피하려고 별도 `editedAt` 을 둔다 — 코드/마이그레이션 두 군데에 주석으로 명시돼 있다.
- **`?? null` 폴백 제거 사례** — `setReceipt` 에서 `totalAmount: totalAmount ?? null` 로 명시 클리어. 처음엔 `?? s.totalAmount` 같은 폴백을 썼다가 영수증 교체 시 이전 값이 잔존하는 회귀가 났다 — 커밋 `14196ea` 와 함께 store 주석에 "예: A 가 불일치(warning 세팅) → B 가 일치(warning=null) 인데 ?? 폴백을 쓰면 A 의 warning 이 살아남아 B 에도 잘못 표시됨" 으로 박혀 있다.
- **Vision LLM 타임아웃 별도** — `VISION_TIMEOUT_MS=60_000` 으로 어댑터 default 와 분리. chat 모델보다 vision 호출이 느려서 — `provider.complete({ signal: ac.signal })` 에 `AbortController` 를 명시적으로 묶는다.
- **Preview 라우트 JWT 필요 → `<img src>` 직접 호출 불가** — 같은 origin 이라도 Authorization 헤더가 필요해 `Step3Edit`/`SettlementResultPage` 의 `ReceiptPreviewImage` 가 `fetch` → `Blob` → `URL.createObjectURL` 패턴을 쓴다. unmount 시 `revokeObjectURL` 까지 묶어야 메모리 누수 없음 — 두 컴포넌트에 같은 패턴이 복사돼 있다.
- **Step1 자동완성 onMouseDown 트릭** — input blur 가 mousedown 보다 먼저 발동하면 드롭다운이 사라져 onClick 이 도달 못 한다. `ContactSuggestions` 가 `onMouseDown.preventDefault() + onPick` 으로 우회. blur 도 `setTimeout(0)` 으로 microtask 늦춤 (Step1Participants L148-153).
- **`backfill-contacts.ts` 정렬** — `session.createdAt asc + orderIndex asc` 가 의도. 마지막 순회가 `lastExclude*` 의 최신값으로 update 되도록. 반대로 desc 로 돌리면 가장 오래된 정산의 옵션이 default 가 되어 자동완성 제안이 어긋난다.
- **`SharedSettlementSession` 은 SettlementSession 의 omit** — 구조적 subtyping 으로 `SettlementCards` 가 두 type 을 같이 받지만, TS 가 `userId`/`receiptPreviewUrl` 을 카드 안에서 우연히 참조하지 않게 해야 한다. 현재 카드들은 의도적으로 그 필드를 안 본다.

## Sources [coverage: high — 49 sources]

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

**Backend — contact 모듈**
- [apps/friendly/src/modules/contact/contact.route.ts](../../apps/friendly/src/modules/contact/contact.route.ts)
- [apps/friendly/src/modules/contact/contact.service.ts](../../apps/friendly/src/modules/contact/contact.service.ts)
- [apps/friendly/src/modules/contact/contact.route.test.ts](../../apps/friendly/src/modules/contact/contact.route.test.ts)

**Backend — infra/scripts**
- [apps/friendly/scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)
- [apps/friendly/src/plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma)
- [apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
- [apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
- [apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
- [apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)

**API Contract**
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)

**FE shared**
- [packages/shared/src/api/settlement.api.ts](../../packages/shared/src/api/settlement.api.ts)
- [packages/shared/src/api/settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts)
- [packages/shared/src/api/settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts)
- [packages/shared/src/hooks/useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts)
- [packages/shared/src/hooks/useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts)
- [packages/shared/src/hooks/useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)

**Web — 정산 라우트 디렉터리 (`apps/web/src/routes/settlement/`)**
- [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx)
- [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx)
- [Step2Source.tsx](../../apps/web/src/routes/settlement/Step2Source.tsx)
- [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx)
- [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx)
- [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
- [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
- [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
- [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx)
- [ParticipantEditDialog.tsx](../../apps/web/src/routes/settlement/ParticipantEditDialog.tsx)
- [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)
- [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)
- [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx)
- [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)
- [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx)
- [apps/web/src/App.tsx](../../apps/web/src/App.tsx)
