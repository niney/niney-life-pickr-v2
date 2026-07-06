import { subwayLineColor, subwayLineName, subwayLineShortLabel } from '@repo/utils';
import { cn } from '~/lib/utils';

// 노선 뱃지 — 배경=노선색, 텍스트=축약 라벨(흰색). 리스트/패널 공용. shortLabel
// 이 '1'/'2' 처럼 짧거나 '경중'/'신분당' 처럼 길 수 있어, 1~2글자는 원형·그
// 이상은 알약(가변폭)으로 자연 분기한다.
interface Props {
  lineId: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const SubwayLineBadge = ({ lineId, size = 'sm', className }: Props) => {
  const label = subwayLineShortLabel(lineId);
  const isShort = label.length <= 2;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white',
        size === 'sm' ? 'text-[11px]' : 'text-xs',
        isShort
          ? size === 'sm'
            ? 'size-5'
            : 'size-6'
          : size === 'sm'
            ? 'h-5 px-1.5'
            : 'h-6 px-2',
        className,
      )}
      style={{ backgroundColor: subwayLineColor(lineId) }}
      title={subwayLineName(lineId)}
    >
      {label}
    </span>
  );
};
