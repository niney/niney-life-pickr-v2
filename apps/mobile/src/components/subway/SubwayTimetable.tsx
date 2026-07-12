import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';
import type {
  SubwayCongestionResultType,
  SubwayTimetableResultType,
  SubwayTimetableTrainItemType,
} from '@repo/api-contract';
import {
  formatHHMM,
  isSubwayExpressTag,
  parseTimeMin,
  updnLabel,
  type SubwayDayType,
} from '@repo/utils';
import { SubwayLineBadge } from './SubwayLineBadge';
import { congestionBand, congestionDirForUpdn, slotLevel, timeToSlotKey } from './congestionUtils';

const DAY_TYPES: { value: SubwayDayType; label: string }[] = [
  { value: '1', label: '평일' },
  { value: '2', label: '토' },
  { value: '3', label: '휴일' },
];

// 열차 행 고정 높이 — getItemLayout/scrollToIndex(다음 열차 자동 스크롤)용.
const ROW_H = 36;

export interface SubwayTimetableProps {
  stationName: string;
  lineId: string;
  timetable: SubwayTimetableResultType | null;
  isLoading: boolean;
  isError: boolean;
  dayType: SubwayDayType;
  onDayType(dayType: SubwayDayType): void;
  onBack(): void;
  // 이 역·요일 혼잡도(정적 통계) — 각 열차 시각의 슬롯 level 을 색 dot 으로.
  congestion?: SubwayCongestionResultType | null;
  bottomPad?: number;
}

// 역 시간표 뷰 — Detail 시트가 도착 패널 대신 이 뷰로 전환('← 도착정보' 복귀).
// 한 응답에 상·하행 모두라 방향 토글은 로컬 상태(재요청 없음), dayType 은
// 상위가 소유(요일 전환 시 재조회).
export const SubwayTimetable = ({
  stationName,
  lineId,
  timetable,
  isLoading,
  isError,
  dayType,
  onDayType,
  onBack,
  congestion,
  bottomPad = 24,
}: SubwayTimetableProps) => {
  const theme = useTheme();
  const directions = timetable?.coverage ? timetable.directions : [];

  // 방향 토글 — 응답에 없는 updn 이면 첫 방향으로 폴백(파생 — setState 없이).
  const [selectedUpdn, setSelectedUpdn] = useState('1');
  const activeDir = directions.find((d) => d.updn === selectedUpdn) ?? directions[0] ?? null;

  const congestionDir =
    congestion?.coverage && activeDir
      ? congestionDirForUpdn(activeDir.updn, congestion.directions)
      : null;

  const trains = activeDir?.trains ?? [];
  // 현재 시각 이후 첫 열차 — 하이라이트 + 자동 스크롤 기준.
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nextIdx = trains.findIndex((t) => parseTimeMin(t.arriveTime) >= nowMin);

  // 자동 스크롤 — dayType/방향/역 전환 시 1회, 다음 열차를 중앙으로.
  const listRef = useRef<React.ComponentRef<typeof BottomSheetFlatList<SubwayTimetableTrainItemType>> | null>(null);
  const scrollKey = `${dayType}:${activeDir?.updn ?? ''}:${timetable?.stationId ?? ''}`;
  useEffect(() => {
    if (nextIdx < 0 || trains.length === 0) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: nextIdx, viewPosition: 0.4, animated: false });
    }, 60);
    return () => clearTimeout(t);
    // nextIdx/trains 는 의도적으로 deps 제외 — 전환 시 1회만(분 경과로 재스크롤 금지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  const imminentBg = theme.mode === 'dark' ? 'rgba(6, 78, 59, 0.4)' : '#ecfdf5';
  const imminentText = theme.mode === 'dark' ? '#34d399' : '#047857';
  const amberColor = theme.mode === 'dark' ? '#fbbf24' : '#b45309';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.colors.textMuted }]}>
              ← 도착정보
            </Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {stationName}
          </Text>
          <View style={styles.headerRight}>
            <SubwayLineBadge lineId={lineId} />
          </View>
        </View>

        {/* 평일/토/휴일 토글 — 상위가 dayType 소유(재조회). */}
        <View style={styles.toggleRow}>
          {DAY_TYPES.map((d) => (
            <Pressable
              key={d.value}
              onPress={() => onDayType(d.value)}
              style={[
                styles.dayBtn,
                dayType === d.value && { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.dayBtnText,
                  {
                    color:
                      dayType === d.value ? theme.colors.primaryText : theme.colors.textMuted,
                  },
                ]}
              >
                {d.label}
              </Text>
            </Pressable>
          ))}
          {timetable?.source === 'stale' && (
            <Text style={[styles.staleText, { color: amberColor }]}>저장된 시간표</Text>
          )}
        </View>

        {/* 상/하행 토글 — 응답 방향만(재요청 없음). */}
        {directions.length > 1 && (
          <View style={styles.toggleRow}>
            {directions.map((d) => (
              <Pressable
                key={d.updn}
                onPress={() => setSelectedUpdn(d.updn)}
                style={[
                  styles.updnBtn,
                  activeDir?.updn === d.updn && { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <Text
                  style={[
                    styles.dayBtnText,
                    {
                      color:
                        activeDir?.updn === d.updn
                          ? theme.colors.text
                          : theme.colors.textMuted,
                    },
                  ]}
                >
                  {updnLabel(d.updn)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* 첫차/막차 요약 — 헤더 고정(리스트 스크롤과 분리). */}
        {activeDir && (
          <View
            style={[
              styles.summary,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>첫차</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                {activeDir.firstTrain ? formatHHMM(activeDir.firstTrain) : '—'}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>막차</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
                {activeDir.lastTrain ? formatHHMM(activeDir.lastTrain) : '—'}
              </Text>
            </View>
          </View>
        )}
      </View>

      {isLoading && !activeDir ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={[styles.centerText, { color: theme.colors.textMuted }]}>
            시간표 불러오는 중…
          </Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: theme.colors.danger }]}>
            시간표를 불러오지 못했습니다.
          </Text>
        </View>
      ) : timetable && !timetable.coverage ? (
        <Hint>이 노선은 시간표를 제공하지 않아요 (광역·경전철 노선).</Hint>
      ) : !activeDir || trains.length === 0 ? (
        <Hint>시간표 정보가 없습니다.</Hint>
      ) : (
        <BottomSheetFlatList
          ref={listRef}
          data={trains}
          keyExtractor={(t: SubwayTimetableTrainItemType, idx: number) =>
            `${t.trainNo ?? 'x'}-${idx}`
          }
          getItemLayout={(_: unknown, index: number) => ({
            length: ROW_H,
            offset: ROW_H * index,
            index,
          })}
          onScrollToIndexFailed={() => {}}
          contentContainerStyle={[styles.listPad, { paddingBottom: bottomPad }]}
          ListHeaderComponent={
            congestionDir ? (
              <Text style={[styles.noteText, { color: theme.colors.textMuted }]}>
                혼잡도: 시간대 평균(분기 통계)
              </Text>
            ) : null
          }
          ListFooterComponent={
            <Text style={[styles.noteText, { color: theme.colors.textMuted }]}>
              시간표는 참고용이며 실제 운행과 다를 수 있어요.
            </Text>
          }
          renderItem={({ item: t, index }: { item: SubwayTimetableTrainItemType; index: number }) => {
            const isNext = index === nextIdx;
            const express = isSubwayExpressTag(t.expressTag);
            const congLevel = slotLevel(congestionDir, timeToSlotKey(t.arriveTime));
            const congBand = congLevel !== null ? congestionBand(congLevel) : null;
            return (
              <View
                style={[
                  styles.row,
                  isNext && { backgroundColor: imminentBg, borderRadius: 8 },
                ]}
              >
                <View style={styles.dotSlot}>
                  {congBand && (
                    <View style={[styles.dot, { backgroundColor: congBand.dot }]} />
                  )}
                </View>
                <Text
                  style={[
                    styles.time,
                    { color: isNext ? imminentText : theme.colors.text },
                    isNext && { fontWeight: '600' },
                  ]}
                >
                  {formatHHMM(t.arriveTime)}
                </Text>
                <Text
                  style={[styles.dest, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {t.destination ? `${t.destination}행` : ''}
                </Text>
                {express && (
                  <View style={[styles.pill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <Text style={[styles.pillText, { color: amberColor }]}>급행</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <View style={styles.hintWrap}>
      <View style={[styles.hint, { borderColor: theme.colors.border }]}>
        <Text style={[styles.hintText, { color: theme.colors.textMuted }]}>{children}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: { flexShrink: 0 },
  backText: { fontSize: 12 },
  title: { fontSize: 15, fontWeight: '600', flexShrink: 1, minWidth: 0 },
  headerRight: { marginLeft: 'auto' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dayBtnText: { fontSize: 12, fontWeight: '600' },
  updnBtn: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: 'center',
  },
  staleText: { marginLeft: 'auto', fontSize: 11, fontWeight: '600' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
  },
  summaryCol: { alignItems: 'center', gap: 2 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 28 },
  center: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  centerText: { fontSize: 13 },
  hintWrap: { padding: 12 },
  hint: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  hintText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  listPad: { paddingHorizontal: 12, paddingTop: 8 },
  noteText: { fontSize: 11, paddingHorizontal: 4, paddingVertical: 6 },
  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  dotSlot: { width: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  time: { width: 48, fontSize: 13, fontVariant: ['tabular-nums'] },
  dest: { flex: 1, minWidth: 0, fontSize: 13 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: { fontSize: 10, fontWeight: '600' },
});
