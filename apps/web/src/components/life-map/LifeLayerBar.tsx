import { Cctv, Cross, Toilet } from 'lucide-react';
import type { LifeMapStatusResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_CCTV_PURPOSES,
  LIFE_HOSPITAL_CATEGORIES,
  LIFE_HOSPITAL_COLOR,
  LIFE_MAP_LAYER_LABEL,
  LIFE_TOILET_COLOR,
  LIFE_TOILET_FEATURES,
  LIFE_TOILET_FILTER_KEYS,
  lifeCctvPurposeGroup,
  type LifeCctvPurpose,
  type LifeHospitalCategory,
  type LifeMapLayer,
  type LifeToiletFilterKey,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import type { LifeToiletFilterState } from '~/stores/lifeMapPrefsStore';

// 레이어 토글 + 필터 칩 — 패널 상단 고정. CCTV 설치목적·병의원 종별은 다중 선택(빈 선택 = 전체),
// 화장실 편의 조건은 AND. 칩 모양은 맛집 카테고리 칩과 동일(둥근 테두리, 활성 = primary).
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
  hospitalCategories: LifeHospitalCategory[];
  status: LifeMapStatusResultType | undefined;
  onToggleLayer: (layer: LifeMapLayer) => void;
  onTogglePurpose: (purpose: LifeCctvPurpose) => void;
  onClearPurposes: () => void;
  onToggleToiletFilter: (key: LifeToiletFilterKey) => void;
  onToggleHospitalCategory: (category: LifeHospitalCategory) => void;
  onClearHospitalCategories: () => void;
  section?: 'all' | 'layers' | 'filters';
  className?: string;
}

const LAYER_DOT: Record<LifeMapLayer, string> = {
  cctv: LIFE_CCTV_GROUP_COLOR.safety,
  toilet: LIFE_TOILET_COLOR,
  hospital: LIFE_HOSPITAL_COLOR,
};
const LAYER_ICON: Record<LifeMapLayer, typeof Cctv> = { cctv: Cctv, toilet: Toilet, hospital: Cross };

export const LifeLayerBar = ({
  layers,
  purposes,
  toiletFilters,
  hospitalCategories,
  status,
  onToggleLayer,
  onTogglePurpose,
  onClearPurposes,
  onToggleToiletFilter,
  onToggleHospitalCategory,
  onClearHospitalCategories,
  section = 'all',
  className,
}: Props) => {
  const countOf = (layer: LifeMapLayer): number | null =>
    status?.layers.find((l) => l.layer === layer)?.count ?? null;
  const showLayers = section !== 'filters';
  const showFilters = section !== 'layers';
  // 필터 행만 맡았는데 켜진 레이어가 없으면 빈 띠를 남기지 않는다.
  if (section === 'filters' && !layers.cctv && !layers.toilet && !layers.hospital) return null;

  return (
    <div className={cn('flex flex-col gap-2 border-b px-3 py-2', className)}>
      {/* 레이어 토글 — 3칩+건수는 400px 패널을 넘치므로 칩 안 줄바꿈을 금지하고(글자 단위로 꺾여
          '병/의/원'이 된다) 필터 행과 같은 가로 스크롤로 흘린다(xl 은 줄바꿈). */}
      {showLayers && (
      <div
        className="-mr-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:mr-0 xl:flex-wrap xl:overflow-visible xl:pr-0"
        role="group"
        aria-label="레이어"
      >
        {(['cctv', 'toilet', 'hospital'] as const).map((layer) => {
          const on = layers[layer];
          const Icon = LAYER_ICON[layer];
          const count = countOf(layer);
          return (
            <button
              key={layer}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleLayer(layer)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                on ? 'border-foreground/20 bg-foreground/5 text-foreground' : 'border-border text-muted-foreground line-through',
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: LAYER_DOT[layer], opacity: on ? 1 : 0.35 }}
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

      {/* 병의원 종별 */}
      {showFilters && layers.hospital && (
        <div className="flex items-start gap-2" data-testid="life-hospital-filters">
          <span className="mt-1 shrink-0 text-[11px] text-muted-foreground">병의원</span>
          <div className="-mr-3 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:flex-wrap xl:overflow-visible">
            <button
              type="button"
              aria-pressed={hospitalCategories.length === 0}
              onClick={onClearHospitalCategories}
              className={chipClass(hospitalCategories.length === 0)}
            >
              전체
            </button>
            {LIFE_HOSPITAL_CATEGORIES.map((c) => {
              const active = hospitalCategories.includes(c);
              return (
                <button key={c} type="button" aria-pressed={active} onClick={() => onToggleHospitalCategory(c)} className={chipClass(active)}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
