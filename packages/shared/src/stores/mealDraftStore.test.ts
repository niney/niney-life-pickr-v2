import { beforeEach, describe, expect, it } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import type {
  FrequentMealItemType,
  MealEntryType,
  MealPlaceMenuType,
  MealRecommendationType,
  RecognizedDishType,
} from '@repo/api-contract';
import {
  beginMealDraftPhotoPreparation,
  draftItemToInput,
  getMealDraftIdentity,
  getMealDraftReadyPrincipal,
  getMealDraftSaveFlight,
  isMealDraftIdentityCurrent,
  MEAL_DRAFT_MAX_PHOTOS,
  mealDraftInitForRepeat,
  mealDraftInitFromEntry,
  mealMenuFoods,
  setMealDraftLocalFileAdapter,
  setMealDraftPrincipal,
  setMealDraftStorage,
  runMealDraftPhotoFlushSingleFlight,
  runMealDraftSaveSingleFlight,
  startMealDraftFromRecommendation,
  subscribeMealDraftReadyPrincipal,
  useMealDraftStore,
} from './mealDraftStore.js';
import { buildMealEntriesQuery } from '../api/meal.api.js';
import { shouldApplyMealMutationCache } from '../hooks/useMeal.js';

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
    setMealDraftLocalFileAdapter(null);
    useMealDraftStore.getState().clear();
  });

  it('start 는 이전 draft 를 덮어쓰고 초기값을 세팅한다', () => {
    const beforeSession = useMealDraftStore.getState().draftSessionId;
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
    useMealDraftStore.getState().start({
      eatenDate: '2026-08-22',
      slot: 'dinner',
      originRecommendationId: 'rec-1',
    });
    const s = useMealDraftStore.getState();
    expect(s.items).toHaveLength(0);
    expect(s.eatenDate).toBe('2026-08-22');
    expect(s.slot).toBe('dinner');
    expect(s.entryId).toBeNull();
    expect(s.originRecommendationId).toBe('rec-1');
    expect(s.draftSessionId).not.toBe(beforeSession);

    const startedSession = s.draftSessionId;
    expect(useMealDraftStore.getState().clear('다른-session')).toBe(false);
    expect(useMealDraftStore.getState().draftSessionId).toBe(startedSession);
    expect(useMealDraftStore.getState().clear(startedSession)).toBe(true);
    expect(useMealDraftStore.getState().originRecommendationId).toBeNull();
    expect(useMealDraftStore.getState().draftSessionId).not.toBe(startedSession);
  });

  it('항목 추가·수정·삭제 (clientId 는 고유)', () => {
    const st = useMealDraftStore.getState();
    st.addItem({
      name: 'a',
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
    st.addItem({
      name: 'b',
      foodId: null,
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      portion: null,
      isMain: false,
      confidence: null,
      source: 'manual',
      candidates: [],
    });
    const items = useMealDraftStore.getState().items;
    expect(items).toHaveLength(2);
    expect(new Set(items.map((i) => i.clientId)).size).toBe(2);

    useMealDraftStore.getState().updateItem(items[0]!.clientId, { name: 'a2', portion: 'large' });
    expect(useMealDraftStore.getState().items[0]).toMatchObject({
      name: 'a2',
      portion: 'large',
      userEdited: true,
    });

    useMealDraftStore.getState().removeItem(items[1]!.clientId);
    expect(useMealDraftStore.getState().items.map((i) => i.name)).toEqual(['a2']);
  });

  it('재인식은 손대지 않은 인식 항목만 교체하고 수동·사용자 교정 항목을 보존한다', () => {
    const st = useMealDraftStore.getState();
    st.applyRecognition(
      [dish(), dish({ name: '된장찌개', matchedName: '된장찌개', foodId: 'food-2' })],
      {
        model: 'old',
        version: 1,
      },
    );
    const recognized = useMealDraftStore.getState().items;
    st.updateItem(recognized[0]!.clientId, { name: '참치김치찌개' });
    st.addItem({
      name: '밥',
      foodId: null,
      dishType: 'rice',
      mainIngredient: 'grain',
      cuisine: 'korean',
      portion: null,
      isMain: false,
      confidence: null,
      source: 'manual',
      candidates: [],
    });

    st.applyRecognition(
      [dish({ name: '순두부찌개', matchedName: '순두부찌개', foodId: 'food-3' })],
      { model: 'new', version: 2 },
      { mode: 'replace-recognized' },
    );

    const next = useMealDraftStore.getState();
    expect(next.items.map((item) => item.name)).toEqual(['참치김치찌개', '밥', '순두부찌개']);
    expect(next.recognition).toMatchObject({ model: 'new', version: 2 });
    expect(next.recognition?.dishes).toHaveLength(1);
  });

  it('applyRecognition 은 기존 항목을 지우지 않고 뒤에 붙이며 매칭된 이름을 쓴다', () => {
    const st = useMealDraftStore.getState();
    st.addItem({
      name: '손입력',
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
    st.applyRecognition(
      [dish(), dish({ name: '김치 찌개', matchedName: null, foodId: null, dishType: null })],
      {
        model: 'gemma4:31b',
        version: 1,
      },
    );
    const s = useMealDraftStore.getState();
    expect(s.items.map((i) => i.name)).toEqual(['손입력', '김치찌개', '김치 찌개']);
    expect(s.items[1]).toMatchObject({ source: 'recognized', foodId: 'food-1', dishType: 'stew' });
    expect(s.recognition).toMatchObject({ model: 'gemma4:31b', version: 1 });
    expect(s.recognition?.dishes).toHaveLength(2);
  });

  it('서버가 선택 후보를 확정하지 않았으면 후보 배열이 있어도 순위를 임의 생성하지 않는다', () => {
    useMealDraftStore
      .getState()
      .applyRecognition([dish({ selectedCandidateRank: null, foodId: null, matchedName: null })], {
        model: 'vision',
        version: 2,
      });

    expect(useMealDraftStore.getState().items[0]?.selectedCandidateRank).toBeNull();
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

  it('업로드 대기 사진을 영속 상태로 두고 성공 후 토큰 사진으로 옮긴다', () => {
    const st = useMealDraftStore.getState();
    st.addPendingPhoto({
      clientId: 'pending-1',
      localUri: 'file:///draft/pending-1.jpg',
      name: 'one.jpg',
      mimeType: 'image/jpeg',
      managedLocalFile: true,
      status: 'pending',
      lastError: '네트워크 오류',
    });
    st.updatePendingPhoto('pending-1', { lastError: null });
    st.promotePendingPhoto('pending-1', {
      token: 'uploaded-1',
      localUri: 'file:///draft/pending-1.jpg',
      managedLocalFile: true,
    });

    const next = useMealDraftStore.getState();
    expect(next.pendingPhotos).toHaveLength(0);
    expect(next.photos).toEqual([
      {
        token: 'uploaded-1',
        localUri: 'file:///draft/pending-1.jpg',
        managedLocalFile: true,
      },
    ]);
  });

  it('업로드 완료+대기 사진을 합산해 5장을 넘지 않는다', () => {
    const st = useMealDraftStore.getState();
    for (let index = 0; index < MEAL_DRAFT_MAX_PHOTOS; index += 1) {
      st.addPendingPhoto({
        clientId: `pending-${index}`,
        localUri: `file:///draft/${index}.jpg`,
        name: `${index}.jpg`,
        mimeType: 'image/jpeg',
        managedLocalFile: true,
        status: 'pending',
        lastError: null,
      });
    }
    st.addPhoto({ token: 'too-many', localUri: null });

    expect(useMealDraftStore.getState().pendingPhotos).toHaveLength(MEAL_DRAFT_MAX_PHOTOS);
    expect(useMealDraftStore.getState().photos).toHaveLength(0);
  });

  it('겹친 저장·재인식 flush는 하나의 Promise에 합류한다', async () => {
    const identity = getMealDraftIdentity();
    let calls = 0;
    let release: (value: boolean) => void = () => undefined;
    const work = () => {
      calls += 1;
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    };

    const first = runMealDraftPhotoFlushSingleFlight(identity, work);
    const second = runMealDraftPhotoFlushSingleFlight(identity, work);
    // work는 microtask에서 시작하지만 두 호출은 즉시 같은 Promise를 받는다.
    expect(second).toBe(first);
    await Promise.resolve();
    expect(calls).toBe(1);
    release(true);
    await expect(first).resolves.toBe(true);

    await expect(
      runMealDraftPhotoFlushSingleFlight(identity, async () => false),
    ).resolves.toBe(false);
    expect(calls).toBe(1);

    await expect(
      runMealDraftPhotoFlushSingleFlight(identity, async () => {
        throw new Error('flush failed');
      }),
    ).rejects.toThrow('flush failed');
    await expect(
      runMealDraftPhotoFlushSingleFlight(identity, async () => true),
    ).resolves.toBe(true);
  });

  it('저장은 열린 picker/staging lease를 기다리고 같은 세션의 새 picker와 중복 저장을 막는다', async () => {
    const identity = getMealDraftIdentity();
    const preparation = beginMealDraftPhotoPreparation(identity);
    expect(preparation).not.toBeNull();

    let saves = 0;
    let releaseSave: () => void = () => undefined;
    let markSaveStarted: () => void = () => undefined;
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    const first = runMealDraftSaveSingleFlight(identity, async () => {
      saves += 1;
      markSaveStarted();
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
    });
    const second = runMealDraftSaveSingleFlight(identity, async () => {
      saves += 100;
    });

    expect(second).toBe(first);
    expect(getMealDraftSaveFlight(identity)).toBe(first);
    expect(beginMealDraftPhotoPreparation(identity)).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(saves).toBe(0);

    preparation!.finish();
    await saveStarted;
    expect(saves).toBe(1);
    releaseSave();
    await expect(first).resolves.toBeUndefined();
    expect(getMealDraftSaveFlight(identity)).toBeNull();
  });

  it('식단 mutation cache는 요청 principal이 현재 계정일 때만 반영한다', () => {
    const principalId = getMealDraftIdentity().principalId;
    expect(shouldApplyMealMutationCache(undefined)).toBe(true);
    expect(shouldApplyMealMutationCache(principalId)).toBe(true);
    expect(shouldApplyMealMutationCache(`${principalId ?? 'guest'}-other`)).toBe(false);
  });

  it('개별 삭제와 draft 초기화가 앱 소유 파일 정리 어댑터를 호출한다', () => {
    const deleted: string[][] = [];
    let cleared = 0;
    setMealDraftLocalFileAdapter({
      deleteFiles: (uris) => {
        deleted.push([...uris]);
      },
      clearAll: () => {
        cleared += 1;
      },
      switchPrincipal: () => undefined,
    });
    const st = useMealDraftStore.getState();
    st.addPendingPhoto({
      clientId: 'pending-remove',
      localUri: 'file:///draft/remove.jpg',
      name: 'remove.jpg',
      mimeType: 'image/jpeg',
      managedLocalFile: true,
      status: 'pending',
      lastError: null,
    });
    st.removePendingPhoto('pending-remove');
    st.clear();

    expect(deleted).toEqual([['file:///draft/remove.jpg']]);
    expect(cleared).toBe(1);
  });

  it('앱 재시작 시 principal 전용 저장소에서 업로드 대기 사진을 복원한다', async () => {
    const values = new Map<string, string>();
    const storage: StateStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    values.set(
      'lp:meal-draft-v1:principal:restart-account',
      JSON.stringify({
        state: {
          eatenDate: '2026-08-23',
          pendingPhotos: [
            {
              clientId: 'pending-restart',
              localUri: 'file:///draft/restart.jpg',
              name: 'restart.jpg',
              mimeType: 'image/jpeg',
              managedLocalFile: true,
              status: 'pending',
              lastError: '일시적 업로드 오류',
            },
          ],
        },
        version: 0,
      }),
    );
    setMealDraftStorage(storage);
    await setMealDraftPrincipal('restart-account');

    expect(useMealDraftStore.getState().pendingPhotos).toEqual([
      expect.objectContaining({
        clientId: 'pending-restart',
        localUri: 'file:///draft/restart.jpg',
        status: 'pending',
      }),
    ]);
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

  it('principal 전환 즉시 메모리와 직전 계정의 영속 draft 를 폐기한다', async () => {
    const values = new Map<string, string>();
    const storage: StateStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    setMealDraftStorage(storage);
    const switched: Array<string | null> = [];
    setMealDraftLocalFileAdapter({
      deleteFiles: () => undefined,
      clearAll: () => undefined,
      switchPrincipal: async (principal) => {
        await Promise.resolve();
        switched.push(principal);
      },
    });
    await setMealDraftPrincipal('account-a');
    useMealDraftStore.getState().start({ memo: 'A만 볼 메모', eatenDate: '2026-08-23' });
    const accountAIdentity = getMealDraftIdentity();
    expect(isMealDraftIdentityCurrent(accountAIdentity)).toBe(true);
    expect([...values.keys()]).toContain('lp:meal-draft-v1:principal:account-a');

    const switching = setMealDraftPrincipal('account-b');
    expect(useMealDraftStore.getState().memo).toBe('');
    await switching;
    expect(isMealDraftIdentityCurrent(accountAIdentity)).toBe(false);
    expect(values.has('lp:meal-draft-v1:principal:account-a')).toBe(false);
    expect(useMealDraftStore.getState().memo).toBe('');
    expect(switched.at(-1)).toBe('account-b');
  });

  it('복원 완료 principal 은 전환 시작에 비고 복원이 끝나야 채워진다', async () => {
    const values = new Map<string, string>();
    const storage: StateStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    values.set(
      'lp:meal-draft-v1:principal:ready-b',
      JSON.stringify({ state: { eatenDate: '2026-09-28', memo: 'B 초안' }, version: 0 }),
    );
    setMealDraftStorage(storage);
    await setMealDraftPrincipal('ready-a');
    expect(getMealDraftReadyPrincipal()).toBe('ready-a');

    const notified: Array<string | null> = [];
    const unsubscribe = subscribeMealDraftReadyPrincipal(() =>
      notified.push(getMealDraftReadyPrincipal()),
    );
    const switching = setMealDraftPrincipal('ready-b');
    // 복원 전: 화면이 이 값을 보고 기다린다(이때 쓴 draft 는 저장되지 않는다).
    expect(getMealDraftReadyPrincipal()).toBeNull();
    await switching;
    unsubscribe();

    expect(getMealDraftReadyPrincipal()).toBe('ready-b');
    expect(useMealDraftStore.getState().memo).toBe('B 초안');
    expect(notified).toEqual([null, 'ready-b']);
  });

  it('겹친 전환에서는 마지막 principal 만 복원 완료로 알린다', async () => {
    setMealDraftStorage({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const notified: Array<string | null> = [];
    const unsubscribe = subscribeMealDraftReadyPrincipal(() =>
      notified.push(getMealDraftReadyPrincipal()),
    );
    void setMealDraftPrincipal('stale-a');
    await setMealDraftPrincipal('latest-b');
    unsubscribe();
    expect(getMealDraftReadyPrincipal()).toBe('latest-b');
    expect(notified).not.toContain('stale-a');
  });
});

describe('빠른 추가 칩(toggleQuickItem)', () => {
  const quick = (over: Partial<FrequentMealItemType> = {}): FrequentMealItemType => ({
    name: '공기밥',
    foodId: 'food-rice',
    dishType: 'rice',
    mainIngredient: 'grain',
    cuisine: 'korean',
    isMain: false,
    portion: 'large',
    servings: null,
    portionSource: 'vision_ordinal',
    count: 3,
    lastEatenDate: '2026-10-01',
    from: 'history',
    ...over,
  });

  beforeEach(() => {
    setMealDraftLocalFileAdapter(null);
    useMealDraftStore.getState().clear();
  });

  it('카탈로그 연결·분류·지난번 양·반찬 구분을 실어 넣고, 다시 누르면 뺀다', () => {
    useMealDraftStore.getState().toggleQuickItem(quick());
    const [item] = useMealDraftStore.getState().items;
    expect(item).toMatchObject({
      name: '공기밥',
      foodId: 'food-rice',
      isMain: false,
      portion: 'large',
      source: 'catalog',
      catalogMatchedBy: 'food_id',
      catalogMatchScore: 1,
    });
    // 이름 표기가 조금 달라도(띄어쓰기) 같은 음식으로 보고 뺀다.
    useMealDraftStore.getState().toggleQuickItem(quick({ name: '공기 밥' }));
    expect(useMealDraftStore.getState().items).toHaveLength(0);
  });

  it('이름이 빈 줄(새 기록 첫 줄)이 있으면 그 자리를 채운다', () => {
    const st = useMealDraftStore.getState();
    st.addItem({
      name: '제육볶음',
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
    st.addItem({
      name: '  ',
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
    useMealDraftStore.getState().toggleQuickItem(quick({ name: '배추김치', foodId: null }));
    const names = useMealDraftStore.getState().items.map((it) => it.name);
    expect(names).toEqual(['제육볶음', '배추김치']);
    // 카탈로그 연결이 없으면 수동 항목으로 넣고 서버가 이름으로 매칭한다.
    expect(useMealDraftStore.getState().items[1]).toMatchObject({ source: 'manual', catalogMatchedBy: 'none' });
  });
});

describe('meal draft 식당·식당 메뉴', () => {
  const menu = (over: Partial<MealPlaceMenuType> = {}): MealPlaceMenuType => ({
    menuName: '묵은지 김치찌개',
    price: 9000,
    recommend: false,
    foods: [
      { name: '김치찌개', foodId: 'food-1', dishType: 'stew', mainIngredient: 'pork', cuisine: 'korean', isMain: true, kcal: 240 },
    ],
    ...over,
  });
  const setMenu = menu({
    menuName: '수제돈까스 + 우동',
    price: 12000,
    foods: [
      { name: '돈가스', foodId: 'food-2', dishType: 'fried', mainIngredient: 'pork', cuisine: 'japanese', isMain: true, kcal: 650 },
      { name: '우동', foodId: 'food-3', dishType: 'noodle', mainIngredient: 'grain', cuisine: 'japanese', isMain: true, kcal: 420 },
    ],
  });
  const names = () => useMealDraftStore.getState().items.map((it) => it.name);

  beforeEach(() => {
    setMealDraftLocalFileAdapter(null);
    useMealDraftStore.getState().clear();
    useMealDraftStore.getState().start({ eatenDate: '2026-11-13', slot: 'lunch' });
  });

  it('식당을 정하면 식사 방식이 비어 있을 때만 외식으로 두고, 이름만 적은 식당은 id 없이 남는다', () => {
    const st = useMealDraftStore.getState();
    st.setPlace({ placeId: 'place-1', placeName: '숯토리' });
    expect(useMealDraftStore.getState()).toMatchObject({ placeId: 'place-1', placeName: '숯토리', mealType: 'dining_out' });

    st.setField('mealType', 'delivery');
    st.setPlace({ placeId: null, placeName: '  회사 앞 백반집 ' });
    expect(useMealDraftStore.getState()).toMatchObject({ placeId: null, placeName: '회사 앞 백반집', mealType: 'delivery' });

    st.setPlace(null);
    expect(useMealDraftStore.getState()).toMatchObject({ placeId: null, placeName: null, mealType: 'delivery' });
  });

  it('메뉴를 누르면 표준명 항목에 그 집 메뉴명·가격이 붙어 들어가고(빈 줄 자리에), 다시 누르면 빠진다', () => {
    const st = useMealDraftStore.getState();
    st.addItem({ name: '', foodId: null, dishType: null, mainIngredient: null, cuisine: null, portion: null, isMain: true, confidence: null, source: 'manual', candidates: [] });
    st.toggleMenuItem(menu());
    const [item] = useMealDraftStore.getState().items;
    expect(useMealDraftStore.getState().items).toHaveLength(1);
    expect(item).toMatchObject({
      name: '김치찌개',
      foodId: 'food-1',
      dishType: 'stew',
      source: 'catalog',
      catalogMatchedBy: 'food_id',
      menuName: '묵은지 김치찌개',
      menuPrice: 9000,
    });
    expect(draftItemToInput(item!)).toMatchObject({ name: '김치찌개', menuName: '묵은지 김치찌개', menuPrice: 9000 });

    useMealDraftStore.getState().toggleMenuItem(menu());
    expect(useMealDraftStore.getState().items).toEqual([]);
  });

  it('카탈로그로 못 이은 메뉴는 메뉴명 그대로 수동 항목으로, 세트는 구성요소마다 같은 메뉴명에 가격은 첫 줄에만', () => {
    const st = useMealDraftStore.getState();
    st.toggleMenuItem(
      menu({
        menuName: '주모의 한상',
        price: null,
        foods: [{ name: '주모의 한상', foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null }],
      }),
    );
    st.toggleMenuItem(setMenu);
    expect(useMealDraftStore.getState().items).toMatchObject([
      { name: '주모의 한상', source: 'manual', catalogMatchedBy: 'none', menuName: '주모의 한상', menuPrice: null },
      { name: '돈가스', menuName: '수제돈까스 + 우동', menuPrice: 12000 },
      { name: '우동', menuName: '수제돈까스 + 우동', menuPrice: null },
    ]);
    // 세트는 한 번에 빠진다.
    useMealDraftStore.getState().toggleMenuItem(setMenu);
    expect(names()).toEqual(['주모의 한상']);
  });

  // 설명에 구성이 적힌 코스 — 정해진 구성은 '조금'씩, 식사는 둘 중 하나.
  const courseMenu = menu({
    menuName: '이 코스(2인이상)',
    price: 35000,
    foods: [
      { name: '유산슬', foodId: 'food-4', dishType: 'stir_fry', mainIngredient: 'seafood', cuisine: 'chinese', isMain: true, kcal: 114, portion: 'small' },
      { name: '꽃빵', foodId: null, dishType: null, mainIngredient: null, cuisine: null, isMain: true, kcal: null, portion: 'small' },
    ],
    choices: [
      {
        label: '식사',
        options: [
          { name: '짜장면', foodId: 'food-5', dishType: 'noodle', mainIngredient: 'grain', cuisine: 'chinese', isMain: true, kcal: 551, portion: 'small' },
          { name: '짬뽕', foodId: 'food-6', dishType: 'noodle', mainIngredient: 'seafood', cuisine: 'chinese', isMain: true, kcal: 278, portion: 'small' },
        ],
      },
    ],
  });

  it('고르는 묶음이 있는 메뉴는 정해진 구성과 고른 것만 넣는다 — 코스 구성은 양이 조금으로 들어간다', () => {
    expect(mealMenuFoods(courseMenu, [1]).map((food) => food.name)).toEqual(['유산슬', '꽃빵', '짬뽕']);
    expect(mealMenuFoods(courseMenu, [null]).map((food) => food.name)).toEqual(['유산슬', '꽃빵']);
    expect(mealMenuFoods(courseMenu).map((food) => food.name)).toEqual(['유산슬', '꽃빵']);

    const st = useMealDraftStore.getState();
    st.toggleMenuItem(courseMenu, [0]);
    expect(useMealDraftStore.getState().items).toMatchObject([
      { name: '유산슬', foodId: 'food-4', portion: 'small', portionSource: 'vision_ordinal', menuName: '이 코스(2인이상)', menuPrice: 35000 },
      { name: '꽃빵', foodId: null, source: 'manual', portion: 'small', menuName: '이 코스(2인이상)', menuPrice: null },
      { name: '짜장면', foodId: 'food-5', portion: 'small', menuName: '이 코스(2인이상)', menuPrice: null },
    ]);
    expect(draftItemToInput(useMealDraftStore.getState().items[2]!)).toMatchObject({ name: '짜장면', portion: 'small' });

    // 다시 누르면 구성이 한 번에 빠진다.
    useMealDraftStore.getState().toggleMenuItem(courseMenu);
    expect(useMealDraftStore.getState().items).toEqual([]);
  });

  it('고르는 것만 있는 메뉴는 고르지 않으면 넣을 것이 없다 — 고른 하나만 들어간다', () => {
    const pickMenu = menu({
      menuName: '후식 냉면(물/비빔)',
      price: 6000,
      foods: [],
      choices: [
        {
          label: null,
          options: [
            { name: '물냉면', foodId: 'food-7', dishType: 'noodle', mainIngredient: 'grain', cuisine: 'korean', isMain: true, kcal: 480 },
            { name: '비빔냉면', foodId: 'food-8', dishType: 'noodle', mainIngredient: 'grain', cuisine: 'korean', isMain: true, kcal: 560 },
          ],
        },
      ],
    });
    const st = useMealDraftStore.getState();
    st.toggleMenuItem(pickMenu, [null]);
    expect(useMealDraftStore.getState().items).toEqual([]);
    st.toggleMenuItem(pickMenu, [1]);
    expect(useMealDraftStore.getState().items).toMatchObject([
      { name: '비빔냉면', portion: null, portionSource: null, menuName: '후식 냉면(물/비빔)', menuPrice: 6000 },
    ]);
  });

  it('같은 음식이 이미 있으면 새 줄을 만들지 않고 그 줄에 메뉴를 잇는다 — 사진 인식 줄은 다시 누르면 연결만 풀린다', () => {
    const st = useMealDraftStore.getState();
    st.applyRecognition([dish({ recognitionDishId: 'dish-1' })], { model: 'm', version: 2 });
    st.toggleMenuItem(menu());
    expect(useMealDraftStore.getState().items).toHaveLength(1);
    expect(useMealDraftStore.getState().items[0]).toMatchObject({
      name: '김치찌개',
      source: 'recognized',
      recognitionDishId: 'dish-1',
      menuName: '묵은지 김치찌개',
      menuPrice: 9000,
      // 메뉴를 이은 것은 사용자가 확인한 것이다 — 다시 인식해도 지워지지 않는다.
      userEdited: true,
    });

    useMealDraftStore.getState().toggleMenuItem(menu());
    expect(useMealDraftStore.getState().items).toMatchObject([{ name: '김치찌개', source: 'recognized', menuName: null, menuPrice: null }]);
  });

  it('이름을 바꾸면 메뉴 연결이 풀리고, 양만 바꾸면 그대로', () => {
    const st = useMealDraftStore.getState();
    st.toggleMenuItem(menu());
    const id = useMealDraftStore.getState().items[0]!.clientId;
    st.updateItem(id, { portion: 'large' });
    expect(useMealDraftStore.getState().items[0]).toMatchObject({ portion: 'large', menuName: '묵은지 김치찌개' });

    st.updateItem(id, { name: '된장찌개', foodId: null });
    expect(useMealDraftStore.getState().items[0]).toMatchObject({ name: '된장찌개', menuName: null, menuPrice: null });
    // 가격만 온 항목은 메뉴명이 없으니 가격도 보내지 않는다.
    expect(draftItemToInput({ ...useMealDraftStore.getState().items[0]!, menuPrice: 5000 })).toMatchObject({
      menuName: null,
      menuPrice: null,
    });
  });

  it('식당을 바꾸거나 지우면 앞 식당의 메뉴 연결은 풀리고 음식은 남는다', () => {
    const st = useMealDraftStore.getState();
    st.setPlace({ placeId: 'place-1', placeName: '숯토리' });
    st.toggleMenuItem(menu());
    st.setPlace({ placeId: 'place-1', placeName: '숯토리' });
    expect(useMealDraftStore.getState().items[0]).toMatchObject({ menuName: '묵은지 김치찌개' });

    st.setPlace({ placeId: 'place-2', placeName: '다른 집' });
    expect(useMealDraftStore.getState().items).toMatchObject([{ name: '김치찌개', menuName: null, menuPrice: null }]);
  });

  it('사진에서 인식한 줄을 식당 메뉴에 잇는다 — 같은 음식이면 메뉴만 붙이고, 아니면 다른 후보 가운데 메뉴에 있는 것으로 바꾼다', () => {
    const st = useMealDraftStore.getState();
    st.applyRecognition(
      [
        // 1순위가 이 집 메뉴(김치찌개)와 같은 음식.
        dish({ recognitionDishId: 'd1' }),
        // 1순위(부대찌개)는 메뉴에 없고 둘째 후보(곰탕)가 메뉴에 있다.
        dish({
          recognitionDishId: 'd2',
          name: '부대찌개',
          matchedName: '부대찌개',
          foodId: 'food-budae',
          candidates: [
            { name: '부대찌개', confidence: 0.5 },
            { name: '곰탕', confidence: 0.3 },
          ],
        }),
        // 메뉴 어디에도 없는 주식과 반찬.
        dish({ recognitionDishId: 'd3', name: '라면', matchedName: '라면', foodId: 'food-ramen', candidates: [] }),
        dish({ recognitionDishId: 'd4', name: '단무지', matchedName: '단무지', foodId: null, isMain: false, candidates: [] }),
      ],
      { model: 'm', version: 2 },
    );
    const gomtang = menu({
      menuName: '특곰탕',
      price: 15000,
      foods: [{ name: '곰탕', foodId: 'food-gom', dishType: 'soup', mainIngredient: 'beef', cuisine: 'korean', isMain: true, kcal: 330 }],
    });

    // 주식인데 못 찾은 줄만 센다(반찬은 메뉴에 없는 것이 보통). 세트 메뉴에는 잇지 않는다.
    expect(useMealDraftStore.getState().linkRecognizedToMenus([menu(), gomtang, setMenu])).toEqual({ linked: 2, unmatched: 1 });
    expect(useMealDraftStore.getState().items).toMatchObject([
      { name: '김치찌개', recognitionDishId: 'd1', menuName: '묵은지 김치찌개', menuPrice: 9000 },
      {
        name: '곰탕',
        foodId: 'food-gom',
        dishType: 'soup',
        recognitionDishId: 'd2',
        source: 'recognized',
        selectedCandidateRank: 1,
        menuName: '특곰탕',
        menuPrice: 15000,
      },
      { name: '라면' },
      { name: '단무지' },
    ]);
    expect(useMealDraftStore.getState().items.slice(2).every((it) => !it.menuName)).toBe(true);

    // 다시 불러도 이미 이은 줄은 그대로다.
    expect(useMealDraftStore.getState().linkRecognizedToMenus([menu(), gomtang])).toEqual({ linked: 0, unmatched: 1 });
  });

  it('식당을 알고 인식해 모델이 그 집 메뉴에서 고른 것이 있으면 그 메뉴가 먼저다 — 이름을 그 메뉴의 음식으로 맞춘다', () => {
    const st = useMealDraftStore.getState();
    // 인식 1순위는 부대찌개인데 모델이 고른 메뉴는 묵은지 김치찌개.
    st.applyRecognition(
      [
        dish({
          recognitionDishId: 'd1',
          name: '부대찌개',
          matchedName: '부대찌개',
          foodId: 'food-budae',
          candidates: [{ name: '부대찌개', confidence: 0.5 }],
          menuName: '묵은지 김치찌개',
        }),
        // 모델이 고른 메뉴가 세트(풀리는 메뉴)면 잇지 않는다.
        dish({ recognitionDishId: 'd2', name: '돈가스', matchedName: '돈가스', foodId: 'food-x', candidates: [], menuName: '수제돈까스 + 우동' }),
      ],
      { model: 'm', version: 3 },
    );
    expect(useMealDraftStore.getState().linkRecognizedToMenus([menu(), setMenu])).toEqual({ linked: 1, unmatched: 1 });
    expect(useMealDraftStore.getState().items).toMatchObject([
      { name: '김치찌개', foodId: 'food-1', dishType: 'stew', recognitionDishId: 'd1', menuName: '묵은지 김치찌개', menuPrice: 9000 },
      { name: '돈가스' },
    ]);
    expect(useMealDraftStore.getState().items[1]!.menuName ?? null).toBeNull();
  });

  it('사용자가 손본 인식 줄과 직접 넣은 줄은 메뉴에 잇지 않는다', () => {
    const st = useMealDraftStore.getState();
    st.applyRecognition([dish({ recognitionDishId: 'd1' })], { model: 'm', version: 2 });
    st.updateItem(useMealDraftStore.getState().items[0]!.clientId, { portion: 'large' });
    st.addItem({ name: '김치찌개', foodId: 'food-1', dishType: null, mainIngredient: null, cuisine: null, portion: null, isMain: true, confidence: null, source: 'catalog', candidates: [] });
    expect(useMealDraftStore.getState().linkRecognizedToMenus([menu()])).toEqual({ linked: 0, unmatched: 0 });
    expect(useMealDraftStore.getState().items.every((it) => !it.menuName)).toBe(true);
  });
});

describe('meal draft 시작 도우미', () => {
  const savedEntry = (): MealEntryType => ({
    id: 'entry-1',
    eatenAt: '2026-09-27T03:30:00.000Z',
    eatenDate: '2026-09-27',
    slot: 'lunch',
    mealType: 'dining_out',
    placeId: 'place-1',
    placeName: '숯토리',
    memo: '팀 점심',
    source: 'photo',
    originRecommendationId: null,
    items: [
      {
        id: 'item-1',
        name: '김치찌개',
        foodId: 'food-1',
        dishType: 'stew',
        mainIngredient: 'pork',
        cuisine: 'korean',
        portion: 'large',
        servings: null,
        portionSource: 'vision_ordinal',
        isMain: true,
        confidence: 0.82,
        recognitionDishId: 'dish-1',
        selectedCandidateRank: 0,
        catalogMatchedBy: 'food_id',
        catalogMatchScore: 1,
        source: 'recognized',
        sortOrder: 0,
        kcal: 300,
        proteinG: 20,
        sodiumMg: 1500,
        nutritionFrom: null,
        nutritionBasis: 'direct',
        menuName: '묵은지 김치찌개',
        menuPrice: 9000,
      },
    ],
    photos: [{ token: 'photo-token-1', width: 10, height: 10, byteSize: 100, sortOrder: 0 }],
    recognition: null,
    photoPurgedAt: null,
    createdAt: '2026-09-27T03:40:00.000Z',
    updatedAt: '2026-09-27T03:40:00.000Z',
  });

  beforeEach(() => {
    setMealDraftLocalFileAdapter(null);
    useMealDraftStore.getState().clear();
  });

  it('수정 draft 는 기록 id·사진·인식 계보를 그대로 싣고 사용자 확인값으로 표시한다', () => {
    useMealDraftStore.getState().start(mealDraftInitFromEntry(savedEntry()));
    const s = useMealDraftStore.getState();
    expect(s.entryId).toBe('entry-1');
    expect(s.memo).toBe('팀 점심');
    expect(s.photos).toEqual([{ token: 'photo-token-1', localUri: null }]);
    expect(s.items[0]).toMatchObject({
      clientId: 'item-1',
      recognitionDishId: 'dish-1',
      selectedCandidateRank: 0,
      source: 'recognized',
      userEdited: true,
    });
    // 저장 입력으로 되돌려도 계보가 빠지지 않는다.
    expect(draftItemToInput(s.items[0]!)).toMatchObject({
      recognitionDishId: 'dish-1',
      catalogMatchedBy: 'food_id',
      confidence: 0.82,
      // 그 집 메뉴명·가격도 그대로 — 앱에서 고쳐 저장해도(항목 전량 교체) 지워지지 않는다.
      menuName: '묵은지 김치찌개',
      menuPrice: 9000,
    });
  });

  it('다시 기록 draft 는 지금 시각의 새 기록이고 사진·메모·인식 신뢰도를 빼고 출처를 카탈로그로 바꾼다', () => {
    const now = new Date(2026, 8, 29, 19, 5);
    useMealDraftStore.getState().start(mealDraftInitForRepeat(savedEntry(), now));
    const s = useMealDraftStore.getState();
    expect(s.entryId).toBeNull();
    expect(s.eatenAt).toBe(now.toISOString());
    expect(s.eatenDate).toBe('2026-09-29');
    expect(s.slot).toBe('dinner');
    expect(s.placeName).toBe('숯토리');
    expect(s.memo).toBe('');
    expect(s.photos).toEqual([]);
    expect(s.items[0]).toMatchObject({
      name: '김치찌개',
      portion: 'large',
      confidence: null,
      source: 'catalog',
      // 장소를 그대로 가져가니 그 집 메뉴 연결도 함께 간다.
      menuName: '묵은지 김치찌개',
      menuPrice: 9000,
    });
    expect(s.items[0]!.recognitionDishId).toBeUndefined();
  });

  it('추천에서 시작한 draft 는 원본 추천 id 와 추천 끼니·후보 분류를 갖는다', () => {
    const now = new Date(2026, 8, 29, 11, 0);
    const rec = {
      id: 'rec-9',
      targetDate: '2026-09-29',
      targetSlot: 'dinner',
      items: [
        {
          name: '연어초밥',
          foodId: 'food-9',
          dishType: 'raw_fish',
          mainIngredient: 'fish',
          cuisine: 'japanese',
        },
      ],
    } as unknown as MealRecommendationType;
    startMealDraftFromRecommendation(rec, '연어초밥', 'delivery', now);
    const s = useMealDraftStore.getState();
    expect(s.originRecommendationId).toBe('rec-9');
    expect(s.slot).toBe('dinner');
    expect(s.mealType).toBe('delivery');
    expect(s.eatenDate).toBe('2026-09-29');
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({
      name: '연어초밥',
      foodId: 'food-9',
      dishType: 'raw_fish',
      source: 'recommendation',
    });
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
  it('검색·식사 유형·기록 출처를 직렬화한다', () => {
    expect(buildMealEntriesQuery({ q: '김치 찌개', mealType: 'dining_out', source: 'photo' })).toBe(
      'mealType=dining_out&source=photo&q=%EA%B9%80%EC%B9%98+%EC%B0%8C%EA%B0%9C',
    );
  });
});
