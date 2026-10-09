---
concept: 시작 비용은 모든 경로가 낸다 — 무거운 의존성은 쓰는 순간에 부르고, 새지 않게 가드한다
last_compiled: 2026-10-10
topics_connected: [friendly, web, api-contract, shared, utils, crawl, tarot, saju-c, settlement, meal, project-overview]
status: active
---

# 시작 비용은 모든 경로가 낸다 — 무거운 의존성은 쓰는 순간에 부르고, 새지 않게 가드한다

## Pattern

정적 `import` 는 "이 모듈이 필요할지도 모른다" 를 "모든 실행 경로가 이 모듈 값을 미리 낸다" 로 바꾼다. 이 모노레포에서 그 값이 큰 의존성은 두 쪽에 몰려 있다. 서버(friendly)에는 playwright·playwright-extra(크롤), sharp(썸네일·영수증·식단 사진·공유 카드), satori·resvg(공유 PNG), heic-convert(HEIC) — 단독 import 합만 약 +100MB 이고([docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) X-3), 요청 대부분(공개 목록·지도·날씨)은 그중 아무것도 쓰지 않는다. 웹에는 three·R3F(타로·사주 3D, 약 1MB)와 zod + 스키마(55kB+) — 타로 무대를 열지 않는 방문자, 폼 검증이 없는 공개 페이지가 대부분이다.

2026-10-05 두 쪽에서 같은 처방이 나왔다: **무거운 것은 쓰는 그 순간 부르고(`await import()`·`React.lazy`·워커 안 import), 그 결정이 한 줄 실수로 무너지지 않게 경계에 가드를 둔다.** 서버는 부팅 RSS 와 부팅 시간이, 웹은 첫 로드 JS 가 줄었고, 둘 다 "조용히 새어 들어갔다" 는 이력이 있어 가드가 패턴의 절반이다.

## Instances

- **2026-10-05** in [friendly](../topics/friendly.md) / [crawl](../topics/crawl.md) (`ab7dad28`): playwright 를 `(await import('playwright')).chromium.launch()` 로, 브라우저는 `adapters/lazy-browser.ts` 가 첫 사용 때 띄우고 `disconnected` 면 다시·idle 이면 닫는다. 부팅 RSS 329→290MB. 어댑터 파일에 남은 건 `import type` 뿐.
- **2026-10-05** in [tarot](../topics/tarot.md) / [saju-c](../topics/saju-c.md) / [settlement](../topics/settlement.md) (`lib/share-render.ts`, `78cbb457`): satori·resvg 를 `loadSatori()`·`loadResvg()` 프로미스 싱글턴으로 — 첫 렌더 때 import, 실패하면 다음 호출에 재시도. 정적 import 면 부팅마다 외부 메모리 +16MB(yoga wasm 등)·import +0.1초. sharp 도 카드 모듈 안에서 `await import('sharp')`.
- **2026-10-05** in [meal](../topics/meal.md) / [settlement](../topics/settlement.md) (`lib/heic-worker.ts`, `7b060ca4`·`0157da60`): 더 나아가 **무거운 모듈을 워커 안에서만** — heic-convert(libheif wasm)는 선형 메모리가 줄지 않아, 작업마다 새 `worker_threads` 워커에서 디코드하고 끝나면 종료해 wasm 메모리를 반환한다. "이 파일을 import 해도 기저 메모리가 늘지 않는다" 가 파일 머리 주석의 계약. 영수증 HEIC 는 이 워커 위 얇은 어댑터로 합쳐져 전역 동시 1건.
- **2026-10-05** in [friendly](../topics/friendly.md) / [project-overview](../topics/project-overview.md): 전 모듈 정리 결과 무거운 의존성의 정적 import 는 0(남은 것은 `import type`), 메모리 배터리 기준 부팅 16.1s → 3.7s·heap 93→76MB. 서버 쪽에는 이를 강제하는 lint 규칙이나 테스트가 **없다** — 다음 정적 import 는 리뷰로만 잡힌다.
- **2026-10-05** in [web](../topics/web.md) (`apps/web/vite.config.ts`, `da755684`): 첫 로드 JS 2,059 → 516kB(gzip 628 → 165). 원인은 import 한 줄이 아니라 **청크 그룹** — Rolldown 은 그룹에 잡힌 모듈의 의존성까지 그 그룹으로 끌어가, 엔트리와 R3F 가 함께 쓰는 zustand·use-sync-external-store 가 three 그룹에 들어가자 엔트리가 three 청크(1MB)를 정적 import 했다. 공용 패키지를 react-vendor 그룹으로 옮기고, 어드민 27개 페이지를 페이지별 `lazy`(진입 919kB 한 덩어리 → 껍데기 22kB + 페이지), 지역 통계 지도·GeoJSON 파서도 지연. 가드: `firstLoadGuard` 플러그인이 엔트리의 정적 closure 에 three 가 있으면 **빌드 실패**, zod 가 있으면 경고.
- **2026-10-05** in [api-contract](../topics/api-contract.md) / [shared](../topics/shared.md) / [utils](../topics/utils.md) (`da755684`): 웹 쪽 zod 누수의 뿌리는 "스키마 파일의 상수를 값으로 import" — FE 가 값으로 쓰는 한도·헤더 이름·확인 문구를 zod 없는 `src/constants.ts` 로, `recomputeCanonicalAggregates` 를 `src/restaurant.aggregates.ts` 로 옮기고 스키마가 거기서 가져다 쓴다. shared `apiFetch` 는 오류 응답 판정을 zod 대신 타입 가드로. 세 패키지에 `sideEffects: false` — 배럴 import 해도 쓰는 모듈만 실린다. 둘 다 CLAUDE.md 규칙으로 승격(핵심 규칙 1 보강, "안 되는 것" 에 부작용 전용 모듈 금지). [zod-ssot-buildless](zod-ssot-buildless.md) 의 "스키마 1개가 SSOT" 가 번들 경계와 만나 생긴 보정이다.
- **2026-10-05** in [project-overview](../topics/project-overview.md) (`deploy.sh` `build_web`): 가드가 있어도 **설정 자체가 바뀌치기**되면 소용없다 — 운영 웹은 gitignore 된 예전 `tsc -b` 산출물 `apps/web/vite.config.js` 로 빌드되던 것으로 보였다(Vite 는 `.js` 를 `.ts` 보다 먼저 읽는다, 서버 미확인). dev·build·preview 스크립트가 `--config vite.config.ts` 를 명시하고 `deploy.sh` 가 빌드 전에 낡은 `.js` 를 지운다.

## What This Means

1. **"필요할지도" 는 비용이 아니라고 착각하기 쉽다** — 정적 import 의 값은 그 기능을 쓰는 요청이 아니라 **모든 요청과 매 부팅**이 낸다. 서버에선 그게 기저 RSS 이고(재시작 상한 1.5GB 까지의 여유를 깎는다), 웹에선 첫 화면 전의 다운로드다. 기준은 "이 경로의 몇 %가 이걸 쓰나" — 소수면 지연.
2. **새는 경로는 직접 import 가 아니라 간접 경로다** — three 는 zustand 를 통해, zod 는 상수를 통해 들어왔다. 둘 다 코드 리뷰에서 "three 를 import 하지 않았다" 로 통과할 변경이었다. 그래서 규칙(CLAUDE.md)만으로는 부족하고 **결과물을 검사하는 가드**(빌드 산출물의 정적 closure 검사)가 필요하다. 서버 쪽은 아직 이 가드가 없어 비대칭이다.
3. **지연에도 단계가 있다** — 사용 시점 import(playwright·satori) < 프로미스 싱글턴으로 한 번만(실패 시 재시도) < 워커 안에서만 import 하고 작업마다 버림(heic-convert). 뒤로 갈수록 메모리를 확실히 돌려받지만 호출당 비용이 크다. 메모리가 돌아오지 않는 의존성(wasm 선형 메모리)일수록 뒤쪽으로.
4. **지연은 첫 호출에 지연을 옮긴다** — 첫 공유 렌더가 import 를 떠안고, 첫 크롤이 브라우저를 띄운다. 이번엔 글꼴·래스터 개선으로 첫 렌더가 예전보다도 빨라 상쇄됐지만, 지연 import 를 붙일 땐 첫 호출 시간도 같이 재야 한다.

## Sources

- [friendly](../topics/friendly.md)
- [web](../topics/web.md)
- [api-contract](../topics/api-contract.md)
- [shared](../topics/shared.md)
- [utils](../topics/utils.md)
- [crawl](../topics/crawl.md)
- [tarot](../topics/tarot.md)
- [saju-c](../topics/saju-c.md)
- [settlement](../topics/settlement.md)
- [meal](../topics/meal.md)
- [project-overview](../topics/project-overview.md)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md)
- [apps/web/vite.config.ts](../../apps/web/vite.config.ts)
- [apps/friendly/src/lib/share-render.ts](../../apps/friendly/src/lib/share-render.ts)
- [apps/friendly/src/lib/heic-worker.ts](../../apps/friendly/src/lib/heic-worker.ts)
- [CLAUDE.md](../../CLAUDE.md)
- [zod-ssot-buildless](zod-ssot-buildless.md)
- [webgl-stage-lite-fallback](webgl-stage-lite-fallback.md)
