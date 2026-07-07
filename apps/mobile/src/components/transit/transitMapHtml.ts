import { buildMyLocationMarkerDataUrl, buildVworldTileUrl } from '@repo/utils';

// 대중교통 지도 WebView/iframe 에 주입할 HTML 빌더.
//
// 웹 MapCanvas.tsx(OpenLayers 코어)의 대중교통 필요분을 HTML 문자열로 포팅한
// 단일 소스다. 식당 지도(publicRestaurantsMapHtml.ts)와 분리한 이유:
//  - 공유 가능한 건 타일/ready/post 스캐폴드 정도뿐, 레이어 구조(4종)와
//    차량 tween·follow 는 대중교통 전용.
//  - 식당 HTML 은 재마운트 민감 프로덕션 코드 — 회귀 리스크 격리.
//
// 레이어 순서(아래→위): 노선 형상 → 겸표시(보조) → 정류장/역 마커 → 내 위치
// → 차량. fitToMarkers 는 마커 소스 extent 만 사용(노선 54km 가 fit 을 끌고
// 가지 않게).
//
// RN → Web 은 window.__cmd(cmd) 단일 진입점(transitMapBridge.ts 의
// TransitMapCmd), Web → RN 은 post(JSON)(TransitMapEvent). iframe(web)은
// message 리스너가 받아 __cmd 로 위임한다.
//
// 차량 보간(rAF tween)은 이 HTML 안에서 돈다 — RN 은 폴링(15/30s)당 1회만
// setVehicles 를 주입하고, 그 사이 부드러움은 여기서 만든다(60fps 좌표를
// injectJavaScript 로 밀 수 없음). 반면 도메인 보간(locateTrain 등)은 RN
// 어댑터가 @repo/utils 로 계산해 좌표/via 만 넘긴다.

export interface TransitMapInitialCenter {
  lat: number;
  lng: number;
  zoom?: number;
}

export const buildTransitMapHtml = (
  apiKey: string,
  initialCenter: TransitMapInitialCenter = { lat: 37.5665, lng: 126.978 },
  mode: 'light' | 'dark' = 'light',
): string => {
  const dark = mode === 'dark';
  const baseTileUrl = buildVworldTileUrl(apiKey, 'Base');
  const darkTileUrl = buildVworldTileUrl(apiKey, 'midnight');
  // 키 유효성 프로브용 저줌 타일(서울 부근 z7) — MapCanvas 와 동일 전략.
  const probeUrl = baseTileUrl.replace('{z}/{y}/{x}', '7/44/109');
  const myLocationIcon = buildMyLocationMarkerDataUrl();
  const initialZoom = initialCenter.zoom ?? 15;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@10.3.1/ol.css" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
  body { background: ${dark ? '#09090b' : '#f4f4f5'}; -webkit-tap-highlight-color: transparent; }
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

  // WebView 내부 예외를 RN 디버깅 채널로 — 조용한 백지 실패 방지.
  window.onerror = function(message, _src, line) {
    post({ type: 'error', message: String(message) + ' @' + line });
  };

  var BASE_TILE_URL = ${JSON.stringify(baseTileUrl)};
  var DARK_TILE_URL = ${JSON.stringify(darkTileUrl)};
  var PROBE_URL = ${JSON.stringify(probeUrl)};
  var MY_LOCATION_ICON = ${JSON.stringify(myLocationIcon)};
  var darkBg = ${dark};

  // 이 줌 이상부터 라벨 + 풀사이즈 아이콘, 미만은 라벨 없는 축소 아이콘.
  // (declutter 는 안 씀 — feature 단위라 라벨 겹침 시 핀까지 사라진다.)
  var LABEL_VISIBLE_ZOOM = 14;
  var SMALL_ICON_SCALE = 0.55;

  var tileSource = new ol.source.XYZ({
    url: darkBg ? DARK_TILE_URL : BASE_TILE_URL,
    crossOrigin: 'anonymous',
  });

  // ── 타일 프로브 — 연속 실패는 키 무효와 동의어가 아니다(패닝 버스트로 인한
  // 클라이언트측 실패가 흔함). 임계 초과 시 저줌 타일을 fetch 로 직접 검사:
  // 401/403 만 "키 거부 확정", 200+image/* 는 회복(억제/해제), 그 외/throw 는
  // 판정 불가로 상태 유지. 타일 한 장이라도 성공하면 즉시 리셋.
  var FAIL_THRESHOLD = 8;
  var PROBE_COOLDOWN_MS = 5000;
  var consecutiveErrors = 0;
  var reported = false;
  var probing = false;
  var lastProbeAt = 0;

  function setReported(next) {
    if (reported === next) return;
    reported = next;
    post({ type: 'tileError', hasError: next });
  }

  function probeKeyOnBurst() {
    if (probing) return;
    probing = true;
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, 4000);
    fetch(PROBE_URL, { signal: controller.signal })
      .then(function(res) {
        if (res.status === 401 || res.status === 403) {
          setReported(true);
        } else if (res.ok && (res.headers.get('content-type') || '').indexOf('image/') === 0) {
          consecutiveErrors = 0;
          setReported(false);
        }
      })
      .catch(function() { /* 판정 불가 — 상태 유지 */ })
      .then(function() {
        clearTimeout(timer);
        probing = false;
      });
  }

  tileSource.on('tileloaderror', function() {
    consecutiveErrors += 1;
    if (consecutiveErrors >= FAIL_THRESHOLD && !probing) {
      var now = Date.now();
      if (now - lastProbeAt >= PROBE_COOLDOWN_MS) {
        lastProbeAt = now;
        probeKeyOnBurst();
      }
    }
  });
  tileSource.on('tileloadend', function() {
    consecutiveErrors = 0;
    setReported(false);
  });

  // ── 소스/레이어 — 아래→위: 노선 → 겸표시 → 마커 → 내위치 → 차량 ─────────
  var routeLineSource = new ol.source.Vector();
  var overlaySource = new ol.source.Vector();
  var markerSource = new ol.source.Vector();
  var myLocationSource = new ol.source.Vector();
  var vehicleSource = new ol.source.Vector();

  var map = new ol.Map({
    target: 'map',
    layers: [
      new ol.layer.Tile({ source: tileSource }),
      new ol.layer.Vector({ source: routeLineSource }),
      new ol.layer.Vector({ source: overlaySource }),
      new ol.layer.Vector({ source: markerSource }),
      new ol.layer.Vector({ source: myLocationSource }),
      new ol.layer.Vector({ source: vehicleSource }),
    ],
    view: new ol.View({
      center: ol.proj.fromLonLat([${initialCenter.lng}, ${initialCenter.lat}]),
      zoom: ${initialZoom},
    }),
    controls: [],
  });

  // ── 상호작용/뷰포트 ─────────────────────────────────────────────────────────
  var userInteracted = false;
  var followId = null;

  // 추적 중 제스처 → 같은 프레임에 자체 해제 후 RN 에 알림(일시정지 UI 는 RN).
  function interruptFollow() {
    if (followId !== null) {
      followId = null;
      post({ type: 'followInterrupted' });
    }
  }
  map.on('pointerdrag', function() {
    userInteracted = true;
    interruptFollow();
  });
  map.getViewport().addEventListener('wheel', function() {
    userInteracted = true;
    interruptFollow();
  });

  function computeViewport() {
    var v = map.getView();
    var c = v.getCenter();
    var z = v.getZoom();
    var size = map.getSize();
    if (!c || z === undefined || !size) return null;
    var lonLat = ol.proj.toLonLat(c);
    var ext = v.calculateExtent(size);
    var a = ol.proj.toLonLat([ext[0], ext[1]]);
    var b = ol.proj.toLonLat([ext[2], ext[3]]);
    return {
      user: userInteracted,
      center: { lat: lonLat[1], lng: lonLat[0] },
      zoom: z,
      bbox: { minLng: a[0], minLat: a[1], maxLng: b[0], maxLat: b[1] },
    };
  }

  map.on('moveend', function() {
    var vp = computeViewport();
    if (vp) post(Object.assign({ type: 'viewport' }, vp));
  });
  map.once('postrender', function() {
    var vp = computeViewport();
    if (vp) post(Object.assign({ type: 'viewport' }, vp));
  });

  map.on('click', function(evt) {
    var f = map.forEachFeatureAtPixel(
      evt.pixel,
      function(feat) { return (feat.get('markerId') || feat.get('vehicleId')) ? feat : undefined; },
      { hitTolerance: 4 }
    );
    if (!f) return;
    var markerId = f.get('markerId');
    if (markerId) {
      post({ type: 'marker', id: markerId });
      return;
    }
    var vehicleId = f.get('vehicleId');
    if (vehicleId) post({ type: 'vehicle', id: vehicleId });
  });

  // ── 마커 스타일 — 선택은 style function 이 currentSelectedId 를 평가 시점에
  // 읽는다(선택 변경 = prev/next 2 피처 changed() 만). 줌 임계로 라벨/축소 제어.
  var currentSelectedId = null;

  function makeMarkerStyleFn(m) {
    return function(_feature, resolution) {
      var zoom = map.getView().getZoomForResolution(resolution);
      if (zoom === undefined) zoom = 15;
      var selected = currentSelectedId === m.id;
      // iconSel 이 있어야 "선택 핀" 모양 — 없으면(경유지 점 등) 항상 icon.
      var pin = selected && m.iconSel;
      var compact = !selected && zoom < LABEL_VISIBLE_ZOOM;
      var styleObj = {
        zIndex: selected ? 1000 : 0,
        image: new ol.style.Icon({
          anchor: pin ? [0.5, 1] : [0.5, 0.5],
          src: pin ? m.iconSel : m.icon,
          scale: compact ? SMALL_ICON_SCALE : 1,
        }),
      };
      if (m.label && !compact) {
        styleObj.text = new ol.style.Text({
          text: m.label,
          offsetY: pin ? -54 : 20,
          font: (selected ? 'bold 12px' : '11px') + ' sans-serif',
          fill: new ol.style.Fill({ color: darkBg ? '#f8fafc' : '#0f172a' }),
          stroke: new ol.style.Stroke({ color: darkBg ? '#0f172a' : '#fff', width: 3 }),
        });
      }
      return new ol.style.Style(styleObj);
    };
  }

  function fillMarkerSource(src, markers) {
    src.clear();
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var f = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([m.lng, m.lat])),
      });
      f.setId(m.id);
      f.set('markerId', m.id);
      f.setStyle(makeMarkerStyleFn(m));
      src.addFeature(f);
    }
  }

  // ── 노선 폴리라인 ───────────────────────────────────────────────────────────
  function strokeColorWithAlpha(hex, alpha) {
    var mch = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!mch) return hex;
    var n = parseInt(mch[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + alpha + ')';
  }

  // ── 차량 tween 소기하 — EPSG:3857 평면 전용(MapCanvas 포팅) ────────────────
  function buildCumLengths(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return cum;
  }

  function samplePathAt(pts, cum, s) {
    if (s <= 0) return pts[0];
    var total = cum[cum.length - 1];
    if (s >= total) return pts[pts.length - 1];
    var i = 1;
    while (cum[i] < s) i++;
    var segLen = cum[i] - cum[i - 1];
    var t = segLen > 0 ? (s - cum[i - 1]) / segLen : 0;
    return [
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
    ];
  }

  // 진행 방향(라디안, 북=0 시계방향) — OL Icon.rotation 규약(atan2(dx, dy)).
  function pathDirectionAt(pts, cum, s) {
    var total = cum[cum.length - 1];
    var sc = Math.min(Math.max(s, 0), total);
    var i = 1;
    while (i < cum.length - 1 && cum[i] < sc) i++;
    for (; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0];
      var dy = pts[i][1] - pts[i - 1][1];
      if (dx !== 0 || dy !== 0) return Math.atan2(dx, dy);
    }
    return null;
  }

  // p 의 경로 최근접 호길이 — 새 tween 이 현재 표시 좌표에서 이어지게 하는 투영.
  function projectPathS(pts, cum, p) {
    var bestS = 0;
    var bestD = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][0];
      var ay = pts[i][1];
      var dx = pts[i + 1][0] - ax;
      var dy = pts[i + 1][1] - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
      var d = Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t));
      if (d < bestD) {
        bestD = d;
        bestS = cum[i] + Math.sqrt(len2) * t;
      }
    }
    return { s: bestS, dist: bestD };
  }

  // ── 차량 상태 — feature 재사용 + geometry 만 rAF 갱신(프레임 clear 금지) ──
  var vehicleFeatures = {};   // id → ol.Feature (알약)
  var vehicleAnims = {};      // id → { pts, cum, s0, start, dur }
  var vehicleArrows = {};     // id → { feature, icon, src }
  var vehicleRaf = null;
  var mapActive = true;

  function makePillStyle(iconSrc) {
    // 알약은 화살표(zIndex 0) 위 — 같은 소스 내 렌더 순서 보장.
    return new ol.style.Style({
      zIndex: 1,
      image: new ol.style.Icon({ anchor: [0.5, 0.5], src: iconSrc }),
    });
  }

  // 방향 화살표 동기화 — 알약과 Point geometry 를 공유(이동 자동 동기), 회전만
  // Icon 인스턴스를 직접 돌린다. 회전 소스가 전혀 없으면 생성 보류(북쪽 고정
  // 화살표 오표시 방지), 기존 화살표는 마지막 회전 유지.
  function syncArrow(v, pill, rotationRad) {
    var cur = vehicleArrows[v.id];
    if (!v.dirIcon) {
      if (cur) {
        vehicleSource.removeFeature(cur.feature);
        delete vehicleArrows[v.id];
      }
      return;
    }
    if (cur && cur.src === v.dirIcon) {
      if (rotationRad !== null) cur.icon.setRotation(rotationRad);
      return;
    }
    var rot = rotationRad;
    if (rot === null && cur) rot = cur.icon.getRotation();
    if (cur) {
      vehicleSource.removeFeature(cur.feature);
      delete vehicleArrows[v.id];
    }
    if (rot === null || rot === undefined) return;
    var icon = new ol.style.Icon({ anchor: [0.5, 0.5], src: v.dirIcon, rotation: rot });
    var f = new ol.Feature({ geometry: pill.getGeometry() });
    f.setStyle(new ol.style.Style({ image: icon, zIndex: 0 }));
    vehicleSource.addFeature(f);
    vehicleArrows[v.id] = { feature: f, icon: icon, src: v.dirIcon };
  }

  function anyAnims() {
    for (var k in vehicleAnims) return true;
    return false;
  }

  function startRafIfNeeded() {
    if (!mapActive || vehicleRaf !== null || !anyAnims()) return;
    var tick = function() {
      var t = performance.now();
      var active = false;
      for (var id in vehicleAnims) {
        var a = vehicleAnims[id];
        var f = vehicleFeatures[id];
        if (!f) {
          delete vehicleAnims[id];
          continue;
        }
        var total = a.cum[a.cum.length - 1];
        var p = Math.min(1, (t - a.start) / a.dur);
        var s = a.s0 + (total - a.s0) * p;
        f.getGeometry().setCoordinates(samplePathAt(a.pts, a.cum, s));
        var arrow = vehicleArrows[id];
        if (arrow) {
          var dir = pathDirectionAt(a.pts, a.cum, s);
          if (dir !== null) arrow.icon.setRotation(dir);
        }
        if (p < 1) active = true;
        else delete vehicleAnims[id];
      }
      // 따라가기 — 대상 차량 좌표로 매 프레임 센터(tween 이 부드러움을 만든다).
      if (followId !== null) {
        var ff = vehicleFeatures[followId];
        if (ff) map.getView().setCenter(ff.getGeometry().getCoordinates());
      }
      vehicleRaf = active ? requestAnimationFrame(tick) : null;
    };
    vehicleRaf = requestAnimationFrame(tick);
  }

  function applyVehicles(vehicles, tweenMs) {
    var now = performance.now();
    var seen = {};
    for (var i = 0; i < vehicles.length; i++) {
      var v = vehicles[i];
      seen[v.id] = true;
      var to = ol.proj.fromLonLat([v.lng, v.lat]);
      var bearingRad = (v.bearingDeg !== null && v.bearingDeg !== undefined)
        ? (v.bearingDeg * Math.PI) / 180
        : null;
      var existing = vehicleFeatures[v.id];
      if (!existing) {
        var nf = new ol.Feature({ geometry: new ol.geom.Point(to) });
        nf.set('vehicleId', v.id);
        nf.setStyle(makePillStyle(v.icon));
        vehicleSource.addFeature(nf);
        vehicleFeatures[v.id] = nf;
        delete vehicleAnims[v.id]; // 신규는 tween 없이 즉시 위치
        syncArrow(v, nf, bearingRad);
        continue;
      }
      var geom = existing.getGeometry();
      var from = geom.getCoordinates();
      existing.setStyle(makePillStyle(v.icon));
      // via 는 이전 폴링 위치 기준이라 현재 표시 좌표(from)와 어긋날 수 있다.
      // 투영으로 이어 붙이되 40m 넘게 벗어나면(모드 전환/데이터 점프) 직선 폴백.
      var handled = false;
      if (v.via && v.via.length >= 2) {
        var viaPts = [];
        for (var j = 0; j < v.via.length; j++) {
          viaPts.push(ol.proj.fromLonLat([v.via[j][1], v.via[j][0]]));
        }
        var cum = buildCumLengths(viaPts);
        var proj = projectPathS(viaPts, cum, from);
        if (proj.dist <= 40) {
          handled = true;
          var remain = cum[cum.length - 1] - proj.s;
          if (remain < 0.5) {
            geom.setCoordinates(viaPts[viaPts.length - 1]);
            delete vehicleAnims[v.id];
            syncArrow(v, existing, bearingRad);
          } else {
            vehicleAnims[v.id] = { pts: viaPts, cum: cum, s0: proj.s, start: now, dur: tweenMs };
            var dirVia = bearingRad !== null ? bearingRad : pathDirectionAt(viaPts, cum, proj.s);
            syncArrow(v, existing, dirVia);
          }
        }
      }
      if (!handled) {
        if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.5) {
          geom.setCoordinates(to);
          delete vehicleAnims[v.id];
          syncArrow(v, existing, bearingRad);
        } else {
          var pts = [from, to];
          var cum2 = buildCumLengths(pts);
          vehicleAnims[v.id] = { pts: pts, cum: cum2, s0: 0, start: now, dur: tweenMs };
          var dirLine = bearingRad !== null ? bearingRad : pathDirectionAt(pts, cum2, 0);
          syncArrow(v, existing, dirLine);
        }
      }
    }
    // 이번 폴링에 없는 차량 제거(운행 종료/구간 이탈).
    for (var id2 in vehicleFeatures) {
      if (!seen[id2]) {
        vehicleSource.removeFeature(vehicleFeatures[id2]);
        delete vehicleFeatures[id2];
        delete vehicleAnims[id2];
        var arrow2 = vehicleArrows[id2];
        if (arrow2) {
          vehicleSource.removeFeature(arrow2.feature);
          delete vehicleArrows[id2];
        }
      }
    }
    startRafIfNeeded();
  }

  // ── 명령 처리 — 단일 진입점 ─────────────────────────────────────────────────
  var handlers = {
    setMode: function(cmd) {
      var nextDark = cmd.mode === 'dark';
      if (nextDark === darkBg) return;
      darkBg = nextDark;
      tileSource.setUrl(darkBg ? DARK_TILE_URL : BASE_TILE_URL);
      document.body.style.background = darkBg ? '#09090b' : '#f4f4f5';
      // 라벨 색 재평가 — style function 이 darkBg 를 읽으므로 changed() 만.
      markerSource.changed();
      overlaySource.changed();
    },
    setActive: function(cmd) {
      if (cmd.active) {
        mapActive = true;
        startRafIfNeeded();
        return;
      }
      mapActive = false;
      if (vehicleRaf !== null) {
        cancelAnimationFrame(vehicleRaf);
        vehicleRaf = null;
      }
      // 진행 중 tween 은 목표점으로 스냅 — 복귀 시 다음 폴링이 재보간한다.
      for (var id in vehicleAnims) {
        var a = vehicleAnims[id];
        var f = vehicleFeatures[id];
        if (f) f.getGeometry().setCoordinates(a.pts[a.pts.length - 1]);
        delete vehicleAnims[id];
      }
    },
    setMarkers: function(cmd) {
      fillMarkerSource(markerSource, cmd.markers || []);
    },
    setSelected: function(cmd) {
      var nextId = (cmd.id === undefined || cmd.id === null || cmd.id === '') ? null : cmd.id;
      if (nextId === currentSelectedId) return;
      var prevId = currentSelectedId;
      currentSelectedId = nextId;
      // prev/next 2 피처만 재평가 — style function 이 currentSelectedId 를 읽음.
      if (prevId !== null) {
        var prev = markerSource.getFeatureById(prevId);
        if (prev) prev.changed();
      }
      if (nextId !== null) {
        var next = markerSource.getFeatureById(nextId);
        if (next) next.changed();
      }
    },
    setOverlayMarkers: function(cmd) {
      fillMarkerSource(overlaySource, cmd.markers || []);
    },
    setRouteLines: function(cmd) {
      routeLineSource.clear();
      var lines = cmd.lines || [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.pts || line.pts.length < 2) continue;
        var coords = [];
        for (var j = 0; j < line.pts.length; j++) {
          coords.push(ol.proj.fromLonLat([line.pts[j][1], line.pts[j][0]]));
        }
        var f = new ol.Feature({ geometry: new ol.geom.LineString(coords) });
        f.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: strokeColorWithAlpha(line.color, 0.85),
            width: 5,
            lineCap: 'round',
            lineJoin: 'round',
          }),
        }));
        routeLineSource.addFeature(f);
      }
    },
    setVehicles: function(cmd) {
      applyVehicles(cmd.vehicles || [], cmd.tweenMs || 14000);
    },
    setFollow: function(cmd) {
      var id = (cmd.id === undefined || cmd.id === null || cmd.id === '') ? null : cmd.id;
      followId = id;
      if (id === null) return;
      var f = vehicleFeatures[id];
      if (!f) return;
      userInteracted = false;
      map.getView().animate({
        center: f.getGeometry().getCoordinates(),
        duration: 300,
      });
    },
    setMyLocation: function(cmd) {
      myLocationSource.clear();
      if (!cmd.coord) return;
      var f = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([cmd.coord.lng, cmd.coord.lat])),
      });
      f.setStyle(new ol.style.Style({
        image: new ol.style.Icon({ anchor: [0.5, 0.5], src: MY_LOCATION_ICON }),
      }));
      myLocationSource.addFeature(f);
    },
    flyTo: function(cmd) {
      if (typeof cmd.lat !== 'number' || typeof cmd.lng !== 'number') return;
      var view = map.getView();
      userInteracted = false;
      view.animate({
        center: ol.proj.fromLonLat([cmd.lng, cmd.lat]),
        zoom: typeof cmd.zoom === 'number' ? cmd.zoom : view.getZoom(),
        duration: 400,
      });
    },
    flyToZoomIn: function(cmd) {
      if (typeof cmd.lat !== 'number' || typeof cmd.lng !== 'number') return;
      var view = map.getView();
      var cur = view.getZoom();
      userInteracted = false;
      view.animate({
        center: ol.proj.fromLonLat([cmd.lng, cmd.lat]),
        zoom: Math.max(cmd.minZoom, cur === undefined ? cmd.minZoom : cur),
        duration: 350,
      });
    },
    fitToMarkers: function(cmd) {
      var ext = markerSource.getExtent();
      if (!ext || !isFinite(ext[0])) return;
      var padding = typeof cmd.padding === 'number' ? cmd.padding : 60;
      userInteracted = false;
      map.getView().fit(ext, {
        padding: [padding, padding, padding, padding],
        duration: 350,
        maxZoom: 17,
      });
    },
    fitToCoords: function(cmd) {
      var coords = cmd.coords || [];
      if (coords.length === 0) return;
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < coords.length; i++) {
        var xy = ol.proj.fromLonLat([coords[i][1], coords[i][0]]);
        if (xy[0] < minX) minX = xy[0];
        if (xy[0] > maxX) maxX = xy[0];
        if (xy[1] < minY) minY = xy[1];
        if (xy[1] > maxY) maxY = xy[1];
      }
      if (!isFinite(minX)) return;
      var padding2 = typeof cmd.padding === 'number' ? cmd.padding : 60;
      userInteracted = false;
      map.getView().fit([minX, minY, maxX, maxY], {
        padding: [padding2, padding2, padding2, padding2],
        duration: 350,
        maxZoom: 17,
      });
    },
    setViewport: function(cmd) {
      // 무애니메이션 즉시 복원 — 재마운트 폴백 전용.
      var view = map.getView();
      userInteracted = false;
      view.setCenter(ol.proj.fromLonLat([cmd.lng, cmd.lat]));
      view.setZoom(cmd.zoom);
    },
  };

  window.__cmd = function(payload) {
    var cmd = (typeof payload === 'string') ? JSON.parse(payload) : payload;
    if (!cmd || !cmd.type) return;
    var h = handlers[cmd.type];
    if (h) h(cmd);
  };

  // iframe(web): 부모 postMessage 를 __cmd 로 위임. native 는 injectJavaScript
  // 로 __cmd 를 직접 호출하므로 이 리스너가 트리거되지 않는다.
  window.addEventListener('message', function(e) {
    var msg;
    try { msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; }
    catch (err) { return; }
    if (!msg || !msg.type) return;
    window.__cmd(msg);
  });

  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
};
