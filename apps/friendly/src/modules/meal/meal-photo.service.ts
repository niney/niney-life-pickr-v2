import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MealPhoto, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import type { UploadMealPhotoResultType } from '@repo/api-contract';
import { Routes } from '@repo/api-contract';
import { mealMutationBarrier } from './meal-mutation-barrier.js';

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
const UNTRACKED_FILE_SWEEP_LIMIT = 2000;
const DB_LOOKUP_CHUNK_SIZE = 500;
const DELETION_OUTBOX_DRAIN_LIMIT = 500;
const DELETION_ERROR_MAX_LENGTH = 1000;
const USER_DIR_PATTERN = /^[A-Za-z0-9_-]+$/;
const PHOTO_FILE_PATTERN = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:_t)?\.jpg$/;

export class MealPhotoError extends Error {
  constructor(
    readonly code: 'invalid_token' | 'invalid_image' | 'not_found' | 'forbidden' | 'quota' | 'attached',
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
  // 테스트에서 작은 상한으로 store/copy 공통 쿼터를 검증한다. 운영 기본값은 3,000장.
  maxPhotosPerUser?: number;
}

type MealPhotoDb = PrismaClient | Prisma.TransactionClient;
export type MealPhotoFileRef = Pick<MealPhoto, 'userId' | 'token'>;

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
    // userId 는 cuid지만 디렉터리 전체 삭제에도 쓰이므로 변환해서 경로를 만들지 않고, 안전한
    // 직계 자식 이름만 그대로 허용한다. 잘못된 값이 다른 사용자의 디렉터리와 충돌하면 안 된다.
    if (!USER_DIR_PATTERN.test(userId)) throw new MealPhotoError('forbidden', '잘못된 사용자입니다.');
    return join(this.storageDir, userId);
  }

  private async normalize(buffer: Buffer, dimension: number, quality: number): Promise<Buffer> {
    return sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: dimension, height: dimension, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  private async assertPhotoQuota(userId: string): Promise<void> {
    const limit = this.opts.maxPhotosPerUser ?? MAX_PHOTOS_PER_USER;
    const count = await this.prisma.mealPhoto.count({ where: { userId } });
    if (count >= limit) {
      throw new MealPhotoError('quota', '저장된 사진이 너무 많습니다. 오래된 기록을 정리해 주세요.');
    }
  }

  private async persistNewPhoto(
    userId: string,
    input: { full: Buffer; thumb: Buffer; width: number | null; height: number | null },
  ): Promise<UploadMealPhotoResultType> {
    await this.assertPhotoQuota(userId);

    const dir = this.userDir(userId);
    await mkdir(dir, { recursive: true });
    const token = randomUUID();
    try {
      await writeFile(join(dir, `${token}.jpg`), input.full);
      await writeFile(join(dir, `${token}_t.jpg`), input.thumb);
      await this.prisma.mealPhoto.create({
        data: {
          token,
          userId,
          width: input.width,
          height: input.height,
          byteSize: input.full.byteLength,
        },
      });
    } catch (e) {
      // DB 행 생성이 실패하면 먼저 쓴 파일을 남기지 않는다.
      await this.deleteFiles(userId, token);
      throw e;
    }

    return {
      token,
      previewUrl: Routes.Meal.photo(token),
      thumbUrl: Routes.Meal.photoThumb(token),
      width: input.width,
      height: input.height,
      byteSize: input.full.byteLength,
    };
  }

  // 업로드 → JPEG 정규화(+HEIC 폴백) → 원본·썸네일 저장 → MealPhoto 행(entryId=null) 생성.
  async store(userId: string, buffer: Buffer): Promise<UploadMealPhotoResultType> {
    return mealMutationBarrier.runExclusive(userId, () => this.storeUnlocked(userId, buffer));
  }

  /**
   * 여러 사진+메타데이터를 하나의 사용자 mutation 경계에서 복원할 때만 사용한다.
   * 호출자는 반드시 mealMutationBarrier의 해당 userId lock을 이미 보유해야 한다. 일반 업로드는
   * 위 store()를 써야 하며, 이 메서드 안에서 다시 lock을 잡으면 비재진입 lock이 교착된다.
   */
  async storeWhileMutationLocked(
    userId: string,
    buffer: Buffer,
  ): Promise<UploadMealPhotoResultType> {
    return this.storeUnlocked(userId, buffer);
  }

  private async storeUnlocked(userId: string, buffer: Buffer): Promise<UploadMealPhotoResultType> {
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
    return this.persistNewPhoto(userId, {
      full: processed,
      thumb,
      width: meta.width ?? null,
      height: meta.height ?? null,
    });
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
    return mealMutationBarrier.runExclusive(userId, () => this.copyUnlocked(userId, token));
  }

  private async copyUnlocked(userId: string, token: string): Promise<UploadMealPhotoResultType> {
    if (!isValidMealPhotoToken(token)) throw new MealPhotoError('invalid_token', '토큰 형식이 올바르지 않습니다.');
    const row = await this.prisma.mealPhoto.findUnique({ where: { token } });
    if (!row) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new MealPhotoError('forbidden', '권한이 없습니다.');

    const full = await this.read(userId, token, 'full');
    // 썸네일이 없던 과거 업로드는 read 가 원본으로 폴백하므로 여기서 다시 만든다.
    const thumb = await this.normalize(full, THUMB_DIMENSION, THUMB_QUALITY);

    return this.persistNewPhoto(userId, {
      full,
      thumb,
      width: row.width,
      height: row.height,
    });
  }

  // 인식 서비스용 — 소유자 검증 + 원본 바이트(여러 장).
  async readManyForOwner(userId: string, tokens: string[]): Promise<Buffer[]> {
    const out: Buffer[] = [];
    for (const t of tokens) out.push(await this.read(userId, t, 'full'));
    return out;
  }

  async remove(userId: string, token: string): Promise<void> {
    return mealMutationBarrier.runExclusive(userId, () => this.removeUnlocked(userId, token));
  }

  private async removeUnlocked(userId: string, token: string): Promise<void> {
    if (!isValidMealPhotoToken(token)) throw new MealPhotoError('invalid_token', '토큰 형식이 올바르지 않습니다.');
    const row = await this.prisma.mealPhoto.findUnique({ where: { token } });
    if (!row) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');
    if (row.userId !== userId) throw new MealPhotoError('forbidden', '권한이 없습니다.');
    // 단독 DELETE 는 아직 기록에 붙지 않은 업로드를 취소하는 용도다. 연결된 행을
    // 직접 지우면 MealEntry 응답의 photoTokens 와 파일이 동시에 변해 기록 수정의
    // 일관된 경계를 우회한다. 붙은 사진은 MealEntry PATCH 의 photoTokens 로만 떼어 낸다.
    if (row.entryId !== null) {
      throw new MealPhotoError('attached', '기록에 연결된 사진입니다. 식단 기록 수정에서 제거해 주세요.');
    }
    await this.prisma.mealPhoto.delete({ where: { token } });
    await this.deleteFiles(row.userId, token);
  }

  // 기록 DB 를 건드리기 전에 토큰 전체를 먼저 검증한다. create 는 entryId=null 로 호출해 아직
  // 어떤 기록에도 붙지 않은 토큰만 허용하고, update 는 현재 기록에 붙은 토큰의 재사용도 허용한다.
  async validateForEntry(
    userId: string,
    entryId: string | null,
    tokens: string[],
    db: MealPhotoDb = this.prisma,
  ): Promise<void> {
    if (new Set(tokens).size !== tokens.length || tokens.some((token) => !isValidMealPhotoToken(token))) {
      throw new MealPhotoError('invalid_token', '사진 토큰 형식이 올바르지 않습니다.');
    }
    const owned = await db.mealPhoto.findMany({ where: { token: { in: tokens }, userId } });
    const ownedTokens = new Set(owned.map((p) => p.token));
    const missing = tokens.filter((t) => !ownedTokens.has(t));
    if (missing.length > 0) throw new MealPhotoError('not_found', '사진을 찾을 수 없습니다.');

    // 다른 기록에 붙어 있던 사진은 이 기록으로 옮기지 않는다(토큰 재사용 방지).
    for (const p of owned) {
      if (p.entryId && (entryId === null || p.entryId !== entryId)) {
        throw new MealPhotoError('forbidden', '이미 다른 기록에 사용된 사진입니다.');
      }
    }
  }

  // 기록 저장/수정 트랜잭션 안에서 호출한다. DB 행만 바꾸고, 삭제할 파일 목록을 반환한다.
  // 파일은 호출부가 커밋 뒤에 지워야 롤백 시 DB 행만 복구되고 파일은 사라지는 불일치가 없다.
  async attachToEntry(
    userId: string,
    entryId: string,
    tokens: string[],
    db: MealPhotoDb = this.prisma,
  ): Promise<MealPhotoFileRef[]> {
    await this.validateForEntry(userId, entryId, tokens, db);
    const detached = await db.mealPhoto.findMany({
      where: { entryId, token: { notIn: tokens.length > 0 ? tokens : ['-'] } },
      select: { userId: true, token: true },
    });
    for (const [i, token] of tokens.entries()) {
      await db.mealPhoto.update({ where: { token }, data: { entryId, sortOrder: i } });
    }
    if (detached.length > 0) {
      await db.mealPhoto.deleteMany({ where: { token: { in: detached.map((p) => p.token) } } });
    }
    return detached;
  }

  // DB 커밋 뒤 실행하는 파일 side effect. 개별 삭제는 멱등이며 실패해도 다음 정리 작업을 막지 않는다.
  async removeFiles(rows: readonly MealPhotoFileRef[]): Promise<void> {
    for (const p of rows) await this.deleteFiles(p.userId, p.token);
  }

  /**
   * durable deletion outbox 전용 파일 삭제. 없는 파일은 성공으로 보지만 실제 I/O 오류는 호출자에게
   * 전파한다. retention 경로가 오류를 기록한 outbox 행을 지우지 않고 다음 실행에서 재시도할 수 있게
   * best-effort removeFiles와 의도적으로 분리한다.
   */
  async removeFilesStrict(rows: readonly MealPhotoFileRef[]): Promise<void> {
    for (const row of rows) await this.deleteFilesStrict(row.userId, row.token);
  }

  /**
   * DB 메타데이터와 함께 먼저 커밋된 파일 삭제 의도를 처리한다. 행 하나의 실패가 나머지를 막지
   * 않으며, 성공한 행만 지운다. userId를 주면 요청 직후 본인 대기분을 명시적으로 재시도하고,
   * 생략하면 부팅/cron에서 전체 대기분을 제한된 배치로 처리한다.
   */
  async drainDeletionOutbox(
    userId?: string,
    limit: number = DELETION_OUTBOX_DRAIN_LIMIT,
  ): Promise<{ removedFileSets: number; failedFileSets: number; pendingFileSets: number }> {
    const take = Math.max(1, Math.min(DELETION_OUTBOX_DRAIN_LIMIT, Math.trunc(limit)));
    const rows = await this.prisma.mealPhotoDeletion.findMany({
      where: userId === undefined ? undefined : { userId },
      // 계속 실패하는 일부 행이 제한 배치를 영구 점유하지 않도록 시도 횟수가 적은 행부터
      // 순환한다. 같은 횟수 안에서는 오래된 삭제 의도를 먼저 처리한다.
      orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
    let removedFileSets = 0;
    let failedFileSets = 0;

    for (const row of rows) {
      try {
        await this.removeFilesStrict([{ userId: row.userId, token: row.token }]);
        await this.prisma.mealPhotoDeletion.deleteMany({ where: { id: row.id } });
        removedFileSets += 1;
      } catch (error) {
        failedFileSets += 1;
        const message = (error instanceof Error ? error.message : String(error)).slice(
          0,
          DELETION_ERROR_MAX_LENGTH,
        );
        await this.prisma.mealPhotoDeletion.updateMany({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError: message },
        });
        this.log?.warn(
          { err: error, userId: row.userId, token: row.token },
          '[meal-photo] deferred photo deletion failed',
        );
      }
    }

    const pendingFileSets = await this.prisma.mealPhotoDeletion.count({
      where: userId === undefined ? undefined : { userId },
    });
    return { removedFileSets, failedFileSets, pendingFileSets };
  }

  /**
   * 전체 식단 삭제 전용. DB에 추적되지 않은 과거 파일까지 빠짐없이 없애기 위해 사용자 전용
   * 디렉터리 자체를 지운다. 오류를 삼키지 않아 호출자가 200을 반환하지 않게 하며, force라
   * DB가 이미 빈 재시도에서도 같은 삭제를 안전하게 다시 수행할 수 있다.
   *
   * 사용자 mutation barrier를 이미 잡은 MealDataService에서만 호출한다(여기서 중첩 lock 금지).
   */
  async removeAllFilesForUser(userId: string): Promise<void> {
    await rm(this.userDir(userId), { recursive: true, force: true });
  }

  // 고아 정리 — 기록에 붙지 않은 채 TTL 을 넘긴 업로드. 부팅 + 일 1회 cron 에서 호출.
  async sweepOrphans(ttlHours: number = ORPHAN_PHOTO_TTL_HOURS): Promise<number> {
    const cutoff = new Date(Date.now() - ttlHours * 3_600_000);
    const rows = await this.prisma.mealPhoto.findMany({
      where: { entryId: null, createdAt: { lt: cutoff } },
      take: 500,
    });
    let removed = 0;
    for (const p of rows) {
      await mealMutationBarrier.runExclusive(p.userId, async () => {
        // 후보 조회 뒤 전체 삭제나 기록 attach가 먼저 실행됐을 수 있으므로 조건부 삭제로 재확인한다.
        const deleted = await this.prisma.mealPhoto.deleteMany({
          where: { token: p.token, userId: p.userId, entryId: null, createdAt: { lt: cutoff } },
        });
        if (deleted.count === 0) return;
        await this.deleteFiles(p.userId, p.token);
        removed += 1;
      });
    }
    if (removed > 0) this.log?.info({ count: removed }, '[meal-photo] swept orphan photos');
    return removed;
  }

  /**
   * 파일은 생성됐지만 DB 행 생성 전에 프로세스가 종료된 경우를 정리한다. DB 기반 sweepOrphans 만으로는
   * 이런 파일을 찾을 수 없으므로 저장소의 직계 사용자 디렉터리와 정해진 JPEG 이름만 제한적으로 훑는다.
   * 최근 파일은 업로드 중일 수 있어 건드리지 않고, 심볼릭 링크도 따라가지 않는다.
   */
  async sweepUntrackedFiles(ttlHours: number = ORPHAN_PHOTO_TTL_HOURS): Promise<number> {
    const cutoffMs = Date.now() - Math.max(0, ttlHours) * 3_600_000;
    let userDirs;
    try {
      userDirs = await readdir(this.storageDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }

    const candidates: Array<{ userId: string; token: string }> = [];
    for (const userDir of userDirs) {
      if (candidates.length >= UNTRACKED_FILE_SWEEP_LIMIT) break;
      if (!userDir.isDirectory() || !USER_DIR_PATTERN.test(userDir.name)) continue;

      const path = join(this.storageDir, userDir.name);
      let files;
      try {
        files = await readdir(path, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        this.log?.warn({ err: error, userId: userDir.name }, '[meal-photo] failed to scan user directory');
        continue;
      }

      const byToken = new Map<string, number>();
      for (const file of files) {
        if (!file.isFile()) continue;
        const match = PHOTO_FILE_PATTERN.exec(file.name);
        if (!match) continue;
        try {
          const info = await stat(join(path, file.name));
          const token = match[1]!;
          byToken.set(token, Math.max(byToken.get(token) ?? 0, info.mtimeMs));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.log?.warn({ err: error, file: file.name }, '[meal-photo] failed to inspect photo file');
          }
        }
      }

      for (const [token, newestMtimeMs] of byToken) {
        if (newestMtimeMs >= cutoffMs) continue;
        candidates.push({ userId: userDir.name, token });
        if (candidates.length >= UNTRACKED_FILE_SWEEP_LIMIT) break;
      }
    }

    if (candidates.length === 0) return 0;

    const tracked = new Set<string>();
    for (let i = 0; i < candidates.length; i += DB_LOOKUP_CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + DB_LOOKUP_CHUNK_SIZE);
      const rows = await this.prisma.mealPhoto.findMany({
        where: { token: { in: chunk.map((candidate) => candidate.token) } },
        select: { userId: true, token: true },
      });
      for (const row of rows) tracked.add(`${row.userId}\0${row.token}`);
    }

    const untracked = candidates.filter(
      (candidate) => !tracked.has(`${candidate.userId}\0${candidate.token}`),
    );
    for (const candidate of untracked) await this.deleteFiles(candidate.userId, candidate.token);
    if (untracked.length > 0) {
      this.log?.info({ count: untracked.length }, '[meal-photo] swept untracked photo files');
    }
    return untracked.length;
  }

  private async deleteFiles(userId: string, token: string): Promise<void> {
    const dir = this.userDir(userId);
    for (const path of [join(dir, `${token}.jpg`), join(dir, `${token}_t.jpg`)]) {
      try {
        await rm(path, { force: true });
      } catch (error) {
        // 개별 정리는 best-effort를 유지한다. 특히 DB create 실패 catch 안에서는 이 오류가 원래
        // DB 오류를 덮으면 안 되므로 경고만 남긴다. 전체 삭제는 위의 strict 메서드를 사용한다.
        this.log?.warn({ err: error, userId, token, path }, '[meal-photo] failed to remove photo file');
      }
    }
  }

  private async deleteFilesStrict(userId: string, token: string): Promise<void> {
    if (!isValidMealPhotoToken(token)) {
      throw new MealPhotoError('invalid_token', '사진 토큰 형식이 올바르지 않습니다.');
    }
    const dir = this.userDir(userId);
    const errors: unknown[] = [];
    for (const path of [join(dir, `${token}.jpg`), join(dir, `${token}_t.jpg`)]) {
      try {
        await rm(path, { force: true });
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw errors[0];
  }
}
