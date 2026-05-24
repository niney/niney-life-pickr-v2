import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ReceiptItemCategoryType,
  SettlementParticipantInputType,
  SettlementSourceType,
} from '@repo/api-contract';

// 정산하기 다단계 흐름의 draft 상태. 새로고침 시에도 진행 중인 입력을
// 잃지 않게 sessionStorage 에 persist. 식당 별 1개만 보관 — 다른 식당으로
// 가면 reset.

export interface DraftItem {
  // client-only id — 추가/삭제/순서 변경에 사용. 저장 시 서버가 새 id 부여.
  clientId: string;
  name: string;
  unitPrice: number | null;
  quantity: number | null;
  amount: number;
  category: ReceiptItemCategoryType;
  matchedMenuName: string | null;
}

export type DraftParticipant = SettlementParticipantInputType & {
  clientId: string;
};

export interface SettlementDraft {
  // 한 식당에 한 draft. placeId 가 바뀌면 초기화.
  placeId: string | null;
  source: SettlementSourceType | null;
  participants: DraftParticipant[];
  items: DraftItem[];
  // 영수증 분기로 들어왔을 때 업로드한 이미지 정보.
  receiptImageToken: string | null;
  receiptPreviewUrl: string | null;
  // 영수증 분기에서 추출 시 server 가 반환한 총액 / 경고. MANUAL 은 null.
  totalAmount: number | null;
  warning: string | null;
}

const emptyDraft = (): SettlementDraft => ({
  placeId: null,
  source: null,
  participants: [],
  items: [],
  receiptImageToken: null,
  receiptPreviewUrl: null,
  totalAmount: null,
  warning: null,
});

interface SettlementDraftStore extends SettlementDraft {
  startFor(placeId: string): void;
  reset(): void;
  setSource(source: SettlementSourceType): void;

  setParticipants(participants: DraftParticipant[]): void;
  addParticipant(p: Omit<DraftParticipant, 'clientId'>): void;
  // 단골 다중 선택 모달이 호출 — 이름·닉네임 둘 다 빈 기존 행을 정리한 뒤
  // 새 항목들을 뒤에 append. clientId 는 store 가 부여.
  addParticipantsAndCompact(items: Omit<DraftParticipant, 'clientId'>[]): void;
  updateParticipant(clientId: string, patch: Partial<Omit<DraftParticipant, 'clientId'>>): void;
  removeParticipant(clientId: string): void;

  setItems(items: DraftItem[]): void;
  addItem(it: Omit<DraftItem, 'clientId'>): void;
  updateItem(clientId: string, patch: Partial<Omit<DraftItem, 'clientId'>>): void;
  removeItem(clientId: string): void;

  setReceipt(args: {
    imageToken: string;
    previewUrl: string;
    items?: DraftItem[];
    totalAmount?: number | null;
    warning?: string | null;
  }): void;
}

// crypto.randomUUID 가 없는 환경(아주 오래된 브라우저) 폴백.
const newClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const useSettlementDraftStore = create<SettlementDraftStore>()(
  persist(
    (set, get) => ({
      ...emptyDraft(),

      startFor(placeId) {
        // 같은 placeId 의 draft 는 보존, 다른 식당이면 초기화.
        const cur = get();
        if (cur.placeId === placeId) return;
        set({ ...emptyDraft(), placeId });
      },

      reset() {
        set(emptyDraft());
      },

      setSource(source) {
        set({ source });
      },

      setParticipants(participants) {
        set({ participants });
      },
      addParticipant(p) {
        set((s) => ({
          participants: [...s.participants, { ...p, clientId: newClientId() }],
        }));
      },
      addParticipantsAndCompact(items) {
        set((s) => {
          const filtered = s.participants.filter((p) => {
            const nm = (p.name ?? '').trim();
            const nick = (p.nickname ?? '').trim();
            return nm.length > 0 || nick.length > 0;
          });
          const fresh = items.map((p) => ({ ...p, clientId: newClientId() }));
          return { participants: [...filtered, ...fresh] };
        });
      },
      updateParticipant(clientId, patch) {
        set((s) => ({
          participants: s.participants.map((p) =>
            p.clientId === clientId ? { ...p, ...patch } : p,
          ),
        }));
      },
      removeParticipant(clientId) {
        set((s) => ({
          participants: s.participants.filter((p) => p.clientId !== clientId),
        }));
      },

      setItems(items) {
        set({ items });
      },
      addItem(it) {
        set((s) => ({ items: [...s.items, { ...it, clientId: newClientId() }] }));
      },
      updateItem(clientId, patch) {
        set((s) => ({
          items: s.items.map((it) => (it.clientId === clientId ? { ...it, ...patch } : it)),
        }));
      },
      removeItem(clientId) {
        set((s) => ({ items: s.items.filter((it) => it.clientId !== clientId) }));
      },

      setReceipt({ imageToken, previewUrl, items, totalAmount, warning }) {
        // 영수증 교체 시 totalAmount/warning 은 이전 값을 끌고 오면 안 된다 —
        // 예: A 가 불일치(warning 세팅) → B 가 일치(warning=null) 인데 ?? 폴백을
        // 쓰면 A 의 warning 이 살아남아 B 에도 잘못 표시됨.
        set((s) => ({
          source: 'RECEIPT',
          receiptImageToken: imageToken,
          receiptPreviewUrl: previewUrl,
          totalAmount: totalAmount ?? null,
          warning: warning ?? null,
          items:
            items != null
              ? items.map((it) => ({ ...it, clientId: it.clientId || newClientId() }))
              : s.items,
        }));
      },
    }),
    {
      name: 'settlement-draft-v1',
      // 새로고침은 살리되 브라우저 닫으면 사라지게 sessionStorage.
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return window.sessionStorage;
        // SSR/test 에서 sessionStorage 가 없을 때를 위한 no-op. createJSONStorage
        // 가 받는 StateStorage 는 Storage 보다 좁아 길이/clear 등이 없어도 된다.
        return {
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined,
        };
      }),
    },
  ),
);
