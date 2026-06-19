import { z } from 'zod';

// 맛집 자동 발굴(random-crawl) 스케줄 — cron 으로 하루 한 번 지역을 (랜덤/고정)
// 선정해 네이버 검색 → dedupe → 후보 N개를 텔레그램으로 보낸다. 사용자가
// 텔레그램 버튼으로 가게를 고르면 그 가게만 크롤(=Naver Place 등록)한다.
// 응답이 타임아웃까지 없으면 그 회차는 skipped 로 종료(아무것도 크롤 안 함).
//
// 기존 schedule(정규화→머지)과 같은 인프로세스 croner 스케줄러를 공유하되
// jobType 이 다르고(파이프라인이 다름), 실행이 텔레그램 응답을 기다리는
// 비동기 상태머신이라 별도 모듈/모델로 둔다.
//
// cronExpr 형식 검증은 서버 라우트에서 croner 로 한다(api-contract 는 순수
// 스키마 패키지라 croner 에 의존하지 않는다).

// cron tick / 어드민 "지금 실행".
export const RandomCrawlTrigger = z.enum(['cron', 'manual']);
export type RandomCrawlTriggerType = z.infer<typeof RandomCrawlTrigger>;

// running            : 지역 선정 → 검색 → 후보 전송까지 진행 중
// awaiting_selection : 텔레그램으로 후보를 보내고 사용자 선택을 대기 중
// crawling           : 사용자가 고른 가게를 크롤 중
// done               : 크롤까지 정상 종료
// skipped            : 무응답 타임아웃 / 후보 0건 / overlap 으로 종료
// failed             : 검색/크롤 중 오류
// interrupted        : 재시작으로 정리된 고아 run
export const RandomCrawlRunStatus = z.enum([
  'running',
  'awaiting_selection',
  'crawling',
  'done',
  'skipped',
  'failed',
  'interrupted',
]);
export type RandomCrawlRunStatusType = z.infer<typeof RandomCrawlRunStatus>;

// live 진행 단계 — 완료된 이력 행은 null.
export const RandomCrawlPhase = z.enum([
  'selecting_region',
  'searching',
  'awaiting_selection',
  'crawling',
  'done',
]);
export type RandomCrawlPhaseType = z.infer<typeof RandomCrawlPhase>;

// ── 지역 선택 ─────────────────────────────────────────────────────────
// 시/구는 실제 좌표로 검색하고, 동은 좌표가 없어 검색어에 동 이름을 결합한다
// (예: "역삼동 맛집" + 강남구 중심좌표). 각 레벨은 고정(value) 또는 랜덤.
//   - sidoRandom=false → sido 필수
//   - sigunguRandom=false → sigungu 필수(부모가 랜덤이면 서버가 랜덤으로 강등)
//   - dongEnabled=true & dongRandom=false → dong 필수
// 부모-자식 정합성(고정 자식이 랜덤 부모에 속하지 않음 등)은 서버 resolve 가
// 위에서 아래로 처리하며, 어긋나면 해당 레벨을 랜덤으로 폴백한다.
export const RandomCrawlRegion = z.object({
  sidoRandom: z.boolean().default(false),
  sido: z.string().nullable().default(null),
  sigunguRandom: z.boolean().default(false),
  sigungu: z.string().nullable().default(null),
  dongEnabled: z.boolean().default(false),
  dongRandom: z.boolean().default(false),
  dong: z.string().nullable().default(null),
});
export type RandomCrawlRegionType = z.infer<typeof RandomCrawlRegion>;

// ── 설정 ──────────────────────────────────────────────────────────────

// 설정 조회 응답 (GET). 행이 없으면 서버가 기본값으로 채워 반환한다.
export const RandomCrawlConfig = z.object({
  enabled: z.boolean(),
  cronExpr: z.string(),
  timezone: z.string(),
  region: RandomCrawlRegion,
  // 검색 키워드 — 동 이름과 결합된다. 기본 "맛집".
  keyword: z.string(),
  // 텔레그램으로 보낼 후보 수.
  candidateCount: z.number().int(),
  // 무응답 시 회차를 skipped 로 닫기까지 대기할 분.
  responseTimeoutMin: z.number().int(),
  // 텔레그램 봇 토큰/chat id 가 env 에 설정됐는지(읽기 전용). false 면 후보를
  // 보낼 수 없어 enabled 여도 회차가 skip 된다 — UI 가 경고를 노출.
  telegramConfigured: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastStatus: RandomCrawlRunStatus.nullable(),
  // croner.nextRun() 으로 계산. enabled=false 면 null.
  nextRunAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type RandomCrawlConfigType = z.infer<typeof RandomCrawlConfig>;

// 설정 변경 (PUT). jobType 은 서버가 'random-crawl' 로 고정.
export const RandomCrawlConfigInput = z.object({
  enabled: z.boolean(),
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
  region: RandomCrawlRegion,
  keyword: z.string().trim().min(1).max(40).default('맛집'),
  candidateCount: z.coerce.number().int().min(1).max(10).default(5),
  responseTimeoutMin: z.coerce.number().int().min(5).max(1440).default(180),
});
export type RandomCrawlConfigInputType = z.infer<typeof RandomCrawlConfigInput>;

// ── 후보 ──────────────────────────────────────────────────────────────

export const RandomCrawlCandidate = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  roadAddress: z.string().nullable(),
  rawSourceUrl: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  reviewCount: z.number().int().nullable(),
  // 사용자가 텔레그램에서 이 후보를 골랐는지.
  selected: z.boolean(),
});
export type RandomCrawlCandidateType = z.infer<typeof RandomCrawlCandidate>;

// ── 실행(run) ─────────────────────────────────────────────────────────

// 한 회차. 이력 조회(영속)와 live 스냅샷(메모리) 양쪽에서 같은 모양.
export const RandomCrawlRun = z.object({
  runId: z.string(),
  trigger: RandomCrawlTrigger,
  status: RandomCrawlRunStatus,
  phase: RandomCrawlPhase.nullable(),
  // 선정된 지역 표시용. 예: "서울특별시 강남구 역삼동".
  regionLabel: z.string().nullable(),
  keyword: z.string().nullable(),
  candidates: z.array(RandomCrawlCandidate),
  selectedPlaceId: z.string().nullable(),
  // 크롤(등록) 성공 시 식당 id.
  crawledRestaurantId: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type RandomCrawlRunType = z.infer<typeof RandomCrawlRun>;

export const RandomCrawlRunList = z.object({
  items: z.array(RandomCrawlRun),
  // 현재 진행 중(awaiting_selection 포함)인 run id. 없으면 null.
  inflightRunId: z.string().nullable(),
});
export type RandomCrawlRunListType = z.infer<typeof RandomCrawlRunList>;

// ── cron 미리보기 ─────────────────────────────────────────────────────
// schedule 과 동일 — 저장 전 cron 식 검증 + 다음 실행 시각.
export const RandomCrawlPreviewInput = z.object({
  cronExpr: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default('Asia/Seoul'),
});
export type RandomCrawlPreviewInputType = z.infer<typeof RandomCrawlPreviewInput>;

export const RandomCrawlPreviewResult = z.object({
  valid: z.boolean(),
  error: z.string().nullable(),
  nextRuns: z.array(z.string()),
});
export type RandomCrawlPreviewResultType = z.infer<typeof RandomCrawlPreviewResult>;

// ── 지역 옵션(UI 드롭다운) ────────────────────────────────────────────

// 전체 시도→시군구 트리(동 제외 — 가볍게 ~250 시군구). UI 가 시/구 셀렉트
// 채움. 동 목록은 시군구 선택 후 별도 조회(트리에 다 넣으면 수천 건).
export const RegionTree = z.array(
  z.object({
    sido: z.string(),
    sigungus: z.array(z.string()),
  }),
);
export type RegionTreeType = z.infer<typeof RegionTree>;

// 특정 시군구의 동 목록.
export const RegionDongQuery = z.object({
  sido: z.string().min(1),
  sigungu: z.string().min(1),
});
export type RegionDongQueryType = z.infer<typeof RegionDongQuery>;

export const RegionDongList = z.object({
  sido: z.string(),
  sigungu: z.string(),
  dongs: z.array(z.string()),
});
export type RegionDongListType = z.infer<typeof RegionDongList>;

// ── SSE 이벤트 ────────────────────────────────────────────────────────

export const RandomCrawlProgressEvent = z.object({
  type: z.literal('progress'),
  runId: z.string(),
  phase: RandomCrawlPhase,
  regionLabel: z.string().nullable(),
  // awaiting_selection 단계에서 후보를 함께 흘려 UI 가 즉시 표시.
  candidates: z.array(RandomCrawlCandidate),
});
export type RandomCrawlProgressEventType = z.infer<typeof RandomCrawlProgressEvent>;

export const RandomCrawlDoneEvent = z.object({
  type: z.literal('done'),
  runId: z.string(),
  status: RandomCrawlRunStatus,
  finishedAt: z.string(),
});
export type RandomCrawlDoneEventType = z.infer<typeof RandomCrawlDoneEvent>;
