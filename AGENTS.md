# AGENTS.md

코딩 에이전트(Claude Code, Codex, Cursor 등)를 위한 진입 가이드.

## 먼저 위키를 읽는다

이 프로젝트에는 컴파일된 지식 위키가 있다. 원시 파일을 무작정 스캔하기 전에:

1. **[niney-life-pickr-v2-wiki/CONTEXT.md](niney-life-pickr-v2-wiki/CONTEXT.md)** — 위키 사용법
2. **[niney-life-pickr-v2-wiki/INDEX.md](niney-life-pickr-v2-wiki/INDEX.md)** — 토픽 표 (작업 영역 기준 진입점 선택)
3. **[niney-life-pickr-v2-wiki/schema.md](niney-life-pickr-v2-wiki/schema.md)** — 토픽/컨셉 명명 규약
4. 관련 **[niney-life-pickr-v2-wiki/topics/*.md](niney-life-pickr-v2-wiki/topics/)** 1–3개 — coverage 태그가 high이면 신뢰
5. **[niney-life-pickr-v2-wiki/concepts/*.md](niney-life-pickr-v2-wiki/concepts/)** — 횡단 패턴 (Zod SSOT, SSE 인증, UI 플랫폼 분기)

원시 소스는 토픽이 `[coverage: low]`이거나 코드 디테일이 필요할 때만.

## 위키가 stale일 때

소스 파일이 크게 바뀌었으면 `/wiki-compile`로 재컴파일. `auto_update: prompt` 설정이라 세션 시작 시 stale 경고가 뜬다.

## 프로젝트 규칙

규칙·결정·금지사항은 **[CLAUDE.md](CLAUDE.md)** 가 출처.
