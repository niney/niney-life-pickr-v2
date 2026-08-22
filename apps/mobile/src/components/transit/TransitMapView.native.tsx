import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ApiError, useMapPublicConfig, useTheme } from '@repo/shared';
import { buildTransitMapHtml } from './transitMapHtml';
import { parseTransitMapEvent, type TransitMapCmd } from './transitMapBridge';
import {
  useTransitMapSync,
  type TransitMapHandle,
  type TransitMapViewProps,
} from './useTransitMapSync';

// 대중교통 지도 — WebView 호스트. OL 렌더링·차량 tween 은 전부 HTML
// (transitMapHtml.ts) 안에서 돌고, 이 컴포넌트는 ① props→명령 동기화
// (useTransitMapSync) ② 이벤트 파싱→콜백 ③ 지도 상태 플레이스홀더/타일 에러
// 토스트만 담당한다. UI 오버레이(재검색 버튼·따라가기 칩 등)는 화면 쪽 책임.
//
// WebView 는 apiKey 확정 후 1회만 마운트되고 재마운트하지 않는다(식당 지도의
// reanimated worklet 충돌 선례). 테마/데이터 변경은 전부 __cmd 주입으로.
export const TransitMapView = forwardRef<TransitMapHandle, TransitMapViewProps>(
  function TransitMapView(props, ref) {
    const {
      initialCenter,
      active = true,
      markers,
      markerIcons = null,
      selectedId = null,
      overlayMarkers,
      routeLines = null,
      vehicles,
      vehicleTweenMs = 14_000,
      followVehicleId = null,
      myLocation = null,
      topInset = 0,
      viewBottomInset = 0,
      onSelectMarker,
      onSelectVehicle,
      onFollowInterrupted,
      onViewportChangeEnd,
      onViewportSync,
    } = props;
    const theme = useTheme();
    const config = useMapPublicConfig();
    const apiKey = config.data?.apiKey ?? null;
    const keyMissing =
      config.isError && config.error instanceof ApiError && config.error.statusCode === 404;

    const webRef = useRef<WebView | null>(null);
    const [ready, setReady] = useState(false);
    const [tileError, setTileError] = useState(false);

    // 콜백은 ref 로 보관 — onMessage 가 콜백 참조 변경마다 재생성돼 WebView 로
    // 새 prop 이 내려가는 것을 막는다(MapCanvas 의 콜백 ref 패턴).
    const cbRef = useRef({
      onSelectMarker,
      onSelectVehicle,
      onFollowInterrupted,
      onViewportChangeEnd,
      onViewportSync,
    });
    useEffect(() => {
      cbRef.current = {
        onSelectMarker,
        onSelectVehicle,
        onFollowInterrupted,
        onViewportChangeEnd,
        onViewportSync,
      };
    });

    // HTML 은 apiKey 확정 시점의 initialCenter/테마로 1회 빌드. 이후 변경은
    // __cmd 로 — 재마운트 금지(worklets 충돌·지도 상태 유실 방지).
    const initialHtmlRef = useRef<{ key: string; html: string } | null>(null);
    const html = useMemo(() => {
      if (!apiKey) return '';
      if (initialHtmlRef.current && initialHtmlRef.current.key === apiKey) {
        return initialHtmlRef.current.html;
      }
      const built = buildTransitMapHtml(apiKey, initialCenter, theme.mode);
      initialHtmlRef.current = { key: apiKey, html: built };
      return built;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey]);

    const source = useMemo(() => ({ html }), [html]);

    const send = useCallback((cmd: TransitMapCmd) => {
      webRef.current?.injectJavaScript(
        `window.__cmd(${JSON.stringify(cmd)}); true;`,
      );
    }, []);

    useTransitMapSync(ready, send, {
      mode: theme.mode,
      active,
      markers,
      markerIcons,
      selectedId,
      overlayMarkers: overlayMarkers ?? [],
      routeLines,
      vehicles: vehicles ?? [],
      vehicleTweenMs,
      followVehicleId,
      myLocation,
      viewBottomInset,
    });

    useImperativeHandle(
      ref,
      () => ({
        flyTo(lat, lng, zoom) {
          send({ type: 'flyTo', lat, lng, zoom });
        },
        flyToZoomIn(lat, lng, minZoom) {
          send({ type: 'flyToZoomIn', lat, lng, minZoom });
        },
        fitToMarkers(padding) {
          send({ type: 'fitToMarkers', padding });
        },
        fitToCoords(coords, padding) {
          send({
            type: 'fitToCoords',
            coords: coords.map((c) => [c.lat, c.lng] as [number, number]),
            padding,
          });
        },
      }),
      [send],
    );

    const onMessage = useCallback((e: WebViewMessageEvent) => {
      const msg = parseTransitMapEvent(e.nativeEvent.data);
      if (!msg) return;
      if (msg.type === 'ready') {
        setReady(true);
      } else if (msg.type === 'marker') {
        cbRef.current.onSelectMarker?.(msg.id);
      } else if (msg.type === 'vehicle') {
        cbRef.current.onSelectVehicle?.(msg.id);
      } else if (msg.type === 'viewport') {
        cbRef.current.onViewportSync?.(msg);
        if (msg.user) cbRef.current.onViewportChangeEnd?.(msg);
      } else if (msg.type === 'followInterrupted') {
        cbRef.current.onFollowInterrupted?.();
      } else if (msg.type === 'tileError') {
        setTileError(msg.hasError);
      } else if (msg.type === 'error') {
        if (__DEV__) {
          console.warn('[TransitMap]', msg.message);
        }
      }
    }, []);

    // iOS WKWebView 콘텐츠 프로세스 킬 — reload 후 ready 재수신 시
    // useTransitMapSync 의 effect 들이 전체 상태를 replay 한다.
    const handleTerminate = useCallback(() => {
      setReady(false);
      webRef.current?.reload();
    }, []);

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

    return (
      <View style={styles.container}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={source}
          onMessage={onMessage}
          onContentProcessDidTerminate={handleTerminate}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          // 스크롤/제스처는 OL 이 직접 처리 — RN 스크롤 끄기.
          scrollEnabled={false}
          style={styles.web}
        />

        {tileError && (
          <View
            style={[
              styles.toast,
              {
                top: 12 + topInset,
                borderColor: theme.colors.danger,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Text style={{ color: theme.colors.danger, fontSize: 12 }}>
              지도 타일을 불러오지 못했습니다. 키가 유효한지 확인해 주세요.
            </Text>
          </View>
        )}
      </View>
    );
  },
);

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
    left: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});
