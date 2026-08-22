// 식단 사진 인식 모델 비교 프로브 — 0차/5차. 같은 사진들을 여러 비전 모델에 돌려 raw 응답과
// 파싱 결과를 나란히 찍는다. 어떤 모델을 meal-photo 용도로 설정할지 고르는 근거를 만든다.
//
// 실행:
//   pnpm --filter friendly probe:meal-vision -- --dir=data/meal-samples [--models=gemma4:31b,qwen3.5:397b]
//                                                [--limit=5] [--place="숯토리 신촌점"] [--menus=삼겹살,김치찌개]
//   --dir   : 사진 폴더(jpg/png/heic). 하위 폴더는 보지 않는다.
//   --models: 비교할 모델(콤마). 미지정이면 meal-photo 용도의 현재 설정 모델 1개.
//   --limit : 사진 수 상한(기본 5).
// 사진은 서버 저장 규칙과 같게 1600px JPEG 로 정규화해 보낸다(실제 인식과 같은 입력).

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import {
  MEAL_RECOGNITION_JSON_SCHEMA,
  MEAL_RECOGNITION_SYSTEM_PROMPT,
  MEAL_RECOGNITION_VERSION,
  buildMealRecognitionUserPrompt,
} from '../src/modules/meal-recognition/meal-recognition.prompts.js';
import { parseRecognitionOutput } from '../src/modules/meal-recognition/meal-recognition.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DIR = opt('dir') ?? 'data/meal-samples';
const LIMIT = Number.parseInt(opt('limit') ?? '5', 10);
const MODELS = (opt('models') ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter((m) => m.length > 0);
const PLACE = opt('place');
const MENUS = (opt('menus') ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter((m) => m.length > 0);

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);

const main = async (): Promise<void> => {
  const dir = resolve(DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())).sort();
  } catch {
    console.error(`사진 폴더를 열 수 없습니다: ${dir}`);
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.error(`사진이 없습니다: ${dir}`);
    process.exitCode = 1;
    return;
  }
  const targets = files.slice(0, LIMIT);

  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'meal-photo');
  if (!resolved) {
    console.error('meal-photo 용도의 provider(키)가 설정되지 않았습니다. 어드민 > 설정 > AI 키에서 등록하세요.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  const models = MODELS.length > 0 ? MODELS : [resolved.defaultModel].filter((m) => m.length > 0);
  if (models.length === 0) {
    console.error('비교할 모델이 없습니다. --models=... 로 지정하거나 meal-photo 기본 모델을 설정하세요.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(`=== 식단 사진 인식 프로브 (v${MEAL_RECOGNITION_VERSION}) ===`);
  console.log(`사진 ${targets.length}장: ${targets.join(', ')}`);
  console.log(`모델: ${models.join(', ')}\n`);

  const provider = adapterCache.get(resolved);
  const prompt = buildMealRecognitionUserPrompt({
    photoCount: 1,
    restaurantName: PLACE,
    menuNames: MENUS,
    slotLabel: null,
  });

  const summary: { model: string; ok: number; fail: number; dishes: number; ms: number }[] = [];

  for (const model of models) {
    let ok = 0;
    let fail = 0;
    let dishes = 0;
    let totalMs = 0;
    console.log(`──────────── ${model} ────────────`);
    for (const file of targets) {
      const raw = await readFile(join(dir, file));
      const jpeg = await sharp(raw, { failOn: 'none' })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      const t0 = Date.now();
      try {
        const res = await provider.complete({
          prompt,
          systemPrompt: MEAL_RECOGNITION_SYSTEM_PROMPT,
          model,
          images: [jpeg.toString('base64')],
          temperature: 0,
          maxTokens: 2000,
          numCtx: 8192,
          format: MEAL_RECOGNITION_JSON_SCHEMA as unknown as Record<string, unknown>,
        });
        const ms = Date.now() - t0;
        totalMs += ms;
        const parsed = parseRecognitionOutput(res.text);
        if (!parsed) {
          fail += 1;
          console.log(`  ${file} (${ms}ms) — 파싱 실패\n    ${res.text.slice(0, 300)}`);
          continue;
        }
        ok += 1;
        dishes += parsed.dishes.length;
        const names = parsed.dishes
          .map((d) => `${d.name}${d.isMain ? '' : '(반찬)'}${d.confidence < 0.4 ? '?' : ''}`)
          .join(', ');
        console.log(`  ${file} (${ms}ms) — ${parsed.dishes.length}개: ${names || '(없음)'}`);
      } catch (e) {
        fail += 1;
        totalMs += Date.now() - t0;
        console.log(`  ${file} — 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    summary.push({ model, ok, fail, dishes, ms: Math.round(totalMs / Math.max(1, targets.length)) });
    console.log('');
  }

  console.log('=== 요약 ===');
  for (const s of summary) {
    console.log(
      `${s.model}: 성공 ${s.ok}/${s.ok + s.fail}, 음식 평균 ${(s.dishes / Math.max(1, s.ok)).toFixed(1)}개, 평균 ${s.ms}ms`,
    );
  }
  await prisma.$disconnect();
};

void main();
