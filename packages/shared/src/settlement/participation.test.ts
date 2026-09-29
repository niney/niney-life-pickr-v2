import { describe, expect, it } from 'vitest';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  participationAxis,
  participationBadgeAxes,
  sessionParticipationBadgeAxes,
  type ParticipationFlags,
} from './participation.js';

// 참여 배지 — 저장은 exclude 플래그, 화면은 긍정(참여) 배지. 배지가 분담액과
// 어긋나지 않는 게 핵심 계약이다: 차수 특이사항·불참·항목 없음이 모두 반영돼야
// 하고, 전원 나눈 축은 배지로 도배하지 않는다.

const flags = (over: Partial<ParticipationFlags> = {}): ParticipationFlags => ({
  excludeAlcohol: false,
  excludeNonAlcohol: false,
  excludeSide: false,
  ...over,
});

const items = (...cats: ReceiptItemCategoryType[]) =>
  cats.map((category) => ({ category, amount: 1000 }));

const labels = (rows: { label: string }[][]) => rows.map((r) => r.map((a) => a.label));

describe('participationBadgeAxes', () => {
  it('전원 나눈 축은 배지가 없다', () => {
    const out = participationBadgeAxes(2, [
      { items: items('ALCOHOL', 'SIDE'), excludes: [flags(), flags()] },
    ]);
    expect(labels(out)).toEqual([[], []]);
  });

  it('한 명만 술을 안 마시면 마시는 사람에게만 술 배지', () => {
    const out = participationBadgeAxes(2, [
      { items: items('ALCOHOL'), excludes: [flags(), flags({ excludeAlcohol: true })] },
    ]);
    expect(labels(out)).toEqual([['술'], []]);
  });

  it('차수 특이사항으로 뺀 사람은 마스터 설정과 무관하게 배지가 빠진다', () => {
    // 지현(2)이 마스터로는 마시지만 이 차수만 '술 안 마심' — 실효 플래그로 들어온다.
    const out = participationBadgeAxes(3, [
      {
        items: items('ALCOHOL'),
        excludes: [flags(), flags({ excludeAlcohol: true }), flags({ excludeAlcohol: true })],
      },
    ]);
    expect(labels(out)).toEqual([['술'], [], []]);
  });

  it('여러 차수 중 한 번이라도 나눴으면 배지, 불참 차수는 판정에서 빠진다', () => {
    const out = participationBadgeAxes(3, [
      // 1차: 0·1 참석, 1 은 술 안 마심. 2 불참.
      { items: items('ALCOHOL'), excludes: [flags(), flags({ excludeAlcohol: true }), null] },
      // 2차: 전원 참석, 1 도 마심.
      { items: items('ALCOHOL'), excludes: [flags(), flags(), flags()] },
    ]);
    expect(labels(out)).toEqual([['술'], ['술'], ['술']]);
  });

  it('그 항목이 없는 차수의 제외는 쟁점이 아니다', () => {
    // 술 없는 차수에서만 누가 '술 안 마심' — 술 배지를 띄울 이유가 없다.
    const out = participationBadgeAxes(2, [
      { items: items('SIDE'), excludes: [flags(), flags({ excludeAlcohol: true })] },
    ]);
    expect(labels(out)).toEqual([[], []]);
  });

  it('축 순서는 술·음료·안주로 고정된다', () => {
    const out = participationBadgeAxes(2, [
      {
        items: items('SIDE', 'NON_ALCOHOL', 'ALCOHOL'),
        excludes: [
          flags(),
          flags({ excludeAlcohol: true, excludeNonAlcohol: true, excludeSide: true }),
        ],
      },
    ]);
    expect(labels(out)).toEqual([['술', '음료', '안주'], []]);
  });
});

describe('sessionParticipationBadgeAxes', () => {
  it('저장 응답의 차수 override(participantId 매핑)를 반영한다', () => {
    const participant = (id: string) => ({
      id,
      name: id,
      nickname: null,
      excludeAlcohol: false,
      excludeNonAlcohol: false,
      excludeSide: false,
      shareAmount: 0,
      orderIndex: 0,
      contactId: null,
    });
    const attendee = (participantId: string, excludeAlcoholOverride: boolean | null) => ({
      participantId,
      attended: true,
      excludeAlcoholOverride,
      excludeNonAlcoholOverride: null,
      excludeSideOverride: null,
      shareAmount: 0,
    });
    const session = {
      participants: [participant('a'), participant('b')],
      rounds: [
        {
          items: items('ALCOHOL'),
          attendees: [attendee('a', null), attendee('b', true)],
        },
      ],
    } as unknown as Parameters<typeof sessionParticipationBadgeAxes>[0];
    expect(labels(sessionParticipationBadgeAxes(session))).toEqual([['술'], []]);
  });
});

describe('participationAxis', () => {
  it('차수 특이사항 동사 — 마실 것은 마심, 안주는 먹음', () => {
    expect(participationAxis('excludeAlcohol').skipVerb).toBe('안 마심');
    expect(participationAxis('excludeNonAlcohol').doVerb).toBe('마심');
    expect(participationAxis('excludeSide').skipVerb).toBe('안 먹음');
  });
});
