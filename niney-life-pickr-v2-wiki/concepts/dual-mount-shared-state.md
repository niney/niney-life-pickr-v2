---
concept: dual-mount-shared-state
last_compiled: 2026-07-07
topics_connected: [web, transit, map, bus, subway]
status: active
---

# 데스크톱/모바일 동시 마운트와 상태·자원 공유

## Pattern

대중교통 페이지(Bus/SubwayPage)는 데스크톱 레이아웃(`hidden xl:flex`)과 모바일 레이아웃(`xl:hidden`)을 **CSS 숨김으로 동시에 마운트**한다 — 조건부 렌더가 아니다. 같은 컴포넌트(지도·검색바·즐겨찾기 섹션·크로스 섹션)가 항상 **두 인스턴스** 살아 있고, 화면에는 브레이크포인트에 따라 한쪽만 보인다. 이 구조가 상태·자원 설계에 일관된 결정 트리를 만든다:

- **UI 상태가 양 인스턴스에서 일치해야 하면** → 컴포넌트 로컬 state 금지. zustand 스토어(`transitFavExpandStore` — 펼침, `transitCrossShowStore` — 겸표시 토글·persist) 또는 페이지 레벨 state(`submittedQ` — 페이지는 하나라 prop으로 자연 공유)로 승격.
- **네트워크는 걱정하지 않는다** → 두 인스턴스가 같은 React Query queryKey를 구독하면 dedupe로 호출은 1회. 상태만 공유하면 이중 소비는 없다.
- **불일치가 화면에 안 드러나면 로컬 허용** → 한 번에 한 레이아웃만 보이므로, 소멸성 UI(12차 SubwayNearbyBusSection 아코디언)는 로컬 state로 충분하다는 명시적 판단 기준이 있다.
- **무거운 자원(OL 지도)은 키로 분리** → 지도 인스턴스 풀(D안)은 단일 풀 키면 마운트 순서상 데스크톱만 재사용을 받아 모바일 폭에서 타일 플래시가 남는다(실측). `transit-desktop`/`transit-mobile` 키 분리로 각 레이아웃이 자기 인스턴스를 재사용.

## Instances

- **2026-07-07** in [[../topics/map]]: D안 지도 인스턴스 풀링 검증 중 이중 마운트 구조가 실측으로 드러남(DOM 태깅 — 페이지당 `.ol-viewport` 2개). 단일 `poolKey="transit"`은 JSX 순서상 데스크톱만 재사용 → 레이아웃별 키 분리로 수정. 풀 반납 충돌 방어(같은 키 이중 반납 시 dispose)도 이 구조 때문에 존재.
- **2026-07-07** in [[../topics/transit]]: 13차 즐겨찾기 펼침 상태를 `transitFavExpandStore`로 승격 — 로컬이면 한쪽에서 펼쳐도 다른 쪽은 접힌 채. 같은 항목을 펼치면 같은 도착 queryKey 구독 → RQ dedupe로 호출 1회(스토어 주석에 근거 명시).
- **2026-07-07** in [[../topics/transit]]: 14차 겸표시 토글은 persist 스토어(양 탭·양 레이아웃 공유), 15차 `submittedQ`는 SubwayPage 페이지 state — "페이지는 하나"라는 사실이 스토어 없이 공유를 해결한 대비 사례.
- **2026-07-07** in [[../topics/transit]]: 15차 크로스 섹션이 잠시 아코디언(컴포넌트 로컬 state)이었을 때의 판단 근거 — "한 레이아웃만 가시 + 양쪽 다 펼쳐도 dedupe로 조회 1회"라 로컬 허용. 이후 검색 UX 통일로 제출 기반 자동 섹션이 되며 로컬 state 자체가 사라짐.
- **2026-07-06** in [[../topics/bus]] / [[../topics/subway]]: 페이지 diff 기준 두 레이아웃에 같은 props를 이중 전달하는 배선이 표준 형태(`overlayMarkers`/`crossSearchContent`/`favoritesContent` 등 모두 양쪽 주입).

## What This Means

1. **"반응형 = CSS만"이 아니다** — 이 리포의 반응형은 두 UI 트리를 동시에 살리는 방식이라, 새 상태를 붙일 때마다 "이 상태가 인스턴스별로 갈라져도 되는가"를 물어야 한다. 갈라지면 안 되는데 로컬로 두면 버그가 화면 전환(창 리사이즈) 순간에만 드러나 잡기 어렵다.
2. **결정 트리가 이미 확립돼 있다** — 공유 필요(스토어/페이지 state) vs 소멸성·불가시(로컬 허용) vs 무거운 자원(키 분리). 새 대중교통 기능은 이 세 갈래 중 하나로 분류하면 된다.
3. **검증도 구조를 알아야 한다** — 브라우저 자동화에서 보이는 쪽만 확인하면 숨은 인스턴스의 동작(중복 폴링·상태 분기)을 놓친다. D안 검증의 DOM 태깅(양 viewport 생존 추적)이 참고 기법. 또한 비가시 탭에서는 React Query가 재시도를 일시정지(pending+paused)하므로 "성공 응답에만 빈 상태 문구" 같은 방어 렌더가 필요하다(13차 하드닝).

## Sources

- [[../topics/web]]
- [[../topics/transit]]
- [[../topics/map]]
- [[../topics/bus]]
- [[../topics/subway]]
