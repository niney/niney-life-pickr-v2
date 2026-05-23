import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import sharp from 'sharp';
import {
  ReceiptItem,
  type ExtractReceiptResultType,
  type ReceiptItemType,
  type UploadReceiptResultType,
} from '@repo/api-contract';
import { z } from 'zod';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';
import { extractFirstJsonObject } from '../summary/summary.service.js';
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_VERSION,
  buildExtractionUserPrompt,
} from './settlement-extraction.prompts.js';

// 영수증 이미지 한 변 최대 길이 — vision 모델 토큰 비용을 줄이려 큰 해상도는
// 다운스케일. 가독성을 위해 단 변 기준 1600px 까진 유지.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 80;

// vision 호출은 텍스트보다 느릴 수 있어 별도 타임아웃을 둔다 (어댑터의
// timeoutMs 는 chat 기준). 60초.
const VISION_TIMEOUT_MS = 60_000;
const VISION_MAX_TOKENS = 4000;
const VISION_NUM_CTX = 8192;
const VISION_TEMPERATURE = 0.1;

// imageToken 은 cuid 가 아니라 randomUUID 의 hex 변형 — path traversal 을
// 막기 위해 정해진 패턴(영숫자+하이픈 36자) 만 허용한다.
const IMAGE_TOKEN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export class SettlementExtractionError extends Error {
  constructor(
    public readonly code:
      | 'no_provider'
      | 'restaurant_not_found'
      | 'image_not_found'
      | 'invalid_image'
      | 'invalid_token'
      | 'llm_failed',
    message: string,
  ) {
    super(message);
    this.name = 'SettlementExtractionError';
  }
}

export interface SettlementExtractionServiceOptions {
  // 테스트에서 vision provider 를 주입할 수 있게. 기본은 aiConfig+adapterCache.
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
  cache?: AdapterCache;
  logger?: FastifyBaseLogger;
  // 저장 디렉터리. 기본은 process.cwd()/data/receipts.
  storageDir?: string;
}

// LLM 응답을 파싱하기 위한 내부 스키마. ReceiptItem 과 같지만 server 가
// 검증/보정한다 (clamp, fallback).
const LlmExtraction = z.object({
  items: z.array(
    z.object({
      name: z.string().min(1),
      unitPrice: z.number().int().nonnegative().nullable(),
      quantity: z.number().int().positive().nullable(),
      amount: z.number().int().nonnegative(),
      category: z.enum(['ALCOHOL', 'NON_ALCOHOL', 'SIDE', 'UNCATEGORIZED']),
      matchedMenuName: z.string().nullable(),
    }),
  ),
  totalAmount: z.number().int().nonnegative().nullable(),
});

export class SettlementExtractionService {
  private readonly storageDir: string;

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly opts: SettlementExtractionServiceOptions = {},
  ) {
    this.storageDir = opts.storageDir ?? join(process.cwd(), 'data', 'receipts');
  }

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  // 업로드된 buffer 를 JPEG 로 정규화 + 다운스케일 후 디스크에 저장한다.
  // path traversal 방지를 위해 token 은 server 가 발급 (클라이언트 입력 X).
  async storeImage(buffer: Buffer): Promise<UploadReceiptResultType> {
    // 이미지 디코딩 자체가 실패하면 invalid_image — 첨부가 PDF 같은 다른 포맷
    // 일 때 여기서 걸린다.
    let processed: Buffer;
    try {
      processed = await sharp(buffer, { failOn: 'none' })
        .rotate() // EXIF 방향 정규화
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } catch (e) {
      this.log?.warn(
        { error: e instanceof Error ? e.message : String(e) },
        '[settlement-extraction] image decode failed',
      );
      throw new SettlementExtractionError('invalid_image', '이미지를 읽을 수 없습니다.');
    }

    await mkdir(this.storageDir, { recursive: true });
    const token = randomUUID();
    const path = join(this.storageDir, `${token}.jpg`);
    await writeFile(path, processed);

    return {
      imageToken: token,
      previewUrl: `/api/v1/settlement-extraction/preview/${token}`,
      byteSize: processed.byteLength,
    };
  }

  // 토큰을 검증하고 디스크에서 원본 바이트를 읽는다. 미리보기 라우트와
  // 추출 라우트가 같이 쓴다.
  async readImage(token: string): Promise<Buffer> {
    if (!IMAGE_TOKEN_PATTERN.test(token)) {
      throw new SettlementExtractionError('invalid_token', '토큰 형식이 올바르지 않습니다.');
    }
    const path = join(this.storageDir, `${token}.jpg`);
    try {
      await stat(path);
    } catch {
      throw new SettlementExtractionError('image_not_found', '이미지를 찾을 수 없습니다.');
    }
    return readFile(path);
  }

  // 영수증 추출 메인. menuHints 는 호출자(라우트) 가 RestaurantService 에서
  // 가져와 주입 — 모듈 간 결합을 줄이려 여기서는 받기만 한다.
  async extract(input: {
    imageToken: string;
    restaurantName: string;
    menuNames: string[];
  }): Promise<ExtractReceiptResultType> {
    const buffer = await this.readImage(input.imageToken);

    const resolved = await this.resolveProvider();
    if (!resolved) {
      throw new SettlementExtractionError(
        'no_provider',
        'image 용도의 LLM 이 설정되지 않았습니다. 관리자 페이지에서 추가해주세요.',
      );
    }
    const { provider, model } = resolved;

    const base64 = buffer.toString('base64');
    const userPrompt = buildExtractionUserPrompt({
      restaurantName: input.restaurantName,
      menuNames: input.menuNames,
    });

    const startedAt = Date.now();
    let rawText: string;
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), VISION_TIMEOUT_MS);
      try {
        const res = await provider.complete({
          prompt: userPrompt,
          systemPrompt: EXTRACTION_SYSTEM_PROMPT,
          model,
          images: [base64],
          temperature: VISION_TEMPERATURE,
          maxTokens: VISION_MAX_TOKENS,
          numCtx: VISION_NUM_CTX,
          format: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
          signal: ac.signal,
        });
        rawText = res.text;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      const { error, message } = classifyError(e);
      this.log?.warn(
        { error, message: message.slice(0, 200), model, version: EXTRACTION_VERSION },
        '[settlement-extraction] LLM failed',
      );
      throw new SettlementExtractionError('llm_failed', `${error}: ${message}`);
    }

    // structured output 이라도 파서 견고성을 위해 첫 JSON 블록만 잘라 시도.
    const jsonText = extractFirstJsonObject(rawText) ?? rawText.trim();
    let parsed: z.infer<typeof LlmExtraction>;
    try {
      const candidate: unknown = JSON.parse(jsonText);
      parsed = LlmExtraction.parse(candidate);
    } catch (e) {
      this.log?.warn(
        { error: e instanceof Error ? e.message : String(e), preview: rawText.slice(0, 200) },
        '[settlement-extraction] LLM response parse failed',
      );
      throw new SettlementExtractionError('llm_failed', 'LLM 응답을 해석하지 못했습니다.');
    }

    const items: ReceiptItemType[] = parsed.items.map((it) => {
      // amount fallback: server 는 LLM 이 amount=0 으로 줬을 때 unitPrice*qty 로
      // 보정 시도. 그래도 0 이면 0 유지.
      let amount = it.amount;
      if (amount === 0 && it.unitPrice != null && it.quantity != null) {
        amount = it.unitPrice * it.quantity;
      }
      return ReceiptItem.parse({
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        amount,
        category: it.category,
        matchedMenuName: it.matchedMenuName,
      });
    });

    const itemsSubtotal = items.reduce((sum, it) => sum + it.amount, 0);
    const totalAmount = parsed.totalAmount;
    const warning =
      totalAmount != null && Math.abs(itemsSubtotal - totalAmount) >= 1
        ? `항목 합계(${itemsSubtotal.toLocaleString('ko-KR')}원) 와 영수증 총액(${totalAmount.toLocaleString('ko-KR')}원) 이 일치하지 않습니다. 확인해 주세요.`
        : null;

    this.log?.info(
      {
        token: input.imageToken,
        itemCount: items.length,
        itemsSubtotal,
        totalAmount,
        model,
        durationMs: Date.now() - startedAt,
        version: EXTRACTION_VERSION,
      },
      '[settlement-extraction] done',
    );

    return {
      items,
      totalAmount,
      itemsSubtotal,
      warning,
      model,
    };
  }

  private async resolveProvider(): Promise<{ provider: LLMProvider; model: string } | null> {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'image');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    return { provider, model };
  }
}

// 토큰 검증 — 라우트에서 사용. SHA1 등은 쓰지 않고 단순 정규식.
export const isValidImageToken = (token: string): boolean =>
  IMAGE_TOKEN_PATTERN.test(token);

// 디버깅 편의 — image 토큰의 짧은 해시(로그 핸들). 같은 토큰을 다른 로그에
// 묶어 보고 싶을 때 사용. 토큰 자체는 길어 로그 가독성을 해친다.
export const imageTokenHandle = (token: string): string =>
  createHash('sha1').update(token).digest('hex').slice(0, 8);
