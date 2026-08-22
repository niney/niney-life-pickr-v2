import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  GLANCE_AIR_GRADE_SOURCE_LABEL,
  useAirLocation,
  useMyLocationGlance,
  useTheme,
} from '@repo/shared';
import {
  AIR_GRADE_HEX,
  AIR_GRADE_LABEL,
  AIR_GRADE_NONE_HEX,
  formatAirValue,
  formatKmaTemp,
  isInKorea,
  nearestWeatherPlace,
} from '@repo/utils';
import { WeatherGlyph } from '~/components/weather/WeatherGlyph';
import { useUserLocationNative } from '~/hooks/useUserLocationNative';

// 홈 상단 "내 위치" 카드 — 웹 상단바 칩의 앱판. 저장한 내 위치(날씨·대기 페이지와 공유, 로그인
// 서버/게스트 로컬) 한 곳의 날씨(기온·상태·우산)와 공기(등급·PM2.5)를 한 줄로. 왼쪽 탭 → 날씨
// 화면, 오른쪽 탭 → 대기 화면. 저장 위치가 없으면 강요 대신 "내 위치로 설정" 한 번 — 위치 권한을
// 받아 가장 가까운 날씨 지점 이름으로 저장한다(웹 날씨 페이지의 '이 지점을 내 위치로 저장'과 같은
// 저장소·같은 모양). 파생값은 웹 칩과 공용 훅(useMyLocationGlance).

export const MyLocationCard = () => {
  const theme = useTheme();
  const router = useRouter();
  const { location, label, weather: wx, air } = useMyLocationGlance({ refetchOnWindowFocus: true });
  const airLocation = useAirLocation();
  const userLoc = useUserLocationNative();
  const [settingUp, setSettingUp] = useState(false);

  const setMyLocation = useCallback(async () => {
    setSettingUp(true);
    try {
      const r = await userLoc.refetch();
      if (r.status === 'granted' && r.coords) {
        if (!isInKorea(r.coords)) {
          Alert.alert('서비스 지역 밖', '현재 위치가 서비스 지역(한국) 밖이에요.');
          return;
        }
        const nearest = nearestWeatherPlace(r.coords.lat, r.coords.lng);
        airLocation.save({
          lat: r.coords.lat,
          lng: r.coords.lng,
          label: nearest?.place.name ?? null,
          source: 'geolocation',
        });
        return;
      }
      if (r.status === 'pending' || r.status === 'idle') return;
      Alert.alert(
        '위치 권한 필요',
        r.status === 'denied'
          ? '위치 권한이 꺼져 있어요. 설정에서 허용하거나 날씨 화면에서 지점을 직접 골라 주세요.'
          : '이 환경에서는 위치를 사용할 수 없어요. 날씨 화면에서 지점을 직접 골라 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings().catch(() => {}) },
        ],
      );
    } finally {
      setSettingUp(false);
    }
  }, [userLoc, airLocation]);

  const cardStyle = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }];

  if (!location) {
    return (
      <View style={cardStyle} accessibilityRole="summary">
        <View style={styles.ctaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={20} color={theme.colors.textMuted} />
          <View style={styles.ctaText}>
            <Text style={[styles.ctaTitle, { color: theme.colors.text }]}>내 위치의 날씨·공기를 한눈에</Text>
            <Text style={[styles.ctaSub, { color: theme.colors.textMuted }]}>
              위치를 한 번 저장하면 홈에서 기온·강수·미세먼지 등급을 바로 봐요.
            </Text>
          </View>
        </View>
        <View style={styles.ctaButtons}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void setMyLocation()}
            disabled={settingUp || airLocation.isSaving}
            style={({ pressed }) => [
              styles.ctaBtn,
              { backgroundColor: pressed ? theme.colors.primaryHover : theme.colors.primary },
            ]}
          >
            {settingUp || airLocation.isSaving ? (
              <ActivityIndicator size="small" color={theme.colors.primaryText} />
            ) : (
              <MaterialCommunityIcons name="crosshairs-gps" size={16} color={theme.colors.primaryText} />
            )}
            <Text style={[styles.ctaBtnText, { color: theme.colors.primaryText }]}>내 위치로 설정</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/weather' as never)}
            style={({ pressed }) => [
              styles.ctaBtn,
              styles.ctaBtnGhost,
              { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.ctaBtnText, { color: theme.colors.text }]}>지점 고르기</Text>
          </Pressable>
        </View>
        <LifeMapLink />
      </View>
    );
  }

  const gradeHex = air.grade !== null ? AIR_GRADE_HEX[air.grade] : AIR_GRADE_NONE_HEX;
  const gradeLabel = air.grade !== null ? AIR_GRADE_LABEL[air.grade] : '-';

  return (
    <View style={cardStyle}>
      <View style={styles.headRow}>
        <MaterialCommunityIcons name="map-marker" size={16} color="#8b5cf6" />
        <Text style={[styles.headLabel, { color: theme.colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.headHint, { color: theme.colors.textMuted }]}>내 위치</Text>
      </View>
      <View style={styles.segments}>
        {/* 날씨 → /weather */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`내 위치(${label}) 날씨. 날씨 화면으로 이동`}
          onPress={() => router.push('/weather' as never)}
          style={({ pressed }) => [styles.segment, { opacity: pressed ? 0.6 : 1 }]}
        >
          {wx.loading ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : wx.ok ? (
            <>
              <WeatherGlyph condition={wx.condition} hour={wx.ncstHour} size={32} />
              <View style={styles.segText}>
                <Text style={[styles.temp, { color: theme.colors.text }]}>
                  {formatKmaTemp(wx.tempC)}
                  <Text style={[styles.tempUnit, { color: theme.colors.textMuted }]}>°</Text>
                </Text>
                <View style={styles.condRow}>
                  <Text style={[styles.cond, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {wx.conditionLabel}
                  </Text>
                  {wx.wet && (
                    <View style={styles.umbrella} accessibilityLabel={`강수 예상${wx.popMax !== null ? ` (최대 ${wx.popMax}%)` : ''}`}>
                      <MaterialCommunityIcons name="umbrella" size={12} color="#3b82f6" />
                      {wx.popMax !== null && <Text style={styles.umbrellaText}>{wx.popMax}%</Text>}
                    </View>
                  )}
                </View>
              </View>
            </>
          ) : (
            <Text style={[styles.none, { color: theme.colors.textMuted }]}>날씨 자료 없음</Text>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        {/* 대기 → /air */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`내 위치(${label}) 공기질. 대기정보 화면으로 이동`}
          onPress={() => router.push('/air' as never)}
          style={({ pressed }) => [styles.segment, { opacity: pressed ? 0.6 : 1 }]}
        >
          {air.loading ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : air.ok && air.gradeSource !== null ? (
            <>
              <View style={[styles.gradeDot, { backgroundColor: gradeHex }]} />
              <View style={styles.segText}>
                <Text style={[styles.grade, { color: theme.colors.text }]}>{gradeLabel}</Text>
                <Text style={[styles.cond, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {air.gradeSource === 'khai'
                    ? `PM2.5 ${formatAirValue('pm25', air.pm25)}`
                    : `${GLANCE_AIR_GRADE_SOURCE_LABEL[air.gradeSource]} 기준`}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[styles.none, { color: theme.colors.textMuted }]}>
              {air.station ? '대기 자료 없음' : '근처 측정소 없음'}
            </Text>
          )}
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <LifeMapLink />
    </View>
  );
};

// 일상지도 진입 — 내 주변 화장실·CCTV(저장 위치 유무와 무관).
const LifeMapLink = () => {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/life-map' as never)}
      style={({ pressed }) => [styles.lifeRow, { borderTopColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <MaterialCommunityIcons name="map-search-outline" size={16} color={theme.colors.textMuted} />
      <Text style={[styles.lifeText, { color: theme.colors.text }]}>일상지도 — 내 주변 공중화장실·CCTV</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  ctaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ctaText: { flex: 1, gap: 2 },
  ctaTitle: { fontSize: 14, fontWeight: '600' },
  ctaSub: { fontSize: 12, lineHeight: 17 },
  ctaButtons: { flexDirection: 'row', gap: 8 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 34,
  },
  ctaBtnGhost: { borderWidth: StyleSheet.hairlineWidth },
  ctaBtnText: { fontSize: 13, fontWeight: '600' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  headHint: { fontSize: 11, marginLeft: 'auto' },
  segments: { flexDirection: 'row', alignItems: 'stretch' },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  segText: { flex: 1, minWidth: 0 },
  temp: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'], lineHeight: 26 },
  tempUnit: { fontSize: 14, fontWeight: '500' },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cond: { fontSize: 12, flexShrink: 1 },
  umbrella: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  umbrellaText: { fontSize: 11, color: '#3b82f6', fontVariant: ['tabular-nums'] },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: 10, marginVertical: 4 },
  gradeDot: { width: 12, height: 12, borderRadius: 6 },
  grade: { fontSize: 16, fontWeight: '600' },
  none: { flex: 1, fontSize: 12 },
  lifeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 2 },
  lifeText: { flex: 1, fontSize: 12, fontWeight: '500' },
});
