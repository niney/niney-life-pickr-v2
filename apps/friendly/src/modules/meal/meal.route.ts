import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateMealEntryInput,
  DeleteMealPhotosInput,
  DeleteMealPhotosResult,
  DeleteMealDataInput,
  DeleteMealDataResult,
  ListMealEntriesQuery,
  ListMealEntriesResult,
  MealCalendarQuery,
  MealCalendarResult,
  MealDataBackup,
  MealDataExport,
  MealEntry,
  MealPreference,
  MealPhotoRetentionPreview,
  MealPhotoRetentionQuery,
  MealStatsQuery,
  MealTimePresetsResult,
  FrequentMealItemsQuery,
  FrequentMealItemsResult,
  RecentMealItemQuery,
  RecentMealItemResult,
  RestoreMealDataResult,
  MEAL_DATA_BACKUP_MAX_ENTRIES,
  MEAL_DATA_BACKUP_MAX_JSON_BYTES,
  MEAL_DATA_BACKUP_MAX_PHOTOS,
  MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS,
  MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES,
  MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES,
  MEAL_MAX_ENTRIES_PER_DAY,
  MEAL_MAX_ENTRIES_PER_USER,
  MEAL_STATS_MAX_DAYS,
  MealStatsResult,
  Routes,
  UpdateMealEntryInput,
  UpdateMealPreferenceInput,
  UploadMealPhotoResult,
  type MealDataBackupType,
  type MealDataExportType,
} from '@repo/api-contract';
import { daysBetween } from '@repo/utils';
import { RATE } from '../../plugins/rate-limit.js';
import { MealDataError, MealDataService } from './meal-data.service.js';
import { MealPhotoError, isValidMealPhotoToken } from './meal-photo.service.js';
import { MealPreferenceService } from './meal-preference.service.js';
import { createRestoreIntake } from './meal-restore-intake.js';
import { MealService, MealServiceError } from './meal.service.js';
import { MealStatsService } from './meal-stats.service.js';

// 식단 기록·사진·달력·통계·선호 — 전부 로그인 사용자 본인 것만(userId 스코프). 공개 표면 없음.
// 사진 저장 서비스는 plugins/meal.ts 가 decorate 한 전역 인스턴스(app.mealPhotos) — 고아 정리
// cron 과 같은 인스턴스를 공유한다.

const IdParams = z.object({ id: z.string().min(1).max(64) });
const TokenParams = z.object({ token: z.string().min(1).max(64) });

const mealRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const photos = app.mealPhotos;
  const meals = new MealService(app.prisma, { photos, estimator: app.mealNutritionEstimator });
  const mealData = new MealDataService(app.prisma, { photos });
  const stats = new MealStatsService(app.prisma);
  const preferences = new MealPreferenceService(app.prisma);

  const throwAsHttp = (e: unknown): never => {
    if (e instanceof MealServiceError) {
      if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
      if (e.code === 'photo_not_found') throw app.httpErrors.notFound(e.message);
      if (e.code === 'limit') throw app.httpErrors.conflict(e.message);
      throw app.httpErrors.badRequest(e.message);
    }
    if (e instanceof MealPhotoError) {
      if (e.code === 'not_found') throw app.httpErrors.notFound(e.message);
      if (e.code === 'forbidden') throw app.httpErrors.forbidden(e.message);
      if (e.code === 'quota' || e.code === 'attached') throw app.httpErrors.conflict(e.message);
      if (e.code === 'too_large') throw app.httpErrors.payloadTooLarge(e.message);
      if (e.code === 'busy') throw app.httpErrors.serviceUnavailable(e.message);
      throw app.httpErrors.badRequest(e.message);
    }
    throw e;
  };

  const throwMealDataAsHttp = (e: unknown): never => {
    if (e instanceof MealDataError) {
      if (e.code === 'backup_too_large') throw app.httpErrors.payloadTooLarge(e.message);
      if (e.code === 'limit_exceeded') throw app.httpErrors.conflict(e.message);
      if (e.code === 'busy') throw app.httpErrors.serviceUnavailable(e.message);
      throw app.httpErrors.badRequest(e.message);
    }
    if (e instanceof MealPhotoError) return throwAsHttp(e);
    throw e;
  };

  // ── 기록 ────────────────────────────────────────────────────────────
  typed.get(Routes.Meal.entries, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '내 식단 기록 목록 — 기간·끼니·유형·검색어 필터, 최신순 커서 페이지네이션',
      security: [{ bearerAuth: [] }],
      querystring: ListMealEntriesQuery,
      response: { 200: ListMealEntriesResult },
    },
    handler: async (req) => meals.list(req.user.userId, req.query),
  });

  typed.post(Routes.Meal.entries, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 기록 생성 — 음식 항목 1~20개·사진 토큰 최대 5장, 영양값은 서버가 채움',
      description:
        '사진은 먼저 POST /api/v1/meals/photos 로 올려 받은 token 을 photoTokens 에 순서대로 넣는다. ' +
        '항목의 칼로리·단백질·나트륨은 클라이언트가 보내지 않고 서버가 음식 카탈로그 매칭으로 스냅샷한다. ' +
        `기록은 계정당 ${MEAL_MAX_ENTRIES_PER_USER.toLocaleString('ko-KR')}건·하루 ${MEAL_MAX_ENTRIES_PER_DAY}끼까지이며 넘으면 409.`,
      security: [{ bearerAuth: [] }],
      body: CreateMealEntryInput,
      response: { 201: MealEntry },
    },
    handler: async (req, reply) => {
      try {
        const entry = await meals.create(req.user.userId, req.body);
        return reply.code(201).send(entry);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // 달력·통계는 :id 보다 먼저 등록해야 'calendar'/'stats' 가 id 로 잡히지 않는다.
  typed.get(Routes.Meal.calendar, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '월별 식단 달력 요약 — 날짜별 끼니 수·끼니 종류·사진 유무',
      security: [{ bearerAuth: [] }],
      querystring: MealCalendarQuery,
      response: { 200: MealCalendarResult },
    },
    handler: async (req) => {
      try {
        return await meals.calendar(req.user.userId, req.query.month);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // 끼니별 "내가 보통 먹는 시각" — 시간 입력 프리셋.
  typed.get(Routes.Meal.timePresets, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '끼니별 평소 식사 시각 프리셋 — 최근 90일 기록 중앙값, 3건 미만이면 기본값',
      security: [{ bearerAuth: [] }],
      response: { 200: MealTimePresetsResult },
    },
    handler: async (req) => meals.timePresets(req.user.userId),
  });

  // 수동 입력 보조 — 이 음식을 지난번에 어떻게 먹었나(양·분류·그때 사진).
  typed.get(Routes.Meal.recentItem, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '음식명으로 지난번 섭취 조회 — 마지막 날짜·양·분류·그때 사진 토큰',
      security: [{ bearerAuth: [] }],
      querystring: RecentMealItemQuery,
      response: { 200: RecentMealItemResult },
    },
    handler: async (req) => meals.findRecentItem(req.user.userId, req.query.name),
  });

  // 입력 화면 빠른 추가 칩 — 자주 먹은 음식 + 기본 목록.
  typed.get(Routes.Meal.frequentItems, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '빠른 추가용 자주 먹은 음식 — 최근 90일 끼니 우선 순위 + 기본 목록(공기밥·김치 등)',
      description:
        '최근 90일 기록을 끼니 단위로 세어 최근일수록(반감기 30일)·같은 끼니(slot)일수록 앞에 둔다. 이름·카탈로그 연결·양은 가장 최근 기록을, 주식/반찬 구분은 2번 이상이면 다수결을 따른다. limit 를 못 채우면 기본 목록(공기밥·배추김치·깍두기·달걀후라이·김구이·된장국·미역국, 반찬)으로 채운다.',
      security: [{ bearerAuth: [] }],
      querystring: FrequentMealItemsQuery,
      response: { 200: FrequentMealItemsResult },
    },
    handler: async (req) => meals.frequentItems(req.user.userId, req.query),
  });

  typed.get(Routes.Meal.stats, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '기간 식단 통계 — 분류별 분포·자주 먹은 음식·연속 기록·영양 평균·인사이트',
      description: `기간은 from~to(포함) 최대 ${MEAL_STATS_MAX_DAYS}일 — 넘으면 400.`,
      security: [{ bearerAuth: [] }],
      querystring: MealStatsQuery,
      response: { 200: MealStatsResult },
    },
    handler: async (req) => {
      if (req.query.from > req.query.to) {
        throw app.httpErrors.badRequest('from 이 to 보다 뒤입니다.');
      }
      // 범위 행을 모두 읽어 집계하므로 기간을 묶는다(하루 끼니 상한과 함께 최대 행 수가 정해진다).
      const span = daysBetween(req.query.from, req.query.to);
      if (span === null || span + 1 > MEAL_STATS_MAX_DAYS) {
        throw app.httpErrors.badRequest(`통계 기간은 최대 ${MEAL_STATS_MAX_DAYS}일입니다.`);
      }
      // '오늘'은 서버 시간대(Asia/Seoul 배포)를 기준으로 잡는다 — 연속 일수 계산에만 쓰인다.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      return stats.stats(req.user.userId, req.query.from, req.query.to, today);
    },
  });

  // 내보내기·전체 삭제는 /meals/:id 보다 먼저 등록한다. 특히 DELETE /meals/data 가
  // 단건 id='data' 삭제로 해석되면 안 된다.
  // 내보내기·백업은 응답을 조각으로 흘린다(스트림은 직렬화를 건너뛰므로 서비스가 같은 Zod 스키마로 조각마다
  // 검증해 이어 붙인다 — 바이트는 한 덩어리 응답과 같다). response 스키마는 문서용으로 그대로 둔다.
  typed.get(Routes.Meal.dataExport, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealDataArchive },
    schema: {
      tags: ['meal'],
      summary: '내 식단 데이터 JSON 내보내기 — 기록·선호·추천 이력, 사진 바이너리 제외',
      description: 'IP당 시간당 10회. 응답은 스트림(chunked)으로 내려간다.',
      security: [{ bearerAuth: [] }],
      response: { 200: MealDataExport },
    },
    handler: async (req, reply) => {
      const stream = await mealData.exportStream(req.user.userId);
      return reply
        .type('application/json; charset=utf-8')
        .send(stream as unknown as MealDataExportType);
    },
  });

  typed.get(Routes.Meal.dataBackup, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealDataArchive },
    schema: {
      tags: ['meal'],
      summary: '사진 포함 식단 백업 아카이브 생성 — JSON+base64, IP당 시간당 10회',
      description:
        '기록에 연결된 사진만 base64 로 담고 연결 안 된 업로드는 건너뛴다. ' +
        `기록 ${MEAL_DATA_BACKUP_MAX_ENTRIES.toLocaleString('ko-KR')}건·추천 ${MEAL_DATA_BACKUP_MAX_RECOMMENDATIONS.toLocaleString('ko-KR')}건·` +
        `사진 ${MEAL_DATA_BACKUP_MAX_PHOTOS}장(합계 ${MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES / 1024 / 1024}MB)을 넘으면 413. ` +
        '백업·복원은 서버 전체에서 한 번에 1건씩 처리하며 대기가 길면 503. 응답은 스트림(chunked)으로 내려간다.',
      security: [{ bearerAuth: [] }],
      response: { 200: MealDataBackup },
    },
    handler: async (req, reply) => {
      try {
        const stream = await mealData.backupStream(req.user.userId);
        return reply
          .type('application/json; charset=utf-8')
          .send(stream as unknown as MealDataBackupType);
      } catch (e) {
        return throwMealDataAsHttp(e);
      }
    },
  });

  // 복원 본문은 읽기 전에 전역 자리를 잡는다 — 처리 게이트(서비스)만으로는 기다리는 요청마다 파싱된 75MB 본문이 남는다.
  const restoreIntake = createRestoreIntake({
    maxBodyBytes: MEAL_DATA_BACKUP_MAX_JSON_BYTES,
    busy: () => app.httpErrors.serviceUnavailable('다른 복원 요청을 처리하고 있습니다. 잠시 뒤 다시 시도해 주세요.'),
  });

  typed.post(Routes.Meal.dataRestore, {
    onRequest: [app.authenticate],
    // 인증·요청 한도(onRequest) 뒤, 본문 파싱 전.
    preParsing: [restoreIntake.hold],
    preValidation: [restoreIntake.bodyReceived],
    onResponse: [restoreIntake.done],
    config: { rateLimit: RATE.mealDataArchive },
    // base64 사진 + JSON 오버헤드 상한. 전역 body limit을 넓히지 않는다.
    bodyLimit: MEAL_DATA_BACKUP_MAX_JSON_BYTES,
    schema: {
      tags: ['meal'],
      summary: '식단 백업 아카이브 복원 — 기존 기록에 추가, 같은 archiveId 재요청은 멱등',
      description:
        '본문은 GET /api/v1/meals/data/backup 응답 그대로(JSON 최대 75MB, IP당 시간당 10회). ' +
        `사진 합계가 ${MEAL_DATA_RESTORE_MAX_TOTAL_PHOTO_BYTES / 1024 / 1024}MB(예전 백업 호환 — 새 백업은 ${MEAL_DATA_BACKUP_MAX_TOTAL_PHOTO_BYTES / 1024 / 1024}MB)를 넘으면 413, 복원 뒤 기록이 계정 ` +
        `${MEAL_MAX_ENTRIES_PER_USER.toLocaleString('ko-KR')}건·하루 ${MEAL_MAX_ENTRIES_PER_DAY}끼를 넘으면 409, ` +
        '복원 요청은 서버 전체에서 한 번에 1건만 받는다(본문을 읽기 전부터) — 다른 백업·복원 대기가 길면 503. ' +
        '선호 설정은 기존 값이 있으면 유지하고 없을 때만 아카이브 값으로 만든다.',
      security: [{ bearerAuth: [] }],
      body: MealDataBackup,
      response: { 200: RestoreMealDataResult },
    },
    handler: async (req) => {
      try {
        return await mealData.restore(req.user.userId, req.body);
      } catch (e) {
        return throwMealDataAsHttp(e);
      }
    },
  });

  typed.get(Routes.Meal.photoRetention, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '사진 정리 대상 미리보기 — before 이전 기록 사진·미연결 업로드 수와 용량',
      security: [{ bearerAuth: [] }],
      querystring: MealPhotoRetentionQuery,
      response: { 200: MealPhotoRetentionPreview },
    },
    handler: async (req) => mealData.previewPhotoRetention(req.user.userId, req.query),
  });

  typed.delete(Routes.Meal.photoRetention, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '오래된 식단 사진 일괄 삭제 — 텍스트 기록은 유지, 확인 문구 필수',
      description:
        '본문 confirmation 이 정확히 "DELETE_OLD_MEAL_PHOTOS" 여야 한다. before 를 생략하면 본인 식단 사진 전체가 대상이다.',
      security: [{ bearerAuth: [] }],
      body: DeleteMealPhotosInput,
      response: { 200: DeleteMealPhotosResult },
    },
    handler: async (req) => {
      try {
        return await mealData.deleteRetainedPhotos(req.user.userId, req.body);
      } catch (e) {
        return throwMealDataAsHttp(e);
      }
    },
  });

  typed.delete(Routes.Meal.data, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '내 식단 데이터 전체 삭제 — 기록·사진·추천·선호 설정, 확인 문구 필수',
      description:
        '본문 confirmation 이 정확히 "DELETE_ALL_MY_MEAL_DATA" 여야 한다. 되돌릴 수 없다.',
      security: [{ bearerAuth: [] }],
      body: DeleteMealDataInput,
      response: { 200: DeleteMealDataResult },
    },
    handler: async (req) => {
      try {
        return await mealData.deleteAll(req.user.userId, req.body);
      } catch (e) {
        return throwMealDataAsHttp(e);
      }
    },
  });

  typed.get(Routes.Meal.entry(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 기록 단건 조회 — 사진 인식 원본 스냅샷 포함',
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 200: MealEntry },
    },
    handler: async (req) => {
      try {
        return await meals.get(req.user.userId, req.params.id);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  typed.patch(Routes.Meal.entry(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 기록 수정 — items·photoTokens 는 보내면 전량 교체',
      security: [{ bearerAuth: [] }],
      params: IdParams,
      body: UpdateMealEntryInput,
      response: { 200: MealEntry },
    },
    handler: async (req) => {
      try {
        return await meals.update(req.user.userId, req.params.id, req.body);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  typed.delete(Routes.Meal.entry(':id'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 기록 삭제 — 연결된 사진 파일도 함께 삭제',
      security: [{ bearerAuth: [] }],
      params: IdParams,
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      try {
        await meals.remove(req.user.userId, req.params.id);
        return reply.code(204).send(null);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // ── 사진 ────────────────────────────────────────────────────────────
  // multipart 는 zod body schema 와 호환되지 않아 typed 가 아닌 일반 app.post.
  app.post(Routes.Meal.photos, {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealPhotoUpload },
    schema: {
      tags: ['meal'],
      summary: '식단 사진 업로드 — multipart 파일 1개(최대 5MB), 사진 토큰 발급',
      description:
        'multipart/form-data 파일 1개(필드명 무관, 공식 클라이언트는 file). HEIC 도 받으며 긴 변 최대 1600px JPEG 로 ' +
        '재인코딩하고 EXIF 는 버린다. 24시간 안에 기록에 연결되지 않으면 자동 정리되고, 사용자당 3,000장 초과 시 409. ' +
        'HEIC 는 약 2,500만 화소를 넘으면 413, 변환 대기열이 가득하면 503.',
      security: [{ bearerAuth: [] }],
    },
    handler: async (req) => {
      const file = await req.file();
      if (!file) throw app.httpErrors.badRequest('파일이 필요합니다.');
      const buffer = await file.toBuffer();
      if (file.file.truncated) throw app.httpErrors.payloadTooLarge('파일이 너무 큽니다.');
      try {
        return UploadMealPhotoResult.parse(await photos.store(req.user.userId, buffer));
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // 원본/썸네일 — JWT 필요(공개 URL 아님). binary 라 typed 가 아닌 일반 라우트.
  const servePhoto = (variant: 'full' | 'thumb') => async (
    req: { user: { userId: string }; params: unknown },
    reply: { code: (n: number) => { send: (b: unknown) => unknown }; header: (k: string, v: string) => unknown; send: (b: unknown) => unknown },
  ): Promise<unknown> => {
    const { token } = req.params as { token: string };
    if (!isValidMealPhotoToken(token)) throw app.httpErrors.badRequest('토큰 형식이 올바르지 않습니다.');
    try {
      const buf = await photos.read(req.user.userId, token, variant);
      reply.header('Content-Type', 'image/jpeg');
      // private — 사용자별 사진이라 공용 캐시에 담기면 안 된다.
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(buf);
    } catch (e) {
      return throwAsHttp(e);
    }
  };

  app.get(Routes.Meal.photo(':token'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 사진 원본(image/jpeg) — 본인 사진만, JWT 필요',
      security: [{ bearerAuth: [] }],
      params: TokenParams,
    },
    handler: servePhoto('full') as never,
  });

  app.get(Routes.Meal.photoThumb(':token'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 사진 썸네일(image/jpeg, 긴 변 최대 320px) — 본인 사진만, JWT 필요',
      security: [{ bearerAuth: [] }],
      params: TokenParams,
    },
    handler: servePhoto('thumb') as never,
  });

  // 지난 기록의 사진을 이번 기록용으로 복제 — 원본을 지워도 새 기록이 멀쩡하도록 참조가 아닌 복사.
  typed.post(Routes.Meal.photoCopy(':token'), {
    onRequest: [app.authenticate],
    config: { rateLimit: RATE.mealPhotoUpload },
    schema: {
      tags: ['meal'],
      summary: '지난 식단 사진을 새 사진 토큰으로 복제 — 원본과 독립된 파일',
      security: [{ bearerAuth: [] }],
      params: TokenParams,
      response: { 201: UploadMealPhotoResult },
    },
    handler: async (req, reply) => {
      try {
        return reply.code(201).send(await photos.copy(req.user.userId, req.params.token));
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  typed.delete(Routes.Meal.photo(':token'), {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '기록에 연결되지 않은 업로드 사진 삭제 — 연결된 사진은 409',
      security: [{ bearerAuth: [] }],
      params: TokenParams,
      response: { 204: z.null() },
    },
    handler: async (req, reply) => {
      try {
        await photos.remove(req.user.userId, req.params.token);
        return reply.code(204).send(null);
      } catch (e) {
        return throwAsHttp(e);
      }
    },
  });

  // ── 선호 설정 ───────────────────────────────────────────────────────
  typed.get(Routes.Meal.preference, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 선호 설정 조회 — 추천 가중치·제외·알레르기·선호 음식, 미저장 시 기본값',
      security: [{ bearerAuth: [] }],
      response: { 200: MealPreference },
    },
    handler: async (req) => preferences.get(req.user.userId),
  });

  typed.put(Routes.Meal.preference, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식단 선호 설정 저장 — 보낸 필드만 갱신',
      security: [{ bearerAuth: [] }],
      body: UpdateMealPreferenceInput,
      response: { 200: MealPreference },
    },
    handler: async (req) => preferences.update(req.user.userId, req.body),
  });
};

export default mealRoutes;
