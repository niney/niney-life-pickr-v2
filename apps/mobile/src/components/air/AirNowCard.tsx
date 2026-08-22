import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import type { AirMeasureItemType } from '@repo/api-contract';
import { airPollutantMeta, formatAirValue, type AirGradeLevel, type AirPollutant } from '@repo/utils';
import { airGradeColor } from '~/lib/airGradeColor';
import { AirGradeBadge, AirGradeDot } from './AirPrimitives';

// 지금 — 통합대기환경지수(CAI) 히어로 + 6개 항목 타일(2열). 등급은 업스트림 값 그대로(24시간 등급이
// 대표, PM 은 1시간 등급이 다르면 병기). 측정 상태(Flag)가 있으면 타일에 경고(웹 AirStationHero 이식).

type TileKey = Exclude<AirPollutant, 'khai'>;
const TILE_KEYS: TileKey[] = ['pm10', 'pm25', 'o3', 'no2', 'co', 'so2'];

const gradeOf = (m: AirMeasureItemType, k: TileKey): AirGradeLevel | null => {
  switch (k) {
    case 'pm10':
      return m.pm10Grade ?? m.pm10Grade1h;
    case 'pm25':
      return m.pm25Grade ?? m.pm25Grade1h;
    case 'o3':
      return m.o3Grade;
    case 'no2':
      return m.no2Grade;
    case 'co':
      return m.coGrade;
    case 'so2':
      return m.so2Grade;
  }
};

export const AirNowCard = ({ latest }: { latest: AirMeasureItemType }) => {
  const theme = useTheme();
  const khai = airGradeColor(latest.khaiGrade);
  const flagged = TILE_KEYS.filter((k) => latest.flags[k]);
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={[styles.khai, { color: theme.colors.text }]}>{latest.khai === null ? '—' : formatAirValue('khai', latest.khai)}</Text>
        <View style={styles.heroText}>
          <Text style={[styles.grade, { color: latest.khaiGrade ? khai.hex : theme.colors.textMuted }]}>
            {latest.khaiGrade ? khai.label : '지수 없음'}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>통합대기환경지수(CAI)</Text>
        </View>
      </View>
      <View style={styles.metaGrid}>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          측정시각 <Text style={{ color: theme.colors.text }}>{latest.dataTime ?? '-'}</Text>
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          측정망 <Text style={{ color: theme.colors.text }}>{latest.mangName ?? '-'}</Text>
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          PM10 24h <Text style={{ color: theme.colors.text }}>{formatAirValue('pm10', latest.pm10Avg24)}</Text> ㎍/㎥
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          PM2.5 24h <Text style={{ color: theme.colors.text }}>{formatAirValue('pm25', latest.pm25Avg24)}</Text> ㎍/㎥
        </Text>
      </View>
      {flagged.length > 0 && (
        <View style={styles.flagNote}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#b45309" />
          <Text style={styles.flagText}>
            측정 상태: {flagged.map((k) => `${airPollutantMeta(k).short} ${latest.flags[k]}`).join(', ')} — 해당 항목은 농도가 비어 있습니다.
          </Text>
        </View>
      )}
      <View style={styles.tiles}>
        {TILE_KEYS.map((k) => {
          const meta = airPollutantMeta(k);
          const grade = gradeOf(latest, k);
          const value = latest[k];
          const flag = latest.flags[k];
          const oneHour = k === 'pm10' ? latest.pm10Grade1h : k === 'pm25' ? latest.pm25Grade1h : null;
          return (
            <View key={k} style={[styles.tile, { borderColor: flag ? 'rgba(245,158,11,0.5)' : theme.colors.border }]}>
              <View style={styles.tileHead}>
                <Text style={[styles.tileLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{meta.short}</Text> {meta.label}
                </Text>
                <AirGradeDot grade={grade} />
              </View>
              <Text style={[styles.tileValue, { color: theme.colors.text }]}>
                {formatAirValue(k, value)}
                {meta.unit ? <Text style={[styles.tileUnit, { color: theme.colors.textMuted }]}> {meta.unit}</Text> : null}
              </Text>
              <View style={styles.tileFoot}>
                <AirGradeBadge grade={grade} />
                {oneHour && oneHour !== grade ? (
                  <Text style={[styles.tileNote, { color: theme.colors.textMuted }]}>1시간 {airGradeColor(oneHour).label}</Text>
                ) : null}
                {flag ? <Text style={[styles.tileNote, { color: '#b45309' }]}>{flag}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  khai: { fontSize: 52, fontWeight: '700', lineHeight: 56, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  heroText: { paddingBottom: 6, gap: 2 },
  grade: { fontSize: 22, fontWeight: '700' },
  meta: { fontSize: 11 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flagNote: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, padding: 8 },
  flagText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#b45309' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, gap: 4 },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  tileLabel: { fontSize: 11, flexShrink: 1 },
  tileValue: { fontSize: 22, fontWeight: '600', lineHeight: 26, fontVariant: ['tabular-nums'] },
  tileUnit: { fontSize: 11, fontWeight: '400' },
  tileFoot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  tileNote: { fontSize: 11 },
});
