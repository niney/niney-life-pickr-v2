import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import type { UploadMealPhotoResultType } from '@repo/api-contract';
import { Routes } from '@repo/api-contract';

// 식단 사진 저장 — 정산 영수증(settlement-extraction storeImage)의 골격을 이식하되 식단에서
// 달라지는 3가지를 더한다:
//   1) **사용자별 디렉터리** data/meal-photos/<userId>/<token>.jpg — 소유 검증이 경로에도 반영.
//   2) **썸네일** <token>_t.jpg — 목록·달력이 원본(1600px)을 받으면 앱에서 과하다.
//   3) **삭제·고아 정리** — 영수증엔 없던 부분. 식단은 업로드 빈도가 훨씬 높아 누적을 방치할 수 없다.
// EXIF 는 sharp 가 기본적으로 버린다(withMetadata 미사용) — 촬영 GPS 가 서버에 남지 않는다.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 80;
const THUMB_DIMENSION = 320;
const THUMB_QUALITY = 70;
// 기록에 붙지 않은 업로드(사용자가 저장 안 하고 이탈)를 정리하는 기준.
export const ORPHAN_PHOTO_TTL_HOURS = 24;
const TOKEN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// 사용자당 보관 사진 상한 — 초과 업로드는 409(무한 누적 방지).
export const MAX_PHOTOS_PER_USER = 3000;

export class MealPhotoError extends Error {
  constructor(
    readonly code: 'invalid_token' | 'invalid_image' | 'not_found' | 'forbidden' | 'quota',
    message: string,
  ) {
    super(message);
    this.name = 'MealPhotoError';
  }
}

export const isValidMealPhotoToken = (token: string): boolean => TOKEN_PATTERN.test(token);

// HEIF/HEIC 컨테이너 판정 — ftyp 박스의 major brand. 정산 쪽 looksLikeHeif 와 같은 규칙.
const looksLikeHeif = (buf: Buffer): boolean => {
  if (buf.length < 12) return false;
  if (buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buf.toString('ascii', 8, 12).toLowerCase();
  return ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand);
};

export interface MealPhotoServiceOptions {
  storageDir?: string;
  logger?: FastifyBaseLogger;
}

export class MealPhotoService {
  private readonly storageDir: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: MealPhotoServiceOptions = {},
  ) {
    this.storageDir = opts.storageDir ?? join(process.cwd(), 'data', 'meal-photos');
  }

  private get log(): FastifyBaseLogger | null {
    return this.opts.logger ?? null;
  }

  private userDir(userId: string): string {
    // userId 는 cuid(영숫자)라 경로 조각으로 안전하지만 방어적으로 한 번 더 좁힌다.
    const safe = userId.replace(/[^A-Za-z0-9_-]/g, '');
    if (!safe) throw new MealPhotoError('forbidden', '잘못된 사용자입니다.');
    return join(this.storageDir, safe);
  }

  private async normalize(buffer: Buffer, dimension: number, quality: number): Promise<Buffer> {
    return sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: dimension, height: dimension, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  // 업로드 → JPEG 정규화(+HEIC 폴백) → 원본·썸네일 저장 → MealPhoto 행(entryId=null) 생성.
  async store(userId: string, buffer: Buffer): Promise<UploadMealPhotoResultType> {
    const count = await this.prisma.mealPhoto.count({ where: { userId } });
    if (count >= MAX_PHOTOS_PER_USER) {
      throw new MealPhotoError('quota', '저장된 사진이 너무 많습니다. 오래된 기록을 정리해 주세요.');
    }

    let source = buffer;
    let processed: Buffer;
    try {
      processed = await this.normalize(source, MAX_DIMENSION, JPEG_QUALITY);
    } catch (e) {
      if (looksLikeHeif(buffer)) {
        try {
          const jpeg = await heicConvert({ buffer, format: 'JPEG', quality: 0.92 });
          source = Buffer.from(jpeg);
          processed = await this.normalize(source, MAX_DIMENSION, JPEG_QUALITY);
        } catch (heicErr) {
          this.log?.warn(
            { error: heicErr instanceof Error ? heicErr.message : String(heicErr) },
            '[meal-photo] HEIC convert failed',
          );
          throw new MealPhotoError('invalid_image', '이미지를 읽을 수 없습니다.');
        }
      } else {
        this.log?.warn(
          { error: e instanceof Error ? e.message : String(e) },
          '[meal-photo] image decode failed',
        );
        throw new MealPhotoError('invalid_image', '이미지를 읽을 수 없습니다.');
      }
    }

    const meta = await sharp(processed).metadata();
    const thumb = await this.normalize(source, THUMB_DIMENSION, THUMB_QUALITY);

    const dir = this.userDir(userId);
    await mkdir(dir, { recursive: true });
    const token = randomUUID();
    await writeFile(join(dir, `${token}.jpg`), processed);
    await writeFile(join(dir, `${token}_t.jpg`), thumb);

    await this.prisma.mealPhoto.create({
      data: {
        token,
        userId,
        width: meta.width ?? null,
        height: meta.height ?? null,
        byteSize: processed.byteLength,
      },
    });

    return {
      token,
      previewUrl: Routes.Meal.photo(token),
      thumbUrl: Routes.Meal.photoThumb(token),
      width: meta.width ?? null,
      height: meta.height ?? null,
      byteSize: processed.byteLength,
    };
  }

  // 소유자 검증 후 원본/썸네일 바이트. 파일이 없으면 not_found(행만 남은 경우 포함).
  async read(userId: string, token: string, variant: 'full' | 'thumb'): Promise<Buffer> {
    if (!isValidMealPhotoToken(token)) throw new MealPhotoError('invalid_token', '토큰 형식이 올바르지 않습니다.');
    const row = await this.prisma.mealPhoto.findUnique({ where: { token } });
    if (!row) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new MealPhotoError('forbidden', '권한이 없습니다.');
    const path = join(this.userDir(row.userId), variant === 'thumb' ? `${token}_t.jpg` : `${token}.jpg`);
    try {
      await stat(path);
    } catch {
      // 썸네일이 없을 수 있다(과거 업로드) — 원본으로 폴백.
      if (variant === 'thumb') return this.read(userId, token, 'full');
      throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');
    }
    return readFile(path);
  }

  /**
   * 지난 기록의 사진을 이번 기록용으로 **복제**한다(참조 공유가 아니다 — 원본 기록을 지웠을 때
   * 새 기록의 사진까지 사라지면 안 된다). 새 행은 entryId=null 이라, 저장하지 않고 나가면
   * 기존 고아 사진 청소(24시간)가 알아서 지운다.
   */
  async copy(userId: string, token: string): Promise<UploadMealPhotoResultType> {
    if (!isValidMealPhotoToken(token)) throw new MealPhotoError('invalid_token', '토큰 형식이 올바르지 않습니다.');
    const row = await this.prisma.mealPhoto.findUnique({ where: { token } });
    if (!row) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new MealPhotoError('forbidden', '권한이 없습니다.');

    const full = await this.read(userId, token, 'full');
    // 썸네일이 없던 과거 업로드는 read 가 원본으로 폴백하므로 여기서 다시 만든다.
    const thumb = await this.normalize(full, THUMB_DIMENSION, THUMB_QUALITY);

    const dir = this.userDir(userId);
    await mkdir(dir, { recursive: true });
    const newToken = randomUUID();
    await writeFile(join(dir, `${newToken}.jpg`), full);
    await writeFile(join(dir, `${newToken}_t.jpg`), thumb);

    await this.prisma.mealPhoto.create({
      data: {
        token: newToken,
        userId,
        width: row.width,
        height: row.height,
        byteSize: full.byteLength,
      },
    });

    return {
      token: newToken,
      previewUrl: Routes.Meal.photo(newToken),
      thumbUrl: Routes.Meal.photoThumb(newToken),
      width: row.width,
      height: row.height,
      byteSize: full.byteLength,
    };
  }

  // 인식 서비스용 — 소유자 검증 + 원본 바이트(여러 장).
  async readManyForOwner(userId: string, tokens: string[]): Promise<Buffer[]> {
    const out: Buffer[] = [];
    for (const t of tokens) out.push(await this.read(userId, t, 'full'));
    return out;
  }

  async remove(userId: string, token: string): Promise<void> {
    if (!isValidMealPhotoToken(token)) throw new MealPhotoError('invalid_token', '토큰 형식이 올바르지 않습니다.');
    const row = await this.prisma.mealPhoto.findUnique({ where: { token } });
    if (!row) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new MealPhotoError('forbidden', '권한이 없습니다.');
    await this.prisma.mealPhoto.delete({ where: { token } });
    await this.deleteFiles(row.userId, token);
  }

  // 기록 저장/수정 시 호출 — 사용자가 보낸 토큰을 그 기록에 묶고, 빠진 토큰은 파일까지 지운다.
  async attachToEntry(userId: string, entryId: string, tokens: string[]): Promise<void> {
    const owned = await this.prisma.mealPhoto.findMany({ where: { token: { in: tokens }, userId } });
    const ownedTokens = new Set(owned.map((p) => p.token));
    const missing = tokens.filter((t) => !ownedTokens.has(t));
    if (missing.length > 0) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');

    // 다른 기록에 붙어 있던 사진은 이 기록으로 옮기지 않는다(토큰 재사용 방지).
    for (const p of owned) {
      if (p.entryId && p.entryId !== entryId) {
        throw new MealPhotoError('forbidden', '이미 다른 기록에 사용된 사진입니다.');
      }
    }
    const detached = await this.prisma.mealPhoto.findMany({
      where: { entryId, token: { notIn: tokens.length > 0 ? tokens : ['-'] } },
    });
    for (const [i, token] of tokens.entries()) {
      await this.prisma.mealPhoto.update({ where: { token }, data: { entryId, sortOrder: i } });
    }
    for (const p of detached) {
      await this.prisma.mealPhoto.delete({ where: { token: p.token } });
      await this.deleteFiles(p.userId, p.token);
    }
  }

  // 기록 삭제 시 — 행은 Cascade 로 사라지므로 파일만 지운다(삭제 전에 호출).
  async removeForEntry(entryId: string): Promise<void> {
    const rows = await this.prisma.mealPhoto.findMany({ where: { entryId } });
    for (const p of rows) await this.deleteFiles(p.userId, p.token);
  }

  // 고아 정리 — 기록에 붙지 않은 채 TTL 을 넘긴 업로드. 부팅 + 일 1회 cron 에서 호출.
  async sweepOrphans(ttlHours: number = ORPHAN_PHOTO_TTL_HOURS): Promise<number> {
    const cutoff = new Date(Date.now() - ttlHours * 3_600_000);
    const rows = await this.prisma.mealPhoto.findMany({
      where: { entryId: null, createdAt: { lt: cutoff } },
      take: 500,
    });
    for (const p of rows) {
      await this.prisma.mealPhoto.delete({ where: { token: p.token } });
      await this.deleteFiles(p.userId, p.token);
    }
    if (rows.length > 0) this.log?.info({ count: rows.length }, '[meal-photo] swept orphan photos');
    return rows.length;
  }

  private async deleteFiles(userId: string, token: string): Promise<void> {
    const dir = this.userDir(userId);
    await rm(join(dir, `${token}.jpg`), { force: true }).catch(() => undefined);
    await rm(join(dir, `${token}_t.jpg`), { force: true }).catch(() => undefined);
  }
}
