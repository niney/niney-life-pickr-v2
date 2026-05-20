import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin, RefreshCcw } from 'lucide-react';
import { ApiError, useMapPublicConfig, type UserLocationStatus } from '@repo/shared';
import type { RestaurantPublicListItemType } from '@repo/api-contract';
import { resolveRestaurantCategoryKey } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { MapCanvas, type MapCanvasHandle, type MapMarker, type MapViewport } from './MapCanvas';

interface Props {
  items: RestaurantPublicListItemType[];
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  // URL 의 bbox(이미 검색에 반영된 영역) — 사용자가 지도를 패닝해서 이 값과
  // 다른 영역으로 가면 "이 지역 재검색" 노출.
  appliedBbox: string | null;
  // 외부에서 주입하는 중심 좌표(예: 사용자 geolocation). 참조가 새로워질
  // 때마다 flyTo — 첫 진입의 자동 도착과 "내 위치" 버튼의 수동 재요청 양쪽
  // 다 처리. 사용자가 패닝한 후엔 호출자가 새 좌표를 안 주는 한 그대로 둔다.
  focusCoord?: { lat: number; lng: number } | null;
  // "내 위치" 버튼 표시/상태/콜백. null/undefined 면 버튼 자체 숨김.
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => void;
  onSelectMarker(placeId: string): void;
  onResearchInArea(bbox: string): void;
  onClearArea(): void;
}

export const PublicRestaurantsMap = ({
  items,
  selectedPlaceId,
  hoveredPlaceId,
  appliedBbox,
  focusCoord,
  locationStatus,
  onRequestLocation,
  onSelectMarker,
  onResearchInArea,
  onClearArea,
}: Props) => {
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  // 키 미등록은 404 — ApiError statusCode 로 분기.
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const handleRef = useRef<MapCanvasHandle>(null);

  // 지도 패닝 후 임시 viewport. URL bbox 와 비교해서 "재검색" 버튼 노출.
  const [pendingViewport, setPendingViewport] = useState<MapViewport | null>(null);
  const [tileError, setTileError] = useState(false);

  // 좌표 있는 식당만 마커로. id 는 placeId 그대로 사용 (선택 동기화에 그대로 매핑).
  // 모든 마커에 라벨 전달. 겹치는 텍스트는 VectorLayer declutter:true 가 자동
  // 숨김 처리 (도심 밀집 지역에서도 가독성 유지). selectedPlaceId 가 deps 에
  // 없어 selection 변경 시 markers 재계산 안 됨 → MapCanvas 의 feature 안정성 ↑.
  const markers: MapMarker[] = useMemo(
    () =>
      items
        .filter((it) => it.latitude !== null && it.longitude !== null)
        .map((it) => ({
          id: it.placeId,
          lat: it.latitude!,
          lng: it.longitude!,
          label: it.name,
          categoryKey: resolveRestaurantCategoryKey(it.category),
        })),
    [items],
  );

  // 호버 우선 강조. selectedPlaceId 가 있을 때 hoveredPlaceId 가 다르면 hover 우선.
  const highlightedId = hoveredPlaceId ?? selectedPlaceId;

  // 선택/호버된 마커가 화면 밖이면 부드럽게 가운데로 이동. 이건 사용자 인터랙션
  // 이 아니라 시스템 동작 — onViewportChangeEnd 안 발사.
  useEffect(() => {
    if (!highlightedId) return;
    const target = items.find((it) => it.placeId === highlightedId);
    if (!target || target.latitude === null || target.longitude === null) return;
    handleRef.current?.flyTo(target.latitude, target.longitude);
  }, [highlightedId, items]);

  // focusCoord 참조가 바뀌면 fly — 첫 도착도, "내 위치" 재요청도 같은 경로.
  // 같은 좌표라도 호출자가 새 object 를 넘기면 다시 fly (idempotent — 이미
  // 같은 중심이면 시각적 변화 없음). apiKey 가 늦게 와서 mount 이 늦어진
  // 경우를 위해 apiKey 도 deps 에 포함.
  useEffect(() => {
    if (!focusCoord || !apiKey) return;
    handleRef.current?.flyTo(focusCoord.lat, focusCoord.lng);
  }, [focusCoord, apiKey]);

  // viewport 변경 콜백 — URL bbox 와 비교, 다르면 재검색 후보로 보관.
  const handleViewportChange = useCallback(
    (viewport: MapViewport) => {
      setPendingViewport(viewport);
    },
    [],
  );

  // 표시 여부: pendingViewport 가 있고, 현재 URL bbox 와 비교해 충분히 다르면.
  // "충분히" 기준: bbox center 가 viewport extent 밖에 있거나, area 차이가 30% 이상.
  // 단순 휴리스틱 — pendingViewport 가 존재하면 일단 노출하고, URL bbox 와 정확히
  // 같은 문자열이면 숨김 (재검색이 막 끝나면 같아짐).
  const pendingBboxStr = pendingViewport
    ? formatBbox(pendingViewport.bbox)
    : null;
  const showResearch =
    pendingBboxStr !== null && pendingBboxStr !== appliedBbox;

  if (config.isLoading) {
    return <Placeholder><Loader2 className="size-4 animate-spin" /> 지도 키 확인 중…</Placeholder>;
  }
  if (keyMissing) {
    return (
      <Placeholder>
        <MapPin className="size-4 opacity-50" />
        <div className="text-center">
          지도 키가 등록되지 않았습니다.
          <br />
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 표시됩니다.
        </div>
      </Placeholder>
    );
  }
  if (config.isError || !apiKey) {
    return <Placeholder>지도 설정을 불러오지 못했습니다.</Placeholder>;
  }

  return (
    <div className="relative size-full">
      <MapCanvas
        ref={handleRef}
        apiKey={apiKey}
        markers={markers}
        selectedMarkerId={selectedPlaceId}
        onMarkerSelect={onSelectMarker}
        onViewportChangeEnd={handleViewportChange}
        onTileError={() => setTileError(true)}
      />

      {tileError && (
        <div className="absolute left-3 top-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
          지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.
        </div>
      )}

      {/* "이 지역 재검색" — 상단 중앙. 네이버/카카오/구글맵 모바일 표준 위치이며,
          하단의 list/map 토글(모바일)과 겹치지 않는다. */}
      {showResearch && pendingBboxStr && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => {
              onResearchInArea(pendingBboxStr);
              setPendingViewport(null);
            }}
            className="gap-1 shadow-md"
          >
            <RefreshCcw className="size-3.5" />이 지역에서 재검색
          </Button>
        </div>
      )}

      {/* 우측 상단 컨트롤 — 가로 배치. "전체 영역"(bbox 있을 때) 왼쪽, "내 위치"
          오른쪽. 위치 버튼이 모서리에 고정되어 "전체 영역" 토글 시 안 흔들린다. */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {appliedBbox && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onClearArea();
              setPendingViewport(null);
            }}
            className="gap-1 bg-background/95 shadow-sm"
          >
            전체 영역
          </Button>
        )}
        {onRequestLocation && locationStatus && (
          <MyLocationButton
            status={locationStatus}
            onClick={onRequestLocation}
          />
        )}
      </div>
    </div>
  );
};

// 별도 컴포넌트로 뽑는 건 disabled/스피너/툴팁 분기를 본체 JSX 에서 떼어
// 가독성 유지. 권한 거부/비지원 시 클릭 무반응 + title 로 안내.
const MyLocationButton = ({
  status,
  onClick,
}: {
  status: UserLocationStatus;
  onClick: () => void;
}) => {
  const isPending = status === 'pending';
  const isBlocked = status === 'denied' || status === 'unavailable';
  const title =
    status === 'denied'
      ? '브라우저 위치 권한이 차단되어 있어요. 사이트 설정에서 허용해 주세요.'
      : status === 'unavailable'
        ? '이 환경에서는 위치를 사용할 수 없어요.'
        : '내 위치';
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={isBlocked || isPending}
      title={title}
      aria-label={title}
      className="size-8 bg-background/95 shadow-sm"
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LocateFixed className="size-4" />
      )}
    </Button>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div className="flex size-full items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
);

const formatBbox = (b: MapViewport['bbox']): string =>
  // 소수점 5자리 — vworld bbox 1m 정도 해상도면 충분, URL 길이 절약.
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');
