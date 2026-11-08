import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { HikingRecommendResultType } from '@repo/api-contract';
import { hikingDayLabel, minToHm, useTheme } from '@repo/shared';
import {
  HIKING_DIFFICULTY_LABEL,
  HIKING_DURATIONS,
  HIKING_DURATION_LABEL,
  HIKING_DURATION_RANGE,
  HIKING_LEVELS,
  HIKING_LEVEL_LABEL,
  HIKING_MOUNTAIN_COLOR,
  HIKING_ORIGIN_CITIES,
  HIKING_PEAK_COLOR,
  HIKING_TRAVEL_MODES,
  HIKING_TRAVEL_MODE_LABEL,
  formatHikingEle,
  hikingOriginCity,
  type HikingDuration,
  type HikingLevel,
  type HikingTravelMode,
} from '@repo/utils';
import { hapticSelection } from '~/lib/haptics';
import { HikingDayStartPicker } from './HikingDayStartPicker';
import { hikingImageUrl } from './hikingUrls';

// 오늘 어느 산(앱 추천 모드) — 목록 시트 자리에 조건 요약(누르면 펼쳐 출발 위치·이동 수단·날짜·출발 시각·산행 시간·난이도)과
// 추천 목록(순위·사진·코스·이유 문장·주의할 점). 웹 HikingRecommend 의 앱 판 — 서버 추천(GET /v1/hiking/recommend)을 그대로
// 그리고, 고르면 그 산의 그 코스 상세를 연다. 조건은 화면 상태(앱은 URL 이 없다)라 산을 보고 돌아와도 그대로다.

export type HikingOrigin = 'me' | (typeof HIKING_ORIGIN_CITIES)[number]['key'];
export type HikingOriginState = 'ok' | 'pending' | 'failed' | 'idle';

export interface HikingRecommendInput {
  day: number;
  startMin: number;
  duration: HikingDuration;
  level: HikingLevel;
  mode: HikingTravelMode;
  origin: HikingOrigin;
}

interface Props {
  input: HikingRecommendInput;
  dates: readonly string[];
  openedAt: number;
  originState: HikingOriginState;
  // 'me' 가 저장한 위치(날씨·대기와 공유)에서 온 것인지 — 요약 문구만 바꾼다.
  originSaved: boolean;
  onChange: (patch: Partial<HikingRecommendInput>) => void;
  onUseMyLocation: () => void;
  result: HikingRecommendResultType | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  selectedMountainId: string | null;
  onSelect: (mountainId: string, courseId: string) => void;
  bottomPad: number;
}

const WARN = { light: '#92400e', dark: '#fcd34d' };
// 요약 문구의 "…에서 차로 / 대중교통으로" — 받침에 따라 조사가 달라 라벨에 붙이지 않고 따로 둔다.
const TRAVEL_BY: Record<HikingTravelMode, string> = { car: '차로', transit: '대중교통으로' };

const fitsDuration = (outingMin: number | null, d: HikingDuration): boolean =>
  outingMin !== null && outingMin >= HIKING_DURATION_RANGE[d].min && outingMin <= HIKING_DURATION_RANGE[d].max;

const Chip = ({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: 'crosshairs-gps' }) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (on) return;
        hapticSelection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [
        styles.chip,
        on ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary } : { borderColor: theme.colors.border },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={13} color={on ? theme.colors.primaryText : theme.colors.textMuted} />}
      <Text style={[styles.chipText, { color: on ? theme.colors.primaryText : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
};

const Field = ({ label, children, scroll = false }: { label: string; children: ReactNode; scroll?: boolean }) => {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.fieldBody}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.chips, styles.fieldBody]}>{children}</View>
      )}
    </View>
  );
};

export const HikingRecommendPanel = ({
  input,
  dates,
  openedAt,
  originState,
  originSaved,
  onChange,
  onUseMyLocation,
  result,
  isLoading,
  isFetching,
  isError,
  selectedMountainId,
  onSelect,
  bottomPad,
}: Props) => {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const [editing, setEditing] = useState(false);
  const date = dates[input.day] ?? dates[0] ?? '';
  const city = input.origin === 'me' ? null : hikingOriginCity(input.origin);
  const originText = city ? city.name : originSaved ? '저장한 내 위치' : '내 위치';
  const summary = [
    `${hikingDayLabel(date, input.day)} ${minToHm(input.startMin)} 출발`,
    HIKING_DURATION_LABEL[input.duration],
    input.level === 'any' ? '난이도 상관없음' : HIKING_LEVEL_LABEL[input.level],
    `${originText}에서 ${TRAVEL_BY[input.mode]}`,
  ].join(' · ');
  const originNote =
    input.origin !== 'me'
      ? null
      : originState === 'pending'
        ? '내 위치를 찾는 중…'
        : originState === 'failed'
          ? '내 위치를 찾지 못해 거리는 빼고 추천합니다 — 출발 도시를 고르세요.'
          : originState === 'idle'
            ? '거리를 보려면 내 위치를 허용하거나 출발 도시를 고르세요.'
            : null;

  return (
    <BottomSheetScrollView contentContainerStyle={[styles.pad, { paddingBottom: bottomPad }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { borderColor: theme.colors.border }]}>
        <Pressable
          onPress={() => setEditing((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: editing }}
          accessibilityHint="추천 조건을 바꿉니다"
          style={({ pressed }) => [styles.summary, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialCommunityIcons name="tune-variant" size={16} color={theme.colors.text} />
          <Text style={[styles.summaryText, { color: theme.colors.text }]}>{summary}</Text>
          <MaterialCommunityIcons name={editing ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
        </Pressable>
        {editing && (
          <View style={[styles.editor, { borderTopColor: theme.colors.border }]}>
            <HikingDayStartPicker dates={dates} value={input} openedAt={openedAt} onChange={(v) => onChange(v)} />
            <Field label="산행 시간">
              {HIKING_DURATIONS.map((d) => (
                <Chip key={d} label={HIKING_DURATION_LABEL[d]} on={input.duration === d} onPress={() => onChange({ duration: d })} />
              ))}
            </Field>
            <Field label="난이도">
              {HIKING_LEVELS.map((l) => (
                <Chip key={l} label={HIKING_LEVEL_LABEL[l]} on={input.level === l} onPress={() => onChange({ level: l })} />
              ))}
            </Field>
            <Field label="이동">
              {HIKING_TRAVEL_MODES.map((m) => (
                <Chip key={m} label={HIKING_TRAVEL_MODE_LABEL[m]} on={input.mode === m} onPress={() => onChange({ mode: m })} />
              ))}
            </Field>
            <Field label="출발 위치" scroll>
              <Chip
                label="내 위치"
                icon="crosshairs-gps"
                on={input.origin === 'me'}
                onPress={() => {
                  onChange({ origin: 'me' });
                  if (originState !== 'ok') onUseMyLocation();
                }}
              />
              {HIKING_ORIGIN_CITIES.map((c) => (
                <Chip key={c.key} label={c.name} on={input.origin === c.key} onPress={() => onChange({ origin: c.key })} />
              ))}
            </Field>
          </View>
        )}
      </View>
      {originNote && (
        <View style={styles.originNote}>
          <Text style={[styles.note, styles.flex, { color: theme.colors.textMuted }]}>{originNote}</Text>
          {(originState === 'failed' || originState === 'idle') && (
            <Pressable onPress={onUseMyLocation} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.locBtn, { borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={13} color={theme.colors.text} />
              <Text style={[styles.locText, { color: theme.colors.text }]}>내 위치</Text>
            </Pressable>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={styles.state}>
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>날씨·산불까지 살펴 추천하는 중…</Text>
        </View>
      ) : isError ? (
        <Text style={[styles.stateText, styles.stateOnly, { color: theme.colors.textMuted }]}>추천을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</Text>
      ) : result ? (
        <View style={{ opacity: isFetching ? 0.6 : 1 }}>
          {result.items.length > 0 && !result.items.some((it) => fitsDuration(it.course.outingMin, input.duration)) && (
            <View style={styles.hint}>
              <Text style={[styles.hintText, { color: isDark ? WARN.dark : WARN.light }]}>
                {HIKING_DURATION_LABEL[input.duration]} 길이로 {minToHm(input.startMin)}에 출발해 해 지기 전에 내려올 코스가 없어 다른 길이를
                골랐습니다 — 출발을 당기거나 산행 시간을 바꿔 보세요.
              </Text>
            </View>
          )}
          {result.items.map((it) => {
            const warns = it.cautions.filter((c) => c.level === 'warn');
            const selected = it.mountain.id === selectedMountainId;
            const img = it.mountain.images[0];
            const top = it.mountain.kind === 'top100';
            return (
              <Pressable
                key={it.course.id}
                onPress={() => onSelect(it.mountain.id, it.course.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.item,
                  { borderBottomColor: theme.colors.border },
                  (selected || pressed) && { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <View>
                  {img !== undefined ? (
                    <Image source={{ uri: hikingImageUrl(it.mountain.id, img) }} style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt }]} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <MaterialCommunityIcons name="image-filter-hdr" size={20} color={top ? HIKING_MOUNTAIN_COLOR : HIKING_PEAK_COLOR} />
                    </View>
                  )}
                  <View style={[styles.rank, { backgroundColor: theme.colors.primary }]}>
                    <Text style={[styles.rankText, { color: theme.colors.primaryText }]}>{it.rank}</Text>
                  </View>
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                      {it.mountain.name}
                    </Text>
                    {it.mountain.heightM !== null && <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatHikingEle(it.mountain.heightM)}</Text>}
                    {top && <Text style={[styles.top100, isDark && styles.top100Dark]}>100대 명산</Text>}
                    {it.course.difficulty && (
                      <Text style={[styles.meta, styles.right, { color: theme.colors.textMuted }]}>{HIKING_DIFFICULTY_LABEL[it.course.difficulty]}</Text>
                    )}
                  </View>
                  <Text style={[styles.course, { color: theme.colors.text }]} numberOfLines={1}>
                    {it.course.name}
                  </Text>
                  <Text style={[styles.reason, { color: theme.colors.textMuted }]}>{it.reason}</Text>
                  {warns.slice(0, 2).map((c) => (
                    <View key={c.text} style={styles.warn}>
                      <MaterialCommunityIcons name="alert-outline" size={12} color={isDark ? WARN.dark : WARN.light} style={styles.warnIcon} />
                      <Text style={[styles.warnText, { color: isDark ? WARN.dark : WARN.light }]}>{c.text}</Text>
                    </View>
                  ))}
                  {warns.length > 2 && <Text style={[styles.note, { color: theme.colors.textMuted }]}>주의 {warns.length - 2}개 더</Text>}
                </View>
              </Pressable>
            );
          })}
          {result.items.length === 0 && <Text style={[styles.stateText, styles.stateOnly, { color: theme.colors.textMuted }]}>추천할 코스가 없습니다.</Text>}
        </View>
      ) : null}
      <Text style={[styles.note, styles.footnote, { color: theme.colors.textMuted }]}>
        100대 명산과 전국 주요 봉우리를 산행 시간·난이도·거리·해 지기 전 하산·주차/정류장·산 소개의 계절 볼거리로 고르고(100대 명산은 조금
        앞세웁니다), 위쪽 산만 날씨·산불·대기를 더 봅니다. 차로 시간은 직선거리 × 1.3 으로 본 대략값(추정)입니다.
      </Text>
    </BottomSheetScrollView>
  );
};

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 12, paddingTop: 4, gap: 8 },
  flex: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  summaryText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  editor: { gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { width: 52, fontSize: 12 },
  fieldBody: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11 },
  chipText: { fontSize: 12, fontWeight: '600' },
  originNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 28, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10 },
  locText: { fontSize: 12, fontWeight: '600' },
  state: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28 },
  stateText: { fontSize: 13 },
  stateOnly: { textAlign: 'center', paddingVertical: 28 },
  hint: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(245,158,11,0.12)', marginBottom: 4 },
  hintText: { fontSize: 12, lineHeight: 17 },
  item: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  rank: { position: 'absolute', left: -5, top: -5, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  rankText: { fontSize: 11, fontWeight: '700' },
  itemBody: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, fontVariant: ['tabular-nums'] },
  right: { marginLeft: 'auto' },
  top100: { fontSize: 10, fontWeight: '700', color: '#047857', backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  top100Dark: { color: '#6ee7b7' },
  course: { fontSize: 13 },
  reason: { fontSize: 12, lineHeight: 17 },
  warn: { flexDirection: 'row', gap: 4 },
  warnIcon: { marginTop: 2 },
  warnText: { flex: 1, fontSize: 11, lineHeight: 16 },
  note: { fontSize: 11, lineHeight: 16 },
  footnote: { paddingTop: 4 },
});
