import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  BusArrivalItemType,
  BusFavoriteRouteItemType,
  BusFavoriteStationItemType,
  SubwayArrivalItemType,
  SubwayFavoriteLineItemType,
  SubwayFavoriteStationItemType,
} from '@repo/api-contract';
import {
  useBusStationArrivals,
  useSubwayStationArrivals,
  useTheme,
  type BusFavoritesApi,
  type SubwayFavoritesApi,
} from '@repo/shared';
import { subwayLineName } from '@repo/utils';
import { SubwayLineBadge } from '~/components/subway/SubwayLineBadge';
import { FavoriteStar } from './FavoriteStar';

// 통합 즐겨찾기 섹션 — 양 모드 초기화면 공용(웹 동명 컴포넌트 이식). 4종(버스
// 정류장/버스 정류장×노선/지하철 역/지하철 역×호선)을 한 목록으로. 도착
// 미리보기는 **펼친 행에서만** 로드+폴링(단일 아코디언 → 동시 폴링 최대 1개,
// swopen/서울시 쿼터 보호). 웹의 transitFavExpandStore 는 데스크톱/모바일 이중
// 마운트 공유용이었다 — RN 은 단일 마운트라 로컬 state 로 충분.
//
// 즐겨찾기 훅은 로그인 병합 부수효과 때문에 "화면당 1회" 호출 — 화면이 호출해
// props 로 넘긴다(이 섹션은 직접 호출 금지).

export type TransitFavTarget =
  | { kind: 'bus-station'; stId: string }
  | { kind: 'bus-route'; stId: string; busRouteId: string }
  | { kind: 'subway-station'; stationId: string }
  | { kind: 'subway-line'; stationId: string };

export interface TransitFavoritesSectionProps {
  bus: BusFavoritesApi;
  subway: SubwayFavoritesApi;
  onNavigate(target: TransitFavTarget): void;
  // 화면 focus && 해당 폴링 허용 상태 — 미리보기 도착 폴링 게이트.
  pollEnabled: boolean;
}

type Row =
  | { kind: 'bus-station'; key: string; item: BusFavoriteStationItemType }
  | { kind: 'bus-route'; key: string; item: BusFavoriteRouteItemType }
  | { kind: 'subway-station'; key: string; item: SubwayFavoriteStationItemType }
  | { kind: 'subway-line'; key: string; item: SubwayFavoriteLineItemType };

const targetOf = (row: Row): TransitFavTarget => {
  switch (row.kind) {
    case 'bus-station':
      return { kind: 'bus-station', stId: row.item.stId };
    case 'bus-route':
      return { kind: 'bus-route', stId: row.item.stId, busRouteId: row.item.busRouteId };
    case 'subway-station':
      return { kind: 'subway-station', stationId: row.item.stationId };
    case 'subway-line':
      return { kind: 'subway-line', stationId: row.item.stationId };
  }
};

// 방향(updnLine)별 첫 도착만 — 서버 정렬(도착 임박순) 전제. 최대 2방향.
const firstPerDirection = (
  items: SubwayArrivalItemType[],
  lineIdFilter?: string,
): SubwayArrivalItemType[] => {
  const seen = new Set<string>();
  const out: SubwayArrivalItemType[] = [];
  for (const it of items) {
    if (lineIdFilter && it.lineId !== lineIdFilter) continue;
    if (seen.has(it.updnLine)) continue;
    seen.add(it.updnLine);
    out.push(it);
    if (out.length >= 2) break;
  }
  return out;
};

export const TransitFavoritesSection = ({
  bus,
  subway,
  onNavigate,
  pollEnabled,
}: TransitFavoritesSectionProps) => {
  const theme = useTheme();
  // 단일 아코디언 — 한 번에 하나만 펼침(동시 폴링 1개 보장).
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows: Row[] = [
    ...bus.stations.map((item) => ({
      kind: 'bus-station' as const,
      key: `bus-station:${item.stId}`,
      item,
    })),
    ...bus.routes.map((item) => ({
      kind: 'bus-route' as const,
      key: `bus-route:${item.stId}::${item.busRouteId}`,
      item,
    })),
    ...subway.stations.map((item) => ({
      kind: 'subway-station' as const,
      key: `subway-station:${item.stationId}`,
      item,
    })),
    ...subway.lines.map((item) => ({
      kind: 'subway-line' as const,
      key: `subway-line:${item.stationId}::${item.lineId}`,
      item,
    })),
  ];

  // 펼친 행 하나만 도착 훅에 연결 — 나머지는 null 로 disabled.
  const expanded = rows.find((r) => r.key === expandedKey) ?? null;
  const busArsId =
    pollEnabled && (expanded?.kind === 'bus-station' || expanded?.kind === 'bus-route')
      ? expanded.item.arsId
      : null;
  const subwayStationId =
    pollEnabled && (expanded?.kind === 'subway-station' || expanded?.kind === 'subway-line')
      ? expanded.item.stationId
      : null;
  const busArrivals = useBusStationArrivals(busArsId);
  const subwayArrivals = useSubwayStationArrivals(subwayStationId);

  const imminentColor = theme.mode === 'dark' ? '#34d399' : '#059669';

  const renderBusPreview = (row: Extract<Row, { kind: 'bus-station' | 'bus-route' }>) => {
    if (row.item.arsId === '0') {
      return <PreviewNote>가상정류장 — 도착정보를 제공하지 않습니다.</PreviewNote>;
    }
    if (busArrivals.isError) {
      return <PreviewNote>도착정보를 불러오지 못했습니다.</PreviewNote>;
    }
    if (!busArrivals.data) {
      return (
        <View style={styles.previewLoading}>
          <ActivityIndicator size="small" />
          <PreviewNote>도착정보 불러오는 중…</PreviewNote>
        </View>
      );
    }
    const items = busArrivals.data.items;
    const shown =
      row.kind === 'bus-route'
        ? items.filter((i) => i.busRouteId === row.item.busRouteId)
        : items.slice(0, 3);
    if (shown.length === 0) {
      return <PreviewNote>표시할 도착 정보가 없습니다.</PreviewNote>;
    }
    return (
      <View style={styles.previewList}>
        {shown.map((it: BusArrivalItemType) => {
          const imminent = it.first?.message?.includes('곧 도착') ?? false;
          return (
            <View key={it.busRouteId} style={styles.previewLine}>
              <Text style={[styles.previewRoute, { color: theme.colors.text }]}>
                {it.routeName}
              </Text>
              <Text
                style={[
                  styles.previewMsg,
                  { color: imminent ? imminentColor : theme.colors.textMuted },
                  imminent && { fontWeight: '600' },
                ]}
                numberOfLines={1}
              >
                {it.first?.message ?? '도착 정보 없음'}
                {it.second?.message ? ` · ${it.second.message}` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSubwayPreview = (
    row: Extract<Row, { kind: 'subway-station' | 'subway-line' }>,
  ) => {
    if (subwayArrivals.isError) {
      return <PreviewNote>도착정보를 불러오지 못했습니다.</PreviewNote>;
    }
    if (!subwayArrivals.data) {
      return (
        <View style={styles.previewLoading}>
          <ActivityIndicator size="small" />
          <PreviewNote>도착정보 불러오는 중…</PreviewNote>
        </View>
      );
    }
    const shown = firstPerDirection(
      subwayArrivals.data.items,
      row.kind === 'subway-line' ? row.item.lineId : undefined,
    );
    if (shown.length === 0) {
      return <PreviewNote>표시할 도착 정보가 없습니다.</PreviewNote>;
    }
    return (
      <View style={styles.previewList}>
        {shown.map((it) => {
          const dest =
            it.trainLineNm ?? (it.destination ? `${it.destination}행` : '행선지 미상');
          return (
            <View key={`${it.updnLine}:${it.trainNo ?? it.destination ?? ''}`} style={styles.previewLine}>
              <Text style={[styles.previewUpdn, { color: theme.colors.textMuted }]}>
                {it.updnLine}
              </Text>
              <Text
                style={[styles.previewDest, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {dest}
              </Text>
              {it.arrivalMsg ? (
                <Text style={[styles.previewMsgRight, { color: theme.colors.textMuted }]}>
                  {it.arrivalMsg}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View>
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>즐겨찾기</Text>
      <View style={styles.list}>
        {rows.map((row) => {
          const isOpen = row.key === expandedKey;
          return (
            <View key={row.key}>
              <View style={styles.rowWrap}>
                <Pressable
                  onPress={() => setExpandedKey(isOpen ? null : row.key)}
                  android_ripple={{ color: theme.colors.surfaceAlt }}
                  accessibilityState={{ expanded: isOpen }}
                  style={styles.rowBtn}
                >
                  <RowHeader row={row} />
                  <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>
                    {isOpen ? '˄' : '˅'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onNavigate(targetOf(row))}
                  hitSlop={6}
                  accessibilityLabel={`${rowLabel(row)} 열기`}
                  style={styles.openBtn}
                >
                  <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>↗</Text>
                </Pressable>
                <FavStar row={row} bus={bus} subway={subway} />
              </View>
              {isOpen && (
                <View style={styles.previewWrap}>
                  {row.kind === 'bus-station' || row.kind === 'bus-route'
                    ? renderBusPreview(row)
                    : renderSubwayPreview(row)}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const RowHeader = ({ row }: { row: Row }) => {
  const theme = useTheme();
  const busColor = theme.mode === 'dark' ? '#60a5fa' : '#2563eb';
  switch (row.kind) {
    case 'bus-station':
      return (
        <>
          <Text style={[styles.busIcon, { color: busColor }]}>🚌</Text>
          <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
            {row.item.name}
          </Text>
          {row.item.arsId !== '0' && (
            <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                {row.item.arsId}
              </Text>
            </View>
          )}
        </>
      );
    case 'bus-route':
      return (
        <>
          <Text style={[styles.busIcon, { color: busColor }]}>🚌</Text>
          <Text style={[styles.rowRoute, { color: theme.colors.text }]}>
            {row.item.routeName}
          </Text>
          <Text
            style={[styles.rowSub, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {row.item.stationName}
          </Text>
        </>
      );
    case 'subway-station':
      return (
        <>
          <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
            {row.item.name}
          </Text>
          <View style={styles.badges}>
            {row.item.lines.map((lineId) => (
              <SubwayLineBadge key={lineId} lineId={lineId} />
            ))}
          </View>
        </>
      );
    case 'subway-line':
      return (
        <>
          <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
            {row.item.stationName}
          </Text>
          <SubwayLineBadge lineId={row.item.lineId} />
        </>
      );
  }
};

const rowLabel = (row: Row): string => {
  switch (row.kind) {
    case 'bus-station':
      return row.item.name;
    case 'bus-route':
      return `${row.item.routeName} ${row.item.stationName}`;
    case 'subway-station':
      return row.item.name;
    case 'subway-line':
      return `${row.item.stationName} ${subwayLineName(row.item.lineId)}`;
  }
};

const FavStar = ({
  row,
  bus,
  subway,
}: {
  row: Row;
  bus: BusFavoritesApi;
  subway: SubwayFavoritesApi;
}) => {
  switch (row.kind) {
    case 'bus-station':
      return (
        <FavoriteStar
          active
          onToggle={() => bus.toggleStation(row.item)}
          label={`${row.item.name} 즐겨찾기 해제`}
        />
      );
    case 'bus-route':
      return (
        <FavoriteStar
          active
          onToggle={() => bus.toggleRoute(row.item)}
          label={`${row.item.routeName} 즐겨찾기 해제`}
        />
      );
    case 'subway-station':
      return (
        <FavoriteStar
          active
          onToggle={() => subway.toggleStation(row.item)}
          label={`${row.item.name} 즐겨찾기 해제`}
        />
      );
    case 'subway-line':
      return (
        <FavoriteStar
          active
          onToggle={() => subway.toggleLine(row.item)}
          label={`${row.item.stationName} ${subwayLineName(row.item.lineId)} 즐겨찾기 해제`}
        />
      );
  }
};

const PreviewNote = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <Text style={[styles.previewNote, { color: theme.colors.textMuted }]}>{children}</Text>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  list: { gap: 2 },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  busIcon: { fontSize: 13 },
  rowName: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  rowRoute: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rowSub: { fontSize: 13, flexShrink: 1 },
  chevron: { marginLeft: 'auto', fontSize: 12 },
  openBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  previewWrap: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
  },
  previewLoading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewNote: { fontSize: 12, paddingVertical: 2 },
  previewList: { gap: 4 },
  previewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewRoute: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  previewMsg: { fontSize: 12, flexShrink: 1 },
  previewUpdn: { fontSize: 11, fontWeight: '500', flexShrink: 0 },
  previewDest: { fontSize: 13, flexShrink: 1, flex: 1 },
  previewMsgRight: { fontSize: 11, flexShrink: 0 },
});
