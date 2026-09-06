# 사주 기능 구현 계획 — "계산은 코드, 문장은 LLM, 무대는 천문도"

> 2026-09-06 작성. 커밋 여부는 사용자 지시에 따름(작성 시점 untracked).
> 계획 시점의 기록이며, 이후 실제 진행·변경 사항은 커밋 이력이 진실이다.
> 타로(`docs/PLAN-tarot.md`)와 같은 골격을 쓴다 — 사주는 **생년월일시·성별 → 사주팔자(8글자) → 풀이**.

## Context

"선택을 대신 골라주는 서비스"에 사주를 넣는다. 내 사주 풀이(원국·성격·오행 균형·대운·올해·조언)와 오늘의 운세를 기본으로 두고,
서비스 컨셉과 잇는 **택일(날짜 고르기)·궁합(둘 중 누구/우리 둘)·오행 음식(오늘 뭐 먹지)** 을 v1 에 함께 넣는다.

타로와 동일한 원칙: **사주 계산은 `@repo/utils` 순수 코드가 결정적으로 하고, LLM 은 계산된 사실을 문장으로 엮기만 한다.**
LLM 이 없거나 한도를 넘어도 정적 풀이로 항상 동작한다. 사용자가 명리를 모르므로 학파 차이가 있는 항목은 기본값을 정하고 고급 옵션으로 둔다.

**사용자 결정 (확정 — 2026-09-06 대화 기준)**

| # | 결정 | 비고 |
|---|---|---|
| 1 | 선택 컨셉 연결 3종(**택일·궁합·오행 음식**) 전부 v1 | 3차에 구현 |
| 2 | **3D 무대**를 쓰되 **타로와 다른 연출** | 타로 = 남색 밤하늘·테이블·카드 / 사주 = 흑요석 천문도 원판·인장·먹 번짐 (§웹 3D 설계) |
| 3 | 이미지는 **제미나이 생성**(사용자 작업) — 일간 10장 + 띠 12장 | 프롬프트북 `docs/saju-image-prompts.md` |
| 4 | 긴 풀이는 **섹션 병렬 호출 + 도착 순 리빌**. 모델은 **kimi 계열도 후보**에 포함해 프로브로 확정 | SSE 는 v2 |
| 5 | 접근 정책은 타로와 동일 — 로그인 없이 무료, usage-quota `saju-reading`, 회원 자동 저장 | 어드민 "사용량 한도" 탭에 행 자동 노출 |

**기본값 (사용자 "이견 없으면 진행" — 명리 학파 차이 항목)**

| 항목 | 기본값 | 근거·비고 |
|---|---|---|
| 시간 보정 | 서울 기준 **진태양시**(동경 127.5°) — 현행 KST 에선 −30분. 역사적 표준시(1908~1911·1954~1961 UTC+8:30)와 **서머타임**(1948~51·55~60·87~88) 자동 반영 | 국내 만세력 앱 대부분의 기본. 고급 옵션 "보정 안 함" |
| 일주 경계 | 자시 시작(보정 후 23:00 = KST 23:30)에 날이 바뀜(전통) | 고급 옵션 "야자시"(23~24시는 당일 일주 + 다음날 시간 천간) |
| 출생 시간 모름 | 허용. 시주 없이 3기둥으로 풀이, "시간을 알면 더 정확해요" 안내. 대운 수는 그대로 계산 | 시주 의존 항목(시주 십신·십이운성)은 표시 생략 |
| 입력 달력 | 양력 / 음력(평달·윤달) | 음력 표는 KASI(한국천문연구원) 데이터로 생성 |
| 지원 범위 | 1900-01-01 ~ 2050-12-31 출생 | 음력 표·절기 검증 범위. 밖이면 안내 |
| 나이 표기 | 만 나이. 대운 시작은 "N세 M개월" | |
| 출생지 | 한국(서울) 고정. 해외 출생은 v2 후보(경도·시간대 입력) | |
| 톤 | 타로와 동일 — 존댓말·따뜻·담백·조언형. "재미로 보는" 고지 한 줄 | 건강·수명·재물 단정 금지 |
| 위치 | 라우트 `/saju-c`(명칭 "사주(C)" — 다른 사주 구현과 구분), 사이드바 타로 다음, 홈 진입 카드 타로 카드 옆 | |

## 용어

| 용어 | 뜻 |
|---|---|
| **사주(四柱)·팔자(八字)** | 년주·월주·일주·시주 4기둥, 각 기둥은 천간+지지 → 8글자 |
| **천간(天干)** `stem` | 갑을병정무기경신임계 10개. 각각 오행·음양이 있다 |
| **지지(地支)** `branch` | 자축인묘진사오미신유술해 12개(= 12띠). 각각 오행·음양·계절·시간대 |
| **60갑자** `ganzhi` | 천간 10 × 지지 12 의 60 조합(갑자·을축…). 년·월·일·시 각각 60갑자 하나 |
| **오행(五行)** `wuxing` | 목화토금수. 상생(목→화→토→금→수→목), 상극(목→토→수→화→금→목) |
| **일간(日干)** `dayMaster` | 일주의 천간 = "나". 성격·십신의 기준. 10종 캐릭터(갑목 큰 나무 … 계수 이슬비) |
| **십신(十神)** `tenGod` | 일간과 다른 글자의 관계 10종 — 비견·겁재·식신·상관·편재·정재·편관·정관·편인·정인 |
| **지장간(地藏干)** | 지지 속에 숨은 천간 1~3개(여기·중기·정기) |
| **십이운성(十二運星)** | 일간이 각 지지에서 갖는 기운의 단계 12종(장생·목욕·관대·건록·제왕·쇠·병·사·묘·절·태·양) |
| **신살(神殺)** | 특정 글자 조합의 길흉 표식 — 천을귀인·문창·도화·역마·화개·양인·괴강·백호 등 |
| **공망(空亡)** | 일주가 속한 순(旬)에서 비는 지지 2개 |
| **합·충·형·파·해** | 글자 사이 관계. 천간합/충, 지지 육합·삼합·방합, 충·형·파·해·원진 |
| **절기(節氣)** | 태양 황경 15° 간격 24개. 월주는 **12절**(입춘·경칩·청명·입하·망종·소서·입추·백로·한로·입동·대설·소한)에서 바뀌고 년주는 **입춘**에서 바뀐다(설날 아님) |
| **대운(大運)** | 10년 단위 운의 흐름. 월주에서 순행(양남음녀)/역행 60갑자. 시작 나이 = 절기까지 날수 ÷ 3 |
| **세운(歲運)·월운·일진(日辰)** | 해·달·날의 60갑자. 올해 2026 = 병오년. 오늘의 운세는 일진 vs 일간·일지 |
| **신강·신약** | 일간이 힘을 얻는 정도(득령·득지·득세). 보완 오행(용신 근사)의 근거 |
| **택일(擇日)** | 날짜 범위에서 내 사주에 맞는 날 고르기 |
| **궁합(宮合)** | 두 사주의 어울림 — 일간·일지·년지 관계 + 오행 보완 |

## 사전 준비 (사용자 액션)

1. **data.go.kr 신청 2건** (기존 `DATA_GO_KR_API_KEY` 사용, 보통 자동 승인): 한국천문연구원 **"음양력 정보"**(`LrsrCldInfoService`) · **"천문우주정보 > 24절기 정보"**(`SpcdeInfoService`). 표 생성 스크립트(`pnpm --filter friendly build:saju-tables`)가 1회 받아 `@repo/utils` 에 내장한다. 신청 전에는 astronomy-engine 계산 표로 동작(절기 ±1분, 음력 골든셋 일치 — 실사용 충분). 공식값 교체는 선택.
2. **이미지 22장 생성** — 프롬프트북(`docs/saju-image-prompts.md`)으로 일간 10장 + 띠 12장. `assets-src/saju/raw/<id>.png`(gitignore) → `pnpm --filter friendly build:saju-images` 가 webp 로 변환해 `apps/web/public/saju-c/`.
3. Ollama Cloud — `saju` purpose 가 어드민 AI 키 화면에 자동 노출. 익명 트래픽 격리가 필요하면 purpose 전용 키(own).
4. 배포 시 nginx `location ^~ /saju-c/s/` 프리렌더 프록시(타로 `/tarot/s/` 와 동일 패턴, `docs/deploy-friendly.md`).

## 아키텍처 개요

### 모듈 구조

```
packages/utils/src/                (평면 파일 관례)
  sajuAstroTable.ts     생성물 — 24절기 시각(1899~2051, UTC 분) + 음력 월 표(1900~2050). build:saju-tables 가 덮어씀(astro/kasi)
  sajuCalendar.ts       율리우스일·절기 조회·역사적 표준시/서머타임·진태양시·음력↔양력(표 디코딩, 런타임 천문 계산 없음)
  sajuDaily.ts          일진 점수·별점·태그(오늘의 운세, 택일의 기반)
  sajuImages.ts         이미지 id·경로(일간 10·띠 12)
  saju.ts               천간·지지·오행·60갑자·사주 산출·십신·지장간·십이운성·공망·신살·합충형파해·오행 분포·신강약·보완 오행·대운·세운·일진
  sajuText.ts           정적 텍스트 — 일간 10종 캐릭터·성격, 십신·신살·십이운성 설명, 오행 색·방향·숫자·계절·맛
  sajuMatch.ts          궁합 점수(0~100)·항목별 근거
  sajuDatePick.ts       택일 점수(날짜 범위 → 일별 점수·상위 3)
  sajuFood.ts           오행 음식 — 타로 메뉴 카탈로그(TAROT_MENU_ITEMS) 위에 오행 친화도 표를 얹어 후보 3개
  sajuFlow.ts           입력·연출 흐름 상태 머신(순수 리듀서, 테스트 대상)
packages/api-contract/src/schemas/saju.ts      입력·원국·풀이·궁합·택일·음식·오늘·공유·프로필·기록 zod
packages/api-contract/src/routes.ts            Routes.Saju
packages/shared/src/stores/sajuProfileStore.ts 게스트 로컬 프로필(나 + 상대, 기기 보관)
packages/shared/src/stores/sajuHistoryStore.ts 게스트 로컬 기록(최근 30건)
packages/shared/src/hooks/useSaju*.ts          리딩·섹션 폴링·오늘·궁합·택일·음식·프로필·기록
apps/friendly/src/modules/saju/
  saju.route.ts         공개 리딩·섹션 폴링·오늘·궁합·택일·음식·공유·프로필·기록
  saju.service.ts       검증 → 원국 계산 → 캐시 → 한도 → 섹션 병렬 LLM → 정적 폴백 → (회원 저장)
  saju-jobs.ts          섹션 병렬 작업 레지스트리(메모리, TTL 5분) — 도착 순 리빌용 long-poll
  saju.prompts.ts       시스템 프롬프트·섹션별 사용자 프롬프트·JSON 스키마·버전 상수
  saju-static.ts        정적 풀이 조립(sajuText × 원국 사실)
  saju-share-card.ts    satori 공유 이미지(OG 1200×630, 세로 1080×1920)
apps/friendly/scripts/
  build-saju-tables.ts  KASI 음양력·24절기 → utils 표 파일 생성
  build-saju-images.ts  raw PNG → webp(512/1024) → apps/web/public/saju-c/
  probe-saju-reading.ts 모델 비교(한국어 품질·JSON 준수·지연)
apps/web/src/routes/SajuPage.tsx               /saju-c (lazy), /saju-c/s/:token, /me/saju-c
apps/web/src/components/saju/
  SajuStage.tsx         R3F Canvas + 품질 등급 + Lite 판정(타로 tarotQuality 재사용)
  stage/ Disc.tsx(천문도 원판 3겹) · Seal.tsx(인장 8개) · InkRipple.tsx · ElementOrbs.tsx(오행 구슬) · LuckRiver.tsx(대운 강물) · MatchDiscs.tsx(궁합 두 원판)
  SajuForm.tsx          생년월일·시·성별·양음력·윤달 입력(DOM)
  SajuChart.tsx         원국 표(2D, 공유 페이지·기록·Lite 공용)
  SajuReadingPanel.tsx  탭: 원국 / 성격 / 오행 / 흐름 / 올해·오늘 / 조언 — 섹션 도착 순 타자 효과
  SajuDatePick.tsx      택일 달력 히트맵 + 상위 3
  SajuMatch.tsx         궁합 점수·근거
  SajuFood.tsx          오행 음식 후보(타로 TarotMenuBox 와 같은 카드 형태)
  SajuLite.tsx          최소 모드
docs/saju-image-prompts.md                     스타일 바이블 + 일간 10 + 띠 12 프롬프트
```

### 계약·공유 패키지

- 사주 계산은 **클라이언트와 서버가 같은 `@repo/utils` 코드**로 한다. 웹은 입력 즉시 원국을 계산해 연출을 시작하고(서버 응답 대기 없음), 서버는 입력을 받아 **다시 계산**해 그 결과를 프롬프트·저장에 쓴다(클라이언트가 보낸 원국은 믿지 않음).
- 입력 = `{ calendar:'solar'|'lunar', year, month, day, leapMonth, hour|null, minute|null, gender:'M'|'F', options:{ solarTimeCorrection:true, lateRatHour:false } }`. 서버 응답의 `chart` 는 계산 결과 스냅샷(글자·오행·십신·지장간·십이운성·신살·공망·관계·오행 분포·신강약·보완 오행·대운 10개·올해 세운·시작 나이).
- 흐름 상태 머신 `sajuFlow.ts`: `setup → casting(원판 회전) → stamping(인장 8개 순차) → reading`. 결과 상태(`idle/pending/partial/ready/failed`)는 phase 와 독립이고 섹션별 도착을 담는다.

### Prisma (초안 — 1차에 확정)

```prisma
// 회원 사주 프로필 — 나·가족·친구 여러 명. 오늘의 운세·궁합 상대 선택에 쓴다.
model SajuProfile {
  id            String   @id @default(cuid())
  userId        String
  label         String                          // '나', '엄마' … 20자
  calendar      String                          // 'solar' | 'lunar'
  birthYear     Int
  birthMonth    Int
  birthDay      Int
  leapMonth     Boolean  @default(false)
  birthHour     Int?                            // null = 시간 모름
  birthMinute   Int?
  gender        String                          // 'M' | 'F'
  optionsJson   String                          // 보정 옵션
  isPrimary     Boolean  @default(false)        // 한 명만 true — "내 사주"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, isPrimary])
  @@map("saju_profiles")
}

// 사주 결과 — 회원 자동 저장, 게스트는 공유 시에만. inputJson 은 생년월일시(개인정보) → 로그 금지.
model SajuReading {
  id            String   @id @default(cuid())
  userId        String?
  guestKey      String?
  shareToken    String?  @unique
  kind          String                          // 'full' | 'daily' | 'match' | 'date-pick' | 'food'
  inputJson     String                          // 입력(궁합은 두 사람)
  chartJson     String                          // 계산 스냅샷
  resultJson    String                          // 풀이(섹션·점수·후보)
  source        String                          // 'llm' | 'static' | 'mixed'(섹션 일부 정적)
  model         String?
  promptVersion Int      @default(1)
  dayKey        String                          // KST yyyy-mm-dd
  dailyLockKey  String?  @unique                // 'userId:profileId:yyyy-mm-dd' — 오늘의 운세 하루 1회
  shareBirth    Boolean  @default(false)        // 공유 페이지에 생년월일 노출(기본 숨김 — 연도·띠만)
  createdAt     DateTime @default(now())
  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt])
  @@map("saju_readings")
}
```

- 한도는 기존 `UsageQuotaSetting/Counter` 에 feature **`saju-reading`** 행 추가(계약 enum 확장). 전체 풀이 1건 = 1 소비(섹션 4개여도 1), 오늘·궁합·택일·음식도 각 1 소비. 기본값 타로와 동일(게스트 50/IP 500/전역 5000/게스트 컷 90%).

### 라우트 (`Routes.Saju` — 전부 `/api/v1` 하위)

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| POST | `/saju-c/readings` | optional | 입력 → 원국 + 섹션 4개. 캐시 히트면 전부 `ready`, 아니면 정적 본문 + `jobId` 를 즉시 반환하고 섹션은 백그라운드 병렬 LLM. 회원은 저장 후 id |
| GET | `/saju-c/readings/jobs/:jobId?after=<n>&wait=20000` | 없음 | 도착한 섹션 long-poll. 서버 재시작으로 job 이 없으면 `410` → 클라이언트는 정적 본문 유지 + "AI 풀이 다시 시도" |
| POST | `/saju-c/daily` | optional | 입력 → 오늘의 운세(별점·한 줄·행운 색/방향/음식). 회원+프로필은 하루 1회 잠금 |
| POST | `/saju-c/match` | optional | 두 입력 → 궁합 점수·근거·풀이 |
| POST | `/saju-c/date-pick` | optional | 입력 + 용도 + 기간(≤ 60일) → 일별 점수 + 상위 3 이유 |
| POST | `/saju-c/food` | optional | 입력 (+ 오늘 기준 여부) → 오행 음식 후보 3 + 이유 |
| POST | `/saju-c/shares` · GET `/saju-c/shares/:token` · `/saju-c/s/:token/image.png` | | 타로와 동일 패턴(게스트는 입력 재전송, 서버가 본문 확보) |
| GET/POST/PUT/DELETE | `/saju-c/me/profiles[/:id]` | 회원 | 프로필 CRUD(최대 10명, primary 1) |
| GET/DELETE | `/saju-c/me/readings[/:id]` | 회원 | 기록 목록(커서)·상세·삭제 |

응답 `SajuReadingResult`(full):

```ts
{
  readingId: string | null, jobId: string | null,
  chart: SajuChart,                                  // 계산 스냅샷(아래 §엔진)
  sections: {                                        // 각 { status:'ready'|'pending'|'static', text, ... }
    personality: { headline, body, strengths[3], cautions[2] },
    year:        { body, monthsHighlight[{month, note}] },
    cycle:       { body, current: {ganzhi, fromAge, toAge}, next },
    advice:      { body, keyword, lucky: {element, colors[], directions[], numbers[], foods[]} },
  },
  source: 'llm'|'static'|'mixed', model, createdAt, quota: { remainingToday }
}
```

## 엔진 설계 (`@repo/utils`) — 0차, 가장 공들일 곳

### 시각 → 8글자

1. **표준시 복원**: 입력 KST 벽시계 → UTC. 역사적 표준시 표(1908-04-01~1911 UTC+8:30 / 1912~1954-03-20 UTC+9 / 1954-03-21~1961-08-09 UTC+8:30 / 이후 UTC+9)와 서머타임 표(1948~1951, 1955~1960, 1987~1988 — 각 연도 시작·종료 시각)를 적용.
2. **진태양시**: UTC + 8h30m(동경 127.5°) = 서울 평균태양시. 옵션 끄면 벽시계 그대로.
3. **년주**: 출생 순간이 그 해 **입춘 시각** 이전이면 전년. 천간 `(Y−4) mod 10`, 지지 `(Y−4) mod 12`.
4. **월주**: 12절 시각으로 월지 결정(입춘→인, 경칩→묘 … 소한→축). 월간은 오호둔 — 갑기년 병인월 시작: `((년간 mod 5)×2 + 2 + 인월기준 index) mod 10`.
5. **일주**: 율리우스일 기준 `(JDN − 2415021 + 10) mod 60`(1900-01-01 = 갑술, 검증: 2000-01-01 = 무오). 진태양시 23:00 이후는 다음날(기본) / 야자시 옵션.
6. **시주**: 시지 `floor(((h+1) mod 24) / 2)`(자 23~01 …), 시간은 오서둔 — 갑기일 갑자시 시작: `((일간 mod 5)×2 + 시지) mod 10`.

### 절기·음력

- 절기·합삭은 **빌드 시** `build-saju-tables.ts` 가 astronomy-engine(MIT, friendly devDependency)으로 계산해 표(`sajuAstroTable.ts`)로 내장한다 — 런타임 천문 계산 없음. KASI 공개값과 대조하면 절기 ±1분(2024~2026 전수), 합삭 날짜 일치. `--source=kasi` 로 data.go.kr 공식값으로 같은 표를 다시 만들 수 있다(사용자 API 신청 뒤). 테스트는 KASI 공개값(2024 입춘 02-04 17:27, 2026 입춘 02-04 05:02 등 13건)과 대조.
- **절입 경계 ±2시간 이내** 출생은 `chart.warnings` 에 "절기 경계라 월주가 달라질 수 있어요" 를 넣어 UI 가 표시한다.
- 음력 월 표는 같은 스크립트가 합삭(KST 날짜) + 중기로 **무중치윤법**을 적용해 만든다(동지가 든 달이 11월, 두 동지 사이 13달이면 중기 없는 첫 달이 윤달). 설날 1990~2050 61건·윤달 1900~2050 전부(2033 윤11월 포함) 골든셋과 일치.

### 파생 항목

| 항목 | 규칙 |
|---|---|
| 십신 | 일간 오행 vs 대상 오행(같음/내가 생/내가 극/나를 극/나를 생) × 음양 같음/다름 → 비견·겁재·식신·상관·편재·정재·편관·정관·편인·정인. 지지는 정기(본기) 천간 기준 |
| 지장간 | 자(임·계) 축(계·신·기) 인(무·병·갑) 묘(갑·을) 진(을·계·무) 사(무·경·병) 오(병·기·정) 미(정·을·기) 신(무·임·경) 유(경·신) 술(신·정·무) 해(무·갑·임) |
| 십이운성 | 양간 순행 — 갑:해, 병·무:인, 경:사, 임:신 에서 장생 / 음간 역행 — 을:오, 정·기:유, 신:자, 계:묘 |
| 공망 | 일주 60갑자의 순(旬) → 빈 지지 2개 |
| 신살(v1) | 천을귀인(갑무경: 축미 / 을기: 자신 / 병정: 해유 / 신: 인오 / 임계: 사묘), 문창, 양인, 도화·역마·화개(년지·일지 삼합 기준), 괴강(경진·경술·임진·무술), 백호(갑진·을미·병술·정축·무진·임술·계축), 원진 |
| 관계 | 천간합 5·천간충 4, 육합 6, 삼합 4, 방합 4, 충 6, 형(인사신·축술미·자묘·자형), 파 6, 해 6, 원진 6 — 4기둥 사이 전부 + (운세) 세운·일진 vs 원국 |
| 오행 분포 | 천간 1.0, 지지 정기 1.0·중기 0.3·여기 0.2 → 5행 점수·% ·과다(≥ 30%)·부족(0). 시간 모름이면 6글자 기준 |
| 신강·신약 | 득령(월지 정기가 인성·비겁) + 득지(일지) + 득세(나머지 글자 중 인성·비겁 수) 가중합 → `strong / balanced / weak` |
| 보완 오행 | 억부: 신강 → 식상·재·관 중 원국에 있는 오행, 신약 → 인성·비겁. 조후: 겨울(해자축) 생은 화, 여름(사오미) 생은 수 를 우선. 결과 `lucky.element` 1개 + 보조 1개. UI 는 "용신" 대신 **"보완하면 좋은 기운"** 으로 부른다 |
| 대운 | 방향 = (년간 양 & 남) 또는 (년간 음 & 여) → 순행, 아니면 역행. 시작 = 출생~다음(순행)/이전(역행) 절 시각까지 일수 ÷ 3 (1일 = 4개월, 1시간 = 5일) → "N세 M개월". 월주부터 60갑자 10개, 각 10년. 현재 대운·다음 대운 표시 |
| 세운·월운·일진 | 연도·월(절기 기준)·일 60갑자. 올해 세운 십신 + 원국과의 합충. 일진 = 오늘의 운세 |
| 오늘의 운세 | 일진 천간의 십신(정재·정관·정인·식신·비견 +, 편관·상관·겁재·편인 −), 일진 지지 vs 일지·년지(합 +, 충·형·해·원진 −), 일진 지지의 십이운성(장생·관대·건록·제왕 +, 사·묘·절 −), 천을귀인·공망일 → 1~5 별점 + 행운 색/방향/숫자/음식(보완 오행) |

### 궁합 (`sajuMatch.ts`)

100점 = 일간 관계 25(천간합 25 / 상생 18 / 비화 14 / 상극 8) + 일지 관계 25(육합·삼합 25 / 방합 18 / 무관계 12 / 충·형·해·원진 3) + 년지(띠) 15 + 오행 보완 20(상대의 과다가 내 부족을 채우는 정도) + 십신 15(서로가 서로에게 정재·정관·정인이면 가점). 항목별 점수·근거 문장을 `breakdown[]` 로 내려 LLM 은 그 위에 서사만 쓴다. 등급 5단계(천생연분/잘 맞음/보통/노력 필요/조심).

### 택일 (`sajuDatePick.ts`)

기간(오늘~+60일 이내, 최대 60일) × 용도(`move` 이사 / `contract` 계약·개업 / `interview` 면접·시험 / `trip` 여행 / `date` 데이트·만남 / `general`). 일별 점수 = 오늘의 운세 규칙 + 용도 가중(이사: 손 없는 날(음력 9·10·19·20·29·30) +, 계약: 정재·정관 +, 면접: 정관·정인·문창 +, 여행: 역마 +, 데이트: 도화·육합 +) + 요일 가중 없음. 결과 `days[{date, score, tags[]}]` 전부(히트맵) + `top[3]`(이유는 LLM, 없으면 태그 문장).

### 오행 음식 (`sajuFood.ts`)

`TAROT_MENU_ITEMS` 100종을 그대로 후보 풀로 쓰고(이름·계통·조리형태·kcal 파이프라인 재사용), 별도 표 `SAJU_FOOD_WUXING: Record<menuId, Partial<Record<Wuxing, 1|2>>>` 로 오행 친화도를 얹는다(전통 오행 음식: 목=신맛·푸른 채소, 화=쓴맛·구이·붉은 음식, 토=단맛·곡물·노란 음식, 금=매운맛·흰 음식·닭, 수=짠맛·검은 음식·해조류·국물). 점수 = 보완 오행 ×3 + 보조 ×1.5 − 과다 오행 ×1 (+ "오늘 기준" 이면 일진 오행 ×1) + 시드 난수(동점). 상위 3은 조리형태·계통이 겹치지 않게(타로 메뉴와 같은 규칙). LLM 은 이유만.

## LLM 설계

### purpose·모델

- 새 purpose **`saju`** — `LlmProviderPurpose` enum, `OLLAMA_SAJU_MODEL`, `buildLlmProviderEnv.defaultModels`.
- 후보: **`deepseek-v4-pro`**, **`qwen3.5:397b-cloud`**, **kimi 계열**(계정에 노출된 이름을 `listModels` 로 확인 — `kimi-k2.5`/`kimi-k2-thinking` 등), 비교군 `gpt-oss:120b`. 중국어권 학습 모델이 명리 용어(십신·신살)를 더 잘 안다는 기대가 있어 1차에서 `probe:saju-reading` 으로 10개 샘플 사주 × 섹션 4 를 돌려 한국어 문장 품질·명리 사실 오염(계산과 다른 십신·오행을 말하는지)·JSON 준수·p50 지연을 비교하고 `.env.example` 에 실측 주석으로 남긴다. thinking 은 `thinkOptionForModel` 규칙(낮게).

### 섹션 병렬 + 도착 순 리빌

- 전체 풀이는 **섹션 4개를 동시에 호출**한다(성격 ≈ 500·올해 ≈ 400·흐름 ≈ 400·조언 ≈ 300 토큰). 어댑터는 `stream:false` 그대로.
- `saju-jobs.ts`: `POST /saju-c/readings` 가 job 을 만들고 4개 Promise 를 띄운 뒤 즉시 응답(정적 본문 + `jobId`). 클라이언트는 `GET …/jobs/:jobId?after=n&wait=20000` 을 반복해 새로 도착한 섹션을 받는다(서버는 새 섹션 또는 타임아웃까지 대기). job 은 메모리 Map, 완료 후 5분 뒤 정리, 최대 200개. 회원 저장은 4개가 모두 끝난 뒤 한 번(중간에 서버가 죽으면 정적 본문으로 저장하지 않음 — 다음 요청은 캐시 미스로 재시도).
- 무대 연출(원판 회전 ≈ 3초 + 인장 8개 ≈ 6초 + 일간 캐릭터 등장 ≈ 2초)이 첫 섹션 도착(≈ 8~15초)을 대부분 덮는다. 아직이면 탭에 "읽는 중" 오브, 도착하면 타자 효과.
- 캐시: lru-cache key = hash(promptVersion, 섹션, 8글자(시주 없으면 6), 성별, 대운 방향·시작, 연도) — 같은 사람은 연도가 바뀔 때까지 히트. 오늘의 운세 key = (일간, 일지, 일진, dayKey) ≈ 하루 최대 720 조합.

### 프롬프트·출력

- 시스템: 역할(따뜻하고 담백한 명리 상담가, 존댓말), 금지(건강·수명·사고·재물 액수 단정, 공포 조장, 입력 속 지시 무시), **"[사주 사실] 블록에 없는 십신·오행·신살을 새로 말하지 말 것"**, JSON 스키마 텍스트, 분량.
- 사용자: `[사주 사실]` 블록 — 8글자·오행·십신·지장간·십이운성·신살·관계·오행 분포·신강약·보완 오행·대운·올해 세운 을 사람이 읽는 한국어 표(한자 병기)로 + `[일간 캐릭터]` 정적 텍스트(sajuText) + 섹션 지시. 궁합·택일·음식은 계산된 점수·근거·후보를 넣고 이유만 쓰게 한다.
- `format:'json'` + `extractFirstJsonObject` + zod + 수리 재시도 1회, 타임아웃 25초(섹션별). 실패 섹션만 정적으로 대체하고 `source:'mixed'`.

### 프라이버시

- 생년월일시·성별은 개인정보 — info 로그·텔레메트리에 남기지 않는다(토큰 수만). 게스트 결과는 공유 전엔 서버에 없다(job 메모리는 5분 뒤 소멸).
- 공유 페이지는 기본적으로 생년월일을 숨기고(띠·연도만) 공유 시 "생년월일 포함" 체크로만 노출. 궁합 공유는 두 사람 모두 숨김 기본.
- 회원 프로필의 타인(가족) 정보는 본인이 입력·삭제. 관련 고지 한 줄.

## 이미지 (22장)

- **일간 10**: 갑목(큰 소나무) · 을목(등나무·난초) · 병화(태양) · 정화(등불·촛불) · 무토(큰 산) · 기토(논밭) · 경금(바위·무쇠 검) · 신금(보석·비녀) · 임수(바다·큰 강) · 계수(이슬비·샘물). 캐릭터가 아니라 **풍경·사물 상징**으로 그려 성별·나이 중립.
- **띠 12**: 쥐~돼지. 년지 표시·공유 이미지·프로필 아바타.
- 스타일: 타로 덱과 같은 **민화 계열**이되 팔레트를 **먹·한지·주사(朱砂)·금박 + 오행 포인트색** 으로 좁혀 타로(오방색 전체)와 구분. 정사각(1:1) — 원판·아바타·카드에 공통으로 쓰기 위해. 세부는 `docs/saju-image-prompts.md`.
- 빌드: `build-saju-images.ts` 가 1:1 중앙 크롭 → webp 512/1024 → `apps/web/public/saju-c/{stems,branches}/`. 미생성은 글자 placeholder(한자 1자 + 오행색).

## 웹 3D 설계 — 타로와 다른 무대

- 스택은 타로와 같다(three + R3F + drei + postprocessing, `/saju-c` lazy 청크, `three` 벤더 청크 공유). **컴포넌트는 재사용하지 않고** 품질 등급·Lite 판정·타자 효과·공유 시트 패턴만 재사용.
- **컨셉: 천상열차분야지도(天象列次分野之圖)** — 흑요석 돌판에 금·주사로 선각한 천문도. 카메라는 위에서 45° 내려다봄(타로는 테이블 정면). 팔레트 먹빛 `#0b0b0f` · 한지 `#efe6d3` · 주사 `#b8322a` · 금 `#d9b65b` · 오행색(목 청록 `#3f9b7a`, 화 주홍 `#d9482b`, 토 황토 `#c9973a`, 금 백은 `#dcdcd2`, 수 흑청 `#2f4d7a`). 타이틀은 Noto Serif KR(한자 서브셋 추가: 천간 10·지지 12·오행 5·사주팔자 등).
- **장면**
  - 입장: 원판 3겹(바깥 지지 12자·중간 천간 10자·안쪽 오행 5구슬)이 느리게 자전, 별 선각이 은은히 깜빡임, 먹 안개 대신 **별가루 파티클**, 마우스 시차.
  - casting(입력 확정): 세 겹이 각각 빠르게 돌다 년→월→일→시 순서로 **다이얼처럼 멈추며** 해당 글자에 정렬, 멈출 때마다 금선 플래시.
  - stamping: 원판 위 4기둥 자리에 **인장 8개가 위에서 내려찍힘**(주사 인주 + 금박 테두리) — 찍힐 때 먹 번짐 리플(셰이더) + 오행색 파티클 버스트. 일간 인장은 한 번 더 발광하며 **일간 캐릭터 이미지**가 원판 중앙에 떠오른다.
  - reading: DOM 패널(데스크톱 오른쪽 / 세로 폰 바닥 시트). "오행" 탭이면 원판 안쪽 5구슬이 분포만큼 커지고 상생 빛줄·상극 점선이 그어진다. "흐름" 탭이면 원판이 기울며 **대운 강물**이 흘러 현재 구간이 밝다.
  - 궁합: 원판 두 개가 겹쳐지며 일간·일지·년지 사이에 합(금선)·충(주사 점선)이 그어진다. 택일: DOM 달력 히트맵(별 밝기). 음식: 오행 구슬에서 메뉴 카드 3장이 튀어나온다.
- **품질 등급**: 타로 `tarotQuality` 를 공용으로 옮겨(`components/stage-quality.ts`) 재사용. 모바일 단말은 bloom 끄고 파티클 1/3. WebGL2 없음·reduced-motion·`?lite=1` 은 `SajuLite`(2D 원국 표 + 순차 페이드).
- **임베드 모드** `?embed=1`: 타로와 같은 `embed.ts`·브리지. 앱은 `app/saju-c/index.tsx` WebView.
- 효과음: 인장 찍힘·다이얼 정지 2종, 기본 꺼짐(타로 v2 후보와 함께).

## 공유

- 타로와 동일 패턴 — 게스트는 입력 재전송(서버가 캐시/LLM/정적으로 본문 확보), 회원은 readingId 로 토큰. `/saju-c/s/:token` 은 2D 원국 표 + 일간 캐릭터 + 키워드 + 성격 요약 + "나도 사주 보기". 궁합 공유는 점수·등급·근거.
- OG 1200×630: 인장 8개 + 일간 이미지 + 키워드. 세로 1080×1920 스토리. 생년월일은 `shareBirth` 일 때만.

## 어드민

- `/admin/settings/quotas` 에 `saju-reading` 행 자동 노출(enum 확장만). AI 키 화면에 `saju` purpose 자동 노출.
- `probe:saju-reading` 결과는 `.env.example` 주석과 이 문서 진행 기록에.

## 차수별 로드맵

| 차수 | 범위 | 산출물 |
|---|---|---|
| **0차** ✅ | utils 엔진 — 달력(절기·표준시·서머타임·진태양시·음력 표)·사주 산출·파생 항목·대운·세운·일진·오늘의 운세 점수·궁합·택일·오행 음식·흐름 리듀서 + 정적 텍스트 + 테스트(KASI 대조 골든셋) / 프롬프트북 / 표·이미지 빌드 스크립트 | `packages/utils/src/saju*.ts`, `docs/saju-image-prompts.md`, `apps/friendly/scripts/build-saju-*.ts` |
| **1차** ✅ | api-contract 스키마·Routes·`saju-reading` 한도·`saju` purpose / friendly `saju` 모듈(service·jobs·prompts·static·route) + Prisma(SajuProfile·SajuReading) / shared 스토어·API·훅 / `probe:saju-reading` | 마이그레이션 1건, 테스트 |
| **2차** ✅ | 웹 `/saju-c` — 입력 폼·천문도 무대(원판·인장·먹 번짐·일간 캐릭터·오행 구슬·대운 강물)·풀이 패널(섹션 도착 순)·Lite·임베드·사이드바·홈 카드·로컬 기록 | `apps/web/src/components/saju/**`, `routes/SajuPage.tsx` |
| **3차** ✅ | 오늘의 운세(홈 카드·하루 1회) + 오행 음식 + 택일(달력 히트맵) + 궁합(두 원판 연출) | 라우트 4 + 웹 화면 4 |
| **4차** ✅ | 공유(토큰·페이지·OG·세로) + 회원 프로필(여러 명)·기록 `/me/saju-c` + 앱 WebView 임베드 + nginx 문서 | |
| **v2 후보** | SSE 스트리밍(타로와 함께) / 상단바 오늘의 운세 칩 / 해외 출생(경도·시간대) / 월운 12개월 캘린더 / 신살 확장 / 근처 맛집(타로 v3b 와 공유) / 효과음 | |

0차와 사용자 이미지 생성·KASI 신청은 병렬. 2차는 이미지 없이 글자 placeholder 로 진행 가능.

## 리스크·열린 질문

- **엔진 정확도**: 절기 경계·서머타임·진태양시가 틀리면 월주·시주가 통째로 틀린다. 골든셋(유명 만세력 앱과 대조한 20건 이상)으로 검증하고 경계 ±2시간은 경고를 내보낸다. KASI 표가 들어오면 계산값을 표로 대체.
- **명리 사실 오염**: LLM 이 계산과 다른 십신·오행을 말할 수 있다. 프롬프트 금지 + 프로브에서 "사실 오염률" 을 측정해 모델 선택 기준에 넣는다.
- **개인정보**: 생년월일시는 로그 금지·게스트 무저장·공유 기본 숨김. 궁합의 상대 정보는 게스트 기기 로컬에만.
- **비용**: 전체 풀이 1건이 LLM 4호출. 전역 예산은 호출 수가 아니라 풀이 건수로 세므로 어드민 값을 타로보다 낮게 시작(전역 2000)할지는 운영에서 조정.
- 열린 질문: 회원 프로필 최대 인원(10 가정), 택일 최대 기간(60일 가정), 궁합에서 상대 성별 필요 여부(대운 방향에만 쓰므로 필수로 가정).

## 진행 기록

- 2026-09-06: **경로 saju → saju-c, 명칭 "사주(C)".** 다른 사주 구현과 나란히 두기 위해 "saju" 가 들어간 URL 전부를 saju-c 로: 웹 /saju-c·/saju-c/s/:token·/me/saju-c(·/:id), friendly API /api/v1/saju-c/*, 공유 OG·이미지 /saju-c/s/:token(/image.png), 정적 이미지 /saju-c/images/(public 디렉터리 git mv, `SAJU_IMAGE_BASE_PATH`·`build:saju-images` 출력), Vite 프록시, nginx 블록 2개(deploy-friendly.md), 앱 화면 app/saju-c + WebView URL. 명칭은 메뉴·홈 카드·앱 헤더·내 사주 제목·공유 제목·OG 제목만 "사주(C)"(본문 문구·모듈·파일·DB·한도 feature 이름은 그대로). ⚠️ 운영 nginx 블록 이름 변경 필요.
- 2026-09-06: **풀이 패널 폭 확대(데스크톱 탭 가로 스크롤 제거).** 3235daa 에서 궁합 탭 본문 넘침은 잡았지만 탭 nav 10개가 27rem(430px)에 안 들어가 `overflow-x-auto` 로 가로 스크롤이 남았음. 패널을 lg 32rem·xl 34rem 으로 넓히고 nav 를 `flex-wrap`(스크롤 대신 줄바꿈, 탭 px 2.5), 무대 시선 focusX 1.4→1.7. Playwright 실측 nav scrollWidth=clientWidth: 1024/1100 → 510(한 줄), 1400 → 542(한 줄), 390 바닥 시트 388(줄바꿈 2줄). 1024 에서 왼쪽 원국 카드(34~478)와 패널(496~) 안 겹침. 웹 테스트 7 green. 미커밋.
- 2026-09-06: **이미지 22/22 완성.** 남은 띠 6장(말·양·원숭이·닭·개·돼지) 반영 — placeholder 없음(manifest.missing 빈 배열). 산출 5.3MB.
- 2026-09-06: **이미지 16/22 반영.** 제미나이 원본(일간 10 + 띠 6: 쥐·소·호랑이·토끼·용·뱀)을 `build:saju-images` 로 webp 512/1024 변환·커밋. 민화 + 흑요석 천문도 + 금선 톤이 계획대로 나옴(한지색 여백 프레임 포함). 남은 띠 6장(말·양·원숭이·닭·개·돼지)은 placeholder 유지 — 도착하면 같은 명령으로 덮어쓴다.
- 2026-09-06: **회원 프로필 저장 UI + 오늘의 운세 하루 1회 잠금.** 입력 폼이 회원이면 서버 프로필 칩(★ primary, "계정" 배지)·"이 계정에 저장"(POST /saju/me/profiles), 게스트면 기기 로컬 칩·"이 기기에 저장". 저장된 칩을 골라 입력이 그대로면 저장 체크를 숨겨 중복 생성 방지(입력을 바꾸면 새 사람). 오늘의 운세는 회원이면 `dailyLockKey = userId:<8글자+성별 해시>:날짜` 로 SajuReading(kind daily) 행에 저장해 캐시·재시작과 무관하게 하루 1회만 LLM(다른 날짜 조회는 잠그지 않음). 기록 목록·상세는 kind full 만. 테스트 friendly 21·웹 7.
- 2026-09-06: **커밋·프로브.** 커밋 4건 — 624ead4(타로 앱 임베드, 이전 작업 분리) · db1415f(0차 utils) · f8e5dd0(1·4차 API) · 0a7f637(웹/앱 UI) · d31843b(기본 모델 kimi-k3). `probe:saju-reading` 3사주×4섹션: 4모델 모두 JSON 12/12·수리 0, p50 gpt-oss:120b 2.0s / deepseek-v4-pro 3.5s / qwen3.5:397b 5.5s / kimi-k3 5.6s. 문장은 kimi-k3 가 계절·오행 맥락을 가장 자연스럽게 엮고, deepseek 는 간결·빠름, gpt-oss 는 나열식. **기본 모델 kimi-k3**(env·.env.example·어드민 placeholder), 빠른 대안 deepseek-v4-pro. 사실 오염 근사치(5/12)는 프롬프트의 "없는 십신" 줄을 인용하는 것까지 세는 거친 지표라 판단 기준에서 제외. 계정 노출 모델 id: kimi-k3·kimi-k2.6·deepseek-v4-pro:0813·qwen3.5:397b·glm-5.x·gemma4:31b·gpt-oss:120b.
- 2026-09-06: **실서버 실측(friendly 3000 + Vite 5173, Playwright 헤드리스 크롬 + SwiftShader WebGL).** 잡은 버그 3건: ① `Seal` 이 `return null` 뒤에 `useMemo` 를 둬 인장 단계에서 훅 순서 오류 → 3D 무대 전체가 흰 화면(훅을 조기 반환 앞으로, 무대에 에러 바운더리 추가 → 실패 시 Lite 로 폴백) ② 공유 이미지의 한자가 □ — satori 폰트(IBM Plex Sans KR)에 한자 없음 → `build:saju-glyphs`(개발 머신의 Noto Serif CJK KR 로 천간·지지·오행 27자 × 3색 PNG 를 `apps/friendly/assets/saju-glyphs` 에 생성·커밋)로 인장은 <img>, 본문 한자는 satori graphemeImages ③ Vite 프록시에 `/saju/s/:token/image.png` 누락 → 공유 시트 미리보기 깨짐. 그 외: 궁합 상대 기본값이 내 사주와 같던 것, 궁합 문구 조사(수을→수를), 세로 폰 카메라 거리, THREE PCFSoftShadowMap 경고(percentage). 실측 통과: 설정→casting(고리 다이얼)→stamping(인장 8개·리플)→reading(일간 카드·패널), 탭 원국/성격/오행(구슬)/흐름/올해/조언/오늘/음식/택일/궁합, 공유 링크·OG(1200×630)·세로(1080×1920) 이미지, 공유 페이지, 모바일 390px 바닥 시트. 콘솔 오류 0. 크롬 확장은 이 PC 가 아닌 다른 브라우저에 붙어 있어 못 씀 — Playwright 로 대체.
- 2026-09-06: **4차 완료.** friendly `saju-records.service.ts`(공유: 게스트는 입력만 보내고 서버가 **캐시된 섹션 또는 정적**으로 행 생성 — LLM·한도 소비 없음, 회원은 readingId 에 토큰; 생년월일은 shareBirth 일 때만, 아니면 solar/lunar/instant 마스킹 / 기록 목록·상세·삭제 / 프로필 CRUD 최대 10·primary 승계) · `saju-share-card.ts`(satori OG 1200×630·story 1080×1920 — 일간 이미지 + 인장 8개 + 별칭 + 성격 요약) · `saju-preview.ts`(/saju/s/:token OG 주입 + image.png, app.ts 등록) · 라우트 shares/shared/profiles/me/readings. shared `sajuApi`·훅(공유·프로필·기록·infinite). 웹 `SajuReadingView`(2D 공용)·`SajuShareSheet`(생년월일 포함 체크·링크·OS 공유·세로 이미지)·`SajuSharedPage`(/saju/s/:token)·`routes/saju/MySajuPage`(프로필 ★지정·삭제 + 기록 목록)·`MySajuReadingPage`(공유·삭제) + 패널 공유 버튼 + `?tool=` 딥링크 탭. 앱 `app/saju/index.tsx`(타로 WebView 판 복제, `?tool=`)·홈 `SajuEntryCard`. nginx `^~ /saju/s/`·`/saju/images/` 블록(deploy-friendly.md). 테스트 friendly saju 20·웹 7 green, 앱 typecheck green. 실기기·크롬 실측 미완. 미커밋.
- 2026-09-06: **3차 완료.** shared `useSajuDailyQuery/FoodQuery/DatePickQuery/MatchQuery`(탭을 열면 자동 호출, 같은 입력은 캐시). 웹 `components/saju/SajuTools.tsx` — 오늘의 운세(별점·표식·본문·조언·행운 요소), 오행 음식(오늘 반영 토글·추천/대안 3·kcal·오행 점), 택일(용도 6·30/60일·상위 3 이유·달력 히트맵), 궁합(상대 입력 + 로컬 프로필 칩·점수 링·항목 막대·요약/강점/주의/조언). 풀이 패널 탭에 오늘/음식/택일/궁합 4개 추가(주사색 강조). 3D 궁합 두 원판·대운 강물 연출은 v2 후보로 미룸. 웹 테스트 5건 green. 미커밋.
- 2026-09-06: **2차 완료(크롬 실측 미완).** 웹 `components/saju/`: `sajuTheme.ts`(먹·한지·주사·금 팔레트) · `stage/sajuLayout.ts`(원판·고리 3겹·인장 8자리·타이밍) · `stage/sajuTextures.ts`(캔버스 한자 글리프 — 인장 면·고리 글자·리플·일간 이미지 로더) · `stage/SajuScene.tsx`(흑요석 원판 + 별자리 선각 + 고리 다이얼 회전·정지 → 인장 낙하·먹 번짐 리플·오행색 파티클 → 일간 캐릭터 카드 → 오행 구슬(상생 금선·상극 점선), 톱다운 카메라·시차·bloom) · `SajuStage.tsx`(lazy Canvas) · `SajuForm.tsx`(양/음력·윤달·시 모름·성별·고급 옵션·기기 프로필 칩/저장) · `SajuChartTable.tsx`(원국 표·오행 막대·신살·관계·경고) · `SajuReadingPanel.tsx`(탭 원국/성격/오행/흐름/올해/조언, 섹션 도착 순·타자 효과·gone/failed 재시도) · `SajuLite.tsx`. `routes/SajuPage.tsx`(리듀서 + createReading + useSajuJob 병합, Lite 는 연출 건너뜀, HUD 건너뛰기). App 라우트·사이드바·상단바·홈 카드. utils `aiModel` purpose 에 saju(추천 = 가장 큰 모델). 테스트 웹 4건(Lite: 입력→원국 경오 신사 경진 계미→요청 게스트 키→섹션 탭·프로필 저장 / 범위 밖 연도 / 요청 실패 폴백). 3D 무대는 크롬 확장이 5173 외 포트를 막아 실측 못 함 — **사용자 확인 필요**(`pnpm dev:web` 후 /saju). 미커밋.
- 2026-09-06: **1차 완료.** 계약 `schemas/saju.ts`(입력·원국 스냅샷·섹션 4·job poll·오늘·궁합·택일·음식·프로필·기록·공유) + `Routes.Saju` + `UsageQuotaFeature` 에 `saju-reading`(기본 30/300/20/3000/90%) + purpose `saju`(env `OLLAMA_SAJU_MODEL` 기본 deepseek-v4-pro, 어드민 AI 키·한도 탭 라벨 추가). friendly `modules/saju`: prompts(v1, 시스템 + 섹션 4·오늘·궁합·택일·음식 프롬프트·JSON 스키마) · static(정적 섹션·오늘·궁합·택일 이유·음식 이유) · jobs(메모리 레지스트리, 섹션 확정마다 version+1, long-poll wait, 회원 저장까지 대기, TTL 5분·최대 200) · service(원국 재계산 → 섹션별 캐시 → 한도 1건 → 4개 병렬 → 정적 폴백 → 회원 저장·readingId 부착; 오늘·궁합·택일·음식 단일 호출) · route(POST readings / GET jobs/:id?after&wait(410) / daily / match / date-pick / food). Prisma `SajuProfile`·`SajuReading` 마이그레이션 `20260906110442_add_saju_profile_and_reading` 적용. shared `sajuApi`·`useSaju*`(job 은 useQuery refetchInterval 로 long-poll, 410 → gone)·`sajuProfileStore`(게스트 로컬 프로필 10명). `probe:saju-reading`(--list 로 kimi id 확인, 섹션 병렬·사실 오염 근사 측정). 테스트 friendly saju 17(전체 풀이 job·부분 실패 mixed·회원 저장·한도·오늘/궁합/택일/음식·라우트 정적 경로)·usage-quota 12·utils 306·shared 68 green. 프로브 실측은 아직(사용자 키로 실행 필요). 미커밋.
- 2026-09-06: **0차 완료.** `@repo/utils` 에 `sajuAstroTable.ts`(생성물: 절기 1899~2051 분 단위 + 음력 월 표 1900~2050, astronomy-engine 2.1.19 로 계산 — KASI 공개값과 절기 ±1분·설날 1990~2050 61건·윤달 1900~2050 전부 일치) · `sajuCalendar.ts`(율리우스일·절기 조회·한국 표준시 4구간·서머타임 12구간·진태양시·음력↔양력) · `saju.ts`(원국·십신·지장간·십이운성·공망·신살 8·관계 12종·오행 점수·신강약·보완 오행·대운·세운) · `sajuText.ts`(일간 10·십신·십이운성·신살·관계·오행 행운·사실 목록) · `sajuDaily.ts`(일진 점수·별점·태그) · `sajuMatch.ts`(궁합 100점 5항목) · `sajuDatePick.ts`(택일 6용도) · `sajuFood.ts`(메뉴 100종 오행 친화도 → 후보 3) · `sajuFlow.ts`(setup→casting→stamping→reading 리듀서) · `sajuImages.ts`(id·경로). 테스트 61건(utils 총 306) green. 검증 표본: 1990-05-15 14:30 남 = 경오 신사 경진 계미·순행 7세 3개월, 2026-02-04 입춘 05:02 전후 년·월주 전환, 1987 서머타임 −90분, 2000-01-01 00:10 → 자시 넘김(무오), 음력 1985-01-01 = 1985-02-20. 스크립트 `build:saju-tables`(astro/kasi 소스, friendly devDependency astronomy-engine) · `build:saju-images`(1:1 webp 512/1024 + placeholder 22장 생성 확인). 프롬프트북 `docs/saju-image-prompts.md`. 미커밋.
- 2026-09-06: 계획 작성. 사용자 결정 1~5 확정, 기본값 표 합의 대기(이견 없으면 진행).
