import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { pop, prog, useClock } from './anim';
import { LINEUP, fitSize, lineupBand, lineupLayout, lineupUnitScale, lineupValueWidth, textWidth, wrapText } from './layout';
import { RollingNumber } from './RollingNumber';
import { Icon } from './paper/Icon';
import { Card, Note, Paper, Sheet, Tape } from './paper/kit';
import { boil, tornRect } from './paper/torn';
import { PaperHeading, PaperStage } from './Stage';
import { FONT, TYPE, formatAmount } from './theme';
import { lineupFootnotes, lineupTiming } from './timeline';
import type { ChapterContext } from './types';

type LineupScene = Extract<MealStorySceneType, { type: 'lineup' }>;

const { X, W, TEXT_X, RIGHT, NOTE_SIZE } = LINEUP;

/**
 * 줄 세우기 — 여러 가지(4~7)를 같은 잣대로 한 줄씩. 줄마다 종이 띠(소품 그림 · 이름 · 가는 막대 · 값)가 왼쪽에서 차례로
 * 들어와 막대가 자라고 숫자가 굴러 오른다. 강조한 줄은 노란 종이. 값이 서로 비슷하면(가장 큰 값이 가장 작은 값의 1.3배 안)
 * 가장 짧은 막대와 가장 긴 막대의 끝에 점선 둘을 내려 '이 사이'임을 보인다. 막대(bars)는 둘~넷을 크게, 이것은 여럿을 가늘게.
 * 이름 옆 작은 글(양)은 이름과 한 줄에 들 때만 — 넘치면 뺀다.
 * 값을 모르는 줄은 막대 없이 '값 없음' — 0 으로 그리지 않는다.
 */
export const ChapterLineup = ({ scene, ctx }: { scene: LineupScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal, id } = ctx;
  const v = boil(f);
  const values = scene.rows.map((r) => r.figure.value);
  const known = values.filter((x): x is number => x !== null);
  const max = Math.max(1, ...known);
  const timing = lineupTiming(scene.rows.length);
  const noteLines = scene.note ? wrapText(scene.note, NOTE_SIZE, 840) : [];
  const footLines = lineupFootnotes(scene).flatMap((d) => wrapText(`※ ${d}`, TYPE.foot, 840));
  const L = lineupLayout(scene.rows.length, scene.basis !== null, noteLines.length, footLines.length);
  const valueW = lineupValueWidth(
    scene.rows.map((r) => ({ number: r.figure.value === null ? null : formatAmount(r.figure.value, r.figure.unit), unit: r.figure.unit })),
    L.numSize,
  );
  const trackW = RIGHT - valueW - 26 - TEXT_X;
  const barLen = (value: number) => Math.max(14, (value / max) * trackW);
  const band = lineupBand(known);
  const bandIn = band ? prog(f, timing.bandAt, timing.bandAt + 14) : 0;
  const note = prog(f, timing.noteAt, timing.noteAt + 18);
  const basis = scene.basis ? pop(f, 18, fps, { damping: 14, stiffness: 150 }) : 0;
  const iconScale = Math.min(0.44, (L.cardH - 6) / 250);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={scene.title} />
      <PaperStage ctx={ctx} table={null} wall="dots" />
      {scene.basis ? (
        <Sheet>
          <g opacity={Math.min(1, basis * 1.5)} transform={`translate(${(1 - basis) * -200} 0)`}>
            <Note x={X + 6} y={LINEUP.TOP - 6} text={`${scene.basis} 기준`} size={TYPE.sub} fill={pal.cream} color={pal.ink} weight={700} anchor="start" angle={-1} seed={27 + v * 101} lift={0.5} />
          </g>
        </Sheet>
      ) : null}
      {scene.rows.map((row, i) => {
        const start = timing.growStart(i);
        const enter = pop(f, start - 12, fps, { damping: 15, stiffness: 150 });
        const grow = prog(f, start, start + timing.grow);
        const value = values[i] ?? null;
        const top = L.top + i * L.rowH;
        const mid = top + L.cardH / 2;
        const subSize = Math.max(TYPE.foot, L.labelSize - 8);
        const subW = row.sub ? textWidth(row.sub, subSize) + 16 : 0;
        const labelSize = fitSize(row.label, L.labelSize, trackW - subW, TYPE.sub);
        // 이름을 하한까지 줄여도 옆 글이 값 자리로 넘어가면 옆 글을 뺀다(글로 보기에는 다 보인다 — 점검이 미리 알린다).
        const sub = row.sub && textWidth(row.label, labelSize) + subW <= trackW ? row.sub : null;
        const labelY = top + L.padY + L.labelSize * 0.84;
        const barTop = top + L.padY + L.labelSize * 1.2 + L.gap;
        const wiggle = Math.sin(f / 9 + i) * 3;
        return (
          <AbsoluteFill key={i} style={{ opacity: Math.min(1, enter * 1.5), transform: `translateX(${(1 - enter) * -220}px)` }}>
            <Sheet>
              <defs>
                <clipPath id={`${id}-line-${i}`}>
                  <rect x={TEXT_X - 8} y={barTop - 8} width={8 + (value === null ? 0 : barLen(value)) * grow + 8} height={L.barH + 22} />
                </clipPath>
              </defs>
              <Paper d={tornRect(X, Math.round(top), W, Math.round(L.cardH), { seed: 81 + i + v * 101, amp: 2.4, step: 7 })} fill={row.highlight ? pal.yellow : pal.paper} lift={0.9} />
              {i === 0 ? <Tape x={X + W - 40} y={top + 2} angle={24} pal={pal} w={80} /> : null}
              <g transform={`translate(${X + 78} ${mid}) rotate(${wiggle}) scale(${iconScale})`}>
                <Icon icon={row.icon} fallback={row.label} pal={pal} f={f} v={v} />
              </g>
              <text x={TEXT_X} y={labelY} fontFamily={FONT} fontWeight={row.highlight ? 800 : 700} fontSize={labelSize} letterSpacing={-labelSize * 0.03} fill={pal.ink}>
                {row.label}
              </text>
              {sub ? (
                <text x={TEXT_X + textWidth(row.label, labelSize) + 16} y={labelY} fontFamily={FONT} fontWeight={600} fontSize={subSize} fill={pal.inkFaint}>
                  {sub}
                </text>
              ) : null}
              <rect x={TEXT_X} y={barTop + 2} width={trackW} height={L.barH - 4} rx={3} fill="rgba(42,29,24,0.09)" />
              {value !== null ? (
                <g clipPath={`url(#${id}-line-${i})`}>
                  <Paper d={tornRect(TEXT_X, Math.round(barTop), Math.round(barLen(value)), L.barH, { seed: 87 + i + v * 101, amp: 1.8, step: 6 })} fill={pal.stage} lift={0.5} />
                </g>
              ) : null}
            </Sheet>
            <div style={{ position: 'absolute', right: 1080 - RIGHT, top: mid - L.numSize / 2 - 2, width: 'max-content' }}>
              {value !== null ? (
                <RollingNumber target={value} progress={grow} size={L.numSize} color={pal.ink} unit={row.figure.unit} unitScale={lineupUnitScale(L.numSize)} />
              ) : (
                <span style={{ display: 'block', fontFamily: FONT, fontSize: Math.max(TYPE.sub, Math.round(L.numSize * 0.6)), lineHeight: `${L.numSize}px`, fontWeight: 700, color: pal.inkFaint }}>값 없음</span>
              )}
            </div>
          </AbsoluteFill>
        );
      })}
      {band && bandIn > 0 ? (
        <Sheet>
          {[band.min, band.max].map((value, k) => {
            const x = TEXT_X + barLen(value);
            const y1 = L.top - 10;
            const y2 = L.top + (scene.rows.length - 1) * L.rowH + L.cardH + 10;
            return <path key={k} d={`M ${x} ${y1} L ${x} ${y1 + (y2 - y1) * bandIn}`} stroke={pal.ink} strokeWidth={4} strokeDasharray="12 10" strokeLinecap="round" opacity={0.55} />;
          })}
        </Sheet>
      ) : null}
      {noteLines.length || footLines.length ? (
        <Sheet>
          <g opacity={note} transform={`translate(0 ${(1 - note) * 30})`}>
            {noteLines.length ? <Card x={540} y={L.noteTop} lines={noteLines} size={NOTE_SIZE} fill={pal.paper} color={pal.ink} angle={-0.8} seed={91 + v * 101} /> : null}
            {footLines.length ? (
              <Card x={540} y={L.footTop} lines={footLines} size={TYPE.foot} fill={pal.cream} color={pal.inkFaint} weight={600} angle={0.6} seed={93 + v * 101} lift={0.4} />
            ) : null}
          </g>
        </Sheet>
      ) : null}
    </AbsoluteFill>
  );
};
