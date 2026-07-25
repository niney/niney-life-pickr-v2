import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';
import {
  busRouteTypeColor,
  formatRelativeSec,
  resolveTrainSection,
  subwayDestinationLabel,
  subwayLineColor,
  subwayLineName,
} from '@repo/utils';
import type { PinnedRideDetail } from './usePinnedVehicle';

// 앞으로 지날 정류장/역 표시 상한 — 버스 노선상세는 왕복 전체(수백 개)가 한
// 배열이라 전부 그리면 시트가 무거워진다. 넘치면 마지막 줄에 잔여 개수만.
const UPCOMING_LIMIT = 20;

// trainSttus 원문 → 상태 문구. 0진입/1도착/2출발/3전역출발.
const TRAIN_STATUS_TEXT: Record<string, string> = {
  '0': '진입 중',
  '1': '정차 중',
  '2': '출발',
  '3': '전역 출발',
};

export interface RideDetailPanelProps {
  // null = 최신 폴링에 대상이 없음(일시적) — 헤더는 유지하고 본문만 대기 문구.
  detail: PinnedRideDetail | null;
  // 칩과 같은 라벨(노선번호 / 행선) — detail 이 비기 전 마지막 값.
  label: string | null;
  onBack(): void;
  onUnpin(): void;
  // 정류장/역 행 탭 — 기존 선택 흐름으로 점프(미지정이면 행이 비활성).
  onSelectBusStation?(stId: string): void;
  onSelectSubwayStation?(stationId: string): void;
  bottomPad?: number;
}

// 탑승(핀) 차량 상세 — Detail 바텀시트 내부 뷰. 데이터는 usePinnedVehicle 이
// 이미 구독 중인 실시간 위치 + 노선/호선 상세를 그대로 받는다(추가 요청 없음).
export const RideDetailPanel = ({
  detail,
  label,
  onBack,
  onUnpin,
  onSelectBusStation,
  onSelectSubwayStation,
  bottomPad = 24,
}: RideDetailPanelProps) => {
  const theme = useTheme();
  // 갱신 상대시각 tick — 패널 하나의 1초 interval(도착 패널과 동일 패턴).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const view = useMemo(() => buildView(detail, label), [detail, label]);

  const onSelect =
    detail === null
      ? undefined
      : detail.mode === 'bus'
        ? onSelectBusStation
        : onSelectSubwayStation;

  return (
    <View style={styles.container}>
      {/* 헤더 — 지도 복귀 + 차량 식별 + 탑승 종료. */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.colors.textMuted }]}>← 지도</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <View style={[styles.routeBadge, { backgroundColor: view.color }]}>
              <Text style={styles.routeBadgeText} numberOfLines={1}>
                {view.badge}
              </Text>
            </View>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
              {view.title}
            </Text>
          </View>
          <Pressable
            onPress={onUnpin}
            hitSlop={8}
            style={[styles.headerAction, { backgroundColor: theme.colors.dangerBg }]}
            accessibilityLabel="탑승 종료"
          >
            <Text style={[styles.headerActionText, { color: theme.colors.danger }]}>
              탑승 종료
            </Text>
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          {view.fetchedAt && (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              갱신 {formatRelativeSec(view.fetchedAt, nowMs)}
            </Text>
          )}
          {view.stale && (
            <View style={[styles.pill, { backgroundColor: theme.colors.dangerBg }]}>
              <Text style={[styles.pillText, { color: theme.colors.danger }]}>지연</Text>
            </View>
          )}
          {view.tags.map((t) => (
            <View
              key={t}
              style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}
            >
              <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>{t}</Text>
            </View>
          ))}
        </View>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={[styles.scrollPad, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 현재 위치 — 정차/주행 + 직전·다음 정류장(역). */}
        <View
          style={[
            styles.card,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <Text style={[styles.statusText, { color: theme.colors.text }]}>{view.status}</Text>
          {view.statusSub && (
            <Text style={[styles.statusSub, { color: theme.colors.textMuted }]}>
              {view.statusSub}
            </Text>
          )}
        </View>

        {view.rows.length > 0 && (
          <View
            style={[
              styles.card,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            {view.rows.map((r) => (
              <View key={r.label} style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: theme.colors.textMuted }]}>
                  {r.label}
                </Text>
                <Text
                  style={[styles.infoValue, { color: theme.colors.text }]}
                  numberOfLines={2}
                >
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
          앞으로 지나요
        </Text>
        {view.upcoming.length === 0 ? (
          <View style={[styles.hint, { borderColor: theme.colors.border }]}>
            <Text style={[styles.hintText, { color: theme.colors.textMuted }]}>
              {view.upcomingEmpty}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.list,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
          >
            {view.upcoming.map((u, i) => (
              <Pressable
                key={u.key}
                onPress={onSelect ? () => onSelect(u.id) : undefined}
                disabled={!onSelect}
                style={[
                  styles.listRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                  { borderTopColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.listOrd, { color: theme.colors.textMuted }]}>
                  {i + 1}
                </Text>
                <Text
                  style={[styles.listName, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {u.name}
                </Text>
                {u.tag && (
                  <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                      {u.tag}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
            {view.moreCount > 0 && (
              <View
                style={[
                  styles.listRow,
                  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
                ]}
              >
                <Text style={[styles.listMore, { color: theme.colors.textMuted }]}>
                  … 이후 {view.moreCount}개 더
                </Text>
              </View>
            )}
          </View>
        )}
      </BottomSheetScrollView>
    </View>
  );
};

interface UpcomingItem {
  key: string;
  // 탭 시 넘길 식별자 — 버스는 stId, 지하철은 stationId.
  id: string;
  name: string;
  tag?: string;
}

interface RideView {
  badge: string;
  color: string;
  title: string;
  status: string;
  statusSub: string | null;
  tags: string[];
  rows: { label: string; value: string }[];
  upcoming: UpcomingItem[];
  upcomingEmpty: string;
  moreCount: number;
  fetchedAt: string | null;
  stale: boolean;
}

// 상세 → 표시 모델. 모드 분기를 렌더에서 걷어내 JSX 를 한 벌로 유지한다.
const buildView = (detail: PinnedRideDetail | null, label: string | null): RideView => {
  if (detail === null) {
    return {
      badge: label ?? '탑승',
      color: '#6b7280',
      title: '탑승 중',
      status: '차량 위치를 불러오는 중…',
      statusSub: null,
      tags: [],
      rows: [],
      upcoming: [],
      upcomingEmpty: '다음 갱신을 기다리는 중입니다.',
      moreCount: 0,
      fetchedAt: null,
      stale: false,
    };
  }
  return detail.mode === 'bus' ? buildBusView(detail, label) : buildSubwayView(detail, label);
};

const buildBusView = (
  detail: Extract<PinnedRideDetail, { mode: 'bus' }>,
  label: string | null,
): RideView => {
  const { vehicle, route } = detail;
  const info = route?.info ?? null;
  const stations = route?.stations ?? [];
  const badge = info?.routeName ?? label ?? '버스';
  const color = info ? busRouteTypeColor(info.routeType) : '#6b7280';

  // sectOrd = 현재 구간의 시작 정류소 seq(지도 보간과 같은 규약) — 직전 정류장.
  const ord = vehicle.sectOrd;
  const at = ord === null ? null : (stations.find((s) => s.seq === ord) ?? null);
  const next = ord === null ? null : (stations.find((s) => s.seq === ord + 1) ?? null);
  const stopped = vehicle.stopFlag === '1';

  const status = stopped
    ? at
      ? `${at.name} 정차 중`
      : '정차 중'
    : at && next
      ? `${at.name} → ${next.name}`
      : next
        ? `${next.name} 방면 주행 중`
        : '주행 중';
  const statusSub = stopped
    ? next
      ? `다음 ${next.name}`
      : null
    : at?.direction
      ? `${at.direction} 방면`
      : null;

  const tags: string[] = [];
  if (vehicle.plainNo) tags.push(vehicle.plainNo);

  const rows: { label: string; value: string }[] = [];
  if (info) {
    if (info.stStationName || info.edStationName) {
      rows.push({ label: '구간', value: `${info.stStationName} ↔ ${info.edStationName}` });
    }
    if (info.termMin != null) rows.push({ label: '배차', value: `${info.termMin}분` });
    if (info.firstBusTime && info.lastBusTime) {
      rows.push({ label: '운행', value: `${info.firstBusTime} ~ ${info.lastBusTime}` });
    }
    if (info.corpName) rows.push({ label: '운수사', value: info.corpName });
  }

  // 남은 경유 정류소 — 회차점(transYn)까지가 이번 편도. 이미 지났으면 종점까지.
  let rest = ord === null ? [] : stations.filter((s) => s.seq > ord);
  const turnAt = rest.findIndex((s) => s.isTurnPoint);
  if (turnAt >= 0) rest = rest.slice(0, turnAt + 1);
  const upcoming: UpcomingItem[] = rest.slice(0, UPCOMING_LIMIT).map((s) => ({
    key: `${s.seq}:${s.stId}`,
    id: s.stId,
    name: s.name,
    ...(s.isTurnPoint ? { tag: '회차' } : {}),
  }));

  return {
    badge,
    color,
    title: info ? `${info.edStationName} 방면` : '탑승 중',
    status,
    statusSub,
    tags,
    rows,
    upcoming,
    upcomingEmpty:
      ord === null
        ? '차량 구간 정보가 없어 남은 정류장을 계산할 수 없습니다.'
        : '남은 정류장 정보가 없습니다.',
    moreCount: Math.max(0, rest.length - upcoming.length),
    fetchedAt: detail.fetchedAt,
    stale: detail.stale,
  };
};

const buildSubwayView = (
  detail: Extract<PinnedRideDetail, { mode: 'subway' }>,
  label: string | null,
): RideView => {
  const { train, line } = detail;
  const lineId = line?.lineId ?? null;
  const color = lineId ? subwayLineColor(lineId) : '#6b7280';
  const dest = subwayDestinationLabel(train.destinationName) || (label ?? '');

  const tags: string[] = [];
  if (train.expressType !== null) tags.push('급행');
  if (train.isLastTrain) tags.push('막차');

  // 지도 보간과 같은 판정(지선 분기·순환 방향) — 순서만 쓰는 경량 section.
  const order = (line?.sections ?? []).map((sec) => ({
    sectionKey: sec.branchKey,
    isLoop: sec.isLoop,
    byName: new Map(sec.stations.map((s, i) => [s.name, i])),
    stationCount: sec.stations.length,
  }));
  const match =
    order.length > 0
      ? resolveTrainSection(order, {
          statnNm: train.statnNm,
          trainStatus: train.trainStatus,
          updnLine: train.updnLine,
          destinationName: train.destinationName,
        })
      : null;
  const section = match ? (line?.sections.find((s) => s.branchKey === match.sectionKey) ?? null) : null;

  // 진행 방향으로 이후 역 — 순환은 한 바퀴(N-1) 상한, 비순환은 종점에서 끊김.
  // '0'(진입)·'3'(전역 출발)은 아직 현재역에 닿지 않은 상태라 현재역부터 넣는다
  // (locateTrain 의 상태 분수와 같은 해석 — 도착/출발만 '지났음').
  const beforeCurrent = train.trainStatus === '0' || train.trainStatus === '3';
  const upcomingAll: UpcomingItem[] = [];
  if (section && match && match.dir !== 0) {
    const n = section.stations.length;
    const max = section.isLoop ? n - 1 : n;
    for (let step = beforeCurrent ? 0 : 1; step <= max; step++) {
      const raw = match.stationIdx + match.dir * step;
      const idx = section.isLoop ? ((raw % n) + n) % n : raw;
      if (idx < 0 || idx >= n) break;
      const st = section.stations[idx]!;
      upcomingAll.push({
        key: `${step}:${st.stationId}`,
        id: st.stationId,
        name: st.name,
        ...(st.isTransfer ? { tag: '환승' } : {}),
      });
    }
  }
  const upcoming = upcomingAll.slice(0, UPCOMING_LIMIT);

  const statusText = TRAIN_STATUS_TEXT[train.trainStatus] ?? '운행 중';
  // 상태 문구가 이미 그 역을 말하고 있으면(진입 중 등) '다음 ○○' 중복 제거.
  const firstUpcoming = upcomingAll[0]?.name ?? null;
  const nextName = firstUpcoming === train.statnNm ? null : firstUpcoming;

  const rows: { label: string; value: string }[] = [];
  if (lineId) rows.push({ label: '호선', value: subwayLineName(lineId) });
  if (train.destinationName) rows.push({ label: '행선', value: train.destinationName });
  if (section?.branchName) rows.push({ label: '구간', value: section.branchName });
  rows.push({ label: '열차번호', value: train.trainNo });
  if (upcomingAll.length > 0) {
    rows.push({ label: '남은 역', value: `${upcomingAll.length}개` });
  }

  return {
    badge: lineId ? subwayLineName(lineId) : '열차',
    color,
    title: dest || '탑승 중',
    status: `${train.statnNm} ${statusText}`,
    statusSub: nextName ? `다음 ${nextName}` : null,
    tags,
    rows,
    upcoming,
    upcomingEmpty:
      match && match.dir === 0
        ? '진행 방향을 판정하지 못해 남은 역을 계산할 수 없습니다.'
        : '노선 순서 정보가 없어 남은 역을 계산할 수 없습니다.',
    moreCount: Math.max(0, upcomingAll.length - upcoming.length),
    fetchedAt: train.receivedAt ?? detail.fetchedAt,
    stale: false,
  };
};

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { flexShrink: 0 },
  backText: { fontSize: 12 },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  routeBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: 110,
  },
  routeBadgeText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  title: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  headerAction: {
    marginLeft: 'auto',
    flexShrink: 0,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionText: { fontSize: 12, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { fontSize: 11, fontVariant: ['tabular-nums'] },
  pill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: '600' },
  scrollPad: { padding: 12, gap: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  statusText: { fontSize: 15, fontWeight: '600' },
  statusSub: { fontSize: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoLabel: { fontSize: 12, width: 56, flexShrink: 0 },
  infoValue: { fontSize: 12, flexShrink: 1, textAlign: 'right', marginLeft: 'auto' },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  list: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  listOrd: {
    fontSize: 11,
    width: 18,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  listName: { fontSize: 13, flexShrink: 1 },
  listMore: { fontSize: 12 },
  hint: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  hintText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
