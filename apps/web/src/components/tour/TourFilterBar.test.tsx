import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TourFilterBar } from './TourFilterBar';

// 지역 칩 두 줄(8차) — 1행 권역(제주·서부권·동부권·전체), 2행은 고른 권역의 시도. 값은 region 키 하나로 오간다.
const chip = (name: string) => screen.getByRole('button', { name });
const isActive = (name: string) => chip(name).className.includes('border-teal-600');

describe('TourFilterBar 지역 칩', () => {
  it('기본(제주)은 권역 4칩만 보이고 시도 행은 없다', () => {
    render(<TourFilterBar value={{}} onChange={vi.fn()} />);
    for (const name of ['제주', '서부권', '동부권', '전체']) expect(chip(name)).toBeInTheDocument();
    expect(isActive('제주')).toBe(true);
    expect(screen.queryByText('시도')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '대전' })).not.toBeInTheDocument();
  });

  it('시도를 고르면 그 권역 칩이 켜지고 2행에 "<권역> 전체" + 그 권역 시도만 나온다', () => {
    const onChange = vi.fn();
    render(<TourFilterBar value={{ region: 'daejeon' }} onChange={onChange} />);
    expect(isActive('서부권')).toBe(true);
    expect(isActive('대전')).toBe(true);
    expect(isActive('서부권 전체')).toBe(false);
    for (const name of ['전북', '전남', '충남', '대전', '충북', '광주', '세종']) expect(chip(name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '강원' })).not.toBeInTheDocument();
    fireEvent.click(chip('서부권 전체'));
    expect(onChange).toHaveBeenLastCalledWith({ region: 'west' });
    fireEvent.click(chip('동부권'));
    expect(onChange).toHaveBeenLastCalledWith({ region: 'east' });
  });

  it('동부권을 고르면 6개 시도가 나오고 시도 클릭은 region 키 하나로 나간다', () => {
    const onChange = vi.fn();
    render(<TourFilterBar value={{ region: 'east', ageGrp: '30' }} onChange={onChange} />);
    expect(isActive('동부권')).toBe(true);
    expect(isActive('동부권 전체')).toBe(true);
    for (const name of ['강원', '경북', '경남', '부산', '대구', '울산']) expect(chip(name)).toBeInTheDocument();
    fireEvent.click(chip('부산'));
    expect(onChange).toHaveBeenLastCalledWith({ region: 'busan', ageGrp: '30' });
  });

  it('전체는 시도 행이 없다', () => {
    render(<TourFilterBar value={{ region: 'all' }} onChange={vi.fn()} />);
    expect(isActive('전체')).toBe(true);
    expect(screen.queryByText('시도')).not.toBeInTheDocument();
  });
});
