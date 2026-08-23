import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
  MealItemInputType,
  MealPortionType,
  MealSlotType,
  MealTypeType,
  RecognizedDishType,
} from '@repo/api-contract';
import { createInjectableStorage } from './injectableStorage.js';

// 식단 입력 draft — 사진 인식 → 편집 → 저장 사이에서 앱이 백그라운드로 가거나 종료돼도
// 입력을 잃지 않게 persist 한다(정산 draft 와 같은 이유·같은 어댑터 주입 패턴).
// 웹은 sessionStorage(탭 수명), 앱은 AsyncStorage — 앱 entry 에서 setMealDraftStorage 주입.
//
// 서버에 저장되면 clear() 한다. 한 번에 한 건만 — 여러 기록을 동시에 쓰는 흐름이 없다.

const draftStorage = createInjectableStorage({ web: 'session' });

const DRAFT_STORAGE_KEY = 'lp:meal-draft-v1';
const scopedDraftKey = (principalId: string): string =>
  `${DRAFT_STORAGE_KEY}:principal:${encodeURIComponent(principalId)}`;

// persist 미들웨어가 넘기는 고정 name 을 현재 로그인 주체의 물리 키로 바꾼다.
// principal 이 확정되기 전에는 읽기·쓰기를 모두 막아, 부팅 중 예전 계정 draft 가
// 잠깐이라도 새 화면에 복원되지 않게 한다.
let activeDraftPrincipal: string | null = null;
let desiredDraftPrincipal: string | null = null;
let principalTransition: Promise<void> = Promise.resolve();
let principalBoundaryInitialized = false;
const principalScopedDraftStorage: StateStorage = {
  getItem: () =>
    activeDraftPrincipal
      ? draftStorage.storage.getItem(scopedDraftKey(activeDraftPrincipal))
      : null,
  setItem: (_name, value) =>
    activeDraftPrincipal
      ? draftStorage.storage.setItem(scopedDraftKey(activeDraftPrincipal), value)
      : undefined,
  removeItem: () =>
    activeDraftPrincipal
      ? draftStorage.storage.removeItem(scopedDraftKey(activeDraftPrincipal))
      : undefined,
};

export const setMealDraftStorage = (storage: StateStorage): void => {
  draftStorage.setStorage(storage);
};

/**
 * 앱이 소유한 draft 사진 파일의 수명 어댑터.
 *
 * shared 는 FileSystem 을 import 하지 않는다. 앱 entry 가 구현을 주입하고, 웹은
 * 미주입 상태로 즉시 업로드 경로를 그대로 쓴다. principal 전환은 완료를 기다려
 * 이전 계정 파일이 남은 채 다음 계정 draft 를 복원하지 않게 한다.
 */
export interface MealDraftLocalFileAdapter {
  deleteFiles: (uris: readonly string[]) => void | Promise<void>;
  clearAll: () => void | Promise<void>;
  switchPrincipal: (principalId: string | null) => void | Promise<void>;
}

const NO_OP_LOCAL_FILE_ADAPTER: MealDraftLocalFileAdapter = {
  deleteFiles: () => undefined,
  clearAll: () => undefined,
  switchPrincipal: () => undefined,
};

let localFileAdapter: MealDraftLocalFileAdapter = NO_OP_LOCAL_FILE_ADAPTER;

export const setMealDraftLocalFileAdapter = (adapter: MealDraftLocalFileAdapter | null): void => {
  localFileAdapter = adapter ?? NO_OP_LOCAL_FILE_ADAPTER;
};

const ignoreLocalFileError = (work: () => void | Promise<void>): void => {
  try {
    void Promise.resolve(work()).catch(() => undefined);
  } catch {
    // 사용자 입력 상태 정리는 파일 삭제 실패로 막지 않는다.
  }
};

export const MEAL_DRAFT_MAX_PHOTOS = 5;

export interface MealDraftIdentity {
  principalId: string | null;
  sessionId: string;
}

const draftIdentityKey = (identity: MealDraftIdentity): string =>
  JSON.stringify([identity.principalId, identity.sessionId]);

/**
 * 사진 선택기/앱 소유 경로 staging과 저장 사이의 세션 단위 correctness lock.
 *
 * 저장 의도가 등록되면 새 picker는 시작하지 못하고, 이미 열린 picker/staging은 lease를
 * 끝낼 때까지 저장이 기다린다. 컴포넌트가 unmount/remount되어도 모듈 수명으로 유지된다.
 */
export interface MealDraftPhotoPreparationLease {
  finish: () => void;
}

const photoPreparations = new Map<string, Set<Promise<void>>>();
const photoFlushFlights = new Map<string, Promise<boolean>>();
const saveFlights = new Map<string, Promise<void>>();

export const beginMealDraftPhotoPreparation = (
  identity: MealDraftIdentity,
): MealDraftPhotoPreparationLease | null => {
  if (!isMealDraftIdentityCurrent(identity)) return null;
  const key = draftIdentityKey(identity);
  if (saveFlights.has(key)) return null;

  let resolvePreparation = (): void => undefined;
  const preparation = new Promise<void>((resolve) => {
    resolvePreparation = resolve;
  });
  const active = photoPreparations.get(key) ?? new Set<Promise<void>>();
  active.add(preparation);
  photoPreparations.set(key, active);

  let finished = false;
  return {
    finish: () => {
      if (finished) return;
      finished = true;
      active.delete(preparation);
      if (active.size === 0 && photoPreparations.get(key) === active) {
        photoPreparations.delete(key);
      }
      resolvePreparation();
    },
  };
};

const waitForMealDraftPhotoPreparations = async (
  identity: MealDraftIdentity,
): Promise<boolean> => {
  const key = draftIdentityKey(identity);
  while (true) {
    const active = photoPreparations.get(key);
    if (!active || active.size === 0) return isMealDraftIdentityCurrent(identity);
    await Promise.allSettled([...active]);
    if (!isMealDraftIdentityCurrent(identity)) return false;
    // saveFlights가 먼저 등록돼 새 lease를 막지만, finish와 같은 tick에 이미 등록된 lease가
    // 있을 수 있으므로 Set이 완전히 빌 때까지 다시 확인한다.
  }
};

/** 같은 draft 세션의 모든 편집기 인스턴스가 합류하는 pending 사진 flush single-flight. */
export const runMealDraftPhotoFlushSingleFlight = (
  identity: MealDraftIdentity,
  work: () => Promise<boolean>,
): Promise<boolean> => {
  const key = draftIdentityKey(identity);
  const existing = photoFlushFlights.get(key);
  if (existing) return existing;
  const running = Promise.resolve()
    .then(work)
    .finally(() => {
      if (photoFlushFlights.get(key) === running) photoFlushFlights.delete(key);
    });
  photoFlushFlights.set(key, running);
  return running;
};

/** 저장 중 수동 재인식이 자기 자신을 기다리지 않도록 현재 세션의 저장 Promise를 조회한다. */
export const getMealDraftSaveFlight = (
  identity: MealDraftIdentity,
): Promise<void> | null => saveFlights.get(draftIdentityKey(identity)) ?? null;

/**
 * 동일 세션의 중복 저장을 합치고, 저장 payload를 만들기 전에 열린 picker/staging을 기다린다.
 * saveFlights 등록은 첫 await보다 먼저 일어나므로 그 뒤 새 picker가 끼어들 수 없다.
 */
export const runMealDraftSaveSingleFlight = (
  identity: MealDraftIdentity,
  work: () => Promise<void>,
): Promise<void> => {
  const key = draftIdentityKey(identity);
  const existing = saveFlights.get(key);
  if (existing) return existing;
  if (!isMealDraftIdentityCurrent(identity)) return Promise.resolve();

  const running = Promise.resolve()
    .then(async () => {
      if (!(await waitForMealDraftPhotoPreparations(identity))) return;
      await work();
    })
    .finally(() => {
      if (saveFlights.get(key) === running) saveFlights.delete(key);
    });
  saveFlights.set(key, running);
  return running;
};

export interface MealDraftItem {
  // client-only id — 추가/삭제/순서 변경용. 저장 시 서버가 새 id 를 준다.
  clientId: string;
  name: string;
  foodId: string | null;
  dishType: MealItemInputType['dishType'];
  mainIngredient: MealItemInputType['mainIngredient'];
  cuisine: MealItemInputType['cuisine'];
  portion: MealPortionType | null;
  servings?: number | null;
  portionSource?: MealItemInputType['portionSource'];
  isMain: boolean;
  confidence: number | null;
  recognitionDishId?: string | null;
  selectedCandidateRank?: number | null;
  catalogMatchedBy?: MealItemInputType['catalogMatchedBy'];
  catalogMatchScore?: number | null;
  source: MealItemInputType['source'];
  // 인식이 준 대안 — UI 가 탭으로 바꿔 고른다. 저장 시엔 쓰이지 않는다.
  candidates: { name: string; confidence: number }[];
  // 인식 항목이라도 사용자가 이름·양·주식 여부 등을 손봤으면 재인식 때 보존한다.
  // 구버전 persist 값에는 없을 수 있어 optional 이다.
  userEdited?: boolean;
}

export interface MealDraftPhoto {
  token: string;
  // 표시용 로컬 URI(앱 픽커가 준 것) — 업로드 후에도 미리보기에 쓴다.
  localUri: string | null;
  // true 인 URI만 앱이 삭제한다. 픽커/외부 URI를 지우지 않는 경계다.
  managedLocalFile?: boolean;
}

export interface MealDraftPendingPhoto {
  clientId: string;
  localUri: string;
  name: string;
  mimeType: string;
  managedLocalFile: boolean;
  status: 'pending' | 'missing';
  lastError: string | null;
}

interface MealDraftState {
  // start/clear/principal 전환마다 바뀌는 불변 세대 id. 비동기 업로드·인식·저장은
  // 시작 시 이 값을 캡처하고 완료 직전 다시 비교해 다른 draft를 덮지 않는다.
  readonly draftSessionId: string;
  // 수정 중인 기존 기록 id. 새 기록이면 null.
  entryId: string | null;
  // 추천 카드에서 시작한 새 기록의 원본. 저장 성공 전에는 추천 feedback 을 만들지 않는다.
  originRecommendationId: string | null;
  eatenAt: string;
  eatenDate: string;
  slot: MealSlotType;
  mealType: MealTypeType | null;
  placeId: string | null;
  placeName: string | null;
  memo: string;
  photos: MealDraftPhoto[];
  pendingPhotos: MealDraftPendingPhoto[];
  items: MealDraftItem[];
  // 인식 원본 — 저장 시 서버로 함께 보내 품질 측정에 남긴다.
  recognition: { model: string; version: number; dishes: RecognizedDishType[] } | null;
  updatedAt: number;

  start: (init: Partial<Omit<MealDraftState, keyof MealDraftActions | 'draftSessionId'>>) => void;
  setField: <K extends keyof MealDraftState>(key: K, value: MealDraftState[K]) => void;
  addPhoto: (photo: MealDraftPhoto) => void;
  removePhoto: (token: string) => void;
  addPendingPhoto: (photo: MealDraftPendingPhoto) => void;
  updatePendingPhoto: (
    clientId: string,
    patch: Partial<Omit<MealDraftPendingPhoto, 'clientId'>>,
  ) => void;
  removePendingPhoto: (clientId: string) => void;
  promotePendingPhoto: (clientId: string, photo: MealDraftPhoto) => void;
  addItem: (item: Omit<MealDraftItem, 'clientId'>) => void;
  updateItem: (clientId: string, patch: Partial<MealDraftItem>) => void;
  removeItem: (clientId: string) => void;
  applyRecognition: (
    dishes: RecognizedDishType[],
    meta: { model: string; version: number },
    options?: { mode?: 'append' | 'replace-recognized' },
  ) => void;
  clear: (expectedSessionId?: string) => boolean;
}

type MealDraftActions = Pick<
  MealDraftState,
  | 'start'
  | 'setField'
  | 'addPhoto'
  | 'removePhoto'
  | 'addPendingPhoto'
  | 'updatePendingPhoto'
  | 'removePendingPhoto'
  | 'promotePendingPhoto'
  | 'addItem'
  | 'updateItem'
  | 'removeItem'
  | 'applyRecognition'
  | 'clear'
>;

const nextClientId = (): string =>
  `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
let draftSessionSequence = 0;
const nextDraftSessionId = (): string => {
  draftSessionSequence += 1;
  return `meal-draft-${Date.now().toString(36)}-${draftSessionSequence.toString(36)}-${Math.floor(
    Math.random() * 0x1_0000_0000,
  ).toString(36)}`;
};

const emptyDraft = (): Omit<MealDraftState, keyof MealDraftActions> => ({
  draftSessionId: nextDraftSessionId(),
  entryId: null,
  originRecommendationId: null,
  eatenAt: new Date().toISOString(),
  eatenDate: '',
  slot: 'lunch',
  mealType: null,
  placeId: null,
  placeName: null,
  memo: '',
  photos: [],
  pendingPhotos: [],
  items: [],
  recognition: null,
  updatedAt: 0,
});

export const useMealDraftStore = create<MealDraftState>()(
  persist(
    (set, get) => ({
      ...emptyDraft(),

      start: (init) => {
        ignoreLocalFileError(() => localFileAdapter.clearAll());
        set({ ...emptyDraft(), ...init, updatedAt: Date.now() });
      },

      setField: (key, value) =>
        set({ [key]: value, updatedAt: Date.now() } as Partial<MealDraftState>),

      addPhoto: (photo) =>
        set((s) =>
          s.photos.some((p) => p.token === photo.token) ||
          s.photos.length + s.pendingPhotos.length >= MEAL_DRAFT_MAX_PHOTOS
            ? s
            : { photos: [...s.photos, photo], updatedAt: Date.now() },
        ),

      removePhoto: (token) =>
        set((s) => {
          const removed = s.photos.find((photo) => photo.token === token);
          if (removed?.managedLocalFile && removed.localUri) {
            ignoreLocalFileError(() => localFileAdapter.deleteFiles([removed.localUri!]));
          }
          return { photos: s.photos.filter((p) => p.token !== token), updatedAt: Date.now() };
        }),

      addPendingPhoto: (photo) =>
        set((s) =>
          s.pendingPhotos.some((p) => p.clientId === photo.clientId) ||
          s.photos.length + s.pendingPhotos.length >= MEAL_DRAFT_MAX_PHOTOS
            ? s
            : { pendingPhotos: [...s.pendingPhotos, photo], updatedAt: Date.now() },
        ),

      updatePendingPhoto: (clientId, patch) =>
        set((s) => ({
          pendingPhotos: s.pendingPhotos.map((photo) =>
            photo.clientId === clientId ? { ...photo, ...patch } : photo,
          ),
          updatedAt: Date.now(),
        })),

      removePendingPhoto: (clientId) =>
        set((s) => {
          const removed = s.pendingPhotos.find((photo) => photo.clientId === clientId);
          if (removed?.managedLocalFile) {
            ignoreLocalFileError(() => localFileAdapter.deleteFiles([removed.localUri]));
          }
          return {
            pendingPhotos: s.pendingPhotos.filter((photo) => photo.clientId !== clientId),
            updatedAt: Date.now(),
          };
        }),

      promotePendingPhoto: (clientId, photo) =>
        set((s) => {
          const pending = s.pendingPhotos.find((item) => item.clientId === clientId);
          if (!pending) return s;
          if (s.photos.some((item) => item.token === photo.token)) {
            if (pending.managedLocalFile) {
              ignoreLocalFileError(() => localFileAdapter.deleteFiles([pending.localUri]));
            }
            return {
              pendingPhotos: s.pendingPhotos.filter((item) => item.clientId !== clientId),
              updatedAt: Date.now(),
            };
          }
          return {
            photos: [...s.photos, photo],
            pendingPhotos: s.pendingPhotos.filter((item) => item.clientId !== clientId),
            updatedAt: Date.now(),
          };
        }),

      addItem: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, clientId: nextClientId() }],
          updatedAt: Date.now(),
        })),

      updateItem: (clientId, patch) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.clientId === clientId ? { ...it, ...patch, userEdited: true } : it,
          ),
          updatedAt: Date.now(),
        })),

      removeItem: (clientId) =>
        set((s) => ({
          items: s.items.filter((it) => it.clientId !== clientId),
          updatedAt: Date.now(),
        })),

      // 새 사진만 인식할 때는 append, 전체 사진을 "다시 인식"할 때는 이전 자동 인식 항목만
      // 교체한다. 사용자가 손본 인식 항목과 수동·카탈로그·추천 항목은 사실상 확정값이라 보존한다.
      applyRecognition: (dishes, meta, options) =>
        set((s) => {
          const mode = options?.mode ?? 'append';
          const kept =
            mode === 'replace-recognized'
              ? s.items.filter((item) => item.source !== 'recognized' || item.userEdited === true)
              : s.items;
          // 보존 항목과 같은 음식은 다시 추가하지 않는다. 모델 응답 안의 같은 이름 여러 개는
          // 서로 다른 접시일 수 있어 그대로 둔다.
          const keptFoodIds = new Set(
            kept.map((item) => item.foodId).filter((id): id is string => !!id),
          );
          const keptNames = new Set(
            kept
              .map((item) => item.name.trim().toLocaleLowerCase().replace(/\s+/g, ''))
              .filter((name) => name.length > 0),
          );
          const recognized = dishes
            .filter((dish) => {
              const name = (dish.matchedName ?? dish.name)
                .trim()
                .toLocaleLowerCase()
                .replace(/\s+/g, '');
              return !(dish.foodId && keptFoodIds.has(dish.foodId)) && !keptNames.has(name);
            })
            .map(
              (d): MealDraftItem => ({
                clientId: nextClientId(),
                name: d.matchedName ?? d.name,
                foodId: d.foodId,
                dishType: d.dishType,
                mainIngredient: d.mainIngredient,
                cuisine: d.cuisine,
                portion: d.portion,
                servings: null,
                portionSource: d.portion ? 'vision_ordinal' : null,
                isMain: d.isMain,
                confidence: d.confidence,
                recognitionDishId: d.recognitionDishId ?? null,
                // 서버가 후보 이름과 최종 인식명이 실제로 같을 때만 rank를 준다. 후보가 있다는
                // 이유만으로 null을 0으로 만들면 계보 품질 집계에서 잘못 고른 후보가 된다.
                selectedCandidateRank: d.selectedCandidateRank ?? null,
                catalogMatchedBy: d.catalogMatchedBy ?? (d.foodId ? 'food_id' : 'none'),
                catalogMatchScore: d.catalogMatchScore ?? null,
                source: 'recognized' as const,
                candidates: d.candidates,
                userEdited: false,
              }),
            );
          const previousDishes =
            mode === 'append' &&
            s.recognition?.model === meta.model &&
            s.recognition.version === meta.version
              ? s.recognition.dishes
              : [];
          return {
            items: [...kept, ...recognized],
            recognition: {
              model: meta.model,
              version: meta.version,
              dishes: [...previousDishes, ...dishes],
            },
            updatedAt: Date.now(),
          };
        }),

      clear: (expectedSessionId) => {
        if (expectedSessionId && get().draftSessionId !== expectedSessionId) return false;
        ignoreLocalFileError(() => localFileAdapter.clearAll());
        set({ ...emptyDraft() });
        return true;
      },
    }),
    {
      name: DRAFT_STORAGE_KEY,
      storage: createJSONStorage(() => principalScopedDraftStorage),
      // 액션은 저장하지 않는다.
      partialize: (s) => ({
        draftSessionId: s.draftSessionId,
        entryId: s.entryId,
        originRecommendationId: s.originRecommendationId,
        eatenAt: s.eatenAt,
        eatenDate: s.eatenDate,
        slot: s.slot,
        mealType: s.mealType,
        placeId: s.placeId,
        placeName: s.placeName,
        memo: s.memo,
        photos: s.photos,
        pendingPhotos: s.pendingPhotos,
        items: s.items,
        recognition: s.recognition,
        updatedAt: s.updatedAt,
      }),
    },
  ),
);

/**
 * 식단 draft 의 로컬 보안 경계를 로그인 사용자 단위로 전환한다.
 *
 * 전환을 시작하는 순간 메모리 draft 를 먼저 비우고, 직전 사용자의 영속 draft 도
 * 삭제한다. 따라서 로그아웃 뒤 같은 기기에서 다른 계정이 로그인해도 사진 URI,
 * 장소, 메모, 인식 결과가 넘어가지 않는다. principal 이 없는 동안 persist 는
 * NO_OP 이며, 앱 부팅에서 principal 을 다시 지정하면 그 계정 키만 복원한다.
 */
export const setMealDraftPrincipal = (principalId: string | null): Promise<void> => {
  const next = principalId?.trim() || null;
  if (
    principalBoundaryInitialized &&
    next === activeDraftPrincipal &&
    next === desiredDraftPrincipal
  ) {
    return principalTransition;
  }

  const previous = activeDraftPrincipal;
  principalBoundaryInitialized = true;
  desiredDraftPrincipal = next;
  // await 전 동기 경계: 호출 직후부터 이전 사용자 값을 어떤 화면도 읽을 수 없다.
  activeDraftPrincipal = null;
  // clear()는 비동기 파일 정리를 시작하므로 principal 전환에서는 상태만
  // 즉시 비우고, 아래 transition 큐가 파일 namespace 전환 완료를 기다린다.
  useMealDraftStore.setState({ ...emptyDraft() });

  const transition = async (): Promise<void> => {
    if (previous) await draftStorage.storage.removeItem(scopedDraftKey(previous));
    // v1 고정 키는 어느 계정 소유인지 증명할 수 없으므로 마이그레이션하지 않고 폐기한다.
    await draftStorage.storage.removeItem(DRAFT_STORAGE_KEY);
    if (desiredDraftPrincipal !== next) return;

    await localFileAdapter.switchPrincipal(next);
    if (desiredDraftPrincipal !== next) return;
    activeDraftPrincipal = next;
    if (next) await useMealDraftStore.persist.rehydrate();

    // rehydrate 도중 더 최신 principal 전환이 들어왔으면 방금 읽은 값을 즉시 폐기한다.
    if (desiredDraftPrincipal !== next) {
      activeDraftPrincipal = null;
      useMealDraftStore.setState({ ...emptyDraft() });
    }
  };
  principalTransition = principalTransition.then(transition, transition);
  return principalTransition;
};

/** 비동기 식단 작업이 시작한 계정·draft 세대가 아직 현재 값인지 확인한다. */
export const getMealDraftIdentity = (): MealDraftIdentity => ({
  principalId: activeDraftPrincipal,
  sessionId: useMealDraftStore.getState().draftSessionId,
});

export const isMealDraftIdentityCurrent = (identity: MealDraftIdentity): boolean => {
  const current = getMealDraftIdentity();
  return current.principalId === identity.principalId && current.sessionId === identity.sessionId;
};

/** mutation 응답 캐시는 draft 세대가 아니라 계정 경계만 같으면 안전하게 반영할 수 있다. */
export const isMealDraftPrincipalCurrent = (principalId: string | null): boolean =>
  activeDraftPrincipal === principalId;

draftStorage.bindRehydrate(() => {
  void useMealDraftStore.persist.rehydrate();
});

// draft 항목 → 서버 입력. candidates·clientId 는 계약에 없다.
export const draftItemToInput = (item: MealDraftItem): MealItemInputType => ({
  name: item.name,
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
});
