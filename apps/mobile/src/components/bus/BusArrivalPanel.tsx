import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';
import type {
  BusArrivalEntryType,
  BusArrivalItemType,
  BusRouteInfoType,
  BusStationItemType,
} from '@repo/api-contract';

// 실시간(30초 폴링) — 초 단위 상대시각.
const formatRelativeSec = (iso: string, nowMs: number): string => {
  const sec = Math.floor(Math.max(0, nowMs - new Date(iso).getTime()) / 1000);
  if (sec < 10) return '방금 전';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
};

// "곧 도착" 계열 메시지 강조 판정 — 서울시 원문이 "곧 도착" 단독 표기.
const isImminent = (message: string): boolean => message.includes('곧 도착');

export interface BusArrivalPanelProps {
  station: BusStationItemType;
  items: BusArrivalItemType[];
  fetchedAt: string | null;
  isLoading: boolean;
  isFetching: boolean;
  // 정류장 전환 직후 이전 정류장 데이터(placeholder) 표시 중 — 디밍.
  isPlaceholder: boolean;
  isError: boolean;
  // 노선 행 토글 = 지도 추적(M7). null 이면 미추적.
  selectedRouteId: string | null;
  onToggleRoute(busRouteId: string): void;
  onBack(): void;
  onRetry(): void;
  // 즐겨찾기 슬롯(M6) — 헤더 정류장 별 / 노선 행 별.
  headerStar?: React.ReactNode;
  routeStar?(item: BusArrivalItemType): React.ReactNode;
  // 추적 중 노선의 기본정보(M7) — null 이면 카드 생략.
  routeInfo?: BusRouteInfoType | null;
  bottomPad?: number;
}

// 선택 정류장의 실시간 도착정보 패널 — Detail 바텀시트 내부 뷰(웹 동명 이식).
export const BusArrivalPanel = ({
  station,
  items,
  fetchedAt,
  isLoading,
  isFetching,
  isPlaceholder,
  isError,
  selectedRouteId,
  onToggleRoute,
  onBack,
  onRetry,
  headerStar,
  routeStar,
  routeInfo,
  bottomPad = 24,
}: BusArrivalPanelProps) => {
  const theme = useTheme();
  // arsId '0' = 가상정류장 — 도착정보 API 자체가 없다(훅도 미호출).
  const virtual = station.arsId === '0';
  // '갱신 N초 전' 자동 진행 — 1초 tick(패널 로컬).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.colors.textMuted }]}>← 목록</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {station.name}
          </Text>
          {!virtual && (
            <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                {station.arsId}
              </Text>
            </View>
          )}
          <View style={styles.headerRight}>{headerStar}</View>
        </View>
        {!virtual && fetchedAt && (
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              갱신 {formatRelativeSec(fetchedAt, nowMs)} · 30초마다 자동 갱신
            </Text>
            {isFetching && <ActivityIndicator size="small" />}
          </View>
        )}
      </View>

      <BottomSheetScrollView
        contentContainerStyle={[styles.scrollPad, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {selectedRouteId && routeInfo && <RouteInfoCard info={routeInfo} />}
        {virtual ? (
          <Hint>가상정류장 — 도착정보를 제공하지 않습니다.</Hint>
        ) : isLoading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={[styles.centerText, { color: theme.colors.textMuted }]}>
              도착정보 불러오는 중…
            </Text>
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.centerText, { color: theme.colors.danger }]}>
              도착정보를 불러오지 못했습니다.
            </Text>
            <Pressable
              onPress={onRetry}
              style={[styles.retryBtn, { borderColor: theme.colors.border }]}
            >
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>재시도</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <Hint>이 정류장의 도착 예정 노선이 없습니다.</Hint>
        ) : (
          <View style={[styles.list, isPlaceholder && styles.dimmed]}>
            {items.map((it) => {
              const selected = it.busRouteId === selectedRouteId;
              return (
                <View key={it.busRouteId} style={styles.routeRowWrap}>
                  <Pressable
                    onPress={() => onToggleRoute(it.busRouteId)}
                    android_ripple={{ color: theme.colors.surfaceAlt }}
                    accessibilityState={selected ? { selected: true } : undefined}
                    style={[
                      styles.routeRow,
                      selected && { backgroundColor: theme.colors.surfaceAlt },
                    ]}
                  >
                    <Text style={[styles.routeName, { color: theme.colors.text }]}>
                      {it.routeName}
                    </Text>
                    <View style={styles.arrivalCol}>
                      <ArrivalMessage entry={it.first} primary nowMs={nowMs} />
                      {it.first && it.second && (
                        <ArrivalMessage entry={it.second} nowMs={nowMs} />
                      )}
                    </View>
                  </Pressable>
                  {routeStar?.(it)}
                </View>
              );
            })}
          </View>
        )}
      </BottomSheetScrollView>
    </View>
  );
};

const ArrivalMessage = ({
  entry,
  primary = false,
}: {
  entry: BusArrivalEntryType | null;
  primary?: boolean;
  nowMs: number;
}) => {
  const theme = useTheme();
  if (!entry) {
    return (
      <Text style={[styles.arrivalSub, { color: theme.colors.textMuted }]}>
        도착 정보 없음
      </Text>
    );
  }
  const imminentColor = theme.mode === 'dark' ? '#34d399' : '#059669';
  return (
    <Text
      numberOfLines={1}
      style={[
        primary ? styles.arrivalMain : styles.arrivalSub,
        {
          color: isImminent(entry.message)
            ? imminentColor
            : primary
              ? theme.colors.text
              : theme.colors.textMuted,
        },
        isImminent(entry.message) && { fontWeight: '600' },
      ]}
    >
      {entry.message}
    </Text>
  );
};

// 추적 중 노선의 기본정보 카드 — 기점↔종점/배차/운행시간/운수사/노선거리.
const RouteInfoCard = ({ info }: { info: BusRouteInfoType }) => {
  const theme = useTheme();
  const rows: { label: string; value: string }[] = [];
  if (info.stStationName || info.edStationName) {
    rows.push({ label: '구간', value: `${info.stStationName} ↔ ${info.edStationName}` });
  }
  if (info.termMin != null) rows.push({ label: '배차', value: `${info.termMin}분` });
  if (info.firstBusTime && info.lastBusTime) {
    rows.push({ label: '운행', value: `${info.firstBusTime} ~ ${info.lastBusTime}` });
  }
  if (info.corpName) rows.push({ label: '운수사', value: info.corpName });
  if (info.lengthKm != null) rows.push({ label: '노선거리', value: `${info.lengthKm}km` });
  if (rows.length === 0) return null;
  return (
    <View
      style={[
        styles.infoCard,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
      ]}
    >
      <View style={styles.infoHeader}>
        <Text style={[styles.infoTitle, { color: theme.colors.text }]}>{info.routeName}</Text>
        <Text style={[styles.infoSub, { color: theme.colors.textMuted }]}>노선 정보</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>{r.label}</Text>
          <Text style={[styles.infoValue, { color: theme.colors.text }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <View style={[styles.hint, { borderColor: theme.colors.border }]}>
      <Text style={[styles.hintText, { color: theme.colors.textMuted }]}>{children}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: { flexShrink: 0 },
  backText: { fontSize: 12 },
  title: { fontSize: 15, fontWeight: '600', flexShrink: 1, minWidth: 0 },
  headerRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 11, fontVariant: ['tabular-nums'] },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  scrollPad: { padding: 12 },
  center: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  centerText: { fontSize: 13 },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hint: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  hintText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  list: { gap: 2 },
  dimmed: { opacity: 0.5 },
  routeRowWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  routeRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeName: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  arrivalCol: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 2,
  },
  arrivalMain: { fontSize: 13, textAlign: 'right' },
  arrivalSub: { fontSize: 11, textAlign: 'right' },
  infoCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoTitle: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  infoSub: { fontSize: 11 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { width: 52, fontSize: 12, flexShrink: 0 },
  infoValue: { fontSize: 12, flexShrink: 1 },
});
