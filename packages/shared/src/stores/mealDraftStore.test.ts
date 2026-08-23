import { beforeEach, describe, expect, it } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import type { RecognizedDishType } from '@repo/api-contract';
import {
  beginMealDraftPhotoPreparation,
  draftItemToInput,
  getMealDraftIdentity,
  getMealDraftSaveFlight,
  isMealDraftIdentityCurrent,
  MEAL_DRAFT_MAX_PHOTOS,
  setMealDraftLocalFileAdapter,
  setMealDraftPrincipal,
  setMealDraftStorage,
  runMealDraftPhotoFlushSingleFlight,
  runMealDraftSaveSingleFlight,
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
