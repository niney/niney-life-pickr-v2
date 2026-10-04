import { useCallback, useState, type RefCallback } from 'react';

// 날씨 페이지 비-컴포넌트 헬퍼 — 차트 보조 훅/눈금만 여기 남고, 발표 시각 포맷은 @repo/utils
// (formatKmaBaseLabel/formatKmaTmFcLabel), 업스트림 에러 문구는 @repo/shared(weatherUpstreamMessage)로
// 올라갔다(앱 날씨 화면과 공용). 기존 import 경로 호환용 재수출.
// (컴포넌트 파일과 분리해 Fast Refresh 경고를 피한다 — 대기정보의 airGrade.ts 와 같은 규율.)
export { formatKmaBaseLabel as formatBaseLabel, formatKmaTmFcLabel as formatTmFcLabel } from '@repo/utils';
export { weatherUpstreamMessage } from '@repo/shared';

// 컨테이너 실측 폭 — SVG 를 픽셀 단위로 그려 글자가 늘어나지 않게 한다. 요소가 붙는 순간(ref 콜백) 재고
// ResizeObserver 로 따라간다(대기정보 차트와 같은 훅). 마운트 때 한 번만 보는 effect 였을 때는, 빈 예보로 먼저
// 마운트돼 이 요소가 아직 없으면 뒤에 데이터가 와도 관찰이 시작되지 않아 폭이 0 에 머물렀다.
export const useElementWidth = (): [RefCallback<HTMLDivElement>, number] => {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return undefined;
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
