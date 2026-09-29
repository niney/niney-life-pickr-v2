import {
  effectiveExcludes,
  type ReceiptItemCategoryType,
  type SharedSettlementSessionType,
} from '@repo/api-contract';
import type {
  DraftParticipant,
  DraftRound,
  ExcludeKey,
} from '../stores/settlementDraftStore.js';

// 참여 축(술·음료·안주) 표현 — 저장값은 '빠짐(exclude)' 플래그지만 화면은 항상
// '참여(긍정)' 기준으로 쓴다. 기본은 전원 참여(켜짐)라 안 먹는 사람만 한 번
// 눌러 끄면 되므로 탭 수는 부정형 체크("주류 안 함")와 같고, 입력·결과 모두
// "누가 무엇을 분담했나" 로 바로 읽힌다. 웹·앱 공용 단일 소스.

export interface ParticipationAxis {
  key: ExcludeKey;
  label: string;
  /** 차수 특이사항 문장용 긍정 동사 — '마심' / '먹음'. */
  doVerb: string;
  /** 부정 동사 — '안 마심' / '안 먹음'. */
  skipVerb: string;
}

export const PARTICIPATION_AXES: readonly ParticipationAxis[] = [
  { key: 'excludeAlcohol', label: '술', doVerb: '마심', skipVerb: '안 마심' },
  { key: 'excludeNonAlcohol', label: '음료', doVerb: '마심', skipVerb: '안 마심' },
  { key: 'excludeSide', label: '안주', doVerb: '먹음', skipVerb: '안 먹음' },
];

const AXIS_CATEGORY: Record<ExcludeKey, ReceiptItemCategoryType> = {
  excludeAlcohol: 'ALCOHOL',
  excludeNonAlcohol: 'NON_ALCOHOL',
  excludeSide: 'SIDE',
};

export const participationAxis = (key: ExcludeKey): ParticipationAxis =>
  PARTICIPATION_AXES.find((a) => a.key === key)!;

export type ParticipationFlags = Record<ExcludeKey, boolean>;

export interface ParticipationRound {
  items: ReadonlyArray<{ category: ReceiptItemCategoryType; amount: number }>;
  /** 참여자 인덱스별 이 차수의 실효 제외 플래그(차수 특이사항 반영). 불참은 null. */
  excludes: ReadonlyArray<ParticipationFlags | null>;
}

/**
 * 참여자별 배지 축 — i 번째 = i 번째 참여자가 실제로 나눈 축.
 *
 * 마스터 설정만 보면 "차수 특이사항: 술 안 마심" 인 사람에게도 술 배지가 붙어
 * 분담액과 어긋난다. 그래서 차수 단위로 판정한다:
 * - 배지: 그 항목이 있는 차수에 참석해 빠지지 않은 적이 한 번이라도 있으면
 * - 쟁점 축: 그 항목이 있는 차수에서 참석자 중 누군가 빠졌을 때만 배지를 띄운다
 *   (전원 나눈 축은 구분할 게 없어 생략 — 전원 참여 정산이 배지로 도배되지 않게)
 */
export const participationBadgeAxes = (
  participantCount: number,
  rounds: readonly ParticipationRound[],
): ParticipationAxis[][] => {
  const out = Array.from({ length: participantCount }, (): ParticipationAxis[] => []);
  for (const axis of PARTICIPATION_AXES) {
    const category = AXIS_CATEGORY[axis.key];
    const joined = new Array<boolean>(participantCount).fill(false);
    let inPlay = false;
    for (const r of rounds) {
      if (!r.items.some((it) => it.category === category && it.amount > 0)) continue;
      r.excludes.forEach((ex, i) => {
        if (!ex) return;
        if (ex[axis.key]) inPlay = true;
        else joined[i] = true;
      });
    }
    if (!inPlay) continue;
    joined.forEach((j, i) => {
      if (j) out[i]?.push(axis);
    });
  }
  return out;
};

/** 입력 중(draft) 정산의 참여자별 배지 축. */
export const draftParticipationBadgeAxes = (
  participants: readonly DraftParticipant[],
  rounds: readonly DraftRound[],
): ParticipationAxis[][] =>
  participationBadgeAxes(
    participants.length,
    rounds.map((r) => ({
      items: r.items,
      excludes: participants.map((p) => {
        const a = r.attendances.find((x) => x.participantClientId === p.clientId);
        return a?.attended ? effectiveExcludes(p, a) : null;
      }),
    })),
  );

/** 저장된(결과·공유) 정산의 참여자별 배지 축. */
export const sessionParticipationBadgeAxes = (
  session: Pick<SharedSettlementSessionType, 'participants' | 'rounds'>,
): ParticipationAxis[][] =>
  participationBadgeAxes(
    session.participants.length,
    session.rounds.map((r) => ({
      items: r.items,
      excludes: session.participants.map((p) => {
        const a = r.attendees.find((x) => x.participantId === p.id);
        return a?.attended ? effectiveExcludes(p, a) : null;
      }),
    })),
  );
