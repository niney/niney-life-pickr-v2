import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectTarotRender, hasWebGL2, resetWebGL2Probe } from './tarotQuality';

// WebGL2 프로브 — jsdom 에는 WebGL2 가 없어 전역과 getContext 를 바꿔 끼워 본다. 성공은 한 번만 물어보고,
// 프로브용 컨텍스트는 바로 반납하는지(브라우저의 동시 컨텍스트 상한을 차지하지 않게).

const stubWebGL2 = (context: unknown) => {
  vi.stubGlobal('WebGL2RenderingContext', function WebGL2RenderingContext() {});
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
};

afterEach(() => {
  resetWebGL2Probe();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('hasWebGL2', () => {
  it('한 번 성공하면 컨텍스트를 다시 만들지 않고, 프로브 컨텍스트는 바로 반납한다', () => {
    const loseContext = vi.fn();
    const getContext = stubWebGL2({ getExtension: (name: string) => (name === 'WEBGL_lose_context' ? { loseContext } : null) });
    expect(hasWebGL2()).toBe(true);
    expect(hasWebGL2()).toBe(true);
    expect(detectTarotRender('').mode).toBe('3d');
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('반납 확장이 없는 브라우저에서도 판정은 된다', () => {
    stubWebGL2({ getExtension: () => null });
    expect(hasWebGL2()).toBe(true);
  });

  it('실패는 기억하지 않는다 — 다음 판정에서 다시 물어본다', () => {
    const getContext = stubWebGL2(null);
    expect(hasWebGL2()).toBe(false);
    expect(detectTarotRender('')).toMatchObject({ mode: 'lite', reason: 'no-webgl2' });
    expect(getContext).toHaveBeenCalledTimes(2);
  });

  it('WebGL2 전역이 없으면(jsdom) 컨텍스트를 만들어 보지도 않는다', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    expect(hasWebGL2()).toBe(false);
    expect(getContext).not.toHaveBeenCalled();
  });
});
