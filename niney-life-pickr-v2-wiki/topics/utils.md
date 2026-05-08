---
topic: utils
last_compiled: 2026-05-08
sources_count: 6
status: active
aliases: ["@repo/utils", pure-functions, helpers, slugify, pick-random, thumbnail-url]
---

# utils — 순수 유틸 패키지

## Purpose [coverage: high — 2 sources]

`@repo/utils` — 순수 함수 모음. FE/BE 모두에서 import 가능한 사이드 이펙트 없는 헬퍼만 모아 둔다. 외부 npm 의존이 0개고 어떤 런타임(Node, 브라우저, RN)에서도 실행된다. CLAUDE.md의 의존 그래프상 leaf 노드 — `shared`, `api-contract`, 모든 앱이 여기로 들어올 수 있지만 utils는 어디로도 의존하지 않는다. 도메인 함수(`pickRandom`/`shuffle`은 Pick 추첨)와 표현 헬퍼(`reviewThumbnailUrl`은 friendly 미디어 프록시 URL)가 공존한다.

## Architecture [coverage: high — 6 sources]

`src/{domain}.ts` 단일 도메인 단위 + `src/index.ts` 배럴:

```
packages/utils/
├── src/
│   ├── index.ts      // export * (각 모듈 re-export)
│   ├── date.ts       // toISOString, fromISOString, isValidDate
│   ├── format.ts     // truncate, capitalize, slugify
│   ├── random.ts     // pickRandom, shuffle
│   └── thumbnail.ts  // reviewThumbnailUrl (신설, d8e08d7)
├── package.json      // build 없음 — src 그대로 export
└── tsconfig.json
```

api-contract와 같은 빌드 없는 패턴: `package.json`이 `./src/*.ts`를 직접 main/types/exports로 노출. 서브패스 import 지원: `@repo/utils/date`, `@repo/utils/format`, `@repo/utils/random`. (참고: `thumbnail`은 `package.json`의 `exports`에 서브패스가 아직 등록돼 있지 않아 배럴 경유로만 접근 — `import { reviewThumbnailUrl } from '@repo/utils'`)

## Talks To [coverage: medium — 1 sources]

- 컨슈머: `apps/friendly`, `apps/web`, `apps/mobile`, `packages/shared` — 어디서나 import 가능
- 의존: 없음 (외부 npm 0개, 워크스페이스 0개) — 진짜 leaf 노드
- `reviewThumbnailUrl`은 friendly의 `/api/v1/media/thumbnail` 프록시 라우트 ([media 토픽](media.md))를 가리키므로 클라이언트에서 friendly 도메인과 같은 origin이거나 base URL이 적용된 fetcher와 함께 쓰여야 한다

## API Surface [coverage: high — 6 sources]

[`date.ts`](../../packages/utils/src/date.ts):
- `toISOString(date?: Date): string` — 기본값 `new Date()`
- `fromISOString(iso: string): Date`
- `isValidDate(date: unknown): date is Date` — 타입 가드

[`format.ts`](../../packages/utils/src/format.ts):
- `truncate(text: string, max: number): string` — 초과 시 `…` (말줄임표) 추가
- `capitalize(text: string): string` — 첫 글자 대문자
- `slugify(text: string): string` — lowercase + trim + 비단어 제거 + 공백/언더스코어 → 하이픈

[`random.ts`](../../packages/utils/src/random.ts):
- `pickRandom<T>(items: readonly T[]): T` — 빈 배열 시 throw
- `shuffle<T>(items: readonly T[]): T[]` — Fisher-Yates, 입력 비변경

[`thumbnail.ts`](../../packages/utils/src/thumbnail.ts) — 신설 (d8e08d7):
- `reviewThumbnailUrl(originalUrl: string, width = 300, quality?: number): string` — friendly의 `/api/v1/media/thumbnail?url=…&w=…&q=…` 프록시 URL을 빌드. FE가 직접 query string을 조립하지 않게 중앙화

## Data [coverage: low — 0 sources]

상태/저장소 없음 — 순수 함수만.

## Key Decisions [coverage: medium — 2 sources]

- **순수 함수만** — 상태/IO 있는 헬퍼는 여기 들어오지 않는다 ([shared](shared.md) 또는 앱 내부로). 도메인 로직(`reviewThumbnailUrl`처럼 friendly URL을 알고 있는 함수)은 "URL 문자열만 만든다"는 순수성 한도 내에서만 허용
- **외부 의존 0** — 가벼운 leaf 패키지로 유지해 트리 셰이킹/배포 부담 최소화
- **빌드 없음** — `src/*.ts`를 직접 export. tsx (friendly), Vite (web), Metro (mobile) 모두 그대로 처리
- **서브패스 export** — 트리셰이킹 안 되는 컨슈머도 `@repo/utils/random`만 가져갈 수 있음

## Gotchas [coverage: low — 2 sources]

- 새 헬퍼 모듈 추가 시 [`index.ts`](../../packages/utils/src/index.ts) 배럴에 `export *`를 빠뜨리기 쉬움 — `thumbnail.ts` 추가 때도 같이 갱신했어야 컨슈머가 찾을 수 있다
- 새 모듈을 서브패스로 노출하려면 [`package.json`](../../packages/utils/package.json) `exports` 맵도 추가해야 함 — `thumbnail`은 현재 미등록 (배럴 경유만 가능)
- `pickRandom`은 빈 배열 시 throw — 호출자가 사전 체크 필요
- `Math.random()` 사용 — 암호학적 안전성이 필요하면 `crypto.getRandomValues()` 기반 별도 헬퍼를 추가할 것 (현재는 Pick 추첨용으로 충분)
- `reviewThumbnailUrl`은 절대 URL이 아닌 path만 반환 — 다른 origin에서 호출한다면 base URL을 별도로 prepend해야 함

## Sources [coverage: high — 6 sources]

- [packages/utils/package.json](../../packages/utils/package.json)
- [packages/utils/src/index.ts](../../packages/utils/src/index.ts)
- [packages/utils/src/date.ts](../../packages/utils/src/date.ts)
- [packages/utils/src/format.ts](../../packages/utils/src/format.ts)
- [packages/utils/src/random.ts](../../packages/utils/src/random.ts)
- [packages/utils/src/thumbnail.ts](../../packages/utils/src/thumbnail.ts)
