import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import {
  ReceiptItem,
  matchDrinkKind,
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
  // 추출 디버그 덤프 디렉터리. 기본은 process.cwd()/data/extraction-debug.
  // EXTRACTION_DEBUG 환경변수가 켜졌을 때만 쓰인다.
  debugDir?: string;
}

// 측정용 디버그 덤프 스위치. 정확도를 정량화하려면 raw LLM 응답을 모아야 하는데
// 프로덕션 로그를 더럽히지 않도록 env 로만 켠다. 호출 시점에 읽어 테스트/스크립트
// 에서 토글 가능. `pnpm --filter friendly eval:extraction` 으로 집계.
const extractionDebugEnabled = (): boolean =>
  process.env.EXTRACTION_DEBUG === '1' || process.env.EXTRACTION_DEBUG === 'true';

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

  // 측정용 best-effort 덤프 — EXTRACTION_DEBUG 켜졌을 때만, 절대 throw 하지
  // 않는다(추출 흐름을 막으면 안 됨). 성공/파싱실패/LLM실패 세 단계 모두에서
  // 호출해 실패율까지 모을 수 있게 한다. token 으로 data/receipts/<token>.jpg
  // 원본과 짝지어 눈으로 대조 가능.
  private async dumpDebug(record: {
    phase: 'success' | 'parse_error' | 'llm_error';
    token: string;
    model: string | null;
    restaurantName: string;
    menuNamesCount: number;
    roundHint?: { index: number; total: number };
    split?: { count: number; index: number };
    userPrompt?: string;
    rawText?: string;
    jsonText?: string;
    parseError?: string;
    llmError?: string;
    result?: ExtractReceiptResultType;
    // 술 종류 사전이 LLM 카테고리를 덮어쓴 항목 수 — 보정 빈도 측정용.
    categoryCorrections?: number;
    durationMs: number;
  }): Promise<void> {
    if (!extractionDebugEnabled()) return;
    try {
      const dir = this.opts.debugDir ?? join(process.cwd(), 'data', 'extraction-debug');
      await mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = join(dir, `${stamp}__${record.phase}__${record.token}.json`);
      await writeFile(
        file,
        JSON.stringify({ version: EXTRACTION_VERSION, ...record }, null, 2),
        'utf8',
      );
      this.log?.info({ file }, '[settlement-extraction] debug dump written');
    } catch (e) {
      this.log?.warn(
        { error: e instanceof Error ? e.message : String(e) },
        '[settlement-extraction] debug dump failed',
      );
    }
  }

  // sharp 로 JPEG 정규화 + 다운스케일. 디코드 실패 시 throw (호출자가 처리).
  private async normalizeToJpeg(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer, { failOn: 'none' })
      .rotate() // EXIF 방향 정규화
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  }

  // 업로드된 buffer 를 JPEG 로 정규화 + 다운스케일 후 디스크에 저장한다.
  // path traversal 방지를 위해 token 은 server 가 발급 (클라이언트 입력 X).
  async storeImage(buffer: Buffer): Promise<UploadReceiptResultType> {
    let processed: Buffer;
    try {
      processed = await this.normalizeToJpeg(buffer);
    } catch (e) {
      // sharp 가 못 읽는 경우 — 아이폰 앨범 원본 HEIC(HEVC) 가 대표적. sharp
      // prebuilt 에는 HEVC 디코더(libde265)가 없어 디코드 불가. HEIF 컨테이너로
      // 보이면 heic-convert(libheif JS)로 JPEG 변환 후 재시도. (AVIF 는 sharp 가
      // 위에서 이미 처리하므로 여기 안 온다. PDF 등은 ftyp 가 아니라 바로 거부.)
      if (looksLikeHeif(buffer)) {
        try {
          const jpegArrayBuf = await heicConvert({
            buffer,
            format: 'JPEG',
            quality: 0.92,
          });
          processed = await this.normalizeToJpeg(Buffer.from(jpegArrayBuf));
        } catch (heicErr) {
          this.log?.warn(
            { error: heicErr instanceof Error ? heicErr.message : String(heicErr) },
            '[settlement-extraction] HEIC convert failed',
          );
          throw new SettlementExtractionError('invalid_image', '이미지를 읽을 수 없습니다.');
        }
      } else {
        this.log?.warn(
          { error: e instanceof Error ? e.message : String(e) },
          '[settlement-extraction] image decode failed',
        );
        throw new SettlementExtractionError('invalid_image', '이미지를 읽을 수 없습니다.');
      }
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

  // 한 이미지 안에 영수증이 가로로 N장 나란히 있을 때 사용자가 입력한 분할
  // 정보로 해당 영역만 잘라낸다. 가로 N등분이라 X 축만 다룬다.
  // count=1 이거나 split 미지정이면 원본 그대로 반환.
  private async cropForSplit(
    buffer: Buffer,
    split: { count: number; index: number } | undefined,
  ): Promise<Buffer> {
    if (!split || split.count <= 1) return buffer;
    const image = sharp(buffer, { failOn: 'none' });
    const meta = await image.metadata();
    const totalWidth = meta.width;
    const height = meta.height;
    if (!totalWidth || !height) {
      // metadata 가 비어 있으면 잘라낼 수 없다 — 그냥 원본을 LLM 에 넘긴다.
      this.log?.warn(
        { width: totalWidth, height },
        '[settlement-extraction] split skipped — missing metadata',
      );
      return buffer;
    }
    // floor 로 영역 폭을 잡고 마지막 슬롯은 남은 픽셀까지 흡수해 누락 없게.
    const sliceWidth = Math.floor(totalWidth / split.count);
    const left = sliceWidth * (split.index - 1);
    const width =
      split.index === split.count ? totalWidth - left : sliceWidth;
    if (width <= 0) {
      this.log?.warn(
        { left, width, totalWidth, split },
        '[settlement-extraction] split produced empty region — using full image',
      );
      return buffer;
    }
    return sharp(buffer, { failOn: 'none' })
      .extract({ left, top: 0, width, height })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  }

  // 영수증 추출 메인. menuHints 는 호출자(라우트) 가 RestaurantService 에서
  // 가져와 주입 — 모듈 간 결합을 줄이려 여기서는 받기만 한다.
  async extract(input: {
    imageToken: string;
    restaurantName: string;
    menuNames: string[];
    // 차수(N차 회식) 컨텍스트 — 사용자가 '2차 영수증' 임을 명시할 때만 전달.
    // 1-based, total<=1 이면 LLM 프롬프트에서 차수 라인을 출력하지 않는다.
    roundHint?: { index: number; total: number };
    // 한 사진에 영수증이 가로로 여러 장 있을 때 분할 영역. 1-based.
    split?: { count: number; index: number };
  }): Promise<ExtractReceiptResultType> {
    const original = await this.readImage(input.imageToken);
    const buffer = await this.cropForSplit(original, input.split);

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
      roundHint: input.roundHint,
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
      await this.dumpDebug({
        phase: 'llm_error',
        token: input.imageToken,
        model,
        restaurantName: input.restaurantName,
        menuNamesCount: input.menuNames.length,
        roundHint: input.roundHint,
        split: input.split,
        userPrompt,
        llmError: `${error}: ${message}`,
        durationMs: Date.now() - startedAt,
      });
      throw new SettlementExtractionError('llm_failed', `${error}: ${message}`);
    }

    // structured output 이라도 파서 견고성을 위해 첫 JSON 블록만 잘라 시도.
    const jsonText = extractFirstJsonObject(rawText) ?? rawText.trim();
    let parsed: z.infer<typeof LlmExtraction>;
    try {
      const candidate: unknown = JSON.parse(jsonText);
      parsed = LlmExtraction.parse(candidate);
    } catch (e) {
      const parseError = e instanceof Error ? e.message : String(e);
      this.log?.warn(
        { error: parseError, preview: rawText.slice(0, 200) },
        '[settlement-extraction] LLM response parse failed',
      );
      await this.dumpDebug({
        phase: 'parse_error',
        token: input.imageToken,
        model,
        restaurantName: input.restaurantName,
        menuNamesCount: input.menuNames.length,
        roundHint: input.roundHint,
        split: input.split,
        userPrompt,
        rawText,
        jsonText,
        parseError,
        durationMs: Date.now() - startedAt,
      });
      throw new SettlementExtractionError('llm_failed', 'LLM 응답을 해석하지 못했습니다.');
    }

    let categoryCorrections = 0;
    const items: ReceiptItemType[] = parsed.items.map((it) => {
      // amount fallback: server 는 LLM 이 amount=0 으로 줬을 때 unitPrice*qty 로
      // 보정 시도. 그래도 0 이면 0 유지.
      let amount = it.amount;
      if (amount === 0 && it.unitPrice != null && it.quantity != null) {
        amount = it.unitPrice * it.quantity;
      }
      // 카테고리 사전 보정: '새로/대선' 같은 국내 주류 제품명을 vision 모델이
      // 안주/미분류로 찍는 오류를 결정적으로 교정. 프롬프트 힌트(v4)의 이중
      // 안전망 — 어드민에서 모델을 바꿔도 동작이 보장된다.
      const kind = matchDrinkKind([it.matchedMenuName, it.name]);
      const category = kind?.category ?? it.category;
      if (category !== it.category) categoryCorrections++;
      return ReceiptItem.parse({
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        amount,
        category,
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
        categoryCorrections,
        model,
        durationMs: Date.now() - startedAt,
        version: EXTRACTION_VERSION,
        split: input.split,
      },
      '[settlement-extraction] done',
    );

    const result: ExtractReceiptResultType = {
      items,
      totalAmount,
      itemsSubtotal,
      warning,
      model,
    };

    await this.dumpDebug({
      phase: 'success',
      token: input.imageToken,
      model,
      restaurantName: input.restaurantName,
      menuNamesCount: input.menuNames.length,
      roundHint: input.roundHint,
      split: input.split,
      userPrompt,
      rawText,
      jsonText,
      result,
      categoryCorrections,
      durationMs: Date.now() - startedAt,
    });

    return result;
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

// ISOBMFF(HEIF/HEIC/AVIF) 컨테이너인지 — 박스 4..8 바이트가 'ftyp' 인지로
// 판별. heic-convert 를 임의 바이트(PDF 등)에 돌리지 않기 위한 싼 게이트.
// 정확한 brand 구분은 하지 않는다 (sharp 가 못 읽고 ftyp 면 변환 시도가 안전).
const looksLikeHeif = (buf: Buffer): boolean =>
  buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp';

// 토큰 검증 — 라우트에서 사용. SHA1 등은 쓰지 않고 단순 정규식.
export const isValidImageToken = (token: string): boolean =>
  IMAGE_TOKEN_PATTERN.test(token);

// 디버깅 편의 — image 토큰의 짧은 해시(로그 핸들). 같은 토큰을 다른 로그에
// 묶어 보고 싶을 때 사용. 토큰 자체는 길어 로그 가독성을 해친다.
export const imageTokenHandle = (token: string): string =>
  createHash('sha1').update(token).digest('hex').slice(0, 8);
