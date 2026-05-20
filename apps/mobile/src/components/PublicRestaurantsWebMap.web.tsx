import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, useMapPublicConfig, useTheme } from '@repo/shared';
import type { RestaurantPublicListItemType } from '@repo/api-contract';
import {
  resolveRestaurantCategoryKey,
  type RestaurantCategoryKey,
} from '@repo/utils';
import { buildPublicRestaurantsMapHtml } from './publicRestaurantsMapHtml';
import type {
  UserLocationResult,
  UserLocationStatus,
} from '~/hooks/useUserLocationNative';

interface Marker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  categoryKey: RestaurantCategoryKey | null;
}

interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

interface Props {
  items: RestaurantPublicListItemType[];
  selectedPlaceId: string | null;
  appliedBbox: string | null;
  topInset?: number;
  initialCenter: { lat: number; lng: number };
  focusCoord?: { lat: number; lng: number } | null;
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => Promise<UserLocationResult>;
  onSelectMarker(placeId: string): void;
  onResearchInArea(bbox: string): void;
  onClearArea(): void;
}

const formatBbox = (b: Bbox): string =>
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');

// Expo Web 용 지도. react-native-webview 가 web 을 지원하지 않으므로 동일
// HTML 을 <iframe srcDoc> 으로 띄우고 window.postMessage 채널을 사용한다.
// iframe ↔ parent 통신:
//   - iframe → parent : window.parent.postMessage(string, '*')  ← HTML 안에서
//   - parent → iframe : iframeRef.contentWindow.postMessage({type:'setData'…})
export const PublicRestaurantsWebMap = ({
  items,
  selectedPlaceId,
  appliedBbox,
  topInset = 0,
  initialCenter,
  focusCoord,
  locationStatus,
  onRequestLocation,
  onSelectMarker,
  onResearchInArea,
  onClearArea,
}: Props) => {
  const theme = useTheme();
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [pendingBbox, setPendingBbox] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  const markers: Marker[] = useMemo(
    () =>
      items
        .filter((it) => it.latitude !== null && it.longitude !== null)
        .map((it) => ({
          id: it.placeId,
          lat: it.latitude!,
          lng: it.longitude!,
          name: it.name,
          categoryKey: resolveRestaurantCategoryKey(it.category),
        })),
    [items],
  );

  // HTML 은 apiKey 가 처음 들어온 시점의 initialCenter 로 한 번만 빌드. 이후
  // 부모가 새 center 를 줘도 iframe 자체는 재마운트하지 않음 (가능하면 web 도
  // 동일 안정성 패턴 유지). 추가 이동은 flyTo 메시지로.
  const initialHtmlRef = useRef<{ key: string; html: string } | null>(null);
  const html = useMemo(() => {
    if (!apiKey) return '';
    if (initialHtmlRef.current && initialHtmlRef.current.key === apiKey) {
      return initialHtmlRef.current.html;
    }
    const built = buildPublicRestaurantsMapHtml(apiKey, initialCenter);
    initialHtmlRef.current = { key: apiKey, html: built };
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (msg.type === 'ready') setReady(true);
      else if (msg.type === 'marker' && typeof msg.id === 'string') onSelectMarker(msg.id);
      else if (msg.type === 'viewport' && msg.bbox)
        setPendingBbox(formatBbox(msg.bbox as Bbox));
      else if (msg.type === 'tileError') setTileError(true);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelectMarker]);

  useEffect(() => {
    if (!ready) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ type: 'setData', markers, selectedId: selectedPlaceId }),
      '*',
    );
  }, [ready, markers, selectedPlaceId]);

  // 리스트 카드 선택 → 그 식당 좌표로 자동 fly + zoom in. markers 는 deps 에
  // 안 넣음 — selection 자체 변경 시점에만 fly.
  useEffect(() => {
    if (!ready || !selectedPlaceId) return;
    const m = markers.find((x) => x.id === selectedPlaceId);
    if (!m) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ type: 'flyTo', lat: m.lat, lng: m.lng, zoom: 17 }),
      '*',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedPlaceId]);

  useEffect(() => {
    if (!ready || !focusCoord) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      JSON.stringify({ type: 'flyTo', lat: focusCoord.lat, lng: focusCoord.lng }),
      '*',
    );
  }, [ready, focusCoord]);

  // hook 순서 보존을 위해 early return 이전에 선언.
  const handleResearchPress = useCallback(() => {
    if (!pendingBbox) return;
    onResearchInArea(pendingBbox);
    setPendingBbox(null);
  }, [pendingBbox, onResearchInArea]);

  if (config.isLoading) {
    return (
      <Placeholder>
        <ActivityIndicator />
        <Text style={[styles.placeholderText, { color: theme.colors.textMuted }]}>
          지도 키 확인 중…
        </Text>
      </Placeholder>
    );
  }
  if (keyMissing) {
    return (
      <Placeholder>
        <Text style={[styles.placeholderText, { color: theme.colors.textMuted }]}>
          지도 키가 등록되지 않았습니다.{'\n'}
          관리자가 설정 &gt; 지도에서 vworld 키를 등록하면 표시됩니다.
        </Text>
      </Placeholder>
    );
  }
  if (config.isError || !apiKey) {
    return (
      <Placeholder>
        <Text style={[styles.placeholderText, { color: theme.colors.textMuted }]}>
          지도 설정을 불러오지 못했습니다.
        </Text>
      </Placeholder>
    );
  }

  const showResearch = pendingBbox !== null && pendingBbox !== appliedBbox;
  const showLocation = !!onRequestLocation && !!locationStatus;
  const locationDisabled =
    locationStatus === 'pending' ||
    locationStatus === 'denied' ||
    locationStatus === 'unavailable';

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="map"
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'transparent',
        }}
      />

      {tileError && (
        <View
          style={[styles.toast, { top: 12 + topInset, borderColor: theme.colors.danger }]}
        >
          <Text style={{ color: theme.colors.danger, fontSize: 12 }}>
            지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.
          </Text>
        </View>
      )}

      {showResearch && pendingBbox && (
        <Pressable
          onPress={handleResearchPress}
          style={[
            styles.researchBtn,
            { top: 12 + topInset, backgroundColor: theme.colors.primary },
          ]}
        >
          <Text style={[styles.researchBtnText, { color: theme.colors.primaryText }]}>
            이 지역에서 재검색
          </Text>
        </Pressable>
      )}

      <View style={[styles.topRightRow, { top: 12 + topInset }]}>
        {appliedBbox && (
          <Pressable
            onPress={() => {
              onClearArea();
              setPendingBbox(null);
            }}
            style={[
              styles.clearAreaBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.clearAreaText, { color: theme.colors.text }]}>전체 영역</Text>
          </Pressable>
        )}
        {showLocation && (
          <Pressable
            onPress={onRequestLocation}
            disabled={locationDisabled}
            style={[
              styles.locationBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: locationDisabled && locationStatus !== 'pending' ? 0.5 : 1,
              },
            ]}
          >
            {locationStatus === 'pending' ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <Text style={styles.locationIcon}>📍</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.placeholder}>{children}</View>
);

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  placeholderText: { fontSize: 13, textAlign: 'center' },
  toast: {
    position: 'absolute',
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  researchBtn: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  researchBtnText: { fontSize: 13, fontWeight: '600' },
  topRightRow: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearAreaBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAreaText: { fontSize: 12, fontWeight: '500' },
  locationBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationIcon: { fontSize: 16, lineHeight: 18 },
});
