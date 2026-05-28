import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  SettlementExtractionError,
  SettlementExtractionService,
  isValidImageToken,
} from './settlement-extraction.service.js';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';

// 작은 in-memory JPEG 를 만들어 sharp 로 처리되는지 검증한다 — sharp 가
// 실패할 수 있는 환경(예: 컨테이너) 에서 빨리 잡으려고 일부러 호출.
const makeTestJpeg = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();

// split 테스트용 — 가로로 긴 더미 이미지(여러 영수증 나란히 있는 흉내).
// 300x100 이면 count=3 시 가로 100 짜리 슬롯 3개로 깔끔하게 나뉘어
// 테스트 단언이 명확하다.
const makeWideTestJpeg = async (
  width: number,
  height: number,
): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();

// vision LLM 응답을 흉내내는 fake provider. 호출 인자는 calls 에 저장.
class FakeVisionProvider implements LLMProvider {
  calls: Array<{ prompt: string; systemPrompt?: string; images?: string[]; model: string }> = [];
  next: ((opts: { prompt: string; model: string }) => Promise<string>) | null = null;

  async complete(opts: {
    prompt: string;
    systemPrompt?: string;
    images?: string[];
    model: string;
  }): Promise<{
    text: string;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
  }> {
    this.calls.push({
      prompt: opts.prompt,
      systemPrompt: opts.systemPrompt,
      images: opts.images,
      model: opts.model,
    });
    const text = this.next
      ? await this.next({ prompt: opts.prompt, model: opts.model })
      : JSON.stringify({ items: [], totalAmount: null });
    return { text, model: opts.model, promptTokens: null, completionTokens: null };
  }
}

const buildService = (provider: FakeVisionProvider) => {
  const storageDir = mkdtempSync(join(tmpdir(), 'settlement-extraction-test-'));
  const service = new SettlementExtractionService(
    // aiConfig 는 resolveOverride 로 대체하니 stub 으로 충분.
    { getResolved: vi.fn() } as never,
    {
      storageDir,
      resolveOverride: async () => ({ provider, model: 'fake-vision:latest' }),
    },
  );
  return { service, storageDir };
};

describe('isValidImageToken', () => {
  it('accepts well-formed uuid v4 strings', () => {
    expect(isValidImageToken('11111111-2222-3333-4444-555555555555')).toBe(true);
  });

  it('rejects path traversal attempts', () => {
    expect(isValidImageToken('../etc/passwd')).toBe(false);
    expect(isValidImageToken('foo/bar')).toBe(false);
    expect(isValidImageToken('')).toBe(false);
  });
});

describe('SettlementExtractionService.storeImage', () => {
  it('saves a re-encoded JPEG and returns a token + preview URL', async () => {
    const { service, storageDir } = buildService(new FakeVisionProvider());
    const buf = await makeTestJpeg();
    const out = await service.storeImage(buf);
    expect(out.imageToken).toMatch(/^[a-f0-9-]{36}$/);
    expect(out.previewUrl).toContain(out.imageToken);
    expect(out.byteSize).toBeGreaterThan(0);
    const files = readdirSync(storageDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(`${out.imageToken}.jpg`);
  });

  it('throws invalid_image when buffer is not a decodable image', async () => {
    const { service } = buildService(new FakeVisionProvider());
    await expect(service.storeImage(Buffer.from('not-an-image'))).rejects.toMatchObject({
      code: 'invalid_image',
    });
  });

  // 아이폰 앨범 원본 HEIC(HEVC) — sharp prebuilt 는 HEVC 디코더가 없어 픽셀
  // 디코드에 실패한다. heic-convert 폴백이 JPEG 로 변환해 저장돼야 한다.
  it('converts HEIC (HEVC) via fallback and stores a JPEG', async () => {
    const { service, storageDir } = buildService(new FakeVisionProvider());
    const here = dirname(fileURLToPath(import.meta.url));
    const heic = readFileSync(join(here, '__fixtures__', 'sample.heic'));
    const out = await service.storeImage(heic);
    expect(out.imageToken).toMatch(/^[a-f0-9-]{36}$/);
    const files = readdirSync(storageDir);
    expect(files).toEqual([`${out.imageToken}.jpg`]);
    // 저장된 파일이 실제 디코드 가능한 JPEG 인지 확인.
    const stored = await service.readImage(out.imageToken);
    expect((await sharp(stored).metadata()).format).toBe('jpeg');
  });
});

describe('SettlementExtractionService.readImage', () => {
  it('returns the stored buffer for a valid token', async () => {
    const { service } = buildService(new FakeVisionProvider());
    const buf = await makeTestJpeg();
    const stored = await service.storeImage(buf);
    const read = await service.readImage(stored.imageToken);
    expect(read.byteLength).toBe(stored.byteSize);
  });

  it('rejects path-traversal tokens with invalid_token before touching disk', async () => {
    const { service } = buildService(new FakeVisionProvider());
    await expect(service.readImage('../../etc/passwd')).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('throws image_not_found for unknown but well-formed tokens', async () => {
    const { service } = buildService(new FakeVisionProvider());
    await expect(
      service.readImage('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'image_not_found' });
  });
});

describe('SettlementExtractionService.extract', () => {
  let provider: FakeVisionProvider;
  let service: SettlementExtractionService;
  let imageToken: string;

  beforeEach(async () => {
    provider = new FakeVisionProvider();
    const built = buildService(provider);
    service = built.service;
    const stored = await service.storeImage(await makeTestJpeg());
    imageToken = stored.imageToken;
  });

  it('forwards menu hints and image to the vision provider', async () => {
    provider.next = async () =>
      JSON.stringify({
        items: [
          {
            name: '카스 500ml',
            unitPrice: 5000,
            quantity: 2,
            amount: 10000,
            category: 'ALCOHOL',
            matchedMenuName: null,
          },
        ],
        totalAmount: 10000,
      });
    const out = await service.extract({
      imageToken,
      restaurantName: '테스트 식당',
      menuNames: ['카스 500ml', '치킨'],
    });
    expect(provider.calls).toHaveLength(1);
    const call = provider.calls[0]!;
    expect(call.prompt).toContain('테스트 식당');
    expect(call.prompt).toContain('카스 500ml');
    expect(call.images).toHaveLength(1);
    expect(call.images![0]!.length).toBeGreaterThan(0);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      name: '카스 500ml',
      amount: 10000,
      category: 'ALCOHOL',
    });
    expect(out.itemsSubtotal).toBe(10000);
    expect(out.warning).toBeNull();
  });

  it('warns when items subtotal does not match totalAmount', async () => {
    provider.next = async () =>
      JSON.stringify({
        items: [
          {
            name: '치킨',
            unitPrice: 20000,
            quantity: 1,
            amount: 20000,
            category: 'SIDE',
            matchedMenuName: '치킨',
          },
        ],
        totalAmount: 25000,
      });
    const out = await service.extract({
      imageToken,
      restaurantName: '치킨집',
      menuNames: ['치킨'],
    });
    expect(out.warning).not.toBeNull();
    expect(out.warning).toContain('일치하지');
  });

  it('fills amount fallback from unitPrice * quantity when LLM returns 0', async () => {
    provider.next = async () =>
      JSON.stringify({
        items: [
          {
            name: '소주',
            unitPrice: 4000,
            quantity: 3,
            amount: 0,
            category: 'ALCOHOL',
            matchedMenuName: null,
          },
        ],
        totalAmount: 12000,
      });
    const out = await service.extract({
      imageToken,
      restaurantName: 'x',
      menuNames: [],
    });
    expect(out.items[0]!.amount).toBe(12000);
    expect(out.itemsSubtotal).toBe(12000);
  });

  it('throws llm_failed when the response is not valid JSON', async () => {
    provider.next = async () => 'not a json at all';
    await expect(
      service.extract({ imageToken, restaurantName: 'x', menuNames: [] }),
    ).rejects.toMatchObject({ code: 'llm_failed' });
  });

  it('crops the left N-th slice when split is provided (count=3, index=1/2/3)', async () => {
    const built = buildService(provider);
    // 300x100 wide image — count=3 면 각 슬롯 100x100.
    const stored = await built.service.storeImage(await makeWideTestJpeg(300, 100));
    provider.next = async () =>
      JSON.stringify({ items: [], totalAmount: null });

    await built.service.extract({
      imageToken: stored.imageToken,
      restaurantName: 'x',
      menuNames: [],
      split: { count: 3, index: 1 },
    });
    await built.service.extract({
      imageToken: stored.imageToken,
      restaurantName: 'x',
      menuNames: [],
      split: { count: 3, index: 3 },
    });
    expect(provider.calls).toHaveLength(2);
    const widths = await Promise.all(
      provider.calls.map(async (c) => {
        const buf = Buffer.from(c.images![0]!, 'base64');
        return (await sharp(buf).metadata()).width;
      }),
    );
    expect(widths).toEqual([100, 100]);
  });

  it('passes the full image when split is omitted', async () => {
    const built = buildService(provider);
    const stored = await built.service.storeImage(await makeWideTestJpeg(300, 100));
    provider.next = async () =>
      JSON.stringify({ items: [], totalAmount: null });
    await built.service.extract({
      imageToken: stored.imageToken,
      restaurantName: 'x',
      menuNames: [],
    });
    const buf = Buffer.from(provider.calls[0]!.images![0]!, 'base64');
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(300);
  });

  it('throws no_provider when resolveOverride returns null', async () => {
    const built = buildService(provider);
    const noProviderService = new SettlementExtractionService(
      { getResolved: vi.fn() } as never,
      {
        storageDir: (built as unknown as { storageDir: string }).storageDir,
        resolveOverride: async () => null,
      },
    );
    const stored = await noProviderService.storeImage(await makeTestJpeg());
    await expect(
      noProviderService.extract({
        imageToken: stored.imageToken,
        restaurantName: 'x',
        menuNames: [],
      }),
    ).rejects.toBeInstanceOf(SettlementExtractionError);
  });
});
