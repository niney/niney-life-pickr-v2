import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImgWithFallback } from './ImgWithFallback';

// 썸네일 프록시를 src 로 쓰는 곳의 안전망 — 프록시가 실패하면 원본(fallbackSrc)으로 한 번 더 시도하고,
// 그것도 실패해야 placeholder 로 간다. fallbackSrc 가 없거나 src 와 같으면 예전처럼 바로 placeholder.

const PROXY = '/api/v1/media/thumbnail?url=https%3A%2F%2Fx.pstatic.net%2Fa.jpg&w=480';
const ORIGINAL = 'https://x.pstatic.net/a.jpg';
const PLACEHOLDER = '이미지를 불러올 수 없습니다';

const img = () => screen.getByRole('presentation') as HTMLImageElement;

describe('ImgWithFallback', () => {
  it('src 실패 → fallbackSrc 로 교체, fallbackSrc 도 실패하면 placeholder', () => {
    render(<ImgWithFallback src={PROXY} fallbackSrc={ORIGINAL} />);
    expect(img()).toHaveAttribute('src', PROXY);

    fireEvent.error(img());
    expect(img()).toHaveAttribute('src', ORIGINAL);
    expect(screen.queryByLabelText(PLACEHOLDER)).toBeNull();

    fireEvent.error(img());
    expect(screen.getByLabelText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('fallbackSrc 가 없으면 실패 즉시 placeholder', () => {
    render(<ImgWithFallback src={ORIGINAL} />);
    fireEvent.error(img());
    expect(screen.getByLabelText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('fallbackSrc 가 src 와 같으면(프록시를 안 타는 주소) 같은 주소를 다시 받지 않는다', () => {
    render(<ImgWithFallback src={ORIGINAL} fallbackSrc={ORIGINAL} />);
    fireEvent.error(img());
    expect(screen.getByLabelText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('src 가 바뀌면 실패·교체 상태를 버리고 새 src 부터 다시 시도한다', () => {
    const { rerender } = render(<ImgWithFallback src={PROXY} fallbackSrc={ORIGINAL} />);
    fireEvent.error(img());
    expect(img()).toHaveAttribute('src', ORIGINAL);

    const nextProxy = PROXY.replace('a.jpg', 'b.jpg');
    rerender(<ImgWithFallback src={nextProxy} fallbackSrc={ORIGINAL.replace('a.jpg', 'b.jpg')} />);
    expect(img()).toHaveAttribute('src', nextProxy);
  });
});
