---
topic: vote
last_compiled: 2026-10-10
sources_count: 25
status: active
aliases: [그룹투표, 투표, group-vote, vote-session, approval-voting, 복수찬성, 티브레이크, tie-break, voterKey, 투표방, VoteSession, VoteOption, VoteBallot, useVote, voteGuestStore, vote-preview, 우리뭐먹을까, 링크투표, 슬롯머신결과, 코스 추천 프리필, presetTitle, presetOptions, VotePresetState, /travel/plan → /vote/new, 투표자 상한, 참여 인원이 가득 찼어요, VOTE_VOTERS_MAX, VOTE_VOTERS_FULL_MESSAGE_PREFIX, VOTE_OPTIONS_MAX, VOTE_OPTIONS_MIN, constants.ts, full 409, assertVoterRoom, loadTally, Tally, SESSION_SELECT, findSessionByToken, TALLY_ROWS_MAX, VOTER_NAMES_PER_OPTION, sharedVoteRefetchInterval, VOTE_POLL_INTERVAL_MS, CandidateRow memo, perf-2, F-5]
---

# vote — 그룹 투표 픽 (링크 공유 approval 투표)

**2026-10-05 변경 흡수 — 성능 감사 2차 F-5: 세션당 투표자 100명 상한(409)·표를 안 읽는 검증·후보별 앞 100명(`78cbb457`) + 웹이 상한 409 를 마감과 구분(`4710c617`) + 값 상수를 zod 없는 `constants.ts` 로(`da755684`) + 웹 헛조회·폴링 정리(`82d455c7`)**: (1) **투표자 상한** — voterKey 는 클라 임의값이라 무인증 PUT(IP 30/분)으로 키를 바꿔 가며 표를 무한히 쌓을 수 있었고, 조회·15초 폴링이 표 전량을 읽어 1만 명이면 GET 0.8초·이벤트 루프 134~165ms, 5만 명이면 4.3초였다([PLAN-perf-2-findings](../../docs/PLAN-perf-2-findings.md) F-5). 이제 **새 voterKey 의 투표만** 세션당 `VOTE_VOTERS_MAX = 100` 에서 409(`VoteError('full')` — "참여 인원이 가득 찼어요(최대 100명). 이미 투표한 사람만 수정할 수 있어요."), 이미 투표한 사람의 수정·철회와 빈 투표는 그대로 받는다. 검사는 `(sessionId, voterKey)` 인덱스로 "내 표 있나" → 없으면 원시 SQL `COUNT(DISTINCT voterKey)`. (2) **조회 경량화** — `include: { options, ballots }` 풀 로드(`FULL_INCLUDE`)를 걷고 세션 메타 + 후보만(`SESSION_SELECT`) 읽어 **없음·만료(410)·마감을 표를 읽기 전에** 판정한다. 표는 `loadTally` 가 따로 — 찬성 시각순 `take: 100 × 8 + 1` 행만 읽어 후보별 count·앞 100명 이름·distinct 투표자 수를 세고, 그보다 많으면(상한 도입 전에 쌓인 세션) 수는 `groupBy`·`COUNT(DISTINCT)` 로 정확히, 이름은 앞쪽 행에서만. 마감의 승자 결정(`decideWinner`)도 같은 집계를 받는다. 상한 이전 1만 명 세션 조회 539~624 → 51ms. (3) **웹 문구** — 상한도 마감 직후 도착한 표와 같은 409 라 웹이 상한에 걸린 사람에게 "방금 마감된 투표예요"를 보여 줬다. 메시지 앞머리를 api-contract 공용 상수 `VOTE_VOTERS_FULL_MESSAGE_PREFIX` 로 두고 서버가 그것으로 메시지를 만들며, [VotePage](../../apps/web/src/routes/vote/VotePage.tsx)는 409 메시지가 그 앞머리로 시작하면 서버 문구를 그대로 띄운다. (4) **상수 위치** — `VOTE_OPTIONS_MIN/MAX`·`VOTE_VOTERS_FULL_MESSAGE_PREFIX` 가 `schemas/vote.ts` 에서 zod 없는 [constants.ts](../../packages/api-contract/src/constants.ts) 로 옮겨졌다(스키마 파일의 값을 웹이 import 하면 zod·스키마가 같이 실린다 — 첫 로드 JS 2,059 → 516kB 작업의 일부, [web](web.md)). 스키마는 거기서 가져다 쓴다. (5) **웹 헛조회·폴링** — [VoteNewPage](../../apps/web/src/routes/vote/VoteNewPage.tsx)의 공개 맛집 검색은 검색어가 있을 때만(`useRestaurantsPublic(..., { enabled: debouncedQ !== '' })` — 빈 검색은 그리지도 않는데 서버에서 가장 무거운 공개 경로였다), `addOption` 을 함수형 setState + `useCallback([])` 로 고정하고 후보 행 `CandidateRow` 를 `memo`(즐겨찾기 최대 100행이 제목·검색 한 글자마다 다시 그려지지 않게). 공개 투표 폴링은 새 순수 함수 `sharedVoteRefetchInterval` 이 판정 — 마감이면 멈추고, **만료(410)·없는 링크(404) 같은 4xx 에서도 멈춘다**(한 번도 성공 못 한 쿼리는 재조회 때 pending 으로 돌아가 에러 화면이 15초마다 스피너로 깜빡였다), 408·429·5xx·네트워크 단절은 계속 폴링. 테스트: friendly `vote.route.test` 16 → 19건(상한·상한 이전 세션·만료 410 선판정), 새 shared [useVote.test.ts](../../packages/shared/src/hooks/useVote.test.ts), 웹 `VotePage.test`(상한 문구·폴링 2건)·`VoteNewPage.test`(빈 검색 미조회). 관련 컨셉: [amplification-caps](../concepts/amplification-caps.md).

**2026-09-13 변경 흡수 — 여행로그 코스 추천이 투표방을 미리 채워 넘김**: 여행로그 5차(`99991da`, [tour](tour.md))의 `/travel/plan`(비슷한 여행자가 만족한 곳)에서 **등록된 맛집만** 2~8곳 체크해 "그룹투표 만들기"를 누르면 `navigate('/vote/new', { state: { presetTitle, presetOptions } })` 로 넘어오고, [VoteNewPage](../../apps/web/src/routes/vote/VoteNewPage.tsx)가 `useLocation().state`(`VotePresetState`)를 **첫 렌더에만** 읽어 제목·선택 후보(`VOTE_OPTIONS_MAX` 로 잘라)를 초기값으로 쓴다. 서버 계약·투표 로직은 그대로(후보는 여전히 등록 맛집의 `VoteOptionInputType` 스냅샷) — 새로 생긴 건 투표방 **진입 경로 하나**뿐이며, 로그인 필요(`RequireUser`)·후보 2~8 검증도 그대로 적용된다.

**2026-08-16~17 신설 — 전체 기능 + 잔여 갭 정리**: "우리 뭐 먹을까?" 를 링크 하나로 정하는 그룹 투표(커밋 `8951b31`). 방장(로그인)이 등록 맛집에서 후보 2~8곳을 골라 투표방을 만들고, 링크를 받은 참가자는 **비로그인**으로 이름만 입력해 복수 찬성(approval) 투표한다. 방장이 수동 마감하면 결과가 확정되고, 동점이면 동점 후보만 대상으로 기존 smartPick(분석 가중 랜덤)이 최종 결정한다. 후속(`6a3a022`)으로 마감 크래시 복구 배너·`/vote/new` 홈 복귀 링크·토큰 생성 실패 500 을 정리했고, 웹 테스트(3화면 20건)가 이 기능을 계기로 신설된 웹 테스트 인프라([web](web.md)) 위에 있다.

## Purpose [coverage: high — 6 sources]

혼자 뽑기(홈 슬롯머신 픽)의 소셜 갈래. 결정 권한을 서버에 두는 것이 핵심 — 동점 티브레이크가 랜덤(smart-pick 가중 또는 균등)이라 조회 시 재계산할 수 없으므로 마감 시점에 `winnerOptionId`/`decidedBy` 를 확정 저장하고, 클라이언트(슬롯머신 연출)는 서버가 정한 승자에 감속 정지하는 **연출만** 담당한다. 참가자 식별은 클라 영속 UUID(voterKey) — 기기 단위 중복 방지 수준이며 완벽하지 않음을 제품 결정으로 수용(위조 방어는 IP rate-limit + 바운드 zod).

## Architecture [coverage: high — 11 sources]

- BE: [apps/friendly/src/modules/vote/](../../apps/friendly/src/modules/vote/) — `vote.route.ts`(HTTP)·`vote.service.ts`(도메인)·`vote-preview.ts`(OG)·`vote.route.test.ts`(16건 → 2026-10-05 19건)
  - `vote.service.ts` 내부(2026-10-05 `78cbb457`): `SESSION_SELECT`(세션 메타 + 후보, `satisfies Prisma.VoteSessionSelect`)로 읽는 `findSessionByToken`(없음 404·만료 410 을 표 읽기 전에), 표 집계 `loadTally(sessionId) → Tally { counts, voters, totalVoters }`, 새 투표자 검사 `assertVoterRoom(sessionId, voterKey)`. 상수 `VOTE_VOTERS_MAX = 100`(export — 라우트 설명문·테스트가 쓴다), `VOTER_NAMES_PER_OPTION = 100`, `TALLY_ROWS_MAX = 100 × VOTE_OPTIONS_MAX`. 생성 직후 응답은 표가 없으니 `EMPTY_TALLY`. `submitBallot` 은 검증(만료·마감·후보)을 메타·후보만으로 하고 쓰기 뒤 `getSharedByToken` 으로 다시 조회한다.
- 계약: [packages/api-contract/src/schemas/vote.ts](../../packages/api-contract/src/schemas/vote.ts) (+ `routes.ts` 의 `Routes.Vote`). 값 상수 `VOTE_OPTIONS_MIN`(2)·`VOTE_OPTIONS_MAX`(8)·`VOTE_VOTERS_FULL_MESSAGE_PREFIX` 는 2026-10-05 부터 zod 없는 [constants.ts](../../packages/api-contract/src/constants.ts)(배럴 `index.ts` 가 re-export — import 경로 `@repo/api-contract` 는 그대로).
- FE 공통: [packages/shared/src/api/vote.api.ts](../../packages/shared/src/api/vote.api.ts) · [hooks/useVote.ts](../../packages/shared/src/hooks/useVote.ts)(2026-10-05 폴링 간격 판정 `sharedVoteRefetchInterval` export, `VOTE_POLL_INTERVAL_MS = 15_000`) · [stores/voteGuestStore.ts](../../packages/shared/src/stores/voteGuestStore.ts)
- 웹: [apps/web/src/routes/vote/](../../apps/web/src/routes/vote/) — `VoteNewPage`(생성, RequireUser)·`VotePage`(공개 투표)·`VoteResultView`(마감 결과) + 각 테스트. 둘 다 `App.tsx` 에서 lazy 청크.

정산 공유(settlement share)의 토큰 패턴을 미러: 생성 시 즉시 7바이트 base64url 토큰(10자) 발급 — **링크가 곧 투표방** — + 7일 고정 TTL. 만료 후 재발급/연장은 v1 스코프 밖(방장도 결과를 못 보게 됨을 수용).

## Talks To [coverage: high — 7 sources]

- **RestaurantService.smartPick 재사용** — 동점 티브레이크. 동점 후보의 placeId 만 `candidatePlaceIds` 로 넘겨 분석 가중 랜덤, 전부 분석 없음(picked null)이면 균등 랜덤. smartPick 이 내부에서 `this.prisma` 를 직접 쓰므로 interactive `$transaction` 안에서 부르지 않는다.
- **rate-limit 플러그인** — 공개 조회 `RATE.publicShare`(120/분), 무인증 쓰기(투표 제출) `RATE.publicVote`(30/분 — 재투표 연타 + CGNAT 고려). 2026-10-05 이전엔 이것이 유일한 방어라 IP 하나로 하루 수만 voterKey 를 쌓을 수 있었다 — 이제 세션당 투표자 100명이 저장량 자체의 상한([amplification-caps](../concepts/amplification-caps.md)).
- **vote-preview → 웹 dist index.html** — `/vote/:token`(origin 루트, autoload 밖 — app.ts 명시 등록)이 SPA index 에 OG 메타를 주입. 운영은 nginx `^~ /vote/` 프록시 필요 — 없어도 SPA 는 동작하고 OG 만 빠짐([docs/deploy-friendly.md](../../docs/deploy-friendly.md)).
- 웹 생성 페이지는 공개 목록 검색(`useRestaurantsPublic`)·서버 즐겨찾기(`useRestaurantFavorites` 로그인 분기)에서 후보를 고른다. 공개 목록은 2026-10-05 부터 디바운스된 검색어가 있을 때만 조회한다(`enabled` 옵션 — 공개 목록은 서버에서 가장 무거운 공개 경로([canonical](canonical.md))라 빈 검색 결과를 그리지도 않으면서 부르던 것을 끊었다).
- **여행로그 코스 추천 → 프리필**(2026-09-13, [TravelPlanPage](../../apps/web/src/routes/TravelPlanPage.tsx)) — 라우터 `location.state` 로 `presetTitle`·`presetOptions`(등록 맛집 = canonical 이 있는 추천 장소만, 미등록은 체크 불가)를 넘기고 VoteNewPage 가 초기 state 로 삼는다. URL 이 아니라 history state 라 링크 공유·새로고침 뒤엔 프리필이 없다(빈 폼으로 시작 — 정상).

## API Surface [coverage: high — 8 sources]

| 메서드 | 경로 | 인증 | 비고 |
|---|---|---|---|
| POST | `/api/v1/votes` | Bearer | 생성 — 제목 + 후보 2~8(placeId 중복 금지), 응답에 token |
| GET | `/api/v1/votes` | Bearer | 내가 만든 투표 최근 20 — 링크(토큰) 복구용 |
| POST | `/api/v1/votes/:id/close` | Bearer(방장) | 마감 — 멱등, 타인 403 |
| GET | `/api/v1/share/votes/:token` | 공개 | 옵셔널 인증으로 `isOwner` 판정. 없음 404 / 만료 **410**(2026-10-05 부터 표를 읽기 전에 판정). 후보별 `count` 는 정확한 수, `voters` 는 찬성 시각순 **앞 100명**까지(상한과 같아 정상 세션은 전원) |
| PUT | `/api/v1/share/votes/:token/ballot` | 공개 | voterKey 찬성 집합 **풀 리플레이스**(빈 배열=철회). 마감 후 409, **투표자 100명이 차면 새 voterKey 도 409**(2026-10-05 — 메시지가 `VOTE_VOTERS_FULL_MESSAGE_PREFIX` 로 시작, 기존 투표자의 수정·철회는 허용) |

변경 응답은 갱신된 세션 전체 — 클라가 캐시를 통째로 교체(즐겨찾기와 동일 계약). 폴링은 진행 중에만 15초, `closedAt` 이 오면 중단 — 2026-10-05 부터 만료·없는 링크 같은 4xx(408·429 제외)에서도 중단(`sharedVoteRefetchInterval`). 409 두 종류(마감 `closed`·상한 `full`)는 상태 코드가 같아 본문 메시지로만 구분된다. 외부 문서는 [docs/api/README.md](../../docs/api/README.md) 그룹 투표 절(`d07281f0`).

## Data [coverage: high — 5 sources]

마이그레이션 `20260713055432_add_vote_tables`:
- `vote_sessions` — userId(FK cascade)·title·shareToken(unique)·shareExpiresAt·closedAt·winnerOptionId·decidedBy(`'votes' | 'smart-pick' | 'random'`)
- `vote_options` — 후보 **스냅샷**(placeId/name/category/thumbnailUrl + orderIndex). Restaurant 마스터와 FK 로 묶지 않는다 — 어드민 삭제/재크롤에도 투표방 생존(즐겨찾기와 동일 설계)
- `vote_ballots` — 찬성 1건 = 1행. `sessionId`(FK cascade)·`optionId`·`voterKey`·`voterLabel`(표시 이름 스냅샷)·`createdAt`. `(optionId, voterKey)` 유니크 + 인덱스 `(sessionId, voterKey)` — 2026-10-05 상한 검사("내 표 있나"·`COUNT(DISTINCT voterKey)`)와 재투표 deleteMany 가 이 인덱스를 탄다. 집계의 `ORDER BY createdAt` 은 인덱스가 없지만 상한(최대 800행 + 1)만 읽으므로 문제 없다(F-5 원문이 제안한 `(sessionId, createdAt)` 인덱스는 상한을 두면 쓰기 증폭만 생겨 안 만들었다). 투표자 상한은 스키마가 아니라 코드라 마이그레이션 없음.

게스트 로컬: `voteGuestStore`(zustand persist `vote-guest-v1`) — 기기 영속 guestId(=voterKey), 마지막 표시 이름, 토큰별 내 찬성 기록(최근 20개 캡). 서버에 "내 찬성 목록" 조회 API 가 없어 **재방문 체크 복원은 전적으로 이 스토어 몫**.

## Key Decisions [coverage: high — 13 sources]

- **2026-10-05 세션당 투표자 100명, 새 voterKey 만 409(`78cbb457`)** — 계획의 "결정 필요: 투표자 상한 수치" 를 100명으로 확정. 단톡방 회식 투표엔 넉넉하고, 100명 × 후보 8 = 800행이면 조회 7.7ms·22KB(F-5 실측). 수정·철회를 막으면 이미 투표한 사람이 피해를 보므로 사람 수를 늘리는 요청만 막는다. 검사와 쓰기가 한 트랜잭션이 아닌 **소프트 상한**을 받아들였다(동시 요청이면 몇 명 넘을 수 있음 — 저장량 폭주를 막는 게 목적).
- **2026-10-05 검증은 표를 읽지 않고, 응답은 후보별 count + 앞 100명(`78cbb457`)** — 예전엔 제출 검증용 전체 로드 + 쓰기 + 재조회 전체 로드로 PUT 이 GET 의 2배 무거웠고, 만료 세션도 표를 전량 읽은 뒤 410 이었다. 메타·후보만으로 만료·마감·후보를 검증하고, 이름 목록은 상한(=100)까지만 실어 응답 크기를 묶는다. 상한 이전에 쌓인 세션도 수는 SQL 로 정확히 세 득표·승자가 틀어지지 않게 했다.
- **2026-10-05 상한 409 는 상태 코드를 새로 만들지 않고 메시지 앞머리로 구분(`4710c617`)** — 마감 409 와 같은 코드라 웹이 "방금 마감된 투표예요"를 잘못 띄웠다. 앞머리를 api-contract 상수로 공유해 서버 문구(인원·수정 가능 안내)를 웹이 그대로 보여 준다 — 에러 응답에 코드 필드를 더하는 계약 변경 없이.
- **2026-10-05 값 상수는 zod 없는 `constants.ts` 에(`da755684`)** — 스키마 파일에 둔 상수 하나를 import 해도 그 파일의 zod 스키마 생성 코드와 zod 가 딸려 온다. 투표 화면은 lazy 청크지만 같은 규칙(CLAUDE.md 1번)으로 옮겼다.
- **2026-10-05 4xx 에서 폴링 중단, 408·429·5xx 는 계속(`82d455c7`)** — 만료·없는 링크는 다시 물어도 답이 같다. 일시 오류는 계속 물어 스스로 회복하게 둔다. 판정을 순수 함수로 빼 테스트한다.
- **2026-09-13: 프리필은 URL 이 아니라 라우터 state** — 코스 추천의 후보 목록(최대 8곳 스냅샷)을 쿼리스트링에 싣지 않고 `navigate(state)` 로 넘긴다. 투표방 생성은 어차피 로그인·서버 POST 로 확정되므로 링크로 재현 가능한 상태일 필요가 없고, 후보 스냅샷(name/category/thumbnailUrl)이 URL 길이 제한에 걸리는 것도 피한다.
- **마감 = 2단계 원자 클레임** — ① `updateMany(closedAt: null → now)` 로 선점해 이후 표를 전부 409 로 차단 → ② 표가 더 못 들어오는 상태에서 집계·티브레이크 → winner 확정도 `updateMany(winnerOptionId: null)` 조건부. 이중 호출·크래시 복구 모두 멱등이고 확정된 winner 는 절대 덮어쓰지 않는다.
- **단독 최다 → `votes`, 동점 → 동점 후보만 smartPick(`smart-pick`), 분석 전무 → 균등(`random`)** — 0표 마감도 전원 동점으로 처리돼 winner 가 항상 존재.
- **투표 제출은 풀 리플레이스** — 재투표=수정, 빈 배열=철회. 트랜잭션 deleteMany+createMany 라 동시 재투표는 나중 것이 이긴다.
- **만료 410 vs 없음 404** — FE 가 "만료됐어요"(7일 안내)와 "잘못된 주소"를 다른 문구로 분기.
- **토큰 생성 5회 충돌 시 일반 Error(500)** — 56bit 랜덤 5연속 충돌은 서버 이상이지 클라이언트 잘못이 아니다(처음엔 VoteError not_found=404 였다가 `6a3a022` 에서 수정).
- **결과 화면 연출 탈출구** — jsdom/백그라운드 탭처럼 CSS transition 이 발화하지 않는 환경에서 `transitionend` 가 영영 안 올 수 있어, "결과 바로 보기" 버튼(타이머 없는 이벤트 기반 안전장치)을 둔다. 웹 테스트가 이 탈출구로 연출을 건너뛴다.

## Gotchas [coverage: high — 11 sources]

- **409 두 가지는 메시지로만 갈린다 (2026-10-05)** — 마감(`closed`)과 투표자 상한(`full`)이 같은 409 다. 웹은 `ApiError.message.startsWith(VOTE_VOTERS_FULL_MESSAGE_PREFIX)` 로 가른다 — 서버 문구를 바꿀 땐 앞머리 상수를 그대로 두거나 함께 바꿔야 하고, 새 클라이언트(앱 등)도 같은 방식으로 갈라야 한다. 상한 수 `VOTE_VOTERS_MAX`(100)는 서버 `vote.service.ts` 에만 있다(계약 상수 아님).
- **철회한 사람이 다시 투표하면 새 투표자로 센다** — 상한 검사는 "지금 그 voterKey 의 표가 있나" 만 본다. 빈 배열로 철회해 표가 0행이 된 뒤 100명이 차면 그 사람의 재투표도 409. localStorage 초기화 = 새 투표자(아래)와 같은 결.
- **상한은 소프트** — 검사(`assertVoterRoom`)와 쓰기(`$transaction` deleteMany+createMany)가 따로라 동시 요청이면 100명을 몇 명 넘을 수 있다. 정확한 100 을 가정하는 코드·테스트를 쓰지 말 것.
- **상한 이전에 쌓인 큰 세션은 이름이 일부만 보인다** — 표가 800행을 넘는 세션(2026-10-05 이전 생성)은 수·투표자 수는 SQL 로 정확하지만 `voters` 이름은 찬성 시각순 앞 800행 안에서만 고른다. 원시 SQL `COUNT(DISTINCT "voterKey")` 결과는 `bigint | number` 라 `Number()` 로 감싼다.

- **마감 크래시 복구는 방장 배너 경유** — closedAt 클레임 뒤 winner 확정 전에 서버가 죽으면 "결과 없는 마감" 상태. close 재호출이 곧 복구(멱등)지만 참가자 화면엔 버튼이 없다 — VotePage 가 `closedAt && !winnerOptionId && isOwner` 일 때만 "결과 확정하기" 배너를 띄운다(`6a3a022`).
- **voterKey 는 신뢰 경계가 아니다** — localStorage 초기화 = 새 투표자. 방어는 rate-limit 과(2026-10-05 부터) 세션당 투표자 100명 상한뿐 — 한 사람이 키를 바꿔 100명을 채우면 진짜 참가자가 409 를 받는다(상한은 서버 보호용이지 공정성 장치가 아니다).
- **앱(mobile) 미연동** — `setVoteGuestStorage(AsyncStorage)` 미주입 상태. 앱에 vote 화면 자체가 없어 화면 이식과 함께 갈 것([shared](shared.md) 의 injectable storage 패턴 참조).
- **OG 는 nginx 규칙 의존** — `location ^~ /vote/` 프록시가 없으면 nginx 가 정적 index.html 을 서빙해 SPA 는 정상, 카톡 미리보기만 빠진다. index.html 은 프로세스 수명 1회 캐시라 재배포 후 pm2 reload 필수.
- **`/vote/new` 와 `/vote/:token` 은 PublicLayout 밖 단독 라우트** — TopBar 없음. 생성 페이지에만 "← 홈으로" 링크를 명시(참가자 화면은 의도적으로 투표만 하게 둔다). v6 라우터는 정적 세그먼트(new)가 :token 보다 우선 매칭이라 순서 무관.

## Sources [coverage: high — 25 sources]

- [apps/web/src/routes/TravelPlanPage.tsx](../../apps/web/src/routes/TravelPlanPage.tsx) — 코스 추천 → `/vote/new` 프리필 진입(2026-09-13, [tour](tour.md))
- [apps/friendly/src/modules/vote/vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts) (2026-10-05 — `full` → 409, 설명문에 상한)
- [apps/friendly/src/modules/vote/vote.service.ts](../../apps/friendly/src/modules/vote/vote.service.ts) (2026-10-05 — `SESSION_SELECT`·`loadTally`·`assertVoterRoom`·`VOTE_VOTERS_MAX`)
- [apps/friendly/src/modules/vote/vote-preview.ts](../../apps/friendly/src/modules/vote/vote-preview.ts)
- [apps/friendly/src/modules/vote/vote.route.test.ts](../../apps/friendly/src/modules/vote/vote.route.test.ts) — 16건(멱등 재호출·0표 마감·동점 placeIds 전달 포함) → 2026-10-05 19건(상한 409·상한 이전 세션 집계·만료 410 선판정)
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) — `VoteBallot` 의 `(sessionId, voterKey)` 인덱스
- [apps/friendly/prisma/migrations/20260713055432_add_vote_tables/migration.sql](../../apps/friendly/prisma/migrations/20260713055432_add_vote_tables/migration.sql)
- [packages/api-contract/src/schemas/vote.ts](../../packages/api-contract/src/schemas/vote.ts) (2026-10-05 — 값 상수를 constants 에서 가져옴)
- [packages/api-contract/src/constants.ts](../../packages/api-contract/src/constants.ts) (NEW 2026-10-05 — `VOTE_OPTIONS_MIN/MAX`·`VOTE_VOTERS_FULL_MESSAGE_PREFIX`)
- [packages/shared/src/api/vote.api.ts](../../packages/shared/src/api/vote.api.ts)
- [packages/shared/src/hooks/useVote.ts](../../packages/shared/src/hooks/useVote.ts) (2026-10-05 — `sharedVoteRefetchInterval`)
- [packages/shared/src/hooks/useVote.test.ts](../../packages/shared/src/hooks/useVote.test.ts) (NEW 2026-10-05 — 폴링 간격 판정)
- [packages/shared/src/stores/voteGuestStore.ts](../../packages/shared/src/stores/voteGuestStore.ts) (+[test](../../packages/shared/src/stores/voteGuestStore.test.ts))
- [apps/web/src/routes/vote/VoteNewPage.tsx](../../apps/web/src/routes/vote/VoteNewPage.tsx) (+[test](../../apps/web/src/routes/vote/VoteNewPage.test.tsx)) (2026-10-05 — 검색어 있을 때만 조회, `CandidateRow` memo)
- [apps/web/src/routes/vote/VotePage.tsx](../../apps/web/src/routes/vote/VotePage.tsx) (+[test](../../apps/web/src/routes/vote/VotePage.test.tsx)) (2026-10-05 — 상한 409 서버 문구, 폴링 테스트)
- [apps/web/src/routes/vote/VoteResultView.tsx](../../apps/web/src/routes/vote/VoteResultView.tsx) (+[test](../../apps/web/src/routes/vote/VoteResultView.test.tsx))
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — nginx `^~ /vote/` 규칙
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — RATE.publicVote
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — 7차(F-5)·"모듈 묶음 → share"(투표자 100명 결정)
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — F-5 원문(1만·5만 명 측정, 수정안 ①~⑤)
- [docs/api/README.md](../../docs/api/README.md) — 그룹 투표 절(투표자 100명·voters 앞 100명)
