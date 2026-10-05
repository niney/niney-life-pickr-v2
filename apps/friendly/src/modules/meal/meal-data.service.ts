import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  MEAL_DATA_BACKUP_FORMAT,
  MEAL_DATA_BACKUP_MAX_ENTRIES,
  MEAL_DATA_BACKUP_MAX_EVENTS_PER_RECOMMENDATION,
  MEAL_DATA_BACKUP_MAX_JSON_BYTES,
  MEAL_DATA_BACKUP_MAX_PHOTO_BYTES,
  MEAL_DATA_BACKUP_MAX_PHOTOS,
  MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS,
  MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES,
  MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES,
  MEAL_DATA_BACKUP_VERSION,
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_DATA_EXPORT_FORMAT,
  MEAL_DATA_EXPORT_VERSION,
  MEAL_MAX_ENTRIES_PER_DAY,
  MEAL_MAX_ENTRIES_PER_USER,
  MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
  MealDataBackup,
  MealDataBackupPhoto,
  MealDataExport,
  MealDataExportEntry,
  MealDataExportPhoto,
  MealDataExportRecommendation,
  MealPreference,
  type DeleteMealPhotosInputType,
  type DeleteMealPhotosResultType,
  type DeleteMealDataInputType,
  type DeleteMealDataResultType,
  type MealDataBackupType,
  type MealDataExportPhotoType,
  type MealDataExportType,
  type MealPhotoRetentionPreviewType,
  type MealPhotoRetentionQueryType,
  type RestoreMealDataResultType,
} from '@repo/api-contract';
import { chunk } from '../../lib/array.js';
import { AsyncGate, GateBusyError } from '../../lib/async-gate.js';
import { normalizeTerm } from '../../lib/text.js';
import {
  toRecommendation,
  toRecommendationEvent,
} from '../meal-recommendation/meal-recommendation.service.js';
import { mealDataGeneration, mealMutationBarrier } from './meal-mutation-barrier.js';
import { purgeMealRecognitionDebugDumpsForUser } from './meal-recognition-debug.store.js';
import type { MealPhotoService } from './meal-photo.service.js';
import { toMealPreference } from './meal-preference.service.js';
import { toMealEntry } from './meal.service.js';

export const MEAL_DATA_EXPORT_PHOTO_NOTICE =
  '사진 바이너리는 이 JSON에 포함되지 않습니다. 토큰·크기·용량·정렬·생성 시각 메타데이터만 포함됩니다.';

// 사진 포함 백업·복원은 전역 1건씩 — 1건이 사진 합계에 비례하는 메모리·sharp CPU 를 쓴다(2건 동시 RSS +500MB 실측).
// 자리를 못 잡으면 대기열(8)·대기 시간(60초) 안에서만 기다리고 넘으면 503.
const ARCHIVE_GATE_WAIT_MS = 60_000;
const defaultArchiveGate = new AsyncGate(1, { maxQueue: 8 });
// 응답을 끝까지 읽지 않는 클라이언트가 전역 자리·사용자 장벽을 계속 붙잡지 못하게 하는 상한.
const STREAM_DEADLINE_MS = 10 * 60_000;
// 내보내기는 이 단위로 읽어 흘린다 — 메모리·이벤트 루프 블록이 전체 기록 수가 아니라 페이지 크기에 묶인다.
const EXPORT_PAGE_SIZE = 500;
// 사진 base64 를 잘라 흘리는 단위(3의 배수라 이어 붙이면 한 덩어리 base64 와 같다).
const BASE64_SLICE_BYTES = 3 * 256 * 1024;
// 복원 쓰기는 이 단위 트랜잭션으로 나눈다 — 청크당 쓰기 락 ~0.2초(1,000건 한 트랜잭션은 1~2초).
const RESTORE_ENTRY_CHUNK = 500;
// 락 시간은 항목(행) 수에 비례한다 — 기록당 항목이 많으면 청크의 기록 수를 줄인다.
const RESTORE_ITEM_CHUNK = 1_500;
const RESTORE_RECOMMENDATION_CHUNK = 200;
const RESTORE_EVENT_CHUNK = 5_000;
// 청크 사이 쉼 — 청크를 쉬지 않고 이어 쓰면 SQLite busy 핸들러(재시도 간격 최대 100ms)로 기다리는 다른 쓰기가
// 틈을 못 잡아 복원 내내 밀린다(측정: 대기 최대 = 복원 전체 시간). 재시도 간격보다 길게 쉰다.
const RESTORE_CHUNK_PAUSE_MS = 110;
const CLEANUP_CHUNK = 500;

const MB = 1024 * 1024;
const PHOTO_LIMIT_TEXT = `장당 ${MEAL_DATA_BACKUP_MAX_PHOTO_BYTES / MB}MB, 합계 ${MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES / MB}MB`;

export class MealDataError extends Error {
  constructor(
    readonly code:
      | 'invalid_confirmation'
      | 'backup_too_large'
      | 'invalid_backup'
      | 'busy'
      | 'limit_exceeded',
    message: string,
  ) {
    super(message);
    this.name = 'MealDataError';
  }
}

export interface MealDataServiceDeps {
  photos: MealPhotoService;
  now?: () => Date;
  purgeRecognitionDebugForUser?: (userId: string, legacyPhotoTokens: string[]) => Promise<unknown>;
  // 테스트에서 전역 동시 1건 대기·거절을 검증할 때만 주입한다.
  archiveGate?: AsyncGate;
  archiveGateWaitMs?: number;
  streamDeadlineMs?: number;
}

const parseObject = (json: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // 저장값이 손상됐어도 나머지 개인 데이터 내보내기를 막지 않는다.
  }
  return {};
};

const toExportPhoto = (photo: {
  token: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  sortOrder: number;
  createdAt: Date;
}): MealDataExportPhotoType => ({
  token: photo.token,
  width: photo.width,
  height: photo.height,
  byteSize: photo.byteSize,
  sortOrder: photo.sortOrder,
  createdAt: photo.createdAt.toISOString(),
});

const toSeoulDayStart = (date: string): Date => new Date(`${date}T00:00:00+09:00`);

const safeDate = (value: string, field: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new MealDataError('invalid_backup', `${field} 날짜가 올바르지 않습니다.`);
  }
  return parsed;
};

const omitKeys = <T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> => {
  const blocked = new Set<keyof T>(keys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !blocked.has(key as keyof T)),
  ) as Omit<T, K>;
};

const duplicateResult = (row: {
  archiveId: string;
  entries: number;
  items: number;
  photos: number;
  recommendations: number;
  recommendationEvents: number;
  preferenceResult: string;
}): RestoreMealDataResultType => ({
  archiveId: row.archiveId,
  duplicate: true,
  restored: {
    entries: row.entries,
    items: row.items,
    photos: row.photos,
    recommendations: row.recommendations,
    recommendationEvents: row.recommendationEvents,
    preference:
      row.preferenceResult === 'restored' ||
      row.preferenceResult === 'kept_existing' ||
      row.preferenceResult === 'none'
        ? row.preferenceResult
        : 'none',
  },
});

const base64Length = (byteLength: number): number => Math.ceil(byteLength / 3) * 4;

/** 순서를 지킨 청크 — 한 청크는 최대 maxRows 행, 하위 행(weight 합)은 maxWeight 를 넘지 않는다(한 행이 넘으면 단독). */
const chunkByBudget = <T>(
  rows: readonly T[],
  maxRows: number,
  maxWeight: number,
  weight: (row: T) => number,
): T[][] => {
  const out: T[][] = [];
  let current: T[] = [];
  let currentWeight = 0;
  for (const row of rows) {
    const w = weight(row);
    if (current.length > 0 && (current.length >= maxRows || currentWeight + w > maxWeight)) {
      out.push(current);
      current = [];
      currentWeight = 0;
    }
    current.push(row);
    currentWeight += w;
  }
  if (current.length > 0) out.push(current);
  return out;
};

/**
 * 복원이 만드는 기록·추천 id 와 사진 토큰 — (사용자, 아카이브, ref)로 정해진다. 복원은 청크마다 커밋하고 원장은 마지막
 * 트랜잭션에서만 쓰므로, 도중에 프로세스가 끝나면(배포 reload·메모리 재시작) 커밋된 청크가 원장 없이 남는다. 난수 id 였을
 * 땐 같은 아카이브를 다시 보내면 남은 행 옆에 한 벌이 더 생겼다. id 가 아카이브에서 정해지면 재시도가 그 잔여 행·사진을
 * 찾아 지우고 처음부터 다시 쓴다(discardInterruptedRestore).
 *   - 기록·추천: cuid 와 같은 꼴(c + 24자) — 아카이브 해시 8 + 순번 4 + 행 해시 12. 같은 복원 안에서는 아카이브
 *     순서대로 정렬돼 eatenAt·createdAt 이 같은 행의 순서(id 동률 정렬)가 그대로다.
 *   - 사진: 서버 발급 토큰과 같은 꼴(uuid 모양 16진수). 사진 읽기는 소유자 검증을 거치므로 토큰이 예측 가능해도 된다.
 */
interface RestoreIds {
  entries: Map<string, string>;
  recommendations: Map<string, string>;
  photos: Map<string, string>;
}

const base36 = (bytes: Buffer, length: number): string =>
  BigInt(`0x${bytes.toString('hex')}`).toString(36).padStart(length, '0').slice(-length);

const restoreRowIds = (scopeKey: string, refs: readonly string[]): Map<string, string> => {
  const scope = createHash('sha256').update(scopeKey).digest();
  const prefix = `c${base36(scope.subarray(0, 6), 8)}`;
  return new Map(
    refs.map((ref, index) => [
      ref,
      `${prefix}${index.toString(36).padStart(4, '0')}${base36(createHash('sha256').update(scope).update(ref).digest().subarray(0, 8), 12)}`,
    ]),
  );
};

const restorePhotoToken = (scopeKey: string, ref: string): string => {
  const hex = createHash('sha256').update(`${scopeKey}\u0000${ref}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const restoreIdsOf = (userId: string, archive: MealDataBackupType): RestoreIds => {
  const scopeKey = (kind: string): string => `${userId}\u0000${archive.archiveId}\u0000${kind}`;
  return {
    entries: restoreRowIds(scopeKey('entry'), archive.entries.map((entry) => entry.ref)),
    recommendations: restoreRowIds(scopeKey('recommendation'), archive.recommendations.map((r) => r.ref)),
    photos: new Map(archive.photos.map((photo) => [photo.ref, restorePhotoToken(scopeKey('photo'), photo.ref)])),
  };
};

/** 응답 스트림 — 끝나거나(정상·오류·클라이언트 이탈) 기한을 넘기면 release 를 한 번 부른다. */
const guardedStream = (
  chunks: AsyncGenerator<string>,
  release: () => void,
  deadlineMs: number,
): Readable => {
  let released = false;
  const done = (): void => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    release();
  };
  const stream = Readable.from(
    (async function* () {
      try {
        yield* chunks;
      } finally {
        done();
      }
    })(),
    { objectMode: false },
  );
  const timer = setTimeout(() => {
    stream.destroy(new Error('meal data stream deadline exceeded'));
  }, deadlineMs);
  timer.unref?.();
  // 한 번도 읽히지 않고 파괴돼도(제너레이터 finally 가 안 돎) 잠금이 남지 않게 close 에서도 푼다.
  stream.once('close', done);
  // 오류는 소비자(fastify 응답 파이프·for await)가 따로 받는다 — 리스너 없는 'error' 로 프로세스가 죽지 않게만 한다.
  stream.on('error', () => undefined);
  return stream;
};

const readJson = async <T>(stream: Readable): Promise<T> => {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(String(part)));
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as T;
};

/**
 * 내 식단 데이터 portability/삭제 경계. 모든 쿼리는 userId 로 한정하고 전체 삭제는 한 DB
 * 트랜잭션으로 커밋한 뒤 사진 파일만 멱등 제거한다(파일 삭제는 DB 롤백 대상이 될 수 없다).
 *
 * 내보내기·백업은 사용자 장벽 안에서 읽어 응답으로 흘린다(스트림). Prisma 대화형 트랜잭션은 SQLite 에서
 * BEGIN IMMEDIATE 라 읽기만 해도 DB 전체 쓰기 락을 잡으므로 스냅샷용 트랜잭션을 쓰지 않는다 — 같은 사용자의
 * 쓰기는 모두 장벽을 지나므로 장벽 안의 연속 조회가 그 사용자에 대해 일관된다.
 */
export class MealDataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: MealDataServiceDeps,
  ) {}

  private get archiveGate(): AsyncGate {
    return this.deps.archiveGate ?? defaultArchiveGate;
  }

  private async acquireArchiveGate(): Promise<() => void> {
    try {
      return await this.archiveGate.acquire(this.deps.archiveGateWaitMs ?? ARCHIVE_GATE_WAIT_MS);
    } catch (e) {
      if (e instanceof GateBusyError) {
        throw new MealDataError(
          'busy',
          '다른 사진 포함 백업·복원이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.',
        );
      }
      throw e;
    }
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** 프로그램 호출용(테스트·스크립트) — 스트림을 끝까지 읽어 객체로 돌려준다. 라우트는 exportStream 을 쓴다. */
  async export(userId: string): Promise<MealDataExportType> {
    return readJson<MealDataExportType>(await this.exportStream(userId));
  }

  /**
   * 내보내기 JSON 을 기록 500건 단위로 읽어 흘린다. 바이트는 예전 한 덩어리 응답(MealDataExport 직렬화)과 같다 —
   * 같은 순서([eatenAt, id]·[createdAt, id])로 읽고 조각마다 같은 Zod 스키마로 검증·정리한 뒤 이어 붙인다.
   */
  async exportStream(userId: string): Promise<Readable> {
    const release = await mealMutationBarrier.acquire(userId);
    try {
      const head = MealDataExport.pick({
        format: true,
        version: true,
        exportedAt: true,
        notice: true,
      }).parse({
        format: MEAL_DATA_EXPORT_FORMAT,
        version: MEAL_DATA_EXPORT_VERSION,
        exportedAt: this.now().toISOString(),
        notice: { photoBinariesIncluded: false, message: MEAL_DATA_EXPORT_PHOTO_NOTICE },
      });
      return guardedStream(this.exportChunks(userId, head), release, this.deps.streamDeadlineMs ?? STREAM_DEADLINE_MS);
    } catch (e) {
      release();
      throw e;
    }
  }

  private async *exportChunks(userId: string, head: object): AsyncGenerator<string> {
    yield `${JSON.stringify(head).slice(0, -1)},"entries":[`;
    let first = true;
    let cursor: { eatenAt: Date; id: string } | null = null;
    for (;;) {
      const page: Array<Prisma.MealEntryGetPayload<{ include: { items: true; photos: true } }>> =
        await this.prisma.mealEntry.findMany({
          where: {
            userId,
            ...(cursor
              ? {
                  eatenAt: { gte: cursor.eatenAt },
                  NOT: { eatenAt: cursor.eatenAt, id: { lte: cursor.id } },
                }
              : {}),
          },
          include: { items: true, photos: true },
          orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }],
          take: EXPORT_PAGE_SIZE,
        });
      let out = '';
      for (const row of page) {
        const entry = MealDataExportEntry.parse({
          ...toMealEntry(row, { withRecognition: true, withPhotos: true }),
          photos: [...row.photos].sort((a, b) => a.sortOrder - b.sortOrder).map(toExportPhoto),
        });
        out += `${first ? '' : ','}${JSON.stringify(entry)}`;
        first = false;
      }
      if (out) yield out;
      const last = page[page.length - 1];
      if (!last || page.length < EXPORT_PAGE_SIZE) break;
      cursor = { eatenAt: last.eatenAt, id: last.id };
    }

    const [orphanPhotos, preference] = await Promise.all([
      this.prisma.mealPhoto.findMany({
        where: { userId, entryId: null },
        orderBy: [{ createdAt: 'asc' }, { token: 'asc' }],
      }),
      this.prisma.mealPreference.findUnique({ where: { userId } }),
    ]);
    const orphans = orphanPhotos.map((photo) => MealDataExportPhoto.parse(toExportPhoto(photo)));
    const pref = MealPreference.nullable().parse(preference ? toMealPreference(preference) : null);
    yield `],"orphanPhotos":${JSON.stringify(orphans)},"preference":${JSON.stringify(pref)},"recommendations":[`;

    first = true;
    let recCursor: { createdAt: Date; id: string } | null = null;
    for (;;) {
      const page: Array<Prisma.MealRecommendationGetPayload<{ include: { events: true } }>> =
        await this.prisma.mealRecommendation.findMany({
          where: {
            userId,
            ...(recCursor
              ? {
                  createdAt: { gte: recCursor.createdAt },
                  NOT: { createdAt: recCursor.createdAt, id: { lte: recCursor.id } },
                }
              : {}),
          },
          include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: EXPORT_PAGE_SIZE,
        });
      let out = '';
      for (const row of page) {
        const recommendation = MealDataExportRecommendation.parse({
          ...toRecommendation(row),
          context: parseObject(row.contextJson),
          profile: parseObject(row.profileJson),
          profileHash: row.profileHash,
          events: row.events.map(toRecommendationEvent),
        });
        out += `${first ? '' : ','}${JSON.stringify(recommendation)}`;
        first = false;
      }
      if (out) yield out;
      const last = page[page.length - 1];
      if (!last || page.length < EXPORT_PAGE_SIZE) break;
      recCursor = { createdAt: last.createdAt, id: last.id };
    }
    yield ']}';
  }

  /**
   * 사진 정리 대상을 실제 삭제와 같은 쿼리로 계산한다. attached는 사진 createdAt이 아니라
   * 사용자 로컬 식사일(eatenDate)을 기준으로 기록 전체를 잡아 일부 사진만 남는 애매한 상태를
   * 만들지 않는다. 고아 업로드만 생성 시각을 서울 자정 경계와 비교한다.
   */
  async previewPhotoRetention(
    userId: string,
    query: MealPhotoRetentionQueryType,
  ): Promise<MealPhotoRetentionPreviewType> {
    const before = query.before ?? null;
    // 미리보기라 트랜잭션으로 묶지 않는다(SQLite 대화형 트랜잭션은 읽기만 해도 전역 쓰기 락을 잡는다).
    const [entries, orphans] = await Promise.all([
      this.prisma.mealEntry.findMany({
        where: {
          userId,
          ...(before ? { eatenDate: { lt: before } } : {}),
          photos: { some: {} },
        },
        select: { id: true, photos: { select: { byteSize: true } } },
      }),
      this.prisma.mealPhoto.findMany({
        where: {
          userId,
          entryId: null,
          ...(before ? { createdAt: { lt: toSeoulDayStart(before) } } : {}),
        },
        select: { byteSize: true },
      }),
    ]);
    const attachedPhotos = entries.reduce((sum, entry) => sum + entry.photos.length, 0);
    const totalBytes = [...entries.flatMap((entry) => entry.photos), ...orphans].reduce(
      (sum, photo) => sum + photo.byteSize,
      0,
    );
    return {
      before,
      entries: entries.length,
      attachedPhotos,
      orphanPhotos: orphans.length,
      totalPhotos: attachedPhotos + orphans.length,
      totalBytes,
    };
  }

  async deleteRetainedPhotos(
    userId: string,
    input: DeleteMealPhotosInputType,
  ): Promise<DeleteMealPhotosResultType> {
    if (input.confirmation !== MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION) {
      throw new MealDataError('invalid_confirmation', '사진 삭제 확인 문구가 일치하지 않습니다.');
    }
    const before = input.before ?? null;
    return mealMutationBarrier.runExclusive(userId, async () => {
      const committed = await this.prisma.$transaction(async (tx) => {
        const [entries, orphans] = await Promise.all([
          tx.mealEntry.findMany({
            where: {
              userId,
              ...(before ? { eatenDate: { lt: before } } : {}),
              photos: { some: {} },
            },
            select: {
              id: true,
              photos: { select: { userId: true, token: true, byteSize: true } },
            },
          }),
          tx.mealPhoto.findMany({
            where: {
              userId,
              entryId: null,
              ...(before ? { createdAt: { lt: toSeoulDayStart(before) } } : {}),
            },
            select: { userId: true, token: true, byteSize: true },
          }),
        ]);
        const attached = entries.flatMap((entry) => entry.photos);
        const rows = [...attached, ...orphans];
        if (rows.length > 0) {
          // 메타데이터 삭제와 같은 트랜잭션에 파일 삭제 의도를 먼저 남긴다. 커밋 뒤 unlink가
          // 실패해도 token/userId를 잃지 않아 다음 요청과 부팅/cron에서 안전하게 재시도한다.
          await tx.mealPhotoDeletion.createMany({
            data: rows.map((photo) => ({
              userId: photo.userId,
              token: photo.token,
              reason: 'retention',
            })),
          });
          await tx.mealPhoto.deleteMany({
            where: { userId, token: { in: rows.map((photo) => photo.token) } },
          });
        }
        if (entries.length > 0) {
          await tx.mealEntry.updateMany({
            where: { userId, id: { in: entries.map((entry) => entry.id) } },
            data: { photoPurgedAt: this.deps.now?.() ?? new Date() },
          });
        }
        return {
          rows,
          attachedCount: attached.length,
          orphanCount: orphans.length,
          entryCount: entries.length,
          bytes: rows.reduce((sum, photo) => sum + photo.byteSize, 0),
        };
      });

      // 파일 side effect는 DB 커밋 뒤에만 실행한다. 실패한 행은 outbox에 남아 다음 DELETE와
      // 부팅/cron이 다시 처리한다. 실제 파일 정리 대기 여부를 응답에도 명시한다.
      const cleanup = await this.deps.photos.drainDeletionOutbox(userId);
      return {
        before,
        deleted: {
          entriesMarked: committed.entryCount,
          attachedPhotos: committed.attachedCount,
          orphanPhotos: committed.orphanCount,
          totalPhotos: committed.rows.length,
          totalBytes: committed.bytes,
          photoFileSets: committed.rows.length,
          pendingFileSets: cleanup.pendingFileSets,
        },
      };
    });
  }

  /** 프로그램 호출용(테스트·스크립트) — 스트림을 끝까지 읽어 객체로 돌려준다. 라우트는 backupStream 을 쓴다. */
  async backup(userId: string): Promise<MealDataBackupType> {
    return readJson<MealDataBackupType>(await this.backupStream(userId));
  }

  /**
   * 사진 포함 백업. 기록·추천 메타는 한 번에 만들고(Zod 검증), 사진은 파일에서 한 장씩 읽어 base64 조각으로
   * 흘린다 — 응답 바이트는 예전 한 덩어리 직렬화와 같고, 메모리는 사진 한 장 수준이다. 크기 한도(사진·JSON)는
   * 파일 크기와 메타 길이로 정확히 계산해 응답을 시작하기 전에 판정한다. 전역 1건·사용자 장벽은 스트림이
   * 끝날 때(정상·오류·이탈·기한) 푼다.
   */
  async backupStream(userId: string): Promise<Readable> {
    const releaseGate = await this.acquireArchiveGate();
    let releaseUser: (() => void) | null = null;
    try {
      releaseUser = await mealMutationBarrier.acquire(userId);
      const plan = await this.planBackup(userId);
      const unlockUser = releaseUser;
      return guardedStream(
        this.backupChunks(userId, plan),
        () => {
          unlockUser();
          releaseGate();
        },
        this.deps.streamDeadlineMs ?? STREAM_DEADLINE_MS,
      );
    } catch (e) {
      releaseUser?.();
      releaseGate();
      throw e;
    }
  }

  private async planBackup(userId: string): Promise<{
    head: string;
    tail: string;
    photos: Array<{
      token: string;
      size: number;
      shell: { ref: string; width: number | null; height: number | null };
    }>;
  }> {
    const [entryCount, recommendationCount, photoAggregate, orphanCount] = await Promise.all([
      this.prisma.mealEntry.count({ where: { userId } }),
      this.prisma.mealRecommendation.count({ where: { userId } }),
      this.prisma.mealPhoto.aggregate({
        where: { userId, entryId: { not: null } },
        _count: { _all: true },
        _sum: { byteSize: true },
      }),
      this.prisma.mealPhoto.count({ where: { userId, entryId: null } }),
    ]);
    const photoCount = photoAggregate._count._all;
    const photoBytes = photoAggregate._sum.byteSize ?? 0;
    if (
      entryCount > MEAL_DATA_BACKUP_MAX_ENTRIES ||
      recommendationCount > MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS ||
      photoCount > MEAL_DATA_BACKUP_MAX_PHOTOS ||
      photoBytes > MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES
    ) {
      throw new MealDataError(
        'backup_too_large',
        `사진 포함 백업 한도(기록 ${MEAL_DATA_BACKUP_MAX_ENTRIES}개, 추천 ${MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS}개, 사진 ${MEAL_DATA_BACKUP_MAX_PHOTOS}개/${MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES / MB}MB)를 넘었습니다. 오래된 사진을 먼저 정리해 주세요.`,
      );
    }

    const [entryRows, preferenceRow, recommendationRows] = await Promise.all([
      this.prisma.mealEntry.findMany({
        where: { userId },
        include: { items: true, photos: true },
        orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.mealPreference.findUnique({ where: { userId } }),
      this.prisma.mealRecommendation.findMany({
        where: { userId },
        include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const entryRefs = new Map(
      entryRows.map((entry, index) => [entry.id, `entry-${String(index + 1).padStart(6, '0')}`]),
    );
    const recommendationRefs = new Map(
      recommendationRows.map((recommendation, index) => [
        recommendation.id,
        `recommendation-${String(index + 1).padStart(6, '0')}`,
      ]),
    );
    const orderedPhotos = entryRows.flatMap((entry) =>
      [...entry.photos].sort((a, b) => a.sortOrder - b.sortOrder),
    );
    const photoRefs = new Map(
      orderedPhotos.map((photo, index) => [photo.token, `photo-${String(index + 1).padStart(6, '0')}`]),
    );

    // 실제 파일 크기로 한도를 다시 본다(DB byteSize 와 다를 수 있다) — 응답을 시작하기 전에 413 을 낸다.
    const photos: Array<{
      token: string;
      size: number;
      shell: { ref: string; width: number | null; height: number | null };
    }> = [];
    let actualPhotoBytes = 0;
    for (const photo of orderedPhotos) {
      const size = await this.deps.photos.ownedFileSize(userId, photo.token);
      actualPhotoBytes += size;
      if (size <= 0 || size > MEAL_DATA_BACKUP_MAX_PHOTO_BYTES || actualPhotoBytes > MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES) {
        throw new MealDataError(
          'backup_too_large',
          `사진 파일의 실제 크기가 백업 한도(${PHOTO_LIMIT_TEXT})를 넘었습니다.`,
        );
      }
      photos.push({
        token: photo.token,
        size,
        shell: { ref: photoRefs.get(photo.token)!, width: photo.width, height: photo.height },
      });
    }

    const entries: MealDataBackupType['entries'] = entryRows.map((row) => {
      const converted = toMealEntry(row, { withRecognition: true, withPhotos: true });
      const entry = omitKeys(converted, ['id', 'originRecommendationId', 'items', 'photos']);
      return {
        ...entry,
        ref: entryRefs.get(row.id)!,
        originRecommendationRef: row.originRecommendationId
          ? (recommendationRefs.get(row.originRecommendationId) ?? null)
          : null,
        items: converted.items.map((item) => omitKeys(item, ['id'])),
        photoRefs: [...row.photos]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((photo) => photoRefs.get(photo.token)!),
      };
    });

    const recommendations: MealDataBackupType['recommendations'] = recommendationRows.map((row) => {
      if (row.events.length > MEAL_DATA_BACKUP_MAX_EVENTS_PER_RECOMMENDATION) {
        throw new MealDataError(
          'backup_too_large',
          `추천 1건의 행동 이력이 백업 한도(${MEAL_DATA_BACKUP_MAX_EVENTS_PER_RECOMMENDATION}개)를 넘었습니다.`,
        );
      }
      const projected = toRecommendation(row);
      const recommendation = omitKeys(projected, ['id', 'feedback', 'candidateRatings']);
      const { feedback } = projected;
      return {
        ...recommendation,
        ref: recommendationRefs.get(row.id)!,
        context: parseObject(row.contextJson),
        profile: parseObject(row.profileJson),
        profileHash: row.profileHash,
        feedback: feedback
          ? {
              pickedName: feedback.pickedName,
              rating: feedback.rating,
              eatenEntryRef: feedback.eatenEntryId
                ? (entryRefs.get(feedback.eatenEntryId) ?? null)
                : null,
            }
          : null,
        events: row.events.map((eventRow) => {
          return omitKeys(toRecommendationEvent(eventRow), ['id', 'recommendationId']);
        }),
      };
    });

    // 사진을 뺀 아카이브를 응답 스키마로 검증·정리한다(응답 직렬화가 하던 일). 사진 메타는 길이만 맞는 자리표시
    // 값으로 미리 검증해, 흘리는 도중에 스키마 오류가 날 일이 없게 한다.
    const meta = MealDataBackup.parse({
      format: MEAL_DATA_BACKUP_FORMAT,
      version: MEAL_DATA_BACKUP_VERSION,
      archiveId: randomUUID(),
      exportedAt: this.now().toISOString(),
      notice: {
        encoding: 'json-base64',
        orphanPhotosSkipped: orphanCount,
        duplicatePolicy: 'same-archive-id-is-idempotent',
        mergePolicy: 'append-records-keep-existing-preference',
      },
      entries,
      photos: [],
      preference: preferenceRow ? toMealPreference(preferenceRow) : null,
      recommendations,
    });
    const { photos: _none, preference, recommendations: parsedRecommendations, ...headFields } = meta;
    void _none;
    const head = `${JSON.stringify(headFields).slice(0, -1)},"photos":[`;
    const tail = `],"preference":${JSON.stringify(preference)},"recommendations":${JSON.stringify(parsedRecommendations)}}`;

    let photoJsonBytes = Math.max(0, photos.length - 1); // 사진 사이 쉼표
    for (const photo of photos) {
      // base64 길이 상한은 위 장당 크기 검사가 보장한다 — 나머지 필드만 자리표시 값으로 검증한다.
      const shell = MealDataBackupPhoto.parse(this.photoFields(photo.shell, 'AAAA', photo.size));
      // 해시 자리표시는 실제와 길이가 같고, base64·hex 는 JSON 이스케이프가 없어 바이트 수가 정확하다.
      photoJsonBytes += Buffer.byteLength(JSON.stringify({ ...shell, dataBase64: '' })) + base64Length(photo.size);
    }
    if (Buffer.byteLength(head) + Buffer.byteLength(tail) + photoJsonBytes > MEAL_DATA_BACKUP_MAX_JSON_BYTES) {
      throw new MealDataError(
        'backup_too_large',
        `백업 파일이 전체 크기 한도(${MEAL_DATA_BACKUP_MAX_JSON_BYTES / MB}MB)를 넘었습니다.`,
      );
    }
    return { head, tail, photos };
  }

  /** 백업 사진 한 장의 필드 — 스키마(MealDataBackupPhoto) 키 순서 그대로. */
  private photoFields(
    shell: { ref: string; width: number | null; height: number | null },
    dataBase64: string,
    byteSize: number,
    sha256 = '0'.repeat(64),
  ) {
    return {
      ref: shell.ref,
      contentType: 'image/jpeg' as const,
      dataBase64,
      sha256,
      byteSize,
      width: shell.width,
      height: shell.height,
    };
  }

  private async *backupChunks(
    userId: string,
    plan: Awaited<ReturnType<MealDataService['planBackup']>>,
  ): AsyncGenerator<string> {
    yield plan.head;
    const MARK = '"dataBase64":"__PHOTO__"';
    for (const [index, photo] of plan.photos.entries()) {
      const bytes = await this.deps.photos.readOwnedFile(userId, photo.token);
      if (bytes.byteLength !== photo.size) {
        // 장벽 안이라 바뀔 수 없는 파일이 바뀌었다 — 잘린 JSON 이 되도록 스트림을 실패시킨다.
        throw new Error('meal backup photo changed while streaming');
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const fields = MealDataBackupPhoto.parse(
        this.photoFields(photo.shell, 'AAAA', bytes.byteLength, sha256),
      );
      const json = JSON.stringify({ ...fields, dataBase64: '__PHOTO__' });
      const at = json.indexOf(MARK);
      yield `${index > 0 ? ',' : ''}${json.slice(0, at)}"dataBase64":"`;
      for (let offset = 0; offset < bytes.byteLength; offset += BASE64_SLICE_BYTES) {
        yield bytes.subarray(offset, offset + BASE64_SLICE_BYTES).toString('base64');
      }
      yield `"${json.slice(at + MARK.length)}`;
    }
    yield plan.tail;
  }

  async restore(userId: string, archive: MealDataBackupType): Promise<RestoreMealDataResultType> {
    const previous = await this.prisma.mealDataImport.findUnique({
      where: { userId_archiveId: { userId, archiveId: archive.archiveId } },
    });
    if (previous) return duplicateResult(previous);

    const entryRefs = new Set<string>();
    const recommendationRefs = new Set<string>();
    const photoByRef = new Map(archive.photos.map((photo) => [photo.ref, photo]));
    const usedPhotoRefs = new Set<string>();
    for (const entry of archive.entries) {
      if (entryRefs.has(entry.ref)) {
        throw new MealDataError('invalid_backup', '기록 참조가 중복되었습니다.');
      }
      entryRefs.add(entry.ref);
      for (const photoRef of entry.photoRefs) {
        if (!photoByRef.has(photoRef)) {
          throw new MealDataError('invalid_backup', '기록이 존재하지 않는 사진을 참조합니다.');
        }
        if (usedPhotoRefs.has(photoRef)) {
          throw new MealDataError('invalid_backup', '한 사진을 여러 기록에 연결할 수 없습니다.');
        }
        usedPhotoRefs.add(photoRef);
      }
    }
    if (usedPhotoRefs.size !== archive.photos.length) {
      throw new MealDataError('invalid_backup', '기록에 연결되지 않은 사진 payload가 있습니다.');
    }
    for (const recommendation of archive.recommendations) {
      if (recommendationRefs.has(recommendation.ref)) {
        throw new MealDataError('invalid_backup', '추천 참조가 중복되었습니다.');
      }
      recommendationRefs.add(recommendation.ref);
    }
    for (const entry of archive.entries) {
      if (entry.originRecommendationRef && !recommendationRefs.has(entry.originRecommendationRef)) {
        throw new MealDataError('invalid_backup', '기록의 원본 추천 참조가 올바르지 않습니다.');
      }
      if ((entry.source === 'recommendation') !== (entry.originRecommendationRef !== null)) {
        throw new MealDataError('invalid_backup', '추천 출처 기록과 원본 추천 참조가 일치하지 않습니다.');
      }
      safeDate(entry.eatenAt, 'eatenAt');
      safeDate(entry.createdAt, 'createdAt');
      safeDate(entry.updatedAt, 'updatedAt');
    }
    for (const recommendation of archive.recommendations) {
      if (recommendation.feedback?.eatenEntryRef && !entryRefs.has(recommendation.feedback.eatenEntryRef)) {
        throw new MealDataError('invalid_backup', '추천의 식단 기록 참조가 올바르지 않습니다.');
      }
      safeDate(recommendation.createdAt, 'recommendation.createdAt');
      for (const event of recommendation.events) safeDate(event.createdAt, 'event.createdAt');
    }
    // 선언 크기로 먼저 거른다(디코드 전). 복원 한도는 예전 백업(50MB)과 호환되게 새 백업 한도보다 크다.
    const declaredBytes = archive.photos.reduce((sum, photo) => sum + photo.byteSize, 0);
    if (declaredBytes > MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES) {
      throw new MealDataError(
        'backup_too_large',
        `사진 합계가 복원 한도(${MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES / MB}MB)를 넘습니다.`,
      );
    }

    const releaseGate = await this.acquireArchiveGate();
    try {
      // 사진은 한 장씩 디코드·검증하고 버린다(전부 Buffer 로 들고 있지 않는다). 저장 단계에서 다시 디코드한다.
      let totalBytes = 0;
      for (const photo of archive.photos) totalBytes += this.decodePhoto(photo, totalBytes).byteLength;

      return await mealMutationBarrier.runExclusive(userId, async () => {
        // 구조·해시 검증은 장벽 밖에서 끝내되, 멱등 재확인부터 사진 저장·메타데이터 커밋·실패
        // 정리까지는 같은 사용자 장벽 안에 둔다. deleteAll/기록 쓰기가 사진 사이에 끼지 않는다.
        const lockedPrevious = await this.prisma.mealDataImport.findUnique({
          where: { userId_archiveId: { userId, archiveId: archive.archiveId } },
        });
        if (lockedPrevious) return duplicateResult(lockedPrevious);
        const ids = restoreIdsOf(userId, archive);
        // 원장이 없는데 이 아카이브의 id 로 된 행이 있으면 앞선 복원이 도중에 끊긴 것 — 지우고 처음부터 다시 쓴다.
        // 상한 검사는 그 뒤에(잔여 행을 기존 기록으로 세면 재시도가 상한에 걸린다).
        await this.discardInterruptedRestore(userId, ids);
        await this.assertRestoreFits(userId, archive);
        return this.restoreLocked(userId, archive, ids);
      });
    } finally {
      releaseGate();
    }
  }

  /** base64 → 바이트 + 크기·정규형·sha256 검증. running 은 앞 사진들의 합계. */
  private decodePhoto(photo: MealDataBackupType['photos'][number], running: number): Buffer {
    const bytes = Buffer.from(photo.dataBase64, 'base64');
    if (
      bytes.byteLength !== photo.byteSize ||
      bytes.byteLength <= 0 ||
      bytes.byteLength > MEAL_DATA_BACKUP_MAX_PHOTO_BYTES ||
      running + bytes.byteLength > MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES ||
      bytes.toString('base64') !== photo.dataBase64 ||
      createHash('sha256').update(bytes).digest('hex') !== photo.sha256
    ) {
      throw new MealDataError('invalid_backup', '사진 payload의 크기 또는 무결성 값이 일치하지 않습니다.');
    }
    return bytes;
  }

  /** 복원 뒤 기록 수가 계정·하루 상한을 넘지 않는지(장벽 안에서). 아카이브에 있는 날짜만 하루 상한을 본다. */
  private async assertRestoreFits(userId: string, archive: MealDataBackupType): Promise<void> {
    if (archive.entries.length === 0) return;
    const [existing, perDay] = await Promise.all([
      this.prisma.mealEntry.count({ where: { userId } }),
      this.prisma.mealEntry.groupBy({
        by: ['eatenDate'],
        where: { userId, eatenDate: { in: [...new Set(archive.entries.map((entry) => entry.eatenDate))] } },
        _count: { _all: true },
      }),
    ]);
    if (existing + archive.entries.length > MEAL_MAX_ENTRIES_PER_USER) {
      throw new MealDataError(
        'limit_exceeded',
        `복원하면 식단 기록이 계정 상한(${MEAL_MAX_ENTRIES_PER_USER.toLocaleString('ko-KR')}건)을 넘습니다(현재 ${existing.toLocaleString('ko-KR')}건 + 백업 ${archive.entries.length.toLocaleString('ko-KR')}건).`,
      );
    }
    const counts = new Map(perDay.map((row) => [row.eatenDate, row._count._all]));
    for (const entry of archive.entries) counts.set(entry.eatenDate, (counts.get(entry.eatenDate) ?? 0) + 1);
    for (const [date, count] of counts) {
      if (count > MEAL_MAX_ENTRIES_PER_DAY) {
        throw new MealDataError(
          'limit_exceeded',
          `복원하면 ${date} 기록이 하루 상한(${MEAL_MAX_ENTRIES_PER_DAY}끼)을 넘습니다.`,
        );
      }
    }
  }

  /** 복원이 만든 기록·추천·사진을 지운다(실패 정리·끊긴 복원의 잔여 정리 공용). 사진 파일은 행을 지운 뒤에. */
  private async removeRestoredRows(
    userId: string,
    entryIds: string[],
    recommendationIds: string[],
    photos: Array<{ userId: string; token: string }>,
  ): Promise<void> {
    for (const ids of chunk(entryIds, CLEANUP_CHUNK)) {
      // 기록을 지우면 항목·붙은 사진 행이 cascade 로 함께 지워진다.
      await this.prisma.mealEntry.deleteMany({ where: { userId, id: { in: ids } } });
    }
    for (const ids of chunk(recommendationIds, CLEANUP_CHUNK)) {
      await this.prisma.mealRecommendation.deleteMany({ where: { userId, id: { in: ids } } });
    }
    if (photos.length === 0) return;
    for (const tokens of chunk(photos.map((photo) => photo.token), CLEANUP_CHUNK)) {
      await this.prisma.mealPhoto.deleteMany({ where: { userId, entryId: null, token: { in: tokens } } });
    }
    await this.deps.photos.removeFiles(photos);
  }

  /**
   * 같은 아카이브의 앞선 복원이 도중에 끊겨(프로세스 종료) 남긴 행·사진을 지운다. 원장이 없다는 것은 호출자가 같은
   * 사용자 장벽 안에서 확인했다 — 복원은 장벽 안에서만 돌므로, 원장 없이 이 아카이브의 id 로 남은 행은 끝난 복원이
   * 아니다. 사진은 이 아카이브의 토큰 중 기록에 안 붙었거나 지울 기록에 붙은 것만 지운다.
   */
  private async discardInterruptedRestore(userId: string, ids: RestoreIds): Promise<void> {
    const entryIds: string[] = [];
    for (const part of chunk([...ids.entries.values()], CLEANUP_CHUNK)) {
      const rows = await this.prisma.mealEntry.findMany({ where: { userId, id: { in: part } }, select: { id: true } });
      entryIds.push(...rows.map((row) => row.id));
    }
    const recommendationIds: string[] = [];
    for (const part of chunk([...ids.recommendations.values()], CLEANUP_CHUNK)) {
      const rows = await this.prisma.mealRecommendation.findMany({ where: { userId, id: { in: part } }, select: { id: true } });
      recommendationIds.push(...rows.map((row) => row.id));
    }
    const leftover = new Set(entryIds);
    const photos: Array<{ userId: string; token: string }> = [];
    for (const part of chunk([...ids.photos.values()], CLEANUP_CHUNK)) {
      const rows = await this.prisma.mealPhoto.findMany({
        where: { userId, token: { in: part } },
        select: { token: true, entryId: true },
      });
      for (const row of rows) {
        if (row.entryId === null || leftover.has(row.entryId)) photos.push({ userId, token: row.token });
      }
    }
    if (entryIds.length === 0 && recommendationIds.length === 0 && photos.length === 0) return;
    await this.removeRestoredRows(userId, entryIds, recommendationIds, photos);
  }

  /**
   * 장벽 안의 실제 복원. 사진 파일·행을 먼저 만들고, 기록·추천은 id 를 미리 정해(restoreIdsOf) createMany 로 청크마다
   * 짧은 트랜잭션에 쓴다(한 트랜잭션에 수천 건을 행 단위로 넣으면 쓰기 락이 수 초, 5,000건은 5초 타임아웃).
   * 중간에 실패하면 만든 id 로 지우고 사진도 정리한다 — 원장(mealDataImport)은 마지막 트랜잭션에서만 쓴다. 정리도 못
   * 하고 프로세스가 끝나면 남은 행은 같은 아카이브의 재시도가 지운다(discardInterruptedRestore).
   */
  private async restoreLocked(
    userId: string,
    archive: MealDataBackupType,
    ids: RestoreIds,
  ): Promise<RestoreMealDataResultType> {
    const stored: Array<{ ref: string; userId: string; token: string }> = [];
    const createdEntryIds: string[] = [];
    const createdRecommendationIds: string[] = [];
    const cleanup = (): Promise<void> => this.removeRestoredRows(userId, createdEntryIds, createdRecommendationIds, stored);

    try {
      let running = 0;
      for (const photo of archive.photos) {
        const bytes = this.decodePhoto(photo, running);
        running += bytes.byteLength;
        const created = await this.deps.photos.storeWhileMutationLocked(userId, bytes, { token: ids.photos.get(photo.ref) });
        stored.push({ ref: photo.ref, userId, token: created.token });
      }
      const storedByRef = new Map(stored.map((photo) => [photo.ref, photo.token]));
      const recommendationIds = ids.recommendations;
      const entryIds = ids.entries;

      // 추천은 행동 이력 수까지(추천 1건당 이벤트 최대 200개), 기록은 항목 수까지 고려해 청크로 나눈다.
      const recommendationChunks = chunkByBudget(
        archive.recommendations,
        RESTORE_RECOMMENDATION_CHUNK,
        RESTORE_EVENT_CHUNK,
        (recommendation) => recommendation.events.length,
      );
      const entryChunks = chunkByBudget(
        archive.entries,
        RESTORE_ENTRY_CHUNK,
        RESTORE_ITEM_CHUNK,
        (entry) => entry.items.length,
      );

      let wroteChunk = false;
      const beforeChunk = async (): Promise<void> => {
        if (wroteChunk) await new Promise((resolve) => setTimeout(resolve, RESTORE_CHUNK_PAUSE_MS));
        wroteChunk = true;
      };

      for (const part of recommendationChunks) {
        const ids = part.map((recommendation) => recommendationIds.get(recommendation.ref)!);
        await beforeChunk();
        await this.prisma.$transaction(async (tx) => {
          await tx.mealRecommendation.createMany({
            data: part.map((recommendation) => ({
              id: recommendationIds.get(recommendation.ref)!,
              userId,
              targetDate: recommendation.targetDate,
              targetSlot: recommendation.targetSlot,
              contextJson: JSON.stringify(recommendation.context),
              profileJson: JSON.stringify(recommendation.profile),
              profileHash: recommendation.profileHash,
              itemsJson: JSON.stringify(recommendation.items),
              summary: recommendation.summary,
              notice: recommendation.notice,
              status: recommendation.status,
              model: recommendation.model,
              promptVersion: recommendation.promptVersion,
              // 기록 id 를 미리 알고 있으므로 연결까지 한 번에 쓴다(예전: 만든 뒤 update).
              feedbackJson: recommendation.feedback
                ? JSON.stringify({
                    pickedName: recommendation.feedback.pickedName,
                    rating: recommendation.feedback.rating,
                    eatenEntryId: recommendation.feedback.eatenEntryRef
                      ? (entryIds.get(recommendation.feedback.eatenEntryRef) ?? null)
                      : null,
                  })
                : null,
              createdAt: safeDate(recommendation.createdAt, 'recommendation.createdAt'),
            })),
          });
          const events = part.flatMap((recommendation) =>
            recommendation.events.map((event) => ({
              recommendationId: recommendationIds.get(recommendation.ref)!,
              userId,
              kind: event.kind,
              candidateName: event.candidateName,
              candidateFoodId: event.candidateFoodId,
              candidateRank: event.candidateRank,
              rating: event.rating,
              platform: event.platform,
              rankingVersion: event.rankingVersion,
              createdAt: safeDate(event.createdAt, 'event.createdAt'),
            })),
          );
          if (events.length > 0) await tx.mealRecommendationEvent.createMany({ data: events });
        });
        createdRecommendationIds.push(...ids);
      }

      let itemCount = 0;
      for (const part of entryChunks) {
        const ids = part.map((entry) => entryIds.get(entry.ref)!);
        await beforeChunk();
        await this.prisma.$transaction(async (tx) => {
          await tx.mealEntry.createMany({
            data: part.map((entry) => ({
              id: entryIds.get(entry.ref)!,
              userId,
              eatenAt: safeDate(entry.eatenAt, 'eatenAt'),
              eatenDate: entry.eatenDate,
              slot: entry.slot,
              mealType: entry.mealType,
              placeId: entry.placeId,
              placeName: entry.placeName,
              memo: entry.memo,
              source: entry.source,
              originRecommendationId: entry.originRecommendationRef
                ? (recommendationIds.get(entry.originRecommendationRef) ?? null)
                : null,
              recognitionJson: entry.recognition ? JSON.stringify(entry.recognition) : null,
              photoPurgedAt: entry.photoPurgedAt ? safeDate(entry.photoPurgedAt, 'photoPurgedAt') : null,
              createdAt: safeDate(entry.createdAt, 'createdAt'),
              updatedAt: safeDate(entry.updatedAt, 'updatedAt'),
            })),
          });
          await tx.mealItem.createMany({
            data: part.flatMap((entry) =>
              entry.items.map((item, index) => ({
                entryId: entryIds.get(entry.ref)!,
                name: item.name,
                nameNorm: normalizeTerm(item.name),
                foodId: item.foodId,
                dishType: item.dishType,
                mainIngredient: item.mainIngredient,
                cuisine: item.cuisine,
                portion: item.portion,
                servings: item.servings,
                portionSource: item.portionSource,
                isMain: item.isMain,
                confidence: item.confidence,
                recognitionDishId: item.recognitionDishId,
                selectedCandidateRank: item.selectedCandidateRank,
                catalogMatchedBy: item.catalogMatchedBy,
                catalogMatchScore: item.catalogMatchScore,
                source: item.source,
                sortOrder: index,
                kcal: item.kcal,
                proteinG: item.proteinG,
                sodiumMg: item.sodiumMg,
                nutritionFrom: item.nutritionFrom,
                nutritionBasis: item.nutritionBasis,
              })),
            ),
          });
          for (const entry of part) {
            for (const [sortOrder, photoRef] of entry.photoRefs.entries()) {
              const token = storedByRef.get(photoRef);
              if (!token) throw new MealDataError('invalid_backup', '복원할 사진을 찾을 수 없습니다.');
              const attached = await tx.mealPhoto.updateMany({
                where: { userId, token, entryId: null },
                data: { entryId: entryIds.get(entry.ref)!, sortOrder },
              });
              if (attached.count !== 1) {
                throw new MealDataError('invalid_backup', '복원 사진 소유권 검증에 실패했습니다.');
              }
            }
          }
        });
        createdEntryIds.push(...ids);
        itemCount += part.reduce((sum, entry) => sum + entry.items.length, 0);
      }

      await beforeChunk();
      return await this.prisma.$transaction(async (tx) => {
        let preference: RestoreMealDataResultType['restored']['preference'] = 'none';
        if (archive.preference) {
          const existing = await tx.mealPreference.findUnique({ where: { userId }, select: { userId: true } });
          if (existing) {
            preference = 'kept_existing';
          } else {
            await tx.mealPreference.create({
              data: {
                userId,
                weightsJson: JSON.stringify(archive.preference.weights),
                excludedFoodsJson: JSON.stringify(archive.preference.excludedFoods),
                allergensJson: JSON.stringify(archive.preference.allergens),
                dislikedFoodsJson: JSON.stringify(archive.preference.dislikedFoods),
                likedFoodsJson: JSON.stringify(archive.preference.likedFoods),
                mealTypesJson: JSON.stringify(archive.preference.mealTypes),
                slotsJson: JSON.stringify(archive.preference.slots),
                // 영양소 점검 기준(선택) — 이 필드가 없던 백업은 비운다.
                sex: archive.preference.sex ?? null,
                birthYear: archive.preference.birthYear ?? null,
                onboarded: archive.preference.onboarded,
              },
            });
            preference = 'restored';
          }
        }

        const counts = {
          entries: archive.entries.length,
          items: itemCount,
          photos: stored.length,
          recommendations: archive.recommendations.length,
          recommendationEvents: archive.recommendations.reduce(
            (sum, recommendation) => sum + recommendation.events.length,
            0,
          ),
          preference,
        };
        await tx.mealDataImport.create({
          data: {
            userId,
            archiveId: archive.archiveId,
            entries: counts.entries,
            items: counts.items,
            photos: counts.photos,
            recommendations: counts.recommendations,
            recommendationEvents: counts.recommendationEvents,
            preferenceResult: counts.preference,
          },
        });
        return { archiveId: archive.archiveId, duplicate: false as const, restored: counts };
      });
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  async deleteAll(
    userId: string,
    input: DeleteMealDataInputType,
  ): Promise<DeleteMealDataResultType> {
    // 라우트의 Zod 검증에 더해 서비스 직접 호출도 같은 안전장치를 통과해야 한다.
    if (input.confirmation !== MEAL_DATA_DELETE_CONFIRMATION) {
      throw new MealDataError('invalid_confirmation', '전체 삭제 확인 문구가 일치하지 않습니다.');
    }

    return mealMutationBarrier.runExclusive(userId, async () => {
      // 장벽 밖에서 계산 중인 추천·영양제 조언이 이 삭제 뒤에 저장되지 않게 세대를 먼저 올린다.
      mealDataGeneration.bump(userId, 'all');
      const committed = await this.prisma.$transaction(async (tx) => {
        const [photoRows, entryRows] = await Promise.all([
          // 붙은 사진과 고아 사진 모두 userId 소유 기준으로 수집한다.
          tx.mealPhoto.findMany({
            where: { userId },
            select: { userId: true, token: true },
          }),
          tx.mealEntry.findMany({ where: { userId }, select: { id: true } }),
        ]);
        const entryIds = entryRows.map((entry) => entry.id);

        // cascade 에만 기대면 하위 행 삭제 건수를 알 수 없으므로 명시적으로 지운다.
        const photos = await tx.mealPhoto.deleteMany({ where: { userId } });
        const items =
          entryIds.length > 0
            ? await tx.mealItem.deleteMany({ where: { entryId: { in: entryIds } } })
            : { count: 0 };
        const entries = await tx.mealEntry.deleteMany({ where: { userId } });
        const recommendationEvents = await tx.mealRecommendationEvent.deleteMany({ where: { userId } });
        const recommendations = await tx.mealRecommendation.deleteMany({ where: { userId } });
        const nutritionAdvices = await tx.mealNutritionAdvice.deleteMany({ where: { userId } });
        const preference = await tx.mealPreference.deleteMany({ where: { userId } });
        const dailyQuotas = await tx.mealDailyQuota.deleteMany({ where: { userId } });
        // 전체 삭제 뒤 같은 archiveId를 다시 복원할 수 있어야 하므로 멱등 원장도 비운다.
        const importLedgers = await tx.mealDataImport.deleteMany({ where: { userId } });

        return {
          photoRows,
          deleted: {
            entries: entries.count,
            items: items.count,
            photos: photos.count,
            recommendations: recommendations.count,
            recommendationEvents: recommendationEvents.count,
            nutritionAdvices: nutritionAdvices.count,
            dailyQuotas: dailyQuotas.count,
            importLedgers: importLedgers.count,
            preference: preference.count,
            photoFileSets: photoRows.length,
          },
        };
      });

      // 파일 side effect 는 DB 커밋 뒤에만 실행한다. 사용자 HMAC으로 추적하는 인식 디버그
      // 덤프를 먼저 지우고, 사진은 추적 행별 삭제가 아닌 사용자 전용 폴더 전체를 지운다.
      // 실패는 전파해 200을 막는다. 다음 재호출에서는 DB가 이미 비었어도 userId 해시와 force
      // 폴더 삭제를 동일하게 재시도하므로 멱등하다.
      await (this.deps.purgeRecognitionDebugForUser ?? purgeMealRecognitionDebugDumpsForUser)(
        userId,
        committed.photoRows.map((photo) => photo.token),
      );
      await this.deps.photos.removeAllFilesForUser(userId);
      // 전체 사용자 폴더 삭제가 성공한 뒤에만 과거 retention outbox를 비운다. 폴더 삭제가
      // 실패하면 행이 남으므로 동일 DELETE 또는 cron에서 다시 시도할 수 있다.
      await this.prisma.mealPhotoDeletion.deleteMany({ where: { userId } });
      return { deleted: committed.deleted };
    });
  }
}
