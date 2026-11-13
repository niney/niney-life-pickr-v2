import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MealPlaceMenusQuery, MealPlaceMenusResult, Routes } from '@repo/api-contract';

// 식당 메뉴에서 넣기 — 식단 기록에 식당이 정해지면 입력 화면이 그 집 메뉴를 받아 목록으로 보여 준다(누르면 항목이 된다).
// 로그인 사용자만. /meals/:id 보다 정적 경로가 먼저 잡힌다(find-my-way 는 정적 경로가 매개변수보다 우선).

const mealPlaceMenuRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(Routes.Meal.placeMenus, {
    onRequest: [app.authenticate],
    schema: {
      tags: ['meal'],
      summary: '식당 메뉴에서 넣기 — 그 식당 등록 메뉴를 식단에 넣을 음식(표준명·분류·1인분 열량)으로',
      description:
        'placeId 는 등록 식당(공개 맛집 목록·상세의 placeId). 메뉴마다 그 집 표기(menuName)·가격(원, 한 값이 아니면 null)과 ' +
        '기록에 넣을 음식(foods)을 준다 — 보통 하나이고, 구성이 이름에 드러난 세트는 구성요소 수만큼. foods 의 name 은 음식 ' +
        '카탈로그의 표준명이고(못 이으면 다듬은 메뉴명, foodId null) kcal 은 저장하면 붙을 1인분 열량이다(모르면 null). ' +
        '식단 기록을 저장할 때 항목의 menuName·menuPrice 에 그 집 표기와 가격을 실으면 스냅샷으로 남는다. 식당이 없으면 404.',
      security: [{ bearerAuth: [] }],
      querystring: MealPlaceMenusQuery,
      response: { 200: MealPlaceMenusResult },
    },
    handler: async (req) => {
      const result = await app.mealPlaceMenus.forPlace(req.query.placeId);
      if (!result) throw app.httpErrors.notFound('식당을 찾을 수 없습니다.');
      return result;
    },
  });
};

export default mealPlaceMenuRoutes;
