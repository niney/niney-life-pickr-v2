import { Map as MapIcon, Moon, Satellite } from 'lucide-react';
import type { VworldLayer } from '@repo/utils';
import { cn } from '~/lib/utils';

// 지도 좌하단 레이어 전환 컨트롤 — 일반(Base) / 다크(midnight) / 위성(Satellite).
// 기존 오버레이(재검색·전체 영역·내 위치)는 전부 상단이라 좌하단을 쓴다.
// gray 레이어도 밝은 계열이라 일반 탭이 active 로 보이게 매핑.
const OPTIONS: { value: VworldLayer; label: string; Icon: typeof MapIcon }[] = [
  { value: 'Base', label: '일반', Icon: MapIcon },
  { value: 'midnight', label: '다크', Icon: Moon },
  { value: 'Satellite', label: '위성', Icon: Satellite },
];

interface Props {
  value: VworldLayer;
  onChange(layer: VworldLayer): void;
  className?: string;
}

export const MapLayerControl = ({ value, onChange, className }: Props) => (
  <div
    className={cn(
      'absolute bottom-3 left-3 z-10 flex overflow-hidden rounded-md border border-border bg-background/95 shadow-sm backdrop-blur',
      '[&>button+button]:border-l [&>button+button]:border-border',
      className,
    )}
  >
    {OPTIONS.map(({ value: v, label, Icon }) => {
      const active = value === v || (value === 'gray' && v === 'Base');
      return (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={active}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors',
            active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      );
    })}
  </div>
);
