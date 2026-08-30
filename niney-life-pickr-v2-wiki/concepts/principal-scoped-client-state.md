---
concept: 클라이언트 정체성 경계 — 요청 토큰 == 현재 토큰일 때만 401 이 세션을 끊고, 로컬 상태는 principal 로 격리한다
last_compiled: 2026-08-30
topics_connected: [shared, web, mobile, meal, friendly]
status: active
---

# 클라이언트 정체성 경계 — 요청 토큰 == 현재 토큰일 때만 401 이 세션을 끊고, 로컬 상태는 principal 로 격리한다

## Pattern

식단(meal)이 "로그인 사용자의 개인 데이터 + 앱 로컬 초안·사진·알림" 을 가져오면서, 이 리포는 처음으로 **"지금 화면의 데이터와 로컬 상태가 누구 것인가"** 를 클라이언트가 명시적으로 지키게 됐다(`9f39d53`·`fd371d9`, 2026-08-23). 이전까지 정산·즐겨찾기는 "로그인하면 서버, 아니면 로컬" 이면 충분했는데([guest-server-hybrid](guest-server-hybrid.md)), 계정 전환·지연 응답·다중 탭이 겹치면 **A 계정의 요청이 B 계정 화면에 도착하거나, 만료 토큰의 401 이 새 세션을 끊는** 구멍이 있었다. 해법은 네 개의 같은 결로 된 규칙이다.

1. **401 은 "현재 세션의 401" 일 때만 세션을 끊는다** — `@repo/shared` `client.ts` 가 요청 단위로 설정(토큰)을 스냅샷하고 `onUnauthorized(requestToken)` 으로 넘기면, `handleUnauthorizedForCurrentSession` 이 **요청이 쓴 토큰 == 지금 토큰** 일 때만 `cancelQueries → queryClient.clear() → setMealDraftPrincipal(null) → clearSession` 을 **한 동기 JS turn** 에서 실행한다. 늦게 도착한 옛 토큰의 401 은 무시된다. 주입 지점은 웹 `main.tsx`·앱 `api-setup.ts` 단 두 곳.
2. **로그인은 캐시를 비우지 invalidate 하지 않는다** — `useAuth` 가 로그인/가입 시 `cancelQueries` + `removeQueries()` 전체(키에 사용자 id 가 없으므로 공개 캐시까지 cold), 그 다음 principal 전환, 그 다음 `setSession`. 순서가 곧 규칙이다.
3. **로컬 상태는 principal 네임스페이스에 산다** — `mealDraftStore` 는 principal 이 확정되기 전엔 읽고 쓰지 않고 `lp:meal-draft-v1:principal:<id>` 에만 저장하며(`setMealDraftPrincipal` 동기 경계 + 직렬 전환 + 세대 id `draftSessionId`), 앱은 대기 사진(`documentDirectory/meal-draft-photos-v1` + `.principal` 지문)·인증 사진 캐시(`cacheDirectory/meal-photos-v1/<토큰 지문>`, 1h)·식사 알림(`lp:meal-reminders:v2:principal:<id>`) 까지 같은 축으로 격리한다. principal 의 진실은 JWT payload(`principalFromJwt`)이고 `lp:principal-id` 는 사본 — 앱 부팅이 JWT 로 선세팅한다.
4. **mutation 응답도 정체성을 검사한다** — `useMeal` 의 `expectedPrincipalId` 가드(`shouldApplyMealMutationCache`)가 응답이 도착한 시점의 principal 과 요청 시점의 principal 이 다르면 캐시에 반영하지 않는다.

서버 쪽 짝은 [in-memory-singleton-gates](in-memory-singleton-gates.md)의 `MealMutationBarrier`(userId FIFO) 와 request-token/principal cache 경계(23차 meal 서술) — 서버가 "사용자별 직렬화" 를, 클라이언트가 "사용자별 격리" 를 맡는다.

## Instances

- **2026-08-23** in [shared](../topics/shared.md) (`client.ts` + `client.test.ts` + `hooks/useAuth.ts`, `fd371d9`·`9f39d53`): 규칙 1·2 의 본체 — 요청 단위 config 스냅샷, `handleUnauthorizedForCurrentSession`, 로그인 시 `removeQueries()` 전체. 테스트가 "옛 토큰 401 무시" 를 고정.
- **2026-08-23** in [shared](../topics/shared.md) / [meal](../topics/meal.md) (`stores/mealDraftStore.ts` + `hooks/useMeal.ts`): 규칙 3·4 — principal 스코프 물리 키·동기 경계·세대 id·파일 어댑터 주입 포트(`setMealDraftLocalFileAdapter`), `expectedPrincipalId` 가드. settlementDraft(placeId 정체성, v1→v6)와 달리 **정체성 축이 사용자**다.
- **2026-08-23** in [mobile](../topics/mobile.md) (`src/lib/api-setup.ts`·`queryClient.ts`·`mealDraftPhotos.ts`·`mealPhotoCache.ts`·`mealReminders.ts`): 앱의 로컬 상태 4종이 principal 네임스페이스, `mobileQueryClient` 싱글턴화, 부팅 시 JWT `userId` → `setMealDraftPrincipal` 선세팅, 401 가드 주입. 알림 handler 는 루트 단일 + 응답 라우팅 allowlist.
- **2026-08-23** in [web](../topics/web.md) (`main.tsx`·`LoginPage.tsx`): 웹은 식단 입력 UI 가 없어 draft 를 저장하지 않지만 **경계 호출은 지킨다** — 401 가드 주입 + 게스트 진입 전 `setMealDraftPrincipal(null)`. "상태가 없어도 경계는 있다" 는 대비 사례.
- **2026-08-23** in [friendly](../topics/friendly.md) / [meal](../topics/meal.md) (`meal-mutation-barrier.ts` + 인증/cache principal 경계): 서버 짝 — 사용자 공통 FIFO write barrier(5 서비스 15 진입점)와 principal 단위 캐시 경계.

## What This Means

1. **"로그인 여부" 에서 "누구인가" 로 축이 옮겨갔다.** guest-server-hybrid 는 익명→계정 전환만 다뤘고, 이 패턴은 계정→다른 계정·만료→재로그인·지연 응답까지 다룬다. 개인 데이터 도메인이 하나 더 생기면(예: 개인 즐겨찾기 메모) 이 네 규칙을 그대로 적용하면 된다 — 특히 로컬 상태를 만들 때 키에 principal 을 넣지 않으면 계정 전환에서 새는 것이 이제 알려진 결함이다.
2. **네 규칙은 한 세트다.** 401 가드만 있고 로컬 격리가 없으면 옛 계정의 초안이 새 계정에 뜨고, 격리만 있고 `removeQueries()` 가 없으면 옛 계정의 목록이 잠깐 보인다. 23차·24차에 걸쳐 네 규칙이 같은 이틀에 들어온 것은 우연이 아니다.
3. **비용은 콜드 스타트다.** 로그인마다 공개 캐시까지 비우므로 홈·맛집 목록이 다시 로드된다. 키에 사용자 id 를 넣어 선택적 무효화로 바꾸는 것이 다음 최적화 후보이되, 그 전까지는 "안전한 쪽" 을 택했다는 결정이 문서화돼 있어야 한다.

## Sources

- [shared](../topics/shared.md)
- [web](../topics/web.md)
- [mobile](../topics/mobile.md)
- [meal](../topics/meal.md)
- [friendly](../topics/friendly.md)
- [guest-server-hybrid](guest-server-hybrid.md)
- [in-memory-singleton-gates](in-memory-singleton-gates.md)
- [platform-ui-split](platform-ui-split.md)
