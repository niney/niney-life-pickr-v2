---
topic: settlement
last_compiled: 2026-10-10
sources_count: 146
status: active
aliases: [정산, 정산하기, settlement, perf-2, 성능 감사 2차, G-V1, G-3, F-V2, 임시저장 이어쓰기, by-place, useSettlementDraftByPlace, GetSettlementDraftQuery, GetSettlementDraftResult, SettlementDraftMeta, byteSize, UpsertSettlementDraftResult, applySavedDraft, utf8ByteLength, SETTLEMENT_DRAFT_MAX_PAYLOAD_BYTES, SETTLEMENT_DRAFT_MAX_TOTAL_BYTES, octet_length, too_large, 수정 모드 덮어쓰기, enabled-hydrate, 영수증 일일 한도, SETTLEMENT_EXTRACT_DAILY_LIMIT, MealDailyQuotaService, settlement-extraction quota, RECEIPT_UPLOAD_RATE, RECEIPT_EXTRACT_RATE, receipts-retention, cleanupUnreferencedReceipts, RECEIPT_RETENTION_DAYS, receipt-heic, decodeHeicToJpeg, heifDimensions, HeicBusyError, MAX_HEIC_PIXELS, heic-worker, loadSharp, prepareReceiptImage, RECEIPT_MAX_UPLOAD_BYTES, RECEIPT_TOO_LARGE_MESSAGE, share-render, SharePngCache, ShareRenderBusyError, loadPlexOnlyFonts, buildSettlementCardTree, CARD_MAX_PARTICIPANT_ROWS, CARD_MAX_TABLE_WIDTH, CARD_MAX_PIXELS, isCardTruncated, cardScale, 외 n명, useDeleteSettlements, keepPrevious, 헛조회, share-bill, receipt-split, 영수증 추출, 단골, contact, share token, edited badge, rounds, N차, settlement-draft, draft-autosave, multi-receipt, MultiReceiptSplitDialog, RoundDiscountEditor, RoundCategoryAdjuster, SettlementBreakdownTable, RoundExceptionsEditor, leftover-routing, roundUnit-100-1000, calculateMultiRoundShares, fromDraftId, EXTRACTION_VERSION, thinkOptionForModel, buildLlmProviderEnv, ExtractReceiptSplit, roundIndex, roundTotal, universal-links, app-links, deep-link, settlement-mobile, RestaurantSearchDialog, confirm-dialog, attendees-100, items-200, share-preview, OG, og:image, settlement-card, satori, resvg, IBMPlexSansKR, ShareTtl, ShareOgImage, shareOgImageUrl, share-expiry, kakao-copy, receipt-lightbox, sharePreviewCache, group-split, 세부 분배, 그룹 카드, drink-kinds, 술 종류, 소주, 맥주, 잔수, glasses, GLASSES, EQUAL, RoundGroupSplitEditor, RoundGroupSplitNote, suggestItemGroups, matchDrinkKind, DRINK_KINDS, DRINK_BRAND_PROMPT_HINT, isGroupableCategory, GROUPABLE_CATEGORIES, toGroupCalcInputs, groupBreakdown, leftover-multi-receiver, 참여 칩, 긍정형 토글, 참여 배지, ParticipationChips, ParticipationToggles, ParticipationBadges, PARTICIPATION_AXES, participationAxis, participationBadgeAxes, draftParticipationBadgeAxes, sessionParticipationBadgeAxes, settlement.labels, SETTLEMENT_CATEGORY_LABEL, SETTLEMENT_CATEGORY_OPTION_LABEL, uncategorizedNote, 기타 설명, 기타(모두 나눔), 술·음료·안주·기타]
---

# settlement — 정산하기 도메인

**2026-10-05 변경 흡수 — 성능 감사 2차: 임시저장 목록 메타화 + 이어쓰기 단건 GET(`622bfca2`), 영수증 남용 상한·HEIC 공용 워커(`622bfca2`·`0157da60`), 정산 카드 상한·공유 렌더 공용화(`78cbb457`), 웹 헛조회 축소 + 수정 모드 덮어쓰기 수정(`82d455c7`) — 서버·웹·앱(OTA) 동시 배포 필요**: (1) **임시저장(G-V1)** — `GET /api/v1/settlement-drafts` 가 사용자당 최대 50건의 payload 전체를 매번 내려 줘 응답 30.7MB·335ms(동시 4건 RSS 833MB)였다. 이제 목록은 **메타만**(`SettlementDraftMeta` = id·placeId·placeNameHint·시각 + `byteSize`, 크기는 payload 를 DB 밖으로 꺼내지 않고 `octet_length(payload)` 원시 SQL 로) → 9KB·42ms. 이어 입력할 payload 는 새 **`GET /settlement-drafts/by-place?placeId=`**(생략 = 식당 미지정 슬롯, 없으면 `{ draft: null }` 200) 단건으로 받는다. 크기 검사는 JSON 글자 수가 아니라 **UTF-8 바이트** 200KB(`utf8ByteLength` — 글자 수로 재면 한글이 3배 600KB 까지 들어갔다) + 새 **사용자 합계 2MB**(`too_large` 409, 같은 슬롯을 줄여 덮어쓰기는 허용). PUT 응답은 payload 를 되돌려 보내지 않고 `{ id, updatedAt }` 만(`UpsertSettlementDraftResult`) — shared `applySavedDraft` 가 보낸 입력으로 이어쓰기·목록 캐시를 채운다. `useSettlementDraftHydrate` 는 목록 대신 슬롯 쿼리 `useSettlementDraftByPlace`(staleTime 0, 진입마다 서버 최신)를 본다. 계약이 바뀌어 **구 앱은 서버 임시저장을 복원하지 못한다** — 서버·웹·앱 OTA 를 같이 낸다. (2) **영수증(G-3)** — 업로드·추출에 라우트 레이트리밋(IP 분당 20씩), 추출에 **사용자 일일 한도 `SETTLEMENT_EXTRACT_DAILY_LIMIT`(기본 50, KST 자정, 0=무제한, 초과 429)** — 식단의 SQLite 원자 카운터 `MealDailyQuotaService`(`meal_daily_quotas`, purpose `settlement-extraction`)를 그대로 쓰고, 이미지·모델 확인을 통과한 뒤 비전 호출 직전에만 1회 차감(분할 추출은 영역마다 1회). 어떤 정산 차수(`receiptImageToken`)·임시저장 payload 도 참조하지 않는 영수증 파일은 **매일 04:20 KST `receipts-retention` cron 이 30일(mtime) 뒤 지운다**(`cleanupUnreferencedReceipts`). HEIC 는 거부(415)하지 않고 일회용 worker 에서 디코드 + 2,500만 화소 사전 검사(초과 400) — 이벤트 루프 공백 359~433 → 22~46ms. 처음엔 자체 워커·게이트(`receipt-heic.ts`, 동시 1·대기 4)였으나 같은 날 `0157da60` 이 식단 공용 워커 [`lib/heic-worker.ts`](../../apps/friendly/src/lib/heic-worker.ts) 위 얇은 어댑터로 바꿔 **식단·영수증이 프로세스 전역 동시 1건(대기 8, 대기 60초)** 을 함께 쓴다(24MP 디코드 피크 ≈ +350MB 가 겹치지 않게). 해상도 파서도 HEIF 표준 경로(meta → iprp → ipco → ispe)로. sharp 는 첫 업로드 때 import(X-3). (3) **정산 카드 PNG(F-V2)** — 계약 상한(참여자 100·차수 10) 그대로 그리면 100명×10차 미스 1회 5.3초 블로킹·RSS +770MB 였다. 이제 **앞 30명 + '외 n명' 합계 행**, 카테고리 열까지 펼친 폭이 1,600px 를 넘으면 **차수 소계 열만**(머리글 말줄임), 래스터 면적 4MP 상한(`cardScale`). 31명 이상 정산의 og:image 는 정산표 대신 기본 이미지(`isCardTruncated`, '이미지로 보내기'는 그대로 카드). 렌더는 공용 [`lib/share-render.ts`](../../apps/friendly/src/lib/share-render.ts)(satori·resvg 사용 시점 import, `loadSystemFonts:false`, `renderAsync`, 프로세스 전역 렌더 동시 1·대기 16 초과 503) — 100명×10차 3,580 → 130ms·PNG 3.1MB → 364KB. PNG 캐시는 개수 LRU(max 200) → 바이트 상한 `SharePngCache`(6MB·30분 + 같은 키 진행 중 합류), 캐시 키는 `updatedAt`·만료만 읽는 가벼운 조회로 만들고 풀 로우는 미스일 때만, 이미지 라우트에 `RATE.publicShare`(120/분) 신설. 폰트는 자체 `loadFonts` 를 걷고 `lib/share-fonts` 의 `loadPlexOnlyFonts`(늘 같은 배열 — satori 파싱 캐시를 탄다)로. (4) **웹·앱 헛조회 축소 + 버그 4건(`82d455c7`)** — 수정 모드에서 **"식당 미지정" 임시저장이 편집 중인 정산을 덮어쓰던 버그**: 웹·앱이 `useSettlementDraftHydrate(!isEdit ? placeId : null)` 로 끄려 했지만 `null` 은 "끔"이 아니라 식당 미지정 슬롯이라, 그 슬롯에 남은 임시저장이 세션 hydrate 뒤에 도착하면 편집 내용을 덮어썼다 → 훅에 `{ enabled }` 옵션을 두고 수정 모드에서 끈다(웹 `SettlementNewPage`·앱 `SettlementWizard`). 그 밖에 영수증을 한 번 올린 뒤 "다른 사진" 이 열 파일 입력이 없던 것(입력을 항상 마운트), 단골 모달에서 검색어를 바꾸면 앞서 고른 사람이 세어지기만 하고 추가되지 않던 것(선택을 id Set → 본체 Map), 분할 영수증 업로드 실패가 표시 없이 지나가던 것. 헛조회: 웹이 업로드 전 영수증을 **장변 2000px JPEG 로 줄이고**(새 `prepareReceiptImage`, 5MB 초과는 올리기 전 안내), 닫힌 다이얼로그·포커스 없는 자동완성은 조회하지 않으며(참여자 행마다 돌던 단골 검색, 메뉴 선택의 식당 상세, 식당 검색), 단골 검색 250ms 디바운스 + `keepPrevious`, 저장 응답을 상세 캐시에 심고 무효화는 목록만, 일괄 삭제는 끝난 뒤 한 번만(`useDeleteSettlements`), 자동저장은 타이머가 터질 때 한 번만 직렬화. 웹 테스트 새 파일 9개(+ shared `useSettlementDraft.test`), 앱은 타입체크만. (5) 28차 미수정 지적 "`settlement-card.ts` 가 자체 loadFonts 라 한자 대체·캐시 못 받음" 은 **반만 해소** — 폰트 읽기·satori 파싱 캐시는 공용으로 받지만, 한자 대체 글꼴(`loadShareFallbackAsset`)은 결과가 앞서 그린 타로·사주 카드에 좌우되지 않게 일부러 붙이지 않아 식당명·항목명의 한자는 여전히 □ 다. 계획·수치: [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) 2차(G-V1)·3차(F-V2)·7차(G-3) 와 "모듈 묶음 → ops / share"·"통합 정리" 절.

**2026-09-25~10-04 변경 흡수 — 참여 표시를 긍정형 토글 칩으로(`237acd5`) + 참여 배지 차수 단위 판정·뺀 칩 다크 모드(`f1422fd`) + 분류 이름 단일 소스 `settlement.labels.ts`·정산표 기타 설명(`d7f4ac1`), 저장값·서버·DB 동작 변경 없음**: (1) 참여자의 "주류 안 함 / 비주류 안 함 / 안주 안 먹음" 체크박스(체크=빠짐이라 읽기 불편)를 **"술·음료·안주" 토글 칩**으로 뒤집었다 — 기본 켜짐, 안 먹은 사람만 눌러 끔이라 탭 수는 같다. 저장값은 여전히 `excludeAlcohol/NonAlcohol/Side`(화면에서만 켜짐 = `!exclude`). 축 라벨·동사(`마심/안 마심`, `먹음/안 먹음`)는 새 [participation.ts](../../packages/shared/src/settlement/participation.ts) 의 `PARTICIPATION_AXES` 가 단일 소스, 표현은 웹 [ParticipationChips.tsx](../../apps/web/src/routes/settlement/ParticipationChips.tsx)(lucide 아이콘 + `aria-pressed`)·앱 [ParticipationChips.tsx](../../apps/mobile/src/components/settlement/ParticipationChips.tsx)(MaterialCommunityIcons + `accessibilityRole="switch"`)가 각자 — Step1 참여자 행·"새 행 기본" 줄에 쓰인다. 켜짐은 연한 강조, 빠짐은 점선 테두리 + 취소선. 차수 특이사항 칩도 "술 안 마심 / 술 마심 / 안주 안 먹음" 문장으로, 단골 태그만 예외 표기 그대로 이름만 "술 X / 음료 X / 안주 X". (2) Step4 미리보기·결과·공유의 "주류 X" 를 **긍정 배지**(분담한 축)로 통일하고, 배지가 마스터 설정만 봐서 "지현: 술 안 마심" 특이사항을 넣어도 술 배지가 남던 어긋남(분담액 11,000원과 한 화면에서 모순)을 `participationBadgeAxes` **차수 단위 판정**으로 고쳤다 — 그 분류 항목이 있는 차수에 참석해 빠지지 않은 적이 있으면 배지, 그 차수들에서 누군가 빠졌을 때만 그 축을 띄운다(전원 나눈 축은 생략). 입력 중은 `draftParticipationBadgeAxes`, 저장·공유 세션은 `sessionParticipationBadgeAxes`. 뺀 칩은 `opacity-70` 을 걷고 점선 테두리를 진하게 해 다크 모드에서 사라져 보이던 문제를 풀었다. (3) 같은 `UNCATEGORIZED` 가 화면마다 "미분류"(항목 편집·Step4 풀·결과 카드)와 "기타"(정산표·할인·분담 다듬기·공유 PNG)로 달랐다 — 사본이 15개 파일에 흩어져 있었기 때문. 새 [settlement.labels.ts](../../packages/api-contract/src/settlement.labels.ts) 의 `SETTLEMENT_CATEGORY_LABEL`(술·음료·안주·기타)로 모으고, 항목 편집 선택지만 `SETTLEMENT_CATEGORY_OPTION_LABEL` 의 **"기타(모두 나눔)"**(새 행·메뉴 추가의 기본값이라 술을 분류하지 않고 넘어가 안 마신 사람까지 나눠 내는 실수를 줄이려고). `uncategorizedNote(rounds)` 가 정산표 아래 "* 기타: 1차 공기밥 · 2차 라면, 김밥 — 술·음료·안주 외 항목으로, 참석자 모두가 똑같이 나눕니다." 를 만들어 웹·앱 `SettlementBreakdownTable` 과 공유 PNG([settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts)) 세 곳에 붙인다 — 카톡으로 받는 사람은 PNG 만 보므로 거기가 가장 필요하다. 테스트: shared [participation.test.ts](../../packages/shared/src/settlement/participation.test.ts), 웹 [ParticipationChips.test.tsx](../../apps/web/src/routes/settlement/ParticipationChips.test.tsx)(칩 극성), friendly [settlement.labels.test.ts](../../apps/friendly/src/modules/settlement/settlement.labels.test.ts)(기타 설명 4건). 웹은 브라우저로 저장·결과까지 확인했지만 **앱 화면과 실제 공유 링크(`/s/:token`)는 미확인**(PNG 는 가짜 세션 렌더로만 확인). 영수증 추출 프롬프트의 "주류/비주류" 표현은 일부러 그대로(화면 라벨이 아니고, 바꾸면 `EXTRACTION_VERSION` 재검증이 필요).

**2026-08-22 변경 흡수 — 영수증 추출 호출에 사고(think) 끄기(`5cdbc0f`) + 라우트 env 조립 `buildLlmProviderEnv()`(`cc8399a`); `EXTRACTION_VERSION = 4` 현재값 확인**: (1) [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) 의 `provider.complete({ images, format: EXTRACTION_JSON_SCHEMA, … })` 에 **`think: thinkOptionForModel(model)`**(`@repo/utils`) 이 실렸다 — qwen3.5 같은 추론 모델이 출력 토큰을 사고에 다 써 `items` 가 빈 배열로 오던 손해(식단 사진 인식 작업 중 2026-08-22 실측으로 드러남 — "영수증 추출도 같은 손해를 보고 있었다"). gpt-oss 는 끌 수 없어 `'low'`, 그 외 모델은 `false`. 프롬프트·스키마는 그대로라 **`EXTRACTION_VERSION` 은 올리지 않았다**(호출 옵션만 변경 — 근거·판정표는 [ai](ai.md)). (2) [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) 의 자체 `buildEnvBlock` 리터럴이 [`llm-provider-env.ts`](../../apps/friendly/src/modules/ai/llm-provider-env.ts) 의 `buildLlmProviderEnv()` 로 교체 — purpose 는 여전히 `image`, 기본 모델 `.env.example` `OLLAMA_IMAGE_MODEL=qwen3.5:397b-cloud`. (3) 현재값 정합: `EXTRACTION_VERSION` 은 v2 roundHint(2026-05-28) → v3 소극적 지시 제거(`dbe9db2` 2026-06-01) → **v4 주류 브랜드 힌트(`7957818` 2026-06-10) = 현재 4**([prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts) 상단 v2~v4 주석과 일치). ai 토픽의 옛 표가 2 로 적혀 있던 것은 24차에서 정정됐다.

**2026-07-13~08-16 변경 흡수 — 감사 하드닝 3건(`bc2db00`) + 공유 토큰 패턴의 확산**: (1) 4차 — 정산 draft **사용자당 50개 상한**(초과 409) + api-contract 문자열·배열 max 전면 부여. (2) 5차 — settlement-extraction 경량화(과다로드 제거). (3) 6차 — 공유 정산표 PNG 에 **(token, updatedAt) 키 lru 캐시(max 200)**: 미편집 세션의 반복 og:image/공유 요청은 satori+resvg 재렌더 없이 캐시 응답, 편집 시 updatedAt 변경으로 즉시 반영. 9차 DEFERRED — 참여자 contact upsert 배치는 SQLite 단일 라이터 + 참여자 보통 <10 이라 이득 미미로 보류. 별개로 이 도메인의 **공유 토큰 설계(7바이트 base64url + TTL + /share/* 공개 라우트 + OG SSR-lite)** 가 그룹 투표([vote](vote.md), 2026-08-16)에 그대로 미러되며 리포의 공개 공유 표준 패턴이 됐다.

식당에서 일행이 영수증을 나눠 부담할 때 "주류 안 마신 사람은 술값 빼고" 같은 카테고리별 제외 규칙으로 자동 분배해 주는 도메인. 영수증 사진을 vision LLM 으로 OCR/분류하거나 직접 입력으로 만들고, 결과를 저장/공유/수정하며 정산에 자주 나오는 사람은 "단골" 로 자동 적립된다.

**2026-06-25 17차 컴파일 — 세부 분배(그룹 카드) + 술 종류 사전.** "주류 풀을 그냥 균등 분배" 가 아니라 **소주·맥주 같은 종류 그룹을 떼어내 마신 사람끼리만, 잔수 비례로** 나눌 수 있게 했다. 핵심 변경:

- **세부 분배 그룹(groupSplits)** — 한 차수의 카테고리 풀(주류/음료)에서 특정 항목들을 떼어내 그룹을 만들고, `EQUAL`(그룹 내 균등) 또는 `GLASSES`(정수 잔수 가중치 비례)로 그룹 멤버끼리만 나눈다. 그룹에 안 묶인 항목은 '나머지 풀' 로 남아 기존 카테고리 균등 규칙 그대로. 새 [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) 의 `GroupCalcInput`/`GroupShareBreakdown`/`toGroupCalcInputs`, 스키마 `SettlementItemGroup(Input)`/`SettlementGroupMember(Input)`/`SettlementGroupSplitMode`, prisma `settlement_rounds.groupSplits TEXT`(JSON, 마이그레이션 `20260610011757_add_settlement_group_splits`).
- **술·음료 종류 사전(drink-kinds)** — 새 [settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts) 가 `DRINK_KINDS`(소주/맥주/막걸리/하이볼/와인/사케·청주/위스키/칵테일/콜라/사이다/주스/커피·차/음료) 사전 1곳을 **세 군데에 먹인다**: ① FE 그룹 제안(`suggestItemGroups`) ② 영수증 추출 카테고리 결정적 보정 ③ 추출 프롬프트 제품명 힌트(`DRINK_BRAND_PROMPT_HINT`). `noHangul` 가드로 '새로 360ml'(소주)✅ vs '새로운안주'(안주)❌ 구분.
- **영수증 추출 주류 오분류 보정 + EXTRACTION_VERSION 3→4** — '새로/대선/시원' 등 일반 단어형 국내 주류 제품명을 vision 모델이 안주/미분류로 찍는 회귀를, 추출 후 `matchDrinkKind` 로 카테고리를 결정적 교정(`settlement-extraction.service.ts`) + 프롬프트에 대표 브랜드 힌트 주입(`settlement-extraction.prompts.ts`)으로 이중 안전망.
- **그룹 카드 UI (웹+앱)** — 새 web/[RoundGroupSplitEditor.tsx](../../apps/web/src/routes/settlement/RoundGroupSplitEditor.tsx)(사람×그룹 매트릭스), 앱 [RoundGroupSplitEditor.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitEditor.tsx)(그룹 카드 세로 스택) + [RoundGroupSplitNote.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitNote.tsx)(결과/공유 근거 풋노트). 점진 노출(접힘 기본) + 키워드 제안→원탭 생성. 안 건드리면 기존 균등 분배와 100% 동일.
- **분담 다듬기 잔여 수령자 단일→다중** — `SettlementCategoryAdjustment.leftoverParticipantIds` 가 단일 → **배열 `.min(1)`** 로 승격(`distributeWith` 가 여러 수령자에게 잔여 재균등). draft store `version: 4 → 6` (v4→v5 groupSplits, v5→v6 leftover 단일→배열 migration).

**2026-05-31 16차 컴파일 — 공유 기능 대확장 + 백엔드 perf.** 14차의 N차(차수) 재설계에 이어, 이번 라운드는 "정산을 카카오톡·텔레그램에 예쁘게 공유" 에 집중했다. 핵심 변경:

- **OG SSR-lite 미리보기** — 순수 SPA 라 크롤러가 긁으면 OG 태그가 비어 보이던 문제. 새 [share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) 가 `/share/settlements/:token` 과 단축 별칭 `/s/:token` 을 가로채 빌드된 `index.html` 의 `<head>` 에 정산 요약 OG 메타(식당명·총액·인원수)와 동적 og:image 를 주입한다. 풀 SSR 이 아니라 메타만.
- **정산표 PNG 서버 렌더** — 새 [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) 가 정산표 매트릭스를 satori(레이아웃→SVG) + resvg(SVG→PNG) 로 서버 렌더(폰트 IBM Plex Sans KR 번들). `/share/settlements/:token/image.png` 라우트로 노출 — og:image 와 '이미지로 보내기' 버튼이 소비.
- **OG 이미지 선택** — owner 가 공유 시 미리보기 이미지를 고른다: `restaurant`(식당 사진 — 갤러리에서 특정 1장 고정 / 미선택 시 토큰 시드 결정적 랜덤) 또는 `table`(정산표 PNG). `shareOgImage`/`shareOgImageUrl` 컬럼 신설.
- **공유 만료(ttl)** — `ShareTtl` 1d/7d/30d 프리셋 + `shareExpiresAt` 컬럼. 무제한 없음 — 짧은 토큰(10자)으로도 노출 창이 닫힌다. 만료 링크는 410(`expired`).
- **공유 UX** — SettlementShareDialog/SettlementShareSheet 에 OG 토글 + 식당 사진 갤러리 + 카카오톡 복사·정산표 클립보드 복사·Web Share file. 영수증 Lightbox(useReceiptPreviewUrl).
- **백엔드 perf** — `resolveRestaurantName` 을 `restaurant.findUnique(select:name)` 경량 조회로(이전 getPublicDetail 전체 리뷰 코퍼스 로드 제거), create 준비 단계 placeId 메모이즈 + Promise.all 병렬화, attendee 를 차수별 `createMany` 로 배칭, getSharePreviewMeta 경량 select(items/attendees 미로드 + _count) + (token,origin) 5분 캐시.
- **영수증 OCR 빈 항목 회귀 수정** — `EXTRACTION_VERSION` 2→3, 소극적 시스템 프롬프트("읽기 어려우면 빼라/빈 배열 OK") 제거.

## Purpose [coverage: high — 16 sources]

`settlement` 은 로그인 사용자가 일행의 분담액을 계산·저장·공유·수정할 수 있게 한다. 한 세션은 1~10 차수로 구성되며 각 차수는 영수증 사진(vision LLM 추출) 또는 직접 입력으로 만들 수 있다. 차수마다 다른 식당·다른 참석자 부분집합·다른 할인을 가질 수 있다. 저장된 정산은 본인만 보지만, 공유 토큰을 발급하면 비로그인 사용자도 read-only 로 결과를 본다.

분배는 카테고리(술/음료/안주/기타 — 2026-09 화면 이름 통일 전엔 "주류/비주류/미분류" 가 섞여 있었다) 단위 풀 + 제외 플래그가 기본이지만, **세부 분배 그룹(group split)** 으로 한 단계 더 들어갈 수 있다 — "소주는 영희·철수만 3잔:1잔, 맥주는 전원 균등" 처럼 주류/음료 풀에서 종류 그룹을 떼어내 마신 사람끼리만, 균등(`EQUAL`) 또는 잔수 비례(`GLASSES`)로 나눈다. 그룹 멤버십·잔수는 영수증 항목명을 **술·음료 종류 사전(drink-kinds)** 으로 자동 제안하되, silent 자동 적용이 아니라 사용자 확인(원탭 생성)을 거친다. 같은 사전이 영수증 추출 단계에서 '새로/대선' 같은 일반 단어형 주류 제품명의 카테고리 오분류도 결정적으로 교정한다.

공유 링크는 카카오톡·텔레그램 등 SNS 에서 펼쳐질 때 **OG 미리보기**(식당명·총액·인원수 + og:image)를 보여준다 — 순수 SPA 가 못 하는 일을 `share-preview.ts` 가 서버에서 `<head>` 메타만 주입해 해결한다. owner 는 미리보기 이미지를 식당 사진(갤러리 특정 1장 또는 토큰 시드 랜덤) 또는 정산표 PNG 중에서 고른다.

참여자 입력과 결과 표시는 **긍정형**으로 읽힌다(→ 2026-09) — 입력은 "술·음료·안주" 토글 칩(기본 켜짐, 안 먹은 사람만 끔), 결과·공유는 그 사람이 실제로 나눈 축에만 붙는 참여 배지. 저장 모델은 여전히 제외(exclude) 플래그다. 정산표만 받아 보는 사람을 위해 "기타" 열이 무엇인지(항목 이름)를 표 아래 한 줄로 적는다.

자동 적립되는 **단골(SettlementContact)** 은 같은 사람을 매번 다시 입력하지 않게 한다 — 정산 저장 시마다 (userId, normalizedKey) 기준 upsert 되어, 자동완성 드롭다운과 다중 선택 모달의 데이터원이 된다.

서버 임시저장 **(SettlementDraft)** 은 자동 저장으로 다기기 동기화 — 폰에서 입력 시작한 정산을 데스크톱에서 이어 입력. `(userId, placeId)` 키로 식당당 하나, 식당 미지정 슬롯(`/me/settlements/new`)은 sentinel `placeIdKey=''`. 이어 입력은 그 슬롯 하나만 단건 조회한다(`by-place`, 2026-10-05 — 그 전엔 목록이 payload 전체를 실어 와 거기서 골랐다). 저장된 정산을 고치는 수정 모드는 임시저장을 쓰지 않는다(저장된 세션이 진실).

영수증 추출은 비용이 드는 비전 LLM 이라 사용자 일일 한도(기본 50회)·IP 분당 20회가 걸리고, 어떤 정산·임시저장도 참조하지 않는 영수증 사진은 30일 뒤 지워진다(2026-10-05).

의존자: `apps/web` 의 정산 라우트 + `apps/mobile` 의 expo-router 라우트가 직접 호출. `restaurant` 모듈을 `RestaurantService.resolveRestaurantName`(이름 한 컬럼) 과 `getPhotoUrls`(OG 후보 사진)로 가볍게 호출한다. `ai` 모듈의 vision LLM provider (purpose=`image`) 가 영수증 추출에 쓰인다. 공용 서버 라이브러리 `lib/share-render`·`lib/share-fonts`(정산 카드 렌더 — 타로·사주와 공유)와 `lib/heic-worker`(영수증 HEIC — 식단과 공유), 식단 모듈의 `MealDailyQuotaService`(추출 일일 한도)를 빌려 쓴다([friendly](friendly.md)). 공유 링크는 `well-known` 모듈이 발급하는 AASA/assetlinks.json 으로 검증돼 iOS/Android 앱이 직접 가로챈다. OG 식당 사진은 `media` 모듈의 thumbnail 프록시로 1200px 리사이즈해 노출.

## Architecture [coverage: high — 83 sources]

**Backend 모듈 4개 (`apps/friendly/src/modules/`)**:

- [`settlement-extraction/`](../../apps/friendly/src/modules/settlement-extraction/) — 영수증 이미지 업로드/저장 + vision LLM 호출 + 추출 결과 정규화
  - [settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) — `upload` / `extract` / `preview/:token` 3 엔드포인트. extract 가 `roundIndex/roundTotal/split` 까지 받는다. → 2026-10-05 `622bfca2`: 라우트 로컬 레이트리밋 `RECEIPT_UPLOAD_RATE`·`RECEIPT_EXTRACT_RATE`(각 IP 분당 20), `consumeQuota` 주입 = `MealDailyQuotaService.consume(userId, kstToday(), 'settlement-extraction', env.SETTLEMENT_EXTRACT_DAILY_LIMIT)`, 테스트가 아닐 때 `scheduleRegistry.setCron('receipts-retention', '20 4 * * *', 'Asia/Seoul')` 로 미참조 영수증 정리 등록(onClose 에서 해제 — 04:00 로그 보존·04:40 usage-quota GC 와 안 겹치게). `busy`→503, `quota`→429(문구에 한도 수).
  - [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) — `storeImage` (sharp 로 JPEG 정규화 + 1600px 다운스케일, HEIC 는 heic-convert 폴백), `readImage`, `cropForSplit` (한 사진을 X 축 N등분), `extract` (vision LLM 호출 + 응답 파싱 + warning 산출). → 2026-10-05: sharp 는 `loadSharp()` 로 첫 사용 때 import, HEIC 폴백은 `heifDimensions` 로 선언 해상도부터 보고(2,500만 화소 초과 = `invalid_image` 400, 디코드 안 함) `decodeHeicToJpeg`(worker) → `HeicBusyError` 면 `busy`. `extract` 는 provider 해석 뒤 비전 호출 직전에 `consumeQuota(userId)` — false 면 `quota`(run 실패 기록, LLM 미호출). `userId` 는 한도 키로만 쓰고 run/스텝 meta 에는 싣지 않는다. 모듈 함수 `cleanupUnreferencedReceipts(prisma, opts)` — `data/receipts/*.jpg` 중 mtime 이 `RECEIPT_RETENTION_DAYS=30` 지난 것만 후보로, `settlementRound.receiptImageToken`(500개 청크 `in`) + `settlementDraft.payload` 문자열 속 UUID(50행 커서 페이지)가 참조하는 것을 빼고 unlink.
  - [receipt-heic.ts](../../apps/friendly/src/modules/settlement-extraction/receipt-heic.ts) (NEW 2026-10-05) — 영수증 HEIC 어댑터. `622bfca2` 땐 자체 eval worker + 동시 1·대기 4 게이트였고, `0157da60` 에서 공용 [`lib/heic-worker.ts`](../../apps/friendly/src/lib/heic-worker.ts) 의 `convertHeicToJpeg`(quality 0.92)·`readHeifImageSize` 위 얇은 층으로 — `decodeHeicToJpeg`(공용 `HeicDecodeError('busy')` → `HeicBusyError`), `heifDimensions = readHeifImageSize`, `MAX_HEIC_PIXELS = HEIC_MAX_PIXELS`(25,000,000). 서비스가 쓰는 API 는 그대로.
  - [settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts) — `EXTRACTION_SYSTEM_PROMPT` + `EXTRACTION_JSON_SCHEMA` + **`EXTRACTION_VERSION=4`**. `buildExtractionUserPrompt` 가 roundHint 를 받아 "N차 회식 중 K차 영수증" 컨텍스트를 라인으로 추가. v3: 소극적 지시 제거 → "모든 메뉴 줄 빠짐없이 추출". **v4: ALCOHOL 카테고리 정의에 `${DRINK_BRAND_PROMPT_HINT}`(드링크 사전이 생성하는 대표 제품명 — "참이슬/처음처럼/진로/새로/…(소주), 카스/테라/…(맥주)") 주입 — 제품명만 적힌 줄도 주류로 찍게**. 서버 후보정(`matchDrinkKind`)과 이중 안전망.
  - [settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) — extract 의 `correct` 단계에서 항목마다 `matchDrinkKind([matchedMenuName, name])` 으로 카테고리를 결정적 교정(LLM 카테고리를 덮어씀). 보정 건수(`categoryCorrections`)를 step 로그로 남겨 빈도 측정.
- [`settlement/`](../../apps/friendly/src/modules/settlement/) — 정산 세션 CRUD + 공유 토큰/OG + 전체 replace
  - [settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts) — `create`/`list`/`one`/`update`(PUT)/`delete` + `share` POST/DELETE + `shared` GET(비인증, IP rate limit). 공유 토큰 길이 하한 `min(8)` 으로 낮춰 신·구 토큰 모두 통과.
  - [settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts) — `create`/`update` 가 transaction 안에서 마스터 participants + N round + N round × M attendees(createMany 배칭) + items + categoryAdjustments 직렬화까지 전체 wipe/rebuild. `create` 는 `fromDraftId` 가 있으면 같은 트랜잭션에서 draft 도 삭제. 공유: `createShare`/`revokeShare`/`getBySharedToken`/`getSharePreviewMeta`/`pickRestaurantOgImageUrl`/`collectCandidateImageUrls` + `seedFromToken` + (token,origin) 5분 캐시 `sharePreviewCache`/`invalidateSharePreview`.
  - [share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) (NEW) — `registerSharePreview(app)` 가 **`/api/v1` prefix 밖**의 루트 경로 `/share/settlements/:token`·`/s/:token`(OG 주입 HTML)·`.../image.png`(정산표 PNG)를 직접 등록(autoload 우회). `app.ts` 에서 명시 호출. 빌드된 `apps/web/dist/index.html` 을 __dirname/cwd 위로 올라가며 후보 경로로 탐색해 캐시, `<title>` 교체 + `</head>` 앞에 OG 메타 삽입. → 2026-10-05 `78cbb457`: 카드 PNG 캐시가 `new LRUCache({ max: 200 })` → 공용 `SharePngCache({ maxBytes: 6MB, ttlMs: 30분 })`(같은 키 동시 미스는 렌더 1번에 합류). 이미지 핸들러는 먼저 `settlementSession.findUnique({ select: { updatedAt, shareExpiresAt } })` 만 읽어 404·캐시 키(`token:updatedAt`)를 정하고, 풀 로우(`getBySharedToken`)는 미스일 때 렌더 콜백 안에서만 — 상한 세션이면 히트마다 풀 로드 55ms 였다(G-2). `ShareRenderBusyError` → 503(`retry-after: 5`, no-store), 가벼운 조회와 풀 로드 사이에 만료되면 404. 두 이미지 경로에 `config.rateLimit: RATE.publicShare`. HTML 핸들러의 og:image 는 `meta.ogImageUrl ?? (isCardTruncated(participantCount) ? 기본 이미지 : 카드 PNG)`.
  - [settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) (NEW) — `renderSettlementCardPng(session)` — 정산표 매트릭스를 satori + resvg 로 PNG 렌더. `computeMatrix` 가 web `SettlementBreakdownTable` 의 useMatrix 포팅(같은 `calculateMultiRoundShares`). → 2026-09 `d7f4ac1`: 자체 `CATEGORY_LABEL` 사본을 걷고 `SETTLEMENT_CATEGORY_LABEL` 을 쓰며, `buildTable` 이 `note`(=`uncategorizedNote`, 기타 열이 있는 차수만)를 함께 돌려 표 아래 `* 기타: …` 줄(16px)을 그린다. → 2026-10-05 `78cbb457`: 자체 폰트 탐색·`loadFonts`·satori/resvg 정적 import 를 걷고 `loadPlexOnlyFonts()`([share-fonts.ts](../../apps/friendly/src/lib/share-fonts.ts))·`loadSatori()`·`svgToPng()`([share-render.ts](../../apps/friendly/src/lib/share-render.ts))를 쓴다. 카드 상한 상수 `CARD_MAX_PARTICIPANT_ROWS=30`(넘으면 앞 30명 + '외 n명' 칸별 합계 행 — 분담 계산은 숨긴 사람까지 전원으로), `CARD_MAX_TABLE_WIDTH=1600`(넘으면 compact = 카테고리 열 없이 차수 소계 열만, 소계 열이 굵은 차수 구분선, 머리글 왼쪽 정렬 + `textOverflow: ellipsis`), `CARD_MAX_PIXELS=4_000_000`(`cardScale(width, height)` 가 예전 폭별 2·1.5·1배를 지키되 면적이 넘을 때만 낮춤 — 높이는 satori SVG 루트 `height` 에서 읽는다). '외 n명'·compact 카드만 숫자 칸 폭을 합계 금액에 맞춰 넓히고(`fitNumW`), 30명 이하·좁은 표는 예전 고정 폭 그대로(픽셀 동일). `buildTree` → export `buildSettlementCardTree`(테스트가 행·열 구성을 본다), `isCardTruncated(participantCount)` export.
  - [settlement/settlement-draft.{route,service}.ts](../../apps/friendly/src/modules/settlement/) — 서버 임시저장. `(userId, placeIdKey)` upsert, `static deleteByIdInTxIfOwner` 가 settlement.create 트랜잭션 안에서 호출됨. → 2026-10-05 `622bfca2`: `list` 는 `select`(payload 제외) + `$queryRaw` `SELECT id, octet_length(payload) AS byteSize` 를 `Promise.all` 로 — payload 를 읽지도 파싱하지도 않는다. 새 `getByPlace(userId, placeId|null)` = `findUnique(userId_placeIdKey)` → `{ draft | null }`(라우트 `GET S.byPlace`, querystring `GetSettlementDraftQuery`). `upsert` 는 신규 슬롯이면 50개 상한, 그다음 `SUM(octet_length(payload)) … WHERE placeIdKey <> 이 슬롯` + 이번 `Buffer.byteLength(payload)` 가 `SETTLEMENT_DRAFT_MAX_TOTAL_BYTES`(2MB)를 넘으면 `too_large`(409), 응답은 `select: { id, updatedAt }`. `deleteById` 도 `select: { userId }` 만.
  - `normalizeContactKey(name, nickname)` — `lower(trim(name))+"|"+lower(trim(nickname))`. **single source of truth** — backfill 스크립트와 클라이언트(`Step1Participants`, `ContactPickerDialog`) 도 같은 정의.
- [`contact/`](../../apps/friendly/src/modules/contact/) — 사용자별 단골 list/update/delete (생성은 settlement 모듈 upsert)
- [`well-known/well-known.route.ts`](../../apps/friendly/src/modules/well-known/well-known.route.ts) — `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` 동적 응답 (env 미설정 시 404).

기타:
- [plugins/multipart.ts](../../apps/friendly/src/plugins/multipart.ts) — 5MB / 1 file limit
- [plugins/cors.ts](../../apps/friendly/src/plugins/cors.ts) — dev 에서 모든 origin 반사 허용(15차에서 LAN 화이트리스트 폐기), 비-LAN origin 만 1회 warn
- [config/env.ts](../../apps/friendly/src/config/env.ts) — `OG_IMAGE_PATH`(기본 `/og-default.png`, 만료/없는 토큰 폴백 og:image — 2026-10-05 부터 31명 이상 정산의 og:image 도), `WEB_INDEX_PATH`(index.html 명시 지정 시), **`SETTLEMENT_EXTRACT_DAILY_LIMIT`**(2026-10-05, `z.coerce.number().int().min(0).default(50)`, [.env.example](../../apps/friendly/.env.example) 에도)
- 공용 lib(소유 토픽 [friendly](friendly.md)) — [lib/share-render.ts](../../apps/friendly/src/lib/share-render.ts)(`loadSatori`·`svgToPng`·`withShareRenderSlot`·`SharePngCache`·`ShareRenderBusyError`), [lib/share-fonts.ts](../../apps/friendly/src/lib/share-fonts.ts)(`loadPlexFonts` 1회 읽기, 정산 카드용 `loadPlexOnlyFonts`), [lib/heic-worker.ts](../../apps/friendly/src/lib/heic-worker.ts)(`convertHeicToJpeg`·`readHeifImageSize`·`HEIC_MAX_PIXELS`), [meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts)(`INSERT … ON CONFLICT DO UPDATE … WHERE count < limit` 한 문장 원자 카운터).
- [scripts/backfill-contacts.ts](../../apps/friendly/scripts/backfill-contacts.ts)

**API Contract (`packages/api-contract/src/`)**:
- [schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts) — 마스터 `SettlementParticipant`, `SettlementRound`(차수), `SettlementRoundAttendee`(차수 attendance), `SettlementCategoryAdjustment(s)` (분담 다듬기), `CreateSettlementInput` (rounds + participants + optional fromDraftId), `UpdateSettlementInput = CreateSettlementInput`. 공유: `ShareTtl`/`ShareOgImage`/`CreateSettlementShareInput`/`SettlementShare`/`SharedSettlementSession`. round.items.max(200), participants/attendees.max(100), rounds.max(10). **세부 분배 신규**: `SettlementGroupSplitMode`('EQUAL'|'GLASSES'), `SettlementGroupMember`(participantId + glasses int 0..999)/`SettlementGroupMemberInput`(participantClientId + glasses), `SettlementItemGroup`(label≤40 + category + itemIndexes min(1) + mode + members min(1))/`SettlementItemGroupInput`(itemIndexes.max(200) + members.max(100)), `SettlementRound.groupSplits`(nullable 배열)·`SettlementRoundInput.groupSplits`(.max(30).nullable.default null). `SettlementRoundInput` 에 그룹용 refine 2개 — 항목참조(범위·카테고리 일치·그룹간 중복 없음) + 그룹 내 같은 참여자 중복 금지. **분담 다듬기 변경**: `SettlementCategoryAdjustment.leftoverParticipantIds`/`leftoverParticipantClientIds` 가 단일 → **배열 `.min(1)`**.
- [settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts) (NEW) — 술·음료 종류 사전 단일 소스. `GROUPABLE_CATEGORIES`(ALCOHOL/NON_ALCOHOL) + `isGroupableCategory`, `DRINK_KINDS`(종류별 label/category/keywords/promptBrands), `matchDrinkKind(names[])`(사전 순서 우선순위 — 첫 매칭 승리), `DRINK_BRAND_PROMPT_HINT`(promptBrands 가진 종류만 "브랜드/…(라벨)" 로 join). 키워드는 평문(부분 문자열) 또는 `{kw, noHangul:'before'|'after'|'around'}` — 매칭 위치 지정 방향에 한글이 붙으면 다른 단어로 보고 무시('새로 360ml'✅/'새로운안주'❌, '카스'✅/'카스테라'❌). 이름은 공백 제거 후 비교.
- [settlement.labels.ts](../../packages/api-contract/src/settlement.labels.ts) (NEW 2026-09 `d7f4ac1`) — 분류 표시명 단일 소스. `SETTLEMENT_CATEGORY_LABEL`(`ALCOHOL`=술·`NON_ALCOHOL`=음료·`SIDE`=안주·`UNCATEGORIZED`=기타), 항목 편집 선택지용 `SETTLEMENT_CATEGORY_OPTION_LABEL`(기타만 "기타(모두 나눔)"), `uncategorizedNote(rounds)` — 차수별로 `UNCATEGORIZED`·금액 >0 항목 이름을 중복 제거해 차수당 3개 + "외 N개", 차수가 여럿이면 "N차" 접두, 없으면 `null`. 서버 PNG(friendly)도 쓰므로 FE 전용 `@repo/shared` 가 아니라 api-contract 에 둔다. 웹·앱·PNG 15개 파일의 사본을 대체.
- [schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts) — `ReceiptItemCategory` 4-state, `ExtractReceiptSplit` (count 2..5, index 1..count), `ExtractReceiptInput` 에 `roundIndex/roundTotal/split` 옵션 필드.
- [schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) — `SettlementDraft`, `UpsertSettlementDraftInput` (payload `z.unknown()` + 200KB JSON 크기 refine), `ListSettlementDraftsResult`. → 2026-10-05 `622bfca2`: 목록 항목 `SettlementDraftMeta = SettlementDraft.omit({ payload }).extend({ byteSize })`, PUT 응답 `UpsertSettlementDraftResult { id, updatedAt }`, 단건 `GetSettlementDraftQuery { placeId?: 1..64 }`/`GetSettlementDraftResult { draft: SettlementDraft | null }`. 크기 refine 이 `JSON.stringify(v).length`(UTF-16 글자 수) → `utf8ByteLength(...) <= SETTLEMENT_DRAFT_MAX_PAYLOAD_BYTES`(200KB). `SETTLEMENT_DRAFT_MAX_TOTAL_BYTES = 2MB`, `utf8ByteLength`(Buffer·TextEncoder 없이 서로게이트 쌍 = 4바이트까지 세는 플랫폼 무관 구현 — shared 훅도 값으로 쓴다)도 이 스키마 파일에서 export.
- [schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts) — `calculateShares` (할인 + categoryAdjustments + **groups**) + `calculateMultiRoundShares` (라운드별 호출 + 마스터 인덱스 합산, `perRound[].poolBreakdown`/`perCategoryShares`/`groupBreakdown`) + `effectiveExcludes`. **세부 분배 신규**: `GroupCalcInput`(category/itemIndexes/mode/members{participantIndex,glasses}), `GroupShareBreakdown`(poolAmount/totalGlasses/shares/applied), `toGroupCalcInputs(groupSplits, participantIndexById)`(저장 응답의 participantId 멤버 → 인덱스 변환, 웹 매트릭스·서버 PNG 공용). `distributeByWeight`(정수 잔수 비례 + 1원 잔여 분산), `distributeWith`(잔여 수령자 **배열** — 1명=몰아주기/여러명=재균등/0명=첫 활성자 fallback). 카테고리 풀을 그룹 풀 + 나머지(균등) 풀로 분해, 할인은 비례 차감, 유효 멤버 0명 그룹은 나머지 풀로 환원(`applied=false`).
- [routes.ts](../../packages/api-contract/src/routes.ts) — `Routes.Settlement.{create,list,one,update,share,shared}` + `Routes.SettlementDraft.{list,upsert,byPlace,one}`(`byPlace` = `/settlement-drafts/by-place`, 2026-10-05) + `Routes.Media.thumbnail`(OG 식당 사진 프록시).
- [index.ts](../../packages/api-contract/src/index.ts) — 모든 신규 스키마 re-export.

**FE Shared (`packages/shared/src/`)**:
- 세부 분배 로직 — [settlement/groupSuggestion.ts](../../packages/shared/src/settlement/groupSuggestion.ts) (NEW) — `suggestItemGroups(items)` 가 항목명을 `matchDrinkKind` 로 묶어 종류 그룹 제안(`ItemGroupSuggestion[]`). 그룹 카테고리는 항목 카테고리와 같아야 매칭(스키마 제약 일치). `@repo/api-contract` 의 `GROUPABLE_CATEGORIES`/`isGroupableCategory` re-export. 멤버/모드는 안 채우고 호출부가 기본값(참석자 전원·균등) 채움.
- 참여 축 — [settlement/participation.ts](../../packages/shared/src/settlement/participation.ts) (NEW 2026-09 `237acd5`·`f1422fd`) — `PARTICIPATION_AXES`(`excludeAlcohol`=술 마심/안 마심, `excludeNonAlcohol`=음료 마심/안 마심, `excludeSide`=안주 먹음/안 먹음) + `participationAxis(key)` + `ParticipationFlags`. 배지 판정 `participationBadgeAxes(participantCount, rounds)` — 축마다 그 분류 항목(금액 >0)이 있는 차수만 보고, 참석자(불참=`null`)의 실효 제외(`effectiveExcludes`, 차수 특이사항 반영)로 "누군가 빠졌나(쟁점 축)"·"이 사람은 한 번이라도 나눴나"를 판정. 어댑터 `draftParticipationBadgeAxes(participants, rounds)`(draft 의 `attendances`/`participantClientId`)·`sessionParticipationBadgeAxes(session)`(저장·공유 응답의 `attendees`/`participantId`). 웹·앱 Step4·결과·공유가 모두 이 판정을 쓴다. 첫 버전(`237acd5`)의 `axesInPlay`/`joinedAxes`(마스터 설정만 봄)는 `f1422fd` 에서 제거.
- API 래퍼 — [settlement.api.ts](../../packages/shared/src/api/settlement.api.ts) (`createShare(id, ttl, ogImage?, ogImageUrl?)` — ogImageUrl 트라이스테이트를 위해 undefined 일 때만 키를 뺀다), [settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts) (`previewBlob`), [settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts), [settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts) (→ 2026-10-05: 하드코딩 `PREFIX` 대신 `Routes.SettlementDraft`, 새 `getByPlace(placeId|null)` — null 이면 쿼리 없이 `by-place`, `upsert` 반환 타입 `UpsertSettlementDraftResultType`)
- React Query 훅 — [useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) (`useCreateSettlementShare` 가 ttl/ogImage/ogImageUrl 받음. → 2026-10-05 `82d455c7`: `useCreateSettlement` 가 응답 세션을 `['settlement','one',id]` 에 심고 무효화는 목록만 — 저장 직후 결과 페이지가 같은 세션을 다시 부르지 않는다. `useListSettlements(query, { keepPrevious })` 옵트인 `keepPreviousData`, 새 `useDeleteSettlements(ids)` = `Promise.allSettled` 후 `onSettled` 에서 한 번만 무효화·reject 안 함), [useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts), [useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts) (→ 2026-10-05: `useSettlementContacts(query, { enabled, keepPrevious })`), [useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts) — `useSettlementDraftHydrate` 가 **placeId당 1회만** hydrate(저장 in-flight 중 입력 덮어쓰기 방지), `useSettlementDraftAutoSync` debounce 자동 저장. → 2026-10-05 `622bfca2`: 새 `useSettlementDraftByPlace(placeId, enabled)`(키 `['settlement-draft','by-place', placeId ?? '']`, staleTime 0), hydrate 는 목록 대신 이 슬롯을 보고 `isLoading || isFetching` 이면 기다린다(캐시가 있어도 진입 시 재조회 결과로 — 다른 기기 편집·삭제 반영). `useUpsertSettlementDraft.onSuccess` 는 순수 함수 `applySavedDraft(saved, input, prev)` 로 이어쓰기 캐시를 보낸 payload 로 채우고 목록의 그 항목을 맨 앞으로(`byteSize` 는 `utf8ByteLength` 로 클라가 다시 셈), 목록에 없던 새 슬롯이면 목록만 무효화. 삭제는 목록 무효화 + `by-place` 캐시 제거(지운 draft 가 재진입 때 되살아나지 않게). → `82d455c7`: hydrate 에 `options.enabled`(false 면 슬롯 조회도 store 변경도 없고 `{ hydrated:false, matched:null }`), autoSync 구독은 변경마다 직렬화하지 않고 타이머만 다시 걸어 터질 때 최신 상태를 한 번 직렬화·비교(고쳤다 되돌리면 요청 없음).
- Zustand 스토어 — [settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts) — N차 모델. **`version: 6`** (v4→v5 round.groupSplits 추가, v5→v6 leftover 단일→배열), `setSettlementDraftStorage(storage)` 어댑터 주입(RN AsyncStorage / 웹 sessionStorage / no-op). 그룹 액션 `applyGroupSplits`/`addGroupSplit`/`updateGroupSplit`/`removeGroupSplit` + `isEligibleGroupMember`(참석 + 카테고리 비제외 가드) export. 항목 삭제/카테고리 변경 시 그룹의 죽은 itemClientId 를 자동 청소(0개 되면 그룹 제거).

**Web Routes (`apps/web/src/routes/settlement/`)** — App.tsx 에 등록:
- `/restaurants/:placeId/settle/new` → [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx) — 4단계 stepper. → 2026-10-05 `82d455c7`: 수정 모드(`:id`)는 `useSettlementDraftHydrate(placeId ?? null, { enabled: !isEdit })` 로 서버 임시저장을 끄고(예전 `!isEdit ? placeId : null` 은 식당 미지정 슬롯을 불러 편집 내용을 덮어썼다), 식당 상세 `useRestaurantPublic` 도 부르지 않는다(헤더·식당명은 저장된 세션에서, 상세는 리뷰 전체를 읽는 무거운 응답).
  - [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx) — 참여자 단일 필드 + alias 토글 + Enter 추가 + 기본 제외 토글(localStorage). → 2026-09 `237acd5`: 참여자 행의 "주류 안 함" 류 체크박스(`ExcludeToggle`/`DefaultExcludeToggle`)를 지우고 `ParticipationToggles` 칩으로 — 행마다 `md`, "새 행 기본:" 줄은 `size="sm"`(값은 `settlementPrefsStore` 의 `newExcludes` 그대로). → 2026-10-05: `ContactSuggestions` 를 focus 가 있는 행에서만 마운트(닫힌 드롭다운이 행마다 단골 검색을 돌려, 이름이 채워진 정산을 열면 사람 수만큼 요청이 나갔다).
  - [Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx) — 차수 N개 입력. → 2026-10-05: 업로드 전 [prepareReceiptImage.ts](../../apps/web/src/routes/settlement/prepareReceiptImage.ts)(NEW — `<img>.decode()` 로 EXIF 방향 적용 상태 디코드 → canvas 장변 2000px·JPEG q0.9, 흰 바탕, 장변 2000 이하·1MB 이하면 그대로, `image-orientation: from-image` 미지원 브라우저·디코드 불가(Chrome 의 HEIC 등)·커진 결과는 원본) + `RECEIPT_MAX_UPLOAD_BYTES`(5MB) 초과면 올리기 전 `RECEIPT_TOO_LARGE_MESSAGE`. 숨은 파일 입력을 입력 방식과 무관하게 항상 마운트(예전엔 source 미정 블록 안에만 있어 "다른 사진" 이 열 입력이 없었다).
  - [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx) — 차수별 항목 편집 + 영수증 미리보기(`useReceiptPreviewUrl` → Lightbox) + warning. → 2026-10-05: 메뉴 모달용 식당 상세는 모달을 연 동안에만 조회(`useRestaurantPublic(pickerOpen ? placeId : null)`, `MenuPickerDialog` 에 `loading`), 미리보기 로딩 자리 `h-64` 로 레이아웃 밀림 방지.
  - [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx) — 분담 미리보기 + 정산표 + 저장.
- `/restaurants/:placeId/settle/:id` → [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx) — 결과 보기 + 공유/삭제/수정. 차수별 카드 + 영수증 썸네일 + 정산표. 헤더 z-30.
- `/me/settlements` → [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx) — → 2026-10-05: 임시저장 행 타입이 `SettlementDraftMetaType`(payload 없음 — 행을 누르면 해당 식당 새 정산 화면이 `by-place` 로 이어 받는다), 페이지 전환 중 `keepPrevious` 로 직전 페이지를 흐리게(`aria-busy`·`pointer-events-none`) 남기고, 일괄 삭제는 `useDeleteSettlements` 한 번.
- `/me/contacts` → [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx) — → 2026-10-05: 검색어 250ms 디바운스(한글 조합마다 change 가 와 "홍길동" 한 번에 요청 9번이었다, 비울 땐 지연 0) + `keepPrevious`, 직전 검색의 빈 결과가 보이는 동안은 "결과 없음" 대신 로딩(`settled` 판정).
- `/share/settlements/:token` (SPA) / `/s/:token` → [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx) — 비인증 read-only. 같은 URL 을 서버 `share-preview.ts` 가 먼저 받아 OG 를 주입한 HTML 을 돌려주고 그 위에서 SPA 부팅.
- [useReceiptPreviewUrl.ts](../../apps/web/src/routes/settlement/useReceiptPreviewUrl.ts) (NEW) — preview 라우트(JWT 필요)를 fetch → Blob → `URL.createObjectURL`. unmount 시 revoke. 반환 objectUrl 을 Lightbox 가 그대로 확대.

**다이얼로그/카드 (web)** — [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx) (TTL 토글 + OG 이미지 토글 + 식당 사진 갤러리 선택 + 이미지/카카오톡 클립보드 복사 + Web Share file), [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)(→ 2026-10-05 닫힌 동안 조회 안 함 `enabled: open` + 250ms 디바운스 + `keepPrevious`, 선택을 `Map<id, contact>` 로 들고 있어 검색어를 바꿔 목록에서 빠진 사람도 확인 시 뒤에 붙는다), [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)(→ 2026-10-05 `open` prop 제거 — 마운트 = 열림, `keepPrevious`), [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx), [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)(→ 2026-10-05 `loading` prop — 빈 목록을 "등록된 메뉴가 없습니다" 로 오독하지 않게), [RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx)(→ 2026-10-05 `enabled: open && q !== ''` — Step2 에 늘 마운트돼 있다, 빈 검색어면 목록도 비움), [MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx)(→ 2026-10-05 `prepareReceiptImage` + 업로드 전 단계 실패도 화면에 표시), [RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx), [RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx), [RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx)(→ 2026-09 칩 문장 `exceptionLabel` = 축 라벨 + `doVerb`/`skipVerb`, 카테고리 선택지도 `PARTICIPATION_AXES`), **[ParticipationChips.tsx](../../apps/web/src/routes/settlement/ParticipationChips.tsx) (NEW 2026-09 — `ParticipationToggles`(토글 칩 묶음, `aria-pressed`=분담 중) + `ParticipationBadges({ axes })`(계산된 축만 받아 회색 배지로 그림). 라벨·판정은 shared, 여기는 아이콘(Beer/CupSoda/UtensilsCrossed)·스타일만)**, **[RoundGroupSplitEditor.tsx](../../apps/web/src/routes/settlement/RoundGroupSplitEditor.tsx) (NEW — 세부 분배. '그룹 정의'(항목 묶음·모드) + '누가 마셨나' 사람×그룹 매트릭스. 점진 노출(접힘 기본) + `suggestItemGroups` 키워드 제안→원탭 생성)**, [SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx) (settlement-card.ts 의 PNG 와 동일 매트릭스 — 이제 groupSplits 도 반영. → 2026-09 표 아래 `* 기타: …` 설명, 좌우 여백을 셀과 같은 `px-2` 로 맞춤), [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx) (결과/공유 차수 카드 풋노트에 그룹 근거 표시. → 2026-09 참여자 줄의 자체 배지 구현을 `ParticipationBadges` + `sessionParticipationBadgeAxes` 로 교체, 항목·할인 분류 이름은 `SETTLEMENT_CATEGORY_LABEL`), 공용 [confirm-dialog.tsx](../../apps/web/src/components/ui/confirm-dialog.tsx). [settlementPrefsStore.ts](../../apps/web/src/stores/settlementPrefsStore.ts) (localStorage). Step3Edit/Step4Review/SettlementResultPage/SharedSettlementPage 가 그룹 에디터·근거를 끼워넣는다. → 2026-10-05 `82d455c7`: Step4 차수별 편집기 4종(`RoundDiscountEditor`·`RoundCategoryAdjuster`·`RoundExceptionsEditor`·`RoundGroupSplitEditor`)을 `memo` 로 — 다른 차수를 건드릴 때 `round` 가 그대로인 차수는 다시 그리지 않는다(펼친 '누가 마셨나' 매트릭스가 가장 크다). 결과 페이지 영수증 카드 로딩 자리 `h-80`. 이 커밋의 웹 테스트는 공용 픽스처 [testFixtures.ts](../../apps/web/src/routes/settlement/testFixtures.ts) 위 [settlementHooks.test.tsx](../../apps/web/src/routes/settlement/settlementHooks.test.tsx)(저장 응답 캐시 심기·일괄 삭제 1회 무효화·자동저장 디바운스·hydrate `enabled:false`)·[SettlementNewPage.test.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.test.tsx)(수정 모드 덮어쓰기 회귀·헛조회 없음)·Step2Rounds/Step3Edit/Step4Review/ContactPickerDialog/ContactsPage/SettlementHistoryPage 테스트·[prepareReceiptImage.test.ts](../../apps/web/src/routes/settlement/prepareReceiptImage.test.ts).

**Mobile (`apps/mobile/`)** — expo-router 라우트로 정산 도메인 전체 이식:
- `/restaurant/[placeId]/settle/new` · `/settle/[id]/{index,edit}` · `/settlement/{new,history,contacts}` · `/s/[token]`(딥링크 — 2026-05-30 `efb3d1e` 에서 `share/settlements/[token]` 이 단축 경로로 이동) 라우트.
- 2026-10-05: [SettlementWizard.tsx](../../apps/mobile/src/components/settlement/SettlementWizard.tsx) 가 웹과 같은 수정 모드 덮어쓰기 버그를 `useSettlementDraftHydrate(placeId, { enabled: !isEdit })` 로 고쳤고(`82d455c7`), [history.tsx](../../apps/mobile/app/settlement/history.tsx) 의 임시저장 행 타입이 `SettlementDraftMetaType` 으로(`622bfca2`). 영수증 축소(`prepareReceiptImage`)는 웹만 — 앱은 이미지 피커가 JPEG 로 넘긴다. 앱은 타입체크만 했다(실기기 미확인).
- 컴포넌트는 [apps/mobile/src/components/settlement/](../../apps/mobile/src/components/settlement/): SettlementWizard, Step1~4, ContactPickerSheet, ContactSuggestions, MenuPickerSheet, RestaurantPickerSheet, MultiReceiptSplitSheet, RoundDiscountEditor, RoundCategoryAdjuster, RoundExceptionsEditor, SettlementBreakdownTable, [SettlementShareSheet.tsx](../../apps/mobile/src/components/settlement/SettlementShareSheet.tsx) (OG 토글 + 식당 사진 갤러리 + 카톡/클립보드 복사). **세부 분배 신규**: [RoundGroupSplitEditor.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitEditor.tsx) (웹과 동일 로직, 표현만 앱 관용구 — 사람×그룹 매트릭스 대신 **그룹 카드 세로 스택**, 멤버 체크/잔수 스테퍼는 카드 안 참석자 행; Step3Edit 에 삽입) + [RoundGroupSplitNote.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitNote.tsx) (읽기 전용 근거 풋노트 — 잔수 그룹은 멤버·잔수 나열, 균등 그룹은 '빠진 사람'만 명시; Step4Review·결과·공유에서 사용. `SharedSettlementSessionType` 과 `SettlementSessionType` 을 구조적 subtyping 으로 공용). **2026-09 신규**: [ParticipationChips.tsx](../../apps/mobile/src/components/settlement/ParticipationChips.tsx) — 앱판 `ParticipationToggles`(`theme` prop, MaterialCommunityIcons `glass-mug-variant`/`cup-outline`/`silverware-fork-knife`, `accessibilityRole="switch"`, 빠짐=`borderStyle: 'dashed'` + `textDecorationLine: 'line-through'`), Step1Participants 의 참여자 행·새 행 기본에 쓰인다. 앱은 웹 `ParticipationBadges` 같은 별도 컴포넌트 없이 Step4Review·결과(`settle/[id]/index.tsx`)·공유(`s/[token].tsx`)가 `(draft|session)ParticipationBadgeAxes` 결과의 라벨을 인라인 태그로 그린다. 앱 정산표 `SettlementBreakdownTable` 도 `* 기타: …` 설명(11px)을 단다.
- [apps/mobile/src/hooks/useReceiptPreviewUrl.ts](../../apps/mobile/src/hooks/useReceiptPreviewUrl.ts) (NEW) — 웹과 동일 패턴이되 RN `Image` 가 objectURL 을 못 받아 `FileReader` 로 **data URL** 변환(웹 훅과 유일한 차이).
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts) (AsyncStorage), [app.config.ts](../../apps/mobile/app.config.ts) (associatedDomains/intentFilters), [DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md).

## Talks To [coverage: high — 15 sources]

- **`ai` 모듈 (vision LLM)** — `settlement-extraction.service.ts` 가 `AiConfigService.getResolved('ollama-cloud', 'image')` 로 vision provider 를 해결하고, `adapterCache` 의 `LLMProvider.complete` 를 호출. `format=EXTRACTION_JSON_SCHEMA` 로 토큰 샘플링 단계부터 JSON 모양 강제 + **`think: thinkOptionForModel(model)`**(2026-08-22 — 추론 모델의 사고에 출력 토큰을 뺏겨 items 가 비지 않게). `VISION_TIMEOUT_MS=60_000` 별도 타임아웃, `AbortController` 시그널. 라우트의 `AiConfigService` 는 `buildLlmProviderEnv()` 로 조립(자체 env 리터럴 없음).
- **`restaurant` 모듈 (이번 라운드 경량화)** — 두 경로 모두 풀 `getPublicDetail`(전체 리뷰 코퍼스 + summary join + snapshot merge) 을 피한다:
  - `settlement.service.resolveRestaurantName(placeId)` 가 `restaurant.findUnique({ where:{placeId}, select:{name} })` 스칼라 직조회. placeId 는 naver 행에만 @unique 로 채워지고 getPublicDetail 의 mergeName 도 naver 존재 시 naver.name 을 반환하므로 결과 값 동일.
  - `collectCandidateImageUrls` 가 `RestaurantService.getPhotoUrls(placeId)` (snapshot-only, naver+DC mergePhotos) 로 OG 후보 사진 URL 만 모은다(dedup + thumbnail-proxyable 호스트만 + 최대 12장).
  - extract 라우트는 식당명 + 메뉴 이름을 LLM 프롬프트 힌트로 주입할 때만 풀 detail 을 사용.
  - **웹 쪽 공개 상세 호출도 줄였다(2026-10-05 `82d455c7`)** — `useRestaurantPublic`(서버가 그 식당 리뷰 전체를 읽어 만드는 응답)을 수정 모드 `SettlementNewPage` 에선 부르지 않고, Step3 메뉴 모달은 연 동안에만. 공개 목록 `useRestaurantsPublic` 은 식당 검색 다이얼로그가 열리고 검색어가 있을 때만.
- **식단 모듈의 일일 한도 카운터 (2026-10-05)** — 추출 한도는 별도 테이블 없이 [MealDailyQuotaService](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) 의 `meal_daily_quotas`(PK `userId, date, purpose`)에 purpose `'settlement-extraction'` 행으로 센다. 마이그레이션 없음 — 이름은 meal 이지만 사용자·날짜·용도별 범용 카운터다([meal](meal.md)).
- **공용 서버 lib (2026-10-05, [friendly](friendly.md))** — 정산 카드는 타로·사주·사주(G) 카드와 같은 `lib/share-render` 렌더 슬롯(프로세스 전역 동시 1·대기 16)과 PNG 캐시 클래스를 쓴다 — 타로 공유가 몰리면 정산 카드 미스도 줄을 선다. 영수증 HEIC 는 식단 사진과 같은 `lib/heic-worker` 게이트(동시 1·대기 8·대기 60초)를 쓴다 — 식단 HEIC 사진 업로드가 몰리면 영수증 업로드가 기다리거나 503. 미참조 영수증 정리 cron 은 `scheduleRegistry`([schedule](schedule.md))에 `receipts-retention` 으로 등록된다.
- **`media` 모듈** — OG 식당 사진은 원본 네이버 CDN URL 이 아니라 `${origin}${Routes.Media.thumbnail}?url=...&w=1200&q=80` 프록시로 감싸 노출(allowlist 호스트만, referrer-policy 회피).
- **`summary` 모듈** — `extractFirstJsonObject` 유틸을 LLM 응답에서 첫 JSON 블록만 잘라낼 때 재사용.
- **drink-kinds 단일 소스 (모듈 횡단)** — `settlement.drink-kinds.ts`(api-contract) 한 곳의 `DRINK_KINDS` 가 세 소비자를 먹인다: ① `@repo/shared` 의 `suggestItemGroups`(FE 그룹 제안) ② `settlement-extraction.service`(추출 후 `matchDrinkKind` 카테고리 보정) ③ `settlement-extraction.prompts`(`DRINK_BRAND_PROMPT_HINT` 프롬프트 힌트). 브랜드 추가는 사전 1곳이면 셋 다 반영 — FE 제안·서버 보정·프롬프트가 항상 같은 종류 판단을 공유한다.
- **분류 이름·기타 설명 단일 소스 (2026-09, 모듈 횡단)** — [settlement.labels.ts](../../packages/api-contract/src/settlement.labels.ts)(api-contract)가 웹(`apps/web/src/routes/settlement/*`)·앱(`apps/mobile/src/components/settlement/*`, `app/s/[token].tsx`, `settle/[id]/index.tsx`)·서버 PNG(`settlement-card.ts`) 세 소비자에 같은 `SETTLEMENT_CATEGORY_LABEL`·`uncategorizedNote` 를 준다. 서버가 쓰는 순수 함수라 `@repo/shared`(FE 전용) 가 아닌 api-contract 에 있다. 반대로 참여 축·배지 판정([participation.ts](../../packages/shared/src/settlement/participation.ts))은 draft store 타입에 기대는 FE 전용이라 `@repo/shared` 에 있다.
- **`well-known` 모듈** — 공유 링크 딥링크를 가능하게 만드는 동반 모듈. iOS/Android 가 `/.well-known/{apple-app-site-association,assetlinks.json}` 을 fetch 해 `/share/settlements/*` 가로채기 권한을 검증.
- **인증** — 모든 `/api/v1/settlements*` 라우트 `app.authenticate` JWT onRequest. 예외: **`Routes.Settlement.shared(:token)` 만 비인증** — 토큰을 안다 = 접근 허용. 응답에서 `userId` 와 round 별 `receiptPreviewUrl`/`receiptImageToken` 가 빠진다. `share-preview.ts` 의 HTML/PNG 라우트(`/share/settlements/:token`, `/s/:token`, `.../image.png`)도 비인증(크롤러·메신저가 호출). `well-known` 두 엔드포인트도 비인증.
- **rate-limit 플러그인** — 공개 JSON 조회와 (2026-10-05 부터) 카드 PNG 두 경로가 `RATE.publicShare`(IP 120/분). 영수증 업로드·추출은 플러그인 `RATE` 가 아니라 라우트 로컬 프리셋(분당 20)이다([plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts)).

## API Surface [coverage: high — 13 sources]

| Method | Path | Auth | Body / Params | 응답 (200) |
|---|---|---|---|---|
| POST | `/api/v1/settlement-extraction/upload` | JWT | `multipart/form-data` — file 1개, ≤5MB. HEIC 는 ≤2,500만 화소(초과 400). IP 20/분, HEIC 변환 대기열 가득 503 | `UploadReceiptResult` `{ imageToken, previewUrl, byteSize }` |
| POST | `/api/v1/settlement-extraction/extract` | JWT | `ExtractReceiptInput` `{ imageToken, placeId, roundIndex?, roundTotal?, split? }`. IP 20/분, 사용자 하루 `SETTLEMENT_EXTRACT_DAILY_LIMIT`(기본 50, 분할은 영역마다 1회) 초과 **429** | `ExtractReceiptResult` `{ items[], totalAmount, itemsSubtotal, warning, model }` |
| GET | `/api/v1/settlement-extraction/preview/:token` | JWT | UUID v4 정규식 | `image/jpeg`, `Cache-Control: private, max-age=3600` |
| POST | `/api/v1/settlements` | JWT | `CreateSettlementInput` `{ rounds[1..10], participants[1..100], fromDraftId? }` | `SettlementSession` |
| GET | `/api/v1/settlements?placeId=&offset=&limit=` | JWT | `ListSettlementsQuery` | `ListSettlementsResult` (요약 `roundCount/itemCount`, _count 기반) |
| GET | `/api/v1/settlements/:id` | JWT | — | `SettlementSession` (소유자만, 비소유자 403) |
| PUT | `/api/v1/settlements/:id` | JWT | `UpdateSettlementInput = CreateSettlementInput` (전체 replace) | `SettlementSession` (서버 재계산 + `editedAt` 갱신) |
| DELETE | `/api/v1/settlements/:id` | JWT | — | 204 |
| **POST** | `/api/v1/settlements/:id/share` | JWT | `CreateSettlementShareInput` `{ ttl?, ogImage?, ogImageUrl? }` (본문 생략 가능) | `SettlementShare` `{ token, shareUrl, expiresAt, ogImage, ogImageUrl, ogImageCandidates }` (멱등 + ttl 만료갱신) |
| DELETE | `/api/v1/settlements/:id/share` | JWT | — | 204 |
| GET | `/api/v1/share/settlements/:token` | **none** | base64url 8~64자 | `SharedSettlementSession` (userId/receiptPreviewUrl/receiptImageToken 제거). 만료=410, 없음=404, IP rate limit 120/분 |
| GET | `/api/v1/settlement-drafts` | JWT | — | `ListSettlementDraftsResult` — 2026-10-05 부터 **메타만** `SettlementDraftMeta[]`(payload 없음, `byteSize` 포함), 최근 수정순 |
| **GET** | `/api/v1/settlement-drafts/by-place?placeId=` | JWT | `GetSettlementDraftQuery` (placeId 생략 = 식당 미지정 슬롯) | `GetSettlementDraftResult` `{ draft: SettlementDraft \| null }` — 없어도 200 (NEW 2026-10-05) |
| PUT | `/api/v1/settlement-drafts` | JWT | `UpsertSettlementDraftInput` (payload UTF-8 ≤200KB, 넘으면 400. 신규 슬롯 50개·사용자 합계 2MB 초과 409) | `UpsertSettlementDraftResult` `{ id, updatedAt }` (2026-10-05 이전엔 payload 포함 `SettlementDraft`) |
| DELETE | `/api/v1/settlement-drafts/:id` | JWT | — | 204 |
| GET | `/api/v1/me/contacts?q=&take=` | JWT | `ListContactsQuery` | `ListContactsResult` |
| PATCH | `/api/v1/me/contacts/:id` | JWT | `UpdateContactInput` | `SettlementContact` (충돌 409) |
| DELETE | `/api/v1/me/contacts/:id` | JWT | — | 204 (`participant.contactId` SetNull) |
| **GET** | `/share/settlements/:token`, `/s/:token` | **none** | — | `text/html` — 빌드 index.html 에 OG 메타 주입 (만료/없음 → 일반 OG 폴백) |
| **GET** | `/share/settlements/:token/image.png`, `/s/:token/image.png` | **none** | — (2026-10-05 부터 IP 120/분) | `image/png` 정산표 카드 (만료/없음 → 404, 렌더 대기열 가득 → 503 `retry-after: 5`), `Cache-Control: public, max-age=300`. 31명 이상이면 앞 30명 + '외 n명' 카드 |
| GET | `/.well-known/apple-app-site-association` | none | — | JSON (env 미설정 시 404) |
| GET | `/.well-known/assetlinks.json` | none | — | JSON array (env 미설정 시 404) |

> 공유 HTML/PNG 라우트(`/share/settlements/*`, `/s/*`)는 **`/api/v1` prefix 밖**의 루트 경로다 — `share-preview.ts` 의 `registerSharePreview(app)` 가 `app.ts` 에서 명시 등록(autoload 우회). 메신저가 짧은 `/s/:token` 도 펼칠 수 있게 별칭을 둔다.

폐기: `PATCH /api/v1/settlements/:id/participants` — `PUT /:id` 가 대체.

2026-09 참여 칩·배지·분류 이름 통일(`237acd5`·`f1422fd`·`d7f4ac1`)은 **API 변경 없음** — 요청·응답 스키마 그대로, 바뀐 것은 화면과 정산표 PNG(`.../image.png`) 하단 기타 설명 줄뿐.

**2026-10-05 계약 변경(`622bfca2`, 깨지는 변경)** — 임시저장 목록에서 payload 가 빠지고 PUT 응답이 `{ id, updatedAt }` 로 줄었다. 구 클라이언트는 목록 payload 로 이어쓰기를 복원하므로 서버만 먼저 나가면 앱(OTA 전)·옛 웹 탭이 서버 임시저장을 못 불러온다. 외부 문서는 [docs/api/README.md](../../docs/api/README.md) 정산·정산 임시저장 절과 `export:openapi` 산출물에 반영됐다(`d07281f0`).

에러 매핑 (`throwAsHttp`):
- `settlement-extraction`: `invalid_image`/`invalid_token` → 400, `image_not_found`/`restaurant_not_found` → 404, `no_provider`·**`busy`(HEIC 변환 대기열, 2026-10-05)** → 503, **`quota` → 429**(2026-10-05, "오늘 영수증 추출 한도(N회)를 모두 썼습니다. 항목을 직접 입력해 주세요."), `llm_failed` → 502. 레이트리밋 초과는 플러그인 429.
- `settlement`: `not_found`/`restaurant_not_found` → 404, `forbidden` → 403, **`expired` → 410**, `invalid_participant`/`invalid_round`/`invalid_receipt_token` → 400
- `settlement-draft`: `not_found` → 404, `forbidden` → 403, `too_many`(50개)·**`too_large`(합계 2MB, 2026-10-05)** → 409, 그 외 → 400. payload 200KB 초과는 zod refine 400.
- `contact`: `not_found`/`forbidden`/`conflict` → 404/403/409, `invalid_input` → 400

## Data [coverage: high — 18 sources]

**Prisma 모델 6개** (전부 [schema.prisma](../../apps/friendly/prisma/schema.prisma)):

- **`SettlementSession`** (`settlement_sessions`) — `userId`, `restaurantPlaceId`/`restaurantName` (1차 식당 스냅샷, `rounds[0]` 과 동기화), `grandTotal`, `shareToken? @unique`, **`shareExpiresAt? DateTime`** (만료 시각, null=무제한/구버전 호환), **`shareOgImage? String`** ('restaurant'|'table'|null), **`shareOgImageUrl? String`** (갤러리에서 고른 식당 사진 원본 URL, null=토큰 시드 랜덤), `editedAt?`, `createdAt`, `updatedAt`. user `onDelete: Cascade`.
- **`SettlementRound`** (`settlement_rounds`) — `sessionId`, `orderIndex`, `restaurantPlaceId`/`restaurantName` (차수 식당 스냅샷), `source`('MANUAL'|'RECEIPT'), `totalAmount?`, `warning?`, `receiptImageToken?`, `itemsSubtotal`, `discountAmount?`, `discountCategory?`, `categoryAdjustments?` (JSON), **`groupSplits? String`** (세부 분배 그룹 JSON 배열, null=없음). session `onDelete: Cascade`.
- **`SettlementItem`** (`settlement_items`) — `roundId`, `name`, `unitPrice?`, `quantity?`, `amount`, `category`, `matchedMenuName?`, `orderIndex`. round `onDelete: Cascade`.
- **`SettlementParticipant`** (`settlement_participants`) — 마스터 명단. `sessionId`, `name?`, `nickname?`, `excludeAlcohol/NonAlcohol/Side` (default), `shareAmount` (grand total per person), `orderIndex`, `contactId?`. contact `onDelete: SetNull`. (2026-09 화면이 긍정형 칩·배지로 바뀌었어도 저장은 그대로 제외 플래그 — 칩 켜짐 = `!exclude` 는 화면에서만 뒤집는다. 마이그레이션 없음.)
- **`SettlementRoundParticipant`** (`settlement_round_participants`) — round × 마스터 참여자 join. `roundId`, `participantId`, `attended`, `excludeAlcoholOverride?`/`NonAlcohol`/`Side`, `shareAmount`. 유니크 `(roundId, participantId)`.
- **`SettlementContact`** (`settlement_contacts`) — 유니크 `(userId, normalizedKey)`.
- **`SettlementDraft`** (`settlement_drafts`) — 서버 임시저장. `userId`, `placeIdKey` (`''` sentinel), `payload`(JSON), `placeNameHint?`. 유니크 `(userId, placeIdKey)`, 인덱스 `(userId, updatedAt)`. user `onDelete: Cascade`. 2026-10-05 상한: 행 50개/사용자, payload UTF-8 200KB/행, payload 합계 2MB/사용자(스키마 변경·마이그레이션 없음 — 크기는 `octet_length(payload)` 로 DB 안에서 잰다).

**영수증 파일** — `apps/friendly/data/receipts/<token>.jpg`. 토큰 `randomUUID()`. sharp EXIF rotate + ≤1600px + JPEG 80 + mozjpeg. 분할 입력일 땐 `cropForSplit` 가 X 축 N등분. **보존(2026-10-05)** — 매일 04:20 KST `cleanupUnreferencedReceipts` 가 mtime 30일 지난 파일 중 참조 없는 것을 지운다. 참조 = `settlement_rounds.receiptImageToken` + `settlement_drafts.payload` 안의 UUID 문자열(payload 는 자유 JSON 이라 정규식으로 찾는다). 그 전엔 자동 정리가 없어 누적됐다.

**추출 일일 카운터(2026-10-05)** — `meal_daily_quotas` 행 `(userId, date=kstToday(), purpose='settlement-extraction', count)`. 비전 호출 직전 `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < limit` 한 문장(바뀐 행 1 = 통과)이라 동시 요청도 한도를 넘지 않는다. `limit <= 0` 이면 카운트하지 않고 통과.

**OG 폰트** — `apps/friendly/assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf`. satori 는 system 폰트를 못 써 ttf 버퍼를 명시 주입해야 한다. 2026-10-05 이전엔 `settlement-card.ts` 가 후보 경로(dev src / prod dist 양쪽)를 스스로 찾아 캐시했고, 이제 [lib/share-fonts.ts](../../apps/friendly/src/lib/share-fonts.ts) 의 `loadPlexFonts`(같은 탐색, 프로세스 수명 1회)를 타로·사주 카드와 공유한다. 정산 카드는 `loadPlexOnlyFonts` — Plex 두 벌만 든 고정 배열(satori 가 글꼴 배열을 키로 파싱 결과를 캐시하므로 호출마다 새 배열이면 렌더가 약 2배 느렸다). 한자 대체 글꼴 `NotoSansKR-Hanja-Regular.otf` 는 붙지 않는다.

**카드 PNG 캐시** — `(token, updatedAt)` 키 `SharePngCache` 6MB·30분(2026-10-05 이전 `LRUCache({ max: 200 })`). 보통 장당 0.1MB, 큰 표 1MB 안팎. 다섯 공유 PNG 캐시 합계 32MB 안팎으로 맞춘 예산의 일부다.

**`shareToken`** — 이번 라운드에 **7바이트 `randomBytes` → base64url 10자**로 축소(이전 32바이트 43자). 만료(`shareExpiresAt`)가 항상 걸려 노출 창이 닫혀 짧아도 안전. unique 충돌 시 5회까지 재생성. 회수 = `null` + `shareExpiresAt=null`. 재발급 = 새 randomBytes(이전 토큰 영구 무효). route 의 `TokenParams` 하한을 `min(8)` 으로 낮춰 신·구 토큰 모두 조회된다.

**`ShareTtl` → ms** — `SHARE_TTL_MS` `{ '1d', '7d', '30d' }`. `createShare` 마다 `Date.now() + SHARE_TTL_MS[ttl]` 로 만료 갱신(연장).

**OG 이미지 선택 로직** (`pickRestaurantOgImageUrl`):
- `mode='table'` → `null` (호출부가 정산표 PNG `.../image.png` 로 폴백).
- `mode='restaurant'` (기본) → `collectCandidateImageUrls` 후보 중에서: `shareOgImageUrl` 이 후보에 살아 있으면 그것, 아니면 `images[seedFromToken(token) % images.length]` (토큰 시드 결정적 랜덤 — 같은 링크는 항상 같은 사진, 카카오 OG 캐시와 일관). 후보가 0장이면 null → 정산표.
- 결과 URL 은 thumbnail 프록시(`?url=...&w=1200&q=80`)로 감싼다.

**공유 미리보기 캐시** (`sharePreviewCache`) — OG 크롤러가 같은 링크를 짧은 시간에 여러 번 펼치므로 `(token, origin)` 키(`"${token} ${origin}"`)로 결과를 **5분 TTL** 캐시(성공 non-null 만). owner 가 share 갱신/회수하면 `invalidateSharePreview(token)` 이 그 토큰의 모든 origin 변형 엔트리를 제거. 메모리 상한 5,000 초과 시 통째 비움. 단일 인스턴스 전제(CLAUDE.md) — Redis 불필요.

**`categoryAdjustments` 직렬화** — `serializeCategoryAdjustments` 가 입력 clientId 를 db id 로 치환해 `{ [Category]: { leftoverParticipantId, roundUnit } }` JSON 으로. 매칭 안 되는 clientId 는 조용히 drop.

**`editedAt`** — PUT update 시에만 갱신. `updatedAt` 은 share token 발급/회수에서도 자동 bump 되어 부적합.

**Zustand persist 스토어** ([settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)) — storage 어댑터 주입(앱 AsyncStorage / 웹 sessionStorage / no-op). **version: 4** migration (v1→v2 rounds 배열, v2→v3 discount, v3→v4 categoryAdjustments). → 현재 **version: 6**(v4→v5 groupSplits, v5→v6 leftover 배열 — 위 Architecture·아래 항목). 2026-09 참여 칩 전환은 store 모양을 안 바꿔 버전 그대로.

**`groupSplits` 직렬화** — `serializeGroupSplits` 가 입력 멤버 clientId 를 db id 로 치환해 `[{ label, category, itemIndexes, mode, members:[{participantId, glasses}] }]` JSON 으로 저장. 매칭 안 되는 멤버는 빼고, 멤버 0명이 된 그룹은 통째 drop(=균등 분배 의미라 저장 가치 없음). 응답 시 `parseGroupSplits` 로 복원(파싱 실패면 null). 계산기 입력으로는 `toGroupCalcInputs`(응답 participantId→인덱스) / `buildRoundCalcInput`(입력 clientId→인덱스)가 변환. `itemIndexes` 는 round.items 배열 인덱스 — 한 항목은 최대 1개 그룹(스키마 refine + 계산기 첫 그룹만 인정 방어).

**`leftoverParticipantIds` 배열화** — '분담 다듬기' 잔여 수령자가 단일 → 배열 `.min(1)` 로 승격(e3af75b). 1명=몰아주기 / 여러 명=잔여 재균등 / 활성 아닌 수령자 무시 / 유효 0명이면 첫 활성자 fallback. draft store v5→v6 migration 이 옛 단일 키를 배열로 승격.

**Migrations 12개** (시간순, settlement 관련):
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
11. [`20260601120000_add_share_og_image_url`](../../apps/friendly/prisma/migrations/20260601120000_add_share_og_image_url/migration.sql) — `shareOgImageUrl TEXT`.
12. **[`20260610011757_add_settlement_group_splits`](../../apps/friendly/prisma/migrations/20260610011757_add_settlement_group_splits/migration.sql)** (NEW) — `settlement_rounds.groupSplits TEXT`.

2026-10-05 성능 감사 2차의 정산 변경은 **마이그레이션 없음**(임시저장 상한은 코드, 추출 카운터는 기존 `meal_daily_quotas`).

## Key Decisions [coverage: high — 36 sources]

시간순 진화 (MVP → 공유 → 단골 → 편집+배지 → N차/할인/임시저장/앱/딥링크 → OG 공유 대확장/perf/OCR 회귀 → 세부 분배(그룹 split)/술 종류 사전 → 참여 표시 긍정형·분류 이름 단일 소스(2026-09) → **성능 감사 2차 상한·헛조회(2026-10-05)**). 최신 묶음을 맨 위에 두고, 그 아래는 옛것부터:

**성능 감사 2차 (2026-10-05, `622bfca2`·`0157da60`·`78cbb457`·`82d455c7` — [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md))** — 관련 컨셉: [amplification-caps](../concepts/amplification-caps.md)(카드 30명·임시저장 200KB/2MB·영수증 50회/일), [bounded-byte-caches](../concepts/bounded-byte-caches.md)(카드 PNG `SharePngCache`), [lazy-heavy-imports](../concepts/lazy-heavy-imports.md)(sharp·satori·resvg·heic-convert 사용 시점 import), [in-memory-singleton-gates](../concepts/in-memory-singleton-gates.md)(렌더 슬롯·HEIC 게이트 프로세스 전역 1).
- **2026-10-05 임시저장 목록은 메타만, 이어쓰기는 슬롯 단건 GET(`622bfca2`)** — 목록이 사용자당 50건 payload 를 통째로 내려 30.7MB·335ms(동시 4건 RSS 833MB, G-V1)였고, 클라는 그중 한 슬롯만 썼다. 메타(`byteSize` 포함) 9KB·42ms + `by-place` 단건. 없는 슬롯은 404 가 아니라 `{ draft: null }` 200 — "새로 시작" 이 정상 경로라서. 단건 쿼리는 staleTime 0 으로 진입마다 서버 최신(다른 기기 편집·삭제 반영)을 기다린다.
- **2026-10-05 크기는 UTF-8 바이트로, 사용자 합계 2MB, PUT 응답은 id·updatedAt 만(`622bfca2`)** — `JSON.stringify().length` 는 UTF-16 글자 수라 한글이면 같은 200KB 한도가 600KB 까지 늘었다. 행 수 상한(50)만으론 50×600KB = 30MB 가 가능해 합계 상한을 따로 둔다. 응답에서 payload 를 빼 자동저장 왕복도 줄였다 — 캐시는 클라가 방금 보낸 입력으로 채운다(`applySavedDraft`).
- **2026-10-05 영수증 HEIC 는 거부(415)하지 않고 worker 디코드 유지(`622bfca2`)** — 계획의 "가장 싼" 안은 415 였지만, 웹이 `accept` 에 `image/heic` 를 명시하고 iOS Safari·맥에서 HEIC 원본이 그대로 올라오는 것이 정상 경로라 거부하면 기능이 깨진다. 대신 디코드 전 선언 해상도 검사(2,500만 화소 = 아이폰 24MP 까지, 48MP 거부) + 작업마다 새 worker 를 띄우고 끝나면 terminate(libheif wasm 선형 메모리는 worker 가 죽어야 반환) + 동시 1.
- **2026-10-05 HEIC 게이트를 식단과 하나로(`0157da60`)** — 영수증·식단이 워커·게이트를 따로 가져 두 장이 동시에 풀리면 24MP 피크 +350MB 씩 겹쳤다. 공용 `lib/heic-worker` 의 프로세스 전역 동시 1건(대기 8)을 함께 쓴다 — 대신 한쪽이 몰리면 다른 쪽이 기다린다(→ `busy` 503).
- **2026-10-05 추출 일일 한도 50, 차감은 비전 호출 직전 1회(`622bfca2`)** — 가입이 무료(가입 40/시간/IP)라 로그인 요구만으론 비전 LLM 비용·계정 LLM 슬롯을 막지 못했다(G-3). 잘못된 토큰·모델 미설정처럼 LLM 을 안 부르는 실패는 차감하지 않는다. 별도 테이블을 만들지 않고 식단의 원자 카운터(`meal_daily_quotas`)를 purpose 로 나눠 쓴다(마이그레이션 없음). 업로드·추출 IP 분당 20 은 보조선이고 진짜 비용 방어선은 일일 한도.
- **2026-10-05 미참조 영수증 30일 정리(`622bfca2`)** — 업로드는 로그인만 하면 무제한이라 디스크가 계속 자랐다. 업로드 → 추출 → 저장은 보통 몇 분~며칠 안에 끝나고, 이어쓰기 중인 영수증은 임시저장 payload 가 참조해 살아남는다. 04:20 은 04:00 로그 보존·04:40 usage-quota GC 와 겹치지 않는 자리.
- **2026-10-05 정산 카드는 앞 30명 + '외 n명', 넓으면 차수 소계만, 4MP(`78cbb457`)** — 100명×10차를 그대로 그리면 받는 사람도 읽을 수 없고 미스 1회 5.3초 블로킹·RSS +770MB(F-V2). 전체 정산표는 공유 페이지(웹·앱)에서 본다. '외 n명' 행은 숨긴 사람들의 칸별 합이라 보이는 행 + 이 행 = 합계 행. 30명 이하·좁은 표는 예전과 픽셀 동일(고정 폭 유지).
- **2026-10-05 31명 이상 정산의 og:image 는 기본 이미지(`78cbb457`)** — 링크 미리보기 크기에선 접힌 카드도 읽히지 않는다. 식당 사진을 고른 경우(`ogImageUrl`)는 그대로, '이미지로 보내기' 버튼은 그대로 카드.
- **2026-10-05 공유 렌더 동시 상한 1 — 계획(1~2)에서 결정 변경(`78cbb457`)** — 동시 2 는 GC 뒤 RSS 가 800MB 대(동시 1 보다 약 230MB 높음, 실측). 대기 16 을 넘으면 503 — 정상 트래픽은 닿지 않는다. 렌더 블로킹은 239~393 → 19~35ms(`renderAsync` + `loadSystemFonts:false`, 결과 픽셀 동일).
- **2026-10-05 정산 카드는 한자 대체 글꼴을 붙이지 않는다(`78cbb457`)** — `loadShareFonts`(타로·사주) 배열은 `loadAdditionalAsset` 으로 한자 글꼴이 한 번 보태지면 그 배열에 남는다. 정산 카드가 같은 배열을 쓰면 앞서 어떤 타로·사주 카드를 그렸느냐에 따라 같은 정산의 결과 PNG 가 달라지므로, Plex 만 든 별도 고정 배열을 쓴다(대신 한자는 □).
- **2026-10-05 수정 모드는 임시저장 hydrate 를 `enabled:false` 로 끈다(`82d455c7`)** — `placeId` 자리에 `null` 을 넘겨 끄는 관용이 "식당 미지정 슬롯" 이라는 실제 키와 겹쳤다. 끄는 것과 슬롯 선택을 별도 인자로 분리하고, 꺼진 동안엔 예전 결과도 내보내지 않는다. 자동저장(`enabled: !isEdit`)은 원래 꺼져 있었다.
- **2026-10-05 웹이 영수증을 올리기 전에 장변 2000px JPEG 로 줄인다(`82d455c7`)** — 서버가 어차피 1600px 로 정규화하는데 폰 원본(3~8MB)을 약한 상향 회선으로 보내 업로드만 수십 초였고, 5MB 초과는 다 올린 뒤에야 413 이었다. 서버 한도보다 조금 크게(2000px·q0.9) 보내 서버 재압축 뒤 가독성이 원본과 비슷하게 남게 한다. 축소는 최적화일 뿐 전제가 아니라 실패하면 원본 — 특히 EXIF 방향을 적용하지 않는 옛 브라우저는 canvas 가 EXIF 를 지워 영수증이 누운 채 추출되므로 줄이지 않는다.
- **2026-10-05 결과를 안 쓰는 동안은 조회하지 않는다(`82d455c7`)** — 닫힌 다이얼로그·포커스 없는 자동완성·메뉴 모달 전 식당 상세(서버가 리뷰 전체를 읽는 무거운 응답)가 화면에 안 보이는 요청을 사람·차수 수만큼 냈다. `enabled` 옵트아웃 + 검색은 디바운스 + `keepPrevious`(목록 깜빡임 제거), 저장 응답은 상세 캐시에 심고 무효화는 목록만.

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
- **폭 적응 스케일** — 표가 넓을수록 2x 는 과하므로 width>900 → 1x, >640 → 1.5x, else 2x 로 PNG 크기 억제하되 좁은 표는 또렷하게. height 미지정 → satori 자동 계산(참여자/차수 많아도 안 잘림). (2026-10-05 부터 이 규칙은 `cardScale` 로 옮겨졌고 면적이 4MP 를 넘을 때만 그 안으로 더 낮춘다 — 참여자·차수 상한은 위 성능 감사 2차 묶음.)
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
- **draft hydrate placeId당 1회** — `useSettlementDraftHydrate` 가 한 placeId 에 대해 단 한 번만 store 를 덮어쓴다(`hydratedForRef`). 자동 저장이 list 를 invalidate→refetch 해도 같은 컨텍스트면 재hydrate 안 함 — 저장 in-flight 중 옛 서버 스냅샷이 사용자 입력을 밀어내는 레이스 + 저장마다 store 전역 리렌더 방지. (2026-10-05 부터 보는 대상이 목록이 아니라 `by-place` 슬롯 쿼리이고, 저장 성공 시 그 캐시가 `setQueryData` 로 갱신돼도 같은 가드로 재hydrate 하지 않는다.)

**영수증 OCR 빈 항목 회귀 수정 (EXTRACTION_VERSION 2→3)**
- **소극적 프롬프트 제거** — "읽기 어려우면 빼라 / items 가 빈 배열이어도 된다" 같은 지시가 qwen3-vl 류 vision 모델에서 항목을 통째로 비우는 회귀를 유발. "영수증에 보이는 상품/메뉴 줄을 하나도 빠짐없이 추출" 로 전환. 출력 형식은 `format=schema` 가 강제하므로 장황한 JSON 포맷 규칙도 축소. (probe-vision 으로 검증.)

**세부 분배 그룹 (group split, 2026-06-25 17차 핵심)**
- **풀 → 그룹 풀 + 나머지 풀 분해** — 카테고리 균등 분배를 깨지 않고 위에 얹는다. 한 카테고리 raw 풀을 묶인 항목(그룹 풀)과 안 묶인 항목(나머지 풀)로 나누고, 나머지 풀은 기존 제외-플래그 균등 규칙 그대로. 그룹에 아무 항목도 안 넣으면 동작이 100% 동일 — 점진적 도입.
- **EQUAL vs GLASSES** — 그룹 내 균등 또는 정수 잔수 가중치 비례. `distributeByWeight` 가 floor 후 1원 잔여를 소수부 큰 순서로 분산해 합이 정확히 풀과 일치(정수 연산만). GLASSES 인데 잔수 합 0 이면 균등 fallback(전원 0잔 입력 방어).
- **유효 멤버 0명 → 나머지 풀 환원** — 그룹 멤버가 그 차수에서 전부 비참석이면(`calculateMultiRoundShares` 가 비참석 멤버를 뺌) 그룹 풀을 나머지(균등) 풀로 되돌리고 `applied=false`. 그룹 때문에 금액이 증발하지 않는다.
- **제안→확인, silent 자동 적용 안 함** — `suggestItemGroups` 가 항목명 키워드로 그룹을 감지하지만 자동 저장하지 않고 원탭 '생성' 으로 확인을 받는다. 오분류(예: '카스테라' 를 맥주로)가 모르게 박히는 걸 막는다. 기본 멤버십은 '전원 모든 그룹 포함' — 사용자는 예외(안 마신 칸)만 표시.
- **계산기 카테고리 범용, UI 는 주류/음료만** — 스키마·calculator 는 어느 카테고리든 그룹을 받지만 `GROUPABLE_CATEGORIES`(ALCOHOL/NON_ALCOHOL)로 UI 노출을 좁힌다. 그룹 카테고리는 항목 카테고리와 같아야 한다(스키마 refine).
- **웹 매트릭스 vs 앱 카드** — 웹은 사람×그룹 매트릭스(행=사람, 한 줄이 한 사람 음주 전체), 앱은 좁은 화면이라 그룹 카드 세로 스택. 로직 동일, 표현만 플랫폼 관용구.
- **근거 풋노트(읽기 전용)** — 결과/공유 화면에서 "왜 내 주류가 더 비싸?" 를 바로 읽게: 잔수 그룹은 멤버·잔수 나열, 균등 그룹은 전원 대신 '빠진 사람'만 명시(예외만 보여 한눈에).

**술·음료 종류 사전 + 추출 오분류 보정 (EXTRACTION_VERSION 3→4)**
- **사전 단일 소스 → 세 소비자** — 제안·서버 보정·프롬프트 힌트가 같은 `DRINK_KINDS` 를 공유. 브랜드 추가는 한 곳. (위 Talks To.)
- **결정적 후보정이 프롬프트보다 신뢰** — '새로/대선/시원' 같은 일반 단어형 제품명은 vision 모델이 안주로 찍기 쉽다. 프롬프트 힌트(v4)는 best-effort, `matchDrinkKind` 후보정이 결정적 안전망 — 어드민에서 모델을 바꿔도 보장. `noHangul` 가드로 '카스테라'(안주)·'새로운안주'(안주) 오매칭 회피.

**참여 표시 긍정형 + 분류 이름 단일 소스 (2026-09-29, `237acd5`·`f1422fd`·`d7f4ac1`)**
- **입력도 결과도 긍정형, 저장은 제외 플래그** — 예전엔 입력이 부정형("주류 안 함" 체크 = 빠짐)이고 웹 결과 카드만 긍정 배지(분담한 사람에 🍺)라 섞여 있었다. 칩은 기본 켜짐·안 먹은 사람만 끔이라 탭 수가 체크박스와 같고, 결과·입력 모두 "누가 무엇을 나눴나" 로 읽힌다. 서버·DB·draft 모양을 안 건드리려고 극성은 화면에서만 뒤집는다(켜짐 = `!exclude`).
- **예외 서술은 부정형 유지** — 차수 특이사항 칩은 "예외" 를 적는 자리라 "술 안 마심 / 안주 먹음" 처럼 문장 그대로, 단골 태그도 예외만 보이는 "술 X / 음료 X / 안주 X". 긍정형 전환은 "기본 상태가 전원 참여" 인 자리(참여자 칩·결과 배지)에만.
- **배지는 차수 단위로 판정** — 긍정 배지는 "마셨다" 고 말하므로 마스터 설정만 보면 특이사항으로 술을 뺀 사람에게도 '술' 이 붙어 분담액과 어긋난다(옛 "주류 X" 도 마스터만 봤지만 부정형이라 덜 눈에 띄었다). 그래서 그 분류 항목이 있는 차수만, 실효 제외(`effectiveExcludes`)·불참을 반영해 판정. 전원이 나눈 축은 구분할 게 없어 생략 — 전원 참여 정산이 배지로 도배되지 않게.
- **뺀 칩은 반투명 금지** — 점선 + 취소선 + 흐린 글자색만. 반투명(`opacity-70`)을 겹치면 다크 모드에서 칩이 거의 사라졌다.
- **분류 이름 사본 15곳 → api-contract 1곳** — 같은 `UNCATEGORIZED` 가 "미분류"/"기타", `ALCOHOL` 이 "주류"/"술" 로 화면마다 달랐던 원인이 파일별 사본. 서버 PNG 도 같은 이름을 써야 해서 api-contract 에 둔다(shared 는 FE 전용 — CLAUDE.md 순환 금지 방향과도 맞음).
- **편집 선택지만 "기타(모두 나눔)"** — 기타는 새 행·메뉴 추가의 기본값이다. 술을 분류하지 않고 넘어가면 안 마신 사람까지 나눠 내게 되므로 선택지에서 뜻을 드러낸다. 표·결과는 짧은 "기타".
- **기타 설명은 정산표 아래, 특히 PNG 에** — 정산표만 받는 사람은 "기타 500원" 이 무엇인지 모른다. 카톡으로 받는 사람은 PNG 만 보므로 웹·앱 표와 공유 PNG 세 곳에 같은 문구. 표에서 기타 열이 숨는 차수(할인으로 풀 0 등)는 호출부가 items 를 비워 넘겨 표와 설명이 어긋나지 않게, 같은 이름 1번·0원 제외·차수당 3개 + "외 N개" 로 짧게.
- **영수증 추출 프롬프트의 "주류/비주류" 는 그대로** — 화면 라벨이 아니고, 바꾸면 `EXTRACTION_VERSION` 을 올리고 추출을 재검증해야 한다.

**기타 환경**
- **dev CORS 전면 반사 (15차 정착)** — `cors.ts` 가 모든 origin 을 반사 허용하고 비-LAN origin 만 origin당 1회 warn. 이전 화이트리스트 `cb(Error)` 거부가 로그인 preflight 를 깨던 회귀 해소(Expo Web 모바일 단말 LAN IP 대응).
- **운영 도메인 이전 + 배포 스크립트** — nlpp.easypcb.co.kr → ninelife.kr. host 미존재 시 OG og:url 폴백 도메인도 ninelife.kr. `deploy.sh`(케이스 번호 선택) 추가.

## Gotchas [coverage: high — 32 sources]

- **서버·웹·앱(OTA)을 함께 배포 (2026-10-05)** — 임시저장 계약이 바뀌었다. 서버만 먼저 나가면 구 클라이언트(OTA 전 앱·열려 있던 옛 웹 탭)는 목록 항목에 payload 가 없어 이어쓰기를 복원하지 못하고, 구 클라의 저장 `onSuccess` 가 `{ id, updatedAt }` 응답을 목록 캐시 항목으로 끼워 넣어 이력 화면 행이 깨진다. 반대로 클라만 먼저면 `by-place` 가 404 라 sessionStorage 만 쓰는 모드로 떨어진다. [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) "배포 체크리스트" 1번.
- **배포 직후 첫 04:20 에 오래된 영수증이 한꺼번에 지워진다 (2026-10-05)** — 그 전엔 정리가 없어 누적된 미참조 파일 중 30일 지난 것이 첫 실행에 몰려 사라진다(정산·임시저장이 참조하는 건 남음). 서버 임시저장 없이 브라우저 sessionStorage 에만 남은 초안(자동저장 실패 등)의 영수증 토큰은 참조로 잡히지 않는다. [docs/deploy-friendly.md](../../docs/deploy-friendly.md) 의 업로드 파일 표는 아직 "자동 정리 없음(누적)" 이라 낡았다.
- **추출 한도는 차감 후 LLM 이 실패해도 돌려주지 않는다** — `consumeQuota` 는 비전 호출 직전에 한 번 쓰고 끝이다(`MealDailyQuotaService` 에 환불 API 없음). 502·타임아웃·빈 결과로 재시도하면 그만큼 깎인다. 한 사진 N분할 추출은 N회.
- **추출 카운터는 `meal_daily_quotas` 에 있다** — 표 이름은 식단이지만 purpose `'settlement-extraction'` 행이 영수증 한도다. 운영에서 한도를 확인·초기화할 때 정산 테이블을 찾지 말 것. `SETTLEMENT_EXTRACT_DAILY_LIMIT=0` 은 차단이 아니라 무제한.
- **`useSettlementDraftHydrate(null)` 은 "끔" 이 아니다 (2026-10-05 `82d455c7`)** — `null` 은 식당 미지정 슬롯(`placeIdKey=''`)이다. 끄려면 `{ enabled: false }`. 예전 수정 모드가 `null` 로 끄려다 그 슬롯의 임시저장으로 편집 중인 정산을 덮어썼다(세션이 먼저 채워지고 슬롯 응답이 뒤에 오면 재현 — `SettlementNewPage.test` 가 고정).
- **임시저장 크기는 두 곳에서 잰다** — zod refine 은 `utf8ByteLength(JSON.stringify(payload))`(200KB/행), service 합계 검사는 `SUM(octet_length(payload))` + `Buffer.byteLength`(2MB/사용자). 50개·2MB 상한은 트랜잭션 밖 사전 검사라 동시 저장이면 살짝 넘을 수 있다(소프트 캡, debounce 자동저장이라 실질 경합 없음). `octet_length` 는 SQLite 3.43+ (Prisma 번들 3.46) — `$queryRaw` 의 집계 결과는 `bigint | number` 로 와서 `Number()` 로 감싼다.
- **HEIC 너무 크면 영수증은 400, 식단은 413** — 같은 `lib/heic-worker` 상한(2,500만 화소)이지만 영수증 서비스는 디코드 전 `heifDimensions` 로 직접 `invalid_image`(400)를 던진다. 해상도 박스(meta → iprp → ipco → ispe)를 못 읽는 HEIF 는 공용 워커가 `invalid` 로 거절해 역시 400.
- **공유 렌더 슬롯은 프로세스 전역 1개** — 정산 카드 미스는 타로·사주·사주(G) 카드 렌더와 같은 줄에 선다. 대기 16 을 넘으면 카드 PNG 가 503(`retry-after: 5`, `no-store`). 렌더 콜백 안에서 풀 로우 조회(`getBySharedToken`)까지 하므로 DB 조회 시간도 슬롯을 잡는다.
- **정산 카드의 한자는 □** — `loadPlexOnlyFonts` 라 한자 대체 글꼴이 없다(결정성 때문에 일부러). 식당명·메뉴명에 한자가 있으면 PNG 에서만 깨진다(웹·앱 화면은 정상).
- **31명 이상 정산의 og:image 는 정산표가 아니다** — `shareOgImage='table'` 이라도 `isCardTruncated` 면 기본 이미지(`OG_IMAGE_PATH`). 카드 자체(`.../image.png`)는 '외 n명' 으로 계속 나온다.
- **남은 것(후속, PLAN-perf-2)** — ① 정산 카드 satori 레이아웃의 worker 이전(30명×3차 약 160ms 가 여전히 메인 스레드 — `renderAsync` 는 래스터만 스레드풀로 옮긴다). ② "기존 정산 카드의 100만 원 이상 금액 칸 잘림"(기존 결함, 성능 범위 밖) — 30명 이하 카드는 픽셀 동일을 위해 고정 폭(`CAT_W` 74·`SUB_W` 84·`TOTAL_W` 96px, 굵은 19px)을 유지해, '1,000,000' 같은 7자리 금액이 칸을 넘는 것으로 보인다(코드 추정 — 넓힘 `fitNumW` 는 '외 n명'·compact 카드에만). ③ 세마포어 구현 통합(`modules/ai/concurrency-gate`·`lib/async-gate` + `share-render` 자체 카운터).
- **웹 영수증 축소는 업로드 한도와 별개로 다시 검사한다** — `prepareReceiptImage` 는 실패해도 원본을 돌려주므로 호출처가 결과 크기를 `RECEIPT_MAX_UPLOAD_BYTES`(5MB)와 비교해 안내한다. 이 5MB 는 서버 `plugins/multipart.ts` 의 `fileSize` 와 손으로 맞춘 값(공유 상수 아님).

- **칩 극성은 화면에서만 뒤집힌다 (2026-09)** — `ParticipationToggles` 의 `onChange(key, exclude)` 는 **제외 값**을 넘긴다(켜진 칩을 누르면 `exclude=true`). 칩 상태 `joined = !value[key]`. 새 호출부에서 `joined` 를 그대로 저장하면 의미가 반대로 박힌다 — 웹 [ParticipationChips.test.tsx](../../apps/web/src/routes/settlement/ParticipationChips.test.tsx) 가 극성을 고정.
- **배지 판정은 "그 분류 항목이 있는 차수" 만 본다** — `participationBadgeAxes` 는 `category` 일치 + `amount > 0` 항목이 없는 차수의 제외·불참을 판정에서 뺀다. 술 항목이 없는 차수에서 술을 뺐어도 쟁점 축이 아니다. 또 **세부 분배 그룹 멤버십은 보지 않는다** — 제외 플래그(+차수 특이사항)만 보므로, 소주 그룹에서만 빠진 사람에게도 '술' 배지는 붙을 수 있다(나머지 술 풀을 나눴다면 맞는 표시).
- **전원이 뺀 분류는 배지도 설명도 없다** — 예: 술이 있는데 전원 "술" 을 끔 → 계산기는 그 풀을 전원 균등으로 넘기고(`activeCount === 0` fallback) 금액을 그 분류 열(`perCategoryShares.ALCOHOL`)에 그대로 적는다. 배지는 아무도 안 나눴으니 0개, `uncategorizedNote` 는 `UNCATEGORIZED` 항목만 설명하므로 이 경우를 말하지 않는다(2026-09 커밋 때 선택 사항으로 남겨 둠).
- **기타 설명은 표의 기타 열과 맞춰 넘겨야 한다** — 웹·앱 `SettlementBreakdownTable` 과 `settlement-card.ts` 는 각자 `matrix.rounds[i].categories.includes('UNCATEGORIZED')` 일 때만 그 차수 items 를 넘기고 아니면 `[]` 를 넘긴다(할인으로 기타 풀이 0 이 돼 열이 숨는 차수). 새 화면에서 `uncategorizedNote(session.rounds)` 를 그대로 부르면 표에 없는 기타를 설명하게 된다.
- **참여 축 라벨(`PARTICIPATION_AXES.label`)과 분류 이름(`SETTLEMENT_CATEGORY_LABEL`)은 별개 상수** — 둘 다 "술/음료/안주" 지만 전자는 shared(`participation.ts`), 후자는 api-contract(`settlement.labels.ts`)에 따로 적혀 있다. 이름을 바꾸면 두 곳.

- **공유 라우트는 두 군데로 나뉜다** — 인증 JSON 조회 `GET /api/v1/share/settlements/:token`(settlement.route.ts) 와 비인증 OG HTML/PNG `GET /share/settlements/:token`·`/s/:token`(share-preview.ts, prefix 밖)가 별개. 토큰 형식·만료 규칙은 같지만 등록 위치/응답 타입이 다르다. PNG 라우트는 `getBySharedToken` 을 거치므로 만료/없음이면 자동 404.
- **index.html 못 찾으면 500 + 시도 경로 로깅** — dist 미빌드/경로 오설정 시 `share-preview` 가 후보 경로 전부와 cwd 를 error 로그로 남기고 500. 운영에서 `WEB_INDEX_PATH` 명시 지정 권장.
- **OG 폰트 못 찾으면 PNG 렌더 실패 500** — 2026-10-05 부터 `lib/share-fonts.ts` 의 `loadPlexFonts` 가 `assets/fonts/IBMPlexSansKR-*.ttf` 를 후보 경로로 찾는다(그 전엔 `settlement-card.ts` 자체 탐색). prod 번들 시 폰트 파일이 dist 옆에 같이 배포돼야 한다(tsup 이 ttf 를 안 옮기므로 별도 복사 필요). 실패한 promise 도 캐시되므로 폰트를 고친 뒤엔 재시작해야 한다.
- **sharePreviewCache 무효화는 owner 액션에서만** — owner 가 `createShare`/`revokeShare` 하면 `invalidateSharePreview(token)`. 그 외 경로(예: 세션 직접 PUT 으로 식당이 바뀜)에서는 캐시가 최대 5분 stale 할 수 있다. OG 정확도엔 5분 허용 범위.
- **shareOgImageUrl 은 후보에 살아 있어야 적용** — owner 가 고른 사진이 식당 사진 목록(getPhotoUrls)에서 사라지면(스냅샷 갱신 등) `createShare` 가 `null` 로 정리하고 토큰 시드 랜덤으로 폴백. UI 의 '선택됨' 표시도 다음 share 호출 때 사라진다.
- **shareToken 10자로 축소 + route 하한 min(8)** — 신 토큰(10자)과 구 토큰(43자) 모두 `TokenParams.min(8).max(64)` 안에 들어와 그대로 조회된다. 하한을 더 올리면 옛 링크가 깨진다.
- **차수 attendee 의 마스터→인덱스 변환** — 입력 시 `participantClientId`, 저장 시 db id, 계산기는 참석자 배열 인덱스. categoryAdjustments 의 `leftoverParticipantClientId` 가 그 차수 비참석 마스터를 가리키면 calculator 가 첫 활성자 fallback. zod 가 아니라 service/calculator 가 정합성을 떠받친다.
- **`roundUnit` 안전망** — UI/zod 가 활성 조건을 검사해도 calculator 는 안 떨어지는 값이 들어오면 무시(잔여 가산 모드)로 crash 회피. roundUnit 은 **나머지(균등) 풀에만** 적용 — 그룹 풀 잔여는 `distributeByWeight` 가 1원씩 자동 분산.
- **groupSplits `itemIndexes` 는 배열 인덱스 — 항목 순서가 바뀌면 깨진다** — `orderIndex`(=round.items 배열 위치)를 참조하므로, 그룹을 만든 뒤 항목을 삭제/재정렬하면 인덱스가 어긋난다. draft store 가 항목 변경 시 그룹의 죽은 itemClientId 를 청소하지만, 저장 페이로드의 `itemIndexes` 정합성은 클라가 매번 다시 계산해 보낸다. 스키마 refine(범위·카테고리 일치·중복)이 마지막 방어선.
- **그룹 멤버는 마스터 참여자 참조 + 차수 비참석 자동 제외** — 멤버는 `participantClientId`(입력)/`participantId`(응답)로 마스터를 가리킨다. `calculateMultiRoundShares` 가 그 차수 비참석 멤버를 자동으로 빼고, 남은 멤버 0명이면 그룹 풀을 나머지 풀로 환원(`applied=false`). service `validateInput` 이 마스터에 없는 멤버 참조를 `invalid_round` 로 차단.
- **빈/단일 그룹은 저장 안 됨** — `serializeGroupSplits` 가 멤버 0명 그룹을 drop 하고, 전체가 비면 컬럼을 null 로. "한 그룹에 전원" 은 균등 분배와 같으므로 저장 가치가 없다 — 응답에서 groupSplits=null 로 보여도 정상.
- **할인 페어 일관성** — `discountAmount`/`discountCategory` 양쪽 null 또는 양쪽 set, 풀 음수도 refine 가 거부. calculator 의 `Math.max(0,…)` 는 안전망.
- **영수증 토큰 IMAGE_TOKEN_PATTERN 두 곳 복사** — `settlement.service` 와 `settlement-extraction.service` 가 동일 정규식을 따로 둔다(모듈 결합도 축소). 변경 시 두 곳.
- **`normalizedKey` 정의 4곳 복사** — server `normalizeContactKey` SSOT + 클라 두 파일 + backfill. 바꾸려면 4곳 동시에.
- **`editedAt` 과 `updatedAt` 분리** — `@updatedAt` 은 share token 발급/회수에도 bump 되어 '수정됨' 배지에 부적합.
- **draft payload 자유형 → 형 검증은 클라** — 서버는 z.unknown() + 크기(2026-10-05 부터 UTF-8 200KB·사용자 합계 2MB)만 본다. hydrate 시 `Array.isArray(p.participants)` 등 type guard 로 방어.
- **draft hydrate placeId당 1회** — `hydratedForRef` 가 같은 placeId 재hydrate 를 막는다. placeId 가 바뀌면 다시 허용. 이 가드가 없으면 자동 저장 refetch 가 입력을 옛 스냅샷으로 덮어쓴다.
- **Vision LLM 타임아웃 별도** — `VISION_TIMEOUT_MS=60_000` + `AbortController` 시그널을 `provider.complete({ signal })` 에 묶음.
- **Preview 라우트 JWT 필요 → `<img src>` 직접 불가** — `useReceiptPreviewUrl` 가 fetch → Blob → objectURL(웹) / FileReader data URL(앱, RN Image 가 objectURL 못 받음). 반환값을 Lightbox 로 그대로 확대.
- **`SharedSettlementSession` 은 omit 페어** — round 에서 `receiptPreviewUrl`/`receiptImageToken` 제거. `SettlementCards`/`settlement-card.computeMatrix` 가 두 type 을 구조적 subtyping 으로 같이 받으므로 의도적으로 그 필드를 안 본다.
- **`split.count` 가 1 또는 metadata 비면 cropForSplit no-op** — 잘못 count=1 로 보내도 안전, 원본 LLM 전달.
- **카카오톡 '복사' 는 클립보드 PNG 일 뿐** — 카카오 SDK 미연동이라 톡을 직접 열지 않고 붙여넣기 안내만. Safari 제스처 만료 회피를 위해 `ClipboardItem` 에 `Promise<Blob>` 를 그대로 넘겨 클립보드 쓰기 '안'에서 fetch 가 받아오게 한다.
- **AASA/assetlinks 미설정 시 404** — 빈 JSON 200 이면 iOS/Android 검증이 통과해 잘못된 권한을 얻으므로 의도적 404.

## Sources [coverage: high — 146 sources]

**Backend — settlement-extraction 모듈**
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.ts) (2026-08-22 — `buildLlmProviderEnv()`; 2026-10-05 — 레이트리밋 프리셋·일일 한도 주입·`receipts-retention` cron)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.ts) (2026-08-22 — `think: thinkOptionForModel(model)`; 2026-10-05 — `loadSharp`·HEIC 해상도 선검사·`busy`/`quota`·`cleanupUnreferencedReceipts`)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.test.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.route.test.ts) (NEW 2026-10-05 — 분당 20 프리셋, 초대형 HEIC 400)
- [apps/friendly/src/modules/settlement-extraction/receipt-heic.ts](../../apps/friendly/src/modules/settlement-extraction/receipt-heic.ts) (NEW 2026-10-05 — 공용 HEIC 워커 어댑터)
- [apps/friendly/src/modules/settlement-extraction/receipt-heic.test.ts](../../apps/friendly/src/modules/settlement-extraction/receipt-heic.test.ts) (NEW 2026-10-05 — ispe 파싱·게이트 동시 1+대기 8·실패 뒤 다음 작업)
- [apps/friendly/src/lib/heic-worker.ts](../../apps/friendly/src/lib/heic-worker.ts) (식단과 공용 HEIC worker·게이트 — 소유 [friendly](friendly.md))
- [apps/friendly/src/modules/meal/meal-daily-quota.service.ts](../../apps/friendly/src/modules/meal/meal-daily-quota.service.ts) (추출 일일 한도 카운터 — 식단 모듈 것을 재사용)
- [apps/friendly/.env.example](../../apps/friendly/.env.example) (`SETTLEMENT_EXTRACT_DAILY_LIMIT=50`)
- [apps/friendly/src/modules/ai/llm-provider-env.ts](../../apps/friendly/src/modules/ai/llm-provider-env.ts) (`.env → LlmProviderEnv` 단일 조립점)
- [packages/utils/src/aiModel.ts](../../packages/utils/src/aiModel.ts) (`thinkOptionForModel`)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.prompts.ts)
- [apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.test.ts](../../apps/friendly/src/modules/settlement-extraction/settlement-extraction.service.test.ts)

**Backend — settlement 모듈**
- [apps/friendly/src/modules/settlement/settlement.route.ts](../../apps/friendly/src/modules/settlement/settlement.route.ts)
- [apps/friendly/src/modules/settlement/settlement.service.ts](../../apps/friendly/src/modules/settlement/settlement.service.ts)
- [apps/friendly/src/modules/settlement/share-preview.ts](../../apps/friendly/src/modules/settlement/share-preview.ts) (2026-10-05 — `SharePngCache` 6MB·30분, 가벼운 head 조회, 503, 이미지 라우트 레이트리밋, 31명+ og:image 기본 이미지)
- [apps/friendly/src/modules/settlement/share-preview.test.ts](../../apps/friendly/src/modules/settlement/share-preview.test.ts) (2026-10-05 — og:image 30명 경계·히트는 풀 로우 안 읽음·만료 404)
- [apps/friendly/src/modules/settlement/settlement-card.ts](../../apps/friendly/src/modules/settlement/settlement-card.ts) (2026-09 — `SETTLEMENT_CATEGORY_LABEL` + 하단 기타 설명; 2026-10-05 — 앞 30명+'외 n명'·compact·4MP·공용 렌더/폰트)
- [apps/friendly/src/modules/settlement/settlement-card.test.ts](../../apps/friendly/src/modules/settlement/settlement-card.test.ts) (NEW 2026-10-05 — 카드 상한 6건, 계약 최대 100명×10차×200항목)
- [apps/friendly/src/lib/share-render.ts](../../apps/friendly/src/lib/share-render.ts) (공용 satori·resvg 렌더·슬롯·PNG 캐시 — 소유 [friendly](friendly.md))
- [apps/friendly/src/lib/share-fonts.ts](../../apps/friendly/src/lib/share-fonts.ts) (`loadPlexFonts`·`loadPlexOnlyFonts` — 소유 [friendly](friendly.md))
- [apps/friendly/src/modules/settlement/settlement.labels.test.ts](../../apps/friendly/src/modules/settlement/settlement.labels.test.ts) (NEW 2026-09 — `uncategorizedNote` 4건)
- [apps/friendly/src/modules/settlement/settlement.calculator.test.ts](../../apps/friendly/src/modules/settlement/settlement.calculator.test.ts)
- [apps/friendly/src/modules/settlement/settlement.route.test.ts](../../apps/friendly/src/modules/settlement/settlement.route.test.ts)
- [apps/friendly/src/modules/settlement/settlement-draft.route.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.ts) (2026-10-05 — `by-place` 단건, PUT 응답 `{ id, updatedAt }`)
- [apps/friendly/src/modules/settlement/settlement-draft.service.ts](../../apps/friendly/src/modules/settlement/settlement-draft.service.ts) (2026-10-05 — 메타 목록·`octet_length`·합계 2MB `too_large`)
- [apps/friendly/src/modules/settlement/settlement-draft.route.test.ts](../../apps/friendly/src/modules/settlement/settlement-draft.route.test.ts) (2026-10-05 — UTF-8 바이트 400·메타 목록·합계 409)

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
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) (`RATE.publicShare` — 공개 조회 + 2026-10-05 카드 PNG)
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
- [apps/friendly/prisma/migrations/20260610011757_add_settlement_group_splits/migration.sql](../../apps/friendly/prisma/migrations/20260610011757_add_settlement_group_splits/migration.sql)

**API Contract**
- [packages/api-contract/src/schemas/settlement.ts](../../packages/api-contract/src/schemas/settlement.ts)
- [packages/api-contract/src/schemas/settlement-extraction.ts](../../packages/api-contract/src/schemas/settlement-extraction.ts)
- [packages/api-contract/src/schemas/settlement-contact.ts](../../packages/api-contract/src/schemas/settlement-contact.ts)
- [packages/api-contract/src/schemas/settlement-draft.ts](../../packages/api-contract/src/schemas/settlement-draft.ts) (2026-10-05 — `SettlementDraftMeta`·`GetSettlementDraft*`·`UpsertSettlementDraftResult`·`utf8ByteLength`·바이트 상한 상수)
- [packages/api-contract/src/settlement.calculator.ts](../../packages/api-contract/src/settlement.calculator.ts)
- [packages/api-contract/src/settlement.drink-kinds.ts](../../packages/api-contract/src/settlement.drink-kinds.ts)
- [packages/api-contract/src/settlement.labels.ts](../../packages/api-contract/src/settlement.labels.ts) (NEW 2026-09 — 분류 이름 단일 소스 + `uncategorizedNote`)
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)
- [packages/api-contract/src/index.ts](../../packages/api-contract/src/index.ts)

**FE shared**
- [packages/shared/src/settlement/groupSuggestion.ts](../../packages/shared/src/settlement/groupSuggestion.ts)
- [packages/shared/src/settlement/participation.ts](../../packages/shared/src/settlement/participation.ts) (NEW 2026-09 — 참여 축·배지 차수 판정)
- [packages/shared/src/settlement/participation.test.ts](../../packages/shared/src/settlement/participation.test.ts) (NEW 2026-09)
- [packages/shared/src/api/settlement.api.ts](../../packages/shared/src/api/settlement.api.ts)
- [packages/shared/src/api/settlement-extraction.api.ts](../../packages/shared/src/api/settlement-extraction.api.ts)
- [packages/shared/src/api/settlement-contact.api.ts](../../packages/shared/src/api/settlement-contact.api.ts)
- [packages/shared/src/api/settlement-draft.api.ts](../../packages/shared/src/api/settlement-draft.api.ts) (2026-10-05 — `getByPlace`, `Routes.SettlementDraft`)
- [packages/shared/src/hooks/useSettlement.ts](../../packages/shared/src/hooks/useSettlement.ts) (2026-10-05 — 저장 응답 상세 캐시 심기·`keepPrevious`·`useDeleteSettlements`)
- [packages/shared/src/hooks/useSettlementExtraction.ts](../../packages/shared/src/hooks/useSettlementExtraction.ts)
- [packages/shared/src/hooks/useSettlementContact.ts](../../packages/shared/src/hooks/useSettlementContact.ts) (2026-10-05 — `enabled`·`keepPrevious`)
- [packages/shared/src/hooks/useSettlementDraft.ts](../../packages/shared/src/hooks/useSettlementDraft.ts) (2026-10-05 — `useSettlementDraftByPlace`·`applySavedDraft`·hydrate `enabled`·타이머 직렬화)
- [packages/shared/src/hooks/useSettlementDraft.test.ts](../../packages/shared/src/hooks/useSettlementDraft.test.ts) (NEW 2026-10-05 — `by-place` URL·`utf8ByteLength`·`applySavedDraft`)
- [packages/shared/src/stores/settlementDraftStore.ts](../../packages/shared/src/stores/settlementDraftStore.ts)
- [packages/shared/src/index.ts](../../packages/shared/src/index.ts)

**Web — 정산 라우트 디렉터리 (`apps/web/src/routes/settlement/`)**
- [SettlementNewPage.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.tsx) (2026-10-05 — 수정 모드 hydrate `enabled:false`·상세 미조회)
- [SettlementNewPage.test.tsx](../../apps/web/src/routes/settlement/SettlementNewPage.test.tsx) (NEW 2026-10-05 — 수정 모드 덮어쓰기 회귀·헛조회 5건)
- [Step1Participants.tsx](../../apps/web/src/routes/settlement/Step1Participants.tsx)
- [Step2Rounds.tsx](../../apps/web/src/routes/settlement/Step2Rounds.tsx) (2026-10-05 — `prepareReceiptImage`·파일 입력 상시 마운트)
- [Step2Rounds.test.tsx](../../apps/web/src/routes/settlement/Step2Rounds.test.tsx) (NEW 2026-10-05)
- [Step3Edit.tsx](../../apps/web/src/routes/settlement/Step3Edit.tsx)
- [Step3Edit.test.tsx](../../apps/web/src/routes/settlement/Step3Edit.test.tsx) (NEW 2026-10-05 — 메뉴 모달 연 뒤에만 상세 조회)
- [Step4Review.tsx](../../apps/web/src/routes/settlement/Step4Review.tsx)
- [Step4Review.test.tsx](../../apps/web/src/routes/settlement/Step4Review.test.tsx) (NEW 2026-10-05)
- [prepareReceiptImage.ts](../../apps/web/src/routes/settlement/prepareReceiptImage.ts) (NEW 2026-10-05 — 업로드 전 장변 2000px JPEG 축소)
- [prepareReceiptImage.test.ts](../../apps/web/src/routes/settlement/prepareReceiptImage.test.ts) (NEW 2026-10-05 — 8건)
- [settlementHooks.test.tsx](../../apps/web/src/routes/settlement/settlementHooks.test.tsx) (NEW 2026-10-05 — shared 정산 훅 7건)
- [testFixtures.ts](../../apps/web/src/routes/settlement/testFixtures.ts) (NEW 2026-10-05 — 정산 웹 테스트 공용 픽스처)
- [SettlementResultPage.tsx](../../apps/web/src/routes/settlement/SettlementResultPage.tsx)
- [SettlementHistoryPage.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.tsx) (2026-10-05 — 메타 타입·`keepPrevious`·일괄 삭제 1회)
- [SettlementHistoryPage.test.tsx](../../apps/web/src/routes/settlement/SettlementHistoryPage.test.tsx) (NEW 2026-10-05)
- [SharedSettlementPage.tsx](../../apps/web/src/routes/settlement/SharedSettlementPage.tsx)
- [SettlementShareDialog.tsx](../../apps/web/src/routes/settlement/SettlementShareDialog.tsx)
- [useReceiptPreviewUrl.ts](../../apps/web/src/routes/settlement/useReceiptPreviewUrl.ts)
- [ContactsPage.tsx](../../apps/web/src/routes/settlement/ContactsPage.tsx)
- [ContactsPage.test.tsx](../../apps/web/src/routes/settlement/ContactsPage.test.tsx) (NEW 2026-10-05 — 디바운스·직전 결과 유지)
- [ContactPickerDialog.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.tsx)
- [ContactPickerDialog.test.tsx](../../apps/web/src/routes/settlement/ContactPickerDialog.test.tsx) (NEW 2026-10-05 — 검색어를 바꿔도 앞서 고른 사람 추가)
- [ContactSuggestions.tsx](../../apps/web/src/routes/settlement/ContactSuggestions.tsx)
- [ContactEditDialog.tsx](../../apps/web/src/routes/settlement/ContactEditDialog.tsx)
- [MenuPickerDialog.tsx](../../apps/web/src/routes/settlement/MenuPickerDialog.tsx)
- [MultiReceiptSplitDialog.tsx](../../apps/web/src/routes/settlement/MultiReceiptSplitDialog.tsx)
- [RestaurantSearchDialog.tsx](../../apps/web/src/routes/settlement/RestaurantSearchDialog.tsx)
- [RoundCategoryAdjuster.tsx](../../apps/web/src/routes/settlement/RoundCategoryAdjuster.tsx)
- [RoundDiscountEditor.tsx](../../apps/web/src/routes/settlement/RoundDiscountEditor.tsx)
- [RoundExceptionsEditor.tsx](../../apps/web/src/routes/settlement/RoundExceptionsEditor.tsx)
- [RoundGroupSplitEditor.tsx](../../apps/web/src/routes/settlement/RoundGroupSplitEditor.tsx)
- [SettlementBreakdownTable.tsx](../../apps/web/src/routes/settlement/SettlementBreakdownTable.tsx)
- [SettlementCards.tsx](../../apps/web/src/routes/settlement/SettlementCards.tsx)
- [ParticipationChips.tsx](../../apps/web/src/routes/settlement/ParticipationChips.tsx) (NEW 2026-09 — 토글 칩 + 참여 배지)
- [ParticipationChips.test.tsx](../../apps/web/src/routes/settlement/ParticipationChips.test.tsx) (NEW 2026-09 — 칩 극성)
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
- [apps/mobile/app/settlement/history.tsx](../../apps/mobile/app/settlement/history.tsx) (2026-10-05 — 임시저장 행 `SettlementDraftMetaType`)
- [apps/mobile/app/settlement/contacts.tsx](../../apps/mobile/app/settlement/contacts.tsx)
- [apps/mobile/app/s/[token].tsx](../../apps/mobile/app/s/[token].tsx) (옛 `share/settlements/[token].tsx` — 2026-05-30 `/s/` 로 이동)
- [apps/mobile/src/components/settlement/SettlementWizard.tsx](../../apps/mobile/src/components/settlement/SettlementWizard.tsx) (2026-10-05 — 수정 모드 hydrate `enabled:false`)
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
- [apps/mobile/src/components/settlement/RoundGroupSplitEditor.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitEditor.tsx)
- [apps/mobile/src/components/settlement/RoundGroupSplitNote.tsx](../../apps/mobile/src/components/settlement/RoundGroupSplitNote.tsx)
- [apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx](../../apps/mobile/src/components/settlement/SettlementBreakdownTable.tsx)
- [apps/mobile/src/components/settlement/SettlementShareSheet.tsx](../../apps/mobile/src/components/settlement/SettlementShareSheet.tsx)
- [apps/mobile/src/components/settlement/ParticipationChips.tsx](../../apps/mobile/src/components/settlement/ParticipationChips.tsx) (NEW 2026-09 — 앱 토글 칩)
- [apps/mobile/src/hooks/useReceiptPreviewUrl.ts](../../apps/mobile/src/hooks/useReceiptPreviewUrl.ts)
- [apps/mobile/src/lib/settlementPrefsStore.ts](../../apps/mobile/src/lib/settlementPrefsStore.ts)
- [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts)
- [apps/mobile/DEEP_LINK_SETUP.md](../../apps/mobile/DEEP_LINK_SETUP.md)

**문서**
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — 성능 감사 2차 계획·진행 로그(2차 G-V1·3차 F-V2·7차 G-3, 모듈 묶음 ops/share·통합 정리·배포 체크리스트·남은 것)
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — 발견 원문 G-V1·G-3·F-V2(측정·반박 시도·수정안)
- [docs/api/README.md](../../docs/api/README.md) — 정산·정산 임시저장 절(추출 한도·30일 정리·메타 목록·`by-place`)
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — 업로드 파일 표(영수증 "자동 정리 없음" 은 2026-10-05 이후 낡음)
