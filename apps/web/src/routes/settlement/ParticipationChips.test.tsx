import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { participationAxis } from '@repo/shared';
import { ParticipationBadges, ParticipationToggles } from './ParticipationChips';

// 참여 칩 — 저장값(exclude)과 화면(긍정 라벨)의 극성이 반대라 뒤집힘 실수가
// 가장 흔한 회귀다. 켜짐=분담(exclude=false), 누르면 빠짐(exclude=true) 계약만 본다.

const none = { excludeAlcohol: false, excludeNonAlcohol: false, excludeSide: false };

describe('ParticipationToggles', () => {
  it('기본은 술·음료·안주 모두 켜짐(분담)이고, 누르면 exclude=true 로 뺀다', () => {
    const onChange = vi.fn();
    render(<ParticipationToggles value={none} onChange={onChange} />);
    const drink = screen.getByRole('button', { name: '술' });
    expect(drink.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '음료' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '안주' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(drink);
    expect(onChange).toHaveBeenCalledWith('excludeAlcohol', true);
  });

  it('빠진 축은 꺼짐으로 보이고, 누르면 exclude=false 로 되돌린다', () => {
    const onChange = vi.fn();
    render(
      <ParticipationToggles value={{ ...none, excludeSide: true }} onChange={onChange} />,
    );
    const side = screen.getByRole('button', { name: '안주' });
    expect(side.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(side);
    expect(onChange).toHaveBeenCalledWith('excludeSide', false);
  });
});

describe('ParticipationBadges', () => {
  it('받은 축만 긍정 배지로 그리고, 없으면 아무것도 그리지 않는다', () => {
    const { container, rerender } = render(
      <ParticipationBadges
        axes={[participationAxis('excludeAlcohol'), participationAxis('excludeSide')]}
      />,
    );
    expect(container.textContent).toBe('술안주');
    rerender(<ParticipationBadges axes={[]} />);
    expect(container.textContent).toBe('');
  });
});
