import type { PrismaClient } from '@prisma/client';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_DATA_EXPORT_FORMAT,
  MEAL_DATA_EXPORT_VERSION,
  type DeleteMealDataInputType,
  type DeleteMealDataResultType,
  type MealDataExportPhotoType,
  type MealDataExportType,
} from '@repo/api-contract';
import { toRecommendation } from '../meal-recommendation/meal-recommendation.service.js';
import { mealMutationBarrier } from './meal-mutation-barrier.js';
import type { MealPhotoService } from './meal-photo.service.js';
import { toMealPreference } from './meal-preference.service.js';
import { toMealEntry } from './meal.service.js';

export const MEAL_DATA_EXPORT_PHOTO_NOTICE =
  '사진 바이너리는 이 JSON에 포함되지 않습니다. 토큰·크기·용량·정렬·생성 시각 메타데이터만 포함됩니다.';

export class MealDataError extends Error {
  constructor(
    readonly code: 'invalid_confirmation',
    message: string,
  ) {
    super(message);
    this.name = 'MealDataError';
  }
}

export interface MealDataServiceDeps {
  photos: MealPhotoService;
  now?: () => Date;
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
      })),
    };
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
        const recommendations = await tx.mealRecommendation.deleteMany({ where: { userId } });
        const preference = await tx.mealPreference.deleteMany({ where: { userId } });

        return {
          photoRows,
          deleted: {
            entries: entries.count,
            items: items.count,
            photos: photos.count,
            recommendations: recommendations.count,
            preference: preference.count,
            photoFileSets: photoRows.length,
          },
        };
      });

      // 파일 side effect 는 DB 커밋 뒤에만 실행한다. 추적 행별 삭제가 아니라 사용자 전용 폴더를
      // 엄격히 지워 과거 미추적 파일도 남기지 않는다. 실패는 전파해 200을 막고, 다음 재호출은
      // DB가 이미 비었어도 force 폴더 삭제를 다시 시도한다.
      await this.deps.photos.removeAllFilesForUser(userId);
      return { deleted: committed.deleted };
    });
  }
}
