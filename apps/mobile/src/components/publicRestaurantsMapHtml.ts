import { buildVworldTileUrl } from '@repo/utils';

export interface MapInitialCenter {
  lat: number;
  lng: number;
}

// 지도 WebView/iframe 에 주입할 HTML. native 는 react-native-webview, web 은
// <iframe srcDoc> 으로 같은 HTML 을 띄운다. post 함수는 두 컨텍스트 모두 지원:
//   - native WebView: window.ReactNativeWebView.postMessage(string)
//   - iframe in web : window.parent.postMessage(string, '*')
// 부모 → 인스턴스 데이터 푸시:
//   - native: WebView.injectJavaScript("window.__setMarkers(...) / __setSelected(...) / __flyTo(...)")
//   - web   : iframe.contentWindow.postMessage({ type:'setData', ... })
//     → HTML 안에서 message 리스너가 받아 라우팅.
// 채널을 marker / selected 로 나눈 이유: 기존 __setData 가 selection 한 번
// 바꿀 때마다 vectorSource.clear() + N 개 feature 재생성이 일어나 비쌌다.
// 분리하면 selection 변경은 prev/next 두 setStyle 만으로 끝난다.
//
// initialCenter: 부모가 권한 결정 후 확정한 시작 좌표 (granted → 사용자 위치,
// denied → 서울시청). 마커가 들어와도 자동 fit 하지 않으므로 첫 화면이 흔들리지
// 않는다. "내 위치" 같은 이동은 __flyTo 메시지로 명시 호출.
export const buildPublicRestaurantsMapHtml = (
  apiKey: string,
  initialCenter: MapInitialCenter = { lat: 37.5665, lng: 126.978 },
): string => {
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
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(s);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(s, '*');
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
      center: ol.proj.fromLonLat([${initialCenter.lng}, ${initialCenter.lat}]),
      zoom: 15,
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

  var currentSelectedId = null;

  window.__setMarkers = function(payload) {
    var markers = (typeof payload === 'string') ? JSON.parse(payload) : payload;
    if (!markers) markers = [];
    vectorSource.clear();
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var feat = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([m.lng, m.lat])),
      });
      feat.setId(m.id);            // getFeatureById 로 selection 갱신 시 O(1) lookup
      feat.set('markerId', m.id);
      feat.set('label', m.name);   // selection 복원 시 라벨 재사용
      feat.setStyle(makePinStyle(null, false));
      vectorSource.addFeature(feat);
    }
    // markers 가 바뀌어도 현재 selection 은 유지 — 새 set 에 동일 id 가 있으면 다시 강조.
    if (currentSelectedId !== null) {
      var sel = vectorSource.getFeatureById(currentSelectedId);
      if (sel) sel.setStyle(makePinStyle(sel.get('label'), true));
    }
    // 자동 fit 없음 — 첫 진입의 중심은 부모가 initialCenter 로 결정. 마커가
    // 늦게 들어와서 화면이 갑자기 옮겨가는 일을 막는다.
  };

  window.__setSelected = function(payload) {
    var id = (typeof payload === 'string') ? JSON.parse(payload) : payload;
    var nextId = (id === undefined || id === null || id === '') ? null : id;
    if (nextId === currentSelectedId) return;
    if (currentSelectedId !== null) {
      var prev = vectorSource.getFeatureById(currentSelectedId);
      if (prev) prev.setStyle(makePinStyle(null, false));
    }
    currentSelectedId = nextId;
    if (nextId !== null) {
      var next = vectorSource.getFeatureById(nextId);
      if (next) next.setStyle(makePinStyle(next.get('label'), true));
    }
  };

  // "내 위치" 버튼 등에서 호출 — 부드럽게 중심 이동. 사용자가 패닝하지 않은
  // 상태로 도착하므로 userInteracted 플래그는 건드리지 않음.
  window.__flyTo = function(payload) {
    var p = (typeof payload === 'string') ? JSON.parse(payload) : payload;
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
    var view = map.getView();
    view.animate({
      center: ol.proj.fromLonLat([p.lng, p.lat]),
      zoom: typeof p.zoom === 'number' ? p.zoom : view.getZoom(),
      duration: 400,
    });
  };

  // 기존 호출자(예: iframe-in-web 의 postMessage type:setData) 호환 유지.
  window.__setData = function(payload) {
    var data = (typeof payload === 'string') ? JSON.parse(payload) : payload;
    window.__setMarkers(data.markers || []);
    window.__setSelected(data.selectedId !== undefined ? data.selectedId : null);
  };

  // iframe in web: 부모로부터 메시지 받아 처리. native WebView 는
  // injectJavaScript 로 직접 호출되므로 이 리스너가 트리거되지 않는다.
  window.addEventListener('message', function(e) {
    var msg;
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; }
    catch (err) { return; }
    if (!msg) return;
    if (msg.type === 'setData') window.__setData(msg);
    else if (msg.type === 'setMarkers') window.__setMarkers(msg.markers || []);
    else if (msg.type === 'setSelected') window.__setSelected(msg.id);
    else if (msg.type === 'flyTo') window.__flyTo(msg);
  });

  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
};
