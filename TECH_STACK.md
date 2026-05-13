# Tech Stack — niney-life-pickr-v2

신규 구축 시 채택할 전체 기술 스택 명세. 버전은 작성 시점 기준 최신 안정 버전.

---

## 1. 개요

| 영역 | 선택 |
|---|---|
| **모노레포** | pnpm workspaces + Turborepo |
| **언어** | TypeScript 5.7 (strict + noUncheckedIndexedAccess) |
| **런타임** | Node.js 22 LTS |
| **백엔드** | Fastify 5 |
| **DB** | SQLite + Prisma |
| **웹** | Vite 6 + React 19 |
| **앱** | Expo 52 + React Native 0.76 |
| **상태/데이터** | Zustand + TanStack Query 5 |
| **스키마/검증** | Zod 3 (FE/BE 단일 진실의 원천) |

---

## 2. 모노레포 인프라

| 도구 | 버전 | 용도 |
|---|---|---|
| **pnpm** | 9.15.x | 패키지 매니저, 워크스페이스 |
| **Turborepo** | 2.3.x | 태스크 오케스트레이션, 캐싱 |
| **Node.js** | 22 LTS | 런타임 (`.nvmrc` 고정) |
| **Corepack** | 내장 | pnpm 버전 고정 |

### 핵심 설정
- `pnpm-workspace.yaml` — `apps/*`, `packages/*`
- `turbo.json` — `build`, `dev`, `typecheck`, `lint`, `test` 파이프라인
- `.npmrc` — `auto-install-peers=true`, `node-linker=isolated`

---

## 3. 공유 패키지 (`packages/`)

### `@repo/api-contract`
- **Zod 3.24** — 런타임 검증 + 타입 추론
- FE/BE 공통 스키마 (auth, user, picks, common)
- 라우트 경로 상수 (`Routes.Auth.login` 등)
- **빌드 없이 src/index.ts 직접 노출** (Turborepo + tsx/Vite/Metro 호환)

### `@repo/shared` (FE 공통)
- **TanStack Query 5.62** — 서버 상태
- **Zustand 5.0** — 클라이언트 상태 (auth)
- 플랫폼 무관 API 클라이언트 (`fetch` 래퍼)
- 커스텀 훅 (useLogin, useCurrentUser, usePicks 등)

### `@repo/utils`
- 순수 함수만 (pickRandom, shuffle, slugify, date helpers)
- FE/BE 모두 사용 가능

### `@repo/config`
- 공유 `tsconfig` (base, node, react, react-native)
- 공유 ESLint flat config

---

## 4. 백엔드 — `apps/friendly`

### 코어
| 패키지 | 버전 | 역할 |
|---|---|---|
| **fastify** | 5.2.x | HTTP 서버 |
| **fastify-plugin** | 5.0.x | 플러그인 캡슐화 해제 |
| **@fastify/autoload** | 6.0.x | plugins/modules 자동 로드 |
| **fastify-type-provider-zod** | 4.0.x | Zod 스키마 → 검증 + 타입 추론 + OpenAPI |

### 플러그인
| 패키지 | 용도 |
|---|---|
| **@fastify/cors** | CORS |
| **@fastify/helmet** | 보안 헤더 |
| **@fastify/jwt** | JWT 인증 |
| **@fastify/sensible** | `reply.unauthorized()` 등 헬퍼 |
| **@fastify/swagger** + **@fastify/swagger-ui** | OpenAPI 자동 생성 (`/docs`) |

### 데이터베이스
| 패키지 | 버전 | 역할 |
|---|---|---|
| **Prisma** | 6.0.x | ORM, 마이그레이션, Studio |
| **@prisma/client** | 6.0.x | 타입 안전 쿼리 클라이언트 |
| **SQLite** | 내장 | 파일 DB (`apps/friendly/data/dev.db`) |

> **운영 단계 백업 옵션**: Litestream → S3 (실시간 복제)

### 인증/암호화
| 패키지 | 용도 |
|---|---|
| **bcryptjs** | 비밀번호 해시 (10 rounds) |
| **@fastify/jwt** | 토큰 발급/검증 (7d 만료) |

### 로깅
| 패키지 | 용도 |
|---|---|
| **pino** | 구조화 JSON 로그 (Fastify 내장) |
| **pino-pretty** | dev 환경 색상 출력 |

### 빌드/실행
| 도구 | 용도 |
|---|---|
| **tsx** | dev (watch + 빠른 TS 실행) |
| **tsup** | 운영 번들 (esbuild 기반, ESM 출력, target: node22) |
| **TypeScript 5.7** | 타입 체크 |

### 테스트
| 도구 | 용도 |
|---|---|
| **Vitest 2.1** | 테스트 러너 |
| **app.inject()** | Fastify 인메모리 통합 테스트 (HTTP 서버 안 띄움) |

### 모듈 구조
```
src/
├── server.ts         # 진입점 (listen + graceful shutdown)
├── app.ts            # buildApp() — 테스트에서 재사용
├── plugins/          # autoload (DB, auth, cors, helmet, swagger, error-handler)
├── modules/          # 도메인별 (auth, picks, health) — *.route.ts autoload
├── lib/              # hash 등 인프라 헬퍼
├── config/env.ts     # zod로 process.env 검증
└── types/            # fastify 타입 확장
```

---

## 5. 웹 — `apps/web`

| 패키지 | 버전 | 역할 |
|---|---|---|
| **Vite** | 6.0.x | 번들러 + dev 서버 |
| **@vitejs/plugin-react** | 4.3.x | React Fast Refresh |
| **React** | 19.0.x | UI 라이브러리 |
| **react-dom** | 19.0.x | |
| **react-router-dom** | 7.1.x | 라우팅 |
| **@tanstack/react-query** | 5.62.x | 서버 상태 (shared 경유) |
| **zustand** | 5.0.x | 클라이언트 상태 |

### 환경 변수
- `VITE_API_URL` — 백엔드 baseURL (dev에선 Vite proxy로 `/api` → `localhost:3000`)

### 토큰 저장
- `localStorage` (key: `lp:token`) — Zustand subscribe로 자동 동기화

---

## 6. 앱 — `apps/mobile`

| 패키지 | 버전 | 역할 |
|---|---|---|
| **Expo SDK** | 52.0.x | RN 메타 프레임워크 |
| **React Native** | 0.76.5 | (New Architecture 활성화) |
| **React** | 18.3.1 | (RN 0.76은 React 18 호환) |
| **expo-router** | 4.0.x | 파일 기반 라우팅 (typed routes) |
| **expo-constants** | 17.0.x | env, app.config 접근 |
| **expo-linking** | 7.0.x | deep link |
| **expo-splash-screen** | 0.29.x | 스플래시 |
| **react-native-gesture-handler** | 2.20.x | 제스처 |
| **react-native-reanimated** | 3.16.x | 애니메이션 |
| **react-native-safe-area-context** | 4.12.x | safe area |
| **react-native-screens** | 4.1.x | 네이티브 스택 최적화 |
| **@react-native-async-storage/async-storage** | 2.1.x | 토큰 저장 |

### 빌드/배포
- **EAS Build** — 클라우드 iOS/Android 빌드 (Mac 불필요)
- **EAS Update** — OTA 업데이트
- `eas.json` — development / preview / production 채널

### Metro 모노레포 설정
- `watchFolders = [workspaceRoot]`
- `disableHierarchicalLookup = true`
- `unstable_enableSymlinks = true`
- `unstable_enablePackageExports = true`

### 환경 변수
- `EXPO_PUBLIC_API_URL` — 빌드 시점 주입, `Constants.expoConfig.extra.apiUrl`로 접근

### 라우팅 구조
```
app/
├── _layout.tsx         # Root (QueryClient, GestureHandler, bootstrap)
├── index.tsx           # 진입 — 토큰 유무로 redirect
├── (auth)/
│   ├── _layout.tsx
│   └── login.tsx
└── (tabs)/
    ├── _layout.tsx     # Tabs 네비게이션
    ├── home.tsx
    └── profile.tsx
```

---

## 7. 코드 품질 도구

| 도구 | 버전 | 용도 |
|---|---|---|
| **TypeScript** | 5.7.x | 타입 시스템 (strict, noUncheckedIndexedAccess, verbatimModuleSyntax) |
| **ESLint** | 9.x (flat config) | 린팅 |
| **typescript-eslint** | 8.x | TS 규칙 |
| **eslint-plugin-react-hooks** | latest | hook 규칙 |
| **eslint-plugin-react-refresh** | latest | HMR 호환성 |
| **Prettier** | 3.4.x | 포매팅 (semi, singleQuote, trailingComma=all, printWidth=100) |

---

## 8. CI/CD

### 로컬 → 운영
| 영역 | 도구 |
|---|---|
| **friendly** | Fly.io / Railway (Dockerfile 자동 빌드) — 또는 단일 VPS + pm2 |
| **web** | Vercel / Cloudflare Pages (정적 호스팅) |
| **mobile** | EAS Build → App Store / Play Store |

### GitHub Actions (권장 워크플로우)
- `ci.yml` — push 시 typecheck + lint + test (Turborepo 캐싱 활용)
- `deploy-api.yml` — main 브랜치 머지 시 friendly 배포
- `eas-update.yml` — 앱 OTA 업데이트

---

## 9. 의도적으로 제외한 것

| 제외 | 이유 |
|---|---|
| **Docker (개발)** | SQLite 파일 DB라 로컬 컨테이너 불필요. DX 손해 |
| **Redis** | 단일 인스턴스 + lru-cache로 충분. 수평 확장 시점에 도입 |
| **Postgres** | MVP 규모엔 SQLite + WAL이 충분. 동시 쓰기 한계 도달 시 전환 |
| **Next.js** | SEO/SSR 요구 없음. Vite SPA가 더 단순 |
| **Tamagui / RN Web** | UI 통합 복잡도 > 이득. 플랫폼별 UI 따로, **로직만 공유** 전략 |
| **Yarn / npm workspaces** | pnpm이 디스크/속도/엄격성 모두 우위 |
| **Webpack** | Vite/Metro로 대체 |
| **Jest** | Vitest가 ESM/TS 친화적 |
| **Express** | Fastify가 성능/타입/플러그인 모델 모두 우위 |
| **TypeORM / Sequelize** | Prisma가 DX/타입 안전성 우위 |
| **Redux** | Zustand로 충분 (보일러플레이트 없음) |
| **Styled-components / Emotion (web)** | CSS 파일로 충분. 필요 시 Tailwind 도입 검토 |

---

## 10. 데이터 흐름 (단일 진실의 원천)

```
┌─────────────────────────────────────────┐
│  packages/api-contract (zod schema)      │  ← SSOT
└──┬───────────────────┬───────────────────┘
   │                   │
   │ 검증 + OpenAPI     │ 타입 + fetch
   ▼                   ▼
┌─────────────┐   ┌─────────────────────┐
│  friendly   │   │  @repo/shared       │
│  (Fastify)  │◄──┤  (API client/hooks) │
└─────────────┘   └─┬─────────────────┬─┘
                    │                 │
                    ▼                 ▼
             ┌────────────┐    ┌────────────┐
             │   web      │    │   mobile   │
             │  (Vite)    │    │  (Expo)    │
             └────────────┘    └────────────┘
```

스키마 1개 변경 → 모든 컨슈머에서 컴파일 타임 불일치 감지.

---

## 11. 버전 호환 매트릭스

| 묶음 | 호환 |
|---|---|
| Node 22 + pnpm 9 + Turbo 2 | ✅ |
| React 19 + Vite 6 | ✅ |
| React 18 + RN 0.76 + Expo 52 | ✅ (RN 0.77+에서 React 19 지원) |
| Fastify 5 + Node 22 | ✅ |
| Prisma 6 + SQLite + Node 22 | ✅ |
| Zod 3 + fastify-type-provider-zod 4 | ✅ |

> **주의**: 웹은 React 19 / 앱은 React 18 — 다르지만 `@repo/shared`는 React 18+ peer로 선언되어 양쪽 호환.

---

## 12. 핵심 명령어

```bash
# 설치
corepack enable
pnpm install

# DB
pnpm --filter friendly db:generate
pnpm --filter friendly db:migrate
pnpm --filter friendly db:studio

# 개발
pnpm dev               # 전체
pnpm dev:api           # friendly만
pnpm dev:web           # 웹만
pnpm dev:mobile        # 앱 (Expo Dev Tools)
pnpm dev:ios           # 앱 iOS 시뮬레이터 직행
pnpm dev:android       # 앱 Android 에뮬레이터 직행

# 빌드/검증
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# 앱 빌드
pnpm --filter mobile exec eas build --platform ios --profile preview
pnpm --filter mobile exec eas update
```

## 13. 결정 근거 요약

- **단순함 우선**: SQLite, Vite, 인메모리 캐시 — MVP에 과한 인프라 없음
- **타입 안전성**: Zod 단일 SSOT으로 FE/BE 동기화
- **DX 우선**: tsx + Turbo 캐싱 + 빌드 없는 패키지 → 즉시 핫리로드
- **2026년 표준**: Expo 52 + RN 0.76 newArch + React 19 (web) — 최신 모범 사례
- **점진적 확장**: SQLite → Postgres, lru-cache → Redis, 단일 VPS → k8s 모두 후일 대응 가능
