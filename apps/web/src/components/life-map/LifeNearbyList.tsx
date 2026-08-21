import { Loader2 } from 'lucide-react';
import type { LifeMapNearbyItemType, LifeMapNearbyResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_MAP_LAYER_LABEL,
  LIFE_TOILET_COLOR,
  LIFE_TOILET_FEATURES,
  formatDistanceM,
  lifeCctvPurposeGroup,
  type LifeMapLayer,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { openLabel } from './lifeMapFormat';

// 지도 중심 기준 주변 목록 — 화장실/CCTV 탭. 행 클릭 = 선택(URL sel) + 지도 이동.
// 화장실 행은 이름·구분·개방시간·편의 배지, CCTV 행은 목적·관리기관·대수·방면.

interface Props {
  tab: LifeMapLayer;
  layers: Record<LifeMapLayer, boolean>;
  onTab: (layer: LifeMapLayer) => void;
  data: LifeMapNearbyResultType | undefined;
  isLoading: boolean;
  radiusM: number;
  selectedId: string | null;
  onSelect: (item: LifeMapNearbyItemType) => void;
}

export const LifeNearbyList = ({ tab, layers, onTab, data, isLoading, radiusM, selectedId, onSelect }: Props) => {
  const layerOn = layers[tab];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="주변 목록">
          {(['toilet', 'cctv'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={tab === l}
              onClick={() => onTab(l)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                tab === l ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {LIFE_MAP_LAYER_LABEL[l]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          지도 중심 {formatDistanceM(radiusM)} 안{data ? ` · ${data.total.toLocaleString('ko-KR')}곳` : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="life-nearby-list">
        {!layerOn ? (
          <Empty>{LIFE_MAP_LAYER_LABEL[tab]} 레이어가 꺼져 있습니다. 위에서 켜면 주변 목록이 나옵니다.</Empty>
        ) : isLoading && !data ? (
          <Empty>
            <Loader2 className="size-4 animate-spin" /> 주변을 찾는 중…
          </Empty>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            지도 중심 {formatDistanceM(radiusM)} 안에 {LIFE_MAP_LAYER_LABEL[tab]}
            {tab === 'toilet' ? '이' : '가'} 없습니다. 지도를 옮기거나 필터를 풀어 보세요.
          </Empty>
        ) : (
          <ul className="divide-y">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  aria-current={selectedId === item.id ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent/60',
                    selectedId === item.id && 'bg-accent',
                  )}
                >
                  {item.layer === 'toilet' ? <ToiletRow item={item} /> : <CctvRow item={item} />}
                  <span className="ml-auto shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatDistanceM(item.dist)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const ToiletRow = ({ item }: { item: Extract<LifeMapNearbyItemType, { layer: 'toilet' }> }) => {
  const badges = LIFE_TOILET_FEATURES.filter((f) => item[f.key]);
  return (
    <>
      <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: LIFE_TOILET_COLOR }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.kind} · {openLabel(item.openType, item.openDetail, item.open24)}
        </span>
        {badges.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b.key} className="rounded border px-1 py-px text-[10px] text-muted-foreground">
                {b.label}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
};

const CctvRow = ({ item }: { item: Extract<LifeMapNearbyItemType, { layer: 'cctv' }> }) => (
  <>
    <span
      aria-hidden
      className="mt-1.5 size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: LIFE_CCTV_GROUP_COLOR[lifeCctvPurposeGroup(item.purpose)] }}
    />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{item.purpose} CCTV</span>
      <span className="block truncate text-xs text-muted-foreground">
        {item.orgName}
        {item.cameraCount !== null ? ` · ${item.cameraCount}대` : ''}
        {item.direction ? ` · ${item.direction}` : ''}
      </span>
    </span>
  </>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
);
