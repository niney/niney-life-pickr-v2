import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ApiError, useMapPublicConfig, useTheme } from '@repo/shared';
import { buildVworldTileUrl } from '@repo/utils';
import type { RestaurantPublicListItemType } from '@repo/api-contract';

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

  const html = useMemo(() => (apiKey ? buildMapHtml(apiKey) : ''), [apiKey]);

  // ready 신호가 오기 전에 markers/selection 이 바뀌면 마지막 값만 push 하면 됨.
  // ready 이후엔 매번 setData 로 동기화.
  useEffect(() => {
    if (!ready || !webRef.current) return;
    const payload = JSON.stringify({ markers, selectedId: selectedPlaceId });
    webRef.current.injectJavaScript(`window.__setData(${payload}); true;`);
  }, [ready, markers, selectedPlaceId]);

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
        <View style={[styles.toast, { borderColor: theme.colors.danger }]}>
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
          style={[styles.researchBtn, { backgroundColor: theme.colors.primary }]}
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
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
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
  toast: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  researchBtn: {
    position: 'absolute',
    top: 12,
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
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearAreaText: { fontSize: 12, fontWeight: '500' },
});

// WebView 에 주입할 HTML. OpenLayers 는 CDN 으로 받음 (esm.sh 안정성↑).
// __setData(payload) 으로 마커/선택 동기화. 마커 탭/뷰포트 변경은
// window.ReactNativeWebView.postMessage 로 RN 으로 보냄.
const buildMapHtml = (apiKey: string): string => {
  const tileUrl = buildVworldTileUrl(apiKey, 'Base');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@10.3.1/ol.css" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
  body { background: #f4f4f5; -webkit-tap-highlight-color: transparent; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/ol@10.3.1/dist/ol.js"></script>
<script>
(function() {
  var post = function(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  };

  var tileSource = new ol.source.XYZ({
    url: ${JSON.stringify(tileUrl)},
    crossOrigin: 'anonymous',
  });
  var errored = false;
  tileSource.on('tileloaderror', function() {
    if (errored) return;
    errored = true;
    post({ type: 'tileError' });
  });

  var baseLayer = new ol.layer.Tile({ source: tileSource });
  var vectorSource = new ol.source.Vector();
  var vectorLayer = new ol.layer.Vector({ source: vectorSource });

  var map = new ol.Map({
    target: 'map',
    layers: [baseLayer, vectorLayer],
    view: new ol.View({
      center: ol.proj.fromLonLat([126.978, 37.5665]),
      zoom: 13,
    }),
    controls: [],
  });

  var userInteracted = false;
  map.on('pointerdrag', function() { userInteracted = true; });
  map.getViewport().addEventListener('wheel', function() { userInteracted = true; });

  function computeBbox() {
    var v = map.getView();
    var size = map.getSize();
    if (!size) return null;
    var ext = v.calculateExtent(size);
    var a = ol.proj.toLonLat([ext[0], ext[1]]);
    var b = ol.proj.toLonLat([ext[2], ext[3]]);
    return { minLng: a[0], minLat: a[1], maxLng: b[0], maxLat: b[1] };
  }

  map.on('moveend', function() {
    if (!userInteracted) return;
    var bbox = computeBbox();
    if (bbox) post({ type: 'viewport', bbox: bbox });
  });

  map.on('click', function(evt) {
    var feat = map.forEachFeatureAtPixel(evt.pixel, function(f) { return f; }, { hitTolerance: 4 });
    if (feat) {
      var id = feat.get('markerId');
      if (id) post({ type: 'marker', id: id });
    }
  });

  function makePinStyle(label, selected) {
    var fill = selected ? '#dc2626' : '#ef4444';
    var size = selected ? 40 : 32;
    var height = selected ? 60 : 48;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + height + '" viewBox="0 0 32 48">'
      + '<path fill="' + fill + '" stroke="#fff" stroke-width="2" d="M16 2C8.268 2 2 8.268 2 16c0 10 14 30 14 30s14-20 14-30c0-7.732-6.268-14-14-14z"/>'
      + '<circle fill="#fff" cx="16" cy="16" r="6"/></svg>';
    var styleObj = {
      image: new ol.style.Icon({
        anchor: [0.5, 1],
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      }),
    };
    if (label) {
      styleObj.text = new ol.style.Text({
        text: label,
        offsetY: -(height + 6),
        font: (selected ? 'bold ' : '') + '12px sans-serif',
        fill: new ol.style.Fill({ color: '#0f172a' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
      });
    }
    return new ol.style.Style(styleObj);
  }

  function fitToMarkers() {
    var ext = vectorSource.getExtent();
    if (!ext || !isFinite(ext[0])) return;
    map.getView().fit(ext, { padding: [60,60,60,60], duration: 300, maxZoom: 17 });
  }

  var firstFit = false;
  window.__setData = function(payload) {
    var data = (typeof payload === 'string') ? JSON.parse(payload) : payload;
    var markers = data.markers || [];
    var selectedId = data.selectedId || null;
    vectorSource.clear();
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var feat = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([m.lng, m.lat])),
      });
      feat.set('markerId', m.id);
      var isSelected = m.id === selectedId;
      feat.setStyle(makePinStyle(isSelected ? m.name : null, isSelected));
      vectorSource.addFeature(feat);
    }
    // 첫 마커 셋 들어오면 한 번 fit. 이후엔 사용자 인터랙션을 우선.
    if (!firstFit && markers.length > 0) {
      firstFit = true;
      setTimeout(fitToMarkers, 50);
    }
  };

  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
};
