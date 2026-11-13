import type { MealStorySceneType } from '@repo/api-contract';
import { prog, useClock } from '../anim';
import { clamp, lineupBand, textWidth } from '../layout';
import { HAND, TYPE } from '../theme';
import { lineupFootnotes, lineupTiming } from '../timeline';
import type { ChapterContext } from '../types';
import { CHALK, CHALK_AREA, chalkHeading, chalkNoteLayout, draw, fitHand, handWidth, scribble, writeOn } from './chalkLayout';
import { ChalkBoard, ChalkHeading, ChalkNote, ChalkNumber, ChalkSvg } from './kit';

type LineupScene = Extract<MealStorySceneType, { type: 'lineup' }>;

const { left: X, width: W } = CHALK_AREA;

/**
 * 줄 세우기(칠판) — 메뉴판 한 줄씩: 이름이 써지고, 점선 끝에 값이 세어 오르고, 그 아래 분필 빗금 막대가 값만큼 그어진다.
 * 강조한 줄은 초록 분필에 노란 동그라미. 값이 서로 비슷하면(종이 오리기와 같은 규칙) 가장 짧은·긴 막대 끝에 노란 점선 둘.
 * 이름과 옆 글이 한 줄에 안 들면 옆 글을 뺀다. 값을 모르는 줄은 막대 없이 '값 없음'.
 */
export const ChalkLineup = ({ scene, ctx }: { scene: LineupScene; ctx: ChapterContext }) => {
  const f = useClock();
  const rows = scene.rows;
  const timing = lineupTiming(rows.length);
  const head = chalkHeading(scene.title);
  const known = rows.flatMap((r) => (r.figure.value === null ? [] : [r.figure.value]));
  const max = Math.max(1, ...known);
  const note = chalkNoteLayout(scene.note, lineupFootnotes(scene));
  const top = head.bottom + (scene.basis ? 112 : 60);
  const rowH = clamp(((note.h ? note.top - 24 : CHALK_AREA.noteBottom) - top) / rows.length, 104, 220);
  const nameSize = clamp(Math.round(rowH * 0.37), TYPE.body, 68);
  const valueSize = Math.round(nameSize * 1.14);
  const unitEm = Math.max(0.56, TYPE.foot / valueSize);
  const barH = clamp(Math.round(rowH * 0.24), 22, 44);
  const lineH = nameSize * 1.25;
  const barTop = (i: number) => top + i * rowH + lineH + 8;
  const barLen = (value: number) => Math.max(26, (value / max) * (W - 6));
  // 값 글의 폭(가장 긴 것) — 이름은 그 왼쪽까지만.
  const valueW = Math.max(
    ...rows.map((r) => (r.figure.value === null ? handWidth('값 없음', TYPE.sub) : handWidth(r.figure.value.toLocaleString('ko-KR'), valueSize) + textWidth(r.figure.unit, valueSize * unitEm) + 8)),
  );
  const nameMax = W - valueW - 90;
  const band = lineupBand(known);
  const bandP = band ? prog(f, timing.bandAt, timing.bandAt + 14) : 0;
  return (
    <ChalkBoard>
      <ChalkHeading ctx={ctx} title={scene.title} />
      {scene.basis ? <div style={{ position: 'absolute', left: X, top: head.bottom + 44, fontSize: 36, fontWeight: 600, color: CHALK.faint, opacity: prog(f, 18, 30) }}>{scene.basis} 기준</div> : null}
      {rows.map((row, i) => {
        const s = timing.growStart(i);
        const name = prog(f, s - 14, s - 2);
        const grow = prog(f, s, s + timing.grow);
        const value = row.figure.value;
        const subW = row.sub ? textWidth(row.sub, TYPE.sub) + 16 : 0;
        // 이름을 하한까지 줄여도 옆 글이 값 자리로 넘어가면 옆 글을 빼고 이름을 다시 맞춘다(글로 보기에는 다 보인다).
        const withSub = fitHand(row.label, nameSize, nameMax - subW, TYPE.sub);
        const sub = row.sub && handWidth(row.label, withSub) + subW <= nameMax ? row.sub : null;
        const labelSize = sub ? withSub : fitHand(row.label, nameSize, nameMax, TYPE.sub);
        const loop = row.highlight ? prog(f, timing.bandAt + i * 3, timing.bandAt + 14 + i * 3) : 0;
        const color = row.highlight ? CHALK.green : CHALK.pink;
        return (
          <div key={i} style={{ position: 'absolute', left: X, top: top + i * rowH, width: W, opacity: name > 0 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', height: lineH }}>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', ...writeOn(name) }}>
                  <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: labelSize, letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>{row.label}</span>
                  {sub ? <span style={{ marginLeft: 16, fontSize: TYPE.sub, fontWeight: 600, color: CHALK.faint, whiteSpace: 'nowrap' }}>{sub}</span> : null}
                </span>
                {/* 강조 — 노란 분필 동그라미(왼쪽부터 그려진다). 글 폭은 브라우저가 정하므로 테두리로 그린다. */}
                {row.highlight && loop > 0 ? (
                  <span
                    data-loop=""
                    style={{
                      position: 'absolute',
                      left: -24,
                      right: -24,
                      top: -2,
                      bottom: -12,
                      border: `5px solid ${CHALK.yellow}`,
                      borderRadius: '50% 46% 52% 48% / 56% 50% 50% 44%',
                      transform: 'rotate(-1.5deg)',
                      clipPath: `inset(-10% ${((1 - loop) * 100).toFixed(1)}% -10% -5%)`,
                    }}
                  />
                ) : null}
              </span>
              <span style={{ flex: 1, minWidth: 20, margin: '0 22px 0 30px', borderBottom: `6px dotted ${CHALK.dim}`, transform: 'translateY(-10px)', clipPath: `inset(0 ${((1 - grow) * 100).toFixed(1)}% 0 0)` }} />
              {value === null ? (
                <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: TYPE.sub, color: CHALK.faint, whiteSpace: 'nowrap' }}>값 없음</span>
              ) : (
                <ChalkNumber value={value} progress={grow} unit={row.figure.unit} size={valueSize} unitEm={unitEm} color={row.highlight ? CHALK.green : CHALK.white} />
              )}
            </div>
            {value === null ? null : (
              <svg width={W} height={barH + 10} style={{ display: 'block', marginTop: 8, overflow: 'visible' }}>
                <path d={scribble(0, 2, barLen(value), barH, 31 + i)} stroke={color} strokeWidth={7} fill="none" strokeLinejoin="round" strokeLinecap="round" {...draw(grow)} />
              </svg>
            )}
          </div>
        );
      })}
      {band && bandP > 0 ? (
        <ChalkSvg>
          {[band.min, band.max].map((value, k) => {
            const x = X + barLen(value);
            const y1 = barTop(0) - 8;
            const y2 = barTop(rows.length - 1) + barH + 14;
            return <path key={k} d={`M ${x} ${y1} L ${x} ${y1 + (y2 - y1) * bandP}`} stroke={CHALK.yellow} strokeWidth={5} strokeDasharray="12 10" strokeLinecap="round" opacity={0.85} />;
          })}
        </ChalkSvg>
      ) : null}
      <ChalkNote layout={note} p={prog(f, timing.noteAt, timing.noteAt + 18)} />
    </ChalkBoard>
  );
};
