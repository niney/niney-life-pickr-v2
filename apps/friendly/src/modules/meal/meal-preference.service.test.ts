import type { MealPreference as PrismaMealPreference, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  MealPreferenceService,
  normalizeMealFoodPreferences,
  toMealPreference,
} from './meal-preference.service.js';

const row = (over: Partial<PrismaMealPreference> = {}): PrismaMealPreference => ({
  userId: 'u1',
  weightsJson: '{}',
  excludedFoodsJson: '[]',
  dislikedFoodsJson: '[]',
  likedFoodsJson: '[]',
  mealTypesJson: '[]',
  slotsJson: '["breakfast","lunch","dinner"]',
  onboarded: false,
  updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  ...over,
});

describe('normalizeMealFoodPreferences', () => {
  it('띄어쓰기 차이까지 중복 제거하고 절대 제외 > 덜 선호 > 좋아요 순으로 남긴다', () => {
    expect(
      normalizeMealFoodPreferences({
        excludedFoods: [' 오 이 ', '오이'],
        dislikedFoods: ['오이', '고수', '고 수'],
        likedFoods: ['오이', '고 수', '비빔밥', '비빔 밥'],
      }),
    ).toEqual({
      excludedFoods: ['오 이'],
      dislikedFoods: ['고수'],
      likedFoods: ['비빔밥'],
    });
  });

  it('저장 행이 없으면 새 소프트 비선호도 빈 배열인 기본 선호를 만든다', () => {
    expect(toMealPreference(null)).toMatchObject({
      excludedFoods: [],
      dislikedFoods: [],
      likedFoods: [],
      slots: ['breakfast', 'lunch', 'dinner'],
    });
  });
});

describe('MealPreferenceService.update', () => {
  it('부분 업데이트도 기존 세 목록과 함께 다시 정규화해 충돌을 저장하지 않는다', async () => {
    let current = row({
      excludedFoodsJson: JSON.stringify(['오이']),
      dislikedFoodsJson: JSON.stringify(['내장']),
      likedFoodsJson: JSON.stringify(['비빔밥', '내장']),
    });
    const findUnique = vi.fn(async () => current);
    const upsert = vi.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const data = args.update;
      current = row({
        ...current,
        weightsJson: String(data['weightsJson']),
        excludedFoodsJson: String(data['excludedFoodsJson']),
        dislikedFoodsJson: String(data['dislikedFoodsJson']),
        likedFoodsJson: String(data['likedFoodsJson']),
        mealTypesJson: String(data['mealTypesJson']),
        slotsJson: String(data['slotsJson']),
        onboarded: Boolean(data['onboarded']),
      });
      return current;
    });
    const prisma = { mealPreference: { findUnique, upsert } } as unknown as PrismaClient;
    const service = new MealPreferenceService(prisma);

    const result = await service.update('u1', {
      dislikedFoods: ['김치 찌개', '오이'],
      likedFoods: ['김치찌개', '비빔밥'],
    });

    expect(result).toMatchObject({
      excludedFoods: ['오이'],
      dislikedFoods: ['김치 찌개'],
      likedFoods: ['비빔밥'],
    });
    expect(JSON.parse(current.dislikedFoodsJson)).toEqual(['김치 찌개']);
    expect(JSON.parse(current.likedFoodsJson)).toEqual(['비빔밥']);
  });
});
