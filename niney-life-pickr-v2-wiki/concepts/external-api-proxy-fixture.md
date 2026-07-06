---
concept: 외부 API 어댑터 — friendly 프록시 + 정규화 + probe→fixture
last_compiled: 2026-07-06
topics_connected: [bus, crawl, map, telegram]
status: active
---

# 외부 API 어댑터 — friendly 프록시 + 정규화 + probe→fixture

## Pattern

이 모노레포에서 **friendly 가 모든 외부 데이터 소스의 단일 신뢰 경계**다. 웹/앱은 서드파티·공공 API 를 직접 부르지 않는다 — 서울시 버스 API, 네이버/캐치테이블/다이닝코드/테이블링 크롤 소스, vworld 타일 키, 텔레그램 Bot API 가 전부 friendly 를 통과하거나 friendly 에서만 시크릿이 산다. 이 경계를 세우는 recipe 는 소스가 REST XML(bus)이든 스크래핑(crawl)이든 타일 키(map)든 bot polling(telegram)이든 네 개의 같은 다리로 반복된다: **(a) friendly 프록시로 감싼다** — 브라우저가 못 부르는 이유(평문 HTTP, CORS 없음, 시크릿 노출)를 서버가 흡수. **(b) 저수준 어댑터(`*.adapter.ts`)가 외부 응답을 내부 zod 모양으로 정규화하되 필드명을 불신한다** — 대표적으로 버스 좌표는 필드명이 아니라 값 범위로 WGS84 를 판정하고, 테이블링 리뷰 이미지는 string/object 양쪽을 방어 추출한다. **(c) 시크릿 키/토큰을 로그에서 마스킹**한다 — 평문 URL 을 절대 안 싣고 `***` 마스킹본만 남긴다. **(d) probe 스크립트로 실응답을 확정하고 그 실응답을 테스트 fixture 로 박는다** — 코드에 박힌 추정(키 형태·좌표계·오타 필드명)을 1회성 진단 도구로 실측해 굳힌다.

네 다리가 모든 소스에 균등하게 있는 건 아니다 — 그 **불균형이 오히려 이 컨셉의 정보값**이다. bus 와 crawl 이 네 다리를 다 갖춘 정본이고, telegram 은 프록시 대신 "단일 서버 클라이언트" + 마스킹 + 서버측 검증(getMe/getChat)까지만, map 은 아예 **프록시 다리를 의도적으로 빼고**(타일 바이트는 브라우저가 vworld CDN 을 직접 친다) 시크릿 보관 + 서버측 키 검증(`probeVworldKey`)만 남긴다. fixture 로 실응답을 박제하는 (d) 는 bus 가 유일하게 완전하고(12개 XML), crawl 은 `__debug__` 덤프 + 파서 미러, map/telegram 은 런타임/부팅 검증으로 대체한다. 즉 이 recipe 는 강제 규격이 아니라 **소스의 위험 프로파일에 맞춰 다리를 켜고 끄는 도구 상자**다.

## Instances

- **2026-07** in [[../topics/bus]] (`bus-api.adapter.ts` + `probe-bus-api.ts`): recipe 를 네 다리 다 갖춘 **정본**. `callBusApi` 가 `ws.bus.go.kr` 평문 HTTP(CORS 없음)를 friendly 에서만 호출하고, XML 을 `fast-xml-parser` 로 파싱해 타입드 래퍼 9종으로 정규화. **필드명 불신의 교과서** — 서울시 응답은 `tmX/tmY` 필드에 WGS84 든 GRS80 TM 이든 섞여 오므로 `toLatLng` 가 후보 쌍 `[tmX,tmY]→[gpsX,gpsY]→[posX,posY]` 를 순회하며 **한국 WGS84 값 범위(lat 33~39, lng 124~132)에 드는 첫 쌍**을 채택(proj4 불필요). 마스킹: `buildUrls` 가 `requestUrl` 에 `serviceKey=***` 만 남기고 평문 키 URL 은 보관 안 함(`bus-api.adapter.ts` line 34·146). probe→fixture: `probe-bus-api.ts` 가 실응답을 `data/bus-probe/` 에 떨구고, 그 발췌를 `__fixtures__/*.xml` 12개(`stations-multi`·`arrivals`·`route-path`·`auth-error-headercd7`·`no-result` 등)로 박아 `bus-api.adapter.test.ts` 의 `readFixture` 가 소비 — 2026-07-02/04 실측으로 좌표계·`headerCd` 인증실패 두 형태를 확정.
- **2026-05** in [[../topics/crawl]] (`naver-place.playwright.adapter.ts` + `naver-*.http.adapter.ts` + `dev-capture-visitor.ts`): 네이버 소스는 어댑터 비용이 갈린다 — 홈/방문자 리뷰는 `playwright-extra` + stealth 풀세션(anti-bot 우회), 검색·방문자 리뷰 수는 HTTP GraphQL 직접(`naver-search.http.adapter.ts`·`naver-review-stats.http.adapter.ts`). 어느 쪽이든 friendly 가 유일 호출자이고 결과를 `api-contract` 의 `NaverPlaceData` zod 모양으로 정규화. **probe→fixture 의 변형** — 정적 fixture 대신 `dev-capture-visitor.ts` 가 헤디드 캡처를 `__debug__/after.json` 에 떨구되 **내부에 어댑터의 `parseVisitorReviewsFromCaptured` 와 동일한 파서를 미러**해 `dev:api` 없이 파이프라인을 E2E 검증(라이브 미러형). `x-wtm-graphql` 헤더처럼 봇 차단용 시크릿성 헤더도 `buildWtmHeader` 가 서버측에서만 만든다.
- **2026-06** in [[../topics/crawl]] (`tabling-search|shop|place|sitemap.http.adapter.ts` + `probe-tabling.ts`): 무인증 REST 소스의 4어댑터 분포. **필드명 불신이 극단으로** — 테이블링 좌표는 string("37.54…")으로 와서 `numOrNull` 이 number 변환하고, 리뷰 `imageUrls`/`menuOrders` 는 string 또는 `{imageUrl|url|origin}` object 양쪽을 방어 추출하며, `cursorId` 필드는 이름과 달리 페이지네이션 토큰이 **아니다**(`lastIdx` 가 진짜 토큰). 미입점 place 는 JSON-LD 가 `<script>` 태그가 아니라 **Next.js RSC flight(`self.__next_f.push`) 안에 이중 인코딩**돼 있어 flight 디코드 후 한 번 더 파싱. friendly 가 `Referer`/`Origin` 헤더를 정합성용으로 동봉해 브라우저 CORS 를 우회. probe: `probe-tabling.ts`/`probe-tabling-bulk.ts`/`probe-tabling-promote.ts` 가 실응답을 확정.
- **2026-05** in [[../topics/crawl]] (`diningcode-search|shop.http.adapter.ts`): CORS 열림 + CF 없음이라 HTTP 직접 프록시가 가장 얇은 형태. `POST /API/isearch/`(검색)·`POST /API/profile/`(상세+리뷰, 한 endpoint 로 16섹션). 응답 `result_code==='100'` 이 정상, `poi_section.total_cnt` 10000 캡을 불신하고 `params.rcount` 를 실제 매칭 수로 씀 — **응답 필드를 액면 그대로 안 믿는** 같은 결.
- **2026-05** in [[../topics/map]] (`map.service.ts` + `vworld.ts` `probeVworldKey`): **프록시 다리를 의도적으로 뺀 발산 사례**. vworld 타일 바이트는 브라우저가 `api.vworld.kr/req/wmts/...` 를 **직접** 친다(friendly 프록시 없음) — WMTS 키는 어차피 브라우저 Network 탭에 노출되는 클라이언트 자원이라 서버로 감싸도 보안 등급 차이가 없다는 판단. friendly 는 두 다리만 맡는다: (1) **시크릿 보관** — `MapProviderConfig` DB 행에 평문 키를 두고 공개 `publicConfig` 라우트로 내줌(→ [[db-config-env-fallback]]), (2) **서버측 키 검증 probe** — `probeVworldKey` 가 `Base/7/44/109.png` 한 장을 fetch 해 `200 + content-type:image/*` 로 OK/거부 판정(어드민 "연결 테스트"). bus 의 probe→fixture 가 여기선 런타임 헬스체크로 변형됐다.
- **2026-06** in [[../topics/telegram]] (`telegram.service.ts` + `telegram-config.service.ts`): 프록시 대신 **단일 서버 클라이언트**. friendly 단일 인스턴스가 `api.telegram.org` 에 long-polling `getUpdates` 하나만 돌리고(webhook=공개 HTTPS URL 노출 회피), `sendMessage`/`editMessageText`/`answerCallbackQuery` 로 송신. 정규화: 콜백/텍스트 메시지를 기능 중립적 payload 로 다듬어 핸들러에 넘김(순수함수 `region-stats-telegram.ts` 가 CJK 2칸 폭 `visualWidth` 로 렌더). 마스킹: 봇 토큰을 `maskApiKey`(ai 모듈 재사용)로 가려 응답에 평문 노출 0. probe 대응물: `verifyBot`(getMe)→`verifyChat`(getChat)→`sendTestMessage` 서버측 검증 3단계 + `resolveChatId`(폴러 멈추고 롱폴로 chat 후보 추출). 토큰은 DB 우선 + env fallback(→ [[db-config-env-fallback]]).

## What This Means

이 패턴이 알려주는 것:

1. **경계를 한 곳(friendly)에 몰아서 시크릿·프로토콜 문제를 한 번에 흡수한다** — 평문 HTTP(bus), CORS 차단(crawl 소스 다수), anti-bot(naver stealth), 토큰 노출(telegram)은 전부 "브라우저가 직접 부르면 안 되는 이유"다. 각 소스가 자기 이유로 friendly 를 필요로 하지만, 어댑터 계층이라는 **같은 모양의 자리**에 흡수돼 웹/앱은 어느 소스가 왜 프록시되는지 몰라도 된다.
2. **필드명은 계약이 아니라 힌트다** — 외부 API 는 이름이 틀리거나(버스 `tmX` 에 WGS84, 서울시 원문 오타 `getStaionByRoute`·`congetion`), 타입이 흔들리거나(테이블링 좌표 string, 이미지 string/object), 이름이 거짓말을 한다(테이블링 `cursorId` 가 토큰 아님). 어댑터는 **필드명 대신 값의 성질**로 판정한다 — 버스 좌표는 값 범위로 WGS84 를 고르고, 다이닝코드는 `total_cnt` 캡을 무시하고 `rcount` 를 믿는다. 이게 정규화 계층이 단순 rename 매핑이 아니라 **방어적 파서**여야 하는 이유다.
3. **probe→fixture 가 "외부 계약을 코드로 굳히는" 방법** — 외부 API 는 문서가 부정확하거나(data.go.kr 키 인코딩), 실측해야만 알 수 있는 함정(좌표계 혼재, `headerCd` 인증실패 두 형태)이 많다. 1회성 probe 로 실응답을 확정하고 그 실응답을 fixture 로 박으면, 추정이 **재현 가능한 회귀 테스트**가 된다. bus 가 이 다리를 완전히 갖췄고(`readFixture` 로 12 XML), crawl 은 파서 미러 라이브 검증으로, map/telegram 은 런타임 검증으로 형태만 달리했다.
4. **recipe 는 규격이 아니라 위험 프로파일에 맞춘 도구 상자** — map 이 프록시 다리를 뺀 건 결함이 아니라 **판단**이다(공개 키는 감쌀 가치 없음). telegram 이 fixture 대신 서버측 라이브 검증을 쓴 것도 소스 특성(양방향 대화형) 때문이다. 새 외부 소스를 붙일 때 물어야 할 것은 "네 다리를 다 세우나"가 아니라 "이 소스는 어느 다리가 필요한가" — 시크릿이 진짜 비밀인가(마스킹 on/off), 프로토콜이 브라우저를 막는가(프록시 on/off), 응답이 실측으로만 확정되는가(fixture on/off).

이 패턴이 깨지거나 흔들리는 지점:
- **map 처럼 프록시를 뺀 소스가 늘면 "단일 신뢰 경계" 주장이 약해진다** — 키가 공개 자원이라 브라우저 직결이 정당한 경우가 많아지면, friendly 는 "프록시"가 아니라 "시크릿 금고 + 검증기"로 역할이 축소된다. 지금은 map 하나뿐이라 예외로 관리되지만, 카카오/네이버 지도가 같은 방식으로 붙으면 컨셉의 (a) 다리를 재정의해야 한다.
- **fixture 는 실응답 스냅샷이라 외부가 바뀌면 조용히 낡는다** — probe 는 1회성이고 fixture 는 그 시점(bus 2026-07-02/04)의 박제다. 서울시가 응답 모양을 바꾸면 fixture 테스트는 초록인데 라이브만 깨진다 — 그래서 bus 는 `bus-api.live.test.ts` 를 따로 두어 실 API 를 별도로 친다(fixture=회귀 고정, live=드리프트 감지 두 층).
- **정규화가 계약을 재확인하는 짝** — 어댑터가 정규화한 결과는 [[zod-ssot-buildless]] 의 zod 계약이 직렬화 시점에 한 번 더 검증한다(버스 좌표 값 범위가 코드 상수와 계약 `z.number().min(33).max(39)` 로 이중). 어댑터가 실수로 TM 값을 흘리면 계약이 막는다 — 정규화 다리와 계약이 서로를 검산.

다른 컨셉과의 관계: [[in-memory-singleton-gates]] — bus 의 일일 쿼터 게이트·in-flight 합류가 이 어댑터 **위에 얹혀** 외부 호출 예산을 회계한다(어댑터가 "어떻게 부르나", 게이트가 "얼마나 부르나"). [[db-config-env-fallback]] — telegram/map 의 시크릿 키가 DB 우선 + env fallback 으로 살아 이 컨셉의 (c) 마스킹 다리와 짝을 이룬다(설정 서비스가 어댑터에 유효 키를 주입). [[zod-ssot-buildless]] — 어댑터 정규화 결과를 zod 계약이 재확인(위 참조). [[public-admin-route-split]] — map 의 `publicConfig` 공개 라우트가 어드민 secret 경로와 분리되는 사례.

## Sources

- [[../topics/bus]]
- [[../topics/crawl]]
- [[../topics/map]]
- [[../topics/telegram]]
- [[in-memory-singleton-gates]]
- [[db-config-env-fallback]]
- [[zod-ssot-buildless]]
- [[public-admin-route-split]]
