import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import type { LifeMapStatusResultType } from '@repo/api-contract';
import { LIFE_CCTV_GROUP_COLOR, LIFE_CCTV_PURPOSE_GROUPS, LIFE_CCTV_PURPOSE_GROUP_LABEL, LIFE_TOILET_COLOR } from '@repo/utils';

// 범례 + 적재 상태 + 출처 — 목록 시트 끝. 색은 항상 글자와 함께.

export const LifeFooter = ({ status }: { status: LifeMapStatusResultType | undefined }) => {
  const theme = useTheme();
  const cctv = status?.layers.find((l) => l.layer === 'cctv');
  const toilet = status?.layers.find((l) => l.layer === 'toilet');
  const geocodedPct = toilet && toilet.count > 0 && toilet.geocoded !== null ? Math.round((toilet.geocoded / toilet.count) * 100) : null;
  return (
    <View style={[styles.wrap, { borderTopColor: theme.colors.border }]}>
      <View style={styles.legend}>
        {LIFE_CCTV_PURPOSE_GROUPS.map((g) => (
          <View key={g} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: LIFE_CCTV_GROUP_COLOR[g] }]} />
            <Text style={[styles.text, { color: theme.colors.textMuted }]}>CCTV {LIFE_CCTV_PURPOSE_GROUP_LABEL[g]}</Text>
          </View>
        ))}
        <View style={styles.item}>
          <View style={[styles.dot, { backgroundColor: LIFE_TOILET_COLOR }]} />
          <Text style={[styles.text, { color: theme.colors.textMuted }]}>공중화장실</Text>
        </View>
      </View>
      <Text style={[styles.text, { color: theme.colors.textMuted }]}>숫자 버블 = 그 칸의 건수(확대하면 개별 지점)</Text>
      <Text style={[styles.text, { color: theme.colors.textMuted }]}>
        {cctv?.loaded ? `CCTV ${cctv.count.toLocaleString('ko-KR')}개(기준 ${cctv.baseDate ?? '-'})` : 'CCTV 데이터 미적재'} ·{' '}
        {toilet?.loaded ? `화장실 ${toilet.count.toLocaleString('ko-KR')}개(기준 ${toilet.baseDate ?? '-'}${geocodedPct !== null ? `, 좌표 ${geocodedPct}%` : ''})` : '화장실 데이터 미적재'}
      </Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.localdata.go.kr').catch(() => {})} style={styles.src}>
        <Text style={[styles.text, { color: theme.colors.textMuted }]}>
          출처 지방행정인허가데이터개방 <MaterialCommunityIcons name="open-in-new" size={10} /> 전국 CCTV 설치 현황·공중화장실 · 화장실 좌표는 VWorld 지오코더로 주소를 변환한 값
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8, gap: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 11, lineHeight: 15 },
  src: { marginTop: 2 },
});
