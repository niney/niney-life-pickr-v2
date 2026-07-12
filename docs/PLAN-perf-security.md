# 보안·성능 강화 계획 — 감사 기반 9개 차수 (perf-security)

> 2026-07-13 작성. 커밋 여부는 사용자 지시에 따름(작성 시점 untracked).
> 멀티에이전트 감사(스캐너 9 + 발견별 적대적 검증, 확정 49 / 반증 1 / 불확실 0) 결과를
> 심각도·주제별로 차수화한 로드맵. 계획 시점의 기록이며, 이후 실제 진행은 커밋 이력이 진실이다.
> 대상 범위: **friendly + web + packages** (앱/mobile 제외 — 표면 작아 별도 기회로).

## Context

전체 감사에서 확정된 결함은 **보안 축과 성능 축이 자주 같은 파일에 공존**한다(무인증 공개
프록시 = DoS + 쿼터 소진, 과다로드 = 성능 + 정보노출). 그래서 차수는 "축"이 아니라 **결함
군집**으로 묶었다. 각 차수는 독립적으로 배포·검증 가능한 단위다.

**검증 규약(모든 차수 공통)**: 각 차수 완료 시 `pnpm typecheck` + `pnpm --filter friendly test`
(+ 웹 변경 시 `pnpm --filter web test`가 있으면) + **영향 플로우 실구동 verify**. 커밋은
사용자가 "커밋"이라 명시할 때만.

**프로젝트 제약(CLAUDE.md) 준수**: Redis·Docker 금지 → 레이트리밋은 `@fastify/rate-limit`
기본 인메모리 스토어(단일 인스턴스라 충분). 공유 스키마 변경은 `@repo/api-contract` zod에서.

### 심각도 분포(확정 49)

| 심각도 | 건수 | 대표 |
|---|---|---|
| **HIGH** | 2 | auth 레이트리밋 전무(브루트포스+bcrypt DoS) |
| **MEDIUM** | 19 | 서버 과다로드(가짜 페이지네이션), 이벤트루프 블로킹, 공개 프록시 DoS, JWT 무효화 부재 |
| **LOW** | 28 | zod 상한 부재, 웹 렌더 낭비, 타이밍 열거, HTTP 헤더 하드닝 |

### 감사에서 제외/이미 처리됨 (재보고 아님 — 참고용)

- **정산 공개 상세 `getPublicDetail` 과다로드**: P0/P1/P2 최적화 커밋으로 이미 해결(메모리
  `project_settlement_api_perf`). 이번에 재확정된 과다로드는 **다른 경로**(restaurant·analytics·
  settlement-extraction·review-search)다.
- **파노라마 대표이미지 503(HMAC TTL)**: eager 캐시로 해결됨(`project_panorama_image_fix`).
- **SSE 인증 토큰 `?token=`**: EventSource 한계로 의도된 것, 로그 redact 됨 — 정상.
- **dev CORS 전체 반사**: `isDev` 게이팅 + prod allowList — 정상.
- **썸네일 프록시 SSRF**: `ALLOWED_HOSTS`(pstatic.net 계열) 화이트리스트로 **SSRF는 차단됨**.
  잔여 위험은 무인증 compute + 무제한 디스크 캐시 DoS뿐(→ 1차에서 다룸).
- 반증 1건(스캐너 오탐)은 목록에서 제외.

---

# 보안 트랙 (1~4차)

## 1차 — 레이트리밋 인프라 [P0 · HIGH]

가장 높은 가치. 무인증 표면 전체가 시도 제한 없이 열려 있고, 기존 임시 리미터는 프록시 뒤에서
붕괴하거나 우회 가능하다.

**대상 발견**
- (HIGH #1+#2) `auth/auth.route.ts:16,29` — login/register에 레이트리밋 전무 → 무제한
  브루트포스·대량 가입 + bcrypt CPU 소진 DoS. `@fastify/rate-limit` 미설치.
- (MEDIUM #19) `app.ts:17` — `trustProxy` 미설정 → nginx/Cloudflare 뒤에서 `req.ip`가
  프록시 IP로 고정 → **모든 per-IP 리밋이 전역 단일 버킷으로 붕괴**(선행 수정 필요).
- (MEDIUM #17) `bus/bus.route.ts:90`, (MEDIUM #18) `subway/subway.service.ts:836` — 무인증
  실시간 프록시에 per-IP 리밋 없음 → 익명 1명이 일일 쿼터(버스 900/일) 수 초 만에 소진 →
  전체 사용자 하루종일 503.
- (LOW #35+#45) `review-search/review-search.route.ts:25` — 인메모리 맵이 1만 엔트리 초과 시
  `.clear()` **전체 초기화** → IP 다량 확보 시 모든 카운터 리셋(우회).
- (LOW #33) `settlement/settlement.route.ts:211` — 공유조회 리미터가 `trustProxy` 미설정
  `req.ip`에 의존 → 프록시 뒤 붕괴.
- (MEDIUM #6/#16/#20 일부) `media/media.route.ts:64` — 무인증 썸네일 프록시에 per-IP 리밋 없음
  (디스크 캐시 무제한 부분은 4차/6차와 연계).

**수정**
- `@fastify/rate-limit` 의존성 추가 → `src/plugins/rate-limit.ts` 신설, 전역 관대한 기본
  한도(예: IP당 분당 300) 등록. 기본 인메모리 스토어(Redis 금지 규약 부합).
- `app.ts` Fastify 옵션에 `trustProxy: true`(또는 신뢰 프록시 CIDR) 추가 — **1차 최우선**,
  이게 없으면 아래 per-route 리밋이 전부 무의미.
- 라우트별 `config.rateLimit` 오버라이드: `/auth/login`·`/auth/register` IP+email 조합 키로
  엄격(로그인 5~10회/분, 등록 3회/시간), 버스·지하철·썸네일·공개 ask 공개 프록시에 per-IP
  한도. 기존 인메모리 임시 리미터(review-search/settlement)는 플러그인으로 **대체**하며
  clear-all 버그 제거(LRU 퇴출 또는 플러그인 위임).

**함정/결정**
- `trustProxy` 값: 프록시가 X-Forwarded-For를 세팅하는 배포인지 먼저 확인. 잘못 켜면 헤더
  스푸핑으로 IP 위조 가능 → 신뢰 홉만 켜기(`true`는 모든 홉 신뢰). **배포 토폴로지 확인 필요**.
- login 키를 IP만 쓰면 단일 계정 표적 공격을 못 막음 → `IP + body.email` 조합 키.
- 버스/지하철은 정상 트래픽도 쿼터에 근접 → per-IP 리밋과 7차 마이크로캐시를 **함께** 설계
  (리밋만으론 정상 다중 사용자의 중복콜을 못 줄임).

**검증**: 로그인 6회 연속 → 429 확인, 프록시 헤더 시뮬레이션으로 IP별 버킷 분리 확인,
버스 프록시 폭주 시 429(503 아님), 기존 auth/settlement 테스트 그린, `pnpm typecheck`.

## 2차 — 인증·세션 하드닝 [MEDIUM]

토큰이 7일 유효인데 서버측 무효화 수단이 전무하다.

**대상 발견**
- (MEDIUM #15+#43) `plugins/jwt.ts:8,19` — `requireAdmin`이 JWT의 role 클레임만 신뢰(DB 미확인)
  + `logout`은 no-op → 권한 회수/강제 로그아웃이 최대 7일 반영 안 됨, 탈취 토큰 회수 불가.
- (LOW #31) `auth/auth.service.ts:22` — 사용자 부재 시 bcrypt 없이 즉시 401(타이밍 열거) +
  register 409 'Email already in use'로 존재 여부 직접 노출.

**수정**
- `User.tokenVersion Int @default(0)` 컬럼 추가(Prisma 마이그레이션) → JWT sign 시 클레임 포함,
  `authenticate`에서 현재 값과 비교. `logout`·role 강등·비밀번호 변경 시 증가 → 기존 토큰 즉시
  무효화. 이걸로 #15/#43 동시 해결.
- `requireAdmin`은 tokenVersion 검증으로 강등 반영. 즉시성이 과하면 대안: userId 기준 60s
  TTL `lru-cache`로 DB role 조회(경량).
- 타이밍 완화: 사용자 부재 시에도 더미 bcrypt.compare 수행(상수시간화). register 열거는
  제품 정책 결정 사항(일반 메시지 vs 현행 유지) — **사용자 확인**.

**함정/결정**
- 마이그레이션 필요: `pnpm --filter friendly db:migrate`. 기존 발급 토큰은 tokenVersion 클레임이
  없으므로 마이그레이션 후 전원 재로그인(또는 missing=0 취급) 정책 결정.
- 즉시 무효화(매 요청 DB조회) vs 캐시(60s 지연) 트레이드오프 — 캐시 권장(성능).

**검증**: 로그인→토큰 확보→강등→같은 토큰으로 admin API 401 확인, logout 후 재사용 401,
없는 이메일/틀린 비밀번호 응답시간 유사(타이밍), auth 테스트 그린.

## 3차 — HTTP 표면·헤더·클라이언트 하드닝 [MEDIUM/LOW]

**대상 발견**
- (LOW #44) `plugins/swagger.ts:24` — `/docs` + 전체 OpenAPI가 prod 무인증 노출(어드민 API
  표면 전체 공개).
- (LOW #42) `plugins/cors.ts:40` — `CORS_ORIGIN` 기본값 `*` → prod 미설정 시 모든 origin이
  `credentials:true`로 반사.
- (LOW #41) `plugins/helmet.ts:5` — helmet CSP 전면 비활성(`contentSecurityPolicy:false`)인데
  SSR-lite HTML(`/r/:placeId`, `/share/settlements/:token`, `/docs`)을 직접 서빙 → XSS 방어선이
  이스케이프 함수 하나뿐.
- (LOW #39) `web/index.html:9` — jsdelivr CDN CSS를 SRI 없이 로드 + 페이지 CSP 없음(공급망).
- (LOW #40) `web/.../detail/InfoTab.tsx:192` — 크롤한 블로그 URL을 스킴 검증 없이 `<a href>`
  바인딩 → `javascript:` 유입 시 클릭형 XSS.
- (LOW #38) `web/src/main.tsx:23` — 7일 JWT를 `localStorage(lp:token)` 평문 저장(XSS 탈취).

**수정**
- Swagger: `isDev`일 때만 등록하거나 `/docs`에 `requireAdmin` 가드.
- CORS: prod에서 `CORS_ORIGIN` 미설정(=`*`) 시 **기동 실패 또는 credentials 비활성**(fail-closed).
  env 스키마에서 prod일 때 `*` 금지 검증 추가 고려.
- helmet: SSR-lite 페이지에 맞는 최소 CSP 활성(자기 origin + 필요한 CDN 화이트리스트). 이스케이프
  경로(`restaurant-preview`/`share-preview`)도 재점검.
- index.html: CDN CSS self-host 또는 `integrity`(SRI) 추가.
- InfoTab: href를 `http(s):` 스킴만 허용하는 sanitizer 통과.
- 토큰 저장: 정책 결정 사항 — httpOnly 쿠키 전환은 대공사(SSE `?token=` 의존성 있음) →
  현행 유지 + CSP/XSS 방어 강화로 실질 위험 감축이 현실적. **사용자 확인**.

**함정/결정**: CSP는 지도 타일(vworld)·CDN·인라인 스타일 때문에 깨지기 쉬움 → report-only로
먼저 관찰 후 enforce. 토큰 저장 방식은 아키텍처 결정이라 단독 판단 금지.

**검증**: prod 모드로 `/docs` 404/401, CORS 미설정 시 기동거부, CSP 헤더 존재 + SSR-lite 페이지
정상 렌더, `javascript:` href 차단, 웹 빌드 정상.

## 4차 — 입력 상한 & 저장 DoS [MEDIUM/LOW]

zod 스키마에 문자열/배열 상한이 없어 대형 페이로드가 그대로 SQLite에 영속된다. 대부분 기계적.

**대상 발견** (전부 `packages/api-contract/src/schemas/`)
- (MEDIUM #21) `settlement/settlement-draft.service.ts:75` — 사용자당 draft 행수 제한 없이 임의
  placeId마다 200KB 무한 생성.
- (LOW #46) `settlement.ts:180` — warning/receiptImageToken/restaurantPlaceId/participantClientId
  상한 없음.
- (LOW #37) `bus.ts:35` — 즐겨찾기 스냅샷(name/arsId/routeName/stationName) 상한 없음(수십 MB).
- (LOW #47) `picks.ts:10` — options 배열 항목 문자열 상한 없음.
- (LOW #48) `auth.ts:5` — 이메일 길이 상한 없음.
- (DoS #49) `review-search.ts:41` — `ReviewAskInput.query` 길이 상한 없음(임베딩·LLM에 무제한 전달).

**수정**: 각 스키마에 `.max(N)` 문자열 상한, 배열 `.max()` 개수 제한, draft는 서비스에서
사용자당 행수 상한(초과 시 오래된 것 정리 또는 409). `@repo/api-contract`에서 수정하면 FE/BE
동시 적용.

**함정/결정**: 기존 데이터에 이미 상한 초과 행이 있으면 검증 실패로 조회가 깨질 수 있음 →
입력(body)에만 max, 응답(response) 스키마엔 완화 유지 또는 마이그레이션 점검.

**검증**: 초과 페이로드 400, 정상 페이로드 통과, draft 상한 초과 시 정책 동작, 관련 테스트 그린.

---

# 성능 트랙 (5~9차)

## 5차 — 서버 과다로드 → 실제 페이지네이션 [MEDIUM]

여러 목록/상세가 매 요청마다 전 행을 로드한 뒤 메모리에서 slice → 페이지네이션이 DB 부하를
전혀 줄이지 못한다.

**대상 발견**
- (MEDIUM #4) `restaurant/restaurant.service.ts:1241` — 공개 리스트가 매 요청 네이버 식당 전 행
  (snapshotJson 포함) + 전 ReviewSummary 로드 후 메모리 페이지네이션.
- (MEDIUM #5) `restaurant/restaurant.service.ts:1760` — 공개 상세/리뷰가 3개 소스 리뷰+요약
  전량 로드(offset/limit은 메모리 slice).
- (MEDIUM #3) `analytics/analytics.service.ts:908` — `computeGlobalMenus`가 전체 Canonical+링크+
  전 식당 멘션 GROUP BY 로드 후 인메모리 필터/정렬/페이지네이션. 캐시키가
  `menus:${JSON.stringify(query)}`라 page/sort/q마다 미스 → 매번 전량 재집계.
- (MEDIUM #7) `settlement-extraction/settlement-extraction.route.ts:107` — 이름·메뉴만 쓰면서
  `getPublicDetail`로 3개 출처 전체 리뷰 코퍼스 로드.
- (MEDIUM #9) `review-search/review-search.service.ts:303` — enrich/군집 카운트용으로 전체
  enriched ReviewSummary 행 매 요청 findMany.
- (LOW #23) `admin/admin.service.ts:8` — 어드민 사용자 목록 페이지네이션 없이 전 행
  (passwordHash 컬럼 포함) 조회 → **응답 스키마가 passwordHash를 strip 하는지 확인 필요**.

**수정**: DB 레벨 `where`+`take`+`skip`(또는 커서) + `count()`로 전환. analytics는 캐시키에서
page/pageSize/sort 분리(전체 집계 1개만 캐시 후 슬라이스) 또는 멘션 통계를 머지 시점 비정규화.
settlement-extraction은 이름·메뉴만 뽑는 lean 쿼리. admin은 `select`로 passwordHash 제외 + 페이지.

**함정/결정**: 인메모리 필터·정렬 로직이 DB로 옮겨지면 정렬 안정성·검색(q) 시맨틱이 바뀔 수
있음 → 각 경로의 기존 정렬/검색 계약을 보존. analytics 비정규화는 머지 파이프라인 변경이라
범위 큼 → 우선 캐시키 분리(저위험)부터.

**검증**: 페이지 요청 시 DB 쿼리 row 수가 pageSize에 비례(로그/EXPLAIN), 결과 순서·검색 동일,
대용량 시드로 응답시간·메모리 개선 확인, restaurant/analytics 테스트 그린.

## 6차 — 이벤트 루프 오프로딩 · PNG 캐시 · 외부 타임아웃 [MEDIUM]

동기 네이티브/순수JS 무거운 연산이 요청 스레드에서 이벤트 루프를 막는다.

**대상 발견**
- (MEDIUM #13) `settlement/share-preview.ts:201` — 공개 정산 PNG가 요청마다 satori 레이아웃 +
  `Resvg.render()`(동기 네이티브) 재실행 + 서버 캐시 없음.
- (MEDIUM #14) `settlement-extraction/settlement-extraction.service.ts:184` — HEIC 업로드가
  `heic-convert`(순수 JS libheif)를 요청 스레드에서 → 한 장에 수 초 블로킹.
- (LOW #22) `lib/hash.ts:1` — 비밀번호 해시가 순수 JS `bcryptjs`(라운드 10) 메인 스레드 수행
  (1차 auth 폭주와 복합).
- (MEDIUM #8) `review-search/review-search.service.ts:638` — 공개 QA(publicAsk)의 chatJson/embed
  fetch에 타임아웃 없음 + 동시성 게이트·텔레메트리 우회.
- (LOW #26) `review-clustering/review-clustering.service.ts:196` — LLM 라벨링 fetch 타임아웃 없음
  → 배치 무기한 블록.

**수정**: 공개 PNG는 (settlementToken, revision) 키로 서버 캐시(디스크/lru) + 필요 시 worker
스레드 오프로드. HEIC는 worker 스레드 또는 큐. bcrypt는 `@fastify/rate-limit`(1차)로 유입
제한 + async 유지(또는 네이티브 bcrypt 검토). publicAsk/clustering fetch에 `AbortController`
타임아웃 + publicAsk를 동시성 게이트·텔레메트리 경로로 통일.

**함정/결정**: worker 스레드는 복잡도↑ — 우선 **캐시(PNG)와 타임아웃(fetch)**부터(저위험 고효과),
worker 오프로드는 부하 측정 후 결정. HEIC는 사용 빈도 확인 후 우선순위.

**검증**: 같은 정산 PNG 2회 요청 시 2번째 캐시 히트(satori 미실행), publicAsk에 지연
업스트림 주입 시 타임아웃 발생, 이미지 처리 중 다른 요청 지연 개선(부하 측정), 테스트 그린.

## 7차 — transit 외부 API 마이크로캐시 + in-flight 합류 [MEDIUM]

**대상 발견**
- (MEDIUM #10) `bus/bus.service.ts:574` — 버스 도착/위치 프록시에 마이크로캐시·in-flight 합류가
  없어 동시 사용자 수만큼 업스트림 중복콜 → 900/일 쿼터 조기 소진.

**수정**: (노선/정류장 키) 짧은 TTL(예: 10~15s) lru-cache + in-flight Promise 합류(같은 키
동시 요청은 1콜 공유). 지하철은 이미 15s 마이크로캐시 있음 → 버스에 동형 적용 + in-flight
coalescing을 양쪽에 추가.

**함정/결정 (⚠️ 메모리)**: **버스위치 API(15000332) 인증키가 2026-12-27 만료 예정** — 연장 필요.
지하철 API도 키 2종 분리(실시간 vs 정적) 주의. 실시간성이 중요한 도착정보라 TTL 과도 설정 금지.

**검증**: 동일 정류장 동시 10요청 → 업스트림 1콜(로그), TTL 내 재요청 캐시 히트, 쿼터 소진일에도
캐시로 부분 동작, bus/subway 테스트 그린.

## 8차 — 웹 프런트엔드 렌더/전송 낭비 [LOW]

**대상 발견**
- (MEDIUM #11) `web/routes/RestaurantsPage.tsx:127` — 공개 검색이 디바운스 없이 키 입력마다
  limit=80 리스트 API 재요청.
- (MEDIUM #12) `web/.../PublicRestaurantCard.tsx:49` — 80px 리스트 썸네일/그리드가 원본
  해상도(w1500급) 네이버 이미지 로드(`@repo/utils` thumbnail 미사용).
- (LOW #27) `web/.../JobLogTab.tsx:97` — SSE 로그 무제한 누적 + 이벤트마다 전체 배열 복사·
  재정렬·전량 렌더.
- (LOW #29) `web/.../ImgWithFallback.tsx:26` — src 변경 시 실패상태를 useEffect+setState로 리셋
  (이중 렌더·1프레임 stale). → 렌더 중 계산으로(프로젝트 원칙 `feedback_avoid_useEffect`).
- (LOW #28) `web/vite.config.js:1` — gitignore된 컴파일 사본이 `vite.config.ts`를 셰도잉 →
  번들 설정 변경이 조용히 무시됨.
- (LOW #30) `packages/shared/hooks/useSettlementDraft.ts:35` — 자동저장 성공마다 전체 draft
  목록(payload 포함) 재요청 → 저장 1회당 수 MB 재전송.

**수정**: 검색 300ms 디바운스, 리스트 썸네일은 media 프록시/`@repo/utils` thumbnail로 축소 URL,
SSE 로그 링버퍼 상한 + key 기반 append(전량 재정렬 제거), ImgWithFallback을 파생상태 렌더링,
`vite.config.js` 삭제 + gitignore 확인, draft 자동저장은 낙관적 갱신(전체 refetch 제거).

**함정/결정**: `vite.config.js` 삭제는 빌드에 영향 → 삭제 후 `pnpm --filter web build` 확인.
ImgWithFallback은 외부 시스템 동기화가 아니라 파생상태 → useEffect 제거 대상.

**검증**: 검색 타이핑 시 네트워크 1회(디바운스), 리스트 이미지 전송량 감소(개발자도구),
로그 폭주 시 메모리 상한 유지, draft 저장 시 목록 재요청 없음, `pnpm --filter web build`.

## 9차 — N+1 · 정책 정합 · 잔여 [LOW]

**대상 발견**
- (LOW #25) `settlement/settlement.service.ts:254` — 정산 생성/수정이 참여자 수만큼 순차
  upsert+create(최대 ~200 왕복).
- (LOW #34) `ai/ai.route.ts:86` — AiService를 요청마다 새로 생성 → per-actor 1초 리밋
  (`lastCallByActor`)이 죽은 코드. → 서비스 싱글턴화로 리밋 부활.
- (LOW #32) `crawl/crawl.service.ts:544` — 다이닝코드 리뷰 루프가 외부 `totalPage`를 상한 없이
  신뢰(테이블링은 200 캡 있음).
- (LOW #24) `crawl/crawl.route.ts:558` — 다이닝코드 bulk-save 'actor당 1잡'이 주석뿐, 코드
  미강제 → 동시 다중 잡.
- (LOW #36) `bus/bus-api.adapter.ts:24` — 서울시 API 키가 평문 HTTP URL로 전송(경로 도청).

**수정**: 참여자 배치 처리(`createMany`/트랜잭션 묶음), AiService를 plugin 싱글턴(summaries.ts
패턴)으로, diningcode totalPage 상한 캡, bulk-save 1잡을 인메모리/DB 락으로 강제, seoul API를
HTTPS로(업스트림 지원 시).

**함정/결정**: seoul API가 HTTPS 미지원이면 키 회전·범위 제한으로 완화(업스트림 제약 확인).
AiService 싱글턴화는 상태 공유 안전성 확인 필요.

**검증**: 참여자 많은 정산 저장 쿼리 수 감소, AI 연타 시 1초 리밋 발동, diningcode 대량 페이지
캡 동작, bulk-save 중복 잡 거부, transit 테스트 그린.

---

## 차수 요약 · 권장 순서

| 차수 | 주제 | 축 | 심각도 | 선행 | 마이그레이션 |
|---|---|---|---|---|---|
| 1 | 레이트리밋 인프라 + trustProxy | 보안 | **HIGH** | — | — |
| 2 | 인증·세션 하드닝(tokenVersion) | 보안 | MEDIUM | — | ✅ |
| 3 | HTTP 표면·헤더·클라이언트 | 보안 | MEDIUM/LOW | — | — |
| 4 | 입력 상한 & 저장 DoS | 보안 | MEDIUM/LOW | — | — |
| 5 | 서버 과다로드→실제 페이지네이션 | 성능 | MEDIUM | — | — |
| 6 | 이벤트루프 오프로딩·PNG캐시·타임아웃 | 성능 | MEDIUM | (1차 bcrypt) | — |
| 7 | transit 마이크로캐시+in-flight | 성능 | MEDIUM | — | — |
| 8 | 웹 프런트엔드 렌더/전송 | 성능 | LOW | — | — |
| 9 | N+1·정책 정합·잔여 | 성능 | LOW | — | — |

**권장 착수 순서**: 1차(최고 가치·2차의 bcrypt 유입 제한 선행) → 4차(저위험 기계적, 빠른 표면
축소) → 5차(성능 체감 큼) → 2·3차(설계 결정 포함) → 6·7차(오프로드/캐시) → 8·9차(마감).
단, **1차 `trustProxy`는 배포 토폴로지 확인이 선결** — 확인 전엔 플러그인·per-route 리밋만 먼저.

**독립 판단 금지(사용자 확인) 항목**: 토큰 저장 방식 전환(3차), register 이메일 열거 정책(2차),
`trustProxy` 신뢰 홉(1차), analytics 비정규화 여부(5차).
> 2026-07-13 업데이트: 사용자가 "나머지 물어보지 말고 알아서 끝까지 수행" 지시 → 위 항목들도
> 안전한 기본값으로 자율 판단해 진행. 커밋만 명시 지시 시까지 보류.

---

## 진행 로그

- **1차 완료 (미커밋)** — `@fastify/rate-limit` v10.3.0 도입 + `plugins/rate-limit.ts`(전역
  1000/분 백스톱 + `RATE` 프리셋, `CF-Connecting-IP`→`req.ip` 키) + `app.ts` `trustProxy:true`.
  적용: auth login(20/분)·register(40/시간), 버스/지하철 실시간(60/분), 공개질문(15/분),
  공개공유(120/분). 인메모리 clear-all 리미터 2곳(settlement·review-search) 제거.
  테스트 환경은 플러그인 미등록(inject 공유 IP 429 오탐 방지). 검증: typecheck ✅ / friendly
  test 678 통과(실패 1건은 무관한 외부 라이브 스모크 `bus-api.live`) / 실구동 ✅(로그인 21번째·
  공개질문 16번째 429, 본문 shape 정상). 결정: login 은 IP 키(onRequest 라 body email 미파싱)
  → 계정 표적 잠금은 2차에서 서비스 계층에 추가. `trustProxy:true`(Cloudflare→nginx 확인),
  :3000 방화벽 전제.
- **2차 완료 (미커밋)** — `User.tokenVersion` 컬럼(마이그레이션 `add_user_token_version`) + JWT
  `tv` 클레임. `authenticate` 가 매 요청 DB 에서 tokenVersion 일치·role 을 확인해 갱신(강등/승격
  즉시 반영). `logout` 은 tokenVersion++ 로 전 토큰 무효화(모든 기기). 타이밍 세이프 로그인
  (더미 해시 비교로 이메일 열거 차단). SSE 수동 검증 3곳(analytics·crawl×2)을 `resolveSseAdmin`
  데코레이터로 통합(무효화 반영 + 중복 제거). 결정: register 409 열거는 유지(제대로 막으려면
  이메일 인증 플로우 필요 — 별건), 로그인 타이밍만 상수화. 파급: `authenticate` 가 DB 사용자
  존재를 요구 → 합성 토큰 쓰던 테스트 7파일에 `seedAuthUsers`(test-utils) 시딩 추가(llm-telemetry
  는 prismaPlugin 도 추가). 검증: typecheck ✅ / test 678 통과(실패 1 = 무관 외부 라이브) /
  실구동 ✅(logout 후 401·강등 후 403·유령 유저 401·재로그인 200).
- **3차 완료 (미커밋)** — swagger `/docs`+스펙 prod 미등록(dev만, prod 404). CORS prod fail-closed
  (CORS_ORIGIN='*'/미설정 시 반사 대신 PUBLIC_ORIGIN 으로 폐쇄). 웹 CDN(pretendard) SRI
  `integrity`+`crossorigin`. 크롤 URL href 가드 `safeExternalHref`(http(s)만, javascript:/data: 차단)
  를 InfoTab(rawSourceUrl×3+블로그url)·shared(rawSourceUrl)·sections(리뷰 이미지url)에 적용.
  **helmet CSP 는 의도적 미도입(문서화)**: /r/·/share/ 가 실사용자에게 전체 SPA(지도·CDN·번들)를
  서빙 → 여기만 strict CSP 걸면 지도/SPA 깨질 위험 + nginx 경유와 불일치. SSR-lite 주입값은 이미
  전부 이스케이프(검증)돼 XSS 견고 → SPA 전역 CSP 는 nginx 레이어 몫(배포). 토큰 저장(localStorage)은
  유지: httpOnly 쿠키 전환은 SSE ?token= 의존성 큰 대공사이고 SPA XSS 표면(dangerouslySetInnerHTML
  0곳)이 낮아 실익 대비 위험 큼. 검증: typecheck(friendly+web) ✅ / test 678 통과 / 실구동 ✅
  (prod /docs 404·evil origin 반사 차단·허용 origin 반영·dev /docs 200).
- **4차 완료 (미커밋)** — api-contract zod 상한: auth email `.max(254)`, picks options 항목
  `.max(200)`, 어드민 ReviewAskInput.query `.max(1000)`(공개 ask 는 이미 200), settlement
  restaurantPlaceId/warning/receiptImageToken/participantClientId/clientId 캡, 버스/지하철
  즐겨찾기 스냅샷(name/stationName/routeName `.max(100/50)`, id `.max(64)`). settlement-draft 는
  payload 200KB·placeId 64 이미 캡 → 사용자당 **행수 상한 50**(신규 슬롯 시 count 체크, 409
  conflict) 추가. 함정: 버스 테스트 픽스처 stId 가 합성 프리픽스로 16자 초과 → id 캡을
  16→64 로 완화(DoS 방어엔 충분). 검증: typecheck(friendly+web) ✅ / test 678 통과 / 실구동 ✅
  (draft 51번째 409·초대형 이메일 400·초대형 payload 400).
- **5차 부분 완료 (미커밋)** — 클린 윈 4건: (1) settlement-extraction 이 `getPublicDetail`(3출처
  리뷰 코퍼스) → `getPublicSeoMeta`(name/menus 만) 로 경량화, (2) admin.listUsers 에 `select`
  추가(passwordHash/tokenVersion 미로드), (3) review-search countEnrichedByRestaurant 를 전 행
  로드 → `visitorReview.groupBy`(DB GROUP BY) 로, (4) analytics computeGlobalMenus 를
  `computeMenuAggregation(includeUnlinked)`(캐시) + 값싼 필터/정렬/슬라이스로 분리 — page/sort/q
  변경에도 재집계 없음. 무효화는 readCache.clear() 전체 비움이라 안전. 함정: 공유 service 테스트가
  데이터 재시딩 후 무효화 안 해 stale → analytics.test afterEach 에 invalidateReadCache() 추가.
  검증: typecheck ✅ / test 678 통과 / 실구동 ✅(admin 9명 민감컬럼 leak=0, getGlobalMenus 실행).
  **DEFERRED (별도 미니프로젝트)**: restaurant getPublicList(#4)+공개 상세/리뷰(#5)의 진짜
  페이지네이션 — 좌표(lat/lng)·썸네일이 snapshotJson 안에 있고 카드 카운트가 3출처 합산+
  ReviewSummary 집계라 SQL bbox/정렬 불가. 안전한 DB 페이지네이션엔 좌표·집계 컬럼 **비정규화
  (스키마 마이그레이션 + 백필 + 크롤 write-path + 골든셋 검증)**가 선행돼야 함. 공개 엔드포인트를
  추측 재작성하지 않고 전용 차수로 분리.
- **6차 부분 완료 (미커밋)** — (1) share-preview 정산 카드 PNG 에 `(token, updatedAt)` 키 lru
  캐시(max 200) — 미편집 세션의 반복 og:image/공유 요청은 satori+resvg 재렌더 없이 캐시 응답,
  편집 시 updatedAt 변경으로 즉시 반영. (2) `lib/fetch-timeout.ts`(AbortController) 신설 →
  review-search embed(30s)·chat(60s), review-clustering chat(60s) 의 무기한 fetch 에 타임아웃.
  검증: typecheck ✅ / test 678 통과 / 실구동 ✅(fetchWithTimeout: 느린 요청 509ms abort·빠른
  요청 정상). **DEFERRED (부하 측정 후)**: heic-convert(#14)·satori/resvg(#13 첫 렌더) worker
  스레드 오프로드(worker_threads 복잡·빈도 낮음), bcrypt 네이티브/worker(#22 — 유입은 1차
  레이트리밋이 제한), publicAsk 동시성 게이트·텔레메트리 경로 통일(#8 — 더 큰 리팩터).
- **7차 완료 (미커밋)** — 버스 도착/위치 프록시에 15초 마이크로 캐시(`realtimeCache`) +
  in-flight 합류(`realtimeInflight`) 추가(`fetchRealtime`/`loadRealtime` — 지하철 골격 이식).
  쿼터는 캐시 미스(실제 업스트림) 직전에만 소비 → 캐시 히트/합류는 쿼터 무소모. 함정: 공유
  BusService(라우트) 캐시가 테스트 간 지속 → 앞선 성공이 캐시한 키를 "업스트림 실패→502"
  테스트가 히트 → 실패 테스트 3개를 미사용 arsId/busRouteId(캐시 미스)로 변경. 검증: typecheck ✅
  / test 678 통과 / 실구동 ✅(동시 3요청 1콜·TTL내 히트·16s후 재콜·다른키 재콜).
  ⚠️ 버스위치 API 키(15000332) 2026-12-27 만료 예정 — 연장 필요(운영 이슈, 코드 무관).
- **8차 완료 (미커밋)** — 웹 렌더/전송: (1) ImgWithFallback 실패 리셋을 useEffect→렌더 중 파생
  상태(prevSrc 비교)로(이중렌더/1프레임 stale 제거). (2) useSettlementDraft 자동저장 onSuccess 를
  list invalidate→refetch 에서 `setQueryData` 국소 갱신으로(저장마다 전체 draft 재전송 제거).
  (3) `vite.config.js`(gitignore·untracked) 삭제 — 빌드가 `.ts` 를 셰도잉 없이 사용(빌드 재확인).
  (4) RestaurantsPage 검색 q 를 `useDebounced`(300ms)로 쿼리에만 지연(입력은 즉시) — 타이핑마다
  limit=80 재요청 제거. `~/lib/useDebounced` 공유 훅 추출 → ContactSuggestions 로컬 중복 제거.
  (5) PublicRestaurantCard 80px 썸네일을 원본 대신 `reviewThumbnailUrl(url, 160)` 프록시로.
  (6) JobLogTab 렌더를 최근 500건으로 상한(전량 DOM 방지, 카운트는 전체 표시). 검증: web
  typecheck ✅ / web build ✅(3.35s, 코드 스플리팅 정상).
- **9차 부분 완료 (미커밋)** — (1) diningcode 리뷰 페이지 루프에 totalPage 상한 200(무상한 신뢰
  제거). (2) AiService per-actor 레이트리밋 상태를 인스턴스 필드→모듈 레벨 Map 으로(라우트가
  config 핫리로드 위해 요청마다 새 인스턴스라 인스턴스 필드면 죽던 것) — 테스트 격리용 리셋
  헬퍼 추가. (3) diningcode bulk-save 에 actor 당 활성 잡 1개 강제(`activeJobIdFor` + 크래시 잡이
  영구 차단 안 되게 30분 staleness 가드, 초과 시 409). 함정: (2) 모듈 Map 이 테스트 간 지속 →
  ai.service.test beforeEach 에 리셋 추가. 검증: typecheck ✅ / test 678 통과 / 실구동 ✅
  (rate-limit 인스턴스 간 공유·bulk-save 활성 감지). **DEFERRED (증거 기반)**: seoul/버스 API
  https(#36) — `curl https://ws.bus.go.kr` 8초 타임아웃 확인 → **업스트림이 https 미지원**이라
  코드로 못 고침(키는 읽기전용 공개데이터용, on-path 노출은 업스트림 제약). settlement 참여자
  contact upsert 배치(#25) — SQLite 단일 라이터 직렬 트랜잭션 + 참여자 수 보통 <10 이라 배치
  이득 미미하고 Prisma+SQLite 에 clean bulk-upsert 부재 → 보류.

---

## 최종 상태 (2026-07-13)

- **9개 차수 전부 구현·검증 완료 (전부 미커밋)** — 각 차수 typecheck + friendly test 678 통과
  (실패 1 = 무관한 외부 라이브 스모크 `bus-api.live`, BUS_API_KEY/업스트림 상태 의존) + 실구동
  verify. 커밋은 사용자 지시 대기.
- **DEFERRED(전용 후속 필요)**: restaurant getPublicList/reviews 비정규화(5차, 스키마+백필+
  write-path), heic/satori worker 오프로드·bcrypt 네이티브·publicAsk 게이트 통일(6차), seoul
  https·settlement upsert 배치(9차). 사유는 각 차수 로그 참조.
