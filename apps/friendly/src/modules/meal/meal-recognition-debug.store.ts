import { createHmac, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 인식 원문에는 사진에서 읽은 음식명·메모가 있을 수 있다. 따라서 디버그 스위치를
// 켜도 기본은 모델/성공 여부/해시된 식별자만 남기고, 원문은 별도 스위를 더 켜야 한다.
// 운영에서는 실수로 RAW=1을 켜는 것만으로는 원문을 저장하지 않고 명시적 이중 확인을 요구한다.

export const MEAL_RECOGNITION_DEBUG_TTL_HOURS = 7 * 24;
const DEBUG_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}T[^/]+__[a-z_]+__[a-f0-9]{12}__[a-f0-9-]{36}\.json$/;
// 기존 덤프는 파일명·JSON에 사진 토큰을 원문으로 남겼다. 새 정책을 적용하는 즉시
// 유효 기간과 무관하게 지워 과거 형식이 보존 정책을 우회하지 않게 한다.
const LEGACY_DEBUG_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}T[^/]+__[a-z_]+__[a-f0-9]{8}-[a-f0-9-]{27}\.json$/;
const MAX_RAW_TEXT_CHARS = 8_000;
const MAX_ERROR_CHARS = 1_000;

const truthy = (value: string | undefined): boolean => value === '1' || value === 'true';

const configuredTtlHours = (): number => {
  const value = Number(process.env.MEAL_RECOGNITION_DEBUG_TTL_HOURS);
  if (!Number.isFinite(value) || value <= 0) return MEAL_RECOGNITION_DEBUG_TTL_HOURS;
  // 실수로 반영구 보존하지 않도록 30일을 상한으로 둔다.
  return Math.min(30 * 24, Math.max(1, Math.floor(value)));
};

const defaultDebugDir = (): string =>
  process.env.NODE_ENV === 'test'
    ? join(tmpdir(), 'lifepickr-test-meal-recognition-debug')
    : join(process.cwd(), 'data', 'meal-recognition-debug');

export interface MealRecognitionDebugStoreOptions {
  dir?: string;
  ttlHours?: number;
  now?: () => Date;
  enabled?: boolean;
  rawEnabled?: boolean;
  // 테스트 결과를 결정적으로 만들기 위한 주입점. 운영 기본은 JWT_SECRET HMAC.
  hashSecret?: string;
}

export interface MealRecognitionDebugRecord {
  version: number;
  phase: 'success' | 'parse_error' | 'llm_error';
  model: string | null;
  userId: string;
  photoTokens: string[];
  rawText?: string;
  dishes?: unknown;
  error?: string;
}

interface StoredMealRecognitionDebugRecord {
  version: number;
  createdAt: string;
  phase: MealRecognitionDebugRecord['phase'];
  model: string | null;
  userHash: string;
  photoTokenHashes: string[];
  rawIncluded: boolean;
  rawText?: string;
  dishes?: unknown;
  error?: string;
}

export class MealRecognitionDebugStore {
  private readonly dir: string;
  private readonly ttlHours: number;
  private readonly now: () => Date;
  private readonly enabled: boolean;
  private readonly rawEnabled: boolean;
  private readonly hashSecret: string;

  constructor(opts: MealRecognitionDebugStoreOptions = {}) {
    this.dir = opts.dir ?? defaultDebugDir();
    this.ttlHours = Math.max(1, opts.ttlHours ?? configuredTtlHours());
    this.now = opts.now ?? (() => new Date());
    this.enabled = opts.enabled ?? truthy(process.env.MEAL_RECOGNITION_DEBUG);
    const configuredRaw =
      truthy(process.env.MEAL_RECOGNITION_DEBUG_RAW) &&
      (process.env.NODE_ENV !== 'production' || truthy(process.env.MEAL_RECOGNITION_DEBUG_ALLOW_PRODUCTION_RAW));
    this.rawEnabled = this.enabled && (opts.rawEnabled ?? configuredRaw);
    this.hashSecret = opts.hashSecret ?? (process.env.JWT_SECRET?.trim() || 'meal-recognition-debug-local-only');
  }

  hashIdentifier(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }

  async write(record: MealRecognitionDebugRecord): Promise<void> {
    if (!this.enabled) return;
    await mkdir(this.dir, { recursive: true });
    // 쓰기 시점에도 TTL을 적용해 cron이 뒤늦게 돌아도 오래된 덤프가 누적되지 않게 한다.
    await this.sweepExpired();

    const createdAt = this.now();
    const tokenHashes = record.photoTokens.map((token) => this.hashIdentifier(token));
    const stored: StoredMealRecognitionDebugRecord = {
      version: record.version,
      createdAt: createdAt.toISOString(),
      phase: record.phase,
      model: record.model,
      userHash: this.hashIdentifier(record.userId),
      photoTokenHashes: tokenHashes,
      rawIncluded: this.rawEnabled,
    };
    if (this.rawEnabled) {
      if (record.rawText !== undefined) {
        stored.rawText = this.redactTokens(record.rawText.slice(0, MAX_RAW_TEXT_CHARS), record.photoTokens);
      }
      if (record.dishes !== undefined) stored.dishes = this.redactUnknown(record.dishes, record.photoTokens);
      if (record.error !== undefined) {
        stored.error = this.redactTokens(record.error.slice(0, MAX_ERROR_CHARS), record.photoTokens);
      }
    }

    const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
    const firstHash = tokenHashes[0]?.slice(0, 12) ?? '000000000000';
    const name = `${stamp}__${record.phase}__${firstHash}__${randomUUID()}.json`;
    await writeFile(join(this.dir, name), JSON.stringify(stored, null, 2), { encoding: 'utf8', flag: 'wx' });
  }

  async sweepExpired(): Promise<number> {
    const files = await this.listFiles();
    const cutoff = this.now().getTime() - this.ttlHours * 3_600_000;
    let removed = 0;
    for (const file of files) {
      const path = join(this.dir, file);
      try {
        const info = await lstat(path);
        if (!info.isFile() || (!LEGACY_DEBUG_FILE_PATTERN.test(file) && info.mtimeMs >= cutoff)) continue;
        await rm(path, { force: true });
        removed += 1;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return removed;
  }

  async purgeForUser(userId: string, legacyPhotoTokens: string[] = []): Promise<number> {
    const targetHash = this.hashIdentifier(userId);
    const legacyTokens = new Set(legacyPhotoTokens);
    const files = await this.listFiles();
    let removed = 0;
    for (const file of files) {
      const path = join(this.dir, file);
      try {
        const json: unknown = JSON.parse(await readFile(path, 'utf8'));
        if (typeof json !== 'object' || json === null) continue;
        const saved = json as { userHash?: unknown; photoTokens?: unknown };
        const legacyOwned =
          Array.isArray(saved.photoTokens) &&
          saved.photoTokens.some((token) => typeof token === 'string' && legacyTokens.has(token));
        if (saved.userHash !== targetHash && !legacyOwned) {
          continue;
        }
        await rm(path, { force: true });
        removed += 1;
      } catch (error) {
        // 손상된 덤프는 사용자 소유자를 안전하게 판단할 수 없으므로 TTL 정리에 맡긴다.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
    }
    return removed;
  }

  private async listFiles(): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(this.dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    // 정해진 이름의 직계 JSON 파일만 취급하고 심볼릭 링크는 따라가지 않는다.
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          (DEBUG_FILE_PATTERN.test(entry.name) || LEGACY_DEBUG_FILE_PATTERN.test(entry.name)),
      )
      .map((entry) => entry.name);
  }

  private redactTokens(value: string, tokens: string[]): string {
    let redacted = value;
    for (const token of tokens) {
      redacted = redacted.replaceAll(token, `[photo-token:${this.hashIdentifier(token).slice(0, 12)}]`);
    }
    return redacted;
  }

  private redactUnknown(value: unknown, tokens: string[]): unknown {
    try {
      return JSON.parse(this.redactTokens(JSON.stringify(value), tokens));
    } catch {
      return { redacted: true };
    }
  }
}

export const sweepMealRecognitionDebugDumps = async (
  opts: MealRecognitionDebugStoreOptions = {},
): Promise<number> => new MealRecognitionDebugStore(opts).sweepExpired();

export const purgeMealRecognitionDebugDumpsForUser = async (
  userId: string,
  legacyPhotoTokens: string[] = [],
  opts: MealRecognitionDebugStoreOptions = {},
): Promise<number> => new MealRecognitionDebugStore(opts).purgeForUser(userId, legacyPhotoTokens);
