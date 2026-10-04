import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Lightbox } from './Lightbox';

// 라이트박스의 index ↔ scrollLeft 동기화 계약:
//   ① 스와이프(스크롤)가 올린 index 는 다시 scrollTo 로 되돌려 쓰지 않는다 — 제스처와 싸우지 않게
//   ② 0번으로 열었다가 처음 넘길 때도 'smooth'(첫 진입용 'instant' 가 뒤늦게 발동하지 않는다)
//   ③ n번으로 열면 첫 이동만 'instant'
//   ④ <img> 는 현재 장 ±2 까지만 그리고, 슬라이드 자리(개수)는 그대로 둔다
// jsdom 은 레이아웃이 없어 clientWidth 가 0 이고 Element.scrollTo 도 없다 — 폭은 400 으로 속이고
// scrollTo 는 scrollLeft 만 옮기는 목으로 바꾼다.

const WIDTH = 400;
const images = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/p${i}.jpg`);

const Harness = ({ count, initial }: { count: number; initial: number }) => {
  const [index, setIndex] = useState(initial);
  return (
    <>
      <div data-testid="index">{index}</div>
      <Lightbox images={images(count)} index={index} onChangeIndex={setIndex} onClose={() => {}} />
    </>
  );
};

const getScroller = (): HTMLElement => {
  const el = screen.getByRole('dialog').querySelector<HTMLElement>('div.snap-x');
  if (!el) throw new Error('scroller not found');
  return el;
};
const swipeTo = (scroller: HTMLElement, left: number) => {
  scroller.scrollLeft = left;
  fireEvent.scroll(scroller);
};

type ScrollToFn = (this: HTMLElement, opts: ScrollToOptions) => void;
const proto = Element.prototype as unknown as { scrollTo?: ScrollToFn };
let originalScrollTo: ScrollToFn | undefined;
let scrollTo: ReturnType<typeof vi.fn<ScrollToFn>>;

beforeEach(() => {
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  originalScrollTo = proto.scrollTo;
  scrollTo = vi.fn<ScrollToFn>(function (opts) {
    this.scrollLeft = opts.left ?? 0;
  });
  proto.scrollTo = scrollTo;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollTo) proto.scrollTo = originalScrollTo;
  else delete proto.scrollTo;
});

describe('Lightbox', () => {
  it('스와이프로 넘기면 index 만 따라가고 scrollTo 는 걸지 않는다 — 되돌아오는 스크롤도 따라간다', () => {
    render(<Harness count={3} initial={0} />);
    const scroller = getScroller();
    // 0번은 옮길 곳이 없다.
    expect(scrollTo).not.toHaveBeenCalled();

    // 절반을 넘긴 순간 index 가 1 로 — 손가락이 아직 끌고 있으므로 프로그램 스크롤은 없어야 한다.
    swipeTo(scroller, 220);
    expect(screen.getByTestId('index')).toHaveTextContent('1');
    expect(scrollTo).not.toHaveBeenCalled();

    // 다시 절반 아래로 끌어내리면 index 도 0 으로(가드에 막혀 어긋나지 않는다).
    swipeTo(scroller, 150);
    expect(screen.getByTestId('index')).toHaveTextContent('0');
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('0번으로 연 뒤 키보드로 넘기면 smooth 로 한 장 이동한다(instant 로 튀지 않는다)', () => {
    render(<Harness count={3} initial={0} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('index')).toHaveTextContent('1');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: WIDTH, behavior: 'smooth' });
  });

  it('n번으로 열면 첫 이동만 instant, 이후 버튼 이동은 smooth', () => {
    render(<Harness count={5} initial={2} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 2 * WIDTH, behavior: 'instant' });

    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.getByTestId('index')).toHaveTextContent('3');
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 3 * WIDTH, behavior: 'smooth' });
  });

  it('<img> 는 현재 장 ±2 까지만 — 슬라이드 개수는 그대로', () => {
    render(<Harness count={10} initial={5} />);
    const scroller = getScroller();
    expect(scroller.children).toHaveLength(10);
    const srcs = () => Array.from(scroller.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(srcs()).toEqual(images(10).slice(3, 8));

    // 한 장 넘기면 창도 따라 옮겨진다.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(srcs()).toEqual(images(10).slice(4, 9));
  });

  it('맨 앞에서는 앞쪽 창이 없다(0·1·2 만)', () => {
    render(<Harness count={10} initial={0} />);
    const scroller = getScroller();
    expect(Array.from(scroller.querySelectorAll('img')).map((img) => img.getAttribute('src'))).toEqual(
      images(10).slice(0, 3),
    );
  });
});
