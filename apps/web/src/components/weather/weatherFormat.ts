import { useEffect, useRef, useState, type RefObject } from 'react';
import type { WeatherBaseType } from '@repo/api-contract';
import { ApiError } from '@repo/shared';

// 날씨 페이지 비-컴포넌트 헬퍼 — 발표 시각 포맷, 업스트림 에러 문구, 차트 보조 훅/눈금.
// (컴포넌트 파일과 분리해 Fast Refresh 경고를 피한다 — 대기정보의 airGrade.ts 와 같은 규율.)

// "YYYYMMDD"+"HHMM" → "8/21 15:00".
export const formatBaseLabel = (base: WeatherBaseType | null | undefined): string | null => {
  if (!base) return null;
  return `${Number(base.date.slice(4, 6))}/${Number(base.date.slice(6, 8))} ${base.time.slice(0, 2)}:${base.time.slice(2, 4)}`;
};

// "YYYYMMDDHHmm" → "8/21 06:00".
export const formatTmFcLabel = (tmFc: string | null | undefined): string | null => {
  if (!tmFc || !/^\d{12}$/.test(tmFc)) return null;
  return `${Number(tmFc.slice(4, 6))}/${Number(tmFc.slice(6, 8))} ${tmFc.slice(8, 10)}:${tmFc.slice(10, 12)}`;
};

export const weatherUpstreamMessage = (e: unknown, fallback: string): string => {
  if (e instanceof ApiError) {
    if (e.statusCode === 503) return `서버에 기상청 API 키가 없거나 일일 한도가 찼습니다. (${e.message})`;
    if (e.statusCode === 502) return `기상청 API가 응답하지 않습니다. 잠시 후 다시 시도하세요. (${e.message})`;
    if (e.statusCode === 429) return '요청이 너무 잦습니다. 잠시 후 다시 시도하세요.';
  }
  return fallback;
};

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
