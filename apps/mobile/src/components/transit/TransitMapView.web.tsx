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
import { ApiError, useMapPublicConfig, useTheme } from '@repo/shared';
import { buildTransitMapHtml } from './transitMapHtml';
import { parseTransitMapEvent, type TransitMapCmd } from './transitMapBridge';
import {
  useTransitMapSync,
  type TransitMapHandle,
  type TransitMapViewProps,
} from './useTransitMapSync';

// Expo Web 용 대중교통 지도 — react-native-webview 가 web 을 지원하지 않아
// 동일 HTML 을 <iframe srcDoc> 으로 띄운다. 전송만 다르고(postMessage ↔
// injectJavaScript) props→명령 변환은 useTransitMapSync 공용.
export const TransitMapView = forwardRef<TransitMapHandle, TransitMapViewProps>(
  function TransitMapView(props, ref) {
    const {
      initialCenter,
      active = true,
      markers,
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

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [ready, setReady] = useState(false);
    const [tileError, setTileError] = useState(false);

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

    const send = useCallback((cmd: TransitMapCmd) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(cmd), '*');
    }, []);

    useTransitMapSync(ready, send, {
      mode: theme.mode,
      active,
      markers,
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

    useEffect(() => {
      const handler = (e: MessageEvent) => {
        if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
        const msg = parseTransitMapEvent(e.data);
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
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
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
        <iframe
          ref={iframeRef}
          srcDoc={html}
          title="transit-map"
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
