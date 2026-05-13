# Codebase Wiki — Navigation Guide

이 프로젝트에는 컴파일된 지식 위키가 있다. 원시 소스 파일을 무작정 스캔하기 전에 위키를 먼저 본다.

## How to use this wiki

1. **[INDEX.md](INDEX.md)에서 시작** — 토픽 표를 훑어 관련 모듈을 찾는다 (`Also Known As` 컬럼이 별칭 검색 도움)
2. **관련 토픽 1–3개 읽기** — 단일 모듈 작업이면 1개, 횡단 작업이면 2–3개
3. **Coverage 태그 확인**
   - `[coverage: high]` — 이 섹션 신뢰, 원시 파일 안 봐도 됨
   - `[coverage: medium]` — 좋은 개요지만 코드 디테일은 원시 소스 확인
   - `[coverage: low]` — Sources에 적힌 원시 파일을 직접 읽기
4. **`concepts/` 확인** — 횡단 패턴(Zod SSOT, 공개/어드민 라우트 페어 분리, SSE 인증, UI 플랫폼 분기, workspace 패키지 해결, 스트림 캐시 머지, 인메모리 동시성 게이트, LLM 프롬프트 버전). 여러 토픽에 걸친 결정의 "왜"가 여기 있음
5. **마지막에 원시 소스** — 코드 레벨 디테일이 필요할 때만

## When NOT to use the wiki

- **새 코드 작성** — 정확한 syntax/타입은 실제 소스 파일을 본다
- **특정 함수 디버깅** — 곧장 그 파일로
- **위키 섹션이 `[coverage: low]`** — 원시 소스를 직접

## When to recompile

소스 파일이 크게 바뀌었으면 `/wiki-compile`로 재컴파일. `auto_update: prompt`라 세션 시작 시 stale 경고가 뜬다. 작은 변경(타입 1개 추가)은 재컴파일 안 해도 됨 — coverage 태그가 시그널을 줌.

## Stats

Compiled: 2026-05-14 | Topics: 13 | Concepts: 8 | Sources: 280

## Topic map at a glance

```
project-overview  (모노레포 전체 — 공개 vs 어드민 분리 정책)
├── friendly         (Fastify 백엔드)
│   ├── crawl        (Naver Place 크롤러 — 별도 토픽)
│   ├── ai           (Ollama Cloud 통합 + admin UI — 별도 토픽)
│   ├── menu-grouping (식당 단위 메뉴 변형 → canonical 그룹 LLM 정규화 — 별도 토픽)
│   └── analytics    (식당 가로지르기 글로벌 머지 + categoryPath 트리 + 통계 — 별도 토픽)
├── map              (vworld OpenLayers + WMTS 직접, MapProviderConfig DB 키, 어드민·공개 양쪽 사용)
├── web              (Vite + React 19, 어드민 + 공개 `/restaurants` + 어드민 `/admin/discover` 발견 페이지, 좌/우 패널 토글)
├── mobile           (Expo + RN 0.76, 맛집 탭 ADMIN 전용)
└── packages/
    ├── api-contract  (Zod SSOT, 공개/어드민 페어 스키마)
    ├── shared        (FE 공통, 공개 훅 `useRestaurantsPublic` 등)
    ├── utils         (순수 유틸)
    └── config        (tsconfig + ESLint)
```
