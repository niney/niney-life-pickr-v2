import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TarotCardBack, TarotCardImage } from './TarotCardImage';

// 카드 이미지 — 작게 그리는 자리는 sizes 를 주고, 그러면 작은 변형(112·224)이 srcSet 에 실려 브라우저가
// 화면 밀도에 맞는 것을 고른다. sizes 가 없으면 예전처럼 512 한 장.

describe('TarotCardImage', () => {
  it('sizes 를 주면 작은 변형을 srcSet 으로 함께 내보낸다', () => {
    render(<TarotCardImage cardId="major-00" sizes="32px" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('sizes', '32px');
    expect(img).toHaveAttribute(
      'srcset',
      '/tarot/cards/major-00-112.webp 112w, /tarot/cards/major-00-224.webp 224w, /tarot/cards/major-00-512.webp 512w',
    );
    // srcSet 을 모르는 환경의 폴백은 그대로 512.
    expect(img).toHaveAttribute('src', '/tarot/cards/major-00-512.webp');
  });

  it('sizes 가 없으면 512 한 장만 쓴다(3D 무대가 받은 그림 재사용)', () => {
    render(<TarotCardImage cardId="major-00" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/tarot/cards/major-00-512.webp');
    expect(img).not.toHaveAttribute('srcset');
    expect(img).not.toHaveAttribute('sizes');
  });

  it('그림을 못 받으면 이름을 적은 대체 카드로 바꾼다', () => {
    render(<TarotCardImage cardId="major-00" sizes="32px" />);
    fireEvent.error(screen.getByRole('img'));
    const fallback = screen.getByRole('img');
    expect(fallback.tagName).toBe('DIV');
    expect(fallback).toHaveAccessibleName(/바보/);
  });
});

describe('TarotCardBack', () => {
  it('sizes 를 주면 뒷면도 작은 변형을 고르게 한다', () => {
    const { container } = render(<TarotCardBack sizes="56px" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('sizes', '56px');
    expect(img.getAttribute('srcset')).toBe(
      '/tarot/cards/back-112.webp 112w, /tarot/cards/back-224.webp 224w, /tarot/cards/back-512.webp 512w',
    );
  });

  it('sizes 가 없으면 512 한 장만 쓴다', () => {
    const { container } = render(<TarotCardBack />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/tarot/cards/back-512.webp');
    expect(img).not.toHaveAttribute('srcset');
  });
});
