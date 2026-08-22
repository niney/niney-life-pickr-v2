import { useEffect, useRef, useState, type RefObject } from 'react';

// 날씨 페이지 비-컴포넌트 헬퍼 — 차트 보조 훅/눈금만 여기 남고, 발표 시각 포맷은 @repo/utils
// (formatKmaBaseLabel/formatKmaTmFcLabel), 업스트림 에러 문구는 @repo/shared(weatherUpstreamMessage)로
// 올라갔다(앱 날씨 화면과 공용). 기존 import 경로 호환용 재수출.
// (컴포넌트 파일과 분리해 Fast Refresh 경고를 피한다 — 대기정보의 airGrade.ts 와 같은 규율.)
export { formatKmaBaseLabel as formatBaseLabel, formatKmaTmFcLabel as formatTmFcLabel } from '@repo/utils';
export { weatherUpstreamMessage } from '@repo/shared';

// 컨테이너 실측 폭 — SVG 를 픽셀 단위로 그려 글자가 늘어나지 않게 한다. ResizeObserver 는
// 외부 시스템이라 useEffect 가 맞는 자리(대기정보 차트와 같은 훅).
export const useElementWidth = (): [RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
};

// 기온 눈금 — 1/2/5/10/20℃ 단계 중 눈금이 ≤6개가 되는 가장 작은 단계, 하한/상한은 단계의 배수.
export const tempTicks = (minV: number, maxV: number): { lo: number; hi: number; ticks: number[] } => {
  const span = Math.max(1, maxV - minV);
  const step = [1, 2, 5, 10, 20].find((s) => span / s <= 6) ?? 20;
  const lo = Math.floor(minV / step) * step;
  const hi = Math.ceil(maxV / step) * step;
  const top = hi === lo ? lo + step : hi;
  const ticks: number[] = [];
  for (let v = lo; v <= top + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return { lo, hi: top, ticks };
};
