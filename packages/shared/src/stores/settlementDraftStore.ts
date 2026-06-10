import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  effectiveExcludes,
  type GroupCalcInput,
  type ReceiptItemCategoryType,
  type SettlementGroupSplitModeType,
  type SettlementParticipantInputType,
  type SettlementSourceType,
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

// 카테고리별 잔여 처리 규칙. 마스터 참여자 clientId 로 leftover 지정 — 그
// 사람이 빠지면 calculator 가 default(첫 활성자) 로 fallback.
export interface DraftCategoryAdjustment {
  leftoverParticipantClientId: string;
  roundUnit: number | null;
}

export type DraftCategoryAdjustments = Partial<
  Record<ReceiptItemCategoryType, DraftCategoryAdjustment | null>
>;

// 세부 분배 그룹 — 카테고리 풀에서 특정 항목들(소주/맥주/콜라…)을 떼어내
// 멤버끼리만 나누는 규칙. 저장 시 itemClientIds 는 items 인덱스로, 멤버
// clientId 는 그대로 서버 입력형으로 변환된다.
export interface DraftGroupMember {
  participantClientId: string;
  // 정수 잔수(가중치). EQUAL 모드에선 무시. 0잔 = 멤버로 두되 분담 0.
  glasses: number;
}

export interface DraftItemGroup {
  clientId: string;
  label: string;
  category: ReceiptItemCategoryType;
  itemClientIds: string[];
  mode: SettlementGroupSplitModeType;
  members: DraftGroupMember[];
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
  // 차수 할인 — null 페어면 할인 없음, (양수, 카테고리) 페어면 해당 카테고리
  // 풀에서 차감. UI 가 setRoundDiscount 로 한 번에 설정/해제.
  discountAmount: number | null;
  discountCategory: ReceiptItemCategoryType | null;
  // 분담 다듬기 — 카테고리별 잔여 처리 규칙. 키 없거나 null 이면 default.
  categoryAdjustments: DraftCategoryAdjustments | null;
  // 세부 분배 그룹 — null 이면 없음 (카테고리 균등 분배만).
  groupSplits: DraftItemGroup[] | null;
}

export interface SettlementDraft {
  participants: DraftParticipant[];
  rounds: DraftRound[];
}

// 이 차수에서 해당 카테고리 분담 자격이 있는가 — 참석 + 그 카테고리를
// 제외하지 않음 (차수 특이사항 override 반영). 그룹 멤버 자격의 단일 기준:
// 에디터 후보 표시·미리보기 계산·저장 페이로드가 모두 이 함수를 쓴다.
// 제외자가 그날 마신 케이스는 '차수 특이사항: 마심' 으로 풀면 자동으로
// 후보에 올라온다 (별도 메커니즘 없음).
export const isEligibleGroupMember = (
  round: Pick<DraftRound, 'attendances'>,
  participants: DraftParticipant[],
  participantClientId: string,
  category: ReceiptItemCategoryType,
): boolean => {
  const p = participants.find((x) => x.clientId === participantClientId);
  const att = round.attendances.find(
    (a) => a.participantClientId === participantClientId,
  );
  if (!p || !att || !att.attended) return false;
  const eff = effectiveExcludes(p, att);
  if (category === 'ALCOHOL') return !eff.excludeAlcohol;
  if (category === 'NON_ALCOHOL') return !eff.excludeNonAlcohol;
  if (category === 'SIDE') return !eff.excludeSide;
  return true;
};

// draft 의 세부 분배 그룹을 계산기 입력으로 변환 — itemClientIds → 항목
// 인덱스, 멤버 clientId → 마스터 참여자 인덱스. 끊긴 항목 참조는 빼고,
// 자격 없는 멤버(비참석/카테고리 제외)는 분담에서 빠지도록 필터한다.
export const draftGroupsToCalcInputs = (
  round: Pick<DraftRound, 'items' | 'groupSplits' | 'attendances'>,
  participants: DraftParticipant[],
): GroupCalcInput[] | null => {
  if (!round.groupSplits || round.groupSplits.length === 0) return null;
  const itemIndexByClientId = new Map(round.items.map((it, i) => [it.clientId, i]));
  const pIndexByClientId = new Map(participants.map((p, i) => [p.clientId, i]));
  return round.groupSplits.map((g) => ({
    category: g.category,
    itemIndexes: g.itemClientIds
      .map((id) => itemIndexByClientId.get(id) ?? -1)
      .filter((i) => i >= 0),
    mode: g.mode,
    members: g.members
      .filter((m) =>
        isEligibleGroupMember(round, participants, m.participantClientId, g.category),
      )
      .map((m) => ({
        participantIndex: pIndexByClientId.get(m.participantClientId) ?? -1,
        glasses: m.glasses,
      })),
  }));
};

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
  discountAmount: null,
  discountCategory: null,
  categoryAdjustments: null,
  groupSplits: null,
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
  // 새 참여자 추가. 반환값은 새 행의 clientId — UI 가 곧장 그 행에 focus
  // 하고 싶을 때 (예: Enter 로 새 행 추가) 활용.
  addParticipant(p: Omit<DraftParticipant, 'clientId'>): string;
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
  // 새 항목 추가. 반환값은 새 항목의 clientId — UI 가 곧장 focus 하고 싶을 때
  // (예: Enter 로 메뉴 행 추가) 활용. round 가 없으면 빈 문자열.
  addRoundItem(roundClientId: string, it: Omit<DraftItem, 'clientId'>): string;
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
  // 다른 차수의 attendances (참석 + 차수별 override) 를 그대로 복사. items/
  // source/영수증 등은 건드리지 않는다 — '2차도 같은 인원·같은 옵션' 케이스를
  // 한 번에 적용하는 용도.
  copyRoundAttendancesFrom(targetRoundClientId: string, sourceRoundClientId: string): void;

  // 차수 할인 설정 — null 이면 할인 제거. 양 필드 둘 다 세팅하거나 둘 다 null.
  // (스토어는 검증하지 않음 — 풀 음수 검증은 zod refine 이 담당.)
  setRoundDiscount(
    roundClientId: string,
    discount: { amount: number; category: ReceiptItemCategoryType } | null,
  ): void;

  // 카테고리별 잔여 보정 설정 — null 이면 그 카테고리 보정 제거.
  setCategoryAdjustment(
    roundClientId: string,
    category: ReceiptItemCategoryType,
    adjustment: DraftCategoryAdjustment | null,
  ): void;

  // ── 세부 분배 그룹 ──────────────────────────────────────────────────
  // 제안 일괄 적용/전체 해제 — clientId 는 store 가 부여. 빈 배열이면 null.
  applyGroupSplits(
    roundClientId: string,
    groups: Omit<DraftItemGroup, 'clientId'>[],
  ): void;
  // 그룹 1개 추가. 반환값은 새 그룹의 clientId (round 없으면 빈 문자열).
  addGroupSplit(roundClientId: string, group: Omit<DraftItemGroup, 'clientId'>): string;
  updateGroupSplit(
    roundClientId: string,
    groupClientId: string,
    patch: Partial<Omit<DraftItemGroup, 'clientId'>>,
  ): void;
  removeGroupSplit(roundClientId: string, groupClientId: string): void;
}

// crypto.randomUUID 가 없는 환경(아주 오래된 브라우저) 폴백.
const newClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

// 모든 round 의 attendances 에서 사라진 마스터 참여자 항목을 제거하고,
// 새로 추가된 마스터에게 default attendance 를 채운다. 세부 분배 그룹의
// 멤버도 사라진 참여자를 정리한다 (멤버 0명 그룹은 남긴다 — 계산기가 나머지
// 풀로 환원하고, 사용자가 다시 채울 수 있게).
const syncAttendances = (rounds: DraftRound[], participants: DraftParticipant[]): DraftRound[] => {
  const validIds = new Set(participants.map((p) => p.clientId));
  return rounds.map((r) => {
    const existing = new Map(r.attendances.map((a) => [a.participantClientId, a]));
    const next: DraftAttendance[] = participants.map(
      (p) => existing.get(p.clientId) ?? emptyAttendance(p.clientId),
    );
    const groupSplits = r.groupSplits
      ? r.groupSplits.map((g) => ({
          ...g,
          members: g.members.filter((m) => validIds.has(m.participantClientId)),
        }))
      : null;
    // 혹시 모를 stale attendance 도 제거 — 위 map 으로 이미 처리되지만 명시.
    return {
      ...r,
      attendances: next.filter((a) => validIds.has(a.participantClientId)),
      groupSplits,
    };
  });
};

// 그룹의 항목 참조 정합성 — 사라졌거나 카테고리가 바뀐 항목을 그룹에서
// 제거하고, 항목이 0개가 된 그룹은 떨군다. items 를 바꾸는 모든 액션 뒤에
// 호출해 그룹이 항상 실재하는 같은 카테고리 항목만 가리키게 한다.
const pruneGroupItems = (round: DraftRound): DraftRound => {
  if (!round.groupSplits || round.groupSplits.length === 0) return round;
  const itemCategory = new Map(round.items.map((it) => [it.clientId, it.category]));
  const next = round.groupSplits
    .map((g) => ({
      ...g,
      itemClientIds: g.itemClientIds.filter((id) => itemCategory.get(id) === g.category),
    }))
    .filter((g) => g.itemClientIds.length > 0);
  const unchanged =
    next.length === round.groupSplits.length &&
    next.every(
      (g, i) => g.itemClientIds.length === round.groupSplits![i]!.itemClientIds.length,
    );
  if (unchanged) return round;
  return { ...round, groupSplits: next.length > 0 ? next : null };
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
        const clientId = newClientId();
        set((s) => {
          const next = [...s.participants, { ...p, clientId }];
          return { participants: next, rounds: syncAttendances(s.rounds, next) };
        });
        return clientId;
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
            r.clientId === roundClientId ? pruneGroupItems({ ...r, items }) : r,
          ),
        }));
      },
      addRoundItem(roundClientId, it) {
        const clientId = newClientId();
        let added = false;
        set((s) => ({
          rounds: s.rounds.map((r) => {
            if (r.clientId !== roundClientId) return r;
            added = true;
            return { ...r, items: [...r.items, { ...it, clientId }] };
          }),
        }));
        return added ? clientId : '';
      },
      updateRoundItem(roundClientId, itemClientId, patch) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? // 카테고리가 바뀌면 그 항목은 기존 그룹과 어긋난다 — prune.
                pruneGroupItems({
                  ...r,
                  items: r.items.map((it) =>
                    it.clientId === itemClientId ? { ...it, ...patch } : it,
                  ),
                })
              : r,
          ),
        }));
      },
      removeRoundItem(roundClientId, itemClientId) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? pruneGroupItems({
                  ...r,
                  items: r.items.filter((it) => it.clientId !== itemClientId),
                })
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
              ? // 항목이 통째로 교체되면 기존 그룹의 항목 참조도 끊긴다 — prune
                // 으로 빈 그룹을 정리 (items 유지 시엔 그룹도 그대로).
                pruneGroupItems({
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
                })
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
      setRoundDiscount(roundClientId, discount) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? {
                  ...r,
                  discountAmount: discount?.amount ?? null,
                  discountCategory: discount?.category ?? null,
                }
              : r,
          ),
        }));
      },
      setCategoryAdjustment(roundClientId, category, adjustment) {
        set((s) => ({
          rounds: s.rounds.map((r) => {
            if (r.clientId !== roundClientId) return r;
            const next = { ...(r.categoryAdjustments ?? {}) };
            if (adjustment === null) delete next[category];
            else next[category] = adjustment;
            // 비어 있으면 null 로 압축 — '아무 보정 없음' 상태 유지.
            const isEmpty = Object.keys(next).length === 0;
            return { ...r, categoryAdjustments: isEmpty ? null : next };
          }),
        }));
      },

      // ── 세부 분배 그룹 ───────────────────────────────────────────
      applyGroupSplits(roundClientId, groups) {
        const withIds = groups.map((g) => ({ ...g, clientId: newClientId() }));
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? { ...r, groupSplits: withIds.length > 0 ? withIds : null }
              : r,
          ),
        }));
      },
      addGroupSplit(roundClientId, group) {
        const clientId = newClientId();
        let added = false;
        set((s) => ({
          rounds: s.rounds.map((r) => {
            if (r.clientId !== roundClientId) return r;
            added = true;
            return {
              ...r,
              groupSplits: [...(r.groupSplits ?? []), { ...group, clientId }],
            };
          }),
        }));
        return added ? clientId : '';
      },
      updateGroupSplit(roundClientId, groupClientId, patch) {
        set((s) => ({
          rounds: s.rounds.map((r) =>
            r.clientId === roundClientId
              ? {
                  ...r,
                  groupSplits:
                    r.groupSplits?.map((g) =>
                      g.clientId === groupClientId ? { ...g, ...patch } : g,
                    ) ?? null,
                }
              : r,
          ),
        }));
      },
      removeGroupSplit(roundClientId, groupClientId) {
        set((s) => ({
          rounds: s.rounds.map((r) => {
            if (r.clientId !== roundClientId) return r;
            const next = (r.groupSplits ?? []).filter(
              (g) => g.clientId !== groupClientId,
            );
            return { ...r, groupSplits: next.length > 0 ? next : null };
          }),
        }));
      },
      copyRoundAttendancesFrom(targetRoundClientId, sourceRoundClientId) {
        set((s) => {
          const source = s.rounds.find((r) => r.clientId === sourceRoundClientId);
          if (!source) return s;
          // participantClientId 별로 source 의 attendance 값 lookup. target 의
          // attendances 배열 자체는 마스터 sync 결과를 따르므로 길이는 유지하고
          // 각 항목의 attended/override 값만 source 에서 가져온다.
          const sourceByPid = new Map(
            source.attendances.map((a) => [a.participantClientId, a]),
          );
          return {
            rounds: s.rounds.map((r) =>
              r.clientId === targetRoundClientId
                ? {
                    ...r,
                    attendances: r.attendances.map((a) => {
                      const src = sourceByPid.get(a.participantClientId);
                      if (!src) return a;
                      return {
                        ...a,
                        attended: src.attended,
                        excludeAlcoholOverride: src.excludeAlcoholOverride,
                        excludeNonAlcoholOverride: src.excludeNonAlcoholOverride,
                        excludeSideOverride: src.excludeSideOverride,
                      };
                    }),
                  }
                : r,
            ),
          };
        });
      },
    }),
    {
      name: 'settlement-draft-v1',
      // v1 → v2: 평면 draft (한 식당 1 round 모델) → rounds 배열. 옛 입력은
      // 1차 round 1개로 변환, 모든 마스터 참여자는 attended=true.
      // v2 → v3: round 에 discountAmount/discountCategory 필드 추가 (null).
      // v3 → v4: round 에 categoryAdjustments 필드 추가 (null).
      // v4 → v5: round 에 groupSplits 필드 추가 (null).
      version: 5,
      migrate: (persisted, fromVersion) => {
        // v2+ → 최신: rounds 의 각 round 에 빠진 필드 채워준다.
        if (fromVersion >= 2) {
          const draft = persisted as SettlementDraft;
          return {
            ...draft,
            rounds: draft.rounds.map((r) => ({
              ...r,
              discountAmount: r.discountAmount ?? null,
              discountCategory: r.discountCategory ?? null,
              categoryAdjustments: r.categoryAdjustments ?? null,
              groupSplits: r.groupSplits ?? null,
            })),
          };
        }
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
          discountAmount: null,
          discountCategory: null,
          categoryAdjustments: null,
          groupSplits: null,
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
