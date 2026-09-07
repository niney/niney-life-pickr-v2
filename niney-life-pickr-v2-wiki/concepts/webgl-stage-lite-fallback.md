---
concept: WebGL 3D 무대 + Lite 폴백 — 연출은 선택, 기능은 항상
last_compiled: 2026-09-07
topics_connected: [tarot, saju-c, web, mobile, shared]
status: active
---

# WebGL 3D 무대 + Lite 폴백 — 연출은 선택, 기능은 항상

## Pattern

타로 부채꼴(2026-09-03)과 사주(C) 천문도(2026-09-06)는 React Three Fiber + drei + postprocessing 으로 만든 **3D 무대**를 갖지만, 무대는 lazy 청크이고 기능(입력→계산→풀이)은 무대 없이도 전부 돈다. 굳어진 규약:

- **품질 판정 한 곳** — `apps/web/src/components/tarot/tarotQuality.ts` 가 두 기능이 공용으로 쓴다. `?lite=1`·`prefers-reduced-motion: reduce`·WebGL2 없음 → **Lite**(2D, 연출 없음, 바로 결과), `pointer: coarse` → medium, 그 외 high. `?3d=1` 이 reduced-motion 을 무시하는 강제 스위치.
- **상태 기계는 순수 리듀서** — `packages/utils` 의 `tarotFlow`/`sajuFlow`(setup→casting→stamping→reading)가 연출 단계를 소유하고, 3D 씬은 `elapsed` 시간으로 그 단계를 그릴 뿐 상태를 바꾸지 않는다(콜백 `onCastingDone`/`onStamp` 만 올린다). Lite 는 `skip_animation` 액션으로 단계를 건너뛰고, HUD "건너뛰기"도 같은 액션.
- **에러 바운더리 → Lite** — 3D 가 런타임에 죽으면(드라이버·셰이더·훅 순서 버그) 흰 화면 대신 `StageErrorBoundary` 가 Lite 로 전환하고 풀이 패널은 그대로 산다.
- **검증** — 테스트는 Lite 모드로 렌더(jsdom 에 WebGL 없음), 3D 는 Playwright headless 크롬 + SwiftShader(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`)로 실측. 실제 GPU 확인은 원격 크롬 확장으로.

## Instances

- **2026-09-06~07** in [saju-c](../topics/saju-c.md) (`0a7f637`, 5~7차): 원판·고리 다이얼·인장 낙하·일간/띠 카드·오행 구슬. 실측에서 `Seal` 의 `return null` 이 `useMemo` 앞에 있어 훅 순서 오류로 무대 전체가 흰 화면 → 훅 순서 수정 + 에러 바운더리 추가. 7차에 효과음(WebAudio 합성, 기본 꺼짐)도 무대 콜백에 얹음. 원격 실브라우저는 OS reduced-motion 이라 기본 Lite 로 떴다.
- **2026-09-03~05** in [tarot](../topics/tarot.md) / [web](../topics/web.md) (`6a414ef`, `7de9033`, `2eee38c`): 원형. 부채꼴 호버를 "정지 포즈 투영" 기준으로 계산해 팝콘 떨림 제거, 겹침 순서를 엄격 단조로 고정. Lite 폴백·임베드 모드가 같은 커밋에 있다.
- **앱** in [mobile](../topics/mobile.md): WebView 안에서 같은 무대가 돈다 — 기기 편차가 커서 Lite 판정과 `?lite=1` 딥링크가 앱 쪽 안전장치([embedded-webview-bridge](embedded-webview-bridge.md)).

## What This Means

"화려함"을 요구하는 기능에서 화려함을 **옵션 레이어**로 격리한 결정이다. 덕분에 (1) 접근성 설정(reduced-motion)·저사양·WebGL 부재·런타임 크래시 네 경우가 모두 같은 Lite 로 수렴하고 (2) 테스트가 무대에 의존하지 않으며 (3) 두 번째 기능(사주)이 첫 기능의 품질 판정·타자 효과·공유 시트를 그대로 재사용했다(컴포넌트는 재사용하지 않고 패턴만 — PLAN 의 명시 결정). 대가는 "사용자가 3D 를 못 봤다"는 보고가 버그가 아니라 설정 때문일 수 있다는 점 — 지원 답변의 첫 질문은 `?3d=1` 이 된다.

## Sources

- [../topics/tarot](../topics/tarot.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/web](../topics/web.md)
- [../topics/mobile](../topics/mobile.md)
- [../topics/shared](../topics/shared.md)
