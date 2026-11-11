import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { lerp, pop, prog, useClock } from './anim';
import { STAGE_BOTTOM, cardHeight, clamp, fitSize, headingBottom, ownStandardText, textWidth, wrapText } from './layout';
import { RollingNumber } from './RollingNumber';
import { PaperGrains, PaperSpill } from './paper/grains';
import { Card, Note, Paper, Sheet, type Mood } from './paper/kit';
import { PaperShaker, PaperSpoon } from './paper/props';
import { boil, tornEllipse, tornRect } from './paper/torn';
import { shakerPose, type Span } from './saltPose';
import { PaperHeading, PaperStage } from './Stage';
import { FONT, HAND, TYPE, formatAmount } from './theme';
import { SPOON, statTiming } from './timeline';
import type { ChapterContext } from './types';

type StatScene = Extract<MealStorySceneType, { type: 'stat' }>;
type Col = { x: number; y: number; s: number };

// 시간표(설계 프레임)는 timeline.ts 의 SPOON — 장면 길이 셈과 함께 쓴다.
const T = SPOON;
const SHAKER_DX = 120;
const SHAKER_DY = -450;
/** 일반 숫자 장면 — 숫자 아래 쪽지 줄 사이(쪽지 높이 68 + 틈). */
const DETAIL_PITCH = 74;

/** 숟가락 아래 숫자 쪽지(크림) + 이름 띠(남색) + 소금 쪽지(노랑) — 종이는 SVG, 숫자는 앱 글꼴(HTML). */
const CounterPaper = ({ col, label, chips, enter, chip, ctx, v }: { col: Col; label: string; chips: string[]; enter: number; chip: number; ctx: ChapterContext; v: number }) => {
  const { pal } = ctx;
  const s = col.s;
  const top = col.y + 440 * s;
  // 이름표·쪽지 글씨는 숟가락이 작아져도(s 0.8) 보조 글 하한(TYPE.sub) 아래로 내려가지 않는다.
  const labelSize = Math.max(TYPE.sub, 44 * s);
  const chipSize = Math.max(TYPE.sub, 44 * s);
  const lw = textWidth(label, labelSize) + 56 * s;
  const chipTop = (i: number) => top + 256 * s + i * 80 * s;
  return (
    <g opacity={Math.min(1, enter * 1.5)}>
      <g transform={`rotate(-1.5 ${col.x} ${top})`}>
        <Paper d={tornRect(Math.round(col.x - 235 * s), Math.round(top), Math.round(470 * s), Math.round(150 * s), { seed: 41 + v * 101, amp: 2.4, step: 6 })} fill={pal.paper} lift={0.9} />
      </g>
      <g transform={`rotate(1 ${col.x} ${top + 170 * s})`}>
        <Paper d={tornRect(Math.round(col.x - lw / 2), Math.round(top + 170 * s), Math.round(lw), Math.round(68 * s), { seed: 42 + v * 101, amp: 1.8, step: 6 })} fill={pal.navy} lift={0.6} />
        <text x={col.x} y={top + 170 * s + 48 * s} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={labelSize} fill="#ffffff">
          {label}
        </text>
      </g>
      {chips.map((c, i) => (
        <g key={c} transform={`translate(${col.x} ${chipTop(i)}) scale(${chip}) translate(${-col.x} ${-chipTop(i)})`}>
          <Note x={col.x} y={chipTop(i)} text={c} size={chipSize} fill={pal.yellow} color={pal.ink} angle={i % 2 === 0 ? -2 : 1.5} seed={43 + i + v * 101} padX={20 * s} padY={8 * s} />
        </g>
      ))}
    </g>
  );
};

/**
 * '하루 기준' — 소금통(얼굴)이 떨어져 숟가락에 소금을 붓고, 기준값(서버가 계산한 섭취기준)이 숫자 쪽지 위로 굴러 오른다.
 * 로그인했으면 '내 숟가락'이 내 평균만큼 차오르고, 기준을 넘으면 넘쳐 흐르며 숟가락이 땀을 흘리고 판정 도장이 찍힌다.
 * 로그인 전·기록 부족이면 점선 숟가락과 안내 쪽지.
 */
const SaltSpoonStat = ({ scene, ctx }: { scene: StatScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const refFig = scene.figures.find((x) => !x.figure.my && x.figure.value !== null)!;
  const myFig = scene.figures.find((x) => x.figure.my === 'sodium') ?? null;
  const mineValue = myFig ? (ctx.mine?.sodium ?? null) : null;
  const refMg = refFig.figure.value ?? 0;

  const shift = pop(f, T.shift, fps, { damping: 15, stiffness: 110 });
  const bob = f > T.shift ? Math.sin(f / 13) * 5 : 0;
  const enterA = pop(f, T.enterA, fps, { damping: 12, stiffness: 120 });
  const colA: Col = { x: lerp(540, 290, shift), y: lerp(1060, 1080, shift) + (1 - enterA) * 1000 + bob, s: lerp(1, 0.8, shift) };
  const enterB = pop(f, T.enterB, fps, { damping: 13, stiffness: 110 });
  const colB: Col = { x: lerp(1450, 770, enterB), y: 1080 - bob, s: 0.8 };

  const pA = prog(f, T.fillA[0], T.fillA[1]);
  // 내 숟가락이 차는 비율 — 통계가 준 '기준 대비 %'(내 나이·성별의 기준)를 그대로 쓴다. 숟가락·'기준의 N%'·판정 도장이 같은
  // 기준을 본다(원고의 성인 기준으로 채우면 65세 이상은 숟가락이 안 넘치는데 '많음'이 찍혔다). % 가 없을 때만 원고 기준으로.
  const ratio = mineValue ? (mineValue.percent !== null ? mineValue.percent / 100 : mineValue.value / Math.max(1, refMg)) : 0;
  // 다른 단위로 본 값(소금) — 기준 숫자는 서버가 환산한 값, 내 값은 서버가 준 식(÷ per)으로. 화면이 환산 비율을 갖고 있지 않다.
  const refEq = refFig.figure.equivalent;
  const myEq = myFig?.figure.equivalent ?? null;
  const eqChip = (label: string, value: number, unit: string) => `${label} 약 ${formatAmount(value, unit)}${unit}`;
  const refChips = refEq && refEq.value !== null ? [eqChip(refEq.label, refEq.value, refEq.unit)] : [];
  const amountText = (value: number, unit: string) => `${formatAmount(value, unit)}${unit}`;
  const myChips = mineValue
    ? [
        ...(myEq ? [eqChip(myEq.label, mineValue.value / myEq.per, myEq.unit)] : []),
        // 내 기준이 원고의 기준 숫자와 다르면(나이가 달라서) 어느 기준인지 밝힌다(ownStandardText — 글로 보기와 같은 규칙).
        ...(mineValue.percent !== null
          ? [ownStandardText(mineValue.percent, mineValue.standard, mineValue.standard !== null ? amountText(mineValue.standard, mineValue.unit) : null, [refMg])]
          : []),
        // 직전 2주보다 달라진 정도 — 웹이 통계 탭과 같은 규칙으로 만든 한 줄(10% 넘게 달라졌을 때만 온다).
        ...(mineValue.change ? [mineValue.change] : []),
      ]
    : [];
  // 기준 숫자의 덧말(나이별 기준) — 내 값 칸이 있으면 기준 쪽 칸의 쪽지 아래에 줄을 나눠 붙인다(내 쪽 칸은 쪽지가 셋까지
  // 내려와 무대 아래 가운데 자리를 쓴다). 기준 숫자만 있는 장면은 예전처럼 아래 가운데 한 줄.
  const detailLines = myFig && refFig.figure.detail ? refFig.figure.detail.split(' · ') : [];
  const detailSize = Math.min(TYPE.sub, ...detailLines.map((l) => fitSize(l, TYPE.sub, 400, TYPE.foot)));
  const detailTop = colA.y + (440 + 256 + refChips.length * 80) * colA.s + 4;
  const pB = prog(f, T.fillB[0], T.fillB[1]);
  let overFrom = Infinity;
  if (mineValue && ratio > 1) {
    for (let g = T.fillB[0]; g <= T.fillB[1]; g += 1) {
      if (ratio * prog(g, T.fillB[0], T.fillB[1]) >= 1) {
        overFrom = g;
        break;
      }
    }
  }
  const moodA: Mood = pA < 1 ? 'wow' : 'calm';
  const moodB: Mood = f >= overFrom ? 'worried' : pB < 1 ? 'wow' : 'happy';
  const stamp = mineValue?.statusLabel ? pop(f, T.stamp, fps, { damping: 9, stiffness: 210 }) : 0;
  const shake = mineValue?.statusLabel && f >= T.stamp ? 18 * Math.exp(-(f - T.stamp) / 5) * Math.sin((f - T.stamp) * 2.7) : 0;
  const shakerAt = (col: Col) => ({ x: col.x + SHAKER_DX * col.s, y: col.y + SHAKER_DY * col.s, s: col.s });
  const shakerTransform = (col: Col, timing: { drop: number; tilt: Span; pour: Span }) => {
    const pose = shakerPose(f, fps, shakerAt(col), timing);
    return `translate(${pose.cx} ${pose.cy}) rotate(${pose.angle}) scale(${col.s})`;
  };
  const chipA = pop(f, T.saltA, fps, { damping: 10, stiffness: 180 });
  const chipB = pop(f, T.extraB, fps, { damping: 10, stiffness: 180 });
  const ghost = prog(f, T.enterB + 6, T.enterB + 30);
  const detail = prog(f, T.detail, T.detail + 18);
  // 로그인했지만 아직 내 값을 받는 중(mine null)이면 아무 말도 하지 않는다 — 받고 보니 기록이 모자랄 때만 안내.
  const hint = !myFig ? null : !ctx.loggedIn ? '로그인하면 내 숟가락도 채워 봐요' : ctx.mine === null || mineValue ? null : '기록이 더 필요해요 — 두 끼 이상 적은 날이 있어야 해요';
  const label = mineValue?.statusLabel ?? '';
  const stampW = Math.max(210, textWidth(label, 84) + 70);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={scene.title} />
      {/* 장면 덧말 — 첫 소금통이 빠진 뒤 제목 띠 아래(바탕 위) */}
      {scene.note ? (
        <div
          style={{
            position: 'absolute',
            left: 70,
            width: 940,
            top: headingBottom(scene.title) + 14 + (1 - prog(f, T.note[0], T.note[1])) * 24,
            opacity: prog(f, T.note[0], T.note[1]),
            fontFamily: FONT,
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.4,
            color: pal.onBgFaint,
            wordBreak: 'keep-all',
          }}
        >
          {scene.note}
        </div>
      ) : null}
      <AbsoluteFill style={{ transform: `translateX(${shake}px)` }}>
        <PaperStage ctx={ctx} decor={['clock', 'bowl']} />
        <Sheet>
          <g transform={`translate(${colA.x} ${colA.y}) scale(${colA.s})`}>
            <PaperSpoon pal={pal} f={f} v={v} fill={pA} mood={moodA} seed={11} />
          </g>
          <PaperGrains f={f} fps={fps} at={shakerAt(colA)} timing={T.shakerA} land={(i) => colA.y - 30 * colA.s + (i % 5) * 8 * colA.s} count={64} seed={101} pal={pal} />
          <g transform={shakerTransform(colA, T.shakerA)}>
            <PaperShaker pal={pal} f={f} v={v} />
          </g>
          {myFig && mineValue ? (
            <>
              <g transform={`translate(${colB.x} ${colB.y}) scale(${colB.s})`}>
                <PaperSpoon pal={pal} f={f} v={v} fill={ratio * pB} mood={moodB} seed={37} />
              </g>
              <PaperGrains f={f} fps={fps} at={shakerAt(colB)} timing={T.shakerB} land={(i) => colB.y - 30 * colB.s + (i % 5) * 8 * colB.s} count={Math.round(64 * Math.min(ratio, 1.8))} seed={303} pal={pal} />
              {ratio > 1 ? <PaperSpill f={f} fps={fps} at={colB} from={overFrom} to={T.fillB[1] + 10} count={Math.round(10 + 26 * Math.min(ratio - 1, 1))} seed={505} pal={pal} /> : null}
              <g transform={shakerTransform(colB, T.shakerB)}>
                <PaperShaker pal={pal} f={f} v={v} />
              </g>
            </>
          ) : myFig ? (
            <g transform={`translate(${colB.x} ${colB.y}) scale(${colB.s})`} opacity={ghost}>
              <PaperSpoon pal={pal} f={f} v={v} fill={0} mood="calm" seed={0} ghost />
            </g>
          ) : null}

          <CounterPaper col={colA} label={refFig.label} chips={refChips} enter={enterA} chip={chipA} ctx={ctx} v={v} />
          {myFig && mineValue ? (
            <CounterPaper
              col={colB}
              label={myFig.label}
              chips={myChips}
              enter={enterB}
              chip={chipB}
              ctx={ctx}
              v={v}
            />
          ) : null}
          {hint ? (
            <g opacity={ghost}>
              <Card x={colB.x} y={colB.y + 440 * colB.s} lines={wrapText(hint, 34, 360)} size={34} fill={pal.paper} color={pal.ink} angle={1.5} seed={51 + v * 101} />
            </g>
          ) : null}
          {mineValue?.statusLabel ? (
            <g transform={`translate(${colB.x + 96} ${colB.y - 300}) rotate(-12) scale(${lerp(2.4, 1, stamp)})`} opacity={Math.min(1, stamp * 3)}>
              <Paper d={tornEllipse(0, 0, Math.round(stampW / 2), 96, { seed: 61 + v * 101, amp: 3, step: 7 })} fill={mineValue.over ? pal.red : pal.navy} lift={1.4} />
              <ellipse cx={0} cy={0} rx={stampW / 2 - 18} ry={78} fill="none" stroke="#ffffff" strokeWidth={6} strokeDasharray="14 10" />
              <text x={0} y={30} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={84} letterSpacing={-5} fill="#ffffff">
                {label}
              </text>
            </g>
          ) : null}
          {detailLines.length ? (
            <g opacity={detail} transform={`translate(0 ${(1 - detail) * 40})`}>
              <Card x={colA.x} y={detailTop} lines={detailLines} size={detailSize} fill={pal.paper} color={pal.ink} padX={22} padY={14} angle={0.8} seed={71 + v * 101} />
            </g>
          ) : refFig.figure.detail ? (
            <g opacity={detail} transform={`translate(0 ${(1 - detail) * 40})`}>
              <Note x={540} y={1774} text={refFig.figure.detail} size={fitSize(refFig.figure.detail, TYPE.sub, 900, TYPE.foot)} fill={pal.paper} color={pal.ink} weight={700} angle={0.8} seed={71 + v * 101} />
            </g>
          ) : null}
        </Sheet>

        <div style={{ position: 'absolute', left: colA.x, top: colA.y + 452 * colA.s, width: 'max-content', transform: 'translateX(-50%) rotate(-1.5deg)', opacity: Math.min(1, enterA * 1.5) }}>
          <RollingNumber target={refMg} progress={pA} size={116 * colA.s} color={pal.ink} unit="mg" />
        </div>
        {myFig && mineValue ? (
          <div style={{ position: 'absolute', left: colB.x, top: colB.y + 452 * colB.s, width: 'max-content', transform: 'translateX(-50%) rotate(-1.5deg)', opacity: Math.min(1, enterB * 1.5) }}>
            <RollingNumber target={mineValue.value} progress={pB} size={116 * colB.s} color={pal.ink} unit="mg" />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * 일반 큰 숫자 — 숫자마다 쪽지가 날아와 붙고 숫자가 굴러 오른다. 내 기록 값은 로그인했을 때만 — 그 아래 노란 쪽지에 내
 * 기준(나이·성별의 섭취기준) 대비 % 와 판정을 밝힌다(기준 숫자가 남·여 둘로 나뉜 장면에서 내가 어느 쪽인지 알 수 있게).
 * 자리는 숫자 수(1~3)와 아래 덧말 높이로 나눈다 — 셋이고 값 덧말·장면 덧말이 다 있어도 서로 겹치지 않게 숫자 종이를 줄인다.
 */
const PlainStat = ({ scene, ctx }: { scene: StatScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const timing = statTiming(scene.figures.length);
  const note = prog(f, timing.noteAt, timing.ready);
  const noteLines = scene.note ? wrapText(scene.note, TYPE.sub, 820) : [];
  const noteTop = STAGE_BOTTOM - cardHeight(noteLines.length, TYPE.sub);
  const n = Math.max(1, scene.figures.length);
  const standards = scene.figures.flatMap((x) => (!x.figure.my && x.figure.value !== null ? [x.figure.value] : []));
  // 숫자 아래 쪽지 줄 — 기준 숫자는 서버의 덧말 한 줄, 내 값은 내 기준 대비 %·판정과 직전 2주 대비 변화(있을 때만).
  const detailsOf = (fig: StatScene['figures'][number]): string[] => {
    if (!fig.figure.my) return fig.figure.detail ? [fig.figure.detail] : [];
    const my = ctx.mine?.[fig.figure.my];
    if (!my) return [];
    const lines: string[] = [];
    if (my.percent !== null) {
      const ratio = ownStandardText(my.percent, my.standard, my.standard !== null ? `${formatAmount(my.standard, my.unit)}${my.unit}` : null, standards);
      lines.push(my.statusLabel ? `${ratio} · ${my.statusLabel}` : ratio);
    }
    if (my.change) lines.push(my.change);
    return lines;
  };
  const details = scene.figures.map(detailsOf);
  // 쪽지 줄이 차지하는 높이 — 첫 줄은 숫자 종이와의 틈까지 82, 다음 줄부터 74.
  const detailH = (lines: number): number => (lines === 0 ? 0 : 82 + (lines - 1) * DETAIL_PITCH);
  const areaTop = 740;
  const areaBottom = noteLines.length ? noteTop - 36 : 1800;
  // 한 덩이 = 이름표(76) + 숫자 종이 + 쪽지 줄(덩이마다 다르다) + 덩이 사이 틈(34). 숫자 종이는 남는 높이를 똑같이 나눈다.
  const fixed = details.reduce((sum, d) => sum + 110 + detailH(d.length), 0);
  const paperH = clamp((areaBottom - areaTop - fixed) / n, 120, 190);
  const numSize = Math.round(paperH * 0.68);
  const blocks = details.map((d) => 110 + paperH + detailH(d.length));
  const first = areaTop + Math.max(0, (areaBottom - areaTop - blocks.reduce((sum, b) => sum + b, 0)) / 2) + 70;
  const tops = blocks.map((_, i) => first + blocks.slice(0, i).reduce((sum, b) => sum + b, 0));
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={scene.title} />
      <PaperStage ctx={ctx} table={null} decor={['clock']} />
      {scene.figures.map((fig, i) => {
        const start = timing.start(i);
        const p = pop(f, start, fps, { damping: 13, stiffness: 120 });
        const count = prog(f, start + 6, start + 60);
        const top = tops[i]!;
        const my = fig.figure.my ? (ctx.mine?.[fig.figure.my] ?? null) : null;
        const value = fig.figure.my ? (my?.value ?? null) : fig.figure.value;
        const unit = fig.figure.my ? (my?.unit ?? '') : fig.figure.unit;
        // 내 기록이 아닌 숫자가 비었으면(서버가 값을 못 구했다) 로그인 안내가 아니라 '값 없음'.
        const missing = !fig.figure.my ? '값 없음' : !ctx.loggedIn ? '로그인하면 내 값도 보여요' : ctx.mine === null ? null : '기록이 더 필요해요';
        return (
          <AbsoluteFill key={i} style={{ transform: `translateY(${(1 - p) * 140}px) rotate(${(1 - p) * (i % 2 ? 4 : -4)}deg)`, opacity: Math.min(1, p * 1.5) }}>
            <Sheet>
              <Note x={540} y={top - 70} text={fig.label} size={40} fill={pal.navy} color="#ffffff" weight={700} angle={i % 2 ? 1.5 : -1.5} seed={81 + i + v * 101} />
              <Paper d={tornRect(170, Math.round(top), 740, Math.round(paperH), { seed: 91 + i + v * 101, amp: 2.6, step: 7 })} fill={pal.paper} lift={1} />
              {details[i]!.map((line, k) => (
                <Note key={k} x={540} y={top + paperH + 10 + k * DETAIL_PITCH} text={line} size={fitSize(line, TYPE.sub, 900, TYPE.foot)} fill={pal.yellow} color={pal.ink} weight={700} angle={k % 2 ? 0.8 : 0} seed={95 + i + k * 7 + v * 101} />
              ))}
            </Sheet>
            {value !== null ? (
              <div style={{ position: 'absolute', left: 540, top: top + (paperH - numSize) / 2 - 4, width: 'max-content', transform: 'translateX(-50%)' }}>
                <RollingNumber target={value} progress={count} size={numSize} color={pal.ink} unit={unit} />
              </div>
            ) : missing ? (
              <div style={{ position: 'absolute', left: 170, width: 740, top: top + (paperH - 52) / 2, textAlign: 'center', fontFamily: FONT, fontSize: 42, lineHeight: '52px', fontWeight: 700, color: pal.ink }}>{missing}</div>
            ) : null}
          </AbsoluteFill>
        );
      })}
      {noteLines.length ? (
        <Sheet>
          <g opacity={note} transform={`translate(0 ${(1 - note) * 30})`}>
            <Card x={540} y={noteTop} lines={noteLines} size={TYPE.sub} fill={pal.paper} color={pal.ink} seed={99 + v * 101} />
          </g>
        </Sheet>
      ) : null}
    </AbsoluteFill>
  );
};

export const ChapterStat = ({ scene, ctx, saltSpoon }: { scene: StatScene; ctx: ChapterContext; saltSpoon: boolean }) =>
  saltSpoon ? <SaltSpoonStat scene={scene} ctx={ctx} /> : <PlainStat scene={scene} ctx={ctx} />;
