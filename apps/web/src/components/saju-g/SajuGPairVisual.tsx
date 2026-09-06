import { useId, useState, type CSSProperties } from 'react';
import type { PublicSajuGShareType } from '@repo/api-contract';
import { SAJU_G_ELEMENTS, SAJU_G_ELEMENT_META } from '@repo/utils';
import { SajuGSymbol } from './SajuGVisual';

type Person = Pick<PublicSajuGShareType, 'element' | 'symbol' | 'elements' | 'unknownCharacters'>;
export function SajuGPairVisual({
  first,
  second,
  compact = false,
}: {
  first?: Person;
  second?: Person;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [active, setActive] = useState<string | null>(null);
  const a = first?.element ? SAJU_G_ELEMENT_META[first.element].color : '#a7cbb9';
  const b = second?.element ? SAJU_G_ELEMENT_META[second.element].color : '#d1b680';
  return (
    <figure
      className={`saju-g-pair-visual${compact ? ' compact' : ''}`}
      style={{ '--pair-a': a, '--pair-b': b } as CSSProperties}
    >
      <div
        className="saju-g-pair-universe"
        aria-label="두 사람의 오행 지도가 빛으로 연결되는 그림"
        role="img"
      >
        <svg className="saju-g-pair-bridge" viewBox="0 0 700 300" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-bridge`}>
              <stop stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
          </defs>
          <path
            className="saju-g-bridge-base"
            d="M160 150C240 15 460 285 540 150C460 15 240 285 160 150Z"
            stroke={`url(#${id}-bridge)`}
          />
          <path
            className="saju-g-bridge-light"
            d="M160 150C240 15 460 285 540 150C460 15 240 285 160 150Z"
            stroke={`url(#${id}-bridge)`}
          />
          {[65, 125, 210, 305, 395, 490, 575, 635].map((x, i) => (
            <circle
              key={x}
              className="saju-g-pair-star"
              cx={x}
              cy={i % 2 ? 245 - i * 3 : 40 + i * 5}
              r={i % 3 === 0 ? 2 : 1}
              fill={i % 2 ? a : b}
              style={{ animationDelay: `${i * 0.4}s` }}
            />
          ))}
        </svg>
        {[first, second].map((person, i) => (
          <div className={`saju-g-pair-orbit orbit-${i}`} key={i}>
            <div className="saju-g-pair-orbit-ring" />
            <div className="saju-g-pair-orbit-inner" />
            <SajuGSymbol element={person?.element ?? null} className="saju-g-pair-center" />
            <span className="saju-g-pair-symbol">
              {person?.symbol ?? (i ? '너의 시작' : '나의 시작')}
            </span>
            {SAJU_G_ELEMENTS.map((e, j) => (
              <span
                className={`saju-g-pair-node${active === e ? ' active' : ''}`}
                key={e}
                style={
                  {
                    left: `${50 + 50 * Math.cos(((j * 72 - 90) * Math.PI) / 180)}%`,
                    top: `${50 + 50 * Math.sin(((j * 72 - 90) * Math.PI) / 180)}%`,
                    '--node-color': SAJU_G_ELEMENT_META[e].color,
                  } as CSSProperties
                }
              >
                {SAJU_G_ELEMENT_META[e].name}
              </span>
            ))}
          </div>
        ))}
        <span className="saju-g-pair-center-star">✦</span>
      </div>
      {first && second && (
        <figcaption>
          <div className="saju-g-pair-element-keys" aria-label="두 사람의 오행 구성">
            {SAJU_G_ELEMENTS.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={active === e}
                onClick={() => setActive(active === e ? null : e)}
                style={{ color: SAJU_G_ELEMENT_META[e].color }}
              >
                <span>{SAJU_G_ELEMENT_META[e].name}</span>
                <small>
                  {first.elements.find((v) => v.element === e)?.count ?? 0} <i>·</i>{' '}
                  {second.elements.find((v) => v.element === e)?.count ?? 0}
                </small>
              </button>
            ))}
          </div>
          <p>
            {active
              ? `${SAJU_G_ELEMENT_META[active as keyof typeof SAJU_G_ELEMENT_META].meaning}의 상징 · `
              : ''}
            첫 번째 {8 - first.unknownCharacters}글자 · 두 번째 {8 - second.unknownCharacters}글자
            기준
          </p>
        </figcaption>
      )}
    </figure>
  );
}
