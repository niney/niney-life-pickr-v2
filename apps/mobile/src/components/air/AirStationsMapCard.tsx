import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { AirMeasureItemType, AirNearbyStationItemType, AirStationInfoItemType } from '@repo/api-contract';
import { AIR_GRADE_LEVELS, AIR_SIDO_OPTIONS, airSidoMatches, buildAirSavedLocationMarkerDataUrl, buildAirStationMarkerDataUrl, type AirGradeLevel } from '@repo/utils';
import { TransitMapView } from '~/components/transit/TransitMapView';
import type { TransitMapHandle } from '~/components/transit/useTransitMapSync';
import type { BridgeMarker } from '~/components/transit/transitMapBridge';
import { airGradeColor } from '~/lib/airGradeColor';

// 측정소 지도(앱) — 전국 측정소 좌표에 현재 통합지수 등급을 마커색으로(웹 AirStationsMap 이식). 대중교통과
// 같은 WebView 지도를 고정 높이로 끼우고, 마커는 등급×선택 10종 아이콘 사전으로 보낸다. 마커 탭 → 그
// 측정소로 전환. 선택 측정소가 바뀌면 그쪽으로 날아간다. 내 주변 결과와 선택 측정소만 라벨.

const KOREA_CENTER = { lat: 36.3, lng: 127.8, zoom: 7 };
const SELECT_ZOOM = 11;
const SAVED_ICON = buildAirSavedLocationMarkerDataUrl();
const iconKey = (grade: AirGradeLevel | 0, selected: boolean) => `@air:${grade}:${selected ? 's' : 'b'}`;
const ICONS: Record<string, string> = Object.fromEntries(
  ([0, ...AIR_GRADE_LEVELS] as Array<AirGradeLevel | 0>).flatMap((g) => [
    [iconKey(g, false), buildAirStationMarkerDataUrl({ grade: g === 0 ? null : g, selected: false })],
    [iconKey(g, true), buildAirStationMarkerDataUrl({ grade: g === 0 ? null : g, selected: true })],
  ]),
);

type StationWithCoords = AirStationInfoItemType & { lat: number; lng: number };
const markerIdOf = (s: StationWithCoords): string => `air:${s.stationName}`;

interface Props {
  stations: AirStationInfoItemType[];
  measures: AirMeasureItemType[];
  selectedStation: string | null;
  nearby: AirNearbyStationItemType[];
  myLocation: { lat: number; lng: number } | null;
  savedLocation: { lat: number; lng: number } | null;
  onSelect: (stationName: string, sidoOption: string | null) => void;
  height?: number;
}

export const AirStationsMapCard = ({ stations, measures, selectedStation, nearby, myLocation, savedLocation, onSelect, height = 260 }: Props) => {
  const theme = useTheme();
  const mapRef = useRef<TransitMapHandle>(null);
  const withCoords = useMemo(() => stations.filter((s): s is StationWithCoords => s.lat !== null && s.lng !== null), [stations]);
  const byId = useMemo(() => new Map(withCoords.map((s) => [markerIdOf(s), s] as const)), [withCoords]);
  const gradeByName = useMemo(() => {
    const m = new Map<string, AirGradeLevel | null>();
    for (const it of measures) if (!m.has(it.stationName)) m.set(it.stationName, it.khaiGrade);
    return m;
  }, [measures]);
  const nearbyNames = useMemo(() => new Set(nearby.map((n) => n.stationName)), [nearby]);
  const markers = useMemo<BridgeMarker[]>(
    () =>
      withCoords.map((s) => {
        const grade = gradeByName.get(s.stationName) ?? null;
        const labeled = s.stationName === selectedStation || nearbyNames.has(s.stationName);
        return {
          id: markerIdOf(s),
          lat: s.lat,
          lng: s.lng,
          icon: iconKey(grade ?? 0, false),
          iconSel: iconKey(grade ?? 0, true),
          ...(labeled ? { label: s.stationName } : {}),
        };
      }),
    [withCoords, gradeByName, nearbyNames, selectedStation],
  );
  const selected = useMemo(() => withCoords.find((s) => s.stationName === selectedStation) ?? null, [withCoords, selectedStation]);
  const overlayMarkers = useMemo<BridgeMarker[]>(
    () => (savedLocation ? [{ id: 'saved-location', lat: savedLocation.lat, lng: savedLocation.lng, label: '내 위치', icon: SAVED_ICON }] : []),
    [savedLocation],
  );
  // 선택 측정소로 이동(처음 렌더 포함 — 지도 ready 뒤 명령은 큐잉되지 않으므로 약간 늦춰 보낸다).
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => mapRef.current?.flyToZoomIn(selected.lat, selected.lng, SELECT_ZOOM), 600);
    return () => clearTimeout(t);
  }, [selected]);
  const handleSelect = useCallback(
    (id: string) => {
      const s = byId.get(id);
      if (!s) return;
      onSelect(s.stationName, AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && s.sidoName !== null && airSidoMatches(o.value, s.sidoName))?.value ?? null);
    },
    [byId, onSelect],
  );
  const initialCenter = useMemo(() => (selected ? { lat: selected.lat, lng: selected.lng, zoom: SELECT_ZOOM } : KOREA_CENTER), [selected]);

  return (
    <View style={{ gap: 6 }}>
      <View style={[styles.map, { height, borderColor: theme.colors.border }]}>
        <TransitMapView
          ref={mapRef}
          initialCenter={initialCenter}
          markers={markers}
          markerIcons={ICONS}
          selectedId={selected ? markerIdOf(selected) : null}
          overlayMarkers={overlayMarkers}
          myLocation={myLocation}
          onSelectMarker={handleSelect}
        />
      </View>
      <View style={styles.legend}>
        {AIR_GRADE_LEVELS.map((g) => (
          <View key={g} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: airGradeColor(g).hex }]} />
            <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>{airGradeColor(g).label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: airGradeColor(null).hex }]} />
          <Text style={[styles.legendText, { color: theme.colors.textMuted }]}>결측</Text>
        </View>
        <Text style={[styles.legendText, { color: theme.colors.textMuted, marginLeft: 'auto' }]}>마커 탭 → 그 측정소로</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  map: { borderRadius: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
});
