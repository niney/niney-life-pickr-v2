---
concept: 앱 WebView 임베드 + 브리지 — 3D 기능은 이식하지 않고 웹을 품는다
last_compiled: 2026-09-07
topics_connected: [mobile, web, shared, tarot, saju-c]
status: active
---

# 앱 WebView 임베드 + 브리지 — 3D 기능은 이식하지 않고 웹을 품는다

## Pattern

타로(`624ead4`, 2026-09-06)와 사주(C)(`0a7f637`, 같은 날)는 R3F/three 3D 무대·포스트프로세싱·satori 공유 시트까지 웹에 먼저 완성됐다. 같은 기능을 앱(Expo)에 다시 만드는 대신 **앱 화면이 웹 페이지를 `WebView` 로 열고, 필요한 상태만 브리지로 주고받는** 구조가 두 번 연속 채택되면서 표준이 됐다. 규약은 세 층이다.

1. **웹 임베드 모드** — `?embed=1` 로 열리면 `apps/web/src/lib/embed.ts` 가 그 사실을 sessionStorage `lp:embed` 에 기억해(라우트 이동 후에도 유지) 상단바·사이드바를 숨기고 뷰포트 높이를 `100dvh` 기준으로 잡는다(`SajuPage` 의 `headerHeight` 0). 딥링크 파라미터(`?tool=daily`, `?lite=1`, `?3d=1`)는 임베드에서도 그대로 산다.
2. **브리지 프로토콜** — `packages/shared/src/embedBridge.ts` 가 규약을 정의한다: 앱→웹은 페이지 로드 전 `window.__LP_EMBED__ = { token, guestKey, theme }` 주입(토큰을 URL 에 싣지 않는다; `main.tsx` 는 주입 토큰을 localStorage 토큰보다 우선하고, 주입이 없으면 저장 토큰을 지운다), 웹→앱은 `postMessage` 로 `share`(url·title → 네이티브 공유 시트)·`open`(외부 링크)·`title`(헤더 제목). 웹은 `postLpEmbedMessage` 가 `true` 를 돌려주면 브라우저 `navigator.share` 대신 앱 공유를 쓴다. 테스트는 `embedBridge.test.ts`.
3. **앱 화면** — `apps/mobile/app/tarot/index.tsx`·`app/saju-c/index.tsx` 가 같은 골격을 복제한다: `webUrl` origin + 경로 + `embed=1`, `onMessage` 로 공유/제목 처리, **같은 origin 안의 이동(공유 페이지·내 기록)은 WebView 안에서, 밖은 외부 브라우저로**, `Stack.Screen` 제목은 웹이 보낸 `title` 로 바꿀 수 있게 파서까지 있으나 **웹이 아직 `title` 을 보내는 곳이 없어** 항상 기본 제목(2026-09-07 기준). Android 는 `androidLayerType="hardware"`(WebGL)·뒤로가기는 WebView 히스토리 우선, 주입값은 첫 마운트에 고정. 홈 허브의 `TarotEntryCard`·`SajuEntryCard` 가 진입점이고 `?tool=` 로 특정 탭 직행.

인증·게스트 정체성은 [principal-scoped-client-state](principal-scoped-client-state.md) 의 앱 저장소를 그대로 주입한다(`api-setup.ts` 가 `setGuestKeyStorage`·`setTarotHistoryStorage`·`setSajuProfileStorage` 로 AsyncStorage 주입 — persist 팩토리가 1회만 호출되는 함정 때문에 주입 순서가 부트스트랩에 고정돼 있다). `webUrl` 은 `EXPO_PUBLIC_WEB_URL` > `apiUrl` 의 `:3000→:5173` 치환 — 앱이 **웹 SPA 배포와 nginx SPA 폴백에 의존**하게 된 첫 지점이다.

## Instances

- **2026-09-06** in [saju-c](../topics/saju-c.md) / [mobile](../topics/mobile.md) (`0a7f637`, 경로 변경 `5f49026`): 타로 화면을 복제해 `app/saju-c/index.tsx`. 홈 `SajuEntryCard` 두 버튼(사주 세우기 / 오늘의 운세 `?tool=daily`). 게스트 프로필 스토어를 AsyncStorage 로 주입.
- **2026-09-06** in [tarot](../topics/tarot.md) / [mobile](../topics/mobile.md) / [web](../topics/web.md) / [shared](../topics/shared.md) (`624ead4`, PLAN 기록은 09-05 완료·미커밋): 원형. 웹 `?embed=1` + `embed.ts`, shared `embedBridge`(+테스트), 앱 `app/tarot/index.tsx`·`TarotEntryCard`. 토큰·게스트 키를 `__LP_EMBED__` 로 주입해 회원 기록·한도가 웹과 같은 정체성으로 이어진다.
- **선례(2026-05~08)** in [map](../topics/map.md) / [transit](../topics/transit.md): 지도는 이미 앱에서 WebView(vworld) 로 띄우고 브리지로 마커·뷰포트를 주고받았다([map-sheet-shell](map-sheet-shell.md)). 이번엔 지도 한 조각이 아니라 **페이지 전체**를 임베드한 것이 차이.

## What This Means

"앱은 네이티브로 다시 만든다"는 [platform-ui-split](platform-ui-split.md) 의 기본값에 예외 규칙이 생겼다 — **WebGL·셰이더·서버 렌더 이미지처럼 RN 으로 옮기는 비용이 큰 기능은 웹 한 벌만 유지하고 앱은 껍데기**가 된다. 얻는 것은 출시 속도(타로→사주(C) 이식이 하루)와 한 곳만 고치면 되는 유지비, 잃는 것은 앱다운 제스처·오프라인·성능(WebView 안 3D 는 기기 편차가 크고 `prefers-reduced-motion` 이면 Lite 로 떨어진다 — [webgl-stage-lite-fallback](webgl-stage-lite-fallback.md)). 실기기 확인이 아직 남아 있다는 점(두 토픽 모두 "실기기 미확인")이 이 패턴의 현재 빚이다. 새 기능이 "3D 무대·공유 이미지" 계열이면 이 골격을 복제하고, 목록·폼 계열이면 기존 네이티브 화면 규칙을 따른다.

## Sources

- [../topics/mobile](../topics/mobile.md)
- [../topics/web](../topics/web.md)
- [../topics/shared](../topics/shared.md)
- [../topics/tarot](../topics/tarot.md)
- [../topics/saju-c](../topics/saju-c.md)
