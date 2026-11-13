import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { prog, useClock } from '../anim';
import { FONT, HAND, amountDecimals } from '../theme';
import type { ChapterContext } from '../types';
import { CHALK, CHALK_AREA, CHALK_NOTE, chalkHeading, clamp01, draw, handWidth, wobble, writeOn, type ChalkNoteLayout } from './chalkLayout';

// 칠판 메뉴판 그림체(2026-11-13) — 원고가 look: "chalk" 를 고른 편의 영상. 식당 칠판에 분필로 쓴 메뉴판: 나무 테 안의 짙은
// 칠판, 손글씨(개구) 제목·메뉴 이름·숫자, 분필 빗금으로 칠한 막대, 노란 분필 동그라미. 종이 오리기(paper/)와 장면 시각표
// (timeline.ts)는 같이 쓰고 그림만 다르다 — 표지·큰 숫자·막대·줄 세우기·목록·마무리 여섯 장면(index.tsx).
// 색·자리·선 계산은 chalkLayout.ts(컴포넌트 없는 파일). 글·선은 모두 프레임에서 계산한다. 분필 결은 정적인 무늬 한 장(휴대폰에서 매 프레임 필터를 돌리지 않는다).

// 분필 결 — 칠판 색 점을 글·선 위에 덮어 분필이 군데군데 끊겨 보이게.
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0.133 0 0 0 0 0.188 0 0 0 0 0.169 5 0 0 0 -2.5'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

export const ChalkSvg = ({ children }: { children: ReactNode }) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
    {children}
  </svg>
);

/** 칠판 한 장 — 나무 테, 지우개 자국·분필 가루, 내용, 분필 결, 분필 받침(분필 셋과 지우개). */
export const ChalkBoard = ({ children }: { children?: ReactNode }) => (
  <AbsoluteFill data-look="chalk" style={{ backgroundColor: CHALK.wood, fontFamily: FONT, color: CHALK.white, overflow: 'hidden' }}>
    <ChalkSvg>
      <defs>
        <radialGradient id="chalk-dust">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.085} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>
      {[9, 20].map((o) => (
        <rect key={o} x={o} y={o} width={1080 - o * 2} height={1920 - o * 2} fill="none" stroke={CHALK.woodDeep} strokeWidth={2} opacity={0.5} />
      ))}
      <rect x={30} y={30} width={1020} height={1860} rx={8} fill={CHALK.woodDeep} />
      <rect x={38} y={38} width={1004} height={1844} rx={6} fill={CHALK.board} />
      <path d="M 130 980 L 930 900" stroke="#ffffff" strokeOpacity={0.022} strokeWidth={150} strokeLinecap="round" />
      <path d="M 200 1500 L 880 1560" stroke="#ffffff" strokeOpacity={0.02} strokeWidth={120} strokeLinecap="round" />
      <ellipse cx={300} cy={480} rx={430} ry={270} fill="url(#chalk-dust)" />
      <ellipse cx={800} cy={1220} rx={390} ry={310} fill="url(#chalk-dust)" />
      <ellipse cx={400} cy={1680} rx={420} ry={200} fill="url(#chalk-dust)" />
    </ChalkSvg>
    {children}
    <div style={{ position: 'absolute', left: 38, top: 38, width: 1004, height: 1844, backgroundImage: GRAIN, backgroundSize: '320px 320px', opacity: 0.62, pointerEvents: 'none' }} />
    <ChalkSvg>
      <rect x={38} y={1808} width={1004} height={30} fill={CHALK.wood} />
      <rect x={38} y={1838} width={1004} height={12} fill={CHALK.woodDeep} />
      <rect x={120} y={1790} width={92} height={18} rx={6} fill={CHALK.white} />
      <rect x={226} y={1790} width={70} height={18} rx={6} fill={CHALK.yellow} transform="rotate(-4 261 1799)" />
      <rect x={312} y={1790} width={56} height={18} rx={6} fill={CHALK.pink} />
      <rect x={820} y={1764} width={150} height={22} rx={5} fill={CHALK.woodDeep} />
      <rect x={820} y={1784} width={150} height={24} rx={4} fill="#3a3f47" />
    </ChalkSvg>
  </AbsoluteFill>
);

/** 머리말 쪽지 — 노란 분필로 두른 손글씨. */
export const ChalkTag = ({ text, x, y, p, center = false }: { text: string; x: number; y: number; p: number; center?: boolean }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `${center ? 'translateX(-50%) ' : ''}rotate(-2deg)`,
      padding: '6px 26px 10px',
      border: `5px solid ${CHALK.yellow}`,
      borderRadius: '18px 22px 16px 24px / 20px 16px 24px 18px',
      color: CHALK.yellow,
      fontFamily: HAND,
      fontWeight: 700,
      fontSize: 46,
      lineHeight: 1.2,
      letterSpacing: '-0.04em',
      whiteSpace: 'nowrap',
      opacity: clamp01(p),
    }}
  >
    {text}
  </div>
);

/** 장면 머리 — 머리말 쪽지, 줄마다 써지는 손글씨 제목, 노란 밑줄 둘. */
export const ChalkHeading = ({ ctx, title }: { ctx: ChapterContext; title: string }) => {
  const f = useClock();
  const h = chalkHeading(title);
  const underline = Math.min(900, handWidth(h.lines[h.lines.length - 1] ?? '', h.size) + 20);
  const done = 12 + h.lines.length * 10;
  return (
    <>
      <ChalkTag text={ctx.kicker} x={CHALK_AREA.left - 4} y={CHALK_AREA.tagTop} p={prog(f, 2, 12)} />
      <div style={{ position: 'absolute', left: CHALK_AREA.left - 4, top: CHALK_AREA.headTop, width: 940, fontFamily: HAND, fontWeight: 700, fontSize: h.size, lineHeight: `${h.lineH}px`, letterSpacing: '-0.05em' }}>
        {h.lines.map((l, i) => (
          <div key={i} style={{ ...writeOn(prog(f, 8 + i * 10, 22 + i * 10)), whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
      <ChalkSvg>
        <path d={wobble(72, h.bottom + 10, 72 + underline, h.bottom + 4, 3)} stroke={CHALK.yellow} strokeWidth={7} fill="none" strokeLinecap="round" {...draw(prog(f, done, done + 12))} />
        <path d={wobble(78, h.bottom + 26, 72 + underline * 0.62, h.bottom + 22, 5)} stroke={CHALK.yellow} strokeWidth={5} fill="none" strokeLinecap="round" {...draw(prog(f, done + 6, done + 16))} />
      </ChalkSvg>
    </>
  );
};

export const ChalkNote = ({ layout, p }: { layout: ChalkNoteLayout; p: number }) =>
  layout.h > 0 ? (
    <div style={{ position: 'absolute', left: 90, top: layout.top, width: 900, textAlign: 'center', fontWeight: 600, opacity: clamp01(p) }}>
      {layout.noteLines.map((l, i) => (
        <div key={i} style={{ fontSize: CHALK_NOTE.size, lineHeight: `${CHALK_NOTE.lineH}px`, color: 'rgba(243,240,228,0.9)' }}>
          {l}
        </div>
      ))}
      {layout.footLines.map((l, i) => (
        <div key={i} style={{ marginTop: i === 0 && layout.noteLines.length ? 10 : 0, fontSize: CHALK_NOTE.footSize, lineHeight: `${CHALK_NOTE.footLineH}px`, color: CHALK.faint }}>
          {l}
        </div>
      ))}
    </div>
  ) : null;

/** 분필로 쓴 숫자 — 0 에서 끝 값까지 세어 오른다(끝에서는 서버가 준 값 그대로). 단위는 작게. */
export const ChalkNumber = ({ value, progress, unit, size, color = CHALK.white, unitEm = 0.56 }: { value: number; progress: number; unit: string; size: number; color?: string; unitEm?: number }) => {
  const decimals = amountDecimals(value, unit);
  const scale = 10 ** decimals;
  const shown = progress >= 1 ? value : Math.floor(value * clamp01(progress) * scale) / scale;
  return (
    <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: '-0.03em', color, whiteSpace: 'nowrap' }}>
      {shown.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      <span style={{ fontSize: `${unitEm}em`, marginLeft: '0.06em' }}>{unit}</span>
    </span>
  );
};

/** 김 나는 그릇(선 그림) — 표지와 마무리의 꾸밈. 그릇 가운데가 (540, 1456) 인 자리에 그린다(부르는 쪽이 옮기고 줄인다). */
export const ChalkBowl = ({ f, p, salt = false }: { f: number; p: number; salt?: boolean }) => {
  const sway = (i: number) => Math.sin(f / 12 + i * 1.7) * 7;
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {[440, 540, 640].map((x, i) => (
        <path key={x} d={`M ${x} 1384 C ${x - 26 + sway(i)} 1352, ${x + 26 + sway(i)} 1320, ${x + sway(i) * 0.5} 1288 C ${x - 26} 1256, ${x + 26} 1226, ${x} 1196`} stroke={CHALK.faint} strokeWidth={7} opacity={clamp01(p)} />
      ))}
      <ellipse cx={540} cy={1456} rx={232} ry={46} stroke={CHALK.white} strokeWidth={8} {...draw(p)} />
      <path d="M 308 1456 C 318 1612, 438 1672, 540 1672 C 642 1672, 762 1612, 772 1456" stroke={CHALK.white} strokeWidth={8} {...draw(p)} />
      <path d="M 468 1674 L 480 1704 L 600 1704 L 612 1674" stroke={CHALK.white} strokeWidth={8} {...draw(p)} />
      <path d="M 372 1452 C 412 1426, 452 1478, 492 1452 C 532 1426, 572 1478, 612 1452 C 644 1432, 676 1466, 704 1452" stroke={CHALK.yellow} strokeWidth={7} {...draw(p)} />
      <path d="M 650 1436 L 872 1238 M 684 1452 L 902 1262" stroke={CHALK.white} strokeWidth={8} {...draw(p)} />
      {salt ? (
        <>
          <g transform="rotate(38 236 1300)" opacity={clamp01(p)}>
            <rect x={196} y={1250} width={80} height={104} rx={16} stroke={CHALK.white} strokeWidth={7} />
            <path d="M 204 1250 C 204 1216, 268 1216, 268 1250" stroke={CHALK.white} strokeWidth={7} />
          </g>
          {[
            [318, 1300],
            [336, 1340],
            [362, 1322],
            [372, 1376],
            [398, 1356],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={(y ?? 0) + ((f * 2 + i * 9) % 34)} r={5} fill={CHALK.yellow} opacity={clamp01(p)} />
          ))}
        </>
      ) : null}
    </g>
  );
};

/** 분필 별 하나. */
export const ChalkStar = ({ x, y, color, p }: { x: number; y: number; color: string; p: number }) => (
  <path
    d={`M ${x - 16} ${y} L ${x + 16} ${y} M ${x} ${y - 16} L ${x} ${y + 16} M ${x - 11} ${y - 11} L ${x + 11} ${y + 11} M ${x - 11} ${y + 11} L ${x + 11} ${y - 11}`}
    stroke={color}
    strokeWidth={6}
    strokeLinecap="round"
    opacity={clamp01(p)}
  />
);
