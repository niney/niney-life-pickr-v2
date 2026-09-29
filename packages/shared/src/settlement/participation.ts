import type { ExcludeKey } from '../stores/settlementDraftStore.js';

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

export const participationAxis = (key: ExcludeKey): ParticipationAxis =>
  PARTICIPATION_AXES.find((a) => a.key === key)!;

export type ParticipationFlags = Record<ExcludeKey, boolean>;

/** 배지를 띄울 축 — 한 명이라도 빠진 축만. 전원 참여 축은 구분할 게 없어 생략. */
export const axesInPlay = (
  participants: readonly ParticipationFlags[],
): ParticipationAxis[] =>
  PARTICIPATION_AXES.filter((a) => participants.some((p) => p[a.key]));

/** 이 참여자가 분담하는 축 — axes 중 빠지지 않은 것. 안 먹는 축은 빈칸으로 구분된다. */
export const joinedAxes = (
  axes: readonly ParticipationAxis[],
  p: ParticipationFlags,
): ParticipationAxis[] => axes.filter((a) => !p[a.key]);
