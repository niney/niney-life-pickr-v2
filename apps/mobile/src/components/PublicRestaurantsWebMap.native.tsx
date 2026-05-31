import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
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
  // 지도 위 floating 버튼('이 지역 재검색' / '전체 영역' / 타일 에러 토스트)
  // 들이 시작할 y 픽셀. 부모는 보통 insets.top + 헤더 카드 높이 를 넘겨,
  // 카드 바로 아래에서 버튼들이 12px 간격으로 깔리게 한다.
  topInset?: number;
  // 부모가 권한 결정 후 확정한 시작 좌표. HTML 에 박혀 들어가 WebView 가
  // mount 되면서 처음부터 이 위치로 그려진다. 부모가 권한 결과를 받기 전
  // 이 컴포넌트를 mount 하지 않는 게 원칙 — 그래야 WebView 자체가
  // unmount/remount 안 되어 worklets 충돌이 없음.
  initialCenter: { lat: number; lng: number };
  // 외부에서 주입하는 중심 좌표(예: 사용자 geolocation 재요청 결과). 참조가
  // 새로워질 때마다 flyTo. null/undefined 면 무시.
  focusCoord?: { lat: number; lng: number } | null;
  // "내 위치" 버튼 표시/상태/콜백. undefined 면 버튼 자체 숨김.
  // onRequestLocation 은 결과를 Promise 로 반환 — denied/unavailable 상태에서
  // 클릭 시 silent refetch 결과로 분기하려면 await 가능해야 한다.
  locationStatus?: UserLocationStatus;
  onRequestLocation?: () => Promise<UserLocationResult>;
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

  const webRef = useRef<WebView | null>(null);
  const [pendingBbox, setPendingBbox] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  // 좌표 있는 식당만. categoryKey 는 자유 텍스트 카테고리를 8칩 키로 정규화 —
  // HTML 측은 키 lookup 으로 마커 아이콘 결정. 매칭 실패는 null → generic 아이콘.
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

  // HTML 은 apiKey + initialCenter 가 확정된 시점에 한 번 만들어진다. 이후
  // initialCenter 가 바뀌어도 (드물게) HTML 은 새로 만들지 않음 — WebView
  // 재마운트는 worklets 충돌 위험. 추가 이동은 __flyTo 로.
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

  // source 객체를 memoize — 부모 리렌더(setPendingBbox 등)마다 새 { html }
  // 참조가 WebView 로 내려가 source 재평가/리렌더가 도는 걸 막는다. html
  // 문자열은 apiKey 고정이라 사실상 1회만 생성.
  const source = useMemo(() => ({ html }), [html]);

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

  // 리스트 카드 선택 → 그 식당 좌표로 자동 fly + zoom in. markers 는 deps 에
  // 안 넣음 — selection 자체 변경 시점에만 fly 하고, markers 가 그 사이
  // 바뀌어도 (보통 list 클릭 직후엔 안 바뀜) 재발사 안 함.
  useEffect(() => {
    if (!ready || !webRef.current || !selectedPlaceId) return;
    const m = markers.find((x) => x.id === selectedPlaceId);
    if (!m) return;
    const payload = JSON.stringify({ lat: m.lat, lng: m.lng, zoom: 17 });
    webRef.current.injectJavaScript(`window.__flyTo(${payload}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedPlaceId]);

  // focusCoord 참조가 바뀌면 fly. "내 위치" 재요청 시 부모가 새 객체로 넘겨
  // 같은 좌표여도 다시 fly (idempotent — 이미 같은 중심이면 시각 변화 없음).
  useEffect(() => {
    if (!ready || !webRef.current || !focusCoord) return;
    const payload = JSON.stringify({ lat: focusCoord.lat, lng: focusCoord.lng });
    webRef.current.injectJavaScript(`window.__flyTo(${payload}); true;`);
  }, [ready, focusCoord]);

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

  // hook 순서 보존을 위해 early return 이전에 선언.
  // 사용자가 설정에서 권한 풀고 돌아온 경우 locationStatus 는 아직 stale
  // ('denied'). 무조건 refetch 를 먼저 호출해 시스템에 다시 묻고, 그 결과로
  // 분기 — granted 면 자동으로 focusCoord 갱신 (부모 effect), 여전히 막혀
  // 있으면 Alert + Linking.openSettings() 로 안내.
  const handleLocationPress = useCallback(async () => {
    if (!onRequestLocation) return;
    const result = await onRequestLocation();
    if (result.status === 'granted') return;
    if (result.status === 'pending' || result.status === 'idle') return;
    const message =
      result.status === 'denied'
        ? '위치 권한이 꺼져 있어요. 설정에서 허용한 뒤 다시 시도해 주세요.'
        : '이 환경에서는 위치를 사용할 수 없어요. 설정을 확인해 주세요.';
    Alert.alert('위치 권한 필요', message, [
      { text: '취소', style: 'cancel' },
      {
        text: '설정 열기',
        onPress: () => {
          // openSettings 는 Promise 를 반환하지만 실패해도 사용자에게 다시
          // alert 띄울 만큼은 아님 — 그냥 무시.
          Linking.openSettings().catch(() => {});
        },
      },
    ]);
  }, [onRequestLocation]);

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
  // pending 만 disabled (응답 대기). denied/unavailable 은 클릭 가능 — 시스템
  // 설정으로 안내. 한 번 거부한 사용자가 마음 바꿀 길을 열어둔다.
  const locationDisabled = locationStatus === 'pending';

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={source}
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

      {/* 우측 상단 컨트롤 — 가로 배치. "전체 영역"(왼쪽) + "내 위치"(오른쪽). */}
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
            onPress={handleLocationPress}
            disabled={locationDisabled}
            style={[
              styles.locationBtn,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                // denied/unavailable 은 클릭 가능하므로 흐리게 표시하지 않음.
                // 시각적으로 "막혔다"가 아니라 "다른 동작" 임을 암시.
                opacity: 1,
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
  // iOS/Android 둘 다 기본 system emoji 폰트로 렌더. svg 의존성 없음.
  locationIcon: { fontSize: 16, lineHeight: 18 },
});
