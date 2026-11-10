import type { CSSProperties } from 'react';
import { useVideoConfig } from 'remotion';
import { pop, useClock } from './anim';
import { titleLines } from './layout';
import { FONT } from './theme';

// 낱말마다 아래에서 튀어 오르는 제목(가림막 안에서 솟는다) — 키네틱 타이포.
export const KineticTitle = ({
  text,
  start,
  size,
  color,
  stagger = 3,
  style,
  font = FONT,
  weight = 800,
  tracking = '-0.045em',
}: {
  text: string;
  start: number;
  size: number;
  color: string;
  stagger?: number;
  style?: CSSProperties;
  font?: string;
  weight?: number;
  tracking?: string;
}) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const width = typeof style?.width === 'number' ? style.width : 952;
  const lines = titleLines(text, size, width);
  // 줄마다 첫 낱말의 차례(낱말 차례대로 솟는다).
  const lineStart = lines.map((_, li) => lines.slice(0, li).reduce((s, l) => s + l.length, 0));
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: size * 0.02,
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: tracking,
        color,
        ...style,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ display: 'flex', columnGap: size * 0.26, justifyContent: style?.justifyContent ?? 'flex-start' }}>
          {line.map((w, wi) => {
            const i = lineStart[li]! + wi;
            const p = pop(f, start + i * stagger, fps, { damping: 13, stiffness: 170 });
            return (
              <span key={i} style={{ display: 'inline-block', flexShrink: 0, overflow: 'hidden', paddingBottom: '0.1em', marginBottom: '-0.1em' }}>
                <span
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    transform: `translateY(${(1 - p) * 115}%) rotate(${(1 - p) * 9}deg)`,
                    transformOrigin: '0% 100%',
                  }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
