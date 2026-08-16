import { beforeEach, describe, expect, it } from 'vitest';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  draftGroupsToCalcInputs,
  isEligibleGroupMember,
  useSettlementDraftStore,
  type DraftAttendance,
  type DraftItem,
  type DraftParticipant,
} from './settlementDraftStore.js';

// 정산 draft 스토어 — 이 스토어의 어려운 부분은 개별 setter 가 아니라
// "정합성 동기화" 다: 마스터 참여자가 바뀌면 모든 차수의 attendance 가 따라
// 바뀌고, 항목이 바뀌면 세부 분배 그룹의 참조가 끊기지 않아야 한다. 테스트도
// 그 동기화 계약에 집중한다.

const participant = (
  clientId: string,
  over: Partial<DraftParticipant> = {},
): DraftParticipant => ({
  clientId,
  name: clientId,
  nickname: null,
  excludeAlcohol: false,
  excludeNonAlcohol: false,
  excludeSide: false,
  ...over,
});

const itemInput = (
  name: string,
  category: ReceiptItemCategoryType,
  amount = 10000,
): Omit<DraftItem, 'clientId'> => ({
  name,
  unitPrice: null,
  quantity: null,
  amount,
  category,
  matchedMenuName: null,
});

const attendance = (
  participantClientId: string,
  over: Partial<DraftAttendance> = {},
): DraftAttendance => ({
  participantClientId,
  attended: true,
  excludeAlcoholOverride: null,
  excludeNonAlcoholOverride: null,
  excludeSideOverride: null,
  ...over,
});

const store = () => useSettlementDraftStore.getState();

describe('settlementDraftStore', () => {
  beforeEach(() => {
    store().reset();
  });

  describe('세션 lifecycle', () => {
    it('startFor — 다른 1차 식당이면 전체 reset 후 1차 round 를 prefill 한다', () => {
      store().startFor('111', '먼저집');
      store().addParticipant(participant('p1'));
      store().addRoundItem(store().rounds[0]!.clientId, itemInput('소주', 'ALCOHOL'));

      store().startFor('222', '나중집');

      expect(store().participants).toEqual([]);
      expect(store().rounds).toHaveLength(1);
      expect(store().rounds[0]!.placeId).toBe('222');
      expect(store().rounds[0]!.items).toEqual([]);
    });

    it('startFor — 같은 1차 식당이면 입력을 보존하고 placeName 만 최신화한다', () => {
      store().startFor('111', '옛 이름');
      const roundId = store().rounds[0]!.clientId;
      store().addRoundItem(roundId, itemInput('소주', 'ALCOHOL'));

      store().startFor('111', '새 이름');

      expect(store().rounds[0]!.clientId).toBe(roundId);
      expect(store().rounds[0]!.items).toHaveLength(1);
      expect(store().rounds[0]!.placeName).toBe('새 이름');
    });
  });

  describe('마스터 참여자 ↔ 차수 attendance 동기화', () => {
    it('참여자를 추가하면 이미 있는 모든 차수에 default attendance 가 생긴다', () => {
      store().startFor('111', '집');
      store().addRound('222', '2차집');

      const pid = store().addParticipant(participant('p1'));

      for (const round of store().rounds) {
        expect(round.attendances).toEqual([
          {
            participantClientId: pid,
            attended: true,
            excludeAlcoholOverride: null,
            excludeNonAlcoholOverride: null,
            excludeSideOverride: null,
          },
        ]);
      }
    });

    it('참여자를 제거하면 attendance 와 그룹 멤버에서도 빠진다(빈 그룹은 유지)', () => {
      store().startFor('111', '집');
      const roundId = store().rounds[0]!.clientId;
      const p1 = store().addParticipant(participant('p1'));
      const p2 = store().addParticipant(participant('p2'));
      const itemId = store().addRoundItem(roundId, itemInput('소주', 'ALCOHOL'));
      store().applyGroupSplits(roundId, [
        {
          label: '소주파',
          category: 'ALCOHOL',
          itemClientIds: [itemId],
          mode: 'EQUAL',
          members: [
            { participantClientId: p1, glasses: 1 },
            { participantClientId: p2, glasses: 1 },
          ],
        },
      ]);

      store().removeParticipant(p1);

      const round = store().rounds[0]!;
      expect(round.attendances.map((a) => a.participantClientId)).toEqual([p2]);
      expect(round.groupSplits![0]!.members.map((m) => m.participantClientId)).toEqual([p2]);

      // 남은 멤버까지 빠져도 그룹 자체는 남는다 — 계산기가 카테고리 풀로
      // 환원하고 사용자가 다시 채울 수 있게.
      store().removeParticipant(p2);
      expect(store().rounds[0]!.groupSplits).toHaveLength(1);
      expect(store().rounds[0]!.groupSplits![0]!.members).toEqual([]);
    });

    it('addParticipantsAndCompact — 이름·닉네임 둘 다 빈 행을 정리한 뒤 append 한다', () => {
      store().startFor('111', '집');
      store().addParticipant(participant('유령', { name: '  ', nickname: null }));
      store().addParticipant(participant('민수', { name: '민수' }));

      store().addParticipantsAndCompact([
        participant('영희', { name: '영희' }),
        participant('철수', { name: '철수' }),
      ]);

      const names = store().participants.map((p) => p.name);
      expect(names).toEqual(['민수', '영희', '철수']);
      // attendance 도 최종 명단과 일치.
      expect(store().rounds[0]!.attendances).toHaveLength(3);
    });
  });

  describe('항목 ↔ 세부 분배 그룹 정합(prune)', () => {
    const seedGroup = () => {
      store().startFor('111', '집');
      const roundId = store().rounds[0]!.clientId;
      const p1 = store().addParticipant(participant('p1'));
      const soju = store().addRoundItem(roundId, itemInput('소주', 'ALCOHOL'));
      const beer = store().addRoundItem(roundId, itemInput('맥주', 'ALCOHOL'));
      store().applyGroupSplits(roundId, [
        {
          label: '술파',
          category: 'ALCOHOL',
          itemClientIds: [soju, beer],
          mode: 'EQUAL',
          members: [{ participantClientId: p1, glasses: 1 }],
        },
      ]);
      return { roundId, soju, beer };
    };

    it('항목을 지우면 그룹 참조에서 빠지고, 참조가 0개가 된 그룹은 드롭된다', () => {
      const { roundId, soju, beer } = seedGroup();

      store().removeRoundItem(roundId, soju);
      expect(store().rounds[0]!.groupSplits![0]!.itemClientIds).toEqual([beer]);

      store().removeRoundItem(roundId, beer);
      // 마지막 그룹까지 사라지면 null 로 압축.
      expect(store().rounds[0]!.groupSplits).toBeNull();
    });

    it('항목 카테고리가 바뀌면 그 항목은 기존 그룹과 어긋나므로 참조가 빠진다', () => {
      const { roundId, soju, beer } = seedGroup();

      store().updateRoundItem(roundId, soju, { category: 'SIDE' });

      expect(store().rounds[0]!.groupSplits![0]!.itemClientIds).toEqual([beer]);
    });
  });

  describe('차수 옵션', () => {
    it('copyRoundAttendancesFrom — 참석·override 만 복사하고 items 는 그대로 둔다', () => {
      store().startFor('111', '집');
      const r1 = store().rounds[0]!.clientId;
      const p1 = store().addParticipant(participant('p1'));
      const r2 = store().addRound('222', '2차집');
      store().addRoundItem(r2, itemInput('안주', 'SIDE'));
      // 1차에서 p1 불참 + '술 마심' override.
      store().setAttendance(r1, p1, false);
      store().setExcludeOverride(r1, p1, 'excludeAlcohol', false);

      store().copyRoundAttendancesFrom(r2, r1);

      const target = store().rounds.find((r) => r.clientId === r2)!;
      expect(target.attendances[0]).toMatchObject({
        participantClientId: p1,
        attended: false,
        excludeAlcoholOverride: false,
      });
      expect(target.items).toHaveLength(1);
    });

    it('setRoundDiscount — 설정은 페어로, 해제(null)는 양 필드 모두 null', () => {
      store().startFor('111', '집');
      const roundId = store().rounds[0]!.clientId;

      store().setRoundDiscount(roundId, { amount: 5000, category: 'ALCOHOL' });
      expect(store().rounds[0]!).toMatchObject({
        discountAmount: 5000,
        discountCategory: 'ALCOHOL',
      });

      store().setRoundDiscount(roundId, null);
      expect(store().rounds[0]!).toMatchObject({ discountAmount: null, discountCategory: null });
    });

    it('setCategoryAdjustment — 마지막 보정을 지우면 null 로 압축된다', () => {
      store().startFor('111', '집');
      const roundId = store().rounds[0]!.clientId;

      store().setCategoryAdjustment(roundId, 'ALCOHOL', {
        leftoverParticipantClientIds: ['p1'],
        roundUnit: 100,
      });
      expect(store().rounds[0]!.categoryAdjustments).toEqual({
        ALCOHOL: { leftoverParticipantClientIds: ['p1'], roundUnit: 100 },
      });

      store().setCategoryAdjustment(roundId, 'ALCOHOL', null);
      expect(store().rounds[0]!.categoryAdjustments).toBeNull();
    });
  });

  describe('순수 함수 — 그룹 자격/계산기 입력 변환', () => {
    it('isEligibleGroupMember — 비참석·마스터 제외는 탈락, 차수 override "마심" 은 복귀', () => {
      const participants = [
        participant('술제외', { excludeAlcohol: true }),
        participant('불참'),
        participant('보통'),
      ];
      const round = {
        attendances: [
          attendance('술제외'),
          attendance('불참', { attended: false }),
          attendance('보통'),
        ],
      };

      expect(isEligibleGroupMember(round, participants, '보통', 'ALCOHOL')).toBe(true);
      expect(isEligibleGroupMember(round, participants, '불참', 'ALCOHOL')).toBe(false);
      expect(isEligibleGroupMember(round, participants, '술제외', 'ALCOHOL')).toBe(false);
      // 같은 사람이 비주류 분담은 가능(카테고리별 판정).
      expect(isEligibleGroupMember(round, participants, '술제외', 'NON_ALCOHOL')).toBe(true);

      // 차수 특이사항 '마심'(override=false) 이면 마스터 제외를 이긴다.
      const overridden = {
        attendances: [attendance('술제외', { excludeAlcoholOverride: false })],
      };
      expect(isEligibleGroupMember(overridden, participants, '술제외', 'ALCOHOL')).toBe(true);
    });

    it('draftGroupsToCalcInputs — 인덱스 변환 + 끊긴 항목·무자격 멤버 필터', () => {
      const participants = [
        participant('p0'),
        participant('p1', { excludeAlcohol: true }),
        participant('p2'),
      ];
      const items: DraftItem[] = [
        { ...itemInput('안주', 'SIDE'), clientId: 'i0' },
        { ...itemInput('소주', 'ALCOHOL'), clientId: 'i1' },
      ];
      const round = {
        items,
        attendances: [attendance('p0'), attendance('p1'), attendance('p2')],
        groupSplits: [
          {
            clientId: 'g1',
            label: '소주파',
            category: 'ALCOHOL' as const,
            // 'ghost' 는 이미 삭제된 항목 참조 — 결과에서 빠져야 한다.
            itemClientIds: ['i1', 'ghost'],
            mode: 'GLASSES' as const,
            members: [
              { participantClientId: 'p0', glasses: 3 },
              // 술 제외(무자격) — 분담에서 빠져야 한다.
              { participantClientId: 'p1', glasses: 2 },
              { participantClientId: 'p2', glasses: 0 },
            ],
          },
        ],
      };

      const calc = draftGroupsToCalcInputs(round, participants);

      expect(calc).toEqual([
        {
          category: 'ALCOHOL',
          itemIndexes: [1],
          mode: 'GLASSES',
          members: [
            { participantIndex: 0, glasses: 3 },
            { participantIndex: 2, glasses: 0 },
          ],
        },
      ]);
    });

    it('draftGroupsToCalcInputs — 그룹이 없으면 null', () => {
      const round = { items: [], attendances: [], groupSplits: null };
      expect(draftGroupsToCalcInputs(round, [])).toBeNull();
    });
  });
});
