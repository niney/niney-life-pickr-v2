import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import type { WeatherMidSeaResultType } from '@repo/api-contract';
import { KMA_CONDITION_LABEL, WEATHER_MID_SEA_REGIONS, formatYmdWithWeekday, kmaConditionFromText, relativeDayLabel } from '@repo/utils';
import { WeatherGlyph } from './WeatherGlyph';
import { StateBlock } from '~/components/common/Cards';

// 중기해상예보 — 기본은 접힘(바다를 볼 일이 있는 사람만 편다). 펼치면 해역 칩 + 날짜별 오전/오후
// (D+8~ 하루) 날씨·파고.

interface Props {
  regId: string;
  onChangeRegion: (regId: string) => void;
  data: WeatherMidSeaResultType | null;
  todayYmd: string;
  loading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  retrying: boolean;
}

export const WeatherSeaCard = ({ regId, onChangeRegion, data, todayYmd, loading, errorMessage, onRetry, retrying }: Props) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const regionLabel = WEATHER_MID_SEA_REGIONS.find((r) => r.regId === regId)?.label ?? regId;

  const cell = (tag: string, h: { wf: string | null; whMin: number | null; whMax: number | null } | null) => {
    if (!h) {
      return (
        <Text key={tag} style={[styles.cellText, { color: theme.colors.textMuted }]}>
          {tag} -
        </Text>
      );
    }
    const cond = kmaConditionFromText(h.wf);
    const wave = h.whMin === null && h.whMax === null ? '-' : `${h.whMin ?? '-'}~${h.whMax ?? '-'}m`;
    return (
      <View key={tag} style={styles.cell}>
        <Text style={[styles.cellTag, { color: theme.colors.textMuted }]}>{tag}</Text>
        <WeatherGlyph condition={cond} size={18} label={h.wf ?? KMA_CONDITION_LABEL[cond]} />
        <Text style={[styles.cellText, { color: theme.colors.text }]} numberOfLines={1}>
          {h.wf ?? KMA_CONDITION_LABEL[cond]}
        </Text>
        <Text style={[styles.cellWave, { color: theme.colors.textMuted }]}>파고 {wave}</Text>
      </View>
    );
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
      >
        <View style={styles.headText}>
          <Text style={[styles.title, { color: theme.colors.text }]}>중기해상예보</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{regionLabel} · 발표일 +4~+10일 날씨·파고</Text>
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
      </Pressable>
      {open && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {WEATHER_MID_SEA_REGIONS.map((r) => {
              const active = r.regId === regId;
              return (
                <Pressable
                  key={r.regId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onChangeRegion(r.regId)}
                  style={[
                    styles.chip,
                    { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? theme.colors.primaryText : theme.colors.textMuted }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {loading ? (
            <StateBlock kind="loading" />
          ) : errorMessage ? (
            <StateBlock kind="error" message={errorMessage} onRetry={onRetry} retrying={retrying} />
          ) : !data || data.days.length === 0 ? (
            <StateBlock kind="empty" message="이 해역의 중기해상예보가 없습니다." />
          ) : (
            data.days.map((d, idx) => (
              <View key={d.date} style={[styles.row, { borderTopColor: theme.colors.border, borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth }]}>
                <View style={styles.dateCol}>
                  <Text style={[styles.date, { color: theme.colors.text }]}>{relativeDayLabel(d.date, todayYmd)}</Text>
                  <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{formatYmdWithWeekday(d.date)}</Text>
                </View>
                <View style={styles.cells}>{d.all ? cell('하루', d.all) : [cell('오전', d.am), cell('오후', d.pm)]}</View>
              </View>
            ))
          )}
        </>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headText: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 11 },
  chips: { gap: 6, paddingVertical: 2 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  dateCol: { width: 72, gap: 1 },
  date: { fontSize: 13, fontWeight: '600' },
  cells: { flex: 1, flexDirection: 'row', gap: 12 },
  cell: { flex: 1, gap: 1 },
  cellTag: { fontSize: 9 },
  cellText: { fontSize: 12 },
  cellWave: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
