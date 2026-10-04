// 영양소 점검·영양제 조언 프로브 — 가상 사용자(probe:meal-recommend 의 A·B·C, probe:meal-settings 의 E)와 지정 이메일
// 사용자의 dev.db 기록으로 점검 결과를 뽑고, 서비스와 같은 후보·프롬프트·검사(sanitizeAdvice)로 모델별 조언을 견준다.
// LLM 만 모델을 바꿔 직접 부른다(라우트의 분당 제한·일일 한도·저장 없음). 기록·설정은 바꾸지 않는다.
//
// 실행: pnpm --filter friendly probe:meal-nutrition [--models=kimi-k3,gpt-oss:120b] [--days 14] [--email <addr>] [--repeat 1]
//   리포트 data/meal-probe/nutrition-report-날짜.md (git 제외). 운영 DB(prod.db)는 거부.
//
// 자동 지표(모델별): 성공률 · 지연 p50/최대 · 출력 잘림 · 서버 문장으로 바꾼 칸(사유별 — number 프롬프트에 없는 용량,
//   hanja 한자, claim 치료·예방, offlist 점검 밖 영양소, empty·long, missing 영양소 누락) · 제품·브랜드 의심 표현.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { thinkOptionForModel } from '@repo/utils';
import { buildApp } from '../src/app.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import {
  adviceCandidates,
  allowedNumbersFor,
  parseAdviceOutput,
  sanitizeAdvice,
} from '../src/modules/meal-nutrition/meal-nutrition-advice.service.js';
import {
  MEAL_NUTRITION_ADVICE_SYSTEM_PROMPT,
  buildMealNutritionAdviceJsonSchema,
  buildMealNutritionAdviceUserPrompt,
} from '../src/modules/meal-nutrition/meal-nutrition.prompts.js';
import { MealNutritionService } from '../src/modules/meal-nutrition/meal-nutrition.service.js';

const args = process.argv.slice(2);
const argValue = (name: string): string | null => {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const MODELS = (argValue('--models') ?? 'kimi-k3,gpt-oss:120b')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const DAYS = Math.max(7, Math.min(28, Number(argValue('--days')) || 14));
const REPEAT = Math.max(1, Math.min(3, Number(argValue('--repeat')) || 1));
const EMAIL = argValue('--email') ?? 'niney@life.com';
// 서비스와 같은 호출 설정(meal-nutrition-advice.service LLM_*) — 추론은 끈 상태(어드민 기본)로 본다.
const LLM = { temperature: 0.3, maxTokens: 2000, numCtx: 8192, timeoutMs: 180_000 };
const OUT_DIR = join(process.cwd(), 'data', 'meal-probe');
// 제품·구매 안내로 읽히는 표현('유제품'은 음식).
const PRODUCT_RE = /(?<!유)제품|브랜드|구매|쿠팡|약국에서 사|®|™|정\s?\d+\s?알/;

const USERS = [
  { id: 'probe-meal-a', label: 'A 돼지고기·찌개 편중' },
  { id: 'probe-meal-b', label: 'B 아침 거르고 야식' },
  { id: 'probe-meal-c', label: 'C 새우·게 알레르기·오이 제외' },
  { id: 'probe-meal-e', label: 'E 다양' },
];

interface Run {
  model: string;
  user: string;
  ms: number;
  ok: boolean;
  truncated: boolean;
  repairs: string[];
  product: string[];
  summary: string;
  items: Array<{ label: string; reason: string; foodTip: string; supplementTip: string | null }>;
  error: string | null;
}

const p50 = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0;
};

const main = async (): Promise<void> => {
  const url = (process.env['DATABASE_URL'] ?? '').trim();
  if (!url.startsWith('file:')) throw new Error('SQLite(file:) DATABASE_URL 에서만 실행합니다.');
  if (/prod\.db/i.test(url)) throw new Error('운영 DB(prod.db)에서는 실행하지 않습니다.');

  const app = await buildApp({ logger: false });
  await app.ready();
  const prisma = app.prisma;
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const me = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
    const users = [...USERS, ...(me ? [{ id: me.id, label: `내 계정(${EMAIL.split('@')[0]})` }] : [])];
    const nutrition = new MealNutritionService(prisma);
    const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
    const resolved = await aiConfig.getResolved('ollama-cloud', 'meal-supplement');
    if (!resolved) throw new Error('meal-supplement 용 ollama-cloud 설정이 없습니다(키 확인).');
    const provider = adapterCache.get(resolved);

    const md: string[] = [`# 영양제 조언 프로브 ${today}`, '', `모델 ${MODELS.join(', ')} · 최근 ${DAYS}일 · 반복 ${REPEAT}`, ''];
    const runs: Run[] = [];
    for (const u of users) {
      const exists = await prisma.user.findUnique({ where: { id: u.id }, select: { id: true } });
      if (!exists) {
        console.log(`건너뜀 ${u.label} — 사용자 없음`);
        continue;
      }
      const analysis = await nutrition.analyze(u.id, today, DAYS);
      const candidates = adviceCandidates(analysis);
      md.push(`## ${u.label}`, '');
      md.push(
        `- 점검: ${analysis.status}${analysis.insufficientReason ? ` (${analysis.insufficientReason})` : ''} · 분석 ${analysis.analyzedDays}일/${analysis.mealCount}끼 · 열량 ${analysis.energy.intakePerDay ?? '-'}/${analysis.energy.requirement}kcal · 정보 ${Math.round(analysis.coverage * 100)}%`,
      );
      md.push(
        `- 상태: ${analysis.nutrients.map((n) => `${n.label} ${n.percent ?? '-'}% ${n.status}${n.supplementCandidate ? '★' : ''}`).join(' · ')}`,
      );
      for (const note of analysis.notes) md.push(`- 주의: ${note}`);
      md.push(`- 조언 대상: ${candidates.map((c) => c.label).join(', ') || '없음'}`, '');
      if (candidates.length === 0) continue;

      const prompt = buildMealNutritionAdviceUserPrompt({
        analysis,
        candidates,
        sodiumHigh: analysis.nutrients.find((n) => n.key === 'sodium' && n.status === 'high') ?? null,
      });
      md.push('<details><summary>프롬프트</summary>', '', '```', prompt, '```', '', '</details>', '');
      const allowed = allowedNumbersFor(prompt, candidates);
      for (const model of MODELS) {
        for (let r = 0; r < REPEAT; r += 1) {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), LLM.timeoutMs);
          const started = Date.now();
          let run: Run;
          try {
            const res = await provider.complete({
              prompt,
              systemPrompt: MEAL_NUTRITION_ADVICE_SYSTEM_PROMPT,
              model,
              temperature: LLM.temperature,
              maxTokens: LLM.maxTokens,
              numCtx: LLM.numCtx,
              format: buildMealNutritionAdviceJsonSchema(candidates.map((c) => c.key)) as unknown as Record<
                string,
                unknown
              >,
              think: thinkOptionForModel(model),
              signal: ac.signal,
            });
            const parsed = parseAdviceOutput(res.text);
            const checked = parsed
              ? sanitizeAdvice(parsed, { analysis, candidates, allowedNumbers: allowed })
              : null;
            const texts = parsed
              ? [parsed.summary, ...parsed.items.flatMap((i) => [i.reason, i.foodTip, i.supplementTip ?? ''])]
              : [];
            run = {
              model,
              user: u.label,
              ms: Date.now() - started,
              ok: !!checked && checked.llmItems > 0,
              truncated: res.doneReason === 'length',
              repairs: checked?.repairs ?? [],
              product: texts.filter((t) => PRODUCT_RE.test(t)),
              // 리포트에는 모델이 쓴 원문을 남긴다(검사로 바뀐 칸은 repairs 로 표시).
              summary: parsed?.summary ?? '',
              items:
                parsed?.items.map((i) => ({
                  label: candidates.find((c) => c.key === i.nutrient)?.label ?? i.nutrient,
                  reason: i.reason,
                  foodTip: i.foodTip,
                  supplementTip: i.supplementTip,
                })) ?? [],
              error: parsed ? null : `응답 형식 아님: ${res.text.slice(0, 120)}`,
            };
          } catch (e) {
            run = {
              model,
              user: u.label,
              ms: Date.now() - started,
              ok: false,
              truncated: false,
              repairs: [],
              product: [],
              summary: '',
              items: [],
              error: e instanceof Error ? e.message : String(e),
            };
          } finally {
            clearTimeout(timer);
          }
          runs.push(run);
          console.log(
            `${u.label} · ${model}#${r + 1}: ${run.ok ? 'ok' : 'FAIL'} ${(run.ms / 1000).toFixed(1)}s` +
              (run.repairs.length ? ` 수리 ${run.repairs.join(',')}` : '') +
              (run.error ? ` — ${run.error}` : ''),
          );
          md.push(`### ${model}${REPEAT > 1 ? ` #${r + 1}` : ''} — ${(run.ms / 1000).toFixed(1)}s${run.ok ? '' : ' · 실패'}`);
          if (run.error) md.push('', `오류: ${run.error}`);
          if (run.repairs.length) md.push('', `서버 문장으로 바꾼 칸: ${run.repairs.join(', ')}`);
          if (run.product.length) md.push('', `제품·구매 의심: ${run.product.join(' / ')}`);
          md.push('', `**요약** ${run.summary}`, '');
          for (const it of run.items) {
            md.push(`- **${it.label}**`, `  - 이유: ${it.reason}`, `  - 음식: ${it.foodTip}`);
            if (it.supplementTip) md.push(`  - 영양제: ${it.supplementTip}`);
          }
          md.push('');
        }
      }
    }

    md.push('## 모델별 지표', '', '| 모델 | 성공 | p50 | 최대 | 잘림 | 바꾼 칸 | 제품 의심 |', '|---|---|---|---|---|---|---|');
    for (const model of MODELS) {
      const rs = runs.filter((r) => r.model === model);
      const repairs = rs.flatMap((r) => r.repairs.map((x) => x.split(':')[1] ?? x));
      const byKind = [...new Set(repairs)].map((k) => `${k} ${repairs.filter((x) => x === k).length}`).join(', ');
      md.push(
        `| ${model} | ${rs.filter((r) => r.ok).length}/${rs.length} | ${(p50(rs.map((r) => r.ms)) / 1000).toFixed(1)}s | ${(Math.max(0, ...rs.map((r) => r.ms)) / 1000).toFixed(1)}s | ${rs.filter((r) => r.truncated).length} | ${repairs.length}${byKind ? ` (${byKind})` : ''} | ${rs.reduce((s, r) => s + r.product.length, 0)} |`,
      );
    }
    await mkdir(OUT_DIR, { recursive: true });
    const out = join(OUT_DIR, `nutrition-report-${today}.md`);
    await writeFile(out, `${md.join('\n')}\n`);
    console.log(`\n리포트: ${out}`);
  } finally {
    await app.close();
  }
};

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
