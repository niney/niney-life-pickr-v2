import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Beaker,
  ChevronLeft,
  ChevronRight,
  Code2,
  Crosshair,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  Search,
  Star,
} from 'lucide-react';
import { useDiningcodeSearch, useMapProviderSecret } from '@repo/shared';
import type { DiningcodeSearchResultType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import {
  MapCanvas,
  type MapCanvasHandle,
  type MapMarker,
} from '~/components/restaurant/MapCanvas';

// 다이닝코드 자체 검색 API 응답을 그대로 보여주는 어드민 검증 페이지.
// 캐치테이블 테스트와 동일한 흐름이지만, 다이닝코드는 HTTP 직접 호출이라
// 워밍업 비용 없음(첫 호출도 ~수백 ms). 좌표·정렬·반경까지 노출해 다이닝코드
// 가 어떻게 응답을 바꾸는지 검증 가능.

const ORDER_OPTIONS: Array<{
  value: 'r_score' | 'score' | 'review' | 'distance';
  label: string;
}> = [
  { value: 'r_score', label: '추천 (기본)' },
  { value: 'score', label: '다이닝코드 점수' },
  { value: 'review', label: '리뷰 많은 순' },
  { value: 'distance', label: '거리순 (좌표 필요)' },
];

const formatScore = (score: number | null): string => {
  if (score === null || score === 0) return '—';
  return score.toFixed(1);
};

const Stars = ({ score }: { score: number | null }) => {
  if (score === null || score === 0) {
    return <span className="text-xs text-muted-foreground">평점 없음</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{formatScore(score)}</span>
    </span>
  );
};

const ResultCard = ({ item }: { item: DiningcodeSearchResultType }) => (
  <Card className="overflow-hidden transition-shadow hover:shadow-md">
    <div className="flex gap-4 p-4 sm:gap-5 sm:p-5">
      <div className="size-24 shrink-0 overflow-hidden rounded-md bg-muted sm:size-28">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No Image
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold leading-tight">
              {item.name}
              {item.branch && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {item.branch}
                </span>
              )}
            </h3>
          </div>
          <a
            href={item.rawSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="다이닝코드에서 열기"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {item.category && (
            <Badge variant="secondary" className="font-normal">
              {item.category}
            </Badge>
          )}
          {item.areas.length > 0 && (
            <span className="truncate">{item.areas.join(' · ')}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Stars score={item.userScore} />
          {item.reviewCount > 0 && (
            <span>리뷰 {item.reviewCount.toLocaleString()}</span>
          )}
          {item.score !== null && (
            <Badge variant="outline" className="font-normal">
              다이닝코드 {item.score}
            </Badge>
          )}
          {item.openStatus && (
            <Badge
              variant="outline"
              className={`font-normal ${
                item.openStatus.includes('영업 중')
                  ? 'border-emerald-400/40 text-emerald-700'
                  : ''
              }`}
            >
              {item.openStatus}
            </Badge>
          )}
          {item.distance && (
            <Badge variant="outline" className="font-normal">
              {item.distance}
            </Badge>
          )}
        </div>
        {(item.address || item.roadAddress) && (
          <div className="truncate text-xs text-muted-foreground">
            {item.roadAddress ?? item.address}
          </div>
        )}
        {item.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.keywords.slice(0, 6).map((k, i) => (
              <Badge
                key={`${k.term}-${i}`}
                variant="outline"
                className={`text-[10px] font-normal ${
                  k.mark ? 'border-primary/50 text-primary' : ''
                }`}
              >
                {k.term}
              </Badge>
            ))}
          </div>
        )}
        {item.displayReview?.review_cont && (
          <blockquote className="line-clamp-2 border-l-2 border-muted pl-2 text-xs italic text-muted-foreground">
            {item.displayReview.review_cont}
          </blockquote>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="truncate font-mono text-[11px] text-muted-foreground/80">
            {item.vRid}
          </span>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
          >
            <Link to={`/admin/diningcode-test/${item.vRid}`}>
              <Eye className="size-3.5" />
              상세 보기
            </Link>
          </Button>
        </div>
      </div>
    </div>
  </Card>
);

const Pager = ({
  hasMore,
  hasPrev,
  loading,
  onNext,
  onPrev,
  onReset,
}: {
  hasMore: boolean;
  hasPrev: boolean;
  loading: boolean;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
}) => {
  if (!hasMore && !hasPrev) return null;
  return (
    <div className="flex justify-center gap-2 pt-2">
      {hasPrev && (
        <Button variant="outline" size="sm" onClick={onReset} disabled={loading}>
          처음으로
        </Button>
      )}
      {hasPrev && (
        <Button variant="outline" size="sm" onClick={onPrev} disabled={loading}>
          <ChevronLeft className="mr-1 size-4" />
          이전
        </Button>
      )}
      {hasMore && (
        <Button variant="outline" size="sm" onClick={onNext} disabled={loading}>
          다음
          <ChevronRight className="ml-1 size-4" />
        </Button>
      )}
    </div>
  );
};

const DEFAULT_SIZE = 20;

export const AdminDiningcodeTestPage = () => {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(0);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [order, setOrder] = useState<
    'r_score' | 'score' | 'review' | 'distance'
  >('r_score');
  // 좌표 토글 — 켜야 좌표 입력 의미 있음. 끄면 키워드만으로 검색.
  const [useCoord, setUseCoord] = useState(false);
  const [latInput, setLatInput] = useState('37.4979');
  const [lngInput, setLngInput] = useState('127.0276');
  const [distanceInput, setDistanceInput] = useState('500');
  const [showRaw, setShowRaw] = useState(false);

  // 지도 키 (vworld) — 좌표 토글 켰을 때만 fetch. 어드민 설정에서 등록 안 했으면
  // 지도 자리는 placeholder 로 폴백, 텍스트 입력만으로도 검색 가능.
  const mapSecret = useMapProviderSecret('vworld', useCoord);
  const mapApiKey = mapSecret.data?.apiKey ?? null;
  const mapRef = useRef<MapCanvasHandle>(null);
  // 지도 사용자 인터랙션(패닝/줌)으로 좌표 입력을 갱신하는 동안에는
  // 입력 변경으로 인한 fly-to 를 다시 발사하지 않도록 가드.
  const syncingFromMapRef = useRef(false);

  const parsedLat = useCoord ? Number(latInput) : null;
  const parsedLng = useCoord ? Number(lngInput) : null;
  const parsedDistance = useCoord ? Number(distanceInput) : null;
  const coordValid =
    !useCoord ||
    (Number.isFinite(parsedLat) && Number.isFinite(parsedLng));

  // 입력 → 지도 fly-to. 사용자가 input 을 직접 타이핑/리셋했을 때만 발사.
  // (지도 패닝으로 onViewportChangeEnd 가 input 을 갱신한 경우는 ref 가드로 무시.)
  const flyMapToInputs = () => {
    if (!useCoord || !coordValid) return;
    if (parsedLat === null || parsedLng === null) return;
    mapRef.current?.flyTo(parsedLat, parsedLng);
  };

  const search = useDiningcodeSearch({
    q: query,
    from,
    size,
    order,
    lat: useCoord && coordValid ? parsedLat : null,
    lng: useCoord && coordValid ? parsedLng : null,
    distance:
      useCoord && coordValid && Number.isFinite(parsedDistance)
        ? parsedDistance
        : null,
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    // 새 쿼리는 항상 첫 페이지부터.
    setFrom(0);
    setQuery(trimmed);
  };

  const data = search.data;
  const isLoading = search.isFetching;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Beaker className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            다이닝코드 크롤링 테스트
          </h1>
          <p className="text-sm text-muted-foreground">
            다이닝코드 자체 검색 API(<code>POST /API/isearch/</code>) 응답을 그대로
            보여줍니다. HTTP 직접 호출이라 첫 호출도 빠릅니다.
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검색 조건</CardTitle>
          <CardDescription>
            키워드만으로도 검색 가능. 좌표를 켜면 <code>내주변</code> 모드로
            전환됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="예: 강남 맛집, 성심당, 압구정 파스타"
                  className="pl-9"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                disabled={!input.trim() || isLoading || !coordValid}
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <Search />}
                검색
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  정렬
                </span>
                <select
                  value={order}
                  onChange={(e) => {
                    setOrder(e.target.value as typeof order);
                    setFrom(0);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ORDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  페이지 크기
                </span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={size}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) {
                      setSize(Math.min(Math.max(Math.trunc(n), 1), 30));
                      setFrom(0);
                    }
                  }}
                />
              </label>
              <div className="flex flex-col justify-end">
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={useCoord}
                    onChange={() => {
                      setUseCoord((v) => !v);
                      setFrom(0);
                    }}
                    className="size-4"
                  />
                  <MapPin className="size-4 text-muted-foreground" />
                  <span className="font-medium">좌표 사용 (내주변)</span>
                </label>
              </div>
            </div>

            {useCoord && (
              <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      위도 (lat)
                    </span>
                    <Input
                      value={latInput}
                      onChange={(e) => {
                        if (syncingFromMapRef.current) return;
                        setLatInput(e.target.value);
                        setFrom(0);
                      }}
                      onBlur={flyMapToInputs}
                      placeholder="37.4979"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      경도 (lng)
                    </span>
                    <Input
                      value={lngInput}
                      onChange={(e) => {
                        if (syncingFromMapRef.current) return;
                        setLngInput(e.target.value);
                        setFrom(0);
                      }}
                      onBlur={flyMapToInputs}
                      placeholder="127.0276"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      반경 (m)
                    </span>
                    <Input
                      type="number"
                      min={50}
                      max={20000}
                      step={50}
                      value={distanceInput}
                      onChange={(e) => {
                        setDistanceInput(e.target.value);
                        setFrom(0);
                      }}
                    />
                  </label>
                </div>
                {!coordValid && (
                  <p className="text-xs text-destructive">
                    위도·경도를 숫자로 입력해 주세요.
                  </p>
                )}
                {/* 작은 지도 — 드래그하면 중심 좌표가 lat/lng 입력에 동기화됨.
                    중심에 핀이 항상 표시되어 "이 좌표로 검색" 임을 시각화. */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      지도를 드래그해 검색 중심을 옮기세요. 중앙 핀이 검색 좌표
                      입니다.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={flyMapToInputs}
                      disabled={!mapApiKey || !coordValid}
                      title="입력 좌표로 지도 이동"
                    >
                      <Crosshair className="size-3.5" />
                      입력 좌표로 이동
                    </Button>
                  </div>
                  <MiniMapPicker
                    apiKey={mapApiKey}
                    keyLoading={mapSecret.isLoading}
                    lat={parsedLat}
                    lng={parsedLng}
                    radiusMeters={
                      Number.isFinite(parsedDistance) && parsedDistance !== null
                        ? parsedDistance
                        : null
                    }
                    mapRef={mapRef}
                    onCenterChange={(nextLat, nextLng) => {
                      syncingFromMapRef.current = true;
                      setLatInput(nextLat.toFixed(6));
                      setLngInput(nextLng.toFixed(6));
                      setFrom(0);
                      // microtask 이후 가드 해제 — 동일 tick 안에서 발생하는
                      // input onChange 가 fly-to 를 트리거하지 않게.
                      queueMicrotask(() => {
                        syncingFromMapRef.current = false;
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {search.isError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              검색 실패
            </CardTitle>
            <CardDescription>
              {(search.error as Error | null)?.message ?? '알 수 없는 오류'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="font-normal">
            총 {data.total.toLocaleString()}건
            {data.meta.rcount !== null && data.meta.rcount !== data.total && (
              <span className="ml-1 text-muted-foreground">
                (실매칭 {data.meta.rcount.toLocaleString()})
              </span>
            )}
          </Badge>
          <Badge variant="outline" className="font-normal">
            이 페이지 {data.items.length}건
          </Badge>
          <Badge variant="outline" className="font-normal">
            from {data.from}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {data.elapsedMs} ms
          </Badge>
          <Badge variant="outline" className="font-normal">
            source: {data.source}
          </Badge>
          {data.meta.region && (
            <Badge variant="outline" className="font-normal">
              영역: {data.meta.region}
            </Badge>
          )}
          {data.meta.order && (
            <Badge variant="outline" className="font-normal">
              order: {data.meta.order}
            </Badge>
          )}
          {data.filteredOutCount > 0 && (
            <Badge variant="destructive" className="font-normal">
              반경 밖 {data.filteredOutCount}건 숨김
            </Badge>
          )}
        </div>
      )}
      {data && data.filteredOutCount > 0 && data.items.length === 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          이 키워드는 반경 안에 매칭이 없어 다이닝코드가 광역 결과를 돌려주었지만,
          좌표 검색 의미를 살리기 위해 반경 밖 결과는 모두 숨겼습니다. 반경을
          늘리거나 좌표 검색을 끄고 다시 시도해 보세요.
        </p>
      )}

      {/* 다이닝코드 특유 메타 패널 — 관련 키워드/지역/대체 검색어. */}
      {data &&
        (data.meta.altQueries.length > 0 ||
          data.meta.relatedKeywords.length > 0 ||
          data.meta.relatedRegions.length > 0 ||
          data.meta.regionMainKeywords.length > 0) && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">검색 메타</CardTitle>
              <CardDescription className="text-xs">
                다이닝코드가 응답에 같이 실어 보내는 부가 신호. 등록 파이프라인이
                활용할 수 있는 데이터.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.meta.altQueries.length > 0 && (
                <MetaRow label="대체 검색어" items={data.meta.altQueries} />
              )}
              {data.meta.relatedKeywords.length > 0 && (
                <MetaRow label="연관 검색어" items={data.meta.relatedKeywords} />
              )}
              {data.meta.relatedRegions.length > 0 && (
                <MetaRow label="연관 지역" items={data.meta.relatedRegions} />
              )}
              {data.meta.regionMainKeywords.length > 0 && (
                <MetaRow
                  label="지역 인기 키워드"
                  items={data.meta.regionMainKeywords}
                />
              )}
            </CardContent>
          </Card>
        )}

      {data && data.items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.items.map((it) => (
            <ResultCard key={it.vRid} item={it} />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && !isLoading && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            결과 없음
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="mt-6">
          <Pager
            hasMore={data.hasMore}
            hasPrev={from > 0}
            loading={isLoading}
            onNext={() => setFrom(data.from + data.size)}
            onPrev={() => setFrom(Math.max(0, data.from - data.size))}
            onReset={() => setFrom(0)}
          />
        </div>
      )}

      {data && (
        <Card className="mt-6">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="w-full text-left"
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Code2 className="size-4" />
                  원본 응답 JSON
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {showRaw ? '접기' : '펼치기'}
                </span>
              </div>
            </CardHeader>
          </button>
          {showRaw && (
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
                {JSON.stringify(data, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      {!query && (
        <Card className="border-dashed">
          <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            검색어를 입력하고 검색을 눌러 시작하세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// 검색 좌표 선택용 미니 지도. 지도 중심이 곧 검색 좌표라는 시각 메타포를 쓴다
// — 사용자가 패닝하면 onCenterChange 로 부모에 알려주고, 부모는 lat/lng input
// 을 갱신한다. 중앙 고정 핀은 좌표를 시각화. 반경(distance)이 있을 때만 안내
// 텍스트로 함께 표시 (실제 원 도형은 OpenLayers 직접 핸들링이 무거워 텍스트만).
const MiniMapPicker = ({
  apiKey,
  keyLoading,
  lat,
  lng,
  radiusMeters,
  mapRef,
  onCenterChange,
}: {
  apiKey: string | null;
  keyLoading: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  mapRef: React.RefObject<MapCanvasHandle | null>;
  onCenterChange: (lat: number, lng: number) => void;
}) => {
  const sizeClass = 'h-[260px] w-full';
  if (keyLoading) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…
      </Placeholder>
    );
  }
  if (!apiKey) {
    return (
      <Placeholder sizeClass={sizeClass}>
        <MapPin className="size-4 opacity-50" />
        <div>
          지도 키가 설정되지 않았습니다.{' '}
          <Link
            to="/admin/settings/map"
            className="text-primary underline underline-offset-2"
          >
            설정 &gt; 지도
          </Link>{' '}
          에서 등록하면 지도로 좌표를 잡을 수 있어요. (지금도 좌표를 직접 입력해
          검색은 가능합니다.)
        </div>
      </Placeholder>
    );
  }
  const hasCoords = lat !== null && lng !== null;
  const marker: MapMarker | null = hasCoords
    ? { id: 'center', lat: lat!, lng: lng!, variant: 'primary' }
    : null;
  return (
    <div className={`relative ${sizeClass}`}>
      <MapCanvas
        ref={mapRef}
        apiKey={apiKey}
        markers={marker ? [marker] : []}
        initialCenter={hasCoords ? { lat: lat!, lng: lng!, zoom: 15 } : undefined}
        onViewportChangeEnd={(v) => onCenterChange(v.centerLat, v.centerLng)}
        className="size-full overflow-hidden rounded-md border bg-muted"
      />
      {/* 중앙 십자선 — 지도 중심을 눈으로 잡기 쉽게. 마커도 같이 그리지만
          드래그 직후엔 마커가 따라오기 전 한 박자 시차가 날 수 있어 십자선이
          항상 "현재 검색 좌표"를 가리켜 준다. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Crosshair className="size-5 text-primary drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]" />
      </div>
      {radiusMeters !== null && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-background/85 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          반경 {radiusMeters.toLocaleString()} m
        </div>
      )}
    </div>
  );
};

const Placeholder = ({
  children,
  sizeClass,
}: {
  children: React.ReactNode;
  sizeClass: string;
}) => (
  <div
    className={`flex items-center justify-center gap-2 rounded-md border bg-muted/40 px-4 text-center text-xs text-muted-foreground ${sizeClass}`}
  >
    {children}
  </div>
);

const MetaRow = ({ label, items }: { label: string; items: string[] }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 30).map((s, i) => (
        <Badge key={`${s}-${i}`} variant="outline" className="font-normal">
          {s}
        </Badge>
      ))}
    </div>
  </div>
);
