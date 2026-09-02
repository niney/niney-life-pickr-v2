import * as THREE from 'three';

// 3D 무대 배치 수학 — 카드 치수, 카메라, 덱 스택·셔플 산개·부채꼴·자리(슬롯) 포즈, 타이밍.
// 모든 포즈는 부채꼴 그룹 로컬 좌표(그룹 원점 = 부채꼴 호의 중심, z = FAN_CZ). 그룹을 Y 축으로
// 돌리면 부채꼴이 호의 중심을 축으로 회전한다(모바일 단말에서 드래그로 훑어보기).
// 회전은 'YXZ'(yaw → 로컬 pitch → 로컬 roll) 오일러로 만들고 쿼터니언으로 보간한다.

export const CARD_W = 1;
// 7:12 (1024×1756).
export const CARD_H = CARD_W * (1756 / 1024);
// 실제 덱 비율(78장 ≈ 카드 폭의 1/3 높이) — 이보다 두꺼우면 스택이 탑처럼 보인다.
export const CARD_T = 0.0045;
export const DECK_SIZE = 78;

export const CAMERA_POS: readonly [number, number, number] = [0, 3.5, 8.8];
export const CAMERA_FOV = 36;
export const LOOK_AT_Y = 0.95;

// 부채꼴 호 — 반지름·반각·높이·기울기. 호의 중심은 카메라 반대쪽(z 음수)에 두어 카드가
// 카메라 쪽으로 불룩한 호를 그린다. 카드는 호를 따라 서되 **뒷면이 모두 카메라를 향한다**
// (yaw 를 호 각도에 그대로 맞추면 양끝 카드가 옆면을 보여 벽처럼 보인다). 살짝 roll 을 줘
// 손에 든 부채처럼, 양끝은 조금 내려앉는다.
const FAN_R = 6.2;
const FAN_HALF = 0.82;
const FAN_Y = 1.0;
const FAN_TILT = 0.38;
export const FAN_CZ = -FAN_R + 1.9;

export const TIMING = {
  shuffleS: 1.9,
  shuffleBeatS: 0.38,
  placeS: 0.85,
  flipGapS: 0.25,
  flipS: 1.1,
} as const;

export interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
}

const euler = new THREE.Euler();

export const makePose = (
  x: number,
  y: number,
  z: number,
  pitch: number,
  yaw: number,
  roll: number,
  s = 1,
): Pose => ({
  p: new THREE.Vector3(x, y, z),
  q: new THREE.Quaternion().setFromEuler(euler.set(pitch, yaw, roll, 'YXZ')),
  s,
});

export const clonePose = (pose: Pose): Pose => ({ p: pose.p.clone(), q: pose.q.clone(), s: pose.s });

// 로컬 z (월드 z 에서 FAN_CZ 를 뺀 값).
const local = (z: number): number => z - FAN_CZ;

// 덱 스택 — 테이블에 엎어 쌓인 78장(뒷면 위: pitch +90°). 살짝 비뚤게.
export const stackPose = (i: number, worldZ = 1.0): Pose =>
  makePose(0, 0.03 + i * CARD_T, local(worldZ), Math.PI / 2, 0.05, 0);

// 뽑기가 끝난 뒤 덱이 물러나 쉬는 자리(슬롯 뒤).
export const restPose = (i: number): Pose => stackPose(i, -2.4);

// 부채꼴 — i 번째 카드의 호 위 위치. lift 는 호버 들림(위로 + 카메라 쪽으로 튀어나옴).
export const fanPose = (i: number, n: number, lift = 0): Pose => {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const th = -FAN_HALF + t * 2 * FAN_HALF;
  return makePose(
    FAN_R * Math.sin(th),
    FAN_Y + lift - Math.abs(th) * 0.25,
    FAN_R * Math.cos(th) + lift * 0.6,
    FAN_TILT,
    Math.PI + th * 0.3,
    -th * 0.35,
  );
};

// 셔플 산개 — (카드, 박자) 해시로 결정적인 난수 위치. 박자마다 자리를 바꿔 휘몰아치게.
const hash = (i: number, beat: number): number => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(beat + 1, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const scatterPose = (i: number, beat: number): Pose => {
  const r1 = hash(i, beat);
  const r2 = hash(i + 1000, beat);
  const r3 = hash(i + 2000, beat);
  const r4 = hash(i + 3000, beat);
  return makePose(
    (r1 - 0.5) * 7,
    0.5 + r2 * 2.6,
    local((r3 - 0.5) * 4.5 + 0.4),
    (r4 - 0.5) * 1.6,
    r1 * Math.PI * 2,
    (r2 - 0.5) * 0.9,
  );
};

export const SHUFFLE_BEATS = 4;

// 슬롯 — 뽑힌 카드가 서는 자리. 정면 카메라 쪽으로 살짝 눕힌 이젤 자세. yaw π = 뒷면이
// 카메라를 향함(엎음), yaw 0 = 앞면. roll π = 역방향.
// spread(0.7~1) 는 세로 화면에서 슬롯 간격·크기를 줄여 카드가 화면 밖으로 안 나가게(Scene 이 aspect 로 계산).
export const slotPose = (i: number, n: number, yaw: number, roll: number, lift = 0, spread = 1): Pose => {
  const base = n === 1 ? 1.35 : n <= 3 ? 1.1 : 0.82;
  const scale = base * (0.85 + 0.15 * spread);
  const gap = (CARD_W * scale + 0.42) * spread;
  const x = (i - (n - 1) / 2) * gap;
  return makePose(x, 1.5 + lift, local(0.2), 0.32, yaw, roll, scale);
};

// 뷰포트 종횡비 → 슬롯 spread. 가로(≥1.5)는 1, 세로 폰(≈0.55)은 0.7.
export const slotSpreadFor = (aspect: number): number => clamp((aspect - 0.4) / 1.1, 0.7, 1);

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// 프레임 독립 감쇠 계수 — dt 초 동안 목표에 (1 - e^{-λ dt}) 만큼 접근.
export const dampK = (dt: number, lambda: number): number => 1 - Math.exp(-lambda * dt);
