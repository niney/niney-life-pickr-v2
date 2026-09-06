import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SajuGChartType } from '@repo/api-contract';
import { SAJU_G_ELEMENT_META, type SajuGElementId } from '@repo/utils';
import { detectTarotRender } from '../tarot/tarotQuality';
const Stage = lazy(() => import('./SajuGStage'));

class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function SajuGSymbol({
  element,
  className = '',
}: {
  element: SajuGElementId | null;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 180"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(!element || element === 'wood') && (
        <>
          <path d="M100 154V39M100 70C69 74 54 53 52 35c27 0 49 8 48 35ZM100 92c34 3 53-16 53-40-32 0-53 14-53 40ZM100 119c-30 0-48-16-52-36 28-3 49 11 52 36Z" />
          <path d="M72 155h56M86 162h28M100 48c-14-8-16-21-7-34 13 8 19 19 7 34Z" />
          <circle cx="154" cy="25" r="7" />
        </>
      )}
      {element === 'fire' && (
        <>
          <circle cx="100" cy="77" r="35" />
          <circle cx="100" cy="77" r="27" strokeDasharray="1 5" />
          <path d="M100 23V12m0 119v12M46 77H34m132 0h-12M62 39l-9-9m94 94-9-9m0-76 9-9m-94 94 9-9M57 158h86M74 167h52" />
        </>
      )}
      {element === 'earth' && (
        <>
          <path d="m18 148 57-99 27 49 24-77 61 127H18ZM47 98l28-49 20 37-21-13-11 22-16 3ZM110 69l16-48 27 62-26-27-17 13ZM67 148l35-50 25 50M48 161h110M77 171h52" />
          <circle cx="53" cy="34" r="9" />
        </>
      )}
      {element === 'metal' && (
        <>
          <path d="m100 18 60 54-60 84-60-84 60-54Zm-60 54h120M100 18 75 72l25 84 25-84-25-54ZM59 164h82" />
          <path d="M164 29v16m-8-8h16M33 119v12m-6-6h12" />
        </>
      )}
      {element === 'water' && (
        <>
          <path d="M100 16c-12 29-42 52-42 80a42 42 0 0 0 84 0c0-28-30-51-42-80Z" />
          <path d="M73 98c0 14 11 25 25 25M28 144c17-13 28 13 45 0s28 13 45 0 28 13 45 0M36 158c17-13 28 13 45 0s28 13 45 0 28 13 37 0" />
          <circle cx="152" cy="35" r="7" />
        </>
      )}
    </svg>
  );
}
export function SajuGVisual({
  chart,
  active,
  revealing,
}: {
  chart: SajuGChartType | null;
  active: SajuGElementId | null;
  revealing: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [motion, setMotion] = useState(() => detectTarotRender().mode === '3d');
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotion(detectTarotRender().mode === '3d');
    media.addEventListener('change', change);
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', change);
    };
  }, []);
  const element = active ?? chart?.dayMaster?.element ?? null;
  return (
    <div
      className={`saju-g-visual ${revealing && motion ? 'is-revealing' : ''}`}
      ref={ref}
      data-render-mode={motion ? '3d' : 'lite'}
      aria-hidden="true"
      style={{ color: element ? SAJU_G_ELEMENT_META[element].color : '#a8c5ae' }}
    >
      <div className="saju-g-orbit-fallback" />
      <div className="saju-g-orbit-fallback inner" />
      {motion && (
        <div className="saju-g-canvas">
          <StageBoundary>
            <Suspense fallback={null}>
              <Stage active={element} revealing={revealing} visible={visible} />
            </Suspense>
          </StageBoundary>
        </div>
      )}
      <div className="saju-g-symbol-center">
        <SajuGSymbol element={element} />
        <span>
          {active
            ? `${SAJU_G_ELEMENT_META[active].name} · ${SAJU_G_ELEMENT_META[active].meaning}`
            : chart?.dayMaster
              ? `${chart.dayMaster.ko}${SAJU_G_ELEMENT_META[chart.dayMaster.element].name}`
              : '木 · 火 · 土 · 金 · 水'}
        </span>
      </div>
      <span className="saju-g-orbit-label top">하늘의 시간</span>
      <span className="saju-g-orbit-label bottom">나만의 결을 발견하는 순간</span>
      <span className="saju-g-star s1">✦</span>
      <span className="saju-g-star s2">✧</span>
      <span className="saju-g-star s3">·</span>
    </div>
  );
}
