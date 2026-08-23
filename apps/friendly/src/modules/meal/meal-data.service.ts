import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  MEAL_DATA_BACKUP_FORMAT,
  MEAL_DATA_BACKUP_MAX_ENTRIES,
  MEAL_DATA_BACKUP_MAX_EVENTS_PER_RECOMMENDATION,
  MEAL_DATA_BACKUP_MAX_JSON_BYTES,
  MEAL_DATA_BACKUP_MAX_PHOTO_BYTES,
  MEAL_DATA_BACKUP_MAX_PHOTOS,
  MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS,
  MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES,
  MEAL_DATA_BACKUP_VERSION,
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_DATA_EXPORT_FORMAT,
  MEAL_DATA_EXPORT_VERSION,
  MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
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
import { normalizeTerm } from '../../lib/text.js';
import {
  toRecommendation,
  toRecommendationEvent,
} from '../meal-recommendation/meal-recommendation.service.js';
import { mealMutationBarrier } from './meal-mutation-barrier.js';
import { purgeMealRecognitionDebugDumpsForUser } from './meal-recognition-debug.store.js';
import type { MealPhotoService } from './meal-photo.service.js';
import { toMealPreference } from './meal-preference.service.js';
import { toMealEntry } from './meal.service.js';

export const MEAL_DATA_EXPORT_PHOTO_NOTICE =
  '사진 바이너리는 이 JSON에 포함되지 않습니다. 토큰·크기·용량·정렬·생성 시각 메타데이터만 포함됩니다.';

export class MealDataError extends Error {
  constructor(
    readonly code: 'invalid_confirmation' | 'backup_too_large' | 'invalid_backup',
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

/**
 * 내 식단 데이터 portability/삭제 경계. 모든 쿼리는 userId 로 한정하고 전체 삭제는 한 DB
 * 트랜잭션으로 커밋한 뒤 사진 파일만 멱등 제거한다(파일 삭제는 DB 롤백 대상이 될 수 없다).
 */
export class MealDataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: MealDataServiceDeps,
  ) {}

  async export(userId: string): Promise<MealDataExportType> {
    const snapshot = await this.prisma.$transaction(async (tx) => {
      const [entries, preference, recommendations, orphanPhotos] = await Promise.all([
        tx.mealEntry.findMany({
          where: { userId },
          include: { items: true, photos: true },
          orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }],
        }),
        tx.mealPreference.findUnique({ where: { userId } }),
        tx.mealRecommendation.findMany({
          where: { userId },
          include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
        tx.mealPhoto.findMany({
          where: { userId, entryId: null },
          orderBy: [{ createdAt: 'asc' }, { token: 'asc' }],
        }),
      ]);
      return { entries, preference, recommendations, orphanPhotos };
    });

    return {
      format: MEAL_DATA_EXPORT_FORMAT,
      version: MEAL_DATA_EXPORT_VERSION,
      exportedAt: (this.deps.now?.() ?? new Date()).toISOString(),
      notice: {
        photoBinariesIncluded: false,
        message: MEAL_DATA_EXPORT_PHOTO_NOTICE,
      },
      entries: snapshot.entries.map((row) => ({
        ...toMealEntry(row, { withRecognition: true, withPhotos: true }),
        photos: [...row.photos]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(toExportPhoto),
      })),
      orphanPhotos: snapshot.orphanPhotos.map(toExportPhoto),
      preference: snapshot.preference ? toMealPreference(snapshot.preference) : null,
      recommendations: snapshot.recommendations.map((row) => ({
        ...toRecommendation(row),
        context: parseObject(row.contextJson),
        profile: parseObject(row.profileJson),
        profileHash: row.profileHash,
        events: row.events.map(toRecommendationEvent),
      })),
    };
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
    const [entries, orphans] = await this.prisma.$transaction(async (tx) =>
      Promise.all([
        tx.mealEntry.findMany({
          where: {
            userId,
            ...(before ? { eatenDate: { lt: before } } : {}),
            photos: { some: {} },
          },
          select: { id: true, photos: { select: { byteSize: true } } },
        }),
        tx.mealPhoto.findMany({
          where: {
            userId,
            entryId: null,
            ...(before ? { createdAt: { lt: toSeoulDayStart(before) } } : {}),
          },
          select: { byteSize: true },
        }),
      ]),
    );
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

  async backup(userId: string): Promise<MealDataBackupType> {
    return mealMutationBarrier.runExclusive(userId, async () => {
      const snapshot = await this.prisma.$transaction(async (tx) => {
        const [entryCount, recommendationCount, photoAggregate, orphanCount] = await Promise.all([
          tx.mealEntry.count({ where: { userId } }),
          tx.mealRecommendation.count({ where: { userId } }),
          tx.mealPhoto.aggregate({
            where: { userId, entryId: { not: null } },
            _count: { _all: true },
            _sum: { byteSize: true },
          }),
          tx.mealPhoto.count({ where: { userId, entryId: null } }),
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
            `사진 포함 백업 한도(기록 ${MEAL_DATA_BACKUP_MAX_ENTRIES}개, 추천 ${MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS}개, 사진 ${MEAL_DATA_BACKUP_MAX_PHOTOS}개/50MB)를 넘었습니다. 오래된 사진을 먼저 정리해 주세요.`,
          );
        }

        const [entries, preference, recommendations] = await Promise.all([
          tx.mealEntry.findMany({
            where: { userId },
            include: { items: true, photos: true },
            orderBy: [{ eatenAt: 'asc' }, { id: 'asc' }],
          }),
          tx.mealPreference.findUnique({ where: { userId } }),
          tx.mealRecommendation.findMany({
            where: { userId },
            include: { events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
        ]);
        return { entries, preference, recommendations, orphanCount };
      });

      const entryRefs = new Map(
        snapshot.entries.map((entry, index) => [entry.id, `entry-${String(index + 1).padStart(6, '0')}`]),
      );
      const recommendationRefs = new Map(
        snapshot.recommendations.map((recommendation, index) => [
          recommendation.id,
          `recommendation-${String(index + 1).padStart(6, '0')}`,
        ]),
      );
      const orderedPhotos = snapshot.entries.flatMap((entry) =>
        [...entry.photos]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((photo) => ({ entryId: entry.id, photo })),
      );
      const photoRefs = new Map(
        orderedPhotos.map(({ photo }, index) => [photo.token, `photo-${String(index + 1).padStart(6, '0')}`]),
      );

      let actualPhotoBytes = 0;
      const photos: MealDataBackupType['photos'] = [];
      for (const { photo } of orderedPhotos) {
        const bytes = await this.deps.photos.read(userId, photo.token, 'full');
        actualPhotoBytes += bytes.byteLength;
        if (
          bytes.byteLength <= 0 ||
          bytes.byteLength > MEAL_DATA_BACKUP_MAX_PHOTO_BYTES ||
          actualPhotoBytes > MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES
        ) {
          throw new MealDataError(
            'backup_too_large',
            '사진 파일의 실제 크기가 백업 한도(장당 5MB, 합계 50MB)를 넘었습니다.',
          );
        }
        photos.push({
          ref: photoRefs.get(photo.token)!,
          contentType: 'image/jpeg',
          dataBase64: bytes.toString('base64'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          byteSize: bytes.byteLength,
          width: photo.width,
          height: photo.height,
        });
      }

      const entries: MealDataBackupType['entries'] = snapshot.entries.map((row) => {
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

      const recommendations: MealDataBackupType['recommendations'] = snapshot.recommendations.map((row) => {
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

      const backup: MealDataBackupType = {
        format: MEAL_DATA_BACKUP_FORMAT,
        version: MEAL_DATA_BACKUP_VERSION,
        archiveId: randomUUID(),
        exportedAt: (this.deps.now?.() ?? new Date()).toISOString(),
        notice: {
          encoding: 'json-base64',
          orphanPhotosSkipped: snapshot.orphanCount,
          duplicatePolicy: 'same-archive-id-is-idempotent',
          mergePolicy: 'append-records-keep-existing-preference',
        },
        entries,
        photos,
        preference: snapshot.preference ? toMealPreference(snapshot.preference) : null,
        recommendations,
      };
      if (Buffer.byteLength(JSON.stringify(backup), 'utf8') > MEAL_DATA_BACKUP_MAX_JSON_BYTES) {
        throw new MealDataError('backup_too_large', '백업 파일이 전체 크기 한도(75MB)를 넘었습니다.');
      }
      return backup;
    });
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
    }

    let totalBytes = 0;
    const decoded = archive.photos.map((photo) => {
      const bytes = Buffer.from(photo.dataBase64, 'base64');
      totalBytes += bytes.byteLength;
      if (
        bytes.byteLength !== photo.byteSize ||
        bytes.byteLength <= 0 ||
        bytes.byteLength > MEAL_DATA_BACKUP_MAX_PHOTO_BYTES ||
        totalBytes > MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES ||
        bytes.toString('base64') !== photo.dataBase64 ||
        createHash('sha256').update(bytes).digest('hex') !== photo.sha256
      ) {
        throw new MealDataError('invalid_backup', '사진 payload의 크기 또는 무결성 값이 일치하지 않습니다.');
      }
      return { ref: photo.ref, bytes };
    });

    return mealMutationBarrier.runExclusive(userId, async () => {
      // 구조·해시 검증은 lock 밖에서 끝내되, 멱등 재확인부터 사진 저장·메타데이터 커밋·실패
      // 정리까지는 같은 사용자 lock 안에 둔다. deleteAll/기록 쓰기가 사진 사이에 끼지 않는다.
      const lockedPrevious = await this.prisma.mealDataImport.findUnique({
        where: { userId_archiveId: { userId, archiveId: archive.archiveId } },
      });
      if (lockedPrevious) return duplicateResult(lockedPrevious);

      const stored: Array<{ ref: string; userId: string; token: string }> = [];
      const cleanupStored = async (): Promise<void> => {
        if (stored.length === 0) return;
        await this.prisma.mealPhoto.deleteMany({
          where: { userId, entryId: null, token: { in: stored.map((photo) => photo.token) } },
        });
        await this.deps.photos.removeFiles(stored);
      };

      try {
        for (const photo of decoded) {
          const created = await this.deps.photos.storeWhileMutationLocked(userId, photo.bytes);
          stored.push({ ref: photo.ref, userId, token: created.token });
        }
        const storedByRef = new Map(stored.map((photo) => [photo.ref, photo.token]));

        const result = await this.prisma.$transaction(async (tx) => {
          const recommendationIds = new Map<string, string>();
          for (const recommendation of archive.recommendations) {
            const created = await tx.mealRecommendation.create({
              data: {
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
                feedbackJson: null,
                createdAt: safeDate(recommendation.createdAt, 'recommendation.createdAt'),
              },
            });
            recommendationIds.set(recommendation.ref, created.id);
            if (recommendation.events.length > 0) {
              await tx.mealRecommendationEvent.createMany({
                data: recommendation.events.map((event) => ({
                  recommendationId: created.id,
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
              });
            }
          }

          const restoredEntryIds = new Map<string, string>();
          let itemCount = 0;
          for (const entry of archive.entries) {
            const created = await tx.mealEntry.create({
              data: {
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
                photoPurgedAt: entry.photoPurgedAt
                  ? safeDate(entry.photoPurgedAt, 'photoPurgedAt')
                  : null,
                createdAt: safeDate(entry.createdAt, 'createdAt'),
                updatedAt: safeDate(entry.updatedAt, 'updatedAt'),
                items: {
                  create: entry.items.map((item, index) => ({
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
                },
              },
            });
            restoredEntryIds.set(entry.ref, created.id);
            itemCount += entry.items.length;
            for (const [sortOrder, photoRef] of entry.photoRefs.entries()) {
              const token = storedByRef.get(photoRef);
              if (!token) throw new MealDataError('invalid_backup', '복원할 사진을 찾을 수 없습니다.');
              const attached = await tx.mealPhoto.updateMany({
                where: { userId, token, entryId: null },
                data: { entryId: created.id, sortOrder },
              });
              if (attached.count !== 1) {
                throw new MealDataError('invalid_backup', '복원 사진 소유권 검증에 실패했습니다.');
              }
            }
          }

          for (const recommendation of archive.recommendations) {
            if (!recommendation.feedback) continue;
            const id = recommendationIds.get(recommendation.ref)!;
            await tx.mealRecommendation.update({
              where: { id },
              data: {
                feedbackJson: JSON.stringify({
                  pickedName: recommendation.feedback.pickedName,
                  rating: recommendation.feedback.rating,
                  eatenEntryId: recommendation.feedback.eatenEntryRef
                    ? (restoredEntryIds.get(recommendation.feedback.eatenEntryRef) ?? null)
                    : null,
                }),
              },
            });
          }

          let preference: RestoreMealDataResultType['restored']['preference'] = 'none';
          if (archive.preference) {
            const current = await tx.mealPreference.findUnique({ where: { userId }, select: { userId: true } });
            if (current) {
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
        return result;
      } catch (error) {
        await cleanupStored();
        throw error;
      }
    });
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
