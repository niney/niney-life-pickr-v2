import { buildVworldTileUrl } from '@repo/utils';

// 지도 WebView/iframe 에 주입할 HTML. native 는 react-native-webview, web 은
// <iframe srcDoc> 으로 같은 HTML 을 띄운다. post 함수는 두 컨텍스트 모두 지원:
//   - native WebView: window.ReactNativeWebView.postMessage(string)
//   - iframe in web : window.parent.postMessage(string, '*')
// 부모 → 인스턴스 데이터 푸시:
//   - native: WebView.injectJavaScript("window.__setMarkers(...) / __setSelected(...)")
//   - web   : iframe.contentWindow.postMessage({ type:'setData', ... })
//     → HTML 안에서 message 리스너가 받아 라우팅.
// 채널을 marker / selected 로 나눈 이유: 기존 __setData 가 selection 한 번
// 바꿀 때마다 vectorSource.clear() + N 개 feature 재생성이 일어나 비쌌다.
// 분리하면 selection 변경은 prev/next 두 setStyle 만으로 끝난다.
export const buildPublicRestaurantsMapHtml = (apiKey: string): string => {
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
    if (!firstFit && markers.length > 0) {
      firstFit = true;
      setTimeout(fitToMarkers, 50);
    }
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
  });

  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
};
