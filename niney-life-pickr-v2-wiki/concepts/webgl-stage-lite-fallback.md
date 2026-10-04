---
concept: WebGL 3D 무대 + Lite 폴백 — 연출은 선택, 기능은 항상
last_compiled: 2026-10-04
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
- **앱(~2026-09-25)** in [mobile](../topics/mobile.md): WebView 안에서 같은 무대가 돈다 — 기기 편차가 커서 Lite 판정과 `?lite=1` 딥링크가 앱 쪽 안전장치([embedded-webview-bridge](embedded-webview-bridge.md)). → 2026-09-26 네이티브 전환으로 끝남(아래).
- **2026-09-26** in [saju-c](../topics/saju-c.md) / [tarot](../topics/tarot.md) / [mobile](../topics/mobile.md) (`173af9c`·`18bef4f`·`b27d7f6`·`6199215`·`0634e39`): **앱 네이티브 3D** — expo-gl + react-three-fiber 로 웹과 같은 장면을 iOS 에서 그린다. 같은 규약을 RN 에 옮기면서 판정이 "환경 추정"에서 **"실측"** 으로 바뀌었다:
  - 문 앞 조건 `STAGE_3D_AVAILABLE` = iOS **이고** expo-gl 네이티브 모듈(`ExponentGLObjectManager`)이 든 빌드 — 모듈 없는 옛 개발 클라이언트가 3D 를 불러오다 죽지 않게, Android 는 기기 검증 전까지 2D.
  - 공용 캔버스 `common/stage3d/Stage3DCanvas` 가 첫 프레임들을 잰다 — GL 렌더러 이름에 `software` 가 있으면(시뮬레이터) 즉시, 첫 5프레임 중 120ms 넘는 프레임이 3개면 확정 `slow`. 판정은 기기별 AsyncStorage `lp:<scope>-stage3d:v1`(scope `saju`·`tarot`)에 저장(앱 버전이 바뀌면 무효), `slow` 는 7일 뒤 만료되어 재시도.
  - 문지기 `useStage3DGate` 는 무대 자리를 `pending` 으로 비워 두고 처음 보는 기기는 0.9초, 3D 로 기억된 기기는 2.5초 기다린 뒤 2D 로 내린다(첫 진입에 2D 원판이 3D 로 "바뀌어 보이는" 깜빡임 방지, `18bef4f`). "동작 줄이기"·Android·느린 GPU·기록 다시 보기는 2D. 개발 빌드만 `?stage=3d|2d` 강제(판정을 읽지도 쓰지도 않음).
  - 2D 무대(`SajuStage2D`·`TarotStage2D`, Reanimated)는 **웹 3D 와 같은 타이밍**(섞기 1.9초 등)을 쓰고 흐름 전환은 화면 JS 타이머가 낸다 — 무대가 3D 든 2D 든 상태 기계는 shared 세션 훅 하나.
  - 성능 실측이 설계를 바꿨다: 쌓인 덱 78장을 아래부터 그리면 윗면을 78번 덧칠해 소프트웨어 GL 에서 19초/프레임 → 위 카드부터 그려 깊이 테스트로 버리게 해 0.5초(`6199215`). 셰이더 재컴파일 멈춤·자원 누적은 `0634e39`.

## What This Means

"화려함"을 요구하는 기능에서 화려함을 **옵션 레이어**로 격리한 결정이다. 덕분에 (1) 접근성 설정(reduced-motion)·저사양·WebGL 부재·런타임 크래시 네 경우가 모두 같은 Lite 로 수렴하고 (2) 테스트가 무대에 의존하지 않으며 (3) 두 번째 기능(사주)이 첫 기능의 품질 판정·타자 효과·공유 시트를 그대로 재사용했다(컴포넌트는 재사용하지 않고 패턴만 — PLAN 의 명시 결정). 대가는 "사용자가 3D 를 못 봤다"는 보고가 버그가 아니라 설정 때문일 수 있다는 점 — 지원 답변의 첫 질문은 `?3d=1` 이 된다.

앱 네이티브 3D(2026-09-26)는 이 결정이 플랫폼을 넘어 재사용될 수 있음을 보였다. 웹은 "환경으로 추정"(reduced-motion·WebGL2·pointer)했지만 앱은 시뮬레이터의 소프트웨어 GL 처럼 추정으로는 못 가리는 경우가 있어 **첫 프레임 실측 + 기기별 기억**으로 바꿨다 — 같은 원칙(연출은 선택, 기능은 항상)에 다른 판정기. 앱 판정은 기기에 남으므로 "이 기기는 2D 로 굳었다"는 상태가 생긴다(`slow` 7일 만료와 앱 버전 변경이 그 탈출구). 앱 쪽 "3D 를 못 봤다" 보고의 첫 질문은 Android 인지·동작 줄이기인지·7일 안에 느리다고 판정된 적 있는지다.

## Sources

- [../topics/tarot](../topics/tarot.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/web](../topics/web.md)
- [../topics/mobile](../topics/mobile.md)
- [../topics/shared](../topics/shared.md)
