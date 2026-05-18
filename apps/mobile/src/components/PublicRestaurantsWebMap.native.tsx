import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ApiError, useMapPublicConfig, useTheme } from '@repo/shared';
import type { RestaurantPublicListItemType } from '@repo/api-contract';
import { buildPublicRestaurantsMapHtml } from './publicRestaurantsMapHtml';

interface Marker {
  id: string;
  lat: number;
  lng: number;
  name: string;
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
  // 지도 위 floating 버튼('이 지역 재검색' / '전체 영역' / 타일 에러 토스트)
  // 들이 시작할 y 픽셀. 부모는 보통 insets.top + 헤더 카드 높이 를 넘겨,
  // 카드 바로 아래에서 버튼들이 12px 간격으로 깔리게 한다.
  topInset?: number;
  onSelectMarker(placeId: string): void;
  onResearchInArea(bbox: string): void;
  onClearArea(): void;
}

const formatBbox = (b: Bbox): string =>
  [b.minLng, b.minLat, b.maxLng, b.maxLat].map((n) => n.toFixed(5)).join(',');

// 모바일 공개 맛집 지도. WebView 안에서 OpenLayers + VWorld 타일을 그대로
// 사용 (웹 MapCanvas 와 동일 렌더 파이프). RN ↔ Web 은 postMessage 채널 하나로:
//  - Web → RN: { type: 'marker', id } | { type: 'viewport', bbox } | { type: 'tileError' }
//  - RN → Web: 데이터/선택 변경 시마다 setData(...) injectJavaScript
export const PublicRestaurantsWebMap = ({
  items,
  selectedPlaceId,
  appliedBbox,
  topInset = 0,
  onSelectMarker,
  onResearchInArea,
  onClearArea,
}: Props) => {
  const theme = useTheme();
  const config = useMapPublicConfig();
  const apiKey = config.data?.apiKey ?? null;
  const keyMissing =
    config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

  const webRef = useRef<WebView | null>(null);
  const [pendingBbox, setPendingBbox] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  // 좌표 있는 식당만. 선택된 항목에만 이름 라벨 노출 (시각 노이즈 방지).
  const markers: Marker[] = useMemo(
    () =>
      items
        .filter((it) => it.latitude !== null && it.longitude !== null)
        .map((it) => ({
          id: it.placeId,
          lat: it.latitude!,
          lng: it.longitude!,
          name: it.name,
        })),
    [items],
  );

  const html = useMemo(
    () => (apiKey ? buildPublicRestaurantsMapHtml(apiKey) : ''),
    [apiKey],
  );

  // markers 와 selection 채널을 분리. selection 변경 시 vectorSource.clear() +
  // N 개 feature 재생성을 피하기 위함 — Web 측 __setSelected 는 prev/next 두
  // setStyle 만 수행.
  useEffect(() => {
    if (!ready || !webRef.current) return;
    const payload = JSON.stringify(markers);
    webRef.current.injectJavaScript(`window.__setMarkers(${payload}); true;`);
  }, [ready, markers]);

  useEffect(() => {
    if (!ready || !webRef.current) return;
    const payload = JSON.stringify(selectedPlaceId);
    webRef.current.injectJavaScript(`window.__setSelected(${payload}); true;`);
  }, [ready, selectedPlaceId]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'marker' && typeof msg.id === 'string') {
        onSelectMarker(msg.id);
      } else if (msg.type === 'viewport' && msg.bbox) {
        const b = msg.bbox as Bbox;
        const next = formatBbox(b);
        setPendingBbox(next);
      } else if (msg.type === 'tileError') {
        setTileError(true);
      }
    },
    [onSelectMarker],
  );

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

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        // 한국 지도라 mixedContent 가 잡힐 일은 거의 없지만 안전망.
        mixedContentMode="always"
        // 스크롤 동작은 OL 이 직접 처리 — RN 스크롤 끄기.
        scrollEnabled={false}
        style={styles.web}
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
          onPress={() => {
            onResearchInArea(pendingBbox);
            setPendingBbox(null);
          }}
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

      {appliedBbox && (
        <Pressable
          onPress={() => {
            onClearArea();
            setPendingBbox(null);
          }}
          style={[
            styles.clearAreaBtn,
            {
              top: 12 + topInset,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.clearAreaText, { color: theme.colors.text }]}>전체 영역</Text>
        </Pressable>
      )}
    </View>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.placeholder}>{children}</View>
);

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  web: { flex: 1, backgroundColor: 'transparent' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  placeholderText: { fontSize: 13, textAlign: 'center' },
  // top 은 인라인으로 동적 주입 (12 + topInset). 정적 12 두면 topInset 이 무시됨.
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  researchBtnText: { fontSize: 13, fontWeight: '600' },
  clearAreaBtn: {
    position: 'absolute',
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearAreaText: { fontSize: 12, fontWeight: '500' },
});

