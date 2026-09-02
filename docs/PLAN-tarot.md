# 타로 기능 구현 계획 — "로그인 없이, WebGL 로 화려하게, Ollama Cloud 해석"

> 2026-09-02 작성. 커밋 여부는 사용자 지시에 따름(작성 시점 untracked).
> 계획 시점의 기록이며, 이후 실제 진행·변경 사항은 커밋 이력이 진실이다.

## Context

"선택을 대신 골라주는 서비스"에 타로를 넣는다. 일반 타로(오늘의 카드·3장)에 더해 **"A 냐 B 냐 선택 타로"** 를 주력 스프레드로 두어 서비스 컨셉과 잇는다.
카드 의미(78장 × 정·역)는 코드에 정적 데이터로 두고, 질문·자리·카드 조합을 **문장으로 엮는 부분만 Ollama Cloud** 에 맡긴다. LLM 이 없거나 한도를 넘어도 정적 해석으로 항상 동작한다.

**사용자 결정 (확정 — 2026-09-02 대화 기준)**

| # | 결정 | 비고 |
|---|---|---|
| 1 | **웹 먼저**. 앱은 v2 에서 WebView 로 `/tarot?embed=1` 임베드 | 지도(`PublicRestaurantsWebMap.native.tsx`)에서 이미 쓰는 패턴. 임베드 모드는 v1 부터 설계 |
| 2 | 덱은 **78장 전부**, 마이너 56장도 **장면형**(카드마다 다른 그림) | 핍형(심볼 개수) 아님 |
| 3 | 카드 이미지는 **제미나이로 생성**(사용자 작업). 아트 방향은 **민화풍 + 금박** 을 1순위로 2방향 시험 후 확정 | 이 문서의 프롬프트북(`docs/tarot-deck-prompts.md`) 사용 |
| 4 | 애니메이션은 **WebGL 수준**(three.js + React Three Fiber) | 하이브리드: 3D 무대 + DOM 오버레이 |
| 5 | **로그인 없이 무료**. 익명 한도는 **다른 기능도 쓸 수 있는 공통 서비스**로, **회원은 기기·IP 일일 한도 없음** | 전역 일일 LLM 예산은 안전망으로 전원 적용, 게스트 80% 컷 |
| 6 | 한도 값은 **어드민 설정**에서 조정 (`/admin/settings/quotas`) | env 는 초기값·폴백 |
| 7 | 역방향 사용(토글, 기본 켬, 확률 30%) | |
| 8 | 질문은 주제 칩 + 자유 텍스트(200자) | |
| 9 | 서버 저장: 게스트는 **공유 시에만**, 회원은 **자동 저장**(`/me/tarot`) | 게스트 기록은 기기 로컬 |
| 10 | 공유 카드 이미지(satori) v1 포함 | |
| 11 | 로그인 혜택 = 기록 동기화 + 한도 면제 + 켈틱크로스(v2) | |
| 12 | 효과음은 기본 꺼짐 토글 | 배경음 없음, SFX 만 |
| 13 | WebGL 미지원·저사양·reduced-motion 은 **기능만 되는 최소 모드** | 애니메이션 두 벌 안 만듦 |
| 14 | 3D 레이어는 단위 테스트 없이 수용, 흐름 상태 머신만 테스트 | |
| 15 | 켈틱크로스는 v2, 메뉴 타로는 v3 후보 | |
| 16 | 오늘의 카드는 하루 1장 고정(게스트 기기·회원 계정) | |

**기본값 (이견 없어 확정)**: 카드 한글명 음차(완드·컵·소드·펜타클 / 페이지·나이트·퀸·킹, 영문 병기) · 해석 톤 존댓말·따뜻·담백·조언형 · 뽑기는 부채꼴 직접 선택 + "자동으로 뽑기" · 공유 링크 만료 없음(게스트 삭제 불가, 회원 삭제 가능) · 타이틀 세리프(Noto Serif KR 서브셋, 타로 라우트만) · 사이드바 위치 대기질 다음·식단 앞 + 홈 진입 카드 · 마우스 시차 효과 켬, 자이로 끔.

## 용어

| 용어 | 뜻 |
|---|---|
| **덱** | 78장. 메이저 아르카나 22장(`major-00` 바보 … `major-21` 세계) + 마이너 56장(`wands/cups/swords/pentacles` × `01`~`10`, `page/knight/queen/king`) |
| **정·역방향** `reversed` | 뒤집혀 나온 카드. 의미가 달라진다. 확률 30% |
| **스프레드** `spreadId` | 카드 수와 자리 의미. v1: `daily`(1장) · `three-ppf`(과거·현재·미래) · `three-sar`(상황·조언·결과) · `choice`(A·B·조언). v2: `celtic`(10장) |
| **리딩** `TarotReading` | 한 번의 결과 — 스프레드·주제·질문·뽑힌 카드·해석·출처(llm/static)·모델 |
| **주제** `topic` | `general / love / work / money / relationship / choice`. 프롬프트 톤과 정적 해석 템플릿 선택에 쓴다 |
| **게스트 키** `X-Guest-Key` | 기기 영속 UUID. 일일 한도·오늘의 카드 잠금·로컬 기록 식별. 투표 `voterKey` 와 별개 |
| **사용량 한도** `usage quota` | feature × scope(guest / ip / global) × 날짜 카운터. 타로가 첫 사용처 |

## 사전 준비 (사용자 액션)

1. **시험 카드 생성** — 프롬프트북의 스타일 바이블로 뒷면 1장 + 메이저 2장(예: 별, 달)을 2가지 방향(민화풍+금박 / 아르누보 금박)으로 생성해 방향 확정.
2. **78장 + 뒷면 생성** — 확정한 기준 카드를 참조 이미지로 넣고 수트별 배치 생성. **글자·테두리 없이**, 9:16, 가능하면 2K 이상. 파일명 `assets-src/tarot/raw/<cardId>.png`(gitignore).
3. Ollama Cloud — `tarot` purpose 가 어드민 AI 키 화면에 자동 노출된다. 익명 트래픽이 식단 기능 쿼터를 나눠 쓰지 않게 하려면 **purpose 전용 키(own)** 를 넣는다(선택).
4. 배포 시 nginx 에 `location ^~ /tarot/s/` 프리렌더 프록시 추가(정산 `/s/`·투표 `/vote/` 와 동일 패턴, `docs/deploy-friendly.md`).

## 아키텍처 개요

### 모듈 구조

```
packages/utils/src/            (utils 는 폴더 없이 평면 파일 관례)
  tarotCards.ts         78장 메타(id·nameKo·nameEn·arcana·suit·number·element·keywordsUp/Rev·meaningUp/Rev)
  tarot.ts              주제·스프레드(자리 id·라벨·프롬프트 힌트)·시드 난수·셔플·뽑기·검증·이미지 경로
  tarotFlow.ts          뽑기·리빌 흐름 상태 머신(순수 리듀서, 테스트 대상)
packages/api-contract/src/schemas/tarot.ts     리딩 요청·응답·공유·회원 기록·어드민 한도 zod
packages/api-contract/src/routes.ts            Routes.Tarot / Routes.Admin.Quotas
packages/shared/src/stores/guestKeyStore.ts    공용 게스트 키(persist, 앱 주입 패턴)
packages/shared/src/stores/tarotHistoryStore.ts 게스트 로컬 기록(최근 50건)
packages/shared/src/hooks/useTarot*.ts         리딩 mutation·공유·회원 기록 query
apps/friendly/src/modules/tarot/
  tarot.route.ts        공개 리딩·공유·회원 기록
  tarot.service.ts      검증 → 캐시 → 한도 → LLM → 정적 폴백
  tarot.prompts.ts      시스템 프롬프트·JSON 스키마 텍스트·버전 상수
  tarot-static.ts       정적 해석 조립(카드 의미 × 자리 템플릿 × 주제)
  tarot-share-card.ts   satori 공유 이미지(OG 1200×630, 세로 1080×1920)
apps/friendly/src/modules/usage-quota/
  usage-quota.service.ts   consume({feature, scope, key, limit}) — MealDailyQuota 일반화
  usage-quota.route.ts     어드민 설정 CRUD + 오늘 사용량
apps/friendly/src/plugins/jwt.ts               authenticateOptional 추가
apps/web/src/routes/TarotPage.tsx              /tarot (lazy), /tarot/s/:token, /me/tarot
apps/web/src/components/tarot/
  TarotStage.tsx        R3F Canvas + 품질 등급 + 폴백 판정
  Deck.tsx / CardMesh.tsx / Particles.tsx / Effects.tsx / Table.tsx
  TarotOverlay.tsx      DOM: 주제 칩·질문·스프레드 선택·해석·공유
  TarotLite.tsx         최소 모드
apps/web/src/routes/admin/settings/AdminQuotasPage.tsx   사용량 한도 탭
apps/friendly/scripts/build-tarot-deck.ts      raw PNG → 7:12 크롭 → webp 512/1024 (+뒷면 대칭·placeholder) → apps/web/public/tarot/cards/
docs/tarot-deck-prompts.md                     스타일 바이블 + 뒷면 + 78장 프롬프트
```

### 계약·공유 패키지

- 카드 메타·스프레드·뽑기 로직은 `@repo/utils` (순수, 웹·앱·friendly 공유). 서버는 클라이언트가 보낸 카드 목록을 같은 데이터로 검증만 한다(중복·범위·스프레드 장수).
- 뽑기는 **클라이언트가 수행**한다. 부채꼴에서 직접 고르는 경험이 핵심이고 결과에 이해관계가 없어 서버 난수가 필요 없다.
- 흐름 상태 머신은 `@repo/utils` 의 `tarotFlow.ts` 에 순수 리듀서로 두고 vitest 로 검증한다(React 의존 없음). 3D 컴포넌트는 이 상태를 그리기만 한다.
  phase 는 `setup → shuffling → picking → placing → revealing → reading`, 결과 상태(`idle/pending/ready/failed`)는 phase 와 독립.

### Prisma (초안 — 1차에 확정)

```prisma
model TarotReading {
  id            String   @id @default(cuid())
  userId        String?                         // 회원 자동 저장
  guestKey      String?                         // 게스트 공유 시 생성
  shareToken    String?  @unique                // 공유 링크. 회원도 공유 누르면 발급
  spreadId      String
  topic         String
  question      String?                         // 최대 200자. 로그·텔레메트리에 남기지 않음
  cardsJson     String                          // [{cardId, position, reversed}]
  resultJson    String                          // 해석 JSON(카드별·종합·조언·키워드·선택 추천)
  source        String                          // 'llm' | 'static'
  model         String?
  promptVersion String?
  dayKey        String                          // KST yyyy-mm-dd (오늘의 카드 계정 잠금)
  createdAt     DateTime @default(now())
  @@unique([userId, spreadId, dayKey], name: "daily_lock")   // spreadId='daily' 만 의미 있음
  @@index([userId, createdAt])
}

model UsageQuotaSetting {
  feature        String  @id                    // 'tarot-reading' …
  enabled        Boolean @default(true)
  guestPerDay    Int     @default(5)
  ipPerDay       Int     @default(60)            // CGNAT 고려 넉넉히. 게스트키 재생성 우회의 2차 방어
  ipPerMinute    Int     @default(6)             // @fastify/rate-limit max 를 함수로 읽음
  globalPerDay   Int     @default(300)           // LLM 호출 예산. 전원 적용
  guestCutoffPct Int     @default(80)            // 전역 예산 이 % 넘으면 게스트는 정적 해석
  updatedAt      DateTime @updatedAt
}

model UsageQuotaCounter {
  feature   String
  scope     String                               // 'guest' | 'ip' | 'global' | 'user'
  key       String                               // guestKey / ip / '*' / userId
  date      String                               // KST yyyy-mm-dd
  count     Int      @default(0)
  updatedAt DateTime @updatedAt
  @@id([feature, scope, key, date])
}
```

- `UsageQuotaCounter.consume` 은 `MealDailyQuotaService` 와 같은 `INSERT … ON CONFLICT … WHERE count < limit` 한 문장. 기존 `meal_daily_quotas` 는 이번에 옮기지 않는다.
- 설정은 프로세스 메모리에 캐시(30초)하고 어드민 PUT 시 즉시 무효화. env(`TAROT_*_LIMIT`)는 행이 없을 때 초기값.
- 카운터는 30일 지난 행을 스케줄 플러그인에서 정리.

### 라우트 (`Routes.Tarot` — 전부 `/api/v1` 하위)

| 메서드 | 경로 | 인증 | 한도 | 설명 |
|---|---|---|---|---|
| POST | `/tarot/readings` | optional | `RATE.tarotReading`(IP 분당, 설정값) + usage-quota | 카드·스프레드·주제·질문 → 해석. 회원은 저장 후 id 반환, 게스트는 저장 없이 결과만. `daily` 는 회원이면 오늘 것 재반환 |
| POST | `/tarot/shares` | optional | `RATE.publicVote` 수준 | 게스트: 리딩 전체를 본문으로 받아 저장 + 토큰. 회원: readingId 로 토큰 발급 |
| GET | `/tarot/shares/:token` | 없음 | `RATE.publicShare` | 공유 조회(질문 포함 여부는 공유 시 체크박스, 기본 제외) |
| GET | `/tarot/shares/:token/image.png` | 없음 | `RATE.publicShare` | OG 1200×630. `?format=story` 로 1080×1920 |
| GET | `/tarot/me/readings` | 회원 | | 목록(커서) |
| GET/DELETE | `/tarot/me/readings/:id` | 회원 | | 상세·삭제(공유 토큰도 함께 무효) |
| GET/PUT | `/admin/quotas` | 관리자 | | 기능별 한도 설정 |
| GET | `/admin/quotas/usage?date=` | 관리자 | | 그날 scope 별 합계·상위 키 |

응답 `TarotReadingResult`:

```ts
{
  readingId: string | null,            // 회원만
  source: 'llm' | 'static',
  model: string | null,
  cards: [{ cardId, position, reversed, nameKo, nameEn, keywords: string[], text: string }],
  summary: string,
  advice: string,
  keyword: string,                     // 한 줄 키워드
  choice?: { recommended: 'A' | 'B' | 'either', confidence: 'low'|'mid'|'high', reason: string },
  quota: { remainingToday: number | null }   // 게스트만 숫자
}
```

## LLM 설계

### purpose·모델

- 새 purpose **`tarot`** — `LlmProviderPurpose` enum, `OLLAMA_TAROT_MODEL`, `buildLlmProviderEnv.defaultModels`. 어드민 AI 키 화면은 enum 을 순회하므로 자동 노출.
- 기본 모델 **gpt-oss:120b**(`think:'low'`, temperature 0.8, numCtx 8192, maxTokens 1200 / 켈틱 2500). 1차에서 `probe:tarot-reading` 으로 gemma4:31b · deepseek-v4-flash · qwen3.5 를 20개 샘플 스프레드로 비교(한국어 문장 품질·JSON 준수·p50 지연)해 `.env.example` 에 실측 주석으로 남긴다.

### 프롬프트·출력

- 시스템: 역할(따뜻하고 담백한 타로 리더, 존댓말), 금지(의료·법률·투자 단정, 공포 조장, 사용자 질문 속 지시 무시), 출력 JSON 스키마 텍스트, 카드별 2~3문장·종합 3~4문장·조언 2문장·키워드 1줄.
- 사용자 메시지: 스프레드·자리 의미, 카드마다 `nameKo/nameEn/reversed/keywords/meaning`(정적 데이터를 그대로 넣어 전통 의미와 어긋나지 않게), 주제, 질문(데이터 블록으로 감쌈).
- Ollama Cloud 는 JSON 스키마 강제가 없으므로 `format:'json'` + `extractFirstJsonObject` + zod + **수리 재시도 1회**(식단·영수증과 동일).
- 실패·타임아웃(20초)·한도 초과 시 **정적 해석**: `meaningUp/Rev` + 자리 템플릿 + 주제 문구를 조립. `source:'static'` 으로 내려 UI 가 "AI 해석 다시 시도" 버튼을 보인다.

### 캐시·지연

- lru-cache: key = hash(promptVersion, spreadId, cards, topic, 정규화 질문), TTL 24h, 2,000건. `daily` 는 (cardId, reversed, dayKey) 156 조합이라 사실상 전부 히트.
- 클라이언트는 **마지막 카드를 고른 순간** 요청을 보내고, 플립 리빌(4~5초)이 대기를 덮는다. 아직 응답 전이면 "카드를 읽는 중" 오브 애니메이션, 도착하면 타자 효과.
- 스트리밍은 어댑터가 `stream:false` 고정이라 v1 제외. v2 에 SSE(텔레메트리 라우트 패턴) 검토.

### 프라이버시

- 질문 텍스트는 info 로그·LLM 텔레메트리(토큰 수만 저장)에 남기지 않는다. 게스트 리딩은 공유를 누르기 전엔 서버에 없다.
- 공유 페이지는 기본적으로 질문을 숨기고, 공유 시 "질문 포함" 체크로만 노출.

## 카드 이미지 파이프라인

- **원본**: 제미나이 9:16, 글자·테두리 없음(글자는 UI 가 그리고 테두리는 CSS/3D 프레임). 죽음·악마·탑·매달린 남자·소드 10 등은 안전 필터를 피하는 완곡 묘사로 프롬프트 작성.
- **해상도**: 목표 1024×1755(7:12). 나노바나나 기본 1K 는 세로가 1024 라 부족하므로 2K 생성이 우선, 안 되면 sharp lanczos 업스케일(회화풍이라 티가 덜 남).
- **일관성**: 스타일 바이블 문단 고정 + 기준 카드를 참조 이미지로 첨부 + 수트별 팔레트(완드 붉음·컵 푸름·소드 은빛·펜타클 금녹색)로 배치 생성.
- **빌드**: `scripts/build-tarot-deck.ts` 가 `assets-src/tarot/raw/*.png` 를 7:12 중앙 크롭 → webp q80 512×878 / 1024×1755 → `apps/web/public/tarot/cards/`. 뒷면 `back-512/1024.webp`. 누락 카드 목록 출력.
- **git**: raw 는 gitignore, webp 출력물(≈16MB)은 커밋. 웹 dist 에 포함돼 nginx 가 서빙하고 앱도 같은 URL 을 쓴다.
- **대체 덱**: 생성이 늦어지면 라이더 웨이트(저작권 만료) 스캔으로 먼저 붙여 개발을 막지 않는다.

## 웹 3D 설계

- 스택: `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`. `/tarot` lazy 청크에만 포함. 사이드바 링크 hover 시 prefetch.
- **하이브리드**: Canvas 는 무대(테이블·덱·카드·파티클·조명·bloom), 텍스트·입력·해석·공유는 DOM 오버레이. 한글 텍스트는 WebGL 로 그리지 않는다.
- **흐름(상태 머신)**: `idle → setup(주제·질문·스프레드) → shuffling → picking → placing → revealing → reading → done`. 각 전이는 `flow.ts` 순수 함수, 3D 는 상태를 그린다.
- **장면**
  - 입장: 어두운 남색 배경, 별·안개 파티클(GPU 포인트), 타이틀 글로우, 마우스 시차.
  - 셔플: 78장 인스턴스드 메시가 호를 그리며 섞임(1.5초).
  - 뽑기: 부채꼴 배열, 호버 시 떠오름+림 라이트, 클릭하면 자리로 비행. "자동으로 뽑기" 버튼(접근성 경로).
  - 리빌: 자리별 순차 3D 플립(rotateY) + 빛 스윕 + 홀로그램 포일 셰이더 + 파티클 버스트, 역방향은 180° 회전. 수트별 조명색.
  - 해석: DOM 패널 타자 효과, 카드 호버 시 3D 카드가 살짝 기울어짐.
- **텍스처 예산**: 부채꼴은 뒷면 1장 공유. 앞면은 뽑힌 카드만 512 로 지연 로드(뽑는 즉시 prefetch, 로드 완료 후 플립). DOM 패널·공유 이미지는 1024.
- **품질 등급**: DPR 상한 2, 모바일 단말은 bloom 끄고 파티클 1/3. `WebGL2` 미지원·`prefers-reduced-motion` 은 `TarotLite`(정적 카드 + 탭 리빌).
- **임베드 모드** `?embed=1`: 상단바·사이드바 제거, safe-area 패딩, `postMessage` 로 게스트 키·액세스 토큰 수신(앱 v2).
- **효과음**: 플립·반짝임 2종, 기본 꺼짐, 사용자 제스처 후에만 재생.

## 공유

- 게스트는 결과 화면의 "공유" 를 누를 때 리딩 전체를 서버에 저장하고 토큰을 받는다. 회원은 저장된 id 로 토큰 발급.
- `/tarot/s/:token` 은 공개 결과 페이지(3D 없이 2D 카드 + 해석). 크롤러용 OG 는 nginx `^~ /tarot/s/` 가 friendly 로 프록시.
- 이미지: satori + resvg 2D 합성(WebGL 캡처 아님). OG 1200×630 + 세로 1080×1920(스토리·카톡).

## 어드민

- `/admin/settings/quotas` 탭("사용량 한도"): 기능별 `enabled · guestPerDay · ipPerDay · ipPerMinute · globalPerDay · guestCutoffPct` 편집 + 오늘 사용량(scope 별 합계, 전역 예산 진행률, 상위 IP/게스트 키 10개). 첫 행은 `tarot-reading`.
- AI 키 화면에 `tarot` purpose 자동 노출. 전용 키를 넣으면 계정 게이트도 분리된다.
- `probe:tarot-reading` 결과는 `.env.example` 주석과 이 문서 진행 기록에 남긴다.

## 쿼터·보안

| 층 | 대상 | 기본값 | 비고 |
|---|---|---|---|
| IP 분당 | 전원 | 6 | `@fastify/rate-limit`, `max` 를 설정 캐시에서 읽는 함수. 폭주 클라이언트 방어라 회원도 적용 |
| 게스트 키 일일 | 게스트 | 5 | 키 재생성으로 우회 가능함을 수용, 아래 두 층이 보완 |
| IP 일일 | 게스트 | 60 | CGNAT 고려 넉넉히 |
| 전역 일일 | 전원 | 300 | LLM 예산. 80% 넘으면 게스트는 정적 해석, 회원은 100% 까지 |
| 회원 | 회원 | 없음 | 기기·IP 일일 한도 면제 |

- 본문 zod 바운드(카드 ≤ 10, 질문 ≤ 200자), 카드 id 는 `@repo/utils` 목록으로 검증, 질문은 프롬프트에 데이터 블록으로만.
- 공유 토큰은 22자 base64url 난수, 조회는 `publicShare` 한도.

## 차수별 로드맵

| 차수 | 범위 | 산출물 |
|---|---|---|
| **0차** ✅ | 카드 78장 메타·의미(정·역) + 스프레드 + 뽑기·검증 + 흐름 상태 머신(테스트 39건) / 프롬프트북 / 덱 빌드 스크립트 | `packages/utils/src/tarotCards.ts`·`tarot.ts`·`tarotFlow.ts`, `docs/tarot-deck-prompts.md`, `apps/friendly/scripts/build-tarot-deck.ts` |
| **1차** ✅ | api-contract 스키마·Routes / friendly `tarot` 모듈(purpose·프롬프트·정적 폴백·캐시) / `usage-quota` 공용 서비스 + `resolveOptionalUser` + `X-Guest-Key` + shared 게스트 키 스토어·API·훅 / `probe:tarot-reading` | 마이그레이션 1건(`20260903120000_add_tarot_reading_and_usage_quota`: TarotReading + UsageQuotaSetting/Counter), 테스트 34건 |
| **2차** ✅ | 웹 `/tarot` 3D 전 흐름 + Lite 폴백 + 임베드 모드 + 사이드바·홈 카드 + 로컬 기록 | `apps/web/src/components/tarot/**`(stage: layout·textures·StageContext·FanDeck·DrawnCard·Scene / TarotStage·TarotOverlay·TarotLite·TarotCardImage·tarotQuality·useTypewriter), `routes/TarotPage.tsx`(+test 4건), shared `tarotHistoryStore`, PublicLayout `?embed=1` |
| **3차** ✅ | 공유(토큰·페이지·OG·세로 이미지·nginx 문서) | friendly `tarot-share-card.ts`·`tarot-preview.ts`, `lib/web-index.ts`·`lib/share-fonts.ts`, 마이그레이션 `add_tarot_share_question`; 웹 `TarotShareSheet`·`TarotSharedPage`·`TarotReadingView`(`/tarot/s/:token`); 테스트 friendly 6·웹 2 |
| **4차** | 어드민 사용량 한도 탭 + 회원 자동 저장·`/me/tarot`·오늘의 카드 계정 잠금·삭제 | `AdminQuotasPage` |
| **v2** | 켈틱크로스 10장 / 앱 WebView 임베드 / SSE 스트리밍 / 효과음 | |
| **v3 후보** | 메뉴 타로(수트·원소 → 음식 분류 → 맛집 DB 추천) | |

0차와 사용자 이미지 생성은 병렬. 2차는 이미지 없이 라이더 웨이트 대체 덱으로 진행 가능.

## 리스크·열린 질문

- **Ollama Cloud 요금제 한도**: 익명 트래픽이 계정 한도를 소모하면 식단 기능이 영향받는다. 전용 키(own) + 전역 예산으로 격리. 운영 초기엔 `globalPerDay` 를 보수적으로.
- **제미나이 일관성**: 78장 톤 유지가 가장 큰 불확실성. 참조 이미지 + 수트 배치 + 실패 카드 재생성 목록을 프롬프트북이 관리.
- **모바일 단말 WebGL**: 저사양 Android 에서 bloom·파티클이 프레임을 떨어뜨림. 품질 등급 자동 + Lite 폴백.
- **접근성**: 3D 뽑기는 키보드로 못 고른다. "자동으로 뽑기" 와 DOM 결과 패널이 대체 경로.
- 열린 질문: 회원 리딩 보관 기간(무제한 가정), 공유 페이지에서 카드 이미지 다운로드 허용 여부(허용 가정).

## 진행 기록

- 2026-09-02: 계획 작성. 결정 1~16 확정.
- 2026-09-02: **부채꼴 호버 개선.** 사용자 피드백("마우스오버가 어색"). 원인은 레이캐스트 기반 호버 — 들려 올라간 카드의 현재 위치를 맞히므로 포인터 밑에서 카드가 빠지면 이웃으로 바뀌고 다시 내려오는 떨림(팝콘)과, 14px 씩 겹친 부채꼴에서 어느 카드가 잡히는지 예측 불가. 정지 포즈의 화면 투영 x 최근접 판정(+히스테리시스 0.004 NDC, 세로 띠 ±0.42)으로 바꾸고, 호버 카드는 들림 0.42·전진 0.5·1.05 배·instanceColor 로 밝게, 이웃 7장은 거리 반비례로 좌우로 밀어 자리를 내준다. 클릭은 호버 중인 카드를 우선(터치는 레이캐스트 폴백).
- 2026-09-02: **3차 완료.** 공유는 서버가 만든 해석만 게시한다 — 게스트는 리딩 **입력**을 다시 보내고 서버가 캐시/LLM/정적으로 본문을 확보해 행(guestKey·shareToken)을 만들고, 회원은 readingId 로 저장 행에 토큰만 단다(재요청 시 같은 토큰, 질문 포함 플래그 `shareQuestion` 만 갱신). 토큰은 정산과 같은 7바이트 base64url. `POST /tarot/shares`(분당 10) · `GET /tarot/shares/:token`. `/tarot/s/:token` 은 friendly 가 OG(키워드·스프레드·카드명, 질문은 포함 시에만) 주입 + `image.png?format=og|story` satori 렌더(카드 webp → sharp JPEG data URI, 미생성 카드는 이름 박스, LRU 100). 웹: 해석 패널 "공유" → 시트(질문 포함 체크·링크 복사·OS 공유·세로 이미지 저장·미리보기), 공유 페이지는 2D `TarotReadingView` + "나도 타로 보기". dev 는 Vite 가 `/tarot/s/<token>/image.png` 만 friendly 로 프록시. 운영 nginx `^~ /tarot/s/` 블록을 deploy-friendly.md 에 추가. 크롬으로 시트·페이지·og·story 이미지 실측(세로 이미지는 카드 폭 분배·문단 명시 폭으로 겹침 수정). 미커밋.
- 2026-09-02: **2차 완료.** three 0.185 + R3F 9.7 + drei 10.7 + postprocessing 3.1 도입(vite `three` 벤더 청크, `/tarot` lazy). 무대: InstancedMesh 78장(드로우콜 1) + 뽑힌 카드 개별 mesh(6재질, 앞면 512 지연 로드·미생성 카드는 캔버스 placeholder), 덱 스택 → 4박자 산개 셔플 → 부채꼴(뒷면 전부 카메라 향함·roll 로 손부채 느낌·호버 들림·드래그 훑기) → 슬롯 비행 → 시간 기반 플립(역방향 roll π·발광·Sparkles 버스트) → 원소색 림 라이트. 품질 등급(high/medium: dpr·파티클·bloom) + Lite(WebGL2 없음·reduced-motion·?lite=1). 흐름 리듀서는 `seed` 기반 결정적으로 바꿔(StrictMode·미리 계산 안전) placing 진입 즉시 API 호출, useEffect 없음. 크롬 실측으로 잡은 함정 2개: ① 무대 안 useFrame 이 서로 다른 세그먼트 키로 timeline 을 리셋해 셔플이 안 끝남 → `segmentKey()` 단일화, ② three 가 InstancedMesh boundingSphere 를 첫 레이캐스트 때 한 번만 계산해 스택 상태 구 밖의 부채꼴은 클릭이 안 잡힘 → 고정 대구(radius 60). 데스크톱은 오른쪽 패널 + 카메라 시선 x 이동, 세로 폰은 바닥 시트 + 시선 y 하강·슬롯 spread 축소. 상단바·사이드바 "타로", 홈 진입 카드, Noto Serif KR 타이틀. 웹 테스트 90건(타로 4) green. 미커밋. 효과음·공유·어드민 한도 탭·회원 기록 페이지는 3·4차.
- 2026-09-02: **1차 완료.** 계약 `schemas/tarot.ts`·`schemas/usage-quota.ts` + `Routes.Tarot`/`Routes.UsageQuota`, purpose `tarot`(env `OLLAMA_TAROT_MODEL`, 어드민 AI 키 카드 자동 노출). friendly `modules/tarot`(service·prompts·static·route) + `modules/usage-quota`(service·admin route) + `plugins/usage-quota`(30초 설정 캐시, 04:40 카운터 정리) + jwt `resolveOptionalUser`. 회원 오늘의 카드 잠금은 `dailyLockKey`(userId:날짜, daily 만) unique 로. 한도 env 는 두지 않고 코드 기본값 + 어드민 DB 행으로 통일(계획의 `TAROT_*_LIMIT` 대신). shared `guestKeyStore`·`tarotApi`·`usageQuotaApi`·`useTarot*`·`useUsageQuota*`. 실모델 프로브 4건: gpt-oss:120b 4/4·p50 2.1s, gemma4:31b 4/4·p50 3.1s → 기본 gpt-oss 유지. 미커밋. 공유(3차)·어드민 한도 탭 UI(4차)는 아직.
- 2026-09-02: **0차 완료.** `@repo/utils` 에 78장 데이터·스프레드 5종(켈틱은 `available:false`)·시드 난수·셔플·뽑기·검증·이미지 경로·흐름 리듀서 추가, vitest 39건 green. 프롬프트북(스타일 A/B·뒷면·78장 장면·검수표) 작성. 빌드 스크립트는 합성 이미지로 7:12 크롭·뒷면 4방향 대칭·placeholder 한글 렌더 확인. 산출물 폴더(`apps/web/public/tarot/cards`)는 실제 이미지가 들어올 때 생성. 미커밋.
