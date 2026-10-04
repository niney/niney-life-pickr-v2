---
concept: 웹 테스트를 통과한 공유 코드가 앱 런타임에서 조용히 틀린다 — Hermes·Fabric·EXGL·Metro 의 빈틈
last_compiled: 2026-10-04
topics_connected: [shared, mobile, saju-c, tarot, meal]
status: active
---

# 웹 테스트를 통과한 공유 코드가 앱 런타임에서 조용히 틀린다 — Hermes·Fabric·EXGL·Metro 의 빈틈

## Pattern

`@repo/shared`·`@repo/utils` 는 웹(브라우저·jsdom)과 앱(Hermes + RN Fabric)에서 **같은 소스**로 돈다([platform-ui-split](platform-ui-split.md)). 테스트는 거의 전부 Node/jsdom 에서 돌고 앱 자동 테스트는 0건이라, 런타임 차이로 생기는 결함은 **예외 없이 조용히** 틀린 값을 낸다 — 크래시가 아니라 "쿼리가 빠진 목록", "마지막 줄이 없는 문단", "그려지지 않는 텍스처". 사주·타로를 앱 네이티브로 옮긴 2026-09-25~26 에 이 부류가 한꺼번에 드러났다(그 전엔 앱이 WebView 안에서 웹 런타임을 썼으므로 가려져 있었다 — [embedded-webview-bridge](embedded-webview-bridge.md)).

빈틈은 층마다 하나씩 있었다.

- **JS 런타임(Hermes 폴리필)** — `URLSearchParams.size` 가 없다. `qs.size > 0` 이 늘 거짓이라 앱의 `sajuApi.listMine`·`tarotApi.listMine` 이 `kind`·`cursor`·`limit` 를 통째로 떨궈, 사주 "물어본 것" 목록이 풀이 목록으로 나오고 다음 페이지를 못 불렀다(`974667d` — 이제 `qs.toString()` 으로 판단, 두 파일에 경고 주석). 시간대 지정 `toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })` 도 믿지 않는다 — 웹 `TarotPage` 의 오늘의 카드 판정이 그걸 썼는데, shared `useTarotSession` 으로 옮기며 순수 계산 `kstDayKey`(utils)로 바꿨다(`1104574`).
- **렌더러(RN 0.81 Fabric, iOS)** — 긴 스크롤 안쪽처럼 절대 좌표가 큰 곳의 여러 줄 `Text` 는 Yoga float 반올림으로 프레임이 글 높이보다 1e-4pt 모자라 **마지막 줄이 통째로 빠진다**. `common/Para` 가 끝에 1pt 빈 줄을 붙여 그 빈 줄만 빠지게 한다(사주·타로 화면만 적용).
- **GL(expo-gl EXGL)** — stb_image 로 이미지를 풀어 **WebP 를 못 읽는다**. 웹 카드 그림은 전부 webp 라, 서버가 JPEG 로 바꿔 주는 라우트 `GET /api/v1/tarot/cards/:cardId/texture.jpg`(384px, `bfce1f8`)와 번들 뒷면 JPEG 를 따로 둔다. R3F 네이티브 `Canvas` 는 모든 터치를 잡아 위에 터치 층을 얹어야 하고, JSX 로 만든 재질은 unmount 때 버려진다.
- **번들러(Metro)** — R3F 앱판(CJS)의 `require('three')` 와 우리 ESM import 가 `three.cjs`·`three.module.js` 두 사본으로 풀리면 R3F 가 덧대는 텍스처 로더 폴리필이 한쪽에만 걸려 `document` 오류가 나고 번들이 1MB 넘게 는다 → `metro.config.js` 가 `three` 를 항상 require 조건(three.cjs)으로 한 벌만 푼다(`173af9c`). 선례로 24차의 Hermes `SharedArrayBuffer` 오류도 호이스팅된 `webidl-conversions@8` 선택이 원인이었다.
- **반대 방향(Expo Web)** — RN 코드가 웹으로 갈 때도 빈틈이 있다: `Alert.alert` 확인창이 Expo Web 에선 뜨지 않아 식단 최근 추천 삭제·사주/타로 기록 삭제가 안 된다.

## Instances

- **2026-09-26** in [shared](../topics/shared.md) / [saju-c](../topics/saju-c.md) / [tarot](../topics/tarot.md) (`974667d`): `URLSearchParams.size` — 시뮬레이터에서 "물어본 것" 탭이 엉뚱한 목록을 보여서야 발견. 웹 브라우저엔 `size` 가 있어 웹 테스트·웹 화면 모두 통과했다.
- **2026-09-26** in [saju-c](../topics/saju-c.md) / [tarot](../topics/tarot.md) / [mobile](../topics/mobile.md) (`04f009e` → `9d565b3`): Fabric 마지막 줄 소실 — 사주 `sajuUi` 의 우회가 타로 전환 때 `common/Para` 로 승격.
- **2026-09-26** in [tarot](../topics/tarot.md) / [mobile](../topics/mobile.md) (`6199215`·`bfce1f8`): EXGL WebP 불가 → 서버 JPEG 변환, R3F 터치 층, 재질 수명.
- **2026-09-26** in [mobile](../topics/mobile.md) (`173af9c`): Metro `three` 단일 사본.
- **2026-10-04** in [meal](../topics/meal.md) / [mobile](../topics/mobile.md) (`867eb18`): Expo Web `Alert.alert` 미표시로 최근 추천 삭제가 안 됨(커밋 본문에 기록, 미해결).
- **선례 2026-08-22** in [mobile](../topics/mobile.md) (`5cb63a3`): Hermes `SharedArrayBuffer` — Metro 수동 모노레포 해석이 고른 의존성 판본 탓.

## What This Means

"공유 코드는 한 번 테스트하면 두 플랫폼에서 맞다"는 가정이 이 프로젝트에서 가장 자주 깨지는 가정이다. 세 가지가 따라 나온다.

1. **결함의 발견 경로가 사람 눈뿐이다** — 위 사례는 전부 시뮬레이터를 Hermes CDP 로 조작하다가 찾았다. 앱 자동 테스트 0건, Android 전부 미확인인 현재, 새 공유 코드를 쓸 때 "이 API 가 Hermes 에 있는가"를 리뷰 체크리스트로 묻는 것이 유일한 방어선이다. 웹 전용 API(`URLSearchParams.size`·`Intl` 시간대·`structuredClone`·`navigator.*`)는 shared 에서 쓰지 않거나 순수 계산으로 대체하는 편이 싸다.
2. **우회는 코드 주석에만 산다** — `Para` 는 사주·타로에만 적용돼 식단·맛집 상세의 긴 본문은 같은 증상에 무방비이고, `size` 경고 주석은 그 두 파일에만 있다. 우회를 공용 부품으로 승격하고(Para 처럼) lint 규칙이나 공용 헬퍼(쿼리 빌더)로 바꿔야 다음 사람이 같은 함정을 다시 밟지 않는다.
3. **WebView 임베드가 이 비용을 미뤄 주고 있었다** — 임베드 시절엔 앱이 웹 엔진을 빌려 써서 이 부류가 0건이었다. 네이티브 전환의 숨은 비용 중 가장 큰 것이 이것이고, 다음 네이티브 이식(예: 집값·여행 화면)도 같은 목록을 먼저 점검해야 한다.

## Sources

- [../topics/shared](../topics/shared.md)
- [../topics/mobile](../topics/mobile.md)
- [../topics/saju-c](../topics/saju-c.md)
- [../topics/tarot](../topics/tarot.md)
- [../topics/meal](../topics/meal.md)
- [../../packages/shared/src/api/saju.api.ts](../../packages/shared/src/api/saju.api.ts)
- [../../packages/shared/src/api/tarot.api.ts](../../packages/shared/src/api/tarot.api.ts)
- [../../apps/mobile/src/components/common/Para.tsx](../../apps/mobile/src/components/common/Para.tsx)
- [../../apps/mobile/metro.config.js](../../apps/mobile/metro.config.js)
- [../../docs/mobile-ios-build.md](../../docs/mobile-ios-build.md)
