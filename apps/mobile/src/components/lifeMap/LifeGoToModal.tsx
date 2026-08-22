import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusStationSearch, useLifeMapSearch, useSubwayStationSearch, useTheme } from '@repo/shared';
import { useLifeMapRecentStore } from '~/lib/lifeMapRecentStore';
import {
  WEATHER_SIDOS,
  searchWeatherPlaces,
  weatherDefaultPlaceOfSido,
  weatherPlaceLabel,
  weatherPlacesBySido,
  type WeatherPlace,
  type WeatherSido,
} from '@repo/utils';

// 지역 이동 옴니박스(앱, 모달) — 웹 LifeGoToBox 의 규칙 그대로:
//   입력 없음: 저장한 내 위치 · 최근 본 위치 · 시도 칩 → 시·군·구 칩(로컬 245지점)
//   입력 중:   행정구역(로컬 즉시) · 지하철역(수도권) · 버스정류장(서울) · 주소·장소(VWorld 프록시, 250ms 디바운스)
// 선택 → onGo(종류별 줌: 시도 11 · 시 13 · 구 14 · 역/정류장 16 · 주소/장소 17).

export type LifeGoToKind = 'saved' | 'recent' | 'sido' | 'region' | 'subway' | 'bus' | 'place' | 'road' | 'parcel';
export interface LifeGoToTarget {
  kind: LifeGoToKind;
  label: string;
  sub: string | null;
  lat: number;
  lng: number;
  zoom: number;
}

const ZOOM = { sido: 11, city: 13, district: 14, station: 16, address: 17 } as const;
const SECTION_LIMIT = 5;
const regionTarget = (p: WeatherPlace): LifeGoToTarget => ({
  kind: 'region',
  label: weatherPlaceLabel(p),
  sub: p.kind === 'district' ? '구·군' : p.sido,
  lat: p.lat,
  lng: p.lng,
  zoom: p.kind === 'district' ? ZOOM.district : ZOOM.city,
});

interface Props {
  visible: boolean;
  onClose: () => void;
  savedLocation: { lat: number; lng: number; label: string | null } | null;
  onGo: (target: LifeGoToTarget) => void;
}

type Row =
  | { type: 'section'; key: string; title: string; loading?: boolean; error?: boolean; action?: { label: string; onPress: () => void } }
  | { type: 'item'; key: string; target: LifeGoToTarget }
  | { type: 'note'; key: string; text: string };

const KIND_ICON: Record<LifeGoToKind, 'navigation-variant' | 'history' | 'map-marker' | 'train' | 'bus' | 'map-marker-outline'> = {
  saved: 'navigation-variant',
  recent: 'history',
  sido: 'map-marker',
  region: 'map-marker',
  subway: 'train',
  bus: 'bus',
  place: 'map-marker-outline',
  road: 'map-marker-outline',
  parcel: 'map-marker-outline',
};

export const LifeGoToModal = ({ visible, onClose, savedLocation, onGo }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [sido, setSido] = useState<WeatherSido | null>(null);
  const recent = useLifeMapRecentStore((st) => st.items);
  const addRecent = useLifeMapRecentStore((st) => st.add);
  const clearRecent = useLifeMapRecentStore((st) => st.clear);
  const trimmed = q.trim();
  const typing = trimmed.length > 0;
  // 원격 검색은 250ms 디바운스(타이머 콜백에서만 setState).
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(typing ? trimmed : ''), 250);
    return () => clearTimeout(t);
  }, [trimmed, typing]);
  const subwayQ = useSubwayStationSearch(debouncedQ);
  const busQ = useBusStationSearch(debouncedQ);
  const remoteQ = useLifeMapSearch(debouncedQ, 8);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!typing) {
      if (savedLocation) {
        out.push({ type: 'section', key: 's-saved', title: '저장한 내 위치' });
        out.push({
          type: 'item',
          key: 'saved',
          target: { kind: 'saved', label: savedLocation.label ?? '내 위치', sub: '날씨·대기와 공유', lat: savedLocation.lat, lng: savedLocation.lng, zoom: 15 },
        });
      }
      if (recent.length > 0) {
        out.push({ type: 'section', key: 's-recent', title: '최근 본 위치', action: { label: '지우기', onPress: clearRecent } });
        recent.forEach((r) =>
          out.push({ type: 'item', key: `recent:${r.label}:${r.lat}:${r.lng}`, target: { kind: 'recent', label: r.label, sub: r.sub, lat: r.lat, lng: r.lng, zoom: r.zoom } }),
        );
      }
      return out;
    }
    const regions = searchWeatherPlaces(trimmed, SECTION_LIMIT).map(regionTarget);
    if (regions.length > 0) {
      out.push({ type: 'section', key: 's-region', title: '행정구역' });
      regions.forEach((t) => out.push({ type: 'item', key: `region:${t.label}`, target: t }));
    }
    const subway = (subwayQ.data?.items ?? []).slice(0, SECTION_LIMIT);
    if (subway.length > 0 || subwayQ.isFetching) {
      out.push({ type: 'section', key: 's-subway', title: '지하철역(수도권)', loading: subwayQ.isFetching });
      subway.forEach((s) =>
        out.push({ type: 'item', key: `subway:${s.id}`, target: { kind: 'subway', label: `${s.name}역`, sub: s.lines.map((l) => l.lineName).join(' · '), lat: s.lat, lng: s.lng, zoom: ZOOM.station } }),
      );
      if (subway.length === 0) out.push({ type: 'note', key: 'n-subway', text: '찾는 중…' });
    }
    const bus = (busQ.data?.items ?? []).slice(0, SECTION_LIMIT);
    if (bus.length > 0 || busQ.isFetching) {
      out.push({ type: 'section', key: 's-bus', title: '버스정류장(서울)', loading: busQ.isFetching });
      bus.forEach((b) =>
        out.push({ type: 'item', key: `bus:${b.stId}`, target: { kind: 'bus', label: b.name, sub: b.arsId !== '0' ? `정류소 ${b.arsId}` : null, lat: b.lat, lng: b.lng, zoom: ZOOM.station } }),
      );
      if (bus.length === 0) out.push({ type: 'note', key: 'n-bus', text: '찾는 중…' });
    }
    if (remoteQ.data?.enabled !== false) {
      const remote = remoteQ.data?.q === debouncedQ ? (remoteQ.data?.items ?? []) : [];
      const waiting = remoteQ.isFetching || (debouncedQ !== trimmed && trimmed.length >= 2);
      if (remote.length > 0 || waiting || remoteQ.isError) {
        out.push({ type: 'section', key: 's-remote', title: '주소·장소', loading: waiting, error: remoteQ.isError && !waiting });
        remote.forEach((i) =>
          out.push({ type: 'item', key: `remote:${i.kind}:${i.title}:${i.lat}:${i.lng}`, target: { kind: i.kind, label: i.title, sub: i.subtitle, lat: i.lat, lng: i.lng, zoom: ZOOM.address } }),
        );
        if (remote.length === 0 && waiting) out.push({ type: 'note', key: 'n-remote', text: '찾는 중…' });
        if (remote.length === 0 && remoteQ.isError && !waiting) out.push({ type: 'note', key: 'e-remote', text: '주소·장소 검색이 잠시 안 됩니다 — 지역·역·정류장으로 찾아 보세요.' });
      }
    }
    if (out.length === 0) out.push({ type: 'note', key: 'empty', text: trimmed.length < 2 ? '두 글자 이상 입력하면 역·정류장·주소도 찾습니다.' : '찾는 곳이 없습니다. 다른 이름이나 주소로 해 보세요.' });
    return out;
  }, [typing, trimmed, savedLocation, recent, clearRecent, subwayQ.data, subwayQ.isFetching, busQ.data, busQ.isFetching, remoteQ.data, remoteQ.isFetching, remoteQ.isError, debouncedQ]);

  const go = (t: LifeGoToTarget) => {
    if (t.kind !== 'saved') addRecent({ label: t.label, sub: t.sub, lat: t.lat, lng: t.lng, zoom: t.zoom });
    onGo(t);
    setQ('');
    onClose();
  };
  const sidoPlaces = sido ? weatherPlacesBySido(sido) : [];
  const sidoDefault = sido ? weatherDefaultPlaceOfSido(sido) : null;

  const chip = (key: string, label: string, onPress: () => void, primary?: boolean) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, { borderColor: primary ? theme.colors.primary : theme.colors.border, backgroundColor: primary ? theme.colors.primary : 'transparent' }]}
    >
      <Text style={[styles.chipText, { color: primary ? theme.colors.primaryText : theme.colors.textMuted }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* iOS pageSheet 은 이미 상태바 아래에 카드로 뜨므로 상단 inset 을 또 더하지 않는다(안드로이드 edge-to-edge 만 inset) */}
      <View style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: Platform.OS === 'ios' ? 12 : Math.max(insets.top, 12) }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <View style={[styles.inputWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              autoFocus
              placeholder="지역·역·정류장·주소로 이동"
              placeholderTextColor={theme.colors.textMuted}
              returnKeyType="search"
              accessibilityLabel="지역 이동 검색"
              style={[styles.input, { color: theme.colors.text }]}
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="검색어 지우기">
                <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text style={{ color: theme.colors.primary, fontSize: 15, fontWeight: '600' }}>닫기</Text>
          </Pressable>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListFooterComponent={
            !typing ? (
              <View style={styles.chipsBlock}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{sido ? `${sido} — 시·군·구` : '지역 바로가기'}</Text>
                <View style={styles.chips}>
                  {sido ? (
                    <>
                      {chip('back', '← 시·도', () => setSido(null))}
                      {sidoDefault && chip('all', `${sido} 전체`, () => go({ kind: 'sido', label: sido, sub: '시·도 전체', lat: sidoDefault.lat, lng: sidoDefault.lng, zoom: ZOOM.sido }), true)}
                      {sidoPlaces.map((p) => chip(p.id, p.name, () => go(regionTarget(p))))}
                    </>
                  ) : (
                    WEATHER_SIDOS.map((s) => chip(s, s, () => setSido(s)))
                  )}
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: r }) =>
            r.type === 'section' ? (
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{r.title}</Text>
                {r.loading && <ActivityIndicator size="small" color={theme.colors.textMuted} />}
                {r.action && (
                  <Pressable accessibilityRole="button" onPress={r.action.onPress} hitSlop={8} style={{ marginLeft: 'auto' }}>
                    <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, textDecorationLine: 'underline' }]}>{r.action.label}</Text>
                  </Pressable>
                )}
              </View>
            ) : r.type === 'note' ? (
              <Text style={[styles.note, { color: theme.colors.textMuted }]}>{r.text}</Text>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => go(r.target)} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
                <MaterialCommunityIcons name={KIND_ICON[r.target.kind]} size={18} color={theme.colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowText, { color: theme.colors.text }]} numberOfLines={1}>
                    {r.target.label}
                  </Text>
                  {r.target.sub ? (
                    <Text style={[styles.rowSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {r.target.sub}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          }
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderRadius: 10, paddingHorizontal: 10 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '600' },
  note: { fontSize: 12, paddingHorizontal: 16, paddingVertical: 10, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  rowText: { fontSize: 15 },
  rowSub: { fontSize: 12, marginTop: 1 },
  chipsBlock: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '500' },
});
