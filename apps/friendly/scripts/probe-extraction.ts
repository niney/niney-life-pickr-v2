import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../src/config/env.js';
import { AiConfigService, type LlmProviderEnv } from '../src/modules/ai/ai.config.service.js';
import { SettlementExtractionService } from '../src/modules/settlement-extraction/settlement-extraction.service.js';

// 영수증 추출 원인 진단 프로브.
//
// 저장된 영수증 이미지(token) 하나를 같은 vision provider 로 여러 변량으로
// 돌려, 빈 추출(items:[]) 의 원인이 "메뉴 힌트 과다" 인지 "모델 비결정성" 인지
// 가린다. EXTRACTION_DEBUG 없이도 결과를 콘솔에 바로 찍는다.
//
// 실행:
//   pnpm --filter friendly probe:extraction -- <token> [dumpPath]
//   (token 미지정 시 가장 최근 덤프의 token 자동 사용)

const buildEnvBlock = (): LlmProviderEnv => ({
  apiKey: env.OLLAMA_CLOUD_API_KEY,
  baseUrl: env.OLLAMA_CLOUD_BASE_URL,
  timeoutMs: env.OLLAMA_CLOUD_TIMEOUT_MS,
  maxConcurrent: env.OLLAMA_CLOUD_MAX_CONCURRENT,
  defaultModels: {
    chat: env.OLLAMA_DEFAULT_MODEL,
    image: env.OLLAMA_IMAGE_MODEL,
    'log-analysis': env.OLLAMA_LOG_ANALYSIS_MODEL,
  },
});

// 덤프 userPrompt 에서 "- " 로 시작하는 등록 메뉴 줄을 복원한다.
const menuNamesFromDump = (userPrompt: string): string[] =>
  userPrompt
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0);

const main = async (): Promise<void> => {
  const argToken = process.argv[2];
  const argDump = process.argv[3];

  const debugDir = join(process.cwd(), 'data', 'extraction-debug');
  let dumpPath = argDump ?? null;
  if (!dumpPath) {
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(debugDir))
      .filter((f) => f.endsWith('.json') && f.includes('success'))
      .sort();
    if (files.length === 0) {
      console.error('덤프가 없습니다. token 인자를 직접 주세요.');
      process.exit(1);
    }
    dumpPath = join(debugDir, files[files.length - 1]!);
  }

  const dump = JSON.parse(await readFile(dumpPath, 'utf8')) as {
    token: string;
    restaurantName: string;
    userPrompt: string;
  };
  const token = argToken ?? dump.token;
  const fullMenu = menuNamesFromDump(dump.userPrompt);
  const restaurantName = dump.restaurantName;

  console.log(`\n토큰: ${token}`);
  console.log(`식당명(프롬프트): ${restaurantName}`);
  console.log(`등록 메뉴 힌트: ${fullMenu.length}개\n`);

  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildEnvBlock());
  const service = new SettlementExtractionService(aiConfig, {
    storageDir: join(process.cwd(), 'data', 'receipts'),
  });

  const variants: { label: string; menuNames: string[] }[] = [
    { label: `A) 현재(힌트 ${fullMenu.length}개)`, menuNames: fullMenu },
    { label: 'B) 힌트 없음', menuNames: [] },
    { label: 'C) 힌트 10개', menuNames: fullMenu.slice(0, 10) },
    { label: 'B2) 힌트 없음(재시도)', menuNames: [] },
  ];

  for (const v of variants) {
    process.stdout.write(`${v.label.padEnd(22)} … `);
    try {
      const res = await service.extract({
        imageToken: token,
        restaurantName,
        menuNames: v.menuNames,
        roundHint: { index: 1, total: 1 },
      });
      const items = res.items;
      console.log(
        `items ${items.length}개 · 합계 ${res.itemsSubtotal.toLocaleString()} · 총액 ${res.totalAmount?.toLocaleString() ?? 'null'}${res.warning ? ' · ⚠불일치' : ''}`,
      );
      for (const it of items.slice(0, 12)) {
        console.log(
          `      - ${it.name}  ${it.unitPrice ?? '·'}×${it.quantity ?? '·'} = ${it.amount.toLocaleString()}  [${it.category}]`,
        );
      }
    } catch (e) {
      console.log(`실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await prisma.$disconnect();
  console.log('');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
