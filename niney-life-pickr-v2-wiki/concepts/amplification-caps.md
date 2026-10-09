---
concept: 요청 수가 아니라 요청 하나의 증폭률을 묶는다 — 입력이 비용을 키우는 지점마다 명시적 상한과 계약
last_compiled: 2026-10-10
topics_connected: [vote, settlement, meal, food, map, housing, life-map, parking, review-search, usage-quota, tarot, saju-c, friendly, api-contract, api-docs, web]
status: active
---

# 요청 수가 아니라 요청 하나의 증폭률을 묶는다 — 입력이 비용을 키우는 지점마다 명시적 상한과 계약

## Pattern

friendly 의 방어선은 원래 **요청 수**였다 — `@fastify/rate-limit` 전역 1000/분과 라우트별 `RATE.*` 프리셋, LLM 기능의 게스트·IP 일일 한도([anonymous-usage-quota](anonymous-usage-quota.md)). 그런데 성능 감사 2차([docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md))가 범위로 잡은 "성능성 DoS" 는 대부분 요청 수가 아니라 **요청 하나가 입력에 비례해 얼마나 커지느냐**의 문제였다. 지도 화면 하나가 `zoom=22 + 넓은 bbox` 면 셀 25만 개·14MB 응답(D-1), 투표 세션 하나에 voterKey 를 돌려 5만 명이면 조회 1회 4.3초(F-5), 정산 카드 하나가 참여자 100명×10차면 렌더 5.3초·RSS +770MB(F-V2), 썸네일 URL 의 `w·q` 를 바꿀 때마다 새 디스크 파일·sharp 연산(G-1), 식단 기록에 상한이 없어 1만 건 export 가 RSS +381MB(C-4). 분당 15회 한도는 "15회 × 증폭률" 을 막지 못한다.

처방은 일관됐다. **증폭이 일어나는 바로 그 자리에서 상한을 두고, 상한에 닿았을 때의 동작을 계약으로 정한다** — 조용히 잘리거나 500 이 나지 않게 409(가득 참)·413(너무 큼)·`truncated`·"외 n명"·강등(점 → 셀) 중 하나를 고르고, 정상 사용자는 닿지 않는 값으로.

## Instances

- **2026-10-05** in [map](../topics/map.md) / [housing](../topics/housing.md) / [life-map](../topics/life-map.md) / [parking](../topics/parking.md) (`lib/map-cells.ts`, `5655abbc`): 스냅된 bbox 의 열×행이 `MAP_CELLS_MAX` 6,000 을 넘으면 **셀을 키운다**(정상 대형 화면은 그대로), 좌표는 국내로 clamp, 점 모드는 32타일 상한을 넘거나 커버링 COUNT 가 `POINTS_DEMOTE_COUNT` 6.4만 행을 넘으면 셀 모드로 강등. CCTV z22 전국 14MB·1.2s → 33KB·265ms, 768조합 응답 전후 동일 — 거절하지 않고 해상도를 낮추는 쪽을 골랐다.
- **2026-10-05** in [vote](../topics/vote.md) (`vote.service.ts` `VOTE_VOTERS_MAX` 100, `78cbb457`·`4710c617`): 세션당 투표자 100명, 넘으면 409 + 서버 문구 접두 `VOTE_VOTERS_FULL_MESSAGE_PREFIX`(api-contract `constants.ts`) — 웹 `VotePage` 가 이 409 를 "방금 마감" 409 와 구분해 보여 준다. 검증은 경량 조회, 응답은 후보별 count + 앞 N명.
- **2026-10-05** in [settlement](../topics/settlement.md) (`settlement-card.ts` `CARD_MAX_PARTICIPANT_ROWS` 30, `78cbb457`·`622bfca2`): 공유 카드는 앞 30명 + '외 n명' 합계 행, 폭이 넘치면 차수 소계 열만, 래스터는 400만 화소까지 — 100명×10차 3,580→130ms·PNG 3.1MB→364KB. 임시저장은 payload UTF-8 200KB·사용자 합계 2MB, 목록은 메타만(30.7MB→9KB). 영수증 추출은 사용자 하루 50회(`SETTLEMENT_EXTRACT_DAILY_LIMIT`) + IP 분당 20.
- **2026-10-05** in [meal](../topics/meal.md) / [food](../topics/food.md) (`7b060ca4`): 기록 계정당 `MEAL_MAX_ENTRIES_PER_USER` 20,000·하루 30끼(409), 내보내기는 500건 커서 스트림, HEIC 는 디코드 전에 컨테이너 `ispe` 박스로 해상도를 읽어 2,500만 화소 초과 413(압축 폭탄), 새 백업 사진 합계 25MB(복원은 예전 백업을 위해 50MB 유지). 공개 메뉴 칼로리가 판정 못 한 메뉴마다 띄우던 백그라운드 LLM·웹 조회는 체인 동시 2(대기 16) + 실패 이름 백오프 — LLM 동시 최대 64 → 8.
- **2026-10-05** in [friendly](../topics/friendly.md) (`media/thumbnail-cache.ts`, `622bfca2`): 썸네일 `w·q` 를 **거부하지 않고 버킷으로 스냅**(22개 키로 접힘 — 앱이 쓰는 240·400·900 을 포함해야 해서 400 응답으로 거절하면 앱이 깨진다), 서로 다른 미스 동시 4·대기 128 초과 503.
- **2026-10-05** in [review-search](../topics/review-search.md) / [usage-quota](../topics/usage-quota.md) (`ab7dad28`): 공개 리뷰 질문은 캐시 미스 1건 = 임베딩 1 + LLM 최대 3콜이라, 분당 15회 위에 `review-ask` 기능 한도(게스트 30·IP 300·전역 3,000/일)와 답변 캐시 20분 + 같은 질문 합류(소비 없음), LLM 동시 4.
- **2026-10-05** in [tarot](../topics/tarot.md) / [saju-c](../topics/saju-c.md) / [usage-quota](../topics/usage-quota.md) (`lib/guest-share.ts`, `usage-quota.service.ts` `MEMBER_PER_DAY`, `78cbb457`): 게스트 공유는 발급마다 새 행(사주 ~7KB)이던 것을 (ip|guestKey, 입력 해시) → 토큰 재사용 + IP 하루 200개. 그리고 **회원 LLM 하루 기능별 100회** — 무료 계정 하나로 전역 예산(사주 3,000/일)을 약 21분에 태워 그날 모든 게스트를 정적 폴백으로 밀어낼 수 있어(F-4) 2026-09-02 '회원 무제한' 결정을 바꿨다(`MEMBER_PER_DAY = null` 이면 예전처럼).

## What This Means

1. **방어선을 그을 단위를 바꾼다** — 레이트 리밋은 "얼마나 자주" 를, 이 패턴은 "한 번에 얼마나 크게" 를 묶는다. 둘은 대체가 아니라 곱이다. 무인증 엔드포인트를 추가할 때 질문은 "몇 번 불릴까" 보다 "입력의 어느 필드가 서버 일을 몇 배로 키우나(bbox·zoom·참여자 수·w·q·질문 문자열·회전 가능한 키)" 가 먼저다.
2. **상한에 닿는 동작이 계약이다** — 같은 상한이라도 결과가 다르다. 지도는 강등(화면은 계속 보인다), 썸네일은 스냅(앱이 깨지지 않는다), 투표·식단은 409(사용자가 이유를 안다), HEIC 는 413, 카드는 '외 n명'(공유는 된다). 거절이 아니라 축소가 가능한 곳은 축소를 고르는 경향이 있고, 거절할 땐 FE 가 문구를 구분할 수 있게 접두·상수를 api-contract 에 둔다([lazy-heavy-imports](lazy-heavy-imports.md) 의 `constants.ts`). 외부 계약 변화라 `docs/api/README.md` 에 409/413/429 의미가 함께 적힌다.
3. **회전 가능한 키는 상한을 무력화한다** — voterKey·guestKey·썸네일 쿼리처럼 클라이언트가 만들어 내는 식별자로 회계하면, 키를 바꾸는 것만으로 한도가 리셋된다. 그래서 상한을 키가 아니라 **자원 쪽**(세션당 투표자 수, IP 당 공유 개수, 입력 해시 재사용, 버킷 수)에 건다. 같은 이유로 레이트 리밋 IP 가 클라이언트가 보낸 `CF-Connecting-IP` 를 믿는 문제(X-V4)는 nginx real_ip 설정으로 넘겼다(서버 작업, 미완).
4. **결정은 값으로 남는다** — 100명·30끼·200개·100회 같은 숫자는 제품 결정이라 PLAN 의 "결정이 필요한 것" 표에서 기본 제안으로 적용되고, 바꾼 것(회원 무제한 → 100회, 복원 50MB 유지)은 근거와 함께 기록됐다. 상한 값을 코드 상수 하나에 두고 테스트로 고정해 두면, 다음에 바꿀 때 무엇이 따라 움직이는지 보인다.

## Sources

- [map](../topics/map.md)
- [housing](../topics/housing.md)
- [life-map](../topics/life-map.md)
- [parking](../topics/parking.md)
- [vote](../topics/vote.md)
- [settlement](../topics/settlement.md)
- [meal](../topics/meal.md)
- [food](../topics/food.md)
- [friendly](../topics/friendly.md)
- [review-search](../topics/review-search.md)
- [usage-quota](../topics/usage-quota.md)
- [tarot](../topics/tarot.md)
- [saju-c](../topics/saju-c.md)
- [api-contract](../topics/api-contract.md)
- [api-docs](../topics/api-docs.md)
- [web](../topics/web.md)
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md)
- [apps/friendly/src/lib/map-cells.ts](../../apps/friendly/src/lib/map-cells.ts)
- [apps/friendly/src/lib/guest-share.ts](../../apps/friendly/src/lib/guest-share.ts)
- [anonymous-usage-quota](anonymous-usage-quota.md)
- [bounded-byte-caches](bounded-byte-caches.md)
