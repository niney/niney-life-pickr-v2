import { odometerPosition } from './layout';
import { FONT, amountDecimals } from './theme';

// 주행계처럼 굴러가는 숫자 — 일의 자리는 계속 돌고, 윗자리는 아랫자리가 9 → 0 으로 넘어갈 때만 한 칸 굴러간다.
// 끝 값에 닿으면 모든 자리가 정확히 그 숫자에 선다. 아직 오지 않은 윗자리(앞의 0)는 흐리게.
// 소수 한 자리(10g 미만의 g — 글 장면과 같은 규칙)는 10배 해 정수로 센다(9.9g 이 띠 사이 '0' 으로 서던 것).

const STRIP = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const RollingNumber = ({
  target,
  progress = 1,
  size,
  color,
  unit,
  unitScale = 0.42,
}: {
  /** 끝 값(서버가 준 값). */
  target: number;
  /** 0 → 1 로 굴러 오른다. */
  progress?: number;
  size: number;
  color: string;
  unit: string;
  unitScale?: number;
}) => {
  const decimals = amountDecimals(target, unit);
  const scale = 10 ** decimals;
  const end = Math.round(Math.max(0, target) * scale);
  const value = end * Math.min(1, Math.max(0, progress));
  const intDigits = String(Math.floor(end / scale)).length;
  const columns: { k: number; comma: boolean; point: boolean }[] = [];
  for (let k = intDigits + decimals - 1; k >= 0; k -= 1) {
    const place = k - decimals; // 정수 자리 번호(0 = 일의 자리, 음수 = 소수)
    columns.push({ k, comma: place % 3 === 0 && place > 0, point: place === 0 && decimals > 0 });
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.04em',
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {columns.map(({ k, comma, point }) => {
        const pos = odometerPosition(value, k);
        const reached = k <= decimals || value >= 10 ** k;
        return (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
            <span style={{ display: 'inline-block', height: '1em', overflow: 'hidden', opacity: reached ? 1 : 0.22 }}>
              <span style={{ display: 'flex', flexDirection: 'column', transform: `translateY(${-pos}em)` }}>
                {STRIP.map((d, i) => (
                  <span key={i} style={{ height: '1em', lineHeight: 1 }}>
                    {d}
                  </span>
                ))}
              </span>
            </span>
            {comma ? <span style={{ opacity: reached ? 1 : 0.22 }}>,</span> : null}
            {point ? <span>.</span> : null}
          </span>
        );
      })}
      <span style={{ fontSize: `${unitScale}em`, fontWeight: 700, letterSpacing: 0, marginLeft: '0.08em' }}>{unit}</span>
    </div>
  );
};
