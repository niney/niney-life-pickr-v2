import { beforeEach, describe, expect, it } from 'vitest';
import type { RecognizedDishType } from '@repo/api-contract';
import { draftItemToInput, useMealDraftStore } from './mealDraftStore.js';
import { buildMealEntriesQuery } from '../api/meal.api.js';

const dish = (over: Partial<RecognizedDishType> = {}): RecognizedDishType => ({
  name: '김치찌개',
  candidates: [{ name: '김치찌개', confidence: 0.8 }],
  confidence: 0.8,
  isMain: true,
  portion: 'normal',
  isDrink: false,
  photoIndex: 0,
  foodId: 'food-1',
  matchedName: '김치찌개',
  dishType: 'stew',
  mainIngredient: 'pork',
  cuisine: 'korean',
  ...over,
});

describe('mealDraftStore', () => {
  beforeEach(() => {
    useMealDraftStore.getState().clear();
  });

  it('start 는 이전 draft 를 덮어쓰고 초기값을 세팅한다', () => {
    useMealDraftStore.getState().addItem({
      name: '남은 항목',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      isMain: true,
      confidence: null,
      source: 'manual',
      candidates: [],
    });
    useMealDraftStore.getState().start({ eatenDate: '2026-08-22', slot: 'dinner' });
    const s = useMealDraftStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.eatenDate).toBe('2026-08-22');
    expect(s.slot).toBe('dinner');
    expect(s.entryId).toBeNull();
  });

  it('항목 추가·수정·삭제 (clientId 는 고유)', () => {
    const st = useMealDraftStore.getState();
    st.addItem({ name: 'a', foodId: null, dishType: null, mainIngredient: null, cuisine: null, portion: null, isMain: true, confidence: null, source: 'manual', candidates: [] });
    st.addItem({ name: 'b', foodId: null, dishType: null, mainIngredient: null, cuisine: null, portion: null, isMain: false, confidence: null, source: 'manual', candidates: [] });
    const items = useMealDraftStore.getState().items;
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.clientId)).size).toBe(2);

    useMealDraftStore.getState().updateItem(items[0]!.clientId, { name: 'a2', portion: 'large' });
    expect(useMealDraftStore.getState().items[0]).toMatchObject({ name: 'a2', portion: 'large' });

    useMealDraftStore.getState().removeItem(items[1]!.clientId);
    expect(useMealDraftStore.getState().items.map((i) => i.name)).toEqual(['a2']);
  });

  it('applyRecognition 은 기존 항목을 지우지 않고 뒤에 붙이며 매칭된 이름을 쓴다', () => {
    const st = useMealDraftStore.getState();
    st.addItem({ name: '손입력', foodId: null, dishType: null, mainIngredient: null, cuisine: null, portion: null, isMain: true, confidence: null, source: 'manual', candidates: [] });
    st.applyRecognition([dish(), dish({ name: '김치 찌개', matchedName: null, foodId: null, dishType: null })], {
      model: 'gemma4:31b',
      version: 1,
    });
    const s = useMealDraftStore.getState();
    expect(s.items.map((i) => i.name)).toEqual(['손입력', '김치찌개', '김치 찌개']);
    expect(s.items[1]).toMatchObject({ source: 'recognized', foodId: 'food-1', dishType: 'stew' });
    expect(s.recognition).toMatchObject({ model: 'gemma4:31b', version: 1 });
    expect(s.recognition?.dishes).toHaveLength(2);
  });

  it('사진 추가는 토큰 중복을 막고 삭제는 토큰으로 한다', () => {
    const st = useMealDraftStore.getState();
    st.addPhoto({ token: 't1', localUri: 'file:///a.jpg' });
    st.addPhoto({ token: 't1', localUri: 'file:///a.jpg' });
    st.addPhoto({ token: 't2', localUri: null });
    expect(useMealDraftStore.getState().photos.map((p) => p.token)).toEqual(['t1', 't2']);
    useMealDraftStore.getState().removePhoto('t1');
    expect(useMealDraftStore.getState().photos.map((p) => p.token)).toEqual(['t2']);
  });

  it('draftItemToInput 은 계약에 없는 필드를 뺀다', () => {
    const input = draftItemToInput({
      clientId: 'x',
      name: '김치찌개',
      foodId: 'food-1',
      dishType: 'stew',
      mainIngredient: 'pork',
      cuisine: 'korean',
      portion: 'normal',
      isMain: true,
      confidence: 0.8,
      source: 'recognized',
      candidates: [{ name: '부대찌개', confidence: 0.1 }],
    });
    expect(input).not.toHaveProperty('clientId');
    expect(input).not.toHaveProperty('candidates');
    expect(input).toMatchObject({ name: '김치찌개', foodId: 'food-1', source: 'recognized' });
  });
});

describe('buildMealEntriesQuery', () => {
  it('빈 입력은 빈 문자열, 값은 고정 순서로 직렬화', () => {
    expect(buildMealEntriesQuery()).toBe('');
    expect(buildMealEntriesQuery({ limit: 10, from: '2026-08-01', slot: 'lunch' })).toBe(
      'from=2026-08-01&slot=lunch&limit=10',
    );
  });
  it('withPhotos 는 1/0 으로', () => {
    expect(buildMealEntriesQuery({ withPhotos: false })).toBe('withPhotos=0');
    expect(buildMealEntriesQuery({ withPhotos: true })).toBe('withPhotos=1');
  });
});
