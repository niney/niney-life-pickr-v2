import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { HikingMountainSummaryType } from '@repo/api-contract';
import { formatHikingDistance, useTheme } from '@repo/shared';
import { HIKING_MOUNTAIN_COLOR, HIKING_PEAK_COLOR, formatHikingLength } from '@repo/utils';
import { hikingImageUrl } from './hikingUrls';

// 산 목록 한 줄(앱) — 사진·이름·높이·배지(100대 명산·국립공원)·소재지·코스 수와 길이 범위·거리. 웹 HikingList 행과 같은 정보.

interface Props {
  mountain: HikingMountainSummaryType;
  distM: number | null;
  onPress: () => void;
}

export const HikingMountainRow = ({ mountain: m, distM, onPress }: Props) => {
  const theme = useTheme();
  const range =
    m.minLengthM !== null && m.maxLengthM !== null
      ? m.minLengthM === m.maxLengthM
        ? formatHikingLength(m.minLengthM)
        : `${formatHikingLength(m.minLengthM)}~${formatHikingLength(m.maxLengthM)}`
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      {m.images.length > 0 ? (
        <Image source={{ uri: hikingImageUrl(m.id, m.images[0]!) }} style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt }]} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: theme.colors.surfaceAlt }]}>
          <MaterialCommunityIcons name="image-filter-hdr" size={20} color={m.kind === 'top100' ? HIKING_MOUNTAIN_COLOR : HIKING_PEAK_COLOR} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {m.name}
          </Text>
          {m.heightM !== null && <Text style={[styles.height, { color: theme.colors.textMuted }]}>{Math.round(m.heightM).toLocaleString('ko-KR')}m</Text>}
          {m.kind === 'top100' && <Text style={[styles.badge, styles.top100]}>100대 명산</Text>}
        </View>
        {m.park && (
          <Text style={[styles.badge, styles.park, { alignSelf: 'flex-start' }]} numberOfLines={1}>
            {m.park}
          </Text>
        )}
        {m.area && (
          <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {m.area}
          </Text>
        )}
        <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
          코스 {m.courseCount}개{range ? ` · ${range}` : ''}
        </Text>
      </View>
      {distM !== null && <Text style={[styles.dist, { color: theme.colors.textMuted }]}>{formatHikingDistance(distM)}</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 48, height: 48, borderRadius: 6 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  height: { fontSize: 12 },
  badge: { fontSize: 10, fontWeight: '600', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  top100: { color: '#047857', backgroundColor: 'rgba(16,185,129,0.12)' },
  park: { color: '#0369a1', backgroundColor: 'rgba(14,165,233,0.12)' },
  sub: { fontSize: 12 },
  dist: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
