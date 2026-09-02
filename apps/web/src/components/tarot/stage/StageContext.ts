import { createContext, useContext, type MutableRefObject } from 'react';
import type * as THREE from 'three';

// 무대 안 컴포넌트가 공유하는 가변 상태(useFrame 에서 읽고 쓰므로 ref 로. 이름을 *Ref 로 두어
// React Compiler 린트가 ref 로 인식한다).
//
// timelineRef  phase(:revealed) 세그먼트의 시작 시각(R3F clock 초). 세그먼트 키가 바뀐 첫 프레임에
//              먼저 도는 useFrame 이 갱신한다(syncTimeline) — 자식 useFrame 이 부모보다 먼저 돌아
//              우선순위로 순서를 강제할 수 없어서(우선순위를 주면 자동 렌더가 꺼진다).
// firedRef     세그먼트별 콜백 1회 보장.
// fanOffsetRef 부채꼴 그룹 yaw(드래그로 훑기).
// hoveredRef   부채꼴 호버 인스턴스 index.

export interface StageTimeline {
  key: string;
  start: number;
}

export interface StageCallbacks {
  onPick: (cardId: string) => void;
  onShuffleDone: () => void;
  onPlaced: () => void;
  onRevealed: () => void;
}

export interface StageContextValue {
  timelineRef: MutableRefObject<StageTimeline>;
  firedRef: MutableRefObject<Set<string>>;
  fanOffsetRef: MutableRefObject<number>;
  hoveredRef: MutableRefObject<number>;
  callbacks: StageCallbacks;
  backTexture: THREE.Texture;
}

export const StageContext = createContext<StageContextValue | null>(null);

export const useStage = (): StageContextValue => {
  const v = useContext(StageContext);
  if (!v) throw new Error('StageContext 밖에서 useStage 를 호출했습니다');
  return v;
};

// 세그먼트 키 — 무대 안 모든 useFrame 이 **같은 키**로 syncTimeline 을 불러야 한다. 키가 다르면
// 서로 시작 시각을 매 프레임 리셋해 경과 시간이 0 에 머문다.
export const segmentKey = (phase: string, revealed: number): string => `${phase}:${revealed}`;

// 세그먼트 키가 바뀌었으면 시작 시각을 지금으로. 경과 시간을 돌려준다.
export const syncTimeline = (timelineRef: MutableRefObject<StageTimeline>, key: string, now: number): number => {
  if (timelineRef.current.key !== key) timelineRef.current = { key, start: now };
  return now - timelineRef.current.start;
};

// 세그먼트당 1회만 true.
export const fireOnce = (firedRef: MutableRefObject<Set<string>>, key: string): boolean => {
  if (firedRef.current.has(key)) return false;
  firedRef.current.add(key);
  return true;
};
