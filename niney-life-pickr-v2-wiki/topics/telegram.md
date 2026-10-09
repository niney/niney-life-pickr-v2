---
topic: telegram
type: codebase
last_compiled: 2026-10-10
sources_count: 23
status: active
aliases: [telegram-bot, long-polling-bot, getUpdates, force-reply, inline-keyboard, callback-query, discover-command, search-command, stats-command, region-stats-telegram, telegram-config, telegram-settings, reconfigure-bot, resolve-chat-id, chat-id-discovery, db-config-env-fallback, crawl-progress-edit, in-place-edit-race, token-masking, nextRetryDelayMs, 지수 백오프, POLL_TIMEOUT_SEC, POLL_GRACE_MS, SEND_TIMEOUT_MS, RETRY_BASE_MS, RETRY_MAX_MS, TelegramTiming, timing, dispatchChain, enqueue, 핸들러 직렬 큐, fetchWithTimeout, AbortSignal.any, half-open, fetch failed, G-6, CRAWL_WAIT_TIMEOUT_MS]
---

# telegram

**2026-10-05 변경 흡수 — 롱폴·송신 타임아웃, 실패 지수 백오프(2→60초), 핸들러를 폴링 루프 밖 직렬 큐로(`622bfca2`) + 발굴 쪽 크롤 공유·대기 상한(`ab7dad28`)**: (1) **운영 증거** — [PLAN-perf-2](../../docs/PLAN-perf-2.md) "감사 범위 밖 결함": `getUpdates` `fetch failed` 2초 재시도 경고가 **155,026건**이었다(6/27~7/17 집중, 7/15~17 하루 3.7만, 이후 산발). [findings](../../docs/PLAN-perf-2-findings.md) G-6(LOW·추정)은 셋을 짚었다: 롱폴·송신 fetch 에 시간 제한이 없어 반쯤 끊긴(half-open) 연결이 undici 기본 ~300초까지 매달린다(주석과 불일치), 핸들러를 폴링 루프 안에서 await 해 `runDiscoverAndReply` 가 끝날 때까지 다음 업데이트를 안 받는다. (2) **타임아웃** — [telegram.service.ts](../../apps/friendly/src/modules/telegram/telegram.service.ts) 의 `getUpdates` 는 stop/reconfigure 용 신호에 `AbortSignal.timeout(롱폴 30초 + 10초)` 를 `AbortSignal.any` 로 합친다(`POLL_TIMEOUT_SEC = 30`·`POLL_GRACE_MS = 10_000` — 신호가 본문 읽기까지 걸려 응답이 반쯤 오다 멈춰도 끝난다). 송신 `call`·`verifyBot`·`verifyChat` 은 [lib/fetch-timeout.ts](../../apps/friendly/src/lib/fetch-timeout.ts) 의 `fetchWithTimeout(…, 15_000)`(`SEND_TIMEOUT_MS`)이고, `resolveChatId` 의 message 롱폴도 `timeoutSec × 1000 + 10초` 상한이 붙었다. (3) **지수 백오프** — 실패 재시도 간격이 2초 고정에서 `nextRetryDelayMs(failures)` = `min(60초, 2초 × 2^(failures−1))`(2·4·8·16·32·60·60…초)로 바뀌었다. 성공하면 0 으로 되돌린다. 경고 로그에 `failures`·`retryInMs` 가 실린다. (4) **핸들러 직렬 큐** — 폴링 루프는 콜백·메시지를 `enqueue(() => dispatch…)` 로 `dispatchChain` Promise 체인에 걸고 바로 다음 업데이트를 받는다. 핸들러끼리는 예전처럼 도착 순서대로 하나씩 돈다(random-crawl 핸들러가 동시 실행을 가정하지 않음). `dispatch`/`dispatchMessage` 가 핸들러 오류를 삼키므로 체인이 끊기지 않는다. 메시지 staleness(60초) 판정은 **받은 시점** 기준이라, 앞 핸들러가 오래 걸려도 정상 메시지가 버려지지 않는다. (5) **테스트 seam** — 생성자 옵션 `timing?: Partial<TelegramTiming>`(롱폴·여유·송신 상한·백오프 기저/상한)으로 테스트가 시간을 줄인다. 신규 [telegram.service.test.ts](../../apps/friendly/src/modules/telegram/telegram.service.test.ts)(모의 fetch, 6건): 백오프 표, 계속 실패 시 간격이 지수로, 응답 없는 롱폴이 상한 뒤 스스로 끊고 재시도, 핸들러를 기다리지 않고 다음 업데이트를 받되 핸들러는 순서대로, 핸들러 오류가 다음을 막지 않음, 매달린 송신이 상한 뒤 `null`. (6) **발굴 쪽** — [plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) 는 이제 `CrawlService`·`SummaryService`·`ReviewSearchService` 를 따로 조립하지 않고 `app.crawl`([plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts), 앱 싱글톤)을 쓴다. 텔레그램으로 고른 가게의 크롤도 수동 크롤과 같은 대기열·결과 캐시·요약 체인을 탄다. 선택 크롤 종료 대기에는 60분 상한(`CRAWL_WAIT_TIMEOUT_MS`, `jobRegistry.waitForTerminal`)이 생겼다. 넘기면 크롤을 취소하고 회차는 `failed`("크롤이 60분 안에 끝나지 않아 취소했습니다.")가 되며, 진행 편집을 멈춘 뒤 실패 알림을 보낸다([random-crawl](random-crawl.md)). 텔레그램 인스턴스 배선(`new TelegramService` + `TelegramConfigService` 공유)은 그대로다. 같은 라운드의 다른 외부 API 방어(쿼터·쿨다운)는 [quota-proportional-loading](../concepts/quota-proportional-loading.md) 계열이고, 텔레그램은 쿼터가 아니라 연결 시간·재시도 간격만 묶었다.

텔레그램 봇 통합 도메인. 맛집 자동 발굴(random-crawl)이 후보 카드를 봇으로 보내고 사용자가 인라인 버튼으로 고른 가게를 크롤하는 양방향 채널이며, 동시에 사용자가 봇에 보내는 텍스트 커맨드(`/search`·`/discover`·`/stats`)로 발굴을 **역방향 트리거**한다. 봇 토큰·chat id 는 어드민 "설정 > 텔레그램"에서 관리하고(DB 우선 + `.env` fallback), 저장하면 서버 재시작 없이 폴러가 즉시 새 설정으로 갈아탄다. 전송 채널은 [auto-discover.md](auto-discover.md)·[crawl.md](crawl.md) 도메인이 소비하고, 설정 화면은 [friendly.md](friendly.md)·[shared.md](shared.md)·[web.md](web.md) 의 패턴을 따른다.

## Purpose [coverage: high — 8 sources]

텔레그램을 발굴 워크플로의 **단일 인터랙션 표면**으로 쓰는 도메인이다. 책임 범위는 크게 셋:

1. **저레벨 봇 트랜스포트** — `TelegramService` ([apps/friendly/src/modules/telegram/telegram.service.ts](../../apps/friendly/src/modules/telegram/telegram.service.ts)) 가 텔레그램 Bot API 를 long-polling(`getUpdates`)으로 수신하고 `sendMessage`/`editMessageText`/`answerCallbackQuery` 로 송신한다. 기능 중립적 — 콜백(인라인 버튼 클릭)과 텍스트 커맨드를 정규화 페이로드로 핸들러에 넘길 뿐, 어떤 커맨드가 무슨 일을 하는지 모른다(random-crawl 이 핸들러를 등록한다).

2. **봇 설정 관리** — `TelegramConfigService` ([apps/friendly/src/modules/settings/telegram-config.service.ts](../../apps/friendly/src/modules/settings/telegram-config.service.ts)) 가 어드민 "설정 > 텔레그램"의 백엔드. 단일 행(`key='telegram'` 고정) DB 설정 + `.env`(`TELEGRAM_*`) fallback 을 합쳐 유효 설정을 만들고, 토큰을 마스킹해 내려주며, 저장 시 공유 `TelegramService` 인스턴스를 즉시 `reconfigure` 한다. [LlmProviderConfig](ai.md)·[MapProviderConfig](map.md) 와 동형인 "DB 우선 + env fallback" 패턴.

3. **메시지 렌더링** — `region-stats-telegram.ts` ([apps/friendly/src/modules/restaurant/region-stats-telegram.ts](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts)) 가 `/stats` 지역 통계를 텍스트 막대 + 드릴다운 버튼 메시지로 빚는 **순수 함수** 모음(부수효과 없음 → 단위 테스트 용이).

봇이 비활성(토큰/chat id 미설정)이면 모든 송신은 no-op 이고, 자동 발굴 회차는 후보를 못 보내 skip 된다 — 즉 텔레그램은 발굴 파이프라인의 **필수 출력 단자**다(상세 발굴 흐름은 [auto-discover.md](auto-discover.md)).

## Architecture [coverage: high — 11 sources]

friendly 단일 인스턴스 안에서 **폴러 1개**만 도는 long-polling 봇이다(CLAUDE.md no-Redis · webhook 대신 long-polling 을 골라 공개 HTTPS URL 노출 불필요). 도메인은 트랜스포트 1 + 설정 서비스 1 + 렌더 순수함수 + 어드민 FE 스택으로 구성된다.

1. **`TelegramService`** — 폴링·송신·설정검증을 가진 클래스. 핵심 상태: `botToken`/`chatId`(reconfigure 로 교체), `handler`/`msgHandler`(콜백·메시지 핸들러), `offset`(update_id 진행), `polling`/`pollGen`(폴러 세대). 핸들러는 random-crawl 이 `onCallback`/`onMessage` 로 등록한다(순환 의존 회피 — telegram 은 random-crawl 을 import 하지 않음).

   - 수신: `startPolling()` → `loop(gen)` 에서 `getUpdates(offset, 30, signal)` 를 30초 롱폴로 반복. fetch 는 stop/reconfigure 신호 + 자체 상한(30초 + 10초)을 `AbortSignal.any` 로 합친 신호로 나간다(2026-10-05). 콜백 쿼리는 `dispatch` 로, 텍스트 메시지는 권한(설정된 chat) + staleness(60초) 게이트를 통과한 것만 `dispatchMessage` 로 넘긴다. 둘 다 2026-10-05 부터 `enqueue` 로 `dispatchChain`(핸들러 직렬 큐)에 걸고 기다리지 않는다 — 폴러는 곧바로 다음 롱폴을 연다. 실패하면 `nextRetryDelayMs(failures)`(2→60초 지수) 만큼 쉬고, 성공하면 실패 횟수를 0 으로.
   - 송신: `sendCandidates`(인라인 키보드 카드 → `{chatId, messageId}` 반환), `notify`(평문 + 알림 핑), `askReply`(force_reply 프롬프트), `answerCallback`, `editMessageText`(본문만), `editMessageWithButtons`(본문 + 버튼 교체). 전부 내부 `call()` → `fetchWithTimeout(…, 15초)`(2026-10-05) — 매달린 송신은 상한 뒤 `null` 이라 회차를 막지 않는다.
   - 설정검증: `verifyBot`(getMe), `verifyChat`(getChat) — 둘 다 15초 상한, `sendTestMessage`, `resolveChatId`(폴러 멈추고 message 롱폴로 chat 후보 추출 — 롱폴 + 10초 상한).
   - 시간 상수: `POLL_TIMEOUT_SEC = 30`·`POLL_GRACE_MS = 10_000`·`SEND_TIMEOUT_MS = 15_000`·`RETRY_BASE_MS = 2_000`·`RETRY_MAX_MS = 60_000`, 생성자 `timing` 옵션으로 덮어쓴다(테스트용).
   - 재구성: `reconfigure(token, chatId)` — 폴링 중이면 옛 폴러 멈추고 새 토큰으로 재시작(핸들러 유지, 서버 재시작 불필요).

2. **`TelegramConfigService`** — `prisma` + 공유 `telegram` 인스턴스 + `{envBotToken, envChatId}` deps 주입. `effective()` 가 DB 행/env 를 합쳐 `{token, chatId, source, updatedAt}` 를 만들고, `getConfig`/`update`/`clear`/`test`/`resolveChatId`/`bootstrap` 을 노출. `update`·`clear` 후 `applyToBot()` → `telegram.reconfigure()`.

3. **렌더 순수함수** ([region-stats-telegram.ts](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts)) — `isStatsCommand`, `buildRegionStatsOverview`(시도 랭킹 + `rs:<시도>` 버튼), `buildRegionStatsSido`(시군구 분해 + `disc:<시도>:<시군구>`/`disc:<시도>` 발굴 버튼 + `rs:*` 복귀). CJK 2칸 폭 계산(`visualWidth`)으로 `<pre>` 모노스페이스 정렬.

4. **DI 와이어링** — [apps/friendly/src/plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) 가 `new TelegramService(...)` 와 `new TelegramConfigService(...)` 를 만들어 **같은 telegram 인스턴스**를 양쪽에 주입하고 `app.decorate('telegram', ...)`/`app.decorate('telegramConfig', ...)`. 그래서 설정 화면 저장이 폴링 봇에 즉시 반영된다. 부팅 시 `telegramConfig.bootstrap()` → `RandomCrawlService.bootstrap()` 이 `onCallback`/`onMessage` 등록 후 `startPolling()`. 2026-10-05 부터 이 플러그인은 크롤 서비스를 직접 조립하지 않고 `app.crawl`([plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts))을 받는다(`dependencies: ['prisma','logs','crawl']`) — 텔레그램 선택 크롤이 앱의 대기열·요약·enrich 체인과 하나가 됐다.

5. **어드민 FE 스택** — 라우트 namespace `Routes.SettingsTelegram` ([packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts)) → API 클라이언트 [telegramSettingsApi](../../packages/shared/src/api/telegram-settings.api.ts) → React Query 훅 [useTelegramSettings.ts](../../packages/shared/src/hooks/useTelegramSettings.ts) → 페이지 [AdminTelegramPage.tsx](../../apps/web/src/routes/admin/AdminTelegramPage.tsx). 사이드바 탭 등록은 [AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) 의 `{ to: '/admin/settings/telegram', label: '텔레그램', icon: Send }`.

## Talks To [coverage: high — 8 sources]

| 대상 | 방향 | 무엇을 |
|---|---|---|
| 텔레그램 Bot API (`api.telegram.org`) | 양방향 | `getUpdates` 롱폴 수신(30초 + 여유 10초 상한) + `sendMessage`/`editMessageText`/`answerCallbackQuery`/`getMe`/`getChat` 송신(15초 상한) — 2026-10-05 |
| random-crawl ([auto-discover.md](auto-discover.md), [random-crawl.md](random-crawl.md)) | 봇→발굴 | `onCallback`/`onMessage` 로 핸들러 등록. 콜백(후보 선택·`rs:`·`disc:`)·커맨드(`/search`·`/discover`·`/stats`)를 받아 발굴/크롤 흐름 트리거. 2026-10-05 부터 핸들러는 폴링 루프 밖 직렬 큐에서 돈다. 역방향으로 random-crawl 이 `sendCandidates`/`notify`/`editMessageText`/`editMessageWithButtons`/`askReply` 호출 |
| crawl ([crawl.md](crawl.md)) | 발굴→봇 | `streamCrawlProgress` 가 crawl 레지스트리 이벤트(progress/visitor_progress)를 구독해 진행 메시지를 제자리 갱신. 선택 크롤 종료 대기는 `jobRegistry.waitForTerminal(jobId, 60분)`(2026-10-05, [job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts)) — 시간 초과면 크롤 취소 + 실패 알림 |
| `lib/fetch-timeout.ts` ([friendly.md](friendly.md)) | 내부 | 송신·설정 확인의 `fetchWithTimeout`(2026-10-05) |
| restaurant 도메인 | 발굴→봇 | `getRegionStats()`(60초 캐시) 결과를 `region-stats-telegram.ts` 렌더 함수에 흘림 |
| `prisma` (`TelegramConfig` 테이블) | RW | 단일 행 봇 설정 upsert/findUnique/deleteMany |
| env (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) | R | DB 행 없을 때 fallback ([config.md](config.md)) |
| 어드민 웹 (설정 > 텔레그램) | HTTP | config GET/PUT/DELETE · test · resolve-chat-id (모두 admin 보호) |

## API Surface [coverage: high — 5 sources]

`Routes.SettingsTelegram` namespace — 전부 `app.authenticate` + `app.requireAdmin` 보호([friendly.md](friendly.md)). 라우트 정의는 [apps/friendly/src/modules/settings/telegram.route.ts](../../apps/friendly/src/modules/settings/telegram.route.ts), 스키마는 [packages/api-contract/src/schemas/telegram-settings.ts](../../packages/api-contract/src/schemas/telegram-settings.ts).

| 메서드·경로 | body / 응답 | 의미 |
|---|---|---|
| `GET /api/v1/admin/settings/telegram` | → `TelegramConfig` | 마스킹된 설정 조회. `source`(`db`/`env`/`none`) 로 유효값 출처, `configured`(토큰+chatId 둘 다) 노출 |
| `PUT /api/v1/admin/settings/telegram` | `UpdateTelegramConfigInput` → `TelegramConfig` | 토큰/chatId 설정. `botToken` 빈/생략 = 기존 보존, 문자열 = 교체. `chatId` 문자열=설정·`null`=비움·`undefined`=보존. 저장 후 즉시 `reconfigure` |
| `DELETE /api/v1/admin/settings/telegram` | → 204 | DB 행 삭제 → `.env` fallback 복귀 + `reconfigure(env)` |
| `POST /api/v1/admin/settings/telegram/test` | → `TelegramTestResult` | 저장된 유효 설정으로 getMe → getChat → 테스트 메시지. 단계별 `botOk`/`chatOk`/`messageSent` |
| `POST /api/v1/admin/settings/telegram/resolve-chat-id` | → `TelegramChatIdResult` | 폴러를 ~25초 멈추고 message 롱폴 → 그 사이 사용자가 봇에 보낸 메시지의 chat 후보 배열 |

**스키마 (zod SSOT — [zod-ssot-buildless.md](../concepts/zod-ssot-buildless.md))**: `TelegramConfig`(hasToken·tokenMasked·chatId·source·configured·updatedAt), `UpdateTelegramConfigInput`(botToken?·chatId?nullable), `TelegramTestResult`, `TelegramChatIdResult`(candidates: `{chatId,name,type}[]`).

**봇 커맨드 표면**(HTTP 아님 — 텍스트 메시지로 들어오고 random-crawl 이 파싱):

| 커맨드 | 별칭 | 동작 |
|---|---|---|
| `/search <검색어>` | `/검색`, 슬래시 없는 `검색 …` | 직접 검색 발굴. **인자 없이** 탭하면 `askReply`(force_reply)로 2단계 입력 유도 → 답장 텍스트를 검색어로 |
| `/discover` | `/발굴`, 슬래시 없는 `발굴` | 설정 지역으로 즉시 1회차 발굴(역방향 트리거) |
| `/stats` | `/통계`·`/지역`, 슬래시 없는 `통계` | 지역 통계 — 시도 랭킹 카드 + 드릴다운 버튼 |

**콜백 data 규약**(64바이트 한도 내): `rc:<runId>:<n>`/`rc:<runId>:skip`(후보 선택), `rs:<시도>`/`rs:*`(통계 드릴다운), `disc:<시도>`/`disc:<시도>:<시군구>`(지역 선택 발굴).

## Data [coverage: medium — 3 sources]

단일 테이블 `telegram_configs` ([apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) `TelegramConfig`, 마이그레이션 [20260619091932_add_telegram_config](../../apps/friendly/prisma/migrations/20260619091932_add_telegram_config/migration.sql)):

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | TEXT PK | cuid |
| `key` | TEXT UNIQUE | 단일 행 보장용 고정값 `'telegram'` |
| `botToken` | TEXT default `''` | 비밀 — API 응답엔 마스킹해서만 노출 |
| `chatId` | TEXT default `''` | 비밀 아님 — 평문 그대로 |
| `updatedAt` | DATETIME | `@updatedAt` |
| `updatedById` | TEXT? | 수정 actor |

행이 없으면 env(`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`)로 fallback. 폴링 상태(`offset`/`polling`/`pollGen`)와 2026-10-05 의 핸들러 큐(`dispatchChain`)는 DB 가 아니라 `TelegramService` 인스턴스의 인메모리 필드 — 재시작 시 `offset` 0 부터(텔레그램이 미확인 update 를 재전송하므로 staleness 게이트가 옛 메시지를 거른다). 텔레그램 쪽 "확인"은 다음 `getUpdates` 의 `offset` 으로 일어나는데, 이제 폴러가 핸들러를 기다리지 않으므로 큐에 든 채 아직 처리 안 된 update 도 곧바로 확인된다(Gotchas).

## Key Decisions [coverage: high — 10 sources]

- **2026-10-05 실패 재시도는 지수 백오프(2→60초), 성공하면 리셋(`622bfca2`)** — 2초 고정 재시도는 업스트림·네트워크 장애 동안 경고 로그만 15만 건 남겼다(6/27~7/17). 장애가 길면 1분에 한 번만 두드리고, 복구되면 곧바로 원래 리듬으로 돌아온다. 봇 응답성은 장애 중에 어차피 없으므로 잃는 것이 없다.
- **2026-10-05 모든 텔레그램 fetch 에 시간 상한(`622bfca2`, G-6)** — 롱폴은 "대기 + 10초", 송신·확인은 15초. half-open 연결이 undici 기본(~300초)까지 폴러나 발굴 회차를 붙잡지 않게 한다. 롱폴은 본문 읽기까지 덮으려고 `fetchWithTimeout` 대신 `AbortSignal.any([stop 신호, AbortSignal.timeout(…)])` 를 직접 쓴다(stop/reconfigure 취소와 합성해야 해서이기도 하다).
- **2026-10-05 핸들러는 폴링 루프 밖에서, 그러나 직렬로(`622bfca2`)** — 핸들러(발굴 회차 실행·크롤 완료 대기 — 최대 60분)를 루프 안에서 await 하면 그동안 다른 커맨드·콜백이 아예 수신되지 않았다. 병렬로 풀면 random-crawl 핸들러가 가정하지 않은 동시 실행이 생긴다. 그래서 수신은 즉시, 처리는 Promise 체인 하나로 도착 순서대로 한다. staleness 는 수신 시점에 판정해 큐 대기로 정상 메시지가 버려지지 않게 했다.
- **Webhook 대신 long-polling** — 공개 HTTPS URL/인증서 노출 없이 단일 인스턴스에서 `getUpdates` 롱폴 하나만 돌린다(CLAUDE.md no-Docker/no-Redis 와 결).
- **트랜스포트와 도메인 분리** — `TelegramService` 는 random-crawl 을 import 하지 않고 `onCallback`/`onMessage` 콜백만 노출. 순환 의존 회피 + 테스트 격리(`region-stats-telegram.ts` 는 텔레그램 호출 0).
- **DB 우선 + env fallback (마스킹)** — `LlmProviderConfig`([ai.md](ai.md))·`MapProviderConfig`([map.md](map.md)) 와 **동형 패턴**. DB 행이 있으면 이기고, 없으면 env. 토큰은 절대 평문으로 안 내려주고 `maskApiKey`(ai.config.service 재사용). `source` 필드로 출처 가시화. → 새 컨셉 후보 `db-config-env-fallback`(아래 형제 토픽 요약 참조).
- **저장 즉시 봇 재구성** — 공유 인스턴스 + `reconfigure` 로 서버 재시작 없이 폴러가 새 토큰으로 갈아탄다. `pollGen`(폴링 세대)으로 옛 루프가 살아남지 않게 한다.
- **PUT 보존 시맨틱** — `botToken` 빈/생략 = 보존(빈 값으로 안 덮음), `chatId` `null`=비움/`undefined`=보존. MapProvider 규약과 동일. FE `buildUpdateInput` 가 변경분만 추려 보낸다.
- **편집은 핑 안 울림 → 완료/실패는 새 메시지** — 진행은 `editMessageText` 로 같은 카드 제자리 갱신(알림 안 울림), 최종 🎉 완료·⚠️ 실패는 `notify`(새 메시지)로 보내 디바이스 핑을 울린다(커밋 58dd354).
- **`/search` 2단계 입력 (ForceReply)** — 메뉴/자동완성에서 `/search` 를 탭하면 인자 없이 전송되므로, force_reply 프롬프트로 입력창을 자동 포커스시켜 검색어를 받는다. 답장은 `SEARCH_PROMPT_MARKER` 포함 여부로 식별(커밋 d9aab3b).
- **chat_id 자동 탐색** — 폴러를 잠시 멈추고 message 롱폴(`resolveChatId`)로 사용자가 그 사이 보낸 메시지에서 chat 후보를 추린다. `offset` 을 커밋하지 않아 콜백 폴러 진행엔 영향 없음. FE 가 클릭하면 입력칸에 채워준다.

## Gotchas [coverage: high — 10 sources]

- **큐에 든 update 는 처리 전에 확인된다 — 재시작하면 잃는다(2026-10-05 이후, 코드로 추정).** 폴러가 핸들러를 기다리지 않고 다음 `getUpdates(offset)` 을 보내므로, 텔레그램은 큐에서 아직 기다리는 콜백·커맨드까지 "받았음" 으로 처리한다. 앞 핸들러가 긴 크롤을 기다리는 사이 서버가 재시작(배포·메모리 초과)되면 그 뒤 update 는 재전송되지 않는다. 예전엔 핸들러가 끝나야 다음 롱폴이 나가 확인이 미뤄졌고, 재시작 뒤 콜백이 다시 왔다(staleness 게이트가 콜백을 일부러 빼는 이유). 버튼을 눌렀는데 반응이 없으면 다시 누르는 것이 복구 방법이다.
- **핸들러 큐는 직렬이라 긴 회차 뒤에 줄을 선다.** 선택 크롤 대기는 최대 60분(`CRAWL_WAIT_TIMEOUT_MS`)이고, 그동안 들어온 `/stats` 같은 짧은 커맨드도 큐 뒤에서 기다린다. 수신·staleness 판정은 즉시라 버려지지는 않지만 답이 늦는다. stop/reconfigure 는 폴러만 갈아끼우고 큐(`dispatchChain`)는 비우지 않는다.
- **송신 15초 상한은 응답 헤더까지다.** [lib/fetch-timeout.ts](../../apps/friendly/src/lib/fetch-timeout.ts) 의 `fetchWithTimeout` 은 `fetch` 가 응답(헤더)을 돌려주면 `finally` 에서 타이머를 지운다. 그래서 `call`·`verifyBot`·`verifyChat`·`resolveChatId` 의 `res.json()`(본문 읽기)은 상한 밖이다. 롱폴 `getUpdates` 만 `AbortSignal.any` 로 본문까지 덮는다. 텔레그램 응답은 작아 실제 위험은 낮다.
- **백오프 중엔 봇이 최대 60초 늦게 살아난다.** 실패가 6번 이상 이어지면 재시도 간격이 60초라, 장애가 풀린 직후에도 최대 1분 동안 업데이트를 안 받는다. reconfigure(설정 저장)는 루프를 새로 시작해 실패 횟수를 0 으로 되돌린다.
- **진행 편집 vs 최종 메시지 경쟁** — 늦게 도착한 "수집 중" `editMessageText` 가 최종 🎉/⚠️ 메시지를 덮으면 카드가 "수집 중"에 멈춘다(stuck). `streamCrawlProgress` 는 async **정지 함수**를 반환하고, 호출부가 종료 대기 후 그걸 `await`(`stopProgress()`)해서 in-flight 편집을 비운 **뒤** 최종 메시지를 보낸다(커밋 c5a3b8b/b47f7bd). 편집은 `pending` 체인으로 순서 직렬화 + 직전과 동일 텍스트 스킵(텔레그램 `not modified` 회피) + `CRAWL_PROGRESS_THROTTLE_MS=4000` 스로틀(레이트리밋 회피).
- **메시지 staleness 60초** — 재시작 후 텔레그램이 미확인 update 를 재전송하면 옛 `/discover` 가 새 회차를 트리거할 수 있다. `loop` 에서 `Date.now()/1000 - msg.date > 60` 이면 무시. **콜백은 제외**(awaiting 복구용이라 만료시키면 안 됨).
- **권한 게이트는 chat 일치만** — 텍스트 메시지는 `String(msg.chat.id) === this.chatId` 인 것만 핸들러로 넘긴다. 설정된 chat 외에서 온 메시지/커맨드는 조용히 버려짐. 콜백은 메시지 단위로 매칭하므로 별도 chat 검사 없음.
- **봇 비활성 = silent no-op** — `isConfigured()`(토큰+chatId 둘 다) 거짓이면 모든 송신이 조용히 `null`/no-op. 발굴 회차는 후보를 못 보내 skip 되고, UI 는 `configured` 배지로 경고. `notifyEmpty`/`sendRegionStats` 등도 미설정이면 그냥 빠진다.
- **`resolveChatId` 는 ~25초 블로킹** — 폴러를 멈추고 message 롱폴을 기다리므로 FE 호출이 길게 걸린다. AdminTelegramPage 는 "지금 봇에게 메시지를 보내세요" 안내 + 스피너를 띄우고, 후보 0건이면 "@userinfobot 으로도 확인 가능" 안내.
- **콜백 data 64바이트 한도** — 시도명(`rs:<시도>`)·`disc:<시도>:<시군구>` 가 한도를 넘지 않게 한국 행정구역명(시도 ≤17, 시군구 ≤31, 콜론 미포함)에 의존. 통계 메시지는 `<pre>` + CJK 2칸 폭(`visualWidth`)으로 모노스페이스 정렬하고 `MAX_LINES=40`·`DISCOVER_BTN_MAX=8` 방어 상한.
- **getRegionStats 60초 캐시 → 시도 사라짐 가능** — 드릴다운 사이 캐시가 갱신돼 선택한 시도가 사라지면 `buildRegionStatsSido` 가 overview 로 폴백.
- **마이그레이션 drift 주의** — `telegram_configs` 는 마이그레이션 `20260619091932` 로 생성. 운영 DB 에 이 마이그레이션이 적용 안 됐으면 설정 화면이 깨진다(관련: 다른 도메인의 수동 테이블 생성 drift 이력).

## Sources [coverage: high — 23 sources]

- [apps/friendly/src/modules/telegram/telegram.service.ts](../../apps/friendly/src/modules/telegram/telegram.service.ts) — long-polling 트랜스포트(송수신·검증·reconfigure). 2026-10-05 롱폴·송신 상한, `nextRetryDelayMs` 지수 백오프, `enqueue`/`dispatchChain` 핸들러 직렬 큐, `timing` 옵션
- [apps/friendly/src/modules/telegram/telegram.service.test.ts](../../apps/friendly/src/modules/telegram/telegram.service.test.ts) — (신규 2026-10-05) 모의 fetch 6건 — 백오프 표·지수 간격·매달린 롱폴 자체 종료·핸들러 비대기+순서·핸들러 오류 격리·매달린 송신 `null`
- [apps/friendly/src/lib/fetch-timeout.ts](../../apps/friendly/src/lib/fetch-timeout.ts) — `fetchWithTimeout`(송신·확인 15초 상한에 재사용, 소유 friendly)
- [apps/friendly/src/plugins/crawl.ts](../../apps/friendly/src/plugins/crawl.ts) — (신규 2026-10-05) `app.crawl` 싱글톤 — random-crawl 플러그인이 받아 쓴다
- [apps/friendly/src/modules/crawl/job-registry.ts](../../apps/friendly/src/modules/crawl/job-registry.ts) — `waitForTerminal(jobId, timeoutMs)` — 선택 크롤 60분 대기 상한
- [docs/PLAN-perf-2.md](../../docs/PLAN-perf-2.md) — 운영 증거(`fetch failed` 155,026건), 6차·"모듈 묶음 → ops" 의 텔레그램 백오프·타임아웃
- [docs/PLAN-perf-2-findings.md](../../docs/PLAN-perf-2-findings.md) — G-6(롱폴·송신 무제한 대기, 루프 안 await)
- [apps/friendly/src/modules/settings/telegram-config.service.ts](../../apps/friendly/src/modules/settings/telegram-config.service.ts) — DB 우선 + env fallback 설정 서비스
- [apps/friendly/src/modules/settings/telegram-config.service.test.ts](../../apps/friendly/src/modules/settings/telegram-config.service.test.ts) — 마스킹·set/clear·reconfigure 단위 테스트
- [apps/friendly/src/modules/settings/telegram.route.ts](../../apps/friendly/src/modules/settings/telegram.route.ts) — admin config/test/resolve-chat-id 라우트
- [apps/friendly/src/modules/restaurant/region-stats-telegram.ts](../../apps/friendly/src/modules/restaurant/region-stats-telegram.ts) — `/stats` 메시지 렌더 순수함수
- [apps/friendly/src/modules/restaurant/region-stats-telegram.test.ts](../../apps/friendly/src/modules/restaurant/region-stats-telegram.test.ts) — 통계 커맨드·렌더 테스트
- [apps/friendly/src/modules/random-crawl/discover-command.test.ts](../../apps/friendly/src/modules/random-crawl/discover-command.test.ts) — `/discover`·`/search` 파서 테스트(교차: [auto-discover.md](auto-discover.md))
- [apps/friendly/src/modules/random-crawl/random-crawl.service.ts](../../apps/friendly/src/modules/random-crawl/random-crawl.service.ts) — 핸들러 등록·진행 갱신·완료/실패 알림(전송 소비자, 상세는 [auto-discover.md](auto-discover.md)). 2026-10-05 크롤 대기 60분 상한·초과 시 취소
- [apps/friendly/src/plugins/random-crawl.ts](../../apps/friendly/src/plugins/random-crawl.ts) — 공유 인스턴스 DI 와이어링(`app.decorate`). 2026-10-05 `app.crawl` 사용·`dependencies` 에 `crawl`
- [packages/api-contract/src/schemas/telegram-settings.ts](../../packages/api-contract/src/schemas/telegram-settings.ts) — zod 스키마
- [packages/api-contract/src/routes.ts](../../packages/api-contract/src/routes.ts) — `SettingsTelegram` namespace
- [packages/shared/src/api/telegram-settings.api.ts](../../packages/shared/src/api/telegram-settings.api.ts) — API 클라이언트
- [packages/shared/src/hooks/useTelegramSettings.ts](../../packages/shared/src/hooks/useTelegramSettings.ts) — React Query 훅
- [apps/web/src/routes/admin/AdminTelegramPage.tsx](../../apps/web/src/routes/admin/AdminTelegramPage.tsx) — 설정 > 텔레그램 화면
- [apps/web/src/routes/admin/AdminSettingsPage.tsx](../../apps/web/src/routes/admin/AdminSettingsPage.tsx) — 어드민 설정 사이드바 탭 등록
- [apps/friendly/prisma/schema.prisma](../../apps/friendly/prisma/schema.prisma) `TelegramConfig` + [migration](../../apps/friendly/prisma/migrations/20260619091932_add_telegram_config/migration.sql) — `telegram_configs` 테이블
