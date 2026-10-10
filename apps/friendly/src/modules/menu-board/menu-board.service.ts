import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  MenuBoardEvalReport,
  type MenuBoardEvalReportType,
  type MenuBoardReadResultType,
  type MenuBoardSampleType,
} from '@repo/api-contract';
import { thinkOptionForModel } from '@repo/utils';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { MENU_BOARD_PROMPT, parseMenuBoardItems } from './menu-board.prompt.js';

// 메뉴판 읽기 — 사진 한 장을 비전 LLM(purpose menu-board, 기본 kimi-k3)에 규칙 프롬프트와 함께 한 번 보내 메뉴·가격·설명
// 목록을 받는다. OCR 은 쓰지 않는다 — kimi-k3 는 OCR 글자 힌트가 있든 없든 검수 정답 20장 F1 99.8% 로 같았다
// (2026-10-10, docs/menu-board-ocr-probe.md).

// 모델에 넘기는 사진 — 긴 변을 2,000px 로 맞춘 JPEG(품질 90). 큰 사진은 줄이고 작은 사진은 키운다: kimi-k3 는 사진
// 해상도만큼 토큰을 써서, 작은 손글씨 메뉴판(420×596)을 키워 넘기면 '논알콜맥주' 를 '늦안콜백주' 로 읽던 오독이
// 사라졌다(검수 20장 F1 99.5% → 99.8%, 그 사진 입력 토큰 약 740 → 4,240).
export const MENU_BOARD_IMAGE_SIDE = 2000;

// 수집 샘플(collect:menu-boards, git 제외)·검수 정답(커밋)·회귀 평가 리포트 위치.
export const MENU_BOARDS_DIR = resolve(process.cwd(), 'data', 'menu-boards');
export const MENU_BOARD_GOLDEN_DIR = resolve(process.cwd(), 'golden', 'menu-boards');
export const MENU_BOARD_EVAL_REPORT_PATH = join(MENU_BOARDS_DIR, 'eval-report.json');

// 샘플 사진 키 — '<shopRef>__board-N'. 경로 조립 전에 이 모양만 받는다.
export const MENU_BOARD_SAMPLE_KEY = /^([A-Za-z0-9_-]+)__(board-\d+)$/;
const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export type MenuBoardErrorCode = 'invalid_image' | 'no_provider' | 'llm_failed' | 'parse_failed';

export class MenuBoardError extends Error {
  constructor(
    readonly code: MenuBoardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MenuBoardError';
  }
}

export interface PreparedMenuBoardImage {
  jpeg: Buffer;
  width: number;
  height: number;
}

// EXIF 방향을 바로잡고 긴 변을 2,000px 로 맞춘다. 투명 배경은 흰색으로.
export const prepareMenuBoardImage = async (buffer: Buffer): Promise<PreparedMenuBoardImage> => {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize({ width: MENU_BOARD_IMAGE_SIDE, height: MENU_BOARD_IMAGE_SIDE, fit: 'inside' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch {
    throw new MenuBoardError('invalid_image', '사진을 읽을 수 없습니다(JPEG·PNG·WebP).');
  }
};

export interface MenuBoardServiceDeps {
  cache?: AdapterCache;
}

export class MenuBoardService {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly deps: MenuBoardServiceDeps = {},
  ) {}

  // model 을 주면 용도 기본 모델 대신 그 모델로(평가 스크립트의 모델 비교용).
  async read(buffer: Buffer, opts: { model?: string } = {}): Promise<MenuBoardReadResultType> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'menu-board');
    const model = (opts.model ?? resolved?.defaultModel ?? '').trim();
    if (!resolved || !model) {
      throw new MenuBoardError('no_provider', '메뉴판 읽기(menu-board) 모델이나 ollama-cloud 키가 설정되지 않았습니다.');
    }
    const image = await prepareMenuBoardImage(buffer);
    const provider = (this.deps.cache ?? adapterCache).get(resolved);
    const startedAt = Date.now();
    let result;
    try {
      result = await provider.complete({
        prompt: MENU_BOARD_PROMPT,
        model,
        images: [image.jpeg.toString('base64')],
        temperature: 0,
        // 생각 모드는 끈다 — 점수는 그대로인데 몇 배 느리고, gemma4 는 가끔 5분 넘게 답하지 않았다.
        think: thinkOptionForModel(model),
      });
    } catch (e) {
      throw new MenuBoardError('llm_failed', `모델 호출 실패: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
    const durationMs = Date.now() - startedAt;
    const items = parseMenuBoardItems(result.text);
    if (!items) {
      throw new MenuBoardError('parse_failed', `응답에서 메뉴 목록(JSON)을 찾지 못했습니다: ${result.text.slice(0, 200)}`);
    }
    return {
      model: result.model || model,
      items,
      durationMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      image: { width: image.width, height: image.height },
      rawText: result.text,
    };
  }
}

// ── 샘플·정답·리포트(파일) ───────────────────────────────────────────────────

interface SampleMeta {
  shopRef: string;
  shopName: string;
  boards: { file: string }[];
}

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch {
    return null;
  }
};

export const menuBoardSampleKey = (shopRef: string, file: string): string =>
  `${shopRef}__${file.slice(0, file.length - extname(file).length)}`;

// collect:menu-boards 가 받아 둔 가게별 메타(meta.json)에서 사진 목록을 만든다. 폴더가 없으면 빈 목록.
export const listMenuBoardSamples = async (
  dir = MENU_BOARDS_DIR,
  goldenDir = MENU_BOARD_GOLDEN_DIR,
): Promise<MenuBoardSampleType[]> => {
  if (!existsSync(dir)) return [];
  const shops = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const samples: MenuBoardSampleType[] = [];
  for (const shop of shops) {
    const meta = await readJson<SampleMeta>(join(dir, shop, 'meta.json'));
    if (!meta) continue;
    for (const board of meta.boards) {
      const key = menuBoardSampleKey(meta.shopRef, board.file);
      if (!MENU_BOARD_SAMPLE_KEY.test(key)) continue;
      samples.push({
        key,
        shopRef: meta.shopRef,
        shopName: meta.shopName,
        file: board.file,
        hasTruth: existsSync(join(goldenDir, `${key}.json`)),
      });
    }
  }
  return samples;
};

// 샘플 사진 원본 — 키 모양이 아니거나 파일이 없으면 null.
export const readMenuBoardSampleImage = async (
  key: string,
  dir = MENU_BOARDS_DIR,
): Promise<{ buffer: Buffer; contentType: string } | null> => {
  const m = MENU_BOARD_SAMPLE_KEY.exec(key);
  if (!m) return null;
  const [, shopRef, stem] = m;
  const shopDir = join(dir, shopRef!);
  if (!existsSync(shopDir)) return null;
  const file = (await readdir(shopDir)).find(
    (name) => name.startsWith(`${stem}.`) && IMAGE_TYPES[extname(name).toLowerCase()],
  );
  if (!file) return null;
  return { buffer: await readFile(join(shopDir, file)), contentType: IMAGE_TYPES[extname(file).toLowerCase()]! };
};

// eval:menu-boards 가 남긴 마지막 회귀 평가 리포트. 없거나 형식이 어긋나면 null.
export const readMenuBoardEvalReport = async (
  path = MENU_BOARD_EVAL_REPORT_PATH,
): Promise<MenuBoardEvalReportType | null> => {
  const parsed = MenuBoardEvalReport.safeParse(await readJson<unknown>(path));
  return parsed.success ? parsed.data : null;
};
