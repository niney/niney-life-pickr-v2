import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../src/modules/ai/ai.config.service.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import {
  GLOBAL_MERGE_SYSTEM_PROMPT,
  GLOBAL_MERGE_JSON_SCHEMA,
  buildGlobalMergePrompt,
} from '../src/modules/analytics/global-merge.prompts.js';

// 글로벌 머지 응답 진단 프로브.
// categoryPath 가 globals 에 안 채워지는 원인이 (a) 모델이 객체를 안 줌
// (b) additionalProperties 스키마 미강제 인지 가린다. 같은 입력을 현재 스키마 /
// 스키마 없음 / 배열 스키마 3변량으로 돌려 raw 응답을 그대로 찍는다.
//
// 실행: pnpm --filter friendly probe:merge

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModel: env.OLLAMA_DEFAULT_MODEL,
});

// 배열 스키마 변량 — additionalProperties 맵 대신 items 배열로 강제.
const ARRAY_SCHEMA = {
  type: 'object',
  properties: {
    mappings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          variant: { type: 'string' },
          canonical: { type: 'string' },
          categoryPath: { type: 'string' },
        },
        required: ['variant', 'canonical', 'categoryPath'],
      },
    },
  },
  required: ['mappings'],
} as const;

const SAMPLE = [
  '김치찌개',
  '김치 찌개',
  '닭도리탕',
  '닭볶음탕',
  '된장찌개',
  '치즈돈까스',
  '돈까스',
  '공기밥',
];

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildEnvBlock());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'chat');
  if (!resolved) {
    console.error('provider 미설정 (ollama-cloud / chat)');
    process.exit(1);
  }
  const model = resolved.defaultModel?.trim();
  console.log(`\n모델: ${model}\n입력: ${JSON.stringify(SAMPLE)}\n`);
  const provider = adapterCache.get(resolved);

  const run = async (
    label: string,
    format: unknown,
    prompt: string,
  ): Promise<void> => {
    console.log(`\n────────── ${label} ──────────`);
    try {
      const res = await provider.complete({
        prompt,
        model: model!,
        systemPrompt: GLOBAL_MERGE_SYSTEM_PROMPT,
        temperature: 0,
        maxTokens: 2000,
        numCtx: 8000,
        ...(format !== undefined ? { format: format as never } : {}),
      });
      console.log(res.text);
    } catch (e) {
      console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 같은 입력을 3변량으로: 운영 스키마 / format 없음 / 배열 스키마.
  // format(grammar)이 응답을 비우는지, 배열 스키마는 괜찮은지 한눈에 비교.
  await run('A) 운영 스키마(현재 = 배열)', GLOBAL_MERGE_JSON_SCHEMA, buildGlobalMergePrompt(SAMPLE));
  await run('B) format 없음', undefined, buildGlobalMergePrompt(SAMPLE));
  await run(
    'C) 배열 스키마(명시 프롬프트)',
    ARRAY_SCHEMA,
    `메뉴 표기들: ${JSON.stringify(SAMPLE)}\n출력은 { "mappings": [ { "variant": 입력표기, "canonical": ..., "categoryPath": ... }, ... ] } 형태의 JSON 하나.`,
  );

  // D) 실제 머지 청크 규모 — DB 의 canonicalName 50개를 real 파라미터로.
  // truncation/빈응답 여부를 길이·파싱가능성으로 본다.
  const bigN = Number(process.argv[2]) || 50;
  const rows = await prisma.menuCanonical.findMany({
    select: { canonicalName: true },
    distinct: ['canonicalName'],
    take: bigN,
  });
  const big = rows.map((r) => r.canonicalName);
  const bigTokens = Number(process.argv[3]) || 4000;
  console.log(`\n────────── D) 실 규모 ${big.length}개 (maxTokens ${bigTokens}, no format) ──────────`);
  try {
    const res = await provider.complete({
      prompt: buildGlobalMergePrompt(big),
      model: model!,
      systemPrompt: GLOBAL_MERGE_SYSTEM_PROMPT,
      temperature: 0.1,
      maxTokens: bigTokens,
      numCtx: 16384,
    });
    const text = res.text;
    console.log(`completionTokens: ${res.completionTokens ?? '?'}`);
    let parsedN = -1;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const o = JSON.parse(m[0]) as { mappings?: unknown[] };
        parsedN = Array.isArray(o.mappings) ? o.mappings.length : -2;
      } catch {
        parsedN = -1; // 깨진 JSON (truncation 의심)
      }
    }
    console.log(`응답 길이: ${text.length}자, 파싱된 mappings: ${parsedN} (입력 ${big.length})`);
    console.log(`끝 120자: …${text.slice(-120)}`);
  } catch (e) {
    console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  await prisma.$disconnect();
  console.log('');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
