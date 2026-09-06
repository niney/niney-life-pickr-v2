import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SajuGReadingResult } from '@repo/api-contract';
import { basicSajuGLifeScenes } from '@repo/utils';
import fixture from '~/test/fixtures/saju-g-reading.json';
import { SajuGDayStoryCard, SajuGGodStoryCards, SajuGLifeManual } from './SajuGDiscoveries';

const reading = SajuGReadingResult.parse(fixture);
describe('사주(G) 발견 카드', () => {
  it('구버전 보관 결과도 기본 생활 장면을 보여주며 선택할 수 있다', () => {
    render(<SajuGLifeManual chart={reading.chart} result={reading} pending={false} />);
    expect(screen.getByText('상징으로 돌아보는 장면')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /할 일이 한꺼번에 몰릴 때/ });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('집중이 잘됐던 날에는 어떤 환경이었나요?')).toBeInTheDocument();
  });
  it('기본 안내를 먼저 표시하고 AI 응답이 오면 선택한 장면을 유지한다', () => {
    const { rerender } = render(<SajuGLifeManual chart={reading.chart} result={null} pending />);
    fireEvent.click(screen.getByRole('button', { name: /마음이 부딪히는 대화에서/ }));
    expect(screen.getByText('기본 안내 · AI가 읽는 중')).toBeInTheDocument();
    const lifeScenes = basicSajuGLifeScenes(reading.chart).map((s) => ({
      ...s,
      text: `${s.id}의 새로운 AI 장면`,
    }));
    rerender(
      <SajuGLifeManual
        chart={reading.chart}
        result={{ ...reading, source: 'ai', report: { ...reading.report, lifeScenes } }}
        pending={false}
      />,
    );
    expect(screen.getByText('conflict의 새로운 AI 장면')).toBeInTheDocument();
    expect(screen.getByText('AI가 풀어주는 장면')).toBeInTheDocument();
    expect(screen.queryByText('meeting의 새로운 AI 장면')).not.toBeInTheDocument();
  });
  it('미확정 일간에는 상징 카드와 십성 위치를 꾸며내지 않는다', () => {
    const chart = { ...reading.chart, dayMaster: null };
    render(
      <>
        <SajuGDayStoryCard chart={chart} onHighlight={vi.fn()} />
        <SajuGGodStoryCards chart={chart} />
      </>,
    );
    expect(screen.getByText('아직 하나로 정하지 않은 이야기')).toBeInTheDocument();
    expect(screen.getByText('관계 미확정')).toBeInTheDocument();
    expect(document.querySelectorAll('.saju-g-story-card, .saju-g-god-card')).toHaveLength(0);
  });
  it('대표 카드를 열면 해당 오행을 강조한다', () => {
    const highlight = vi.fn();
    const { container } = render(
      <SajuGDayStoryCard chart={reading.chart} onHighlight={highlight} />,
    );
    const card = container.querySelector('details')!;
    card.open = true;
    fireEvent(card, new Event('toggle'));
    expect(highlight).toHaveBeenCalledWith(reading.chart.dayMaster!.element);
    expect(screen.getByText(/일주의 두 글자에서 만든 상징 이야기/)).toBeInTheDocument();
  });
});
