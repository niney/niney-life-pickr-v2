import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../src/modules/ai/ai.config.service.js';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
} from '../src/modules/settlement-extraction/settlement-extraction.prompts.js';

// vision 추출이 빈 items 를 내는 원인을 provider 레벨에서 가린다.
// 같은 이미지로: (1) 현재 설정 재현 (2) numCtx 확대 (3) format 제거(자유서술)
// (4) format='json' (5) 단순 프롬프트 — 를 돌려 raw 응답을 그대로 출력.
//
// 실행: pnpm --filter friendly probe:vision -- <token>

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModel: env.OLLAMA_DEFAULT_MODEL,
});

const main = async (): Promise<void> => {
  const token = process.argv[2] ?? '02c6920e-cd37-468f-87e9-925ba7584581';
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildEnvBlock());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'image');
  if (!resolved) {
    console.error('image 용도 provider 가 설정되지 않았습니다.');
    process.exit(1);
  }
  const model = resolved.defaultModel!.trim();
  const provider = adapterCache.get(resolved);
  const base64 = (await readFile(join(process.cwd(), 'data', 'receipts', `${token}.jpg`))).toString('base64');

  console.log(`\n모델: ${model}\n토큰: ${token}\n`);

  const run = async (
    label: string,
    opts: { systemPrompt?: string; prompt: string; numCtx: number; format?: 'json' | Record<string, unknown> },
  ): Promise<void> => {
    console.log(`──────────── ${label} ────────────`);
    try {
      const res = await provider.complete({
        prompt: opts.prompt,
        systemPrompt: opts.systemPrompt,
        model,
        images: [base64],
        temperature: 0.1,
        maxTokens: 4000,
        numCtx: opts.numCtx,
        ...(opts.format !== undefined ? { format: opts.format } : {}),
      });
      console.log(res.text.slice(0, 1500));
    } catch (e) {
      console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.log('');
  };

  const userPrompt = '식당명: 숯토리 신촌점\n등록 메뉴: (정보 없음 — 영수증만 보고 추출하라)\n\n영수증 이미지를 분석해 위 스키마에 맞는 JSON 객체로 답하라.';

  await run('1) 현재(schema, numCtx 8192)', {
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    prompt: userPrompt,
    numCtx: 8192,
    format: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  await run('2) schema, numCtx 32768', {
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    prompt: userPrompt,
    numCtx: 32768,
    format: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  await run('3) format 없음(자유서술) — 이미지가 보이나?', {
    prompt: '이 영수증 이미지에 보이는 모든 상품(메뉴) 줄을 "메뉴명 수량 금액" 형식으로 빠짐없이 나열해줘. 한국어로.',
    numCtx: 8192,
  });

  await run("4) format='json', numCtx 32768", {
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    prompt: userPrompt,
    numCtx: 32768,
    format: 'json',
  });

  // ── 작동 기준(자유서술, system 없음, format 없음)에서 한 변수씩 토글 ──
  const freeform = '이 영수증 이미지에 보이는 모든 상품(메뉴) 줄을 "메뉴명 수량 금액" 형식으로 빠짐없이 나열해줘. 한국어로.';

  await run('6) 자유서술 + EXTRACTION_SYSTEM_PROMPT 추가(format X)', {
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    prompt: freeform,
    numCtx: 8192,
  });

  await run('7) 자유서술 + format=schema 추가(system X)', {
    prompt: freeform,
    numCtx: 8192,
    format: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  await run('8) userPrompt(JSON요구) + system X + format X', {
    prompt: userPrompt,
    numCtx: 8192,
  });

  // ── 수정안 후보: 소극적 문구 제거한 짧은 시스템 프롬프트 + format=schema ──
  const REVISED_SYSTEM = `너는 한국 음식점 영수증 이미지에서 메뉴 항목을 추출하는 비전 모델이다.
영수증에 보이는 모든 상품/메뉴 줄을 하나도 빠짐없이 추출하라.
각 항목 필드:
- name: 영수증에 적힌 메뉴명 그대로(한국어).
- unitPrice: 단가(원), 없으면 null.
- quantity: 수량, 없으면 null.
- amount: 라인 합계(원), 없으면 단가×수량.
- category: ALCOHOL(주류) / NON_ALCOHOL(무알코올 음료) / SIDE(안주·음식) / UNCATEGORIZED 중 하나.
- matchedMenuName: 등록 메뉴 힌트와 같으면 그 이름, 아니면 null.
totalAmount: 합계 또는 승인금액. 세금·봉사료·카드정보·매장정보 줄은 items 에서 제외한다.
주어진 JSON 스키마에 맞춰 답하라.`;

  await run('9) ★수정안: 짧은 시스템 + format=schema', {
    systemPrompt: REVISED_SYSTEM,
    prompt: userPrompt,
    numCtx: 8192,
    format: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
  });

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
