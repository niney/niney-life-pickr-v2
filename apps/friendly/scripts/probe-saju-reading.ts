// 사주 풀이 모델 비교 프로브 — 샘플 사주 × 섹션을 모델별로 돌려 JSON 준수율·지연·글자수·명리 사실 오염을 찍는다.
//
// 실행: pnpm --filter friendly probe:saju-reading [--models=deepseek-v4-pro,qwen3.5:397b-cloud,kimi-k2.5,gpt-oss:120b]
//        [--samples=4] [--sections=personality,year,cycle,advice] [--show=1] [--list]
//   - 키·baseUrl 은 어드민 AI 설정(saju 용도, 없으면 chat 계정 상속)에서 읽는다. 모델만 --models 로 바꿔 돌린다.
//   - --list 는 계정에 노출된 모델 이름을 찍는다(kimi 계열 정확한 id 확인용).
//   - 서비스와 같은 requestSajuLlm(프롬프트·수리 재시도 1회)을 쓰므로 실제 경로와 동일하다.
//   - "사실 오염" 은 원국에 없는 십신을 본문이 언급하는지(근사) — 낮을수록 좋다.
//   - 결과는 .env.example 의 OLLAMA_SAJU_MODEL 주석과 docs/PLAN-saju.md 진행 기록에 남긴다.

import { PrismaClient } from '@prisma/client';
import { SAJU_SECTION_IDS, type SajuBirthInputType, type SajuSectionIdType } from '@repo/api-contract';
import { computeSajuChart, SAJU_TEN_GODS, SAJU_TEN_GOD_META, type SajuChart } from '@repo/utils';
import { z } from 'zod';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { OllamaCloudAdapter } from '../src/modules/ai/adapters/ollama-cloud.adapter.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { SAJU_SECTION_JSON_SCHEMA, SAJU_SECTION_MAX_TOKENS, buildSajuSectionPrompt } from '../src/modules/saju/saju.prompts.js';
import { requestSajuLlm } from '../src/modules/saju/saju.service.js';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const SAMPLES = Number(opt('samples', '4'));
const SHOW = Number(opt('show', '1'));
const SECTIONS = opt('sections', SAJU_SECTION_IDS.join(',')).split(',').map((s) => s.trim()).filter(Boolean) as SajuSectionIdType[];

const SAMPLE_POOL: SajuBirthInputType[] = [
  { calendar: 'solar', year: 1990, month: 5, day: 15, leapMonth: false, hour: 14, minute: 30, gender: 'M', options: { solarTimeCorrection: true, lateRatHour: false } },
  { calendar: 'solar', year: 1985, month: 12, day: 25, leapMonth: false, hour: 3, minute: 0, gender: 'F', options: { solarTimeCorrection: true, lateRatHour: false } },
  { calendar: 'lunar', year: 1975, month: 8, day: 15, leapMonth: false, hour: null, minute: null, gender: 'M', options: { solarTimeCorrection: true, lateRatHour: false } },
  { calendar: 'solar', year: 2001, month: 2, day: 4, leapMonth: false, hour: 23, minute: 50, gender: 'F', options: { solarTimeCorrection: true, lateRatHour: false } },
  { calendar: 'solar', year: 1968, month: 7, day: 7, leapMonth: false, hour: 9, minute: 10, gender: 'F', options: { solarTimeCorrection: true, lateRatHour: false } },
  { calendar: 'solar', year: 1996, month: 10, day: 30, leapMonth: false, hour: 18, minute: 0, gender: 'M', options: { solarTimeCorrection: true, lateRatHour: false } },
];

const Loose = z.object({}).passthrough();

const p50 = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

// 원국에 없는 십신 이름이 본문에 나오면 오염 1건(근사 — "정재가 없어" 같은 부정 언급도 잡힌다).
const contamination = (chart: SajuChart, text: string): number => {
  let n = 0;
  for (const g of SAJU_TEN_GODS) {
    if ((chart.tenGodCounts[g] ?? 0) > 0) continue;
    if (text.includes(SAJU_TEN_GOD_META[g].ko)) n++;
  }
  return n;
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'saju');
  if (!resolved) {
    console.error('Ollama Cloud 키가 없습니다 — 어드민 AI 설정 또는 OLLAMA_CLOUD_API_KEY 를 확인하세요.');
    process.exit(1);
  }
  const provider = new OllamaCloudAdapter({ apiKey: resolved.apiKey, baseUrl: resolved.baseUrl, timeoutMs: 120_000, maxConcurrent: 4 });
  if (args.includes('--list')) {
    console.log((await provider.listModels()).join('\n'));
    await prisma.$disconnect();
    return;
  }
  const models = opt('models', resolved.defaultModel || 'deepseek-v4-pro').split(',').map((m) => m.trim()).filter(Boolean);
  const samples = Array.from({ length: SAMPLES }, (_, i) => SAMPLE_POOL[i % SAMPLE_POOL.length]!);
  console.log(`모델 ${models.join(', ')} · 샘플 ${samples.length} · 섹션 ${SECTIONS.join(',')}\n`);

  for (const model of models) {
    let ok = 0;
    let total = 0;
    let repaired = 0;
    let contaminated = 0;
    const latencies: number[] = [];
    const chars: number[] = [];
    let shown = 0;
    for (const birth of samples) {
      const chart = computeSajuChart(birth);
      // 섹션 병렬 — 서비스와 같은 방식으로 동시에 보내 지연도 실제와 비슷하게.
      const results = await Promise.all(
        SECTIONS.map(async (section) => {
          const t0 = Date.now();
          try {
            const r = await requestSajuLlm(provider, model, {
              prompt: buildSajuSectionPrompt(chart, section),
              schema: Loose,
              jsonSchema: SAJU_SECTION_JSON_SCHEMA[section],
              maxTokens: SAJU_SECTION_MAX_TOKENS[section],
            });
            return { section, ms: Date.now() - t0, output: r.output, calls: r.calls, lastText: r.lastText };
          } catch (e) {
            return { section, ms: Date.now() - t0, output: null, calls: 1, lastText: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      for (const r of results) {
        total++;
        latencies.push(r.ms);
        if (r.output) {
          ok++;
          if (r.calls > 1) repaired++;
          const text = JSON.stringify(r.output);
          chars.push(text.length);
          contaminated += contamination(chart, text) > 0 ? 1 : 0;
          if (shown < SHOW) {
            shown++;
            console.log(`--- ${model} · ${birth.year}-${birth.month}-${birth.day} ${birth.gender} · ${r.section} (${r.ms}ms, calls ${r.calls})`);
            console.log(text.slice(0, 900));
          }
        } else {
          console.log(`✗ ${model} · ${r.section} 파싱 실패 (${r.ms}ms): ${r.lastText.slice(0, 160).replace(/\n/g, ' ')}`);
        }
      }
    }
    console.log(
      `\n[${model}] JSON 준수 ${ok}/${total} · 수리 ${repaired} · 사실 오염(십신) ${contaminated}/${ok} · p50 ${p50(latencies)}ms · max ${Math.max(...latencies)}ms · 평균 글자 ${Math.round(chars.reduce((a, b) => a + b, 0) / Math.max(1, chars.length))}\n`,
    );
  }
  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
