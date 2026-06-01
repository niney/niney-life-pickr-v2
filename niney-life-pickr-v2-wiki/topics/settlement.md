---
topic: settlement
last_compiled: 2026-05-31
sources_count: 103
status: active
aliases: [정산, 정산하기, settlement, share-bill, receipt-split, 영수증 추출, 단골, contact, share token, edited badge, rounds, N차, settlement-draft, draft-autosave, multi-receipt, MultiReceiptSplitDialog, RoundDiscountEditor, RoundCategoryAdjuster, SettlementBreakdownTable, RoundExceptionsEditor, leftover-routing, roundUnit-100-1000, calculateMultiRoundShares, fromDraftId, EXTRACTION_VERSION, ExtractReceiptSplit, roundIndex, roundTotal, universal-links, app-links, deep-link, settlement-mobile, RestaurantSearchDialog, confirm-dialog, attendees-100, items-200, share-preview, OG, og:image, settlement-card, satori, resvg, IBMPlexSansKR, ShareTtl, ShareOgImage, shareOgImageUrl, share-expiry, kakao-copy, receipt-lightbox, sharePreviewCache]
---

# settlement — 정산하기 도메인

식당에서 일행이 영수증을 나눠 부담할 때 "주류 안 마신 사람은 술값 빼고" 같은 카테고리별 제외 규칙으로 자동 분배해 주는 도메인. 영수증 사진을 vision LLM 으로 OCR/분류하거나 직접 입력으로 만들고, 결과를 저장/공유/수정하며 정산에 자주 나오는 사람은 "단골" 로 자동 적립된다.

**2026-05-31 16차 컴파일 — 공유 기능 대확장 + 백엔드 perf.** 14차의 N차(차수) 재설계에 이어, 이번 라운드는 "정산을 카카오톡·텔레그램에 예쁘게 공유" 에 집중했다. 핵심 변경:

- **OG SSR-lite 미리보기** — 순수 SPA 라 크롤러가 긁으면 OG 태그가 비어 보이던 문제. 새 [share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) 가 `/share/settlements/:token` 과 단축 별칭 `/s/:token` 을 가로채 빌드된 `index.html` 의 `<head>` 에 정산 요약 OG 메타(식당명·총액·인원수)와 동적 og:image 를 주입한다. 풀 SSR 이 아니라 메타만.
- **정산표 PNG 서버 렌더** — 새 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 정산표 매트릭스를 satori(레이아웃→SVG) + resvg(SVG→PNG) 로 서버 렌더(폰트 IBM Plex Sans KR 번들). `/share/settlements/:token/image.png` 라우트로 노출 — og:image 와 '이미지로 보내기' 버튼이 소비.
- **OG 이미지 선택** — owner 가 공유 시 미리보기 이미지를 고른다: `restaurant`(식당 사진 — 갤러리에서 특정 1장 고정 / 미선택 시 토큰 시드 결정적 랜덤) 또는 `table`(정산표 PNG). `shareOgImage`/`shareOgImageUrl` 컬럼 신설.
- **공유 만료(ttl)** — `ShareTtl` 1d/7d/30d 프리셋 + `shareExpiresAt` 컬럼. 무제한 없음 — 짧은 토큰(10자)으로도 노출 창이 닫힌다. 만료 링크는 410(`expired`).
- **공유 UX** — SettlementShareDialog/SettlementShareSheet 에 OG 토글 + 식당 사진 갤러리 + 카카오톡 복사·정산표 클립보드 복사·Web Share file. 영수증 Lightbox(useReceiptPreviewUrl).
- **백엔드 perf** — `resolveRestaurantName` 을 `restaurant.findUnique(select:name)` 경량 조회로(이전 getPublicDetail 전체 리뷰 코퍼스 로드 제거), create 준비 단계 placeId 메모이즈 + Promise.all 병렬화, attendee 를 차수별 `createMany` 로 배칭, getSharePreviewMeta 경량 select(items/attendees 미로드 + _count) + (token,origin) 5분 캐시.
- **영수증 OCR 빈 항목 회귀 수정** — `EXTRACTION_VERSION` 2→3, 소극적 시스템 프롬프트("읽기 어려우면 빼라/빈 배열 OK") 제거.

## Purpose [coverage: high — 9 sources]

`settlement` 은 로그인 사용자가 일행의 분담액을 계산·저장·공유·수정할 수 있게 한다. 한 세션은 1~10 차수로 구성되며 각 차수는 영수증 사진(vision LLM 추출) 또는 직접 입력으로 만들 수 있다. 차수마다 다른 식당·다른 참석자 부분집합·다른 할인을 가질 수 있다. 저장된 정산은 본인만 보지만, 공유 토큰을 발급하면 비로그인 사용자도 read-only 로 결과를 본다.

공유 링크는 카카오톡·텔레그램 등 SNS 에서 펼쳐질 때 **OG 미리보기**(식당명·총액·인원수 + og:image)를 보여준다 — 순수 SPA 가 못 하는 일을 `share-preview.ts` 가 서버에서 `<head>` 메타만 주입해 해결한다. owner 는 미리보기 이미지를 식당 사진(갤러리 특정 1장 또는 토큰 시드 랜덤) 또는 정산표 PNG 중에서 고른다.

자동 적립되는 **단골(SettlementContact)** 은 같은 사람을 매번 다시 입력하지 않게 한다 — 정산 저장 시마다 (userId, normalizedKey) 기준 upsert 되어, 자동완성 드롭다운과 다중 선택 모달의 데이터원이 된다.

서버 임시저장 **(SettlementDraft)** 은 자동 저장으로 다기기 동기화 — 폰에서 입력 시작한 정산을 데스크톱에서 이어 입력. `(userId, placeId)` 키로 식당당 하나, 식당 미지정 슬롯(`/me/settlements/new`)은 sentinel `placeIdKey=''`.

의존자: `apps/web` 의 정산 라우트 + `apps/mobile` 의 expo-router 라우트가 직접 호출. `restaurant` 모듈을 `RestaurantService.resolveRestaurantName`(이름 한 컬럼) 과 `getPhotoUrls`(OG 후보 사진)로 가볍게 호출한다. `ai` 모듈의 vision LLM provider (purpose=`image`) 가 영수증 추출에 쓰인다. 공유 링크는 `well-known` 모듈이 발급하는 AASA/assetlinks.json 으로 검증돼 iOS/Android 앱이 직접 가로챈다. OG 식당 사진은 `media` 모듈의 thumbnail 프록시로 1200px 리사이즈해 노출.

## Architecture [coverage: high — 20 sources]

**Backend 모듈 4개 (`apps/friendly/src/modules/`)**:

- [`settlement-extraction/`](../../apps/friendly/src/modules/settlement-extraction/) — 영수증 이미지 업로드/저장 + vision LLM 호출 + 추출 결과 정규화
  - [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — `upload` / `extract` / `preview/:token` 3 엔드포인트. extract 가 `roundIndex/roundTotal/split` 까지 받는다.
  - [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) — `storeImage` (sharp 로 JPEG 정규화 + 1600px 다운스케일, HEIC 는 heic-convert 폴백), `readImage`, `cropForSplit` (한 사진을 X 축 N등분), `extract` (vision LLM 호출 + 응답 파싱 + warning 산출)
  - [settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts) — `EXTRACTION_SYSTEM_PROMPT` + `EXTRACTION_JSON_SCHEMA` + `EXTRACTION_VERSION=3`. `buildExtractionUserPrompt` 가 roundHint 를 받아 "N차 회식 중 K차 영수증" 컨텍스트를 라인으로 추가. **v3: 소극적 지시 제거 → "모든 메뉴 줄 빠짐없이 추출"**.
- [`settlement/`](../../apps/friendly/src/modules/settlement/) — 정산 세션 CRUD + 공유 토큰/OG + 전체 replace
  - [settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts) — `create`/`list`/`one`/`update`(PUT)/`delete` + `share` POST/DELETE + `shared` GET(비인증, IP rate limit). 공유 토큰 길이 하한 `min(8)` 으로 낮춰 신·구 토큰 모두 통과.
  - [settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) — `create`/`update` 가 transaction 안에서 마스터 participants + N round + N round × M attendees(createMany 배칭) + items + categoryAdjustments 직렬화까지 전체 wipe/rebuild. `create` 는 `fromDraftId` 가 있으면 같은 트랜잭션에서 draft 도 삭제. 공유: `createShare`/`revokeShare`/`getBySharedToken`/`getSharePreviewMeta`/`pickRestaurantOgImageUrl`/`collectCandidateImageUrls` + `seedFromToken` + (token,origin) 5분 캐시 `sharePreviewCache`/`invalidateSharePreview`.
  - [share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) (NEW) — `registerSharePreview(app)` 가 **`/api/v1` prefix 밖**의 루트 경로 `/share/settlements/:token`·`/s/:token`(OG 주입 HTML)·`.../image.png`(정산표 PNG)를 직접 등록(autoload 우회). `app.ts` 에서 명시 호출. 빌드된 `apps/web/dist/index.html` 을 __dirname/cwd 위로 올라가며 후보 경로로 탐색해 캐시, `<title>` 교체 + `</head>` 앞에 OG 메타 삽입.
  - [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) (NEW) — `renderSettlementCardPng(session)` — 정산표 매트릭스를 satori + resvg 로 PNG 렌더. 폰트 `IBMPlexSansKR-Regular/Bold.ttf` 를 후보 경로로 찾아 1회 캐시 주입. `computeMatrix` 가 web `SettlementBreakdownTable` 의 useMatrix 포팅(같은 `calculateMultiRoundShares`).
  - [settlement/settlement-draft.{route,service}.ts](../../apps/friendly/src/modules/settlement/) — 서버 임시저장. `(userId, placeIdKey)` upsert, `static deleteByIdInTxIfOwner` 가 settlement.create 트랜잭션 안에서 호출됨.
  - `normalizeContactKey(name, nickname)` — `lower(trim(name))+"|"+lower(trim(nickname))`. **single source of truth** — backfill 스크립트와 클라이언트(`Step1Participants`, `ContactPickerDialog`) 도 같은 정의.
- [`contact/`](../../apps/friendly/src/modules/contact/) — 사용자별 단골 list/update/delete (생성은 settlement 모듈 upsert)
- [`well-known/well-known.route.ts`](../../apps/friendly/src/modules/well-known/well-known.route.ts) — `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 동적 응답 (env 미설정 시 404).

기타:
- [plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — 5MB / 1 file limit
- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — dev 에서 모든 origin 반사 허용(15차에서 LAN 화이트리스트 폐기), 비-LAN origin 만 1회 warn
- [config/env.ts](../../apps/friendly/src/config/env.ts) — `OG_IMAGE_PATH`(기본 `/og-default.png`, 만료/없는 토큰 폴백 og:image), `WEB_INDEX_PATH`(index.html 명시 지정 시)
- [scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)

**API Contract (`packages/api-contract/src/`)**:
- [schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 마스터 `SettlementParticipant`, `SettlementRound`(차수), `SettlementRoundAttendee`(차수 attendance), `SettlementCategoryAdjustment(s)` (분담 다듬기), `CreateSettlementInput` (rounds + participants + optional fromDraftId), `UpdateSettlementInput = CreateSettlementInput`. **공유 신규**: `ShareTtl`('1d'|'7d'|'30d'), `ShareOgImage`('restaurant'|'table'), `CreateSettlementShareInput`(preprocess null→{} + ttl default '7d' + ogImage? + ogImageUrl?), `SettlementShare`(token/shareUrl/expiresAt/ogImage/ogImageUrl/ogImageCandidates), `SharedSettlementSession`(round 에서 receiptPreviewUrl/receiptImageToken omit). round.items.max(200), participants/attendees.max(100), rounds.max(10).
- [schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — `ReceiptItemCategory` 4-state, `ExtractReceiptSplit` (count 2..5, index 1..count), `ExtractReceiptInput` 에 `roundIndex/roundTotal/split` 옵션 필드.
- [schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) — `SettlementDraft`, `UpsertSettlementDraftInput` (payload `z.unknown()` + 200KB JSON 크기 refine), `ListSettlementDraftsResult`.
- [schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateShares` (할인 + categoryAdjustments) + `calculateMultiRoundShares` (라운드별 호출 + 마스터 인덱스 합산, `perRound[].poolBreakdown`/`perCategoryShares`) + `effectiveExcludes`.
- [routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Settlement.{create,list,one,update,share,shared}` + `Routes.SettlementDraft` + `Routes.Media.thumbnail`(OG 식당 사진 프록시).
- [index.ts](../../packages/api-contract/src/index.ts) — 모든 신규 스키마 re-export.

**FE Shared (`packages/shared/src/`)**:
- API 래퍼 — [settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) (`createShare(id, ttl, ogImage?, ogImageUrl?)` — ogImageUrl 트라이스테이트를 위해 undefined 일 때만 키를 뺀다), [settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts) (`previewBlob`), [settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts), [settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts)
- React Query 훅 — [useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) (`useCreateSettlementShare` 가 ttl/ogImage/ogImageUrl 받음), [useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts), [useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts), [useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts) — `useSettlementDraftHydrate` 가 **placeId당 1회만** hydrate(저장 in-flight 중 입력 덮어쓰기 방지), `useSettlementDraftAutoSync` debounce 자동 저장.
- Zustand 스토어 — [settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — N차 모델. `version: 4`, `setSettlementDraftStorage(storage)` 어댑터 주입(RN AsyncStorage / 웹 sessionStorage / no-op).

**Web Routes (`apps/web/src/routes/settlement/`)** — App.tsx 에 등록:
- `/restaurants/:placeId/settle/new` → [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx) — 4단계 stepper.
  - [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx) — 참여자 단일 필드 + alias 토글 + Enter 추가 + 기본 제외 토글(localStorage).
  - [Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx) — 차수 N개 입력.
  - [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx) — 차수별 항목 편집 + 영수증 미리보기(`useReceiptPreviewUrl` → Lightbox) + warning.
  - [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx) — 분담 미리보기 + 정산표 + 저장.
- `/restaurants/:placeId/settle/:id` → [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx) — 결과 보기 + 공유/삭제/수정. 차수별 카드 + 영수증 썸네일 + 정산표. 헤더 z-30.
- `/me/settlements` → [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx)
- `/me/contacts` → [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- `/share/settlements/:token` (SPA) / `/s/:token` → [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx) — 비인증 read-only. 같은 URL 을 서버 `share-preview.ts` 가 먼저 받아 OG 를 주입한 HTML 을 돌려주고 그 위에서 SPA 부팅.
- [useReceiptPreviewUrl.ts](../../apps/web/src/routes/settlement/useReceiptPreviewUrl.ts) (NEW) — preview 라우트(JWT 필요)를 fetch → Blob → `URL.createObjectURL`. unmount 시 revoke. 반환 objectUrl 을 Lightbox 가 그대로 확대.

**다이얼로그/카드 (web)** — [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx) (TTL 토글 + OG 이미지 토글 + 식당 사진 갤러리 선택 + 이미지/카카오톡 클립보드 복사 + Web Share file), [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx), [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx), [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx), [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx), [RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx), [MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx), [RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx), [RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx), [RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx), [SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx) (settlement-card.ts 의 PNG 와 동일 매트릭스), [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx), 공용 [confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx). [settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts) (localStorage).

**Mobile (`apps/mobile/`)** — expo-router 라우트로 정산 도메인 전체 이식:
- `/restaurant/[placeId]/settle/new` · `/settle/[id]/{index,edit}` · `/settlement/{new,history,contacts}` · `/share/settlements/[token]`(딥링크) 라우트.
- 컴포넌트는 [apps/mobile/src/components/settlement/](../../apps/mobile/src/components/settlement/): SettlementWizard, Step1~4, ContactPickerSheet, ContactSuggestions, MenuPickerSheet, RestaurantPickerSheet, MultiReceiptSplitSheet, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor, SettlementBreakdownTable, [SettlementShareSheet.tsx](../../apps/mobile/src/components/settlement/SettlementShareSheet.tsx) (OG 토글 + 식당 사진 갤러리 + 카톡/클립보드 복사).
- [apps/mobile/src/hooks/useReceiptPreviewUrl.ts](../../apps/mobile/src/hooks/useReceiptPreviewUrl.ts) (NEW) — 웹과 동일 패턴이되 RN `Image` 가 objectURL 을 못 받아 `FileReader` 로 **data URL** 변환(웹 훅과 유일한 차이).
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts) (AsyncStorage), [app.config.ts](../../apps/mobile/app.config.ts) (associatedDomains/intentFilters), [DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md).

## Talks To [coverage: medium — 6 sources]

- **`ai` 모듈 (vision LLM)** — `settlement-extraction.service.ts` 가 `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision provider 를 해결하고, `adapterCache` 의 `LLMProvider.complete` 를 호출. `format=EXTRACTION_JSON_SCHEMA` 로 토큰 샘플링 단계부터 JSON 모양 강제. `VISION_TIMEOUT_MS=60_000` 별도 타임아웃, `AbortController` 시그널.
- **`restaurant` 모듈 (이번 라운드 경량화)** — 두 경로 모두 풀 `getPublicDetail`(전체 리뷰 코퍼스 + summary join + snapshot merge) 을 피한다:
  - `settlement.service.resolveRestaurantName(placeId)` 가 `restaurant.findUnique({ where:{placeId}, select:{name} })` 스칼라 직조회. placeId 는 naver 행에만 @unique 로 채워지고 getPublicDetail 의 mergeName 도 naver 존재 시 naver.name 을 반환하므로 결과 값 동일.
  - `collectCandidateImageUrls` 가 `RestaurantService.getPhotoUrls(placeId)` (snapshot-only, naver+DC mergePhotos) 로 OG 후보 사진 URL 만 모은다(dedup + thumbnail-proxyable 호스트만 + 최대 12장).
  - extract 라우트는 식당명 + 메뉴 이름을 LLM 프롬프트 힌트로 주입할 때만 풀 detail 을 사용.
- **`media` 모듈** — OG 식당 사진은 원본 네이버 CDN URL 이 아니라 `${origin}${Routes.Media.thumbnail}?url=...&w=1200&q=80` 프록시로 감싸 노출(allowlist 호스트만, referrer-policy 회피).
- **`summary` 모듈** — `extractFirstJsonObject` 유틸을 LLM 응답에서 첫 JSON 블록만 잘라낼 때 재사용.
- **`well-known` 모듈** — 공유 링크 딥링크를 가능하게 만드는 동반 모듈. iOS/Android 가 `/.well-known/{apple-app-site-association,assetlinks.json}` 을 fetch 해 `/share/settlements/*` 가로채기 권한을 검증.
- **인증** — 모든 `/api/v1/settlements*` 라우트 `app.authenticate` JWT onRequest. 예외: **`Routes.Settlement.shared(:token)` 만 비인증** — 토큰을 안다 = 접근 허용. 응답에서 `userId` 와 round 별 `receiptPreviewUrl`/`receiptImageToken` 가 빠진다. `share-preview.ts` 의 HTML/PNG 라우트(`/share/settlements/:token`, `/s/:token`, `.../image.png`)도 비인증(크롤러·메신저가 호출). `well-known` 두 엔드포인트도 비인증.

## API Surface [coverage: high — 9 sources]

| Method | Path | Auth | Body / Params | 응답 (200) |
|---|---|---|---|---|
| POST | `/api/v1/settlement-extraction/upload` | JWT | `multipart/form-data` — file 1개, ≤5MB | `UploadReceiptResult` `{ imageToken, previewUrl, byteSize }` |
| POST | `/api/v1/settlement-extraction/extract` | JWT | `ExtractReceiptInput` `{ imageToken, placeId, roundIndex?, roundTotal?, split? }` | `ExtractReceiptResult` `{ items[], totalAmount, itemsSubtotal, warning, model }` |
| GET | `/api/v1/settlement-extraction/preview/:token` | JWT | UUID v4 정규식 | `image/jpeg`, `Cache-Control: private, max-age=3600` |
| POST | `/api/v1/settlements` | JWT | `CreateSettlementInput` `{ rounds[1..10], participants[1..100], fromDraftId? }` | `SettlementSession` |
| GET | `/api/v1/settlements?placeId=&offset=&limit=` | JWT | `ListSettlementsQuery` | `ListSettlementsResult` (요약 `roundCount/itemCount`, _count 기반) |
| GET | `/api/v1/settlements/:id` | JWT | — | `SettlementSession` (소유자만, 비소유자 403) |
| PUT | `/api/v1/settlements/:id` | JWT | `UpdateSettlementInput = CreateSettlementInput` (전체 replace) | `SettlementSession` (서버 재계산 + `editedAt` 갱신) |
| DELETE | `/api/v1/settlements/:id` | JWT | — | 204 |
| **POST** | `/api/v1/settlements/:id/share` | JWT | `CreateSettlementShareInput` `{ ttl?, ogImage?, ogImageUrl? }` (본문 생략 가능) | `SettlementShare` `{ token, shareUrl, expiresAt, ogImage, ogImageUrl, ogImageCandidates }` (멱등 + ttl 만료갱신) |
| DELETE | `/api/v1/settlements/:id/share` | JWT | — | 204 |
| GET | `/api/v1/share/settlements/:token` | **none** | base64url 8~64자 | `SharedSettlementSession` (userId/receiptPreviewUrl/receiptImageToken 제거). 만료=410, 없음=404, IP rate limit 120/분 |
| GET | `/api/v1/settlement-drafts` | JWT | — | `ListSettlementDraftsResult` |
| PUT | `/api/v1/settlement-drafts` | JWT | `UpsertSettlementDraftInput` | `SettlementDraft` |
| DELETE | `/api/v1/settlement-drafts/:id` | JWT | — | 204 |
| GET | `/api/v1/me/contacts?q=&take=` | JWT | `ListContactsQuery` | `ListContactsResult` |
| PATCH | `/api/v1/me/contacts/:id` | JWT | `UpdateContactInput` | `SettlementContact` (충돌 409) |
| DELETE | `/api/v1/me/contacts/:id` | JWT | — | 204 (`participant.contactId` SetNull) |
| **GET** | `/share/settlements/:token`, `/s/:token` | **none** | — | `text/html` — 빌드 index.html 에 OG 메타 주입 (만료/없음 → 일반 OG 폴백) |
| **GET** | `/share/settlements/:token/image.png`, `/s/:token/image.png` | **none** | — | `image/png` 정산표 카드 (만료/없음 → 404), `Cache-Control: public, max-age=300` |
| GET | `/.well-known/apple-app-site-association` | none | — | JSON (env 미설정 시 404) |
| GET | `/.well-known/assetlinks.json` | none | — | JSON array (env 미설정 시 404) |

> 공유 HTML/PNG 라우트(`/share/settlements/*`, `/s/*`)는 **`/api/v1` prefix 밖**의 루트 경로다 — `share-preview.ts` 의 `registerSharePreview(app)` 가 `app.ts` 에서 명시 등록(autoload 우회). 메신저가 짧은 `/s/:token` 도 펼칠 수 있게 별칭을 둔다.

폐기: `PATCH /api/v1/settlements/:id/participants` — `PUT /:id` 가 대체.

에러 매핑 (`throwAsHttp`):
- `settlement-extraction`: `invalid_image`/`invalid_token` → 400, `image_not_found`/`restaurant_not_found` → 404, `no_provider` → 503, `llm_failed` → 502
- `settlement`: `not_found`/`restaurant_not_found` → 404, `forbidden` → 403, **`expired` → 410**, `invalid_participant`/`invalid_round`/`invalid_receipt_token` → 400
- `settlement-draft`: `not_found` → 404, `forbidden` → 403, 그 외 → 400
- `contact`: `not_found`/`forbidden`/`conflict` → 404/403/409, `invalid_input` → 400

## Data [coverage: high — 14 sources]

**Prisma 모델 6개** (전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma)):

- **`SettlementSession`** (`settlement_sessions`) — `userId`, `restaurantPlaceId`/`restaurantName` (1차 식당 스냅샷, `rounds[0]` 과 동기화), `grandTotal`, `shareToken? @unique`, **`shareExpiresAt? DateTime`** (만료 시각, null=무제한/구버전 호환), **`shareOgImage? String`** ('restaurant'|'table'|null), **`shareOgImageUrl? String`** (갤러리에서 고른 식당 사진 원본 URL, null=토큰 시드 랜덤), `editedAt?`, `createdAt`, `updatedAt`. user `onDelete: Cascade`.
- **`SettlementRound`** (`settlement_rounds`) — `sessionId`, `orderIndex`, `restaurantPlaceId`/`restaurantName` (차수 식당 스냅샷), `source`('MANUAL'|'RECEIPT'), `totalAmount?`, `warning?`, `receiptImageToken?`, `itemsSubtotal`, `discountAmount?`, `discountCategory?`, `categoryAdjustments?` (JSON). session `onDelete: Cascade`.
- **`SettlementItem`** (`settlement_items`) — `roundId`, `name`, `unitPrice?`, `quantity?`, `amount`, `category`, `matchedMenuName?`, `orderIndex`. round `onDelete: Cascade`.
- **`SettlementParticipant`** (`settlement_participants`) — 마스터 명단. `sessionId`, `name?`, `nickname?`, `excludeAlcohol/NonAlcohol/Side` (default), `shareAmount` (grand total per person), `orderIndex`, `contactId?`. contact `onDelete: SetNull`.
- **`SettlementRoundParticipant`** (`settlement_round_participants`) — round × 마스터 참여자 join. `roundId`, `participantId`, `attended`, `excludeAlcoholOverride?`/`NonAlcohol`/`Side`, `shareAmount`. 유니크 `(roundId, participantId)`.
- **`SettlementContact`** (`settlement_contacts`) — 유니크 `(userId, normalizedKey)`.
- **`SettlementDraft`** (`settlement_drafts`) — 서버 임시저장. `userId`, `placeIdKey` (`''` sentinel), `payload`(JSON), `placeNameHint?`. 유니크 `(userId, placeIdKey)`, 인덱스 `(userId, updatedAt)`. user `onDelete: Cascade`.

**영수증 파일** — `apps/friendly/data/receipts/<token>.jpg`. 토큰 `randomUUID()`. sharp EXIF rotate + ≤1600px + JPEG 80 + mozjpeg. 분할 입력일 땐 `cropForSplit` 가 X 축 N등분.

**OG 폰트** — `apps/friendly/assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf`. satori 는 system 폰트를 못 써 ttf 버퍼를 명시 주입해야 한다 — `settlement-card.ts` 가 후보 경로(dev src / prod dist 양쪽)로 찾아 프로세스 수명 1회 캐시.

**`shareToken`** — 이번 라운드에 **7바이트 `randomBytes` → base64url 10자**로 축소(이전 32바이트 43자). 만료(`shareExpiresAt`)가 항상 걸려 노출 창이 닫혀 짧아도 안전. unique 충돌 시 5회까지 재생성. 회수 = `null` + `shareExpiresAt=null`. 재발급 = 새 randomBytes(이전 토큰 영구 무효). route 의 `TokenParams` 하한을 `min(8)` 으로 낮춰 신·구 토큰 모두 조회된다.

**`ShareTtl` → ms** — `SHARE_TTL_MS` `{ '1d', '7d', '30d' }`. `createShare` 마다 `Date.now() + SHARE_TTL_MS[ttl]` 로 만료 갱신(연장).

**OG 이미지 선택 로직** (`pickRestaurantOgImageUrl`):
- `mode='table'` → `null` (호출부가 정산표 PNG `.../image.png` 로 폴백).
- `mode='restaurant'` (기본) → `collectCandidateImageUrls` 후보 중에서: `shareOgImageUrl` 이 후보에 살아 있으면 그것, 아니면 `images[seedFromToken(token) % images.length]` (토큰 시드 결정적 랜덤 — 같은 링크는 항상 같은 사진, 카카오 OG 캐시와 일관). 후보가 0장이면 null → 정산표.
- 결과 URL 은 thumbnail 프록시(`?url=...&w=1200&q=80`)로 감싼다.

**공유 미리보기 캐시** (`sharePreviewCache`) — OG 크롤러가 같은 링크를 짧은 시간에 여러 번 펼치므로 `(token, origin)` 키(`"${token} ${origin}"`)로 결과를 **5분 TTL** 캐시(성공 non-null 만). owner 가 share 갱신/회수하면 `invalidateSharePreview(token)` 이 그 토큰의 모든 origin 변형 엔트리를 제거. 메모리 상한 5,000 초과 시 통째 비움. 단일 인스턴스 전제(CLAUDE.md) — Redis 불필요.

**`categoryAdjustments` 직렬화** — `serializeCategoryAdjustments` 가 입력 clientId 를 db id 로 치환해 `{ [Category]: { leftoverParticipantId, roundUnit } }` JSON 으로. 매칭 안 되는 clientId 는 조용히 drop.

**`editedAt`** — PUT update 시에만 갱신. `updatedAt` 은 share token 발급/회수에서도 자동 bump 되어 부적합.

**Zustand persist 스토어** ([settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)) — storage 어댑터 주입(앱 AsyncStorage / 웹 sessionStorage / no-op). **version: 4** migration (v1→v2 rounds 배열, v2→v3 discount, v3→v4 categoryAdjustments).

**Migrations 11개** (시간순, settlement 관련):
1. [`20260523012752_add_settlement_models`](../../apps/friendly/prisma/migrations/20260523012752_add_settlement_models/migration.sql)
2. [`20260523030833_add_settlement_share_token`](../../apps/friendly/prisma/migrations/20260523030833_add_settlement_share_token/migration.sql)
3. [`20260524000000_add_settlement_contacts`](../../apps/friendly/prisma/migrations/20260524000000_add_settlement_contacts/migration.sql)
4. [`20260524112443_add_settlement_edited_at`](../../apps/friendly/prisma/migrations/20260524112443_add_settlement_edited_at/migration.sql)
5. [`20260525100000_add_settlement_rounds`](../../apps/friendly/prisma/migrations/20260525100000_add_settlement_rounds/migration.sql)
6. [`20260525110000_add_settlement_round_discount`](../../apps/friendly/prisma/migrations/20260525110000_add_settlement_round_discount/migration.sql)
7. [`20260525220309_add_settlement_round_category_adjustments`](../../apps/friendly/prisma/migrations/20260525220309_add_settlement_round_category_adjustments/migration.sql)
8. [`20260525235559_add_settlement_drafts`](../../apps/friendly/prisma/migrations/20260525235559_add_settlement_drafts/migration.sql)
9. **[`20260529215653_add_settlement_share_expiry`](../../apps/friendly/prisma/migrations/20260529215653_add_settlement_share_expiry/migration.sql)** (NEW) — `shareExpiresAt` 추가.
10. **[`20260601090100_add_share_og_image`](../../apps/friendly/prisma/migrations/20260601090100_add_share_og_image/migration.sql)** (NEW) — `shareOgImage TEXT`.
11. **[`20260601120000_add_share_og_image_url`](../../apps/friendly/prisma/migrations/20260601120000_add_share_og_image_url/migration.sql)** (NEW) — `shareOgImageUrl TEXT`.

## Key Decisions [coverage: high — 19 sources]

시간순 진화 (MVP → 공유 → 단골 → 편집+배지 → N차/할인/임시저장/모바일/딥링크 → **OG 공유 대확장/perf/OCR 회귀**):

**MVP 진입 (2026-05-23)** — 카테고리별 풀 + 제외 플래그 분배 알고리즘, 영수증 vision 추출, 서버 권위 + 클라 미리보기, 토큰 server 발급 + 정규식 검증, 멱등 shareToken, shared 응답에서 userId/receiptPreviewUrl 제거.

**단골 자동 적립 (2026-05-24)** — `(userId, normalizedKey)` upsert + 클라 contactId 힌트 미신뢰, 삭제 SetNull, backfill 멱등.

**차수(N차) 정산 + 할인/분담다듬기/분할영수증/서버임시저장/모바일/딥링크 (2026-05-25~28, 14차 컴파일)** — 세션 vs 차수 분리, 마스터 vs 차수 attendance 이중 구조, `calculateMultiRoundShares`, leftover/roundUnit 분담 다듬기, 한 사진 N등분, `SettlementDraft` 다기기 동기화, PUT 전체 replace, expo-router 풀 구현, Universal/App Links. (자세한 결정 이력은 14차 본문 보존.)

**공유 OG 미리보기 (SSR-lite, 2026-05-31 16차 핵심)**
- **메타만 주입, 풀 SSR 아님** — 웹은 순수 Vite SPA 라 크롤러가 JS 없이 index.html 을 긁으면 OG 가 비어 보인다. `share-preview.ts` 가 `/share/settlements/:token`·`/s/:token` 을 가로채 빌드된 index.html 의 `<title>` 을 교체하고 `</head>` 앞에 OG 메타를 삽입해 반환한다. 실제 사용자도 같은 HTML 위에서 SPA 가 평소대로 부팅. 자산은 nginx 정적 서빙 그대로.
- **루트 경로 + autoload 우회** — `/api/v1` prefix 밖이라 `registerSharePreview(app)` 를 `app.ts` 에서 명시 호출(라우트 autoload 대상 아님). 짧은 `/s/:token` 별칭으로 메신저 펼침 호환.
- **index.html 경로 탐색** — dev(tsx, src 실행)와 prod(tsup 번들, dist) 가 __dirname 이 달라 고정 상대경로 하나로는 둘 다 못 맞춘다. __dirname/cwd 에서 위로 7단계 올라가며 `apps/web/dist/index.html`·`web/dist/index.html` 후보를 만들어 처음 읽히는 것을 쓰고 프로세스 수명 동안 캐시(`WEB_INDEX_PATH` 가 있으면 그것만). 못 읽으면 시도 경로 전부를 로깅 + 500.
- **프라이버시** — OG 메타에 참가자 '이름' 은 넣지 않는다(식당명 + 총액 + 인원수만). 크롤러 캐시에 이름이 박제되지 않도록.
- **og:url 은 요청 host + X-Forwarded-Proto 파생** — 도메인 하드코딩 없음(test 로 검증). host 미존재 시 `ninelife.kr` 폴백(운영 도메인 nlpp.easypcb.co.kr → ninelife.kr 이전).
- **og:image 크기 의도적 생략** — 브랜드 이미지를 교체해도 메타가 어긋나지 않게 크롤러가 직접 감지하게 둔다.

**정산표 PNG 서버 렌더 (settlement-card.ts)**
- **satori + resvg** — display:table 이 없는 satori 한계상 모든 셀을 고정폭 flex 박스로 깔아 격자를 만든다(열 너비 합이 행마다 같아 세로선 정렬). resvg 가 SVG→PNG. 분담 계산은 화면 `SettlementBreakdownTable` 의 useMatrix 를 `computeMatrix` 로 포팅 — 같은 `calculateMultiRoundShares` 라 웹·앱·서버 결과 100% 동일.
- **폰트 명시 번들** — satori 는 system 폰트를 못 써 IBM Plex Sans KR Regular/Bold ttf 를 후보 경로로 찾아 주입. 한글 글리프 커버.
- **폭 적응 스케일** — 표가 넓을수록 2x 는 과하므로 width>900 → 1x, >640 → 1.5x, else 2x 로 PNG 크기 억제하되 좁은 표는 또렷하게. height 미지정 → satori 자동 계산(참여자/차수 많아도 안 잘림).
- **캐시 정책** — `Cache-Control: public, max-age=300`. 편집은 드물고 크롤러 신선도엔 5분이면 충분 — editedAt 기반 ETag 까지는 가지 않는다(메신저가 OG 이미지를 자체적으로 더 길게 캐시).

**OG 이미지 선택 (식당 사진 / 정산표 / 갤러리 고정 / 토큰 시드 랜덤)**
- **기본 식당 사진** — `shareOgImage='restaurant'` 가 기본. 참가자 이름이 미리보기/크롤러 캐시에 안 박혀 프라이버시상 유리(정산표 PNG 는 이름이 보이지만 공유 페이지를 열면 어차피 보임 — 크롤러 캐시 박제만 회피).
- **갤러리 특정 1장 고정 vs 토큰 시드 랜덤** — owner 가 다이얼로그 갤러리에서 사진을 탭하면 `shareOgImageUrl` 에 원본 URL 고정. 미선택('랜덤')이면 `seedFromToken(token) % images.length` 로 결정적 랜덤 — 같은 링크는 매 크롤마다 같은 사진(카카오 OG 캐시 일관). 후보 목록에서 사라진 URL 은 share 시 정리(null).
- **트라이스테이트 ogImageUrl** — `undefined`=기존 유지 / `null`=선택 해제(랜덤) / URL=고정. shared API/service/route 가 모두 이 3-state 를 보존(다이얼로그가 열릴 때마다 본문 없이 POST 해도 owner 선택이 덮이지 않게).
- **후보 수집 경량화 + 상한** — `collectCandidateImageUrls` 가 `getPhotoUrls`(snapshot-only)로 네이버 호스트(thumbnail-proxyable)만, dedup + 최대 12장. 깨진 snapshotJson 은 해당 식당만 skip.

**공유 만료 (ttl)**
- **무제한 없음** — `ShareTtl` 1d/7d/30d 프리셋만. 모든 링크가 최대 30일 내 만료되어 짧은 토큰(10자)으로도 brute-force 노출 창이 닫힌다. 만료 링크는 410(`expired`) — FE 가 404(잘못된 주소)와 구분.
- **createShare 마다 만료 갱신** — 멱등 토큰을 유지하되 호출 ttl 기준으로 `shareExpiresAt` 를 연장. owner 가 다이얼로그에서 기간을 바꾸면 같은 링크의 수명만 늘어난다.

**백엔드 perf (이번 라운드)**
- **resolveRestaurantName 경량화** — getPublicDetail(양쪽 출처 전체 리뷰 코퍼스 + summary join + snapshotJson 파싱 + merge) 대신 `restaurant.findUnique(select:name)` 스칼라. mergeName 결과와 값 동일.
- **create 준비 단계 병렬** — placeId 단위 이름 캐시(`resolveName` 메모이즈) + `Promise.all` 로 firstRound/round 이름을 한 번에. 같은 식당이 여러 차수면 1회만 조회. 이름 해석을 토큰 검증보다 먼저 해 기존 에러 우선순위(restaurant_not_found 404 > invalid_receipt_token 400) 보존.
- **attendee createMany 배칭** — R×P 개 attendee 를 차수마다 1회 `createMany` 로 묶어 트랜잭션 write 왕복 축소. clientId 유일성 보장 덕에 루프 인덱스가 shareAmounts 인덱스와 동일(과거 findIndex 제거).
- **getSharePreviewMeta 경량 select + 캐시** — 풀 로우(rounds→items/attendees) 대신 메타 컬럼 + `_count.participants` + rounds[].placeId 만 읽고 (token,origin) 5분 캐시로 OG 크롤러 반복 펼침을 흡수.
- **draft hydrate placeId당 1회** — `useSettlementDraftHydrate` 가 한 placeId 에 대해 단 한 번만 store 를 덮어쓴다(`hydratedForRef`). 자동 저장이 list 를 invalidate→refetch 해도 같은 컨텍스트면 재hydrate 안 함 — 저장 in-flight 중 옛 서버 스냅샷이 사용자 입력을 밀어내는 레이스 + 저장마다 store 전역 리렌더 방지.

**영수증 OCR 빈 항목 회귀 수정 (EXTRACTION_VERSION 2→3)**
- **소극적 프롬프트 제거** — "읽기 어려우면 빼라 / items 가 빈 배열이어도 된다" 같은 지시가 qwen3-vl 류 vision 모델에서 항목을 통째로 비우는 회귀를 유발. "영수증에 보이는 상품/메뉴 줄을 하나도 빠짐없이 추출" 로 전환. 출력 형식은 `format=schema` 가 강제하므로 장황한 JSON 포맷 규칙도 축소. (probe-vision 으로 검증.)

**기타 환경**
- **dev CORS 전면 반사 (15차 정착)** — `cors.ts` 가 모든 origin 을 반사 허용하고 비-LAN origin 만 origin당 1회 warn. 이전 화이트리스트 `cb(Error)` 거부가 로그인 preflight 를 깨던 회귀 해소(Expo Web 모바일 단말 LAN IP 대응).
- **운영 도메인 이전 + 배포 스크립트** — nlpp.easypcb.co.kr → ninelife.kr. host 미존재 시 OG og:url 폴백 도메인도 ninelife.kr. `deploy.sh`(케이스 번호 선택) 추가.

## Gotchas [coverage: high — 12 sources]

- **공유 라우트는 두 군데로 나뉜다** — 인증 JSON 조회 `GET /api/v1/share/settlements/:token`(settlement.route.ts) 와 비인증 OG HTML/PNG `GET /share/settlements/:token`·`/s/:token`(share-preview.ts, prefix 밖)가 별개. 토큰 형식·만료 규칙은 같지만 등록 위치/응답 타입이 다르다. PNG 라우트는 `getBySharedToken` 을 거치므로 만료/없음이면 자동 404.
- **index.html 못 찾으면 500 + 시도 경로 로깅** — dist 미빌드/경로 오설정 시 `share-preview` 가 후보 경로 전부와 cwd 를 error 로그로 남기고 500. 운영에서 `WEB_INDEX_PATH` 명시 지정 권장.
- **OG 폰트 못 찾으면 PNG 렌더 실패 500** — `settlement-card.ts` 가 `assets/fonts/IBMPlexSansKR-*.ttf` 를 후보 경로로 찾는다. prod 번들 시 폰트 파일이 dist 옆에 같이 배포돼야 한다(tsup 이 ttf 를 안 옮기므로 별도 복사 필요).
- **sharePreviewCache 무효화는 owner 액션에서만** — owner 가 `createShare`/`revokeShare` 하면 `invalidateSharePreview(token)`. 그 외 경로(예: 세션 직접 PUT 으로 식당이 바뀜)에서는 캐시가 최대 5분 stale 할 수 있다. OG 정확도엔 5분 허용 범위.
- **shareOgImageUrl 은 후보에 살아 있어야 적용** — owner 가 고른 사진이 식당 사진 목록(getPhotoUrls)에서 사라지면(스냅샷 갱신 등) `createShare` 가 `null` 로 정리하고 토큰 시드 랜덤으로 폴백. UI 의 '선택됨' 표시도 다음 share 호출 때 사라진다.
- **shareToken 10자로 축소 + route 하한 min(8)** — 신 토큰(10자)과 구 토큰(43자) 모두 `TokenParams.min(8).max(64)` 안에 들어와 그대로 조회된다. 하한을 더 올리면 옛 링크가 깨진다.
- **차수 attendee 의 마스터→인덱스 변환** — 입력 시 `participantClientId`, 저장 시 db id, 계산기는 참석자 배열 인덱스. categoryAdjustments 의 `leftoverParticipantClientId` 가 그 차수 비참석 마스터를 가리키면 calculator 가 첫 활성자 fallback. zod 가 아니라 service/calculator 가 정합성을 떠받친다.
- **`roundUnit` 안전망** — UI/zod 가 활성 조건을 검사해도 calculator 는 안 떨어지는 값이 들어오면 무시(잔여 가산 모드)로 crash 회피.
- **할인 페어 일관성** — `discountAmount`/`discountCategory` 양쪽 null 또는 양쪽 set, 풀 음수도 refine 가 거부. calculator 의 `Math.max(0,…)` 는 안전망.
- **영수증 토큰 IMAGE_TOKEN_PATTERN 두 곳 복사** — `settlement.service` 와 `settlement-extraction.service` 가 동일 정규식을 따로 둔다(모듈 결합도 축소). 변경 시 두 곳.
- **`normalizedKey` 정의 4곳 복사** — server `normalizeContactKey` SSOT + 클라 두 파일 + backfill. 바꾸려면 4곳 동시에.
- **`editedAt` 과 `updatedAt` 분리** — `@updatedAt` 은 share token 발급/회수에도 bump 되어 '수정됨' 배지에 부적합.
- **draft payload 자유형 → 형 검증은 클라** — 서버는 z.unknown() + 200KB 만 본다. hydrate 시 `Array.isArray(p.participants)` 등 type guard 로 방어.
- **draft hydrate placeId당 1회** — `hydratedForRef` 가 같은 placeId 재hydrate 를 막는다. placeId 가 바뀌면 다시 허용. 이 가드가 없으면 자동 저장 refetch 가 입력을 옛 스냅샷으로 덮어쓴다.
- **Vision LLM 타임아웃 별도** — `VISION_TIMEOUT_MS=60_000` + `AbortController` 시그널을 `provider.complete({ signal })` 에 묶음.
- **Preview 라우트 JWT 필요 → `<img src>` 직접 불가** — `useReceiptPreviewUrl` 가 fetch → Blob → objectURL(웹) / FileReader data URL(앱, RN Image 가 objectURL 못 받음). 반환값을 Lightbox 로 그대로 확대.
- **`SharedSettlementSession` 은 omit 페어** — round 에서 `receiptPreviewUrl`/`receiptImageToken` 제거. `SettlementCards`/`settlement-card.computeMatrix` 가 두 type 을 구조적 subtyping 으로 같이 받으므로 의도적으로 그 필드를 안 본다.
- **`split.count` 가 1 또는 metadata 비면 cropForSplit no-op** — 잘못 count=1 로 보내도 안전, 원본 LLM 전달.
- **카카오톡 '복사' 는 클립보드 PNG 일 뿐** — 카카오 SDK 미연동이라 톡을 직접 열지 않고 붙여넣기 안내만. Safari 제스처 만료 회피를 위해 `ClipboardItem` 에 `Promise<Blob>` 를 그대로 넘겨 클립보드 쓰기 '안'에서 fetch 가 받아오게 한다.
- **AASA/assetlinks 미설정 시 404** — 빈 JSON 200 이면 iOS/Android 검증이 통과해 잘못된 권한을 얻으므로 의도적 404.

## Sources [coverage: high — 103 sources]

**Backend — settlement-extraction 모듈**
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.test.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.test.ts)

**Backend — settlement 모듈**
- [apps/friendly/src/modules/settlement/settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)
- [apps/friendly/src/modules/settlement/settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts)
- [apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts)
- [apps/friendly/src/modules/settlement/share-preview.test.ts](../../apps/friendly/src/modules/settlement/share-preview.test.ts)
- [apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts)
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
- [apps/friendly/src/app.ts](../../apps/friendly/src/app.ts)
- [apps/friendly/src/config/env.ts](../../apps/friendly/src/config/env.ts)
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
- [apps/friendly/prisma/migrations/20260529215653_add_settlement_share_expiry/migration.sql](../../apps/friendly/prisma/migrations/20260529215653_add_settlement_share_expiry/migration.sql)
- [apps/friendly/prisma/migrations/20260601090100_add_share_og_image/migration.sql](../../apps/friendly/prisma/migrations/20260601090100_add_share_og_image/migration.sql)
- [apps/friendly/prisma/migrations/20260601120000_add_share_og_image_url/migration.sql](../../apps/friendly/prisma/migrations/20260601120000_add_share_og_image_url/migration.sql)

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
- [useReceiptPreviewUrl.ts](../../apps/web/src/routes/settlement/useReceiptPreviewUrl.ts)
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
- [apps/mobile/src/hooks/useReceiptPreviewUrl.ts](../../apps/mobile/src/hooks/useReceiptPreviewUrl.ts)
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts)
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md)
