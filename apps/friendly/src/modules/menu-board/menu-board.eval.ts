import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  MenuBoardEvalBoardType,
  MenuBoardEvalReportType,
  MenuBoardItemType,
} from '@repo/api-contract';
import { MENU_BOARD_GOLDEN_DIR } from './menu-board.service.js';
import { parseTruth, scoreBoard, summarize, type BoardScore, type BoardTruth } from './menu-board.score.js';

// 메뉴판 읽기 회귀 평가 — 검수 정답 사진마다 읽기를 돌려 채점하고 리포트를 만든다(scripts/eval-menu-boards.ts).

export const loadMenuBoardTruths = async (dir = MENU_BOARD_GOLDEN_DIR): Promise<Map<string, BoardTruth>> => {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const truths = new Map<string, BoardTruth>();
  for (const file of files) {
    truths.set(basename(file, '.json'), parseTruth(JSON.parse(await readFile(join(dir, file), 'utf-8'))));
  }
  return truths;
};

export interface BoardRun {
  key: string;
  items: MenuBoardItemType[];
  durationMs: number | null;
  error: string | null;
}

const toBoard = (run: BoardRun, truth: BoardTruth, score: BoardScore | null): MenuBoardEvalBoardType => ({
  key: run.key,
  shop: truth.shop,
  note: truth.note,
  required: truth.items.length,
  matched: score?.matched ?? 0,
  missed: score?.missed ?? [],
  wrong: score?.wrong ?? [],
  misread: score?.misread ?? [],
  priceMismatch: score?.priceMismatch ?? [],
  durationMs: run.durationMs,
  error: run.error,
  items: run.items,
});

// 읽은 결과(사진별)를 정답으로 채점해 리포트로. 실패한 사진은 지표에서 빠지고 failed 로 센다.
export const buildMenuBoardReport = (
  runs: BoardRun[],
  truths: Map<string, BoardTruth>,
  model: string,
  createdAt = new Date().toISOString(),
): MenuBoardEvalReportType => {
  const scored = runs.map((run) => {
    const truth = truths.get(run.key);
    if (!truth) throw new Error(`검수 정답이 없는 사진: ${run.key}`);
    return { run, truth, score: run.error ? null : scoreBoard(truth, run.items) };
  });
  return {
    createdAt,
    model,
    totals: summarize(
      scored.map(({ run, score }) => ({ score, durationMs: run.durationMs })),
      scored.map(({ truth }) => truth),
    ),
    boards: scored.map(({ run, truth, score }) => toBoard(run, truth, score)),
  };
};

// 사진 키마다 read 를 차례로(동시 호출 없이 — ollama 계정 한도) 돌려 리포트를 만든다.
export const runMenuBoardEval = async (opts: {
  truths: Map<string, BoardTruth>;
  keys: string[];
  model: string;
  read: (key: string) => Promise<{ items: MenuBoardItemType[]; durationMs: number }>;
  onBoard?: (run: BoardRun, index: number) => void;
}): Promise<MenuBoardEvalReportType> => {
  const runs: BoardRun[] = [];
  for (const [index, key] of opts.keys.entries()) {
    const startedAt = Date.now();
    let run: BoardRun;
    try {
      const result = await opts.read(key);
      run = { key, items: result.items, durationMs: result.durationMs, error: null };
    } catch (e) {
      run = { key, items: [], durationMs: Date.now() - startedAt, error: e instanceof Error ? e.message : String(e) };
    }
    runs.push(run);
    opts.onBoard?.(run, index);
  }
  return buildMenuBoardReport(runs, opts.truths, opts.model);
};
