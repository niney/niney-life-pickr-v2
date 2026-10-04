import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CARD_W, FAN_CZ, clonePose, fanPose, slotPose, slotPoseInto } from './layout';

// 슬롯 포즈 — 값(위치·자세·크기)과, 프레임마다 부르는 판(slotPoseInto)이 객체를 새로 만들지 않는지.

describe('slotPose / slotPoseInto', () => {
  it('3장 스프레드 첫 자리 — 간격·높이·자세·크기', () => {
    const pose = slotPose(0, 3, Math.PI, 0);
    const scale = 1.1;
    expect(pose.s).toBeCloseTo(scale);
    expect(pose.p.x).toBeCloseTo(-(CARD_W * scale + 0.42));
    expect(pose.p.y).toBeCloseTo(1.5);
    expect(pose.p.z).toBeCloseTo(0.2 - FAN_CZ);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, Math.PI, 0, 'YXZ'));
    expect(pose.q.angleTo(q)).toBeCloseTo(0);
  });

  it('slotPoseInto 는 받은 Pose 에 slotPose 와 같은 값을 써 넣는다(새 Vector3·Quaternion 없음)', () => {
    const scratch = clonePose(fanPose(10, 78));
    const { p, q } = scratch;
    const cases = [
      [0, 3, Math.PI, 0, 0, 1],
      [2, 3, 0.4, Math.PI, 0.3, 0.7],
      [0, 1, 0, 0, 0.6, 0.85],
      [4, 10, 1.2, 0, 0.12, 1],
    ] as const;
    for (const [i, n, yaw, roll, lift, spread] of cases) {
      const expected = slotPose(i, n, yaw, roll, lift, spread);
      const out = slotPoseInto(scratch, i, n, yaw, roll, lift, spread);
      expect(out).toBe(scratch);
      expect(out.p).toBe(p);
      expect(out.q).toBe(q);
      expect(out.p.toArray()).toEqual(expected.p.toArray());
      expect(out.q.toArray()).toEqual(expected.q.toArray());
      expect(out.s).toBe(expected.s);
    }
  });
});
