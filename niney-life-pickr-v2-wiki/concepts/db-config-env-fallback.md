---
concept: db-config-env-fallback
last_compiled: 2026-06-25
topics_connected: [ai, map, telegram, friendly]
status: active
---

# 외부 통합 설정의 DB 우선 + env 폴백

## Pattern

외부 통합(지도 SDK 키, 텔레그램 봇 토큰, LLM 키·모델)의 설정을 이 코드베이스는 **단일 행 DB 우선 + `.env` 폴백**으로 해소한다. 모양은 항상 같다: 도메인마다 `*ConfigService`(또는 `*SettingsService`)가 단일 행(map 은 `provider` 고정, telegram 은 `key='telegram'` 고정)을 읽어 **DB 행에 값이 있으면 그 값, 없으면 env** 로 떨어지는 `effective()` 류 메서드를 갖는다. 그 위에 네 가지 공통 골격이 얹힌다 — (1) 응답에 **출처를 노출**(`source: 'db' | 'env' | 'none'`, ai 는 축별로 `keySource` / `defaultModelSource`), (2) 비밀값은 `maskApiKey`(ai 모듈이 정의, telegram·map 이 import)로 **마스킹**, (3) PUT 은 **보존 시맨틱**(빈/생략 키 = 기존 유지, `undefined` = no-change, `null` = 비움, 문자열 = 교체), (4) 저장 시 **즉시 재구성** — 서버 재시작 없이 다음 읽기(또는 telegram 처럼 즉시 reconfigure)부터 새 값이 먹는다. 행을 지우면 자동으로 env 폴백으로 복귀한다. 캐싱은 하지 않는다 — 매 요청 스냅샷이라 설정 변경이 곧바로 반영된다.

## Instances

- **map** ([[../topics/map]], `apps/friendly/src/modules/settings/map.service.ts` + `map.route.ts`) — vworld 지도 SDK 키. `MapSettingsService.effective(provider)` 가 `mapProviderConfig` 단일 행(`provider='vworld'`)을 읽어 DB 키 우선, 없으면 `env.VWORLD_*` 폴백, `source` 는 `dbKey ? 'db' : envKey ? 'env' : 'none'`. `getSecret()` 가 평문 유효 키를 그대로 vworld JS SDK/WMTS init 에 박는다 — WMTS 키는 어차피 브라우저 Network 탭에 노출되는 클라이언트 자원이라 env 기본값을 둬도 보안 등급 차이가 없다는 판단(서비스 상단 주석). 공개 `publicConfig` 라우트가 `getSecret` 을 거쳐 맛집 지도 페이지에 키를 내주되 **키 미등록이면 404**(`map.route.ts:99`) — 관리자 가드 뒤가 아닌 공개 경로라 라우트만 분리(→ [[public-admin-route-split]]). `update()` 는 첫 등록인데 입력 키도 env 폴백 키도 없으면 "키 없음" 행만 만드는 셈이라 거절. `domains` 는 발급 시 도메인 화이트리스트 메모(런타임 미사용)로 DB 행 우선 + env 메모 보충.
- **telegram** ([[../topics/telegram]], `apps/friendly/src/modules/settings/telegram-config.service.ts`) — 텔레그램 봇 토큰 + chatId. `TelegramConfigService.effective()` 가 `telegramConfig` 단일 행(`key='telegram'`, 마이그레이션 `20260619091932_add_telegram_config`, `key` 에 UNIQUE)을 읽어 DB 토큰/chatId 우선, 없으면 `envBotToken`/`envChatId` 폴백. `source` 판정이 map 보다 한 단계 정교 — DB 행에 **토큰이든 chatId 든 하나라도** 있으면 `'db'`(`hasDb`), 둘 다 없고 env 토큰만 있으면 `'env'`, 아니면 `'none'`. 토큰은 `maskApiKey`(ai 의 것 재사용, `import { maskApiKey } from '../ai/ai.config.service.js'`)로 마스킹. PUT 보존 시맨틱 동일(빈/생략 토큰=보존, chatId 는 `undefined`=보존 / `null`=비움). map·ai 와 가장 크게 다른 점은 **저장 즉시 부수효과** — `applyToBot()` 이 공유 `TelegramService` 인스턴스를 `reconfigure(token, chatId)` 해서 폴러가 서버 재시작 없이 새 토큰으로 갈아탄다. 부팅 1회 `bootstrap()`(아직 startPolling 전이라 폴러는 안 켬), `test()`(getMe→getChat→테스트 메시지), `resolveChatId()` 보조 메서드.
- **ai** ([[../topics/ai]], `apps/friendly/src/modules/ai/ai.config.service.ts`) — LLM provider 키·baseUrl·모델. **기본 골격을 다축으로 확장한 대비 사례**. 같은 단일행-우선 + env 폴백 + 출처 + 마스킹 + PUT 보존을 공유하되, 폴백이 **축별로 정책이 갈린다**:
  - (a) **키·baseUrl 은 계정 상속 + chat 한정 env 폴백** — `chat` 용도가 "계정 대표"(`ENV_BACKED_PURPOSE`). chat row(없으면 env)가 계정 키가 되고, `image`·`log-analysis` 는 자기 row 에 키가 없으면 그 계정 키를 **상속**(`resolveAccountCredentials`). 즉 env 폴백은 chat 한 곳에서만 일어나고 다른 용도는 그 결과를 빌린다.
  - (b) **모델은 용도별 env 폴백, 상속 없음** — `defaultModel` 은 용도마다 달라야 하므로 상속하지 않고 각 용도의 `.env` 기본 모델(`OLLAMA_IMAGE_MODEL` / `OLLAMA_LOG_ANALYSIS_MODEL` 등 `env.defaultModels[purpose]`)로만 보충. DB row 값이 비었을 때만.
  - 출처도 두 갈래로 노출 — `keySource: 'own' | 'env' | 'inherited' | 'none'`(상속이라는 제4 출처가 추가됨), `defaultModelSource: 'own' | 'env' | 'none'`. UI 카드의 배지로 쓰인다.
  - `list()` 가 **DB row 가 없어도 가상 row 를 합성** — `ALL_PURPOSES`(chat/image/log-analysis) 세 용도를 항상 한 장씩 카드로 노출해, 행이 없는 용도도 "계정 키 상속으로 동작 가능"을 보여준다. map(`known=['vworld']`)·telegram(단일 key) 도 알려진 항목을 항상 노출하지만, ai 는 한 provider 안에서 **용도 축이 곱해진** 카드 집합을 합성한다는 점이 다르다.
  - `getResolved(provider, purpose)` 가 요청당 1회 스냅샷(캐시 없음)으로 `AiService` 에 넘긴다 — 비활성 row 는 키 유무와 무관하게 차단, 최종 키가 없으면 `null`. `remove()` 는 행 삭제 → env 복귀.

## What This Means

이 패턴이 알려주는 것:

1. **하나의 제네릭 "설정 모듈"로 묶지 않고 도메인별로 복제했다** — map·telegram·ai 는 골격이 거의 같아서 "공통 ConfigService 하나로 추상화" 가 당연해 보이지만, 의도적으로 안 했다. 외부 통합마다 비밀값의 형태·검증·폴백 축이 다르기 때문이다. map 은 키 1개(+메모), telegram 은 토큰+chatId(+즉시 reconfigure 부수효과), ai 는 키+baseUrl+모델을 용도 축으로 곱하고 그 위에 상속과 가상 row 합성까지 얹는다. 이 셋을 한 제네릭으로 묶으면 ai 의 "축별 폴백 정책 분리 + 상속 + 가상 row 합성" 분기가 단순한 map·telegram 코드를 오염시킨다 — 키 1개짜리 설정을 읽는데 용도 루프와 상속 해소를 통과해야 하는 식.
2. **동형 골격은 유지하되 변형을 허용하는 게 이 코드베이스의 선택** — 네 공통 축(단일행 DB 우선 / env 폴백 / source 출처 / 마스킹 + PUT 보존)은 셋이 똑같이 따른다. `maskApiKey` 한 함수만 실제로 공유(ai → telegram·map import)하고, 나머지는 "같은 모양의 별도 구현". 추상화 대신 동형성을 코드 리뷰·주석 레벨에서 명시(map·telegram 서비스 상단 주석이 서로를 "같은 패턴" 이라 지목)한다.
3. **`source`/`keySource` 출처 노출이 운영 가시성의 핵심** — env-only 운영(DB 행 없음)과 DB-등록 운영을 같은 코드로 굴리면서, 응답에 출처를 박아 "지금 이 키가 어디서 왔는가"(db/env/inherited/none)를 어드민 UI 가 배지로 보여준다. 폴백이 조용히 일어나는 대신 항상 추적 가능.
4. **ai 의 다축 확장이 한계선을 보여준다** — 폴백 축이 1개(map)→2개(telegram)→다축+상속(ai)으로 늘수록 분기가 급격히 복잡해진다. ai 가 더 확장되면(예: provider 종류 추가) 이 패턴 자체를 다시 쪼갤 후보 — 하지만 지금은 한 모듈 안에 담는 게 정답.

관련: [[in-memory-singleton-gates]] — ai 의 `maxConcurrent` 설정이 그 모듈 싱글턴 cap 게이트의 슬롯 수를 정한다(설정 → 게이트 cap 동기화). [[public-admin-route-split]] — map 의 `publicConfig` 공개 라우트가 어드민 secret 경로와 분리되는 사례.

## Sources

- [[../topics/ai]]
- [[../topics/map]]
- [[../topics/telegram]]
- [[../topics/friendly]]
- [[in-memory-singleton-gates]]
- [[public-admin-route-split]]
