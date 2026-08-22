import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Bus, Clock, Loader2, MapPin, Navigation, Search, TrainFront, X } from 'lucide-react';
import { useBusStationSearch, useLifeMapSearch, useSubwayStationSearch } from '@repo/shared';
import {
  WEATHER_SIDOS,
  searchWeatherPlaces,
  weatherDefaultPlaceOfSido,
  weatherPlaceLabel,
  weatherPlacesBySido,
  type WeatherPlace,
  type WeatherSido,
} from '@repo/utils';
import { useDebounced } from '~/lib/useDebounced';
import { cn } from '~/lib/utils';
import { useLifeMapRecentStore } from '~/stores/lifeMapRecentStore';

// 일상지도 "지역 이동" 옴니박스 — 검색창 하나로 네 가지 이동을 묶는다.
//   입력 없음: 저장한 내 위치 · 최근 본 위치 · 시도 칩 → 시·군·구 칩(로컬 245지점)
//   입력 중:   행정구역(로컬 즉시) · 지하철역(수도권, 기존 검색 API) · 버스정류장(서울, 기존 검색 API)
//              · 주소·장소(VWorld 검색 프록시 — 디바운스 250ms, 서버 키 없으면 섹션 숨김)
// 선택 → onGo(종류별 줌: 시도 11 · 시 13 · 구 14 · 역/정류장 16 · 주소/장소 17) + 최근에 기록.
// ↑↓ 로 결과 이동, Enter 선택(없으면 첫 결과), Esc 는 입력 지우기→닫기.
// variant: 'panel'(데스크톱 좌패널 — 열리면 패널 본문 자리를 차지) / 'bar'(모바일 상단바 subBar —
// 입력 한 줄만 차지하고 결과는 아래로 떨어지는 드롭다운, 바깥 탭으로 닫힘).

export type LifeGoToKind = 'saved' | 'recent' | 'sido' | 'region' | 'subway' | 'bus' | 'place' | 'road' | 'parcel';
export interface LifeGoToTarget {
  kind: LifeGoToKind;
  label: string;
  sub: string | null;
  lat: number;
  lng: number;
  zoom: number;
}

const ZOOM = { sido: 11, city: 13, district: 14, station: 16, address: 17 } as const;
const regionTarget = (p: WeatherPlace): LifeGoToTarget => ({
  kind: 'region',
  label: weatherPlaceLabel(p),
  sub: p.kind === 'district' ? '구·군' : p.sido,
  lat: p.lat,
  lng: p.lng,
  zoom: p.kind === 'district' ? ZOOM.district : ZOOM.city,
});
const REMOTE_DEBOUNCE_MS = 250;
const SECTION_LIMIT = 5;

interface Section {
  key: string;
  title: string;
  items: LifeGoToTarget[];
  loading?: boolean;
  // 업스트림 오류 — 섹션을 숨기지 않고 "잠시 안 됨" 을 보여 준다(조용히 사라지면 없는 줄 안다).
  error?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedLocation: { lat: number; lng: number; label: string | null } | null;
  onGo: (target: LifeGoToTarget) => void;
  className?: string;
  variant?: 'panel' | 'bar';
}

export const LifeGoToBox = ({ open, onOpenChange, savedLocation, onGo, className, variant = 'panel' }: Props) => {
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const isBar = variant === 'bar';

  // bar: 드롭다운 바깥을 탭하면 닫는다(헤더가 backdrop-filter 라 fixed 백드롭은 헤더 안에 갇혀
  // 못 쓰고, 문서 레벨 리스너로 처리).
  useEffect(() => {
    if (!isBar || !open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [isBar, open, onOpenChange]);
  const [sido, setSido] = useState<WeatherSido | null>(null);
  const [active, setActive] = useState(0);
  const recent = useLifeMapRecentStore((s) => s.items);
  const addRecent = useLifeMapRecentStore((s) => s.add);
  const clearRecent = useLifeMapRecentStore((s) => s.clear);

  const trimmed = q.trim();
  const typing = open && trimmed.length > 0;
  // 원격 검색(역·정류장·주소)은 디바운스된 값으로 — 타이핑 글자마다 세 API 가 나가지 않게. 행정구역은 즉시.
  const debouncedQ = useDebounced(typing ? trimmed : '', REMOTE_DEBOUNCE_MS);
  const subwayQ = useSubwayStationSearch(debouncedQ);
  const busQ = useBusStationSearch(debouncedQ);
  const remoteQ = useLifeMapSearch(debouncedQ, 8);

  const sections = useMemo<Section[]>(() => {
    if (!typing) return [];
    const out: Section[] = [];
    const regions = searchWeatherPlaces(trimmed, SECTION_LIMIT).map(regionTarget);
    if (regions.length > 0) out.push({ key: 'region', title: '행정구역', items: regions });
    const subway = (subwayQ.data?.items ?? []).slice(0, SECTION_LIMIT).map<LifeGoToTarget>((s) => ({
      kind: 'subway',
      label: `${s.name}역`,
      sub: s.lines.map((l) => l.lineName).join(' · '),
      lat: s.lat,
      lng: s.lng,
      zoom: ZOOM.station,
    }));
    if (subway.length > 0 || subwayQ.isFetching) out.push({ key: 'subway', title: '지하철역(수도권)', items: subway, loading: subwayQ.isFetching });
    const bus = (busQ.data?.items ?? []).slice(0, SECTION_LIMIT).map<LifeGoToTarget>((b) => ({
      kind: 'bus',
      label: b.name,
      sub: b.arsId !== '0' ? `정류소 ${b.arsId}` : null,
      lat: b.lat,
      lng: b.lng,
      zoom: ZOOM.station,
    }));
    if (bus.length > 0 || busQ.isFetching) out.push({ key: 'bus', title: '버스정류장(서울)', items: bus, loading: busQ.isFetching });
    if (remoteQ.data?.enabled !== false) {
      const remote = (remoteQ.data?.q === debouncedQ ? (remoteQ.data?.items ?? []) : []).map<LifeGoToTarget>((i) => ({
        kind: i.kind,
        label: i.title,
        sub: i.subtitle,
        lat: i.lat,
        lng: i.lng,
        zoom: ZOOM.address,
      }));
      const waiting = remoteQ.isFetching || (debouncedQ !== trimmed && trimmed.length >= 2);
      if (remote.length > 0 || waiting || remoteQ.isError) {
        out.push({ key: 'remote', title: '주소·장소', items: remote, loading: waiting, error: remoteQ.isError && !waiting });
      }
    }
    return out;
  }, [typing, trimmed, subwayQ.data, subwayQ.isFetching, busQ.data, busQ.isFetching, remoteQ.data, remoteQ.isFetching, remoteQ.isError, debouncedQ]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const activeIndex = flat.length > 0 ? Math.min(active, flat.length - 1) : -1;
  const anyLoading = sections.some((s) => s.loading);

  const go = (t: LifeGoToTarget) => {
    if (t.kind !== 'saved') addRecent({ label: t.label, sub: t.sub, lat: t.lat, lng: t.lng, zoom: t.zoom });
    onGo(t);
    setQ('');
    setActive(0);
    onOpenChange(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length > 0) setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length > 0) setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      const t = activeIndex >= 0 ? flat[activeIndex] : undefined;
      if (t) {
        e.preventDefault();
        go(t);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (trimmed) setQ('');
      else onOpenChange(false);
    }
  };

  // 입력 없음 — 저장 위치·최근·시도/시군구 칩.
  const sidoPlaces = sido ? weatherPlacesBySido(sido) : [];
  const sidoDefault = sido ? weatherDefaultPlaceOfSido(sido) : null;
  let flatIndex = -1;

  return (
    <div
      ref={rootRef}
      className={cn(isBar ? 'relative' : 'flex min-h-0 flex-col border-b', !isBar && open && 'flex-1', className)}
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
            if (!open) onOpenChange(true);
          }}
          onFocus={() => onOpenChange(true)}
          onKeyDown={onKeyDown}
          placeholder="지역·역·정류장·주소로 이동"
          aria-label="지역 이동 검색"
          aria-expanded={open}
          data-testid="life-goto-input"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {anyLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
        {(open || trimmed) && (
          <button
            type="button"
            onClick={() => {
              if (trimmed) setQ('');
              else onOpenChange(false);
            }}
            aria-label={trimmed ? '검색어 지우기' : '닫기'}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div
          className={cn(
            'px-2 pb-2',
            isBar
              ? 'absolute inset-x-0 top-full z-50 max-h-[60dvh] overflow-y-auto border-y bg-background shadow-lg'
              : 'min-h-0 flex-1 overflow-y-auto',
          )}
          data-testid="life-goto-results"
        >
          {typing ? (
            sections.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                {trimmed.length < 2 ? '두 글자 이상 입력하면 역·정류장·주소도 찾습니다.' : '찾는 곳이 없습니다. 다른 이름이나 주소로 해 보세요.'}
              </p>
            ) : (
              <div role="listbox" aria-label="검색 결과">
                {sections.map((sec) => (
                  <div key={sec.key} className="pt-2">
                    <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      {sec.title}
                      {sec.loading && <Loader2 className="size-3 animate-spin" aria-hidden />}
                    </div>
                    {sec.items.map((t) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      return (
                        <ResultRow key={`${t.kind}:${t.label}:${t.lat}:${t.lng}`} target={t} active={idx === activeIndex} onSelect={go} />
                      );
                    })}
                    {sec.items.length === 0 && sec.loading && <div className="px-1 py-1.5 text-xs text-muted-foreground">찾는 중…</div>}
                    {sec.items.length === 0 && sec.error && (
                      <div className="px-1 py-1.5 text-xs text-muted-foreground">주소·장소 검색이 잠시 안 됩니다 — 지역·역·정류장으로 찾아 보세요.</div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              {savedLocation && (
                <Group title="저장한 내 위치">
                  <ResultRow
                    target={{ kind: 'saved', label: savedLocation.label ?? '내 위치', sub: '날씨·대기와 공유', lat: savedLocation.lat, lng: savedLocation.lng, zoom: 15 }}
                    active={false}
                    onSelect={go}
                  />
                </Group>
              )}
              {recent.length > 0 && (
                <Group
                  title="최근 본 위치"
                  action={
                    <button type="button" onClick={clearRecent} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                      지우기
                    </button>
                  }
                >
                  {recent.map((r) => (
                    <ResultRow
                      key={`${r.label}:${r.lat}:${r.lng}`}
                      target={{ kind: 'recent', label: r.label, sub: r.sub, lat: r.lat, lng: r.lng, zoom: r.zoom }}
                      active={false}
                      onSelect={go}
                    />
                  ))}
                </Group>
              )}
              <Group title={sido ? `${sido} — 시·군·구` : '지역 바로가기'}>
                <div className="flex flex-wrap gap-1.5 px-1" data-testid="life-goto-chips">
                  {sido ? (
                    <>
                      <Chip onClick={() => setSido(null)}>← 시·도</Chip>
                      {sidoDefault && (
                        <Chip
                          primary
                          onClick={() => go({ kind: 'sido', label: sido, sub: '시·도 전체', lat: sidoDefault.lat, lng: sidoDefault.lng, zoom: ZOOM.sido })}
                        >
                          {sido} 전체
                        </Chip>
                      )}
                      {sidoPlaces.map((p) => (
                        <Chip key={p.id} onClick={() => go(regionTarget(p))}>
                          {p.name}
                        </Chip>
                      ))}
                    </>
                  ) : (
                    WEATHER_SIDOS.map((s) => (
                      <Chip key={s} onClick={() => setSido(s)}>
                        {s}
                      </Chip>
                    ))
                  )}
                </div>
              </Group>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Group = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-muted-foreground">
      <span>{title}</span>
      {action}
    </div>
    {children}
  </div>
);

const Chip = ({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-2.5 py-1 text-xs transition-colors',
      primary ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
    )}
  >
    {children}
  </button>
);

const KIND_ICON: Record<LifeGoToKind, typeof MapPin> = {
  saved: Navigation,
  recent: Clock,
  sido: MapPin,
  region: MapPin,
  subway: TrainFront,
  bus: Bus,
  place: MapPin,
  road: MapPin,
  parcel: MapPin,
};

const ResultRow = ({ target, active, onSelect }: { target: LifeGoToTarget; active: boolean; onSelect: (t: LifeGoToTarget) => void }) => {
  const Icon = KIND_ICON[target.kind];
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onSelect(target)}
      className={cn(
        'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/60',
        active && 'bg-accent',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{target.label}</span>
        {target.sub && <span className="block truncate text-xs text-muted-foreground">{target.sub}</span>}
      </span>
    </button>
  );
};
