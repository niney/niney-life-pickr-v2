# niney-life-pickr-v2

선택이 고민될 때 대신 골라주는 서비스. Web + Mobile + API 모노레포.

기술 스택의 자세한 명세는 [TECH_STACK.md](TECH_STACK.md) 참고.

## 디렉토리

```
apps/
  friendly/    Fastify + SQLite 백엔드
  web/         Vite + React 19 웹
  mobile/      Expo 52 (React Native 0.76) 앱
packages/
  api-contract/  FE/BE 공유 zod 스키마
  shared/        공통 API 클라이언트, React Query 훅, Zustand 스토어
  utils/         순수 유틸
  config/        tsconfig / eslint 공유
```

## 빠른 시작

### 사전 준비

- Node.js 22+
- pnpm 9+

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

### 설치

```bash
pnpm install
```

### 백엔드 초기 설정

```bash
cp apps/friendly/.env.example apps/friendly/.env
pnpm --filter friendly db:generate
pnpm --filter friendly db:migrate
```

### 개발 서버

```bash
pnpm dev              # 전체
pnpm dev:api          # http://localhost:3000 (docs: /docs)
pnpm dev:web          # http://localhost:5173
pnpm dev:mobile       # Expo Dev Tools
```

### 검증

```bash
pnpm build
pnpm typecheck
pnpm test
```

## 공통 모듈 흐름

1. `@repo/api-contract`에서 zod 스키마 정의
2. friendly는 동일 스키마로 자동 검증 (`fastify-type-provider-zod`)
3. web/mobile은 `@repo/shared`를 통해 동일 타입으로 fetch
4. 스키마 1개 변경 → FE/BE 모두 컴파일 타임에 불일치 감지

## 운영 작업

### Prisma 스키마 변경 후 (마이그레이션 + 클라이언트 재생성)

`@prisma/client`의 query engine DLL은 실행 중인 프로세스가 락을 잡으므로
재생성 전 dev 서버를 먼저 끕니다.

```bash
# 1) 백엔드 dev 서버 종료 (해당 터미널에서 Ctrl+C)
pnpm --filter friendly db:migrate    # schema.prisma 변경분 반영
pnpm --filter friendly db:generate   # 타입 + DLL 재생성
pnpm dev:api                         # 다시 기동
```

Windows에서 `EPERM ... query_engine-windows.dll.node` 에러가 뜨면
tsx watch가 살아 있다는 뜻입니다.

### 첫 관리자 만들기

회원가입은 항상 `role=USER`로 시작합니다. CLI로 승격:

```bash
pnpm --filter friendly promote-admin you@example.com
```

승격 후 다시 로그인하면 (JWT가 새 role을 반영) 홈에서 `/admin` 링크가
보이고, 다른 사용자의 role을 토글할 수 있습니다. admin 전용 API는
`Routes.Admin.*` (api-contract). 모바일 앱에는 admin UI가 없습니다 — 의도된 결정입니다.

## 배포

- **friendly** — Fly.io / Railway
- **web** — Vercel / Cloudflare Pages
- **mobile** — EAS Build → 스토어 배포
