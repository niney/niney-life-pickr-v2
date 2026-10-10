import { z } from 'zod';

// 메뉴판 읽기(어드민 테스트) — 메뉴판 사진 한 장을 비전 LLM(purpose menu-board, 기본 kimi-k3)이 메뉴·가격·설명
// 목록으로 읽는다. OCR 없이 사진 + 규칙 프롬프트 한 번 — 검수 정답 20장 F1 99.8%(docs/menu-board-ocr-probe.md).

// 사진에 적힌 그대로의 한 항목. 가격은 표기 그대로('10,000', '11.0', '시가') — 숫자로 바꾸지 않는다.
export const MenuBoardItem = z.object({
  name: z.string(),
  price: z.string().nullable(),
  description: z.string().nullable(),
});
export type MenuBoardItemType = z.infer<typeof MenuBoardItem>;

export const MenuBoardReadResult = z.object({
  model: z.string(),
  items: z.array(MenuBoardItem),
  durationMs: z.number().int().nonnegative(),
  promptTokens: z.number().int().nullable(),
  completionTokens: z.number().int().nullable(),
  // 모델에 넘긴 사진 크기 — 긴 변을 2,000px 로 맞춘 JPEG(작은 사진은 키운다).
  image: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  // 모델 응답 원문(형식이 어긋났을 때 확인용).
  rawText: z.string(),
});
export type MenuBoardReadResultType = z.infer<typeof MenuBoardReadResult>;

// 수집 샘플 — friendly collect:menu-boards 가 data/menu-boards 에 받아 둔 캐치테이블 메뉴판 사진.
export const MenuBoardSample = z.object({
  key: z.string(), // '<shopRef>__board-N'
  shopRef: z.string(),
  shopName: z.string(),
  file: z.string(),
  // 회귀 평가용 검수 정답(golden/menu-boards)이 있는 사진.
  hasTruth: z.boolean(),
});
export type MenuBoardSampleType = z.infer<typeof MenuBoardSample>;

export const MenuBoardSamplesResponse = z.object({ samples: z.array(MenuBoardSample) });
export type MenuBoardSamplesResponseType = z.infer<typeof MenuBoardSamplesResponse>;

// ── 회귀 평가 리포트 ─────────────────────────────────────────────────────────
// eval:menu-boards 가 검수 정답 사진마다 읽기를 돌려 채점하고 data/menu-boards/eval-report.json 에 남긴다.

export const MenuBoardEvalBoard = z.object({
  key: z.string(),
  shop: z.string(),
  note: z.string().nullable(),
  required: z.number().int().nonnegative(), // 정답 메뉴 수
  matched: z.number().int().nonnegative(),
  missed: z.array(z.string()), // 놓친 정답 메뉴
  wrong: z.array(z.string()), // 정답·optional 어디에도 없는 항목(지어냄·잘못 묶음)
  misread: z.array(z.object({ expected: z.string(), got: z.string() })), // 짝은 맞았지만 핵심 이름이 다름
  priceMismatch: z.array(
    z.object({ name: z.string(), expected: z.string().nullable(), got: z.string().nullable() }),
  ),
  durationMs: z.number().int().nullable(),
  error: z.string().nullable(),
  items: z.array(MenuBoardItem),
});
export type MenuBoardEvalBoardType = z.infer<typeof MenuBoardEvalBoard>;

export const MenuBoardEvalTotals = z.object({
  boards: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  required: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  precision: z.number().nullable(),
  recall: z.number().nullable(),
  f1: z.number().nullable(),
  exactName: z.number().nullable(), // 짝지은 메뉴 중 핵심 이름을 그대로 읽은 비율
  priceAccuracy: z.number().nullable(),
  coverFalseItems: z.number().int().nonnegative(), // 메뉴 없는 사진에서 뽑은 항목 수
  medianMs: z.number().int().nullable(),
});
export type MenuBoardEvalTotalsType = z.infer<typeof MenuBoardEvalTotals>;

export const MenuBoardEvalReport = z.object({
  createdAt: z.string(),
  model: z.string(),
  totals: MenuBoardEvalTotals,
  boards: z.array(MenuBoardEvalBoard),
});
export type MenuBoardEvalReportType = z.infer<typeof MenuBoardEvalReport>;

export const MenuBoardEvalResponse = z.object({ report: MenuBoardEvalReport.nullable() });
export type MenuBoardEvalResponseType = z.infer<typeof MenuBoardEvalResponse>;
