import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
  ReceiptItemCategoryType,
  SettlementParticipantInputType,
  SettlementSourceType,
} from '@repo/api-contract';

// 정산하기 다단계 흐름의 draft 상태. 새로고침 시에도 진행 중인 입력을
// 잃지 않게 persist. 1차 식당 별 1개만 보관 — 다른 1차 식당으로 가면 reset.
//
// 차수(N차) 모델:
// - participants 는 세션 마스터 명단. exclude* 는 마스터 default.
// - rounds 는 차수 배열. 각 round 는 자기 식당·source·items·영수증 정보와
//   마스터 참여자 × 차수 attendance(참석 + 차수별 exclude override) 를 가진다.
// - 마스터 participants 가 추가/삭제될 때 모든 round 의 attendances 가
//   자동 동기화된다 (UI 가 별도로 관리하지 않아도 데이터 정합성 유지).
//
// storage 어댑터는 플랫폼별로 다르다 — 웹은 sessionStorage(브라우저 닫으면
// 사라짐), 앱은 AsyncStorage(앱 재실행에도 유지). 모듈 로드 시점엔 어느
// 플랫폼인지 모르므로 lazy resolver 로 처리하고, 앱은 entry 에서
// setSettlementDraftStorage 로 어댑터를 주입한다. 미주입 + window 도 없으면
// no-op 폴백 → persist 가 메모리만 쓰는 효과(SSR/테스트 안전).

let injectedStorage: StateStorage | null = null;

/**
 * RN/외부 환경에서 persist 용 storage 를 주입한다. 모듈 import 후 한 번만
 * 호출하면 된다. 미호출 + 브라우저 환경이면 window.sessionStorage 가 자동
 * 사용된다.
 */
export const setSettlementDraftStorage = (storage: StateStorage): void => {
  injectedStorage = storage;
};

const NO_OP_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const resolveStorage = (): StateStorage => {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  return NO_OP_STORAGE;
};

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

export type DraftParticipant = SettlementParticipantInputType;

export type ExcludeKey = 'excludeAlcohol' | 'excludeNonAlcohol' | 'excludeSide';
const OVERRIDE_KEY: Record<ExcludeKey, keyof DraftAttendance> = {
  excludeAlcohol: 'excludeAlcoholOverride',
  excludeNonAlcohol: 'excludeNonAlcoholOverride',
  excludeSide: 'excludeSideOverride',
};

export interface DraftAttendance {
  participantClientId: string;
  attended: boolean;
  // null = 마스터 default 그대로. true/false = 이 차수에서만 override.
  excludeAlcoholOverride: boolean | null;
  excludeNonAlcoholOverride: boolean | null;
  excludeSideOverride: boolean | null;
}

export interface DraftRound {
  clientId: string;
  placeId: string;
  placeName: string;
  source: SettlementSourceType | null;
  items: DraftItem[];
  receiptImageToken: string | null;
  receiptPreviewUrl: string | null;
  totalAmount: number | null;
  warning: string | null;
  attendances: DraftAttendance[];
}

export interface SettlementDraft {
  participants: DraftParticipant[];
  rounds: DraftRound[];
}

const emptyDraft = (): SettlementDraft => ({
  participants: [],
  rounds: [],
});

const emptyAttendance = (participantClientId: string): DraftAttendance => ({
  participantClientId,
  attended: true,
  excludeAlcoholOverride: null,
  excludeNonAlcoholOverride: null,
  excludeSideOverride: null,
});

const newRound = (placeId: string, placeName: string, participants: DraftParticipant[]): DraftRound => ({
  clientId: newClientId(),
  placeId,
  placeName,
  source: null,
  items: [],
  receiptImageToken: null,
  receiptPreviewUrl: null,
  totalAmount: null,
  warning: null,
  attendances: participants.map((p) => emptyAttendance(p.clientId)),
});

interface SettlementDraftStore extends SettlementDraft {
  // ── 세션 lifecycle ─────────────────────────────────────────────────
  // 1차 식당이 주어진 진입 (식당 상세 → 정산 버튼). 같은 1차 식당이면 진행
  // 중인 입력 보존. 다르면 reset 후 1차 round 를 prefill.
  startFor(placeId: string, placeName: string): void;
  // 식당 없이 진입 (/me/settlements/new). 기존 draft 가 있고 rounds 가 비어
  // 있지 않으면 그대로 보존 (사용자가 의도적으로 이어 입력하는 경우).
  startFromScratch(): void;
  reset(): void;

  // ── 마스터 참여자 ──────────────────────────────────────────────────
  setParticipants(participants: DraftParticipant[]): void;
  addParticipant(p: Omit<DraftParticipant, 'clientId'>): void;
  // 단골 다중 선택 모달이 호출 — 이름·닉네임 둘 다 빈 기존 행을 정리한 뒤
  // 새 항목들을 뒤에 append. clientId 는 store 가 부여.
  addParticipantsAndCompact(items: Omit<DraftParticipant, 'clientId'>[]): void;
  updateParticipant(clientId: string, patch: Partial<Omit<DraftParticipant, 'clientId'>>): void;
  removeParticipant(clientId: string): void;

  // ── 차수 ───────────────────────────────────────────────────────────
  addRound(placeId: string, placeName: string): string; // returns round.clientId
  removeRound(roundClientId: string): void;
  updateRoundMeta(
    roundClientId: string,
    patch: Partial<Pick<DraftRound, 'placeId' | 'placeName' | 'source' | 'totalAmount' | 'warning'>>,
  ): void;

  // 차수 내 items 편집.
  setRoundItems(roundClientId: string, items: DraftItem[]): void;
  addRoundItem(roundClientId: string, it: Omit<DraftItem, 'clientId'>): void;
  updateRoundItem(
    roundClientId: string,
    itemClientId: string,
    patch: Partial<Omit<DraftItem, 'clientId'>>,
  ): void;
  removeRoundItem(roundClientId: string, itemClientId: string): void;

  // 영수증 추출 결과 주입 — source 도 'RECEIPT' 로 함께 설정.
  setRoundReceipt(
    roundClientId: string,
    args: {
      imageToken: string;
      previewUrl: string;
      items?: DraftItem[];
      totalAmount?: number | null;
      warning?: string | null;
    },
  ): void;

  // 차수 × 참여자 attendance.
  setAttendance(roundClientId: string, participantClientId: string, attended: boolean): void;
  // override === null 이면 마스터 default 로 복귀.
  setExcludeOverride(
    roundClientId: string,
    participantClientId: string,
    key: ExcludeKey,
    override: boolean | null,
  ): void;
}

// crypto.randomUUID 가 없는 환경(아주 오래된 브라우저) 폴백.
const newClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

// 모든 round 의 attendances 에서 사라진 마스터 참여자 항목을 제거하고,
// 새로 추가된 마스터에게 default attendance 를 채운다.
const syncAttendances = (rounds: DraftRound[], participants: DraftParticipant[]): DraftRound[] => {
  const validIds = new Set(participants.map((p) => p.clientId));
  return rounds.map((r) => {
    const existing = new Map(r.attendances.map((a) => [a.participantClientId, a]));
    const next: DraftAttendance[] = participants.map(
      (p) => existing.get(p.clientId) ?? emptyAttendance(p.clientId),
    );
    // 혹시 모를 stale attendance 도 제거 — 위 map 으로 이미 처리되지만 명시.
    return { ...r, attendances: next.filter((a) => validIds.has(a.participantClientId)) };
  });
};

export const useSettlementDraftStore = create<SettlementDraftStore>()(
  persist(
    (set, get) => ({
      ...emptyDraft(),

      startFor(placeId, placeName) {
        const cur = get();
        const firstRoundPlaceId = cur.rounds[0]?.placeId ?? null;
        // 같은 1차 식당이면 진행 중인 입력 보존 (placeName 은 fresh).
        if (firstRoundPlaceId === placeId && cur.rounds.length > 0) {
          // placeName 만 최신화 — 식당명이 바뀌었어도 보이는 라벨은 따라간다.
          set((s) => ({
            rounds: s.rounds.map((r, i) =>
              i === 0 ? { ...r, placeName } : r,
            ),
          }));
          return;
        }
        // 다른 식당 → 완전 reset 후 1차 round prefill.
        const fresh = emptyDraft();
        set({
          ...fresh,
          rounds: [newRound(placeId, placeName, fresh.participants)],
        });
      },

      startFromScratch() {
        const cur = get();
        // 이어 입력 중이면 보존. 빈 상태면 새로.
        if (cur.rounds.length > 0 || cur.participants.length > 0) return;
        set(emptyDraft());
      },

      reset() {
        set(emptyDraft());
      },

      setParticipants(participants) {
        set((s) => ({ participants, rounds: syncAttendances(s.rounds, participants) }));
      },
      addParticipant(p) {
        set((s) => {
          const next = [...s.participants, { ...p, clientId: newClientId() }];
          return { participants: next, rounds: syncAttendances(s.rounds, next) };
        });
      },
      addParticipantsAndCompact(items) {
        set((s) => {
          const filtered = s.participants.filter((p) => {
            const nm = (p.name ?? '').trim();
            const nick = (p.nickname ?? '').trim();
            return nm.length > 0 || nick.length > 0;
          });
          const fresh = items.map((p) => ({ ...p, clientId: newClientId() }));
          const next = [...filtered, ...fresh];
          return { participants: next, rounds: syncAttendances(s.rounds, next) };
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
        set((s) => {
          const next = s.participants.filter((p) => p.clientId !== clientId);
          return { participants: next, rounds: syncAttendances(s.rounds, next) };
        });
      },

      // ── 차수 ─────────────────────────────────────────────────────
      addRound(placeId, placeName) {
        const round = newRound(placeId, placeName, get().participants);
        set((s) => ({ rounds: [...s.rounds, round] }));
        return round.clientId;
      },
      removeRound(roundClientId) {
        set((s) => ({ rounds: s.rounds.filter((r) => r.clientId !== roundClientId) }));
      },
      updateRoundMeta(roundClientId, patch) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId ? { ...r, ...patch } : r,
          ),
        }));
      },

      setRoundItems(roundClientId, items) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId ? { ...r, items } : r,
          ),
        }));
      },
      addRoundItem(roundClientId, it) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? { ...r, items: [...r.items, { ...it, clientId: newClientId() }] }
              : r,
          ),
        }));
      },
      updateRoundItem(roundClientId, itemClientId, patch) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? {
                  ...r,
                  items: r.items.map((it) =>
                    it.clientId === itemClientId ? { ...it, ...patch } : it,
                  ),
                }
              : r,
          ),
        }));
      },
      removeRoundItem(roundClientId, itemClientId) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? { ...r, items: r.items.filter((it) => it.clientId !== itemClientId) }
              : r,
          ),
        }));
      },

      setRoundReceipt(roundClientId, { imageToken, previewUrl, items, totalAmount, warning }) {
        // 영수증 교체 시 totalAmount/warning 은 이전 값을 끌고 오면 안 된다 —
        // 예: A 가 불일치(warning 세팅) → B 가 일치(warning=null) 인데 ?? 폴백을
        // 쓰면 A 의 warning 이 살아남아 B 에도 잘못 표시됨.
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? {
                  ...r,
                  source: 'RECEIPT',
                  receiptImageToken: imageToken,
                  receiptPreviewUrl: previewUrl,
                  totalAmount: totalAmount ?? null,
                  warning: warning ?? null,
                  items:
                    items != null
                      ? items.map((it) => ({
                          ...it,
                          clientId: it.clientId || newClientId(),
                        }))
                      : r.items,
                }
              : r,
          ),
        }));
      },

      setAttendance(roundClientId, participantClientId, attended) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? {
                  ...r,
                  attendances: r.attendances.map((a) =>
                    a.participantClientId === participantClientId ? { ...a, attended } : a,
                  ),
                }
              : r,
          ),
        }));
      },
      setExcludeOverride(roundClientId, participantClientId, key, override) {
        const overrideKey = OVERRIDE_KEY[key];
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? {
                  ...r,
                  attendances: r.attendances.map((a) =>
                    a.participantClientId === participantClientId
                      ? { ...a, [overrideKey]: override }
                      : a,
                  ),
                }
              : r,
          ),
        }));
      },
    }),
    {
      name: 'settlement-draft-v1',
      // v1 → v2: 평면 draft (한 식당 1 round 모델) → rounds 배열. 옛 입력은
      // 1차 round 1개로 변환, 모든 마스터 참여자는 attended=true.
      version: 2,
      migrate: (persisted, fromVersion) => {
        if (fromVersion >= 2) return persisted as SettlementDraft;
        const old = persisted as Partial<{
          placeId: string | null;
          source: SettlementSourceType | null;
          participants: DraftParticipant[];
          items: DraftItem[];
          receiptImageToken: string | null;
          receiptPreviewUrl: string | null;
          totalAmount: number | null;
          warning: string | null;
        }>;
        const participants = old.participants ?? [];
        const placeId = old.placeId ?? null;
        if (!placeId) {
          // 1차 식당 모르면 옛 draft 는 무의미 — 비움. 사용자가 다시 시작.
          return emptyDraft();
        }
        const round: DraftRound = {
          clientId: newClientId(),
          placeId,
          // 옛 draft 는 placeName 을 보관하지 않았다 — UI 가 startFor 호출 시 채움.
          placeName: '',
          source: old.source ?? null,
          items: old.items ?? [],
          receiptImageToken: old.receiptImageToken ?? null,
          receiptPreviewUrl: old.receiptPreviewUrl ?? null,
          totalAmount: old.totalAmount ?? null,
          warning: old.warning ?? null,
          attendances: participants.map((p) => emptyAttendance(p.clientId)),
        };
        return { participants, rounds: [round] };
      },
      // resolver 는 호출 시점에 평가 — 앱이 entry 에서 setStorage 를 호출한 뒤
      // 첫 read/write 가 일어나도록 zustand 가 보장. 웹은 sessionStorage 가
      // 자동 선택돼 기존 동작 유지.
      storage: createJSONStorage(() => resolveStorage()),
    },
  ),
);
