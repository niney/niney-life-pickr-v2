---
concept: SQLite 쓰기 락은 서버 전체의 예산 — 긴 쓰기를 짧은 청크와 순간 교체로 쪼갠다
last_compiled: 2026-10-10
topics_connected: [friendly, housing, life-map, meal, meal-nutrition, analytics, logs, parking, project-overview]
status: active
---

# SQLite 쓰기 락은 서버 전체의 예산 — 긴 쓰기를 짧은 청크와 순간 교체로 쪼갠다

## Pattern

이 서비스는 SQLite 파일 하나(`apps/friendly/data/dev.db`, 운영 수 GB)에 모든 도메인이 쓴다(CLAUDE.md "Docker·Redis 금지", 단일 인스턴스). WAL 이라 **읽기는 병렬이지만 쓰기 트랜잭션은 DB 전체에 하나** — 어떤 모듈이 쓰기 락을 10초 쥐면 그동안 로그인·식단 저장·작업 로그 INSERT 가 전부 줄을 선다. 성능 감사 2차(2026-10-05, [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) 4·5차)에서 이 사실이 서로 다른 여섯 도메인의 결함으로 동시에 드러났다: 집값 통계 재구축 13.5~18초, 상가 130만 행 전량 교체 36~86초(측정 349초), 식단 복원 5,000건 대화형 트랜잭션 5초 타임아웃 실패, 글로벌 머지 저장 3,000키 1.5초, 작업 로그 보존 DELETE 20만 행 1.3~2.8초, LLM 호출을 감싼 사용자 쓰기 장벽 최대 60~180초.

그리고 이 락을 기다리는 쪽의 인내심은 **연결마다 달랐다**. `plugins/prisma.ts` 가 `PRAGMA busy_timeout=30000` 을 한 번 실행했는데 PRAGMA 는 그 연결에만 걸려 풀 64연결 중 63개는 5초 만에 `database is locked` 로 포기했다(X-1). 운영의 `[operation-log] persist failed` FK 위반 229건은 이 둘의 곱이다 — 긴 쓰기가 run 행 INSERT 를 5초 넘게 막고, 실패한 run 을 참조하는 스텝 로그가 줄줄이 FK 로 떨어졌다. 고친 방식은 도메인마다 달라 보여도 원리는 하나다: **쓰기 락은 "그 작업의 비용"이 아니라 "서버 전체가 나눠 쓰는 예산"이고, 락 안에는 DB 쓰기만, 그것도 짧게 둔다.**

## Instances

- **2026-10-05** in [friendly](../topics/friendly.md) (`plugins/prisma.ts` `withSqlitePoolParams`): 기다리는 쪽을 먼저 고르게 — `DATABASE_URL` 에 `socket_timeout=30`(모든 연결의 busy_timeout 30초)·`connection_limit=12`(기본 물리코어×2+1 은 운영 4코어에서 5~9)를 없을 때만 덧붙인다. 실측 64연결 전부 30000. `synchronous` 는 URL 로 못 걸어 FULL(커밋당 +~1ms)을 받아들이고, foreign_keys PRAGMA 는 Prisma 가 연결마다 켜서 지웠다. 주석에 "쓰기 트랜잭션은 DB 전체 쓰기 락이라 본문에서 외부 호출·긴 계산을 하지 않는다" 를 규칙으로 박았다.
- **2026-10-05** in [housing](../topics/housing.md) / [life-map](../topics/life-map.md) (`lib/shadow-table.ts`, `5655abbc`·`fe0d59ab`): **섀도 표 순간 교체** — 같은 DDL 의 스테이징 표(`sqlite_master` 에서 정의·보조 인덱스 복사 → Prisma 스키마 무변경)를 짧은 청크 트랜잭션으로 채우고, 원본 `DROP` + `RENAME` + 인덱스 재생성 + 적재 이력을 한 트랜잭션으로 바꿔 끼운다. 집값 통계 쓰기 락 19초 → 교체 0.5초(덤으로 4배 빠름), 상가 349초 한 트랜잭션 → 5천 행 청크 + 교체 12초. 리뷰에서 회귀가 하나 나왔다: 스테이징 이름이 `<표>_next` 로 고정이면 cron 과 CLI 가 겹칠 때 늦게 시작한 쪽이 지우고 다시 만든 표에 먼저 쪽의 남은 INSERT 가 섞여 "성공"으로 게시된다 → 실행마다 `<표>_next_<시각36진수>_<난수>`, 시작할 때 30분 넘은 잔여물만 정리(`fe0d59ab`).
- **2026-10-05** in [meal](../topics/meal.md) (`meal-data.service.ts`, `7b060ca4`·`04dbab58`): 식단 복원을 행 단위 대화형 트랜잭션에서 **id 선생성 + `createMany` 청크**(기록 500·항목 1,500·추천 200·이벤트 5,000, 청크 사이 110ms 쉼)로. 1,000건 복원 중 다른 쓰기 대기 2,067→316ms, 5,000+1,000×5 는 타임아웃 실패 → 4.1초 성공. 청크가 먼저 커밋되고 원장이 마지막이라 생긴 "도중 종료 뒤 재시도 = 두 벌" 은 id 를 (사용자, 아카이브, ref)에서 결정해 남은 행을 지우고 다시 쓰는 것으로 풀었다(마이그레이션 없이).
- **2026-10-05** in [meal](../topics/meal.md) / [meal-nutrition](../topics/meal-nutrition.md) (`meal-mutation-barrier.ts`): SQLite 락은 아니지만 같은 원리의 **사용자 단위 쓰기 장벽** — 추천·영양 조언의 날씨·후보 계산·LLM(최대 60~180초)을 장벽 밖으로 빼고 저장 직전에만 잡는다. 같은 사용자 저장 대기 2,925→17~32ms. 삭제와의 경합은 장벽 안에서 올리는 데이터 세대 번호로 막는다.
- **2026-10-05** in [analytics](../topics/analytics.md) (`analytics.service.ts`, `622bfca2`): 글로벌 머지 저장이 값이 같은 키의 update 를 생략(머지 재저장 1,393→315ms, 다른 쓰기 대기 1,308→168ms) + 트랜잭션 `timeout`·`maxWait` 명시(몇 시간짜리 LLM 머지 결과를 저장 단계 기본 5초 타임아웃으로 버리지 않게).
- **2026-10-05** in [logs](../topics/logs.md) (`operation-log.service.ts`, `622bfca2`): 보존 정리를 한 문장 DELETE 에서 `LIMIT` 배치 + 배치 사이 쉼으로 — 한 문장 DELETE 는 지울 행 수만큼 락을 쥔다. 동시에 피해자 쪽 방어: run 행 INSERT 가 락에 밀려 실패하면 로그를 쓰지 않고 다시 만들어 보고, 끝까지 없으면 `finishRun` 이 최종 상태로 INSERT.
- **2026-10-05** in [project-overview](../topics/project-overview.md) / [parking](../topics/parking.md) (`deploy.sh`): 운영 절차 쪽 짝 — 배포 케이스 1·2·4 와 적재 케이스 6~9 의 흐름 9곳에 `analyze_db`(테이블별 `ANALYZE` 0.1~0.8초씩, housing_trades 기본 제외)를 넣어 통계 갱신 자체도 락을 쪼개 잡고, 상가 재적재 주석에 "교체 동안 서버 쓰기가 기다리므로 모든 연결 busy_timeout 30초 전제" 를 명시했다. 이후 갱신은 서버의 매일 04:30 `PRAGMA optimize=0x10002`.

## What This Means

1. **락의 길이는 작업자가 아니라 서버 전체가 낸다** — "적재는 원래 몇 분 걸린다" 는 적재 스크립트 입장의 말이고, 그 몇 분 동안 서버의 다른 모든 쓰기가 멈춘다. 그래서 질문을 바꿔야 한다: 이 작업이 얼마나 걸리느냐가 아니라 **한 번에 락을 얼마나 쥐느냐**. 답은 늘 둘 중 하나다 — 청크로 쪼개 사이사이 다른 쓰기가 끼어들게 하거나(식단 복원·작업 로그 DELETE·머지 저장), 결과를 옆에서 다 만든 뒤 순간 교체하거나(섀도 표).
2. **기다리는 쪽 설정이 연결마다 같은지 먼저 본다** — 긴 쓰기를 아무리 줄여도 일부 연결이 5초에 포기하면 무작위 실패가 남는다. PRAGMA 는 연결 단위라는 SQLite 의 성질이 풀(Prisma)과 만나면 "설정했는데 안 걸린" 상태가 된다. 연결마다 필요한 값은 URL 파라미터로. ⚠️ 이 보정은 **서버 프로세스에만** 걸렸다 — `withSqlitePoolParams` 를 쓰는 곳은 `plugins/prisma.ts` 하나이고, `apps/friendly/scripts`·`src` 의 `new PrismaClient()` 67곳(적재 CLI `load:life-stores` 포함)은 `DATABASE_URL` 그대로라 busy_timeout 5초다. 서버가 떠 있는 동안 도는 적재가 서버의 쓰기 뒤에서 5초 넘게 기다리면 적재 쪽이 `database is locked` 로 실패한다(반대 방향 — 서버가 적재를 기다리는 쪽 — 만 30초로 고쳐졌다). 운영 `.env` 의 `DATABASE_URL` 자체에 파라미터를 넣으면 양쪽이 같아진다.
3. **락 안에는 DB 쓰기만** — 외부 API·LLM·무거운 계산을 트랜잭션이나 사용자 장벽 안에서 하면 락 길이가 외부 지연에 묶인다. 밖에서 계산하고, 경합은 세대 번호·멱등 id 로 안에서 확인한다. [in-memory-singleton-gates](in-memory-singleton-gates.md) 의 "게이트는 순서와 슬롯만 책임진다" 와 같은 분리.
4. **순간 교체는 동시 실행 규칙을 바꾼다** — 한 트랜잭션 전량 교체는 겹쳐 돌아도 SQLite 가 직렬화해 줬다. 교체를 스테이징 + rename 으로 바꾸는 순간 그 보장이 사라지고, 고정 이름이 섞인 결과를 성공으로 게시하는 회귀가 생겼다. 락을 쪼갤 때는 "예전엔 무엇이 공짜로 직렬화됐나" 를 같이 옮겨야 한다.
5. **이 패턴의 한계** — 쪼갠 쓰기는 중간 상태가 보인다(복원 도중 일부 기록, 머지 도중 일부 키). 원자성이 필요한 곳은 섀도 표처럼 "교체 한 번" 으로, 그게 안 되는 곳은 멱등 재시도(식단 복원의 결정적 id)로 메운다. 둘 다 안 되면 그 작업은 서버 정지 구간(`deploy.sh` 의 `ask_stop`)에서 돈다.

## Sources

- [friendly](../topics/friendly.md)
- [housing](../topics/housing.md)
- [life-map](../topics/life-map.md)
- [meal](../topics/meal.md)
- [meal-nutrition](../topics/meal-nutrition.md)
- [analytics](../topics/analytics.md)
- [logs](../topics/logs.md)
- [parking](../topics/parking.md)
- [project-overview](../topics/project-overview.md)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md)
- [apps/friendly/src/plugins/prisma.ts](../../apps/friendly/src/plugins/prisma.ts)
- [apps/friendly/src/lib/shadow-table.ts](../../apps/friendly/src/lib/shadow-table.ts)
- [deploy.sh](../../deploy.sh)
- [in-memory-singleton-gates](in-memory-singleton-gates.md)
- [open-data-master-load](open-data-master-load.md)
