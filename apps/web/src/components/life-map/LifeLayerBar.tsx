import { Cctv, Toilet } from 'lucide-react';
import type { LifeMapStatusResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_CCTV_PURPOSES,
  LIFE_MAP_LAYER_LABEL,
  LIFE_TOILET_COLOR,
  LIFE_TOILET_FEATURES,
  LIFE_TOILET_FILTER_KEYS,
  lifeCctvPurposeGroup,
  type LifeCctvPurpose,
  type LifeMapLayer,
  type LifeToiletFilterKey,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import type { LifeToiletFilterState } from '~/stores/lifeMapPrefsStore';

// 레이어 토글 + 필터 칩 — 패널 상단 고정. CCTV 설치목적은 다중 선택(빈 선택 = 전체), 화장실
// 편의 조건은 AND. 칩 모양은 맛집 카테고리 칩과 동일(둥근 테두리, 활성 = primary).
// section 으로 일부만 그릴 수 있다 — 모바일은 레이어 토글을 상단바(subBar)에, 필터 행은 시트
// 안(주변 목록 머리 아래)에 나눠 둔다. 데스크톱 패널은 'all'.

const FEATURE_LABEL = Object.fromEntries(LIFE_TOILET_FEATURES.map((f) => [f.key, f.label])) as Record<string, string>;

const chipClass = (active: boolean): string =>
  cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border text-muted-foreground hover:text-foreground',
  );

const countLabel = (n: number): string => n.toLocaleString('ko-KR');

interface Props {
  layers: Record<LifeMapLayer, boolean>;
  purposes: LifeCctvPurpose[];
  toiletFilters: LifeToiletFilterState;
  status: LifeMapStatusResultType | undefined;
  onToggleLayer: (layer: LifeMapLayer) => void;
  onTogglePurpose: (purpose: LifeCctvPurpose) => void;
  onClearPurposes: () => void;
  onToggleToiletFilter: (key: LifeToiletFilterKey) => void;
  section?: 'all' | 'layers' | 'filters';
  className?: string;
}

export const LifeLayerBar = ({
  layers,
  purposes,
  toiletFilters,
  status,
  onToggleLayer,
  onTogglePurpose,
  onClearPurposes,
  onToggleToiletFilter,
  section = 'all',
  className,
}: Props) => {
  const countOf = (layer: LifeMapLayer): number | null =>
    status?.layers.find((l) => l.layer === layer)?.count ?? null;
  const showLayers = section !== 'filters';
  const showFilters = section !== 'layers';
  // 필터 행만 맡았는데 켜진 레이어가 없으면 빈 띠를 남기지 않는다.
  if (section === 'filters' && !layers.cctv && !layers.toilet) return null;

  return (
    <div className={cn('flex flex-col gap-2 border-b px-3 py-2', className)}>
      {/* 레이어 토글 */}
      {showLayers && (
      <div className="flex items-center gap-1.5" role="group" aria-label="레이어">
        {(['cctv', 'toilet'] as const).map((layer) => {
          const on = layers[layer];
          const Icon = layer === 'cctv' ? Cctv : Toilet;
          const count = countOf(layer);
          return (
            <button
              key={layer}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleLayer(layer)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                on ? 'border-foreground/20 bg-foreground/5 text-foreground' : 'border-border text-muted-foreground line-through',
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: layer === 'cctv' ? LIFE_CCTV_GROUP_COLOR.safety : LIFE_TOILET_COLOR, opacity: on ? 1 : 0.35 }}
              />
              <Icon className="size-3.5" />
              {LIFE_MAP_LAYER_LABEL[layer]}
              {count !== null && <span className="text-[11px] font-normal text-muted-foreground">{countLabel(count)}</span>}
            </button>
          );
        })}
      </div>
      )}

      {/* CCTV 설치목적 */}
      {showFilters && layers.cctv && (
        <div className="flex items-start gap-2" data-testid="life-purpose-filters">
          <span className="mt-1 shrink-0 text-[11px] text-muted-foreground">설치목적</span>
          <div className="-mr-3 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:flex-wrap xl:overflow-visible">
            <button type="button" aria-pressed={purposes.length === 0} onClick={onClearPurposes} className={chipClass(purposes.length === 0)}>
              전체
            </button>
            {LIFE_CCTV_PURPOSES.map((p) => {
              const active = purposes.includes(p);
              return (
                <button key={p} type="button" aria-pressed={active} onClick={() => onTogglePurpose(p)} className={chipClass(active)}>
                  <span
                    aria-hidden
                    className="size-2 rounded-full ring-1 ring-white/70"
                    style={{ backgroundColor: LIFE_CCTV_GROUP_COLOR[lifeCctvPurposeGroup(p)] }}
                  />
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 화장실 편의 조건 */}
      {showFilters && layers.toilet && (
        <div className="flex items-start gap-2" data-testid="life-toilet-filters">
          <span className="mt-1 shrink-0 text-[11px] text-muted-foreground">화장실</span>
          <div className="-mr-3 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:flex-wrap xl:overflow-visible">
            {LIFE_TOILET_FILTER_KEYS.map((k) => {
              const active = toiletFilters[k];
              return (
                <button key={k} type="button" aria-pressed={active} onClick={() => onToggleToiletFilter(k)} className={chipClass(active)}>
                  {FEATURE_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
