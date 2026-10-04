---
concept: 앱 WebView 임베드 + 브리지 — 3D 기능은 이식하지 않고 웹을 품는다
last_compiled: 2026-10-04
topics_connected: [mobile, web, shared, tarot, saju-c]
status: superseded
---

# 앱 WebView 임베드 + 브리지 — 3D 기능은 이식하지 않고 웹을 품는다

> **2026-09-26 이후 상태: 대체됨(superseded).** 사주(C)(`04f009e`)와 타로(`9d565b3`)가 앱 네이티브 화면으로 바뀌어, 이 패턴으로 페이지 전체를 띄우는 앱 화면은 이제 **없다**(`apps/mobile` 에서 `embedBridge`·`?embed=1` 사용처 0건, 2026-10-04 확인). 패턴이 약 3주 살다가 어떻게 끝났는지가 이 글의 새 교훈이다 — 아래 "끝난 방식" 절. 지도 조각 WebView([map-sheet-shell](map-sheet-shell.md))는 그대로 남아 있다.

## Pattern

타로(`624ead4`, 2026-09-06)와 사주(C)(`0a7f637`, 같은 날)는 R3F/three 3D 무대·포스트프로세싱·satori 공유 시트까지 웹에 먼저 완성됐다. 같은 기능을 앱(Expo)에 다시 만드는 대신 **앱 화면이 웹 페이지를 `WebView` 로 열고, 필요한 상태만 브리지로 주고받는** 구조가 두 번 연속 채택되면서 표준이 됐다. 규약은 세 층이다.

1. **웹 임베드 모드** — `?embed=1` 로 열리면 `apps/web/src/lib/embed.ts` 가 그 사실을 sessionStorage `lp:embed` 에 기억해(라우트 이동 후에도 유지) 상단바·사이드바를 숨기고 뷰포트 높이를 `100dvh` 기준으로 잡는다(`SajuPage` 의 `headerHeight` 0). 딥링크 파라미터(`?tool=daily`, `?lite=1`, `?3d=1`)는 임베드에서도 그대로 산다.
2. **브리지 프로토콜** — `packages/shared/src/embedBridge.ts` 가 규약을 정의한다: 앱→웹은 페이지 로드 전 `window.__LP_EMBED__ = { token, guestKey, theme }` 주입(토큰을 URL 에 싣지 않는다; `main.tsx` 는 주입 토큰을 localStorage 토큰보다 우선하고, 주입이 없으면 저장 토큰을 지운다), 웹→앱은 `postMessage` 로 `share`(url·title → 네이티브 공유 시트)·`open`(외부 링크)·`title`(헤더 제목). 웹은 `postLpEmbedMessage` 가 `true` 를 돌려주면 브라우저 `navigator.share` 대신 앱 공유를 쓴다. 테스트는 `embedBridge.test.ts`.
3. **앱 화면** — `apps/mobile/app/tarot/index.tsx`·`app/saju-c/index.tsx` 가 같은 골격을 복제한다: `webUrl` origin + 경로 + `embed=1`, `onMessage` 로 공유/제목 처리, **같은 origin 안의 이동(공유 페이지·내 기록)은 WebView 안에서, 밖은 외부 브라우저로**, `Stack.Screen` 제목은 웹이 보낸 `title` 로 바꿀 수 있게 파서까지 있으나 **웹이 아직 `title` 을 보내는 곳이 없어** 항상 기본 제목(2026-09-07 기준). Android 는 `androidLayerType="hardware"`(WebGL)·뒤로가기는 WebView 히스토리 우선, 주입값은 첫 마운트에 고정. 홈 허브의 `TarotEntryCard`·`SajuEntryCard` 가 진입점이고 `?tool=` 로 특정 탭 직행.

인증·게스트 정체성은 [principal-scoped-client-state](principal-scoped-client-state.md) 의 앱 저장소를 그대로 주입한다(`api-setup.ts` 가 `setGuestKeyStorage`·`setTarotHistoryStorage`·`setSajuProfileStorage` 로 AsyncStorage 주입 — persist 팩토리가 1회만 호출되는 함정 때문에 주입 순서가 부트스트랩에 고정돼 있다). `webUrl` 은 `EXPO_PUBLIC_WEB_URL` > `apiUrl` 의 `:3000→:5173` 치환 — 앱이 **웹 SPA 배포와 nginx SPA 폴백에 의존**하게 된 첫 지점이다.

## Instances

- **2026-09-26** in [tarot](../topics/tarot.md) / [mobile](../topics/mobile.md) (`9d565b3`): 타로도 네이티브 2D 무대(`TarotStage2D`, Reanimated)로. 흐름·요청은 shared `useTarotSession`(`1104574`), 무대·해석 시트만 RN. WebView 시절 웹 localStorage 의 게스트 타로 기록은 앱으로 넘어오지 않는다(커밋 본문에 명시) — 앱 `api-setup.ts` 가 AsyncStorage 저장소를 새로 주입. 공유는 여전히 **웹 링크**를 OS 공유 시트로(받는 사람 대부분은 앱이 없고 웹 공유 페이지가 OG 미리보기를 한다). 이어 iOS 3D(`6199215`) — [webgl-stage-lite-fallback](webgl-stage-lite-fallback.md).
- **2026-09-26** in [saju-c](../topics/saju-c.md) / [mobile](../topics/mobile.md) (`04f009e`): 사주(C) 앱이 WebView → 네이티브 2D 천문도. 같은 커밋이 바로 전날 만든 브리지 계약 `saju-profiles`·shared `sajuProfileMirror`·웹 `main.tsx` 시작 호출을 **삭제**했다 — 게스트 프로필은 앱 폼이 앱 스토어에 바로 쓴다.
- **2026-09-25** in [saju-c](../topics/saju-c.md) / [shared](../topics/shared.md) (`5ce90fe`): 앱 홈 "오늘의 운세" 카드를 기기에서 계산하려고 브리지에 네 번째 메시지 `saju-profiles`(웹 게스트 프로필 스토어 → 앱 전체 교체, 하나라도 `SajuBirthInput` 검증 실패면 메시지 통째로 버림)를 더했다. **브리지가 상태 동기화까지 떠맡기 시작한 시점** — 다음 날 네이티브 전환과 함께 사라졌다.
- **2026-09-06** in [saju-c](../topics/saju-c.md) / [mobile](../topics/mobile.md) (`0a7f637`, 경로 변경 `5f49026`): 타로 화면을 복제해 `app/saju-c/index.tsx`. 홈 `SajuEntryCard` 두 버튼(사주 세우기 / 오늘의 운세 `?tool=daily`). 게스트 프로필 스토어를 AsyncStorage 로 주입.
- **2026-09-06** in [tarot](../topics/tarot.md) / [mobile](../topics/mobile.md) / [web](../topics/web.md) / [shared](../topics/shared.md) (`624ead4`, PLAN 기록은 09-05 완료·미커밋): 원형. 웹 `?embed=1` + `embed.ts`, shared `embedBridge`(+테스트), 앱 `app/tarot/index.tsx`·`TarotEntryCard`. 토큰·게스트 키를 `__LP_EMBED__` 로 주입해 회원 기록·한도가 웹과 같은 정체성으로 이어진다.
- **선례(2026-05~08)** in [map](../topics/map.md) / [transit](../topics/transit.md): 지도는 이미 앱에서 WebView(vworld) 로 띄우고 브리지로 마커·뷰포트를 주고받았다([map-sheet-shell](map-sheet-shell.md)). 이번엔 지도 한 조각이 아니라 **페이지 전체**를 임베드한 것이 차이.

## What This Means

"앱은 네이티브로 다시 만든다"는 [platform-ui-split](platform-ui-split.md) 의 기본값에 예외 규칙이 생겼다 — **WebGL·셰이더·서버 렌더 이미지처럼 RN 으로 옮기는 비용이 큰 기능은 웹 한 벌만 유지하고 앱은 껍데기**가 된다. 얻는 것은 출시 속도(타로→사주(C) 이식이 하루)와 한 곳만 고치면 되는 유지비, 잃는 것은 앱다운 제스처·오프라인·성능(WebView 안 3D 는 기기 편차가 크고 `prefers-reduced-motion` 이면 Lite 로 떨어진다 — [webgl-stage-lite-fallback](webgl-stage-lite-fallback.md)). 실기기 확인이 아직 남아 있다는 점(두 토픽 모두 "실기기 미확인")이 이 패턴의 현재 빚이다. 새 기능이 "3D 무대·공유 이미지" 계열이면 이 골격을 복제하고, 목록·폼 계열이면 기존 네이티브 화면 규칙을 따른다.

### 끝난 방식 (2026-09-25~26)

임베드는 "출시 속도용 임시 다리"였고, 다리를 걷어 낸 신호는 두 가지였다. (1) **브리지가 단방향 명령(share·open·title)에서 상태 미러로 자랐다** — 앱 홈 카드가 웹 안의 게스트 프로필을 알아야 하자 `saju-profiles` 를 추가했는데, 이는 두 저장소(웹 localStorage·앱 AsyncStorage)의 진실 공급원을 하나로 정해야 하는 문제를 브리지로 덮은 것이었다. (2) 키보드·스크롤·전환이 "웹 그대로"인 체감 품질. 네이티브 전환은 **이식 비용을 줄이는 선행 리팩터**로 가능해졌다 — 흐름 리듀서·LLM 요청·잡 폴링을 shared 세션 훅(`useSajuSession` `7669111`, `useTarotSession` `1104574`)으로 먼저 옮겨 웹이 그 훅을 쓰게 바꾼 뒤, 앱은 무대와 패널만 새로 그렸다([platform-ui-split](platform-ui-split.md)). 전환 커밋(`04f009e`·`9d565b3`) 자체는 서버 API·계약을 바꾸지 않았다(3D 앞면 텍스처 라우트 `bfce1f8` 는 그 뒤 3D 를 위해 따로 붙었다). 3D 도 "이식 불가" 전제가 깨졌다 — expo-gl + R3F 로 iOS 에서 같은 장면을 그리고, 못 그리는 기기는 2D 로 떨어진다([webgl-stage-lite-fallback](webgl-stage-lite-fallback.md)).

남은 빚: 웹의 임베드 경로(`apps/web/src/lib/embed.ts`, `SajuShareSheet`·`TarotShareSheet`·공유 페이지의 `postLpEmbedMessage` 분기)와 shared `embedBridge.ts`(+테스트)는 **여는 앱 화면이 없는데도 남아 있다** — 지울지, 다음 임베드 후보를 위해 둘지는 결정되지 않았다. 교훈으로 정리하면: 페이지 임베드는 첫 출시에 싸지만, 브리지 메시지가 "명령"이 아닌 "상태"를 실어 나르기 시작하면 네이티브 전환 시점이다.

## Sources

- [../topics/mobile](../topics/mobile.md)
- [../topics/web](../topics/web.md)
- [../topics/shared](../topics/shared.md)
- [../topics/tarot](../topics/tarot.md)
- [../topics/saju-c](../topics/saju-c.md)
