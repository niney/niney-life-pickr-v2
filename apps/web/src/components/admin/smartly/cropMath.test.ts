import { describe, expect, it } from 'vitest';
import { isUsableSelection, rectBetween, rectStyle, toFracPoint, toPixelRect } from './cropMath';

// 사진 → 번역 탭의 드래그 선택 좌표 계산.

const box = { left: 100, top: 50, width: 400, height: 200 };

describe('cropMath', () => {
  it('표시 좌표를 이미지 대비 비율로 바꾸고 이미지 밖은 가장자리로 자른다', () => {
    expect(toFracPoint(300, 150, box)).toEqual({ x: 0.5, y: 0.5 });
    expect(toFracPoint(50, 400, box)).toEqual({ x: 0, y: 1 });
  });

  it('어느 방향으로 끌어도 같은 사각형이 된다', () => {
    const a = { x: 0.6, y: 0.4 };
    const b = { x: 0.2, y: 0.1 };
    expect(rectBetween(a, b)).toEqual(rectBetween(b, a));
    const rect = rectBetween(a, b);
    expect(rect.x).toBe(0.2);
    expect(rect.y).toBe(0.1);
    expect(rect.w).toBeCloseTo(0.4);
    expect(rect.h).toBeCloseTo(0.3);
  });

  it('표시 크기로 8px 보다 작은 드래그는 클릭으로 보고 버린다', () => {
    expect(isUsableSelection({ x: 0, y: 0, w: 0.01, h: 0.5 }, box)).toBe(false);
    expect(isUsableSelection({ x: 0, y: 0, w: 0.02, h: 0.04 }, box)).toBe(true);
  });

  it('원본 픽셀로 바꿀 때 이미지 범위를 넘지 않고 최소 1px 을 남긴다', () => {
    expect(toPixelRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 1000, 800)).toEqual({
      sx: 250,
      sy: 400,
      sw: 500,
      sh: 200,
    });
    expect(toPixelRect({ x: 0.999, y: 0, w: 0.0001, h: 1 }, 1000, 800)).toEqual({
      sx: 999,
      sy: 0,
      sw: 1,
      sh: 800,
    });
  });

  it('겹쳐 그릴 위치는 퍼센트로 준다', () => {
    expect(rectStyle({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 })).toEqual({
      left: '10%',
      top: '20%',
      width: '50%',
      height: '25%',
    });
  });
});
