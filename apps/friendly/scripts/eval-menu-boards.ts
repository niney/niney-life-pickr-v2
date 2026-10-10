// 메뉴판 읽기 회귀 평가 — 검수 정답(golden/menu-boards, 사진을 직접 보고 쓴 메뉴·가격 20장) 사진마다 읽기를 돌려 채점한다.
// 라우트와 같은 서비스(MenuBoardService: 같은 사진 처리·프롬프트·모델 호출)를 쓴다. 호출은 한 장씩 차례로.
//
// 실행: pnpm --filter friendly eval:menu-boards [-- --model=gemma4:31b] [--only=<key>,<key>] [--rescore]
//   --model    용도(menu-board) 기본 모델 대신 이 모델로(비교용)
//   --only     이 사진 키만
//   --rescore  모델을 다시 부르지 않고 지난 리포트의 항목을 지금 정답으로 다시 채점(정답을 고친 뒤)
// 결과: data/menu-boards/eval-report.json(어드민 '메뉴판 읽기 > 정확도' 탭이 읽는다, git 제외) + 표준 출력 요약.
// 사진은 collect:menu-boards 가 받아 둔 data/menu-boards — 없으면 먼저 수집한다.
// 기준(2026-10-10, kimi-k3): F1 99.8%(308개 중 307개 맞힘, 지어냄 0), 장당 중앙 약 7초.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { buildMenuBoardReport, loadMenuBoardTruths, runMenuBoardEval } from '../src/modules/menu-board/menu-board.eval.js';
import {
  MENU_BOARD_EVAL_REPORT_PATH,
  MenuBoardService,
  readMenuBoardEvalReport,
  readMenuBoardSampleImage,
} from '../src/modules/menu-board/menu-board.service.js';
import type { MenuBoardEvalReportType } from '@repo/api-contract';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const MODEL = opt('model');
const ONLY = opt('only')?.split(',').map((k) => k.trim()).filter(Boolean) ?? null;
const RESCORE = args.includes('--rescore');

const pct = (v: number | null): string => (v === null ? '–' : `${(v * 100).toFixed(1)}%`);

const print = (report: MenuBoardEvalReportType): void => {
  const t = report.totals;
  console.log(`\n모델 ${report.model} · 사진 ${t.boards}장(실패 ${t.failed}) · 정답 메뉴 ${t.required}개`);
  console.log(
    `F1 ${pct(t.f1)} · 정밀도 ${pct(t.precision)} · 재현율 ${pct(t.recall)} · 이름 정확 ${pct(t.exactName)} · ` +
      `가격 일치 ${pct(t.priceAccuracy)} · 맞힘 ${t.matched} · 지어냄 ${t.wrong} · 표지 오인 ${t.coverFalseItems} · ` +
      `장당 중앙 ${t.medianMs === null ? '–' : `${(t.medianMs / 1000).toFixed(1)}초`}`,
  );
  for (const b of report.boards) {
    const issues = [
      ...b.missed.map((n) => `놓침 ${n}`),
      ...b.wrong.map((n) => `지어냄 ${n}`),
      ...b.misread.map((m) => `이름 ${m.expected} → ${m.got}`),
      ...b.priceMismatch.map((p) => `가격 ${p.name} ${p.expected ?? '–'} → ${p.got ?? '–'}`),
    ];
    if (!b.error && issues.length === 0) continue;
    console.log(`  ${b.shop} (${b.key})${b.error ? ` — 실패: ${b.error}` : ''}`);
    for (const issue of issues) console.log(`    ${issue}`);
  }
};

const main = async (): Promise<void> => {
  const truths = await loadMenuBoardTruths();
  if (RESCORE) {
    const previous = await readMenuBoardEvalReport();
    if (!previous) throw new Error(`다시 채점할 리포트가 없습니다: ${MENU_BOARD_EVAL_REPORT_PATH}`);
    const runs = previous.boards
      .filter((b) => truths.has(b.key))
      .map((b) => ({ key: b.key, items: b.items, durationMs: b.durationMs, error: b.error }));
    const report = buildMenuBoardReport(runs, truths, previous.model, previous.createdAt);
    await writeFile(MENU_BOARD_EVAL_REPORT_PATH, JSON.stringify(report, null, 1));
    print(report);
    return;
  }

  const keys = ONLY ?? [...truths.keys()];
  const prisma = new PrismaClient();
  try {
    const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
    const service = new MenuBoardService(aiConfig);
    const model = MODEL ?? (await aiConfig.getResolved('ollama-cloud', 'menu-board'))?.defaultModel ?? '';
    if (!model) throw new Error('메뉴판 읽기(menu-board) 모델이 없습니다 — OLLAMA_MENU_BOARD_MODEL 또는 --model');
    console.log(`검수 정답 ${keys.length}장 · 모델 ${model}`);
    const report = await runMenuBoardEval({
      truths,
      keys,
      model,
      read: async (key) => {
        const image = await readMenuBoardSampleImage(key);
        if (!image) throw new Error('샘플 사진이 없습니다(collect:menu-boards 먼저)');
        return service.read(image.buffer, { model });
      },
      onBoard: (run, i) =>
        console.log(
          `[${i + 1}/${keys.length}] ${truths.get(run.key)?.shop ?? run.key} — ` +
            (run.error ? `실패 ${run.error.slice(0, 80)}` : `항목 ${run.items.length} · ${((run.durationMs ?? 0) / 1000).toFixed(1)}초`),
        ),
    });
    await mkdir(dirname(MENU_BOARD_EVAL_REPORT_PATH), { recursive: true });
    await writeFile(MENU_BOARD_EVAL_REPORT_PATH, JSON.stringify(report, null, 1));
    print(report);
    console.log(`\n리포트 ${MENU_BOARD_EVAL_REPORT_PATH}`);
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
