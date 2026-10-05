# 성능 감사 2차 계획 — 운영 증거 + 전수 감사 기반 9개 차수 (perf-2)

> 2026-10-05 작성. 커밋 여부는 사용자 지시에 따름(작성 시점 untracked).
> 범위: **friendly 서버만**, 성능 + 성능성 DoS(무인증·저비용 호출로 CPU·DB·메모리·외부 쿼터·LLM 을 태우는 경로).
> 순수 보안은 제외. 직전 감사 [PLAN-perf-security.md](PLAN-perf-security.md)(2026-07-13, `bc2db00`)의 확정 항목은
> 재보고하지 않았다. 발견 81건의 측정·수정 원문은 부록 [PLAN-perf-2-findings.md](PLAN-perf-2-findings.md).
> 계획 시점의 기록이며, 이후 실제 진행은 커밋 이력이 진실이다.

## Context

직전 감사 뒤 friendly 에 132커밋(src +79k줄)이 들어가 신규·대폭 확장 모듈이 20개 안팎이고, dev.db 는 26MB → 3.6GB 가
됐다. 이번 감사는 두 축의 증거를 합쳤다.

1. **운영 로그**(ninelife.kr pm2, 2026-05-12~10-04 요청 10.4만 건 + pm2 이벤트 3주) — 실제로 무엇이 느리고 무엇이
   프로세스를 죽이는지.
2. **멀티에이전트 전수 감사** — 도메인 7묶음 + 플랫폼 교차 1묶음 스캐너 8 → 묶음별 적대적 검증 8. dev.db 복사본
   (bench.db)과 운영형으로 부풀린 전용 사본에서 실측. 확정 74 · 추정 7 · 반박 2.

**검증 규약(모든 차수 공통)**: 차수 완료 시 `pnpm typecheck` + `pnpm --filter friendly test` + 영향 플로우 실구동 +
**전후 수치**(bench 하네스 `apps/friendly/data/perf2/harness.ts` — gitignore, 로컬 전용). 메모리 항목은 동시 부하
RSS 피크·GC 후 잔존을 함께 잰다. 커밋은 사용자가 "커밋"이라 명시할 때만.

**프로젝트 제약**: Redis·Docker 금지 → 캐시는 프로세스 내 `lru-cache`(이미 의존성), 공유 스키마 변경은
`@repo/api-contract` zod 에서, 비-어드민 라우트를 바꾸면 `export:openapi` 재생성.

---

## 운영 증거 (가장 강한 근거)

### 메모리 초과 강제 재시작 — 3주(9/13~10/4) 90회

| 항목 | 값 |
|---|---|
| pm2 `max_memory_restart` 실제값 | **1,500MiB**(배포 문서의 500M 과 다름) |
| 재시작 직전 메모리 | 1.5~2.1GB |
| 재시작 전 가동 시간 | 중앙값 **0.4시간**, p75 3시간 |
| 일별 | 9/24 12회 · 9/25 12회 · **9/26 27회** · 9/27 14회 · 9/28 10회 → 9/29 이후 하루 약 1회 |
| 현재 | 가동 15시간에 RSS 726MB, 누적 재시작 91 |
| 서버 | 4코어, RAM 15.9GB, **swap 4.2GB 가득 참** |

재시작 직전 15분 창을 맞춰 본 결과(`.tmp/perf-logs/analysis/restart-windows.txt`):

- **9/27 12:54~13:12 — 1.5~2분 간격으로 10회 재시작, 그 창들의 요청은 거의 전부 `GET /restaurants/public`**
  (13:02 이후 창은 100% — 재시작 → 클라이언트 재요청 → 다시 초과의 루프로 보인다). 요청 10건 미만인데 재시작된
  창(9/22·9/29·10/2·10/3)도 마지막 요청은 공개 목록·랭킹이었다.
- 공개 상세(`/restaurants/public/:id`·`insights`) 몰림, 썸네일·파노라마 폭주(9/24 11:23 — 15분에 썸네일 541·파노라마 67건
  → 2,017MB) 직후 재시작도 반복.
- **03:00 정각 재시작 3회(9/26·9/28·10/1), 그중 9/28·10/1 은 직전 15분 요청 0건** — `schedule.service.ts` 기본 cron
  `0 3 * * *`(정규화 → 글로벌 머지)이 유력.

재시작은 진행 중 크롤·요약·머지를 끊는다(로그 전체 기간에 `server_restart` 재스케줄 163회, 메모리
`project_update_mode_gap_after_restart` 의 거짓 완료도 같은 뿌리). 즉 **메모리는 성능 문제이자 데이터 품질 문제다.**

### 느린 공개 경로 (9월 이후)

| 경로 | 호출 | p50 | p95 | 비고 |
|---|---|---|---|---|
| `GET /restaurants/public` | 759 | **3,897ms** | 5,312ms | 전체 기간 p50 744ms → 데이터가 늘며 악화 |
| `GET /restaurants/ranking` | 220 | 331ms | 3,735ms | |
| `GET /media/thumbnail` | 4,608 | 175ms | 977ms | 전체 5xx 104건 |
| `GET /air/stations/nearby` | 321 | 1,541ms | 20,023ms | 업스트림 20초 타임아웃까지 대기, 5xx 25 |
| `GET /weather/aws` | 71 | 690ms | 40,706ms | |
| `GET /tour/public/insights` | 22 | 1,007ms | 1,217ms | |
| `GET /housing/status` | 28 | 278ms | 639ms | 무인증, 요청마다 COUNT 풀스캔 |

### 감사 범위 밖이지만 로그에서 나온 결함

- `[operation-log] persist failed` FK 위반 — 최근 stderr 3,000줄 중 229건(10/4 03:03 몰림). 없는 run 을 참조하는 로그 쓰기.
- `Attempted to send payload of invalid type 'object'` 108건과 `thumbnail proxy failed` 108건이 같은 수로 함께 발생 — 썸네일
  실패 경로가 객체를 send 하는 것으로 보인다(썸네일 5xx 104건).
- (해소됨) `prisma.llmProviderConfig.upsert()` 124건은 전부 5/23 하루 — `purpose` 컬럼 마이그레이션 전에 코드가 배포된 일회성 사고.
- 텔레그램 `getUpdates` `fetch failed` 2초 재시도 155,026건 — 6/27~7/17 집중(7/15~17 하루 3.7만), 이후 산발.
- `[summary] all retries exhausted` 1,617건, `[global-merge] chunk failed` 1,645건 — LLM 타임아웃 계열.

### 측정 환경의 한계 (해석 주의)

- **dev.db 는 운영보다 맛집이 훨씬 적다**: 네이버 맛집 23곳, 리뷰 요약 6,238행, **임베딩 0건**. 운영은 요약 종료 훅이
  모든 done 요약에 bge-m3 임베딩(~12.8KB)을 붙인다. 그래서 B 묶음은 ×10 복제 + 전 요약 임베딩 사본(맛집 230·요약 6.2만,
  임베딩 749MB)에서 다시 쟀다. **운영 DB 행 수는 사용자에게 받는 중**(받으면 1차 수치 보정).
- Windows 개발기에서 다른 에이전트 15개와 동시에 쟀다 — 절대 시간은 흔들리고 EXPLAIN·쿼리 수·바이트·RSS 가 더 믿을 만하다.
  glibc(운영 Linux)의 RSS 부유·스레드 arena 는 재지 못했다.
- 하네스의 이벤트 루프 최대지연이 마지막 동기 블록을 놓치던 결함은 감사 후 고쳤다(측정 끝에 50ms 대기).

---

# 차수 (권장 순서 = 번호 순)

## 1차 — 공개 맛집 경로의 전량 로드 제거 [P0 · 운영 재시작 주범]

운영 재시작 창과 가장 강하게 겹치는 경로. 공통 원인은 **요청마다 전 가게·전 리뷰 요약을 Prisma 관계 select 로 읽어
JS 에서 집계**하는 것이고, 운영에는 요약마다 임베딩이 붙어 행이 무겁다.

**대상 발견**
- **B-1 (HIGH)** `restaurant.service.ts:1360·1507` `getPublicList` — 네이버 맛집 전부 + `snapshotJson` 원문 파싱 + 리뷰 요약
  전 행 관계 select. 운영형 사본: 서비스 1,404ms/68쿼리, **동시 10×30 RSS 피크 2,162MB**(끝난 뒤 780MB), 순차 10회만으로 +105MB.
  SQL 집계로 바꾸면 같은 부하 피크 174MB.
- **B-2 (HIGH)** 무인증 스마트픽 — 전 가게 done 요약 관계 select, 운영형 1.1~1.4s, 동시 10×30 피크 1,558MB.
- **B-3 (HIGH)** 공개 상세·리뷰 페이지 — `include: { summary: true }` 로 리뷰마다 `embeddingJson`(~14KB)까지 로드.
  1,032건 가게 응답은 58KB인데 DB→JS 15.3MB, 동시 10×30 피크 1,852MB / 순차 20회 +220MB.
- B-5 (MEDIUM) 공개 랭킹 캐시 키에 `minMentions`(0~1000)가 그대로 → 4,004키 우회·상주.
- B-6 (LOW) 군집 `countEnrichedByRestaurant` 관계 select(직전 감사가 고친 쌍둥이의 미수정본).
- A-V2 (LOW→운영 근거로 상향) `getRestaurantsStatus` — done 요약 전부 관계 select. **매일 03:00 스케줄 경로**.

**수정**
- `getPublicList`: 3출처 합산 집계를 어드민 `list()` 식 **SQL 집계 1쿼리**로. 필터 전 베이스(가게 행 + 좌표·썸네일 파싱 결과
  + 집계 + tour)를 **TTL 30~60초 캐시 + in-flight 합류**로 두고, q/category/bbox/정렬/페이지는 메모리에서(SQLite LIKE 의
  ASCII 대소문자 무시 의미를 맞출 것). 크롤 upsert·merge 때만 무효화(요약 이벤트 버스는 청크마다 발행해 무효화 트리거로 부적합).
- 커버링 인덱스 2개: `review_summaries(reviewId, status, sentiment, sentimentScore, satisfactionScore)` 3.6MB,
  `visitor_reviews(restaurantId, id)` 3.9MB(각 생성 ~120ms/6만 행, 백필 없음). 플래너가 unique 인덱스를 고르므로 공개 목록
  쪽은 `INDEXED BY` 필요(스마트픽은 `status='done'` 조건으로 자동 선택).
- 스마트픽은 위 집계 캐시를 재사용(가중 추첨만 ~1ms). `RATE.publicPick` 주석도 실제 비용대로.
- 공개·어드민 상세의 `summary` 를 9컬럼 select 로(`toPublicReview` 호환). raw 2.4배·RSS 1/4.
- 랭킹: GROUP BY 결과 + 가게 메타만 단일 키 60초 캐시, minMentions·excludeNeutral·sort 는 메모리 필터.
- `countEnrichedByRestaurant`·`getRestaurantsStatus` 를 review-search 의 groupBy 헬퍼 / SQL GROUP BY 로.
- **DEFERRED #4 재평가 결론: 비정규화·스키마 변경 없이 해결된다.**

**결정 필요**: 공개 목록 캐시 TTL(30~60초 지연 허용 여부 — 어드민 발견 페이지는 SSE 패치로 보완), 커버링 인덱스 마이그레이션.

**검증**: 운영형 사본(×10 + 임베딩)에서 전후 지연·동시 10×30 RSS 피크, 응답 스냅샷 동일성(정렬·카운트), 기존 restaurant
테스트. 배포 후 운영 pm2 재시작 횟수·`/restaurants/public` p50 재측정.

## 2차 — 메모리 상한: 무제한 캐시·셀 폭증·큰 응답 [P0]

부팅 RSS 235~330MB 에서 무인증 요청 1~3개로 600MB 를 넘는 경로가 여럿이다(X-3). 1차가 주범을 없애도 이것들이 남으면
재시작이 계속된다.

**대상 발견**
- D-1 (HIGH) 일상지도 셀 모드 `zoom 22 + 넓은 bbox` → 셀 25만 개·14MB 응답, RSS 234→532MB, 크기 상한 없는 LRU 에 잔존.
- E-V1 (HIGH) 주차장·충전소 셀 같은 패턴 — 무인증 수십 요청으로 재시작.
- D-2 (HIGH) 여행 인사이트·지역 비교 `region=all` 이 원시 행 수십만 개를 JS 집계 — RSS +407MB, 캐시 키 무한.
- E-3 (HIGH) 대기 측정소 시계열 캐시가 원본 2,200행(엔트리 ~1.5MB)을 상한 없는 Map 에.
- E-4 (HIGH) 날씨 캐시 Map 상한 없음(단기 엔트리 ~40KB × 격자 3.7만).
- G-V1 (HIGH) 정산 임시저장 목록이 payload 전체를 매번 — 응답 30MB, 동시 4건 RSS 833MB.
- C-1 (HIGH) 식단 사진 백업/복원 50MB 를 JSON+base64 한 덩어리 — 요청 1건 RSS +417~523MB.
- C-4 (HIGH) 식단 기록 상한 없음 + export·통계가 범위 행 전부 로드(1만 건 export RSS +381MB).
- B-8·A-1·E-6·F-3·X-4 (MEDIUM) 개수 기준·무청소 캐시(질문 코퍼스, 크롤 결과, 물때, 공유 PNG 5종 최악 ~217MB).
- X-3 (HIGH) 기저 메모리 — playwright·playwright-extra·satori·sharp·heic-convert 정적 import(단독 import 합 약 +100MB,
  dynamic import 로 바꾸면 기저 약 −70MB·부팅 약 −0.6초로 검증자 추정).
- F-V1 (MEDIUM) resvg 네이티브 메모리가 GC 전까지 부유.

**수정**
- 모든 캐시를 `lru-cache` 의 `maxSize + sizeCalculation(+ttl)` 로(바이트 상한). 대기 시계열은 서빙 형태로 접어 저장(1.5MB→18KB).
- 셀 모드: 스냅된 bbox 의 열×행이 상한(예 4,000)을 넘으면 셀을 키운다(정상 대형 화면은 유지), GROUP BY 에 LIMIT + truncated,
  좌표 범위 검증. housing·life-map·parking 공용 헬퍼로.
- 여행 인사이트: in-flight 합류 + 콜드 계산 세마포어(동시 1~2) + accompany 허용목록 + 적재 sync id 기반 TTL, spend 조회 지역 조건.
- 정산 임시저장 목록은 메타만, 이어쓰기는 단건 GET(라우트 추가), 바이트 기준 크기 검사.
- 식단 백업·복원: 응답 스키마의 base64 정규식 제거, 크기 검사를 길이 합 추정으로, 전역 동시 1건, 사진 합계 상한 하향. 근본은
  사진을 파일 단위 스트리밍. 기록 상한(사용자·일)과 export 상한/스트리밍.
- 무거운 의존성은 사용 시점 dynamic import.
- 노드 플래그(`--max-old-space-size`)·`max_memory_restart` 값은 **1·2차 배포 후 운영 RSS 를 보고** 정한다(지금 올리는 건 증상 가리기).

**결정 필요**: 식단 기록 상한(예 사용자 20,000·하루 30끼), 백업 사진 합계(50MB→20~25MB), 셀 상한 방식(키우기 vs 400).

**검증**: 각 경로 단독·동시 RSS 피크/GC 후 잔존, 캐시 포화 시 상한 유지, 셀 응답이 정상 화면에서 동일.

## 3차 — 이벤트 루프 블로킹: 공유 이미지 렌더·HEIC [P1]

**대상 발견**
- X-V1·F-2·G-2 (HIGH) 공유 PNG 캐시 미스 렌더가 이벤트 루프를 0.3~0.7초 점유 — resvg 생성자가 렌더마다 시스템 폰트를
  적재(188~283ms)하고 `render()` 가 동기.
- F-V2 (HIGH) 정산 공유 카드가 입력 크기(참여자 ≤100·차수 ≤10) 그대로 렌더 — 최대 입력 미스 1회 5.3초 블로킹·RSS +770MB.
- C-6 (HIGH)·G-3 일부 — 식단 사진·정산 영수증 HEIC 를 `heic-convert`(순수 JS)로 요청 스레드에서 디코드: 12MP 1~1.15초 블로킹.
  sharp 프리빌드는 HEIC 디코드 실패. (직전 감사 DEFERRED #14 의 새 경로)
- D-V1 (MEDIUM) 집값 점 모드가 단지마다 침수 반경 계산 — 서울 z13 요청 1건 ~0.1초.
- F-7·X-6·G-5·B-7 (LOW) 사주(G) no-store, 큰 지도 응답의 zod 복사 검증(+3~16ms), bcryptjs 52ms, 군집 JSON 왕복.

**수정**
- `new Resvg(svg, { font: { loadSystemFonts: false } })` — satori 가 글자를 path 로 넣어 결과 픽셀 동일(실측), 1줄.
- `render()` → `renderAsync()`(설치된 2.6.2 에 있음, libuv 스레드풀) + 렌더 동시 1~2 세마포어 + token:format in-flight 합류.
  worker_threads 보다 훨씬 작은 변경.
- 정산 카드 표에 상한(상위 N명 + '외 n명', 큰 정산은 og:image 를 기본 이미지로).
- 불변 공유(타로·사주) PNG 는 긴 `Cache-Control` → Cloudflare 엣지가 원 렌더 자체를 줄인다.
- HEIC: 공식 클라이언트는 JPEG 를 보내므로 서버 415 거부가 가장 싸다. 계속 받으려면 해상도 선검사 + 단명 worker + 동시 1.
- 침수 개수는 sync id 단위 메모이즈.

**결정 필요**: HEIC 거부(415) vs worker 디코드 유지, og/story 를 JPEG·WebP 로 바꿀지(5~6배 작아짐, 카카오·트위터 호환 확인).

**검증**: 렌더 픽셀 동일(스냅샷), 미스 시 이벤트 루프 최대지연, 공유 링크 OG 실기 확인.

## 4차 — SQLite 연결·플래너·인덱스 [P1]

**대상 발견**
- **X-1 (MEDIUM, 선행 필수)** `plugins/prisma.ts` 의 `busy_timeout=30000`·`synchronous=NORMAL` 이 **풀의 첫 연결에만** 걸림.
  나머지 연결은 5초·FULL → 5초 넘는 쓰기 락 동안 요청 쓰기가 `database is locked`(실측 6/6 실패 → `socket_timeout=30` 이면 16/16 성공).
- X-V2 (MEDIUM) 풀 크기 미지정(기본 물리코어×2+1 — 운영 nproc 4 라 물리 코어 수에 따라 5~9).
- **X-2 (HIGH)** `sqlite_stat1` 없음 — 플래너가 저선택도 인덱스를 고름. 같은 파일에서 통계만 넣으면 집값 points 강남 155→4.2ms,
  cells 295→29ms, nearby 139→1.3ms, status 485~631→78ms(라우트). 전체 ANALYZE 5~6초(housing_trades 4.2초).
- D-5·D-6·D-7 (HIGH/MEDIUM) 집값: kind 단일값 인덱스 오선택, 무인증 `/housing/status` COUNT 풀스캔 5회(674ms, 캐시·프리셋 없음),
  점 모드 bbox 상한이 줌과 무관 + Prisma `take` 가 ORDER BY id 를 붙여 범위 행 전부 정렬.
- E-5·E-9·E-10 충전소 필터가 커버링 인덱스를 잃음(560ms), 주차 status MAX 집계, 충전소 nearby 과다 로드.
- C-V1 (MEDIUM) 최근 섭취 조회가 전 사용자 공통 nameNorm 인덱스에서 시작.
- X-8·D-11·D-8·D-V2·A-V3 (LOW) 미사용 인덱스(LifeStore lat_lng 36MB), 단지명 LIKE, 여행 밀도 캐시 키, 어드민 N+1.

**수정**
- `plugins/prisma.ts` 에서 `datasourceUrl` 에 `socket_timeout=30`·`connection_limit` 명시(없을 때만 덧붙임). synchronous 는
  URL 로 못 거니 FULL 을 받아들이고(커밋당 +~1ms) 주석·문서를 사실대로. "인터랙티브 tx = 전역 쓰기 락" 규칙 문서화.
- 통계: 적재 뒤 테이블별 `ANALYZE`(각 0.1~0.8초) 또는 정지 구간 전체 ANALYZE 를 `deploy.sh` 에. 기본 `PRAGMA optimize`(2000행
  한도)는 kind 를 오추정해 효과가 없다 — `PRAGMA optimize=0x10002`(SQLite 3.46+) 또는 명시 ANALYZE. 코드 방어로 집값 원시 SQL 에
  `INDEXED BY housing_complexes_lat_lng_idx`(인덱스명 테스트로 고정).
- `/housing/status`: 적재 sync id 키 캐시 + COUNT 단일 스캔 + `RATE.housingRead`.
- 점 모드: 커버링 COUNT 후 상한 초과면 셀 모드로 강등, 줌 연동 폭 상한(ORDER BY id 제거는 표본 편향이 생겨 비권장).
- 충전소 `(lat, lng, availableCount, hasFast, parkingFree, limited)` 커버링 인덱스로 기존 (lat,lng) 대체(3.05MB, 생성 0.17초).
- 최근 섭취: 사용자 기록에서 시작하는 쿼리 + `@@index([nameNorm, entryId])` 교체.

**결정 필요**: ANALYZE 운영 적용 방식(서버 sqlite3 버전 확인 필요), 인덱스 마이그레이션 묶음(충전소·식단·LifeStore 제거).

**검증**: 통계 유무에서 핫 쿼리 EXPLAIN·시간, 동시 쓰기 중 요청 쓰기 성공률(8초 락 프로브), 기존 테스트.

## 5차 — 쓰기 락 장기 점유 [P1]

**대상 발견**
- D-4·X-5 (HIGH/MEDIUM) 집값 통계 재구축이 한 트랜잭션에서 31만 행 삭제·재삽입 — **쓰기 락 13.5~18초**, 앞단 집계 253초를 서버
  프로세스에서(RSS +283MB).
- X-V3 (MEDIUM) 배포 중 상가 130만 행 전량 교체가 서버 가동 중 한 트랜잭션 — 쓰기 락 36~86초(30초 busy 로도 못 버팀).
- C-2 (HIGH) 식단 복원이 수천 건을 행 단위로 한 대화형 트랜잭션에 — 1,000건 락 1.4초, 계약 상한 5,000건은 5초 타임아웃 실패.
- G-4 (LOW) 글로벌 머지 저장이 키마다 update — 3,000키 1.5초 락(같은 값이면 생략하면 65ms).
- C-V2 (MEDIUM) 추천·영양 조언의 날씨·LLM 호출이 사용자 쓰기 장벽 안 — 같은 사용자 저장이 LLM 완료(최대 60~180초)까지 대기.
- G-3 일부 — 작업 로그 보존 정리 DELETE 를 배치로.

**수정**
- 집값 통계: 섀도 테이블(같은 DDL)을 짧은 청크로 채우고 `DROP + RENAME` 한 트랜잭션 교체(락 18초 → 청크당 ≤0.16초 + 교체 0.05초,
  덤으로 4배 빠름). 크론은 03:00·04:00 피해 새벽 고정.
- 상가 재적재는 `deploy.sh` 의 정지 구간에서만, 또는 스테이징 청크 + rename swap. 미사용 lat_lng 인덱스 제거로 교체 시간 절반.
- 식단 복원: id 선생성 + `createMany` 500건 청크(1,000건 310ms, 최대 청크 158ms) — 멱등성·부분 실패 정리 설계 필요.
- 머지 저장은 변경분만. LLM 호출은 장벽 밖, 저장 직전에만 장벽 + 사용자별 데이터 세대 번호로 삭제 경합 방지.

**결정 필요**: 집값 통계 스테이징 테이블(마이그레이션 1건 또는 DROP IF EXISTS 로 drift 회피), 식단 복원 원장 status 컬럼 추가 여부.

**검증**: 재구축·복원 중 50ms 간격 INSERT 프로브 최대 대기, 결과 행 동일성.

## 6차 — 외부 API 쿼터·지연 방어 [P1 · 성능성 DoS]

운영 p95 20~40초(대기·날씨)는 업스트림 타임아웃을 그대로 기다린 결과다. 무인증으로 공유 일일 쿼터를 싸게 태우는 경로도 남아 있다.

**대상 발견**
- E-1 (HIGH) 버스 노선상세·정류장검색이 프리셋 없이 공유 쿼터(900) 소비 — 무인증 300회로 전 사용자 실시간 정지.
- E-2 (HIGH) 대기 시계열 임의 측정소명·예보 임의 날짜 — 무인증 150회(약 2.5분)로 대기정보 전체 503.
- E-4 (HIGH) 중기 구역 임의값으로 날씨 쿼터(9,000) 고갈.
- E-6·E-7·E-8 (MEDIUM) 물때 날짜 무제한·쿼터 카운터 없음, 지하철 역명 순회로 IP 1개가 15분에 소진, 대기 정상 갱신만으로 450 중 388(24시간 시뮬레이션).
- E-V2 (MEDIUM) 업스트림 실패에 쿨다운 없음 — 짧은 장애가 자정까지의 503 으로 번짐.
- C-5 (MEDIUM) 추천 라우트가 WeatherService 를 따로 생성(캐시·쿼터 분리, 합계 18,000 허용).
- D-9 (MEDIUM, 추정) VWorld 지역 검색 — 고유 검색어마다 2~4콜, 전역 일일 상한 없음.
- A-8·G-6 (LOW) HTTP 어댑터가 signal 을 받으면 자체 타임아웃을 끔(undici 기본 ~300초), 텔레그램 롱폴·송신 타임아웃 없음.

**수정**
- 쿼터를 업스트림 서비스·오퍼레이션별로 분리(남용한 기능만 멈춤), 재시도도 카운트.
- 입력 화이트리스트: 대기 측정소명(측정소 목록·전국 실시간 이름 합집합), 날씨 중기 구역(utils 지점표), 날짜 범위 clamp — 가짜 입력은 쿼터 0.
- '노선 없음' 네거티브 캐시 24h + in-flight 합류. 실패 쿨다운(30초→5분 백오프) 동안 stale/503, 쿼터 0.
- 업스트림 타임아웃 단축 + last-known stale 응답(운영 p95 20~40초 해소). 대기 TTL 을 발표 주기 기준으로(공용 키 388→~150/일).
- WeatherService 를 `app.weather` 단일 인스턴스로, 추천은 캐시만 보는 peek. VWorld 검색 in-flight + 전역 일일 예산.
- `AbortSignal.any([signal, AbortSignal.timeout(…)])` 로 외부 취소·타임아웃 합성. 텔레그램 롱폴 타임아웃 + 지수 백오프.

**결정 필요**: 서비스별 쿼터 배분 수치, 업스트림 타임아웃 값.

**검증**: 스텁 시뮬레이션(가짜 입력 N회 → 쿼터 0), 장애 주입 시 쿨다운·stale, 정상 화면 회귀 없음.

## 7차 — LLM·공유·투표·업로드 남용 상한 [P2 · 성능성 DoS]

**대상 발견**
- B-4 (HIGH) 공개 리뷰 질문 — 일일·전역 LLM 한도와 답변 캐시 없음(IP당 분당 15회 × LLM 3콜).
- G-1 (HIGH) 무인증 썸네일 프록시 캐시 버스팅(w·q 조합) — 디스크 무한·업스트림·sharp CPU. 동시 미스가 반쯤 쓴 JPEG 를 덮어쓰는 경합도.
- G-3 (HIGH) 영수증 업로드·추출에 레이트리밋·일일 한도·보존 정리 없음.
- F-5 (HIGH) 투표 세션 표 상한 없음 — voterKey 회전으로 무한 적재, 5만 명이면 조회 1회 4.3초·블로킹 ~1초.
- C-3 (MEDIUM) 공개 menu-nutrition 이 판정 못 한 메뉴로 백그라운드 LLM·웹 조회를 무제한 병렬 기동, 실패 이름 재호출.
- F-4 (MEDIUM) 회원은 IP·개인 일일 한도 면제 — 무료 계정 하나로 LLM 전역 예산을 소진해 게스트를 폴백으로 밀어냄.
- F-6 (MEDIUM) 게스트 공유 발급마다 새 행(사주 ~7KB) — 중복 제거·보존 없음.
- X-V4 (MEDIUM, 추정) 레이트리밋 키가 클라이언트가 보낸 `CF-Connecting-IP` 를 신뢰 — 원본 직접 접근 시 IP 한도 무력화.

**수정**
- 공개 질문: `UsageQuotaFeature` 에 `review-ask`(마이그레이션 없음) + 타로식 게스트·IP·전역 일일 한도, 답변 LRU 10~30분 + in-flight.
- 썸네일: w·q 를 버킷으로 스냅(앱의 240·400·900 포함 — 400 으로 거부하면 앱이 깨짐), 키별 in-flight + 전역 미스 동시성 상한,
  디스크 용량 상한 정리, tmp→rename 원자 쓰기.
- 영수증: 업로드·추출 프리셋 + 추출 일일 한도 + 미참조 N일 정리.
- 투표: 세션당 투표자 상한(예 100명, 409), 검증은 경량 조회, 응답은 후보별 count + 앞 N명.
- menu-nutrition: 백그라운드 체인 전역 세마포어 1~2 + 실패 이름 네거티브 캐시.
- 게스트 공유: (ip|guestKey, 입력 해시) → 토큰 메모리 재사용 + IP 일일 상한.
- nginx: Cloudflare 대역만 허용 또는 `set_real_ip_from` + `real_ip_header CF-Connecting-IP` 로 확정 후 덮어쓰기(서버 작업).

**결정 필요**: 회원 LLM 무제한(2026-09-02 결정) 재확인, 투표자 상한 수치, 게스트 공유 보존 정책, 썸네일 버킷.

**검증**: 한도 초과 429/409, 정상 사용 흐름(웹·앱) 회귀 없음, 썸네일 앱 크기 정상.

## 8차 — 백그라운드 작업 구조 정리 + 로그 결함 [P2]

**대상 발견**
- A-1·A-3·A-V1 `CrawlService` 를 4곳에서 따로 조립 — 결과 캐시 4벌(무청소, 가게당 0.18~0.35MB 상주), 요약·검색 서비스 배선 분리
  (재시작 후 군집화 누락), 대기열이 인스턴스마다 따로라 자동 발견 잡 무한 대기.
- G-V2 글로벌 머지 상호배제가 인스턴스 필드인데 `AnalyticsService` 가 둘 — 수동·스케줄 머지 동시 실행.
- A-6·A-7·A-2·A-4 테이블링 bulk-save·메뉴 그룹핑 상호배제 없음, Chromium 3개 상주·크래시 후 미재생성, 페이지네이션 원본 2벌 보관,
  잡 목록이 완료 잡 result.data 통째로(웹 8초 폴링).
- 로그 결함 2종: operation-log FK 위반, 썸네일 실패 경로 객체 send.

**수정**: `CrawlService`·`AnalyticsService` 를 플러그인에서 app 싱글톤으로 decorate(A-1·A-3·A-V1·G-V2 를 한 번에), 잡 상호배제 가드,
브라우저 `disconnected` 재생성·idle 종료, 원본 1벌, 목록 응답 경량화. 로그 결함은 원인 확인 후 수정.

**검증**: 싱글톤 동일성 테스트, 동시 잡 409, 썸네일 업스트림 실패 시 5xx 대신 정상 오류 응답.

## 9차 — 운영·관측·캐시 헤더·문서 [P3]

- X-7 요청 로그 2줄/요청을 끄고 5xx·느린 요청(>500ms)만 기록 — 느린 요청 가시성 확보. pm2-logrotate 설정(운영 로그 5개월치 누적).
- B-9·D-10·C-7 공개 GET(맛집·랭킹·여행·범죄·status)에 `public, max-age, s-maxage, stale-while-revalidate` + Cloudflare Cache Rule
  (JSON 은 기본 미캐시 — 대시보드 작업), 영양 점검 카탈로그 파생 목록 메모이즈.
- 운영 메모리 관측: 주기 RSS·heap 로그(재시작 원인 추적용), Linux 할당자(`MALLOC_ARENA_MAX=2` 또는 jemalloc) 시험 — sharp·resvg
  네이티브 메모리의 glibc 부유가 개발기에서 재현되지 않으므로 운영에서 전후 비교.
- `docs/deploy-friendly.md` 정정: 로그 경로(`/home/samplepcb/niney-life-pickr-v2/log/out-3.log`), `max_memory_restart` 실제값,
  `plugins/prisma.ts` PRAGMA 서술, ANALYZE 단계, 상가 재적재 절차.

---

## 결정이 필요한 것 (모아 보기)

| # | 결정 | 차수 | 기본 제안 |
|---|---|---|---|
| 1 | 공개 맛집 목록 캐시 TTL(데이터 반영 지연) | 1 | 30~60초 |
| 2 | 커버링 인덱스 마이그레이션(요약·리뷰 2개) | 1 | 진행(백필 없음) |
| 3 | 식단 기록 상한·백업 사진 합계 | 2 | 사용자 20,000·하루 30끼 / 20~25MB |
| 4 | HEIC 처리(식단·영수증) | 3 | 서버 415 거부 |
| 5 | 공유 이미지 JPEG·WebP 전환 | 3 | 호환 확인 후 |
| 6 | ANALYZE 운영 적용 방식 | 4 | deploy.sh 테이블별 |
| 7 | 집값 통계 스테이징 테이블 | 5 | 진행 |
| 8 | 회원 LLM 무제한 정책 재확인 | 7 | 회원 일일 상한 도입 |
| 9 | 투표자 상한·게스트 공유 보존 | 7 | 100명 / 메모리 재사용만 |
| 10 | 노드 플래그·`max_memory_restart` 값 | 2 이후 | 1·2차 배포 후 운영 RSS 로 결정 |

## 운영에서 받을 것

- **운영 DB 행 수**(요청 중) — 맛집·리뷰·요약·임베딩 규모로 1차 수치 보정.
- 서버 `sqlite3` 버전(ANALYZE 방식), `ps aux --sort=-rss | head` (swap 가득 참의 주인 확인).
- 1·2차 배포 후 pm2 재시작 횟수·RSS 추이, `/restaurants/public` p50.

## 재현 자료 (로컬, gitignore)

- 측정 하네스·스크립트: `apps/friendly/data/perf2/`(묶음별 폴더, `lead/` 는 운영 재현), bench.db 는 dev.db `.backup` 복사본.
- 운영 로그 분석: `.tmp/perf-logs/analysis/`(report·memory-restarts·restart-windows·warn-samples).
- 감사 원본: `apps/friendly/data/perf2/lead/audit-raw.json`·`audit-findings.json`.

---

## 진행 로그 (워크트리 `perf/audit-2`, 미커밋)

사용자 지시(2026-10-05): "결정할 일이 생기더라도 워크트리를 만들어 할 수 있는 부분은 끝까지 진행". 결정 표의 기본 제안을
따르고, 바꾼 결정은 아래에 근거와 함께 남긴다. 측정은 `apps/friendly/data/perf2/` 하네스(gitignore)로 했다.

### 1차 완료 — 공개 맛집 경로의 전량 로드 제거

- 신규 `restaurant/restaurant-public-base.ts`: 가게별 요약 집계(`aggregateSummaryBuckets`, GROUP BY 1회·커버링 인덱스
  `INDEXED BY` + 인덱스 없으면 폴백)와 공개 베이스 캐시(네이버 가게 + 형제 합산 + 여행로그, snapshot 은 SQLite
  `json_extract` 로 4개 값만). TTL 30초 stale-while-revalidate + in-flight 합류 + 세대 번호 무효화.
- `getPublicList`·`smartPick`·`getRanking` 이 베이스를 공유(랭킹의 조합별 캐시 4천 키 제거). 어드민 `list()` 도 같은 집계 헬퍼.
- 공개·어드민 상세의 리뷰 요약을 열 select 로(임베딩 제외). 메뉴 그룹핑 상태(03:00 경로)·군집 enrich 카운트를 GROUP BY 로.
- 무효화: 크롤 upsert 4종·리뷰 비우기·가게 삭제·canonical 병합/분리/삭제.
- 마이그레이션 `20261005010000_review_summary_agg_index`: `visitor_reviews(restaurantId)` → `(restaurantId, id)` 교체,
  `review_summaries_agg_idx` 추가(백필 없음, `prisma migrate diff` 로 스키마 일치 확인).
- **결정**: 캐시 TTL 30초(결정 #1 범위 하한 — 새 크롤은 무효화로 즉시 반영되므로 TTL 은 요약 진행 지연에만 해당).
  동점 가게 순서는 최근 수집순으로 고정(예전엔 DB 자연 순서 + 부동소수 합산 오차로 흔들림).
- **함정**: Prisma 원시 쿼리는 첫 행 값으로 열 타입을 잡는다 — JSON 정수 좌표(127)가 첫 행이면 뒤 행 37.5 에서 500.
  좌표·감정 합은 `CAST(... AS REAL)` 로 고정(회귀 테스트 추가).
- **실측**(운영형 사본: 네이버 230·리뷰 6.35만·전 done 요약 임베딩 749MB, Windows):

  | 경로 | 전 | 후 |
  |---|---|---|
  | 공개 목록 limit=200 | 2.1~2.2s | 콜드 116ms · 웜 3ms |
  | 공개 목록 동시 10×3 RSS 피크 / GC 후 | 2,183MB / 1,248MB | 419MB / 403MB |
  | 스마트픽 | 1.3~1.9s, 피크 1,938MB | 2ms, 피크 401MB |
  | 상세(리뷰 1,032건) 동시 10×3 피크 / GC 후 | 1,958MB / 1,089MB | 549MB / 518MB |
  | 랭킹(콜드) | 223ms | 2ms |

  응답 동치성: 17개 요청을 전후 덤프 비교 — 값은 부동소수 오차(최대 4e-15) 안에서 같고, 차이는 동점 그룹 안 순서뿐.
- 테스트: 신규 `restaurant-public-base.test.ts` 7건, 관련 14파일 171건 통과. 기준선 전체 1,628건 통과(13분 27초).

### 플랫폼 항목(통합 브랜치에서 직접) — X-1·X-V2·X-2·X-7·B-9·배포 문서

- **X-1·X-V2** `plugins/prisma.ts`: `DATABASE_URL` 에 `socket_timeout=30`·`connection_limit=12` 를 덧붙인다. 실측(동시 64쿼리):
  기본 URL 은 64연결 중 63개 busy_timeout 5000(PRAGMA 를 실행한 1개만 30000) → 덧붙인 뒤 64개 모두 30000. foreign_keys 는
  Prisma 가 연결마다 켜고 있어(실측 64/64) PRAGMA 를 지웠다. synchronous 는 URL 로 걸 수 없어 기본(FULL)을 받아들임.
- **X-2**: `scripts/db-analyze.ts`(`pnpm --filter friendly db:analyze`, 테이블별 ANALYZE·housing_trades 기본 제외) + `deploy.sh`
  `analyze_db` 단계(배포·적재 흐름 10곳) + 서버 매일 04:30 `PRAGMA optimize=0x10002`. 로컬 dev.db: 113테이블 8.9초
  (life_stores 3.9초 — 미사용 인덱스 제거 후 줄어든다). 통계 뒤 housing kind 인덱스가 "47193 47193"(단일값)으로 잡힌다.
- **X-7** `app.ts`: 기본 요청 로그(요청당 2줄·IP·쿼리) 끄고 `onResponse` 1줄(`req`: 메서드·라우트 패턴·상태·ms). 500ms 이상은
  `slow request`(warn, 실제 URL·토큰 가림), SSE 제외. **결정**: 완전히 끄지 않는다 — 이번 재시작 원인을 찾은 근거가 요청 로그였다.
- **B-9** 공개 맛집 GET(목록·랭킹 30초, 상세·리뷰·인사이트·메뉴 트리 60초) `Cache-Control: public, …, stale-while-revalidate=300`,
  404 제외(테스트 고정).
- **배포 문서**: 실제 로그 경로·`max_memory_restart` 1500M·pm2-logrotate·새 요청 로그 형식·db:analyze·DB 연결 설정·
  Cloudflare Cache Rule·nginx real_ip 를 `docs/deploy-friendly.md` 에 반영.
- **보류(X-6)**: 큰 지도 응답의 zod 직렬화 생략은 zod 가 응답의 스키마 밖 필드를 걸러 주는 역할까지 없애므로, 모듈 통합 뒤
  출력 동일성을 확인하고 판단한다.
- **메모리 관측**: `plugins/mem-telemetry.ts` — 10분마다 `{"msg":"mem", rss, heap, ext, ab}`(MB) info 로그(테스트에선 끔). 다음 재시작이
  나면 직전 추이를 로그로 본다. Linux 할당자(`MALLOC_ARENA_MAX=2`) 시험 절차는 배포 문서에.
- 통합 브랜치 전체 테스트(1차+플랫폼): 150파일 중 149 통과·1,622건 — 실패 1파일(meal-recommendation 격리 DB describe)은
  에이전트 7개 동시 부하 중 격리 DB 준비(3.6GB 복사) 훅 시간 초과로, 단독 재실행 68/68 통과. 최종 전체 실행에서 재확인.
- **변경 전 배터리**(main 코드·운영형 사본, 외부 API 없는 공개 경로 11단계): 부팅 RSS 232MB → 배터리 뒤 GC 후 **1,376MB**,
  최대 피크 2,143MB(공개 목록 동시 10×3). 통합 후 같은 배터리로 비교한다.

### 모듈 묶음(에이전트 7개, 각자 main 기준 워크트리 → 3-way 패치로 통합) — 통합 완료분

- **tour**(D-2·D-3·D-8·D-V2·D-10): `tour-aggregate-cache.ts`(데이터 버전 캐시 위 in-flight + 콜드 계산 동시 2). 인사이트 전국 이벤트루프
  634→289ms·RSS 피크 +398→+264MB, 같은 키 3동시 +1,099→+267MB, 코스 재요청 1,610→2ms, 어드민 매칭 2.2s→0.17s. 입력 141종
  응답 전후 동일. 동반자 필터 enum(외부 API 깨지는 변경 — docs/api/README). 밀도 bbox 경계 칸은 칸 전체 값(웹·앱 미사용).
  통합 때 기준 쿼리 순서 비교 테스트를 집합 비교로 고침(ORDER BY 없는 예전 조회 순서는 ANALYZE 유무로 바뀐다).
  → main 위로 옮길 때 바뀜(아래 "main 위로 옮기기"): 버전 키·확인 주기는 원격 `tour-data-version.ts` 로, D-3(코스 결과 캐시)은
  원격 `TourPlanService` 지역 프로필 캐시로 대체(코스 재요청 수치는 옮기기 전 것).
- **crawl**(A-1·A-2·A-3·A-4·A-6·A-7·A-8·A-V1·A-V3·B-4·B-7·B-8·X-3): `plugins/crawl.ts` 싱글톤, 대기열 공유·상한, lazy-browser,
  리뷰 질문 `review-ask` 한도(게스트 30·IP 300/일)·답변 캐시 20분·LLM 동시 4, playwright 동적 import(부팅 RSS 329→290MB),
  코퍼스 48MB 바이트 상한.
- **realtime**(E-1·E-2·E-3·E-4·E-6·E-7·E-8·E-V2·C-5): `lib/upstream-guard.ts`(서비스별 쿼터·실패 쿨다운·IP 예산),
  `plugins/weather.ts`(단일 인스턴스). 업스트림 대기 20~40초 → 8초, 가짜 측정소 150회 쿼터 450 소진 → 0콜, 날씨 9,000격자
  힙 +238→+24MB, 대기 공용 키 388→47콜/일.
- **ops**(G-1·G-3·G-4·G-6·G-V1·G-V2·X-3 + 로그 결함 2종): 썸네일 버킷 스냅·in-flight·동시 4·디스크 2GB·원자 쓰기, **썸네일
  실패가 500 + 30일 immutable 캐시 헤더로 나가던 버그**, **operation-log FK 위반 원인 = 연결별 busy_timeout 5초**(X-1 과 같은 뿌리)
  → run 행 재생성·배치 DELETE, 영수증 한도·HEIC worker(이벤트루프 359~433→22~46ms), 임시저장 목록 30.7MB→9KB, 머지 저장
  1,393→315ms, 텔레그램 백오프·타임아웃.

**배포 주의(통합 묶음)**:
- 정산 임시저장 API 가 바뀌어 **서버·웹·앱(OTA)을 같이 배포**해야 한다(구 앱은 목록 payload 로 복원).
- 동반자 필터 enum·대기 시계열 404·중기 400·지하철 429 등 외부 API 계약 변화 — `export:openapi` 재생성(통합 끝에 1회).
- 새 env `SETTLEMENT_EXTRACT_DAILY_LIMIT`(기본 50). 배포 직후 썸네일 디스크 정리(부팅 1분 뒤)·영수증 30일 정리(04:20)가 한꺼번에 지울 수 있다.
- **maps**(D-1·E-V1·D-4/X-5·D-5·D-6·D-7·D-9·D-10·D-V1·E-5·E-9·E-10·X-8·X-V3): `lib/map-cells.ts`(셀 상한 6,000·국내 clamp·점 모드
  32타일 상한). 768조합 응답 전후 동일. CCTV z22 전국 14MB·1.2s → 33KB·265ms, 집값 points z15 138→10ms(`INDEXED BY` +
  기존 표본 순서 보존), 집값 통계 재구축 쓰기 락 19s → 교체 0.5s, 상가 재적재 349s 한 트랜잭션 → 청크 + 교체 12s,
  `/housing/status` 871ms → 3.8ms, 충전소 필터 403~610 → 66~124ms. 마이그레이션 2건(EV 커버링 인덱스 교체, LifeStore
  미사용 lat_lng 인덱스 36MB 제거) — 통합 DB 에 적용·drift 없음.
  **남긴 결정(보수 기본값 적용)**: 점 모드 강등 기준 6.4만 행(정상 4K/5K 화면은 여전히 0.37~0.7s) — 대안 rowid 고정 해시 표본은
  49~59ms·공간 분포 균등(현 `ORDER BY id` 표본은 4K 에서 15%p 치우침)이라 권할 만하지만 표본이 바뀌는 화면 변화라 보류.
  집값 잘림 표본은 기존 "세대수 작은 순" 유지(큰 단지 우선 여부는 제품 판단).
- **X-6 적용(보류 해제)**: `app.ts` 의 직렬화 컴파일러가 집값·일상지도·충전소·주차장 points 와 공개 맛집 목록의 200 응답만 운영에서
  `JSON.stringify` 로 보낸다(검증자 실측 1.13MB 응답 zod 21ms vs 5ms, maps 측정 라우트 잔여 ~95ms 의 대부분). 테스트 환경은 매 응답
  zod 출력과 동일한지 검사해 다르면 throw — 관련 28파일 224건 + 실데이터 248요청(5개 지역 × 7줌 × 레이어) 모두 통과, 스키마 밖
  필드가 섞이는 경로 없음.
- **meal**(C-1·C-2·C-3·C-4·C-6·C-7·C-V1·C-V2·X-3): 백업 사진 스트리밍·전역 동시 1건(이벤트루프 292~341→28~71ms), 복원 id 선생성 +
  createMany 청크(1,000건 다른 쓰기 대기 2,067→316ms, 5,000+1,000×5 는 타임아웃 실패 → 4.1s 성공), 기록 상한 20,000건·하루 30끼(409),
  내보내기 500건 커서 스트림, 시간 프리셋 +9h 산술(1만 건 422→84ms), 메뉴 칼로리 백그라운드 LLM 동시 64→8·실패 백오프,
  HEIC worker(12MP 632→17ms, 25MP 초과 413), 최근 섭취 139→1.4ms(인덱스 교체 마이그레이션 1건), LLM·날씨를 쓰기 장벽 밖으로
  (같은 사용자 저장 대기 2,925→17~32ms). **통합 때 결정 수정**: 사진 합계 25MB 를 복원에도 걸면 예전 규칙(50MB)으로 만든
  25~50MB 백업을 되돌릴 수 없어(데이터 손실성 회귀) — **새 백업만 25MB, 복원은 50MB 유지**(`MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES`,
  테스트 55MB→413·30MB→크기 통과 고정). 복원 메모리는 전역 동시 1건으로 묶인다.
- **통합 정리**: 영수증 HEIC(`settlement-extraction/receipt-heic.ts`)를 식단의 공용 워커(`lib/heic-worker.ts`) 위 얇은 어댑터로 —
  게이트가 따로라 식단·영수증 두 장이 동시에 디코드될 수 있던 것(24MP ≈ +350MB 씩)을 프로세스 전역 동시 1건으로. 테스트 픽스처를
  실제 HEIF 구조(meta → iprp → ipco → ispe)로 고침. 세마포어 구현 2종(`modules/ai/concurrency-gate`·`lib/async-gate`) 통합은 후속.
- **share**(X-V1·F-2·G-2·F-3·X-4·F-V1·F-V2·F-5·F-6·F-7·F-4·X-3): `lib/share-render.ts`(지연 import·`loadSystemFonts:false`·`renderAsync`·
  렌더 동시 1·같은 키 합류), PNG 캐시 바이트 상한 합 32MB, 버전 붙은 og:image 만 긴 캐시. 렌더 블로킹 239~393 → 19~35ms, 정산 100명×10차
  3,580 → 130ms·PNG 3.1MB → 364KB, 미스 12건 동시 이벤트루프 공백 2,681 → 70ms. **결정 변경**: 렌더 동시 상한 1(동시 2 는 GC 후 RSS
  800MB 대 — 실측). 투표자 100명(409), 게스트 공유 IP 하루 200개, 정산 카드 앞 30명+'외 n명', **회원 LLM 하루 100회(2026-09-02 '회원
  무제한' 결정 변경 — `MEMBER_PER_DAY=null` 이면 예전처럼 무제한)**. 덤으로 타로 이미지 캐시 키에 질문 공개 여부가 빠져 토글해도
  예전 그림이 나오던 버그 수정.

### 통합 완료 상태 (2026-10-05)

- 7개 묶음 모두 3-way 패치로 통합(충돌은 수기 문서 `docs/api/README.md` 1곳만 — 양쪽 내용 합침). 무거운 의존성(sharp·satori·resvg·
  heic-convert·playwright)은 전 모듈에서 사용 시점 import(남은 것은 `import type` 뿐).
- 마이그레이션 4건(모두 인덱스 — 백필 없음): `20261005010000_review_summary_agg_index`·`20261005020000_meal_item_name_entry_index`·
  `20261005030000_ev_station_covering_index`·`20261005030100_drop_life_store_lat_lng_index`. 통합 DB 에 적용, `migrate diff` 빈 마이그레이션.
- `export:openapi` 재생성(엔드포인트 200개). lint 경고 수 main 과 같음(web 110·mobile 118·friendly 소스+스크립트 988).
- 웹 32파일 175건·shared 19파일 121건·typecheck 6/6 통과.

### 배포 체크리스트

1. **서버·웹·앱(OTA)을 함께** — 정산 임시저장 목록 계약 변경(구 앱은 목록 payload 로 복원), 리뷰 질문 게스트 키, 동반자 enum.
2. `./deploy.sh 4`(웹+API+DB) — 마이그레이션 4건 + `analyze_db`(첫 통계). 서버 정지 구간을 고르면 상가 교체·ANALYZE 락 걱정이 없다.
3. 운영 `.env`: (선택) `SETTLEMENT_EXTRACT_DAILY_LIMIT`(기본 50). `DATABASE_URL` 은 그대로(플러그인이 socket_timeout·connection_limit 덧붙임).
4. pm2-logrotate 설치(배포 문서), 배포 뒤 며칠 `pm2 ls` 재시작 수(↺)·`"msg":"mem"` 로그·`"msg":"slow request"` 확인 → `max_memory_restart` 재결정.
5. Cloudflare Cache Rule(공개 JSON GET), nginx real_ip(X-V4) — 대시보드·서버 작업.
6. 배포 직후 한꺼번에 지울 수 있는 것: 썸네일 디스크 정리(부팅 1분 뒤, 2GB 초과분), 영수증 30일 미참조 정리(04:20).

### 남은 것(후속)

- **결정 대기**: 점 모드 강등 기준(현재 6.4만 행) 대신 rowid 고정 해시 표본(4K/5K 화면 0.37~0.7s → 50ms·분포 균등, 표본이 바뀌는 화면 변화),
  집값 잘림 표본 순서(세대수 작은 순 유지 vs 큰 단지 우선), 공유 이미지 JPEG/WebP 전환(카카오·트위터 호환 확인).
- **구조**: 세마포어 구현 2종 통합, 정산 카드 satori 레이아웃(30명×3차 ~160ms)의 worker 이전, 복원 요청 본문 스트리밍(클라이언트 변경
  필요 — 본문이 한 번에 한 건만 메모리에 있게 한 뒤라 급하지 않다), 집값 nearby·search 의 Prisma 빌더 쿼리(ANALYZE 뒤 재측정).
  복원 중 프로세스 종료 시 남는 청크는 아래 "리뷰 반영"에서 해결(원장 status 컬럼 없이).
- **웹**: 기존 정산 카드의 100만 원 이상 금액 칸 잘림(기존 결함, 성능 범위 밖).
- **보류 유지**: bcrypt 네이티브(G-5), 시간표 사전 워밍(E-7 근본책 — 쿼터 3일치), 적재 시 tour 요약표(스키마).

### 최종 검증 (2026-10-05, 통합 브랜치)

- **friendly 전체 테스트: 169파일 1,852건 통과·2 skip·실패 0**(기준선 149파일 1,628건 → +20파일 +224건, 9분 48초). 웹 32파일 175건·shared
  19파일 121건·typecheck 6/6, lint 경고 수 main 과 같음.
- 마무리 수정: 웹 `VotePage` 가 409 를 모두 "방금 마감"으로 보여 주던 것을 투표자 상한 409 는 서버 문구로(공용 상수
  `VOTE_VOTERS_FULL_MESSAGE_PREFIX`, 웹 테스트 추가).
- **메모리 배터리**(운영형 사본, 외부 API 없는 공개 경로 11단계, 조용한 머신에서 전후 연달아 — 후는 마이그레이션 4건 + ANALYZE 적용,
  하네스가 테스트 모드라 X-6 동일성 검사로 지도 응답은 운영보다 비관적):

  | 단계 | 전(시간·루프최대·RSS 피크) | 후 |
  |---|---|---|
  | 부팅 | 16.1s · RSS 286MB | 3.7s · RSS 280MB(heap 93→76MB) |
  | 공개 목록 동시 10×3 | 15.2s · 256ms · 2,173MB | 0.37s · 135ms · 344MB |
  | 상세(리뷰 1,032건) 동시 10×3 | 2.4s · 423ms · 1,628MB | 1.1s · 89ms · 500MB |
  | 스마트픽 동시 10×3 | 10.4s · 96ms · 1,913MB | 6ms · 16ms · 470MB |
  | 집값 points 서울 z13 5×2 | 2.8s · 451ms | 1.6s · 330ms |
  | 집값·CCTV·충전소 z22 전국 | 3.8MB·14MB·4.9MB 응답, 루프 231·992·345ms | 34KB·33KB·29KB, 22·22·20ms |
  | 집값 상태 5×2 | 3.6s | 0.15s |
  | 여행 인사이트 3종(전국) | 2.1s · 389ms · 피크 1,586MB | 2.6s · 304ms · 피크 653MB(게이트로 직렬화) |
  | **배터리 뒤 GC 후 RSS** | **1,489MB**(운영 상한 1.5GB 에 닿음) | **509MB** |

- 정리 대상(로컬, 커밋 무관): 에이전트 워크트리 7개 `D:/work/workspace_other/nlp2-*`(각 DB 3.4GB, 브랜치 `perf2/*` — 패치는 통합 끝),
  측정 사본 `apps/friendly/data/perf2/`(main 의 bench·prodlike 2개 합 약 12GB, 통합 워크트리 bench 3.4GB).

### main 위로 옮기기 (2026-10-05)

- 감사하는 사이 원격 main 에 여행로그 10~14차(코스 추천 `TourPlanService` 분리, 데이터 버전 캐시 `tour-data-version.ts`)가 들어와
  15커밋을 그 위로 다시 쌓았다(선형 — main 은 fast-forward). 충돌은 tour 첫 커밋에서만 났다.
- tour 정리: 데이터 버전은 원격 방식(요청마다 적재·제거 이력의 최신 id 를 읽고, 바뀌면 `TourVersionedCache` 를 통째로 비움)을 따르고
  우리 쪽 확인 주기(`TOUR_VERSION_CHECK_MS`)·`now` 주입은 뺐다. `TourAggregateCache` 는 그 위에 같은 키 합류·콜드 게이트만 얹는다.
  D-3(코스 결과 캐시)은 `TourPlanService` 지역 프로필 캐시(프로미스를 담아 같은 지역 요청이 합류)로 대체하고, 프로필 빌드만 같은
  콜드 게이트에 넣었다. 공개 캐시 헤더(D-10) 때문에 제거(unload) 뒤에도 클라이언트가 이미 받은 사본은 길어야 5분 남는다(서버 집계는
  곧바로 바뀐다 — 라우트 주석).
- 옮긴 뒤 검증: friendly 173파일 1,926건 통과·1 skip·실패 0, 웹 33파일 186건·shared 19파일 121건, typecheck 6/6, lint 에러 0·경고는
  src+scripts 기준 main 과 같음(988), docs/api 재생성 결과 커밋본과 같음.

### 리뷰 반영 (2026-10-05, 워크트리 `fix/perf2-review`)

15커밋에 대한 외부 리뷰 8건 + 추가 1건을 코드와 대조했다 — 지적은 전부 사실이고, 그중 중 이상으로 본 4건을 고쳤다.

- **재적재 겹침(집값 통계·상가)** — 스테이징 표 이름이 고정(`<표>_next`)이라, 서로 다른 프로세스(갱신 cron + CLI, CLI 두 개)가
  겹치면 늦게 시작한 쪽이 지우고 다시 만든 표에 먼저 쪽의 남은 INSERT 가 들어갔다. 먼저 쪽은 섞인 표를 "성공"으로 게시했다(재현:
  A 가 `A|b1, A|b2, B|all` 을 게시). 예전 한 트랜잭션 교체에는 없던 회귀다. → `lib/shadow-table.ts`: 실행마다 다른 이름
  (`<표>_next_<시각>_<난수>`), 시작할 때 30분 넘은 잔여물과 예전 고정 이름만 정리. 겹쳐도 각자 온전한 표를 만들고 늦게 교체한 쪽이 남는다.
- **복원 도중 종료 뒤 재시도 중복** — 청크는 커밋되고 원장은 마지막 트랜잭션이라, 도중에 프로세스가 끝나면(배포 reload·메모리
  재시작) 같은 백업의 재시도가 남은 행 옆에 한 벌을 더 만들었다(재현: 1,200건이 1,700건). → 기록·추천 id 와 사진 토큰을
  (사용자, 아카이브, ref)에서 정하고, 재시도가 원장 없이 남은 그 id 의 행·사진을 지운 뒤 처음부터 쓴다. 마이그레이션 없음.
- **복원 본문 메모리** — 처리 게이트가 본문 파싱 뒤라, 기다리는 요청마다 파싱된 75MB 본문이 남았다(대기열 8 → 본문 9개).
  → `meal-restore-intake.ts`: preParsing(인증·요청 한도 뒤, 본문을 읽기 전)에서 전역 1건. 대기 60초·대기열 8 을 넘으면 본문 없이
  503, 자리를 잡고 5분 안에 본문이 다 오지 않으면 연결을 끊는다(운영은 nginx 가 본문을 모아 넘겨 닿지 않는 안전망).
- **크롤 목록 경량화와 종료 폴백** — 목록이 완료 잡의 리뷰 본문을 비우는데(A-4) 클라이언트 폴백이 그 축약 결과로 종료를 확정했다.
  SSE 'done' 을 놓쳤을 때뿐 아니라 끝난 잡을 목록에서 열 때마다 어드민 크롤링 테스트 화면의 리뷰가 비었다. → `GET /admin/crawl/jobs/:id`
  (리뷰 포함) 추가, 폴백은 성공으로 끝난 잡의 결과를 단건 조회로 받아 종료를 합성한다(조회가 실패하면 목록 결과로).
- 새 테스트는 고치기 전 구현에서 실패하는 것을 확인했다(겹침·복원 재시도·폴백). 검증: friendly 175파일 1,936건 통과·6 skip(지하철 live),
  웹 89파일 422건·shared 23파일 151건, typecheck 6/6, 바꾼 파일 lint 경고 0. friendly 1건 실패(지하철 경로 404 기대에 503)는
  워크트리의 빈 스키마 DB 에 지하철 마스터가 없어서다 — 변경을 걷어낸 코드도 같은 DB 에서 똑같이 실패한다.
- **남긴 것(낮음 — 리뷰 4~8번)**: 추천·영양제 조언 합류 키에 데이터 세대 넣기, 리뷰 질문에서 거부된 요청에 합류한 뒤 진행 중 요청 재확인,
  HEIC 워커 `terminate()` 를 기다린 뒤 자리 반환, 측정소 화이트리스트를 목록 먼저 보고 전국 조회는 필요할 때만, 실패 쿨다운 기준 시각을
  조회 시작이 아니라 실패 시점으로(대기·버스·지하철·날씨·AWS·바다 6곳 공통), 공유 이미지 테스트의 첫 렌더 제한 시간.
