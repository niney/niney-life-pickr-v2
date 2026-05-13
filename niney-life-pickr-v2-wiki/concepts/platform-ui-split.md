---
concept: 로직 공유 / UI 플랫폼 분기
last_compiled: 2026-05-07
topics_connected: [shared, web, mobile, project-overview]
status: active
---

# 로직 공유 / UI 플랫폼 분기

## Pattern

이 모노레포는 web과 mobile에서 **로직(API 클라이언트, React Query 훅, Zustand 스토어, 디자인 토큰)은 공유**하지만 **UI 렌더링은 플랫폼별로 분기**시킨다. `@repo/shared/ui/<Component>/` 디렉터리마다 4개 파일 — `Component.types.ts` (공통 props), `Component.tsx` (재export 셔틀), `Component.web.tsx` (DOM 구현), `Component.native.tsx` (RN 구현) — 가 한 묶음. Vite는 `.web.tsx`를, Metro는 `.native.tsx`를 번들러가 자동 선택한다. Tamagui나 react-native-web 같은 통합 솔루션은 의도적으로 거부했다 (TECH_STACK.md "의도적으로 제외" 표).

## Instances

- **2026-05-07** in [[../topics/shared]]: 8개 UI 프리미티브(Button, Divider, ErrorBanner, Input, Screen, SegmentedControl, Stack, Text) 모두 동일한 4-file quad 패턴. 디자인 토큰(`design/tokens.ts`)은 공통, 적용은 각 플랫폼 파일에서 다르게 (web → CSS 변수, native → StyleSheet).
- **2026-05-07** in [[../topics/web]]: shared UI 프리미티브 + 별도로 `~/components/ui/`에 shadcn-style 로컬 UI(button.tsx, card.tsx, table.tsx 등). 어드민 콘솔처럼 web-only인 화면은 shared를 거치지 않고 로컬 컴포넌트로 직조.
- **2026-05-07** in [[../topics/mobile]]: shared UI 프리미티브 + expo-router로 RN-native 네비게이션 트리. 어드민 UI는 의도적으로 빠져 있음.
- **2026-05-07** in [[../topics/project-overview]]: TECH_STACK.md "의도적으로 제외" 표에서 Tamagui/RN-Web 거부 명시 — "UI 통합 복잡도 > 이득". CLAUDE.md도 "플랫폼별 UI는 각각 `apps/web`, `apps/mobile`에" 규칙 명시.
- **2026-05-14** in [[../topics/mobile]]: quad 패턴이 작동하려면 Metro resolver 가 플랫폼별 확장자를 우선 탐색해야 한다는 사실 표면화. 커스텀 `resolveRequest` 가 `./Foo.js` → `.ts`/`.tsx` 만 시도하던 시점에 native 빌드에서 `Comp.tsx`(=`.web` 셔틀)가 픽돼 `<h1>` Invariant 가 떴다. iOS → `.ios.tsx` → `.native.tsx` → `.tsx`, web → `.web.tsx` → `.tsx` 순서로 시도하도록 수정. 셔틀(`Comp.tsx`)이 `.web.tsx` 를 그대로 재export 하는 현재 구현에선 이 우선순위가 곧 quad 패턴의 작동 보장.

## What This Means

이 패턴은 두 가지 가치 판단을 코드에 박아 둔다:

1. **공유의 비용은 UI에서 가장 비싸다** — 비즈니스 로직(어떤 픽 모델, 어떤 유효성 검증)은 모든 플랫폼이 동일해야 하고, 그래서 `@repo/api-contract`/`@repo/shared`로 강제 공유된다. UI는 반대로 — 키보드 입력 처리, 햅틱, safe-area, 폰트 렌더링이 플랫폼마다 다르고, 추상화 레이어로 흡수하려 들면 양쪽 다 어색해진다. 그래서 "공유해야 할 것"과 "분기해야 할 것"의 경계를 의식적으로 그어 둠.
2. **번들러 친화적 추상화** — 빌드 시점에 확장자(`.web.tsx` vs `.native.tsx`) 해석으로 플랫폼이 결정되므로, 런타임 분기 코드(`if (Platform.OS === 'web')`) 없이도 트리셰이킹이 깨끗하다. 결과: web 번들에 RN 코드가 안 들어가고, native 번들에 DOM 코드가 안 들어간다.
3. **다른 화면은 다른 도구로** — 어드민 콘솔은 web-only이라서 shared의 cross-platform 추상화가 오히려 짐이 된다 → 로컬 shadcn 컴포넌트로. mobile은 expo-router의 file-based 라우팅을 그대로 활용. "공유 가능한 추상화"를 모든 곳에 강요하지 않음.

이 패턴이 깨질 수 있는 위험:
- 번들러가 확장자 우선순위를 다르게 해석할 때 — shared 의 `Comp.tsx` 가 `.web.tsx` 를 직접 재export 하는 셔틀 패턴이라, Metro 가 `./Foo.js` 를 `.tsx` 만 매핑하면 native 빌드에서도 셔틀(=`.web`)이 픽된다. `apps/mobile/metro.config.js` 의 커스텀 resolver 가 플랫폼별 확장자(`.ios.tsx`/`.native.tsx`/`.web.tsx`)를 우선 시도해야 한다 (2026-05-14 fix 참조). 누가 무심코 `Button.tsx` 에 web 구현을 넣으면 Metro 가 그걸 native 에서도 쓰게 됨 → 항상 quad 패턴 유지 필요
- React 버전 불일치 (웹 R19, 앱 R18) — `@repo/shared`가 React 18+ peer로 양쪽 호환. shared 코드가 R19-only API(예: 새 `use()` 훅)를 쓰는 순간 앱이 깨진다. **추가로** 워크스페이스에 두 React 사본이 공존하므로 같은 번들에 새어 들어오면 `$$typeof` 불일치 — 앱 Metro `extraNodeModules` 로 앱 로컬 react/react-dom 강제. Expo Web 정적 사전렌더(`output: 'static'`)는 SSR 의 hoist 된 react-dom 사본이 다른 React 사본의 element 를 받아 충돌 — 현재 `output: 'single'` SPA
- 새 UI 프리미티브 추가 시 quad 4-file 패턴 누락 가능 — 한 플랫폼만 두면 다른 쪽에서 import 시 런타임 에러

## Sources

- [[../topics/shared]]
- [[../topics/web]]
- [[../topics/mobile]]
- [[../topics/project-overview]]
