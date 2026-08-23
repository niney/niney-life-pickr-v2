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

export const setMealDraftStorage = (storage: StateStorage): void => {
  draftStorage.setStorage(storage);
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
  isMain: boolean;
  confidence: number | null;
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
}

interface MealDraftState {
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
  items: MealDraftItem[];
  // 인식 원본 — 저장 시 서버로 함께 보내 품질 측정에 남긴다.
  recognition: { model: string; version: number; dishes: RecognizedDishType[] } | null;
  updatedAt: number;

  start: (init: Partial<Omit<MealDraftState, keyof MealDraftActions>>) => void;
  setField: <K extends keyof MealDraftState>(key: K, value: MealDraftState[K]) => void;
  addPhoto: (photo: MealDraftPhoto) => void;
  removePhoto: (token: string) => void;
  addItem: (item: Omit<MealDraftItem, 'clientId'>) => void;
  updateItem: (clientId: string, patch: Partial<MealDraftItem>) => void;
  removeItem: (clientId: string) => void;
  applyRecognition: (
    dishes: RecognizedDishType[],
    meta: { model: string; version: number },
    options?: { mode?: 'append' | 'replace-recognized' },
  ) => void;
  clear: () => void;
}

type MealDraftActions = Pick<
  MealDraftState,
  'start' | 'setField' | 'addPhoto' | 'removePhoto' | 'addItem' | 'updateItem' | 'removeItem' | 'applyRecognition' | 'clear'
>;

const nextClientId = (): string => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const emptyDraft = (): Omit<MealDraftState, keyof MealDraftActions> => ({
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
  items: [],
  recognition: null,
  updatedAt: 0,
});

export const useMealDraftStore = create<MealDraftState>()(
  persist(
    (set, get) => ({
      ...emptyDraft(),

      start: (init) => set({ ...emptyDraft(), ...init, updatedAt: Date.now() }),

      setField: (key, value) => set({ [key]: value, updatedAt: Date.now() } as Partial<MealDraftState>),

      addPhoto: (photo) =>
        set((s) =>
          s.photos.some((p) => p.token === photo.token)
            ? s
            : { photos: [...s.photos, photo], updatedAt: Date.now() },
        ),

      removePhoto: (token) =>
        set((s) => ({ photos: s.photos.filter((p) => p.token !== token), updatedAt: Date.now() })),

      addItem: (item) =>
        set((s) => ({ items: [...s.items, { ...item, clientId: nextClientId() }], updatedAt: Date.now() })),

      updateItem: (clientId, patch) =>
        set((s) => ({
          items: s.items.map((it) =>
            it.clientId === clientId ? { ...it, ...patch, userEdited: true } : it,
          ),
          updatedAt: Date.now(),
        })),

      removeItem: (clientId) =>
        set((s) => ({ items: s.items.filter((it) => it.clientId !== clientId), updatedAt: Date.now() })),

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
          const keptFoodIds = new Set(kept.map((item) => item.foodId).filter((id): id is string => !!id));
          const keptNames = new Set(
            kept
              .map((item) => item.name.trim().toLocaleLowerCase().replace(/\s+/g, ''))
              .filter((name) => name.length > 0),
          );
          const recognized = dishes
            .filter((dish) => {
              const name = (dish.matchedName ?? dish.name).trim().toLocaleLowerCase().replace(/\s+/g, '');
              return !(dish.foodId && keptFoodIds.has(dish.foodId)) && !keptNames.has(name);
            })
            .map((d) => ({
              clientId: nextClientId(),
              name: d.matchedName ?? d.name,
              foodId: d.foodId,
              dishType: d.dishType,
              mainIngredient: d.mainIngredient,
              cuisine: d.cuisine,
              portion: d.portion,
              isMain: d.isMain,
              confidence: d.confidence,
              source: 'recognized' as const,
              candidates: d.candidates,
              userEdited: false,
            }));
          const previousDishes =
            mode === 'append' && s.recognition?.model === meta.model && s.recognition.version === meta.version
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

      clear: () => set({ ...emptyDraft() }),
    }),
    {
      name: 'lp:meal-draft-v1',
      storage: createJSONStorage(() => draftStorage.storage),
      // 액션은 저장하지 않는다.
      partialize: (s) => ({
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
        items: s.items,
        recognition: s.recognition,
        updatedAt: s.updatedAt,
      }),
    },
  ),
);

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
  isMain: item.isMain,
  confidence: item.confidence,
  source: item.source,
});
