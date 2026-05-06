---
topic: utils
last_compiled: 2026-05-07
sources_count: 5
status: active
aliases: ["@repo/utils", pure-functions, helpers, slugify, pick-random]
---

# utils — 순수 유틸 패키지

## Purpose [coverage: high — 2 sources]

`@repo/utils` — 순수 함수 모음. FE/BE 모두에서 import 가능한 사이드 이펙트 없는 헬퍼만 모아 둔다. 의존하는 외부 패키지가 없고, 어떤 런타임(Node, 브라우저, RN)에서도 실행된다. `pickRandom` / `shuffle`이 메인 도메인 함수 (Pick 결과 추첨에 사용).

## Architecture [coverage: high — 5 sources]

세 개의 작은 모듈로 분리:

```
packages/utils/
├── src/
│   ├── index.ts     // export *
│   ├── date.ts      // toISOString, fromISOString, isValidDate
│   ├── format.ts    // truncate, capitalize, slugify
│   └── random.ts    // pickRandom, shuffle
├── package.json     // build 없음 — src 그대로 export
└── tsconfig.json
```

api-contract와 같은 빌드 없는 패턴: `package.json`이 `./src/*.ts`를 직접 main/types/exports로 노출. 서브패스 import 지원: `@repo/utils/date`, `@repo/utils/format`, `@repo/utils/random`.

## Talks To [coverage: medium — 1 sources]

- 컨슈머: `apps/friendly`, `apps/web`, `apps/mobile`, `packages/shared` — 어디서나 import 가능
- 의존: 없음 (외부 npm 패키지 0개, 워크스페이스 패키지 0개) — 진짜 leaf 노드

## API Surface [coverage: high — 5 sources]

`date` 모듈:
- `toISOString(date?: Date): string` — 기본값 `new Date()`
- `fromISOString(iso: string): Date`
- `isValidDate(date: unknown): date is Date` — 타입 가드

`format` 모듈:
- `truncate(text: string, max: number): string` — 길이 초과 시 `…` (ellipsis) 추가
- `capitalize(text: string): string` — 첫 글자 대문자
- `slugify(text: string): string` — lowercase + 공백/언더스코어 → 하이픈 + 비단어 제거

`random` 모듈:
- `pickRandom<T>(items: readonly T[]): T` — 빈 배열 시 throw
- `shuffle<T>(items: readonly T[]): T[]` — Fisher-Yates, 입력 비변경

## Data [coverage: low — 0 sources]

상태/저장소 없음 — 순수 함수만.

## Key Decisions [coverage: medium — 2 sources]

- **순수 함수만** — 상태/IO 있는 헬퍼는 여기 들어오지 않는다 ([shared](shared.md) 또는 앱 내부로)
- **외부 의존 0** — 가벼운 leaf 패키지로 유지해 트리 셰이킹/배포 부담 최소화
- **빌드 없음** — `src/*.ts`를 직접 export. tsx (friendly), Vite (web), Metro (mobile) 모두 그대로 처리
- **서브패스 export** — 트리셰이킹 안 되는 컨슈머도 `@repo/utils/random`만 가져갈 수 있음

## Gotchas [coverage: low — 1 sources]

- `pickRandom`은 빈 배열 시 throw — 호출자가 사전 체크 필요
- `Math.random()` 사용 — 암호학적 안전성이 필요하면 `crypto.getRandomValues()`로 별도 헬퍼 추가할 것 (현재는 Pick 추첨용으로 충분)

## Sources [coverage: high — 5 sources]

- [packages/utils/package.json](../../packages/utils/package.json)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts)
- [packages/utils/src/date.ts](../../packages/utils/src/date.ts)
- [packages/utils/src/format.ts](../../packages/utils/src/format.ts)
- [packages/utils/src/random.ts](../../packages/utils/src/random.ts)
