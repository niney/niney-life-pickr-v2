import type { ReactNode } from 'react';
import { useVideoConfig } from 'remotion';
import { pop, useClock } from './anim';
import { KineticTitle } from './KineticTitle';
import { HEADING, PANEL, headingBottom, headingSize } from './layout';
import { Note, Paper, Patterns, Sheet, Tape } from './paper/kit';
import { Clock, SoupBowl } from './paper/props';
import { boil, tornRect } from './paper/torn';
import { HAND } from './theme';
import type { ChapterContext } from './types';

// 장면 공통 무대(종이 오리기) — 위: 머리말 쪽지 + 손글씨 제목 띠(테이프), 아래: 주제색 색종이 무대(줄무늬 벽지,
// 깅엄 식탁보, 벽시계·국그릇 같은 살림살이). 무대는 아래에서 올라와 자리 잡는다.

export const PaperHeading = ({ ctx, title, start = 0 }: { ctx: ChapterContext; title: string; start?: number }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const kk = pop(f, start + 2, fps, { damping: 14, stiffness: 150 });
  const ks = pop(f, start + 4, fps, { damping: 13, stiffness: 130 });
  const top = HEADING.top - 28;
  const height = Math.round(headingBottom(title) - top);
  const mid = top + height / 2;
  return (
    <>
      <Sheet>
        <g transform={`translate(${(1 - kk) * -420} 0)`}>
          <Note x={60} y={100} text={ctx.kicker} size={46} fill={pal.stage} color="#ffffff" font={HAND} weight={700} angle={-3} seed={31 + v * 101} anchor="start" tracking={-0.06} />
        </g>
        <g transform={`translate(0 ${(1 - ks) * -240}) rotate(${(1 - ks) * -5} 534 ${top})`} opacity={Math.min(1, ks * 2)}>
          <g transform={`rotate(-1.2 534 ${mid})`}>
            <Paper d={tornRect(44, top, 980, height, { seed: 21 + v * 101, amp: 3.2, step: 7 })} fill={pal.paper} lift={1.2} />
          </g>
          <Tape x={98} y={top + 4} angle={-24} pal={pal} />
          <Tape x={982} y={top - 4} angle={18} pal={pal} />
        </g>
      </Sheet>
      <KineticTitle
        text={title}
        start={start + 10}
        size={headingSize(title)}
        color={pal.ink}
        font={HAND}
        weight={700}
        tracking="-0.07em"
        stagger={3}
        style={{ position: 'absolute', top: HEADING.top, left: HEADING.left, width: HEADING.width, transform: 'rotate(-1.2deg)', transformOrigin: `450px ${mid - HEADING.top}px` }}
      />
    </>
  );
};

/** 주제색 무대 — table 은 식탁보 윗선(y, null 이면 벽만), decor 는 벽시계·국그릇. children 은 무대와 함께 올라온다. */
export const PaperStage = ({
  ctx,
  start = 0,
  table = 1250,
  decor = [],
  wall = 'stripes',
  area = PANEL,
  children,
}: {
  ctx: ChapterContext;
  start?: number;
  table?: number | null;
  decor?: ('clock' | 'bowl')[];
  wall?: 'stripes' | 'dots';
  /** 무대 자리 — 기본은 아래쪽 무대, 표지는 화면 가득. */
  area?: { x: number; y: number; w: number; h: number };
  children?: ReactNode;
}) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal, id } = ctx;
  const v = boil(f);
  const k = pop(f, start, fps, { damping: 16, stiffness: 120 });
  const stage = tornRect(area.x, area.y, area.w, area.h, { seed: 11 + v * 101, amp: 4, step: 9 });
  return (
    <Sheet>
      <Patterns idp={id} pal={pal} />
      <defs>
        <clipPath id={`${id}-stage`}>
          <path d={stage} />
        </clipPath>
      </defs>
      <g transform={`translate(0 ${(1 - k) * 1350})`}>
        <Paper d={stage} fill={pal.stage} lift={1.4} />
        <g clipPath={`url(#${id}-stage)`}>
          <rect x={area.x} y={area.y} width={area.w} height={area.h} fill={`url(#${id}-${wall})`} />
          {table !== null ? (
            <Paper d={tornRect(area.x - 12, table, area.w + 24, area.y + area.h + 30 - table, { seed: 13 + v * 101, amp: 3.5, step: 9 })} fill={`url(#${id}-gingham)`} lift={1} />
          ) : null}
        </g>
        {decor.includes('clock') ? (
          <g transform="translate(168 724) scale(0.86)">
            <Clock pal={pal} f={f} v={v} />
          </g>
        ) : null}
        {decor.includes('bowl') && table !== null ? (
          <g transform={`translate(146 ${table + 74}) scale(0.78)`}>
            <SoupBowl pal={pal} f={f} v={v} />
          </g>
        ) : null}
        {children}
      </g>
    </Sheet>
  );
};
