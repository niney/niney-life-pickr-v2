import type { MealStorySceneType } from '@repo/api-contract';
import { useVideoConfig } from 'remotion';
import { lerp, pop, prog, useClock } from '../anim';
import { clamp, ownStandardText, wrapText } from '../layout';
import { HAND, TYPE, formatAmount } from '../theme';
import { statTiming } from '../timeline';
import type { ChapterContext } from '../types';
import { CHALK, CHALK_AREA, chalkHeading, chalkNoteLayout, draw, wobble, writeOn } from './chalkLayout';
import { ChalkBoard, ChalkHeading, ChalkNote, ChalkNumber, ChalkSvg } from './kit';

type StatScene = Extract<MealStorySceneType, { type: 'stat' }>;

const { left: X, width: W } = CHALK_AREA;
const LABEL_H = 60;
const DETAIL_H = 56;
// 숫자 아래 덧말 — 칠판은 자리가 넉넉해 본문 크기로 쓴다.
const DETAIL_SIZE = TYPE.body;

/**
 * 큰 숫자(칠판) — 숫자마다 이름표가 써지고 큰 분필 숫자가 세어 오른다. 그 아래에 서버의 덧말(나이별 기준)과 다른 단위로 본
 * 값(나트륨 → 소금, 노란 분필). 내 기록 값은 로그인했을 때만 — 내 기준 대비 %·소금 환산·직전 2주 대비 변화, 판정은 분필
 * 도장(넘으면 분홍). 글자는 종이 오리기와 같은 규칙(ownStandardText)·같은 문구를 쓴다.
 */
export const ChalkStat = ({ scene, ctx }: { scene: StatScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const n = Math.max(1, scene.figures.length);
  const timing = statTiming(scene.figures.length);
  const head = chalkHeading(scene.title);
  const note = chalkNoteLayout(scene.note, []);
  const standards = scene.figures.flatMap((x) => (!x.figure.my && x.figure.value !== null ? [x.figure.value] : []));
  const detailsOf = (fig: StatScene['figures'][number]): { text: string; color: string }[] => {
    const eq = fig.figure.equivalent;
    const out: { text: string; color: string }[] = [];
    if (!fig.figure.my) {
      if (eq && eq.value !== null) out.push({ text: `${eq.label} 약 ${formatAmount(eq.value, eq.unit)}${eq.unit}`, color: CHALK.yellow });
      if (fig.figure.detail) out.push({ text: fig.figure.detail, color: CHALK.faint });
    } else {
      const my = ctx.mine?.[fig.figure.my];
      if (!my) return [];
      if (my.percent !== null) {
        out.push({ text: ownStandardText(my.percent, my.standard, my.standard !== null ? `${formatAmount(my.standard, my.unit)}${my.unit}` : null, standards), color: CHALK.white });
      }
      if (eq) out.push({ text: `${eq.label} 약 ${formatAmount(my.value / eq.per, eq.unit)}${eq.unit}`, color: CHALK.yellow });
      if (my.change) out.push({ text: my.change, color: CHALK.faint });
    }
    // 긴 덧말은 줄을 나눈다(보조 글 하한 아래로 줄이지 않는다).
    return out.flatMap((d) => wrapText(d.text, DETAIL_SIZE, W - 20).map((text) => ({ text, color: d.color })));
  };
  const details = scene.figures.map(detailsOf);
  const areaTop = head.bottom + 70;
  const areaBottom = note.h ? note.top - 30 : CHALK_AREA.noteBottom;
  const blockH = (areaBottom - areaTop) / n;
  const maxLines = Math.max(0, ...details.map((d) => d.length));
  const numSize = clamp(Math.round(Math.min(blockH - LABEL_H - maxLines * DETAIL_H - 54, blockH * 0.4)), 96, 220);
  const contentH = LABEL_H + numSize * 1.05 + maxLines * DETAIL_H;
  const pad = clamp((blockH - contentH) / 2, 0, 150);
  return (
    <ChalkBoard>
      <ChalkHeading ctx={ctx} title={scene.title} />
      {scene.figures.map((fig, i) => {
        const start = timing.start(i);
        const count = prog(f, start + 6, start + 60);
        const my = fig.figure.my ? (ctx.mine?.[fig.figure.my] ?? null) : null;
        const value = fig.figure.my ? (my?.value ?? null) : fig.figure.value;
        const unit = fig.figure.my ? (my?.unit ?? '') : fig.figure.unit;
        // 내 기록이 아닌 숫자가 비었으면(서버가 값을 못 구했다) 로그인 안내가 아니라 '값 없음'.
        const missing = !fig.figure.my ? '값 없음' : !ctx.loggedIn ? '로그인하면 내 값도 보여요' : ctx.mine === null ? null : '기록이 더 필요해요';
        const stamp = my?.statusLabel ? pop(f, start + 62, fps, { damping: 9, stiffness: 200 }) : 0;
        const stampColor = my?.over ? CHALK.pink : CHALK.green;
        return (
          <div key={i} style={{ position: 'absolute', left: X, top: areaTop + i * blockH + pad, width: W, opacity: f >= start ? 1 : 0 }}>
            <div style={{ height: LABEL_H, fontSize: 44, lineHeight: `${LABEL_H}px`, fontWeight: 700, color: CHALK.faint, whiteSpace: 'nowrap', ...writeOn(prog(f, start, start + 12)) }}>{fig.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 44, minHeight: Math.round(numSize * 1.05) }}>
              {value !== null ? (
                <ChalkNumber value={value} progress={count} unit={unit} size={numSize} unitEm={Math.max(0.42, TYPE.foot / numSize)} />
              ) : missing ? (
                <span style={{ padding: '18px 30px', border: `4px dashed ${CHALK.dim}`, borderRadius: 18, fontSize: 42, lineHeight: '54px', fontWeight: 700, color: CHALK.faint, opacity: prog(f, start + 6, start + 20) }}>{missing}</span>
              ) : null}
              {my?.statusLabel ? (
                <span
                  style={{
                    padding: '2px 26px 8px',
                    border: `6px solid ${stampColor}`,
                    borderRadius: 16,
                    boxShadow: `inset 0 0 0 5px ${CHALK.board}, inset 0 0 0 9px ${stampColor}`,
                    color: stampColor,
                    fontFamily: HAND,
                    fontWeight: 700,
                    fontSize: 68,
                    lineHeight: 1.2,
                    letterSpacing: '-0.05em',
                    whiteSpace: 'nowrap',
                    transform: `rotate(-8deg) scale(${lerp(2, 1, stamp)})`,
                    opacity: Math.min(1, stamp * 3),
                  }}
                >
                  {my.statusLabel}
                </span>
              ) : null}
            </div>
            <div style={{ opacity: prog(f, start + 48, start + 62) }}>
              {details[i]!.map((d, k) => (
                <div key={k} style={{ fontSize: DETAIL_SIZE, lineHeight: `${DETAIL_H}px`, fontWeight: 600, color: d.color, whiteSpace: 'nowrap' }}>
                  {d.text}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <ChalkSvg>
        {scene.figures.slice(1).map((_, i) => {
          const y = areaTop + (i + 1) * blockH - 4;
          return <path key={i} d={wobble(X, y, X + W, y - 3, 61 + i)} stroke={CHALK.dim} strokeWidth={4} fill="none" strokeLinecap="round" {...draw(prog(f, timing.start(i + 1) - 10, timing.start(i + 1) + 6))} />;
        })}
      </ChalkSvg>
      <ChalkNote layout={note} p={prog(f, timing.noteAt, timing.ready)} />
    </ChalkBoard>
  );
};
