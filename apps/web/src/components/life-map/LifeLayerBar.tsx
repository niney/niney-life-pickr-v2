import { Cctv, Cross, ShieldAlert, Store, Toilet } from 'lucide-react';
import type { LifeMapStatusResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_CCTV_PURPOSES,
  LIFE_CRIME_GRADE_COLOR,
  LIFE_HOSPITAL_CATEGORIES,
  LIFE_HOSPITAL_COLOR,
  LIFE_MAP_LAYER_LABEL,
  LIFE_MAP_OVERLAYS,
  LIFE_MAP_OVERLAY_LABEL,
  LIFE_STORE_COLOR,
  LIFE_STORE_KIND_LABEL,
  LIFE_STORE_LAYER_KINDS,
  LIFE_TOILET_COLOR,
  LIFE_TOILET_FEATURES,
  LIFE_TOILET_FILTER_KEYS,
  lifeCctvPurposeGroup,
  type LifeCctvPurpose,
  type LifeHospitalCategory,
  type LifeMapLayer,
  type LifeMapOverlay,
  type LifeStoreLayerKind,
  type LifeToiletFilterKey,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import type { LifeToiletFilterState } from '~/stores/lifeMapPrefsStore';

// 레이어 토글 + 필터 칩 — 패널 상단 고정. 점 레이어 4종(CCTV·화장실·병의원·생활편의) 뒤에 구분선을 두고 배경(면) 레이어(범죄 통계)
// 토글을 따로 둔다 — 유형이 달라(내주변·상세 없음, 한 번에 하나) 같은 줄에 섞이지 않게. 필터 행은
// 점 레이어 것만(범죄군 메트릭은 요약 카드 안). CCTV 설치목적·병의원 종별·생활편의 업종은 다중 선택(빈 선택 = 전체),
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
  storeKinds: LifeStoreLayerKind[];
  overlay: LifeMapOverlay | null;
  status: LifeMapStatusResultType | undefined;
  onToggleLayer: (layer: LifeMapLayer) => void;
  onTogglePurpose: (purpose: LifeCctvPurpose) => void;
  onClearPurposes: () => void;
  onToggleToiletFilter: (key: LifeToiletFilterKey) => void;
  onToggleHospitalCategory: (category: LifeHospitalCategory) => void;
  onClearHospitalCategories: () => void;
  onToggleStoreKind: (kind: LifeStoreLayerKind) => void;
  onClearStoreKinds: () => void;
  onToggleOverlay: (overlay: LifeMapOverlay) => void;
  section?: 'all' | 'layers' | 'filters';
  className?: string;
}

const LAYER_DOT: Record<LifeMapLayer, string> = {
  cctv: LIFE_CCTV_GROUP_COLOR.safety,
  toilet: LIFE_TOILET_COLOR,
  hospital: LIFE_HOSPITAL_COLOR,
  store: LIFE_STORE_COLOR,
};
const LAYER_ICON: Record<LifeMapLayer, typeof Cctv> = { cctv: Cctv, toilet: Toilet, hospital: Cross, store: Store };

export const LifeLayerBar = ({
  layers,
  purposes,
  toiletFilters,
  hospitalCategories,
  storeKinds,
  overlay,
  status,
  onToggleLayer,
  onTogglePurpose,
  onClearPurposes,
  onToggleToiletFilter,
  onToggleHospitalCategory,
  onClearHospitalCategories,
  onToggleStoreKind,
  onClearStoreKinds,
  onToggleOverlay,
  section = 'all',
  className,
}: Props) => {
  const countOf = (layer: LifeMapLayer): number | null =>
    status?.layers.find((l) => l.layer === layer)?.count ?? null;
  const showLayers = section !== 'filters';
  const showFilters = section !== 'layers';
  // 필터 행만 맡았는데 켜진 레이어가 없으면 빈 띠를 남기지 않는다.
  if (section === 'filters' && !layers.cctv && !layers.toilet && !layers.hospital && !layers.store) return null;

  return (
    <div className={cn('flex flex-col gap-2 border-b px-3 py-2', className)}>
      {/* 레이어 토글 — 4칩+건수는 400px 패널을 넘치므로 칩 안 줄바꿈을 금지하고(글자 단위로 꺾여
          '병/의/원'이 된다) 필터 행과 같은 가로 스크롤로 흘린다(xl 은 줄바꿈). */}
      {showLayers && (
      <div
        className="-mr-3 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:mr-0 xl:flex-wrap xl:overflow-visible xl:pr-0"
        role="group"
        aria-label="레이어"
      >
        {(['cctv', 'toilet', 'hospital', 'store'] as const).map((layer) => {
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
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
        {LIFE_MAP_OVERLAYS.map((o) => {
          const on = overlay === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleOverlay(o)}
              data-testid={`life-overlay-${o}`}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                on ? 'border-foreground/20 bg-foreground/5 text-foreground' : 'border-border text-muted-foreground',
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: LIFE_CRIME_GRADE_COLOR[4], opacity: on ? 1 : 0.35 }}
              />
              <ShieldAlert className="size-3.5" />
              {LIFE_MAP_OVERLAY_LABEL[o]}
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

      {/* 생활편의 업종 */}
      {showFilters && layers.store && (
        <div className="flex items-start gap-2" data-testid="life-store-filters">
          <span className="mt-1 shrink-0 text-[11px] text-muted-foreground">생활편의</span>
          <div className="-mr-3 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none] xl:flex-wrap xl:overflow-visible">
            <button type="button" aria-pressed={storeKinds.length === 0} onClick={onClearStoreKinds} className={chipClass(storeKinds.length === 0)}>
              전체
            </button>
            {LIFE_STORE_LAYER_KINDS.map((k) => {
              const active = storeKinds.includes(k);
              return (
                <button key={k} type="button" aria-pressed={active} onClick={() => onToggleStoreKind(k)} className={chipClass(active)}>
                  {LIFE_STORE_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
