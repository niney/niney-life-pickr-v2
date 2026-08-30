---
topic: vote
last_compiled: 2026-08-17
sources_count: 18
status: active
aliases: [그룹투표, 투표, group-vote, vote-session, approval-voting, 복수찬성, 티브레이크, tie-break, voterKey, 투표방, VoteSession, VoteOption, VoteBallot, useVote, voteGuestStore, vote-preview, 우리뭐먹을까, 링크투표, 슬롯머신결과]
---

# vote — 그룹 투표 픽 (링크 공유 approval 투표)

**2026-08-16~17 신설 — 전체 기능 + 잔여 갭 정리**: "우리 뭐 먹을까?" 를 링크 하나로 정하는 그룹 투표(커밋 `8951b31`). 방장(로그인)이 등록 맛집에서 후보 2~8곳을 골라 투표방을 만들고, 링크를 받은 참가자는 **비로그인**으로 이름만 입력해 복수 찬성(approval) 투표한다. 방장이 수동 마감하면 결과가 확정되고, 동점이면 동점 후보만 대상으로 기존 smartPick(분석 가중 랜덤)이 최종 결정한다. 후속(`6a3a022`)으로 마감 크래시 복구 배너·`/vote/new` 홈 복귀 링크·토큰 생성 실패 500 을 정리했고, 웹 테스트(3화면 20건)가 이 기능을 계기로 신설된 웹 테스트 인프라([web](web.md)) 위에 있다.

## Purpose [coverage: high — 6 sources]

혼자 뽑기(홈 슬롯머신 픽)의 소셜 갈래. 결정 권한을 서버에 두는 것이 핵심 — 동점 티브레이크가 랜덤(smart-pick 가중 또는 균등)이라 조회 시 재계산할 수 없으므로 마감 시점에 `winnerOptionId`/`decidedBy` 를 확정 저장하고, 클라이언트(슬롯머신 연출)는 서버가 정한 승자에 감속 정지하는 **연출만** 담당한다. 참가자 식별은 클라 영속 UUID(voterKey) — 기기 단위 중복 방지 수준이며 완벽하지 않음을 제품 결정으로 수용(위조 방어는 IP rate-limit + 바운드 zod).

## Architecture [coverage: high — 8 sources]

- BE: [apps/friendly/src/modules/vote/](../../apps/friendly/src/modules/vote/) — `vote.route.ts`(HTTP)·`vote.service.ts`(도메인)·`vote-preview.ts`(OG)·`vote.route.test.ts`(16건)
- 계약: [packages/api-contract/src/schemas/vote.ts](../../packages/api-contract/src/schemas/vote.ts) (+ `routes.ts` 의 `Routes.Vote`)
- FE 공통: [packages/shared/src/api/vote.api.ts](../../packages/shared/src/api/vote.api.ts) · [hooks/useVote.ts](../../packages/shared/src/hooks/useVote.ts) · [stores/voteGuestStore.ts](../../packages/shared/src/stores/voteGuestStore.ts)
- 웹: [apps/web/src/routes/vote/](../../apps/web/src/routes/vote/) — `VoteNewPage`(생성, RequireUser)·`VotePage`(공개 투표)·`VoteResultView`(마감 결과) + 각 테스트

정산 공유(settlement share)의 토큰 패턴을 미러: 생성 시 즉시 7바이트 base64url 토큰(10자) 발급 — **링크가 곧 투표방** — + 7일 고정 TTL. 만료 후 재발급/연장은 v1 스코프 밖(방장도 결과를 못 보게 됨을 수용).

## Talks To [coverage: high — 5 sources]

- **RestaurantService.smartPick 재사용** — 동점 티브레이크. 동점 후보의 placeId 만 `candidatePlaceIds` 로 넘겨 분석 가중 랜덤, 전부 분석 없음(picked null)이면 균등 랜덤. smartPick 이 내부에서 `this.prisma` 를 직접 쓰므로 interactive `$transaction` 안에서 부르지 않는다.
- **rate-limit 플러그인** — 공개 조회 `RATE.publicShare`(120/분), 무인증 쓰기(투표 제출) `RATE.publicVote`(30/분 — 재투표 연타 + CGNAT 고려).
- **vote-preview → 웹 dist index.html** — `/vote/:token`(origin 루트, autoload 밖 — app.ts 명시 등록)이 SPA index 에 OG 메타를 주입. 운영은 nginx `^~ /vote/` 프록시 필요 — 없어도 SPA 는 동작하고 OG 만 빠짐([docs/deploy-friendly.md](../../docs/deploy-friendly.md)).
- 웹 생성 페이지는 공개 목록 검색(`useRestaurantsPublic`)·서버 즐겨찾기(`useRestaurantFavorites` 로그인 분기)에서 후보를 고른다.

## API Surface [coverage: high — 4 sources]

| 메서드 | 경로 | 인증 | 비고 |
|---|---|---|---|
| POST | `/api/v1/votes` | Bearer | 생성 — 제목 + 후보 2~8(placeId 중복 금지), 응답에 token |
| GET | `/api/v1/votes` | Bearer | 내가 만든 투표 최근 20 — 링크(토큰) 복구용 |
| POST | `/api/v1/votes/:id/close` | Bearer(방장) | 마감 — 멱등, 타인 403 |
| GET | `/api/v1/share/votes/:token` | 공개 | 옵셔널 인증으로 `isOwner` 판정. 없음 404 / 만료 **410** |
| PUT | `/api/v1/share/votes/:token/ballot` | 공개 | voterKey 찬성 집합 **풀 리플레이스**(빈 배열=철회). 마감 후 409 |

변경 응답은 갱신된 세션 전체 — 클라가 캐시를 통째로 교체(즐겨찾기와 동일 계약). 폴링은 진행 중에만 15초, `closedAt` 이 오면 중단.

## Data [coverage: high — 3 sources]

마이그레이션 `20260713055432_add_vote_tables`:
- `vote_sessions` — userId(FK cascade)·title·shareToken(unique)·shareExpiresAt·closedAt·winnerOptionId·decidedBy(`'votes' | 'smart-pick' | 'random'`)
- `vote_options` — 후보 **스냅샷**(placeId/name/category/thumbnailUrl + orderIndex). Restaurant 마스터와 FK 로 묶지 않는다 — 어드민 삭제/재크롤에도 투표방 생존(즐겨찾기와 동일 설계)
- `vote_ballots` — 찬성 1건 = 1행. `(optionId, voterKey)` 유니크, voterLabel 은 표시 이름 스냅샷

게스트 로컬: `voteGuestStore`(zustand persist `vote-guest-v1`) — 기기 영속 guestId(=voterKey), 마지막 표시 이름, 토큰별 내 찬성 기록(최근 20개 캡). 서버에 "내 찬성 목록" 조회 API 가 없어 **재방문 체크 복원은 전적으로 이 스토어 몫**.

## Key Decisions [coverage: high — 6 sources]

- **마감 = 2단계 원자 클레임** — ① `updateMany(closedAt: null → now)` 로 선점해 이후 표를 전부 409 로 차단 → ② 표가 더 못 들어오는 상태에서 집계·티브레이크 → winner 확정도 `updateMany(winnerOptionId: null)` 조건부. 이중 호출·크래시 복구 모두 멱등이고 확정된 winner 는 절대 덮어쓰지 않는다.
- **단독 최다 → `votes`, 동점 → 동점 후보만 smartPick(`smart-pick`), 분석 전무 → 균등(`random`)** — 0표 마감도 전원 동점으로 처리돼 winner 가 항상 존재.
- **투표 제출은 풀 리플레이스** — 재투표=수정, 빈 배열=철회. 트랜잭션 deleteMany+createMany 라 동시 재투표는 나중 것이 이긴다.
- **만료 410 vs 없음 404** — FE 가 "만료됐어요"(7일 안내)와 "잘못된 주소"를 다른 문구로 분기.
- **토큰 생성 5회 충돌 시 일반 Error(500)** — 56bit 랜덤 5연속 충돌은 서버 이상이지 클라이언트 잘못이 아니다(처음엔 VoteError not_found=404 였다가 `6a3a022` 에서 수정).
- **결과 화면 연출 탈출구** — jsdom/백그라운드 탭처럼 CSS transition 이 발화하지 않는 환경에서 `transitionend` 가 영영 안 올 수 있어, "결과 바로 보기" 버튼(타이머 없는 이벤트 기반 안전장치)을 둔다. 웹 테스트가 이 탈출구로 연출을 건너뛴다.

## Gotchas [coverage: high — 5 sources]

- **마감 크래시 복구는 방장 배너 경유** — closedAt 클레임 뒤 winner 확정 전에 서버가 죽으면 "결과 없는 마감" 상태. close 재호출이 곧 복구(멱등)지만 참가자 화면엔 버튼이 없다 — VotePage 가 `closedAt && !winnerOptionId && isOwner` 일 때만 "결과 확정하기" 배너를 띄운다(`6a3a022`).
- **voterKey 는 신뢰 경계가 아니다** — localStorage 초기화 = 새 투표자. 방어는 rate-limit 뿐.
- **앱(mobile) 미연동** — `setVoteGuestStorage(AsyncStorage)` 미주입 상태. 앱에 vote 화면 자체가 없어 화면 이식과 함께 갈 것([shared](shared.md) 의 injectable storage 패턴 참조).
- **OG 는 nginx 규칙 의존** — `location ^~ /vote/` 프록시가 없으면 nginx 가 정적 index.html 을 서빙해 SPA 는 정상, 카톡 미리보기만 빠진다. index.html 은 프로세스 수명 1회 캐시라 재배포 후 pm2 reload 필수.
- **`/vote/new` 와 `/vote/:token` 은 PublicLayout 밖 단독 라우트** — TopBar 없음. 생성 페이지에만 "← 홈으로" 링크를 명시(참가자 화면은 의도적으로 투표만 하게 둔다). v6 라우터는 정적 세그먼트(new)가 :token 보다 우선 매칭이라 순서 무관.

## Sources [coverage: high — 14 sources]

- [apps/friendly/src/modules/vote/vote.route.ts](../../apps/friendly/src/modules/vote/vote.route.ts)
- [apps/friendly/src/modules/vote/vote.service.ts](../../apps/friendly/src/modules/vote/vote.service.ts)
- [apps/friendly/src/modules/vote/vote-preview.ts](../../apps/friendly/src/modules/vote/vote-preview.ts)
- [apps/friendly/src/modules/vote/vote.route.test.ts](../../apps/friendly/src/modules/vote/vote.route.test.ts) — 16건(멱등 재호출·0표 마감·동점 placeIds 전달 포함)
- [apps/friendly/prisma/migrations/20260713055432_add_vote_tables/migration.sql](../../apps/friendly/prisma/migrations/20260713055432_add_vote_tables/migration.sql)
- [packages/api-contract/src/schemas/vote.ts](../../packages/api-contract/src/schemas/vote.ts)
- [packages/shared/src/api/vote.api.ts](../../packages/shared/src/api/vote.api.ts)
- [packages/shared/src/hooks/useVote.ts](../../packages/shared/src/hooks/useVote.ts)
- [packages/shared/src/stores/voteGuestStore.ts](../../packages/shared/src/stores/voteGuestStore.ts) (+[test](../../packages/shared/src/stores/voteGuestStore.test.ts))
- [apps/web/src/routes/vote/VoteNewPage.tsx](../../apps/web/src/routes/vote/VoteNewPage.tsx) (+[test](../../apps/web/src/routes/vote/VoteNewPage.test.tsx))
- [apps/web/src/routes/vote/VotePage.tsx](../../apps/web/src/routes/vote/VotePage.tsx) (+[test](../../apps/web/src/routes/vote/VotePage.test.tsx))
- [apps/web/src/routes/vote/VoteResultView.tsx](../../apps/web/src/routes/vote/VoteResultView.tsx) (+[test](../../apps/web/src/routes/vote/VoteResultView.test.tsx))
- [docs/deploy-friendly.md](../../docs/deploy-friendly.md) — nginx `^~ /vote/` 규칙
- [apps/friendly/src/plugins/rate-limit.ts](../../apps/friendly/src/plugins/rate-limit.ts) — RATE.publicVote
