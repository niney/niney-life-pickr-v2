import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useBusStationSearch, useSubwayStationSearch, useTheme } from '@repo/shared';
import { SubwayLineBadge } from '~/components/subway/SubwayLineBadge';

// 검색 결과 하단의 상대 도메인 크로스 섹션(웹 15차 이식). 양 모드의 검색 UX 를
// "제출 = 이 검색어로 상대 도메인까지 찾기"로 통일. 두 섹션 모두 **확정된
// 검색어(제출 q)** 로 자동 조회하며, 행/더보기 탭은 상대 모드 전환(CROSS_JUMP —
// q 와 선택 id 승계)이다. 0건/로딩/에러면 섹션을 숨긴다(보조 섹션).

const PREVIEW_COUNT = 3;

// ── 버스 모드 → 지하철 크로스 — 로컬 DB(쿼터 0)라 제출 q 자동 조회 무부담 ──
export const SubwayCrossSection = ({
  q,
  onSelect,
  onMore,
}: {
  q: string;
  onSelect(stationId: string): void;
  onMore(): void;
}) => {
  const theme = useTheme();
  const search = useSubwayStationSearch(q);
  const items = search.data?.items ?? [];
  const total = search.data?.total ?? 0;
  if (items.length === 0) return null;
  const top = items.slice(0, PREVIEW_COUNT);
  return (
    <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]}>
        🚈 지하철역 {total}건
      </Text>
      {top.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => onSelect(g.id)}
          android_ripple={{ color: theme.colors.surfaceAlt }}
          style={styles.row}
        >
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {g.name}
          </Text>
          <View style={styles.badges}>
            {g.lines.map((l) => (
              <SubwayLineBadge key={l.lineId} lineId={l.lineId} />
            ))}
          </View>
        </Pressable>
      ))}
      <Pressable onPress={onMore} style={styles.more}>
        <Text style={[styles.moreText, { color: theme.colors.textMuted }]}>
          지하철에서 {total}건 모두 보기 ›
        </Text>
      </Pressable>
    </View>
  );
};

// ── 지하철 모드 → 버스 크로스 — 서울시 API 라 **제출 게이트** 필수(호출부가
//    submittedQ 일 때만 렌더). 헤더에 그 검색어를 보여 혼동 방지. ──────────────
export const BusCrossSection = ({
  q,
  onSelect,
  onMore,
}: {
  q: string;
  onSelect(stId: string): void;
  onMore(): void;
}) => {
  const theme = useTheme();
  const search = useBusStationSearch(q);
  const items = search.data?.items ?? [];
  const total = search.data?.total ?? 0;
  if (items.length === 0) return null;
  const top = items.slice(0, PREVIEW_COUNT);
  return (
    <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
      <Text style={[styles.title, { color: theme.colors.textMuted }]} numberOfLines={1}>
        🚌 <Text style={{ color: theme.colors.text }}>'{q}'</Text> 정류장 {total}건
      </Text>
      {top.map((it) => (
        <Pressable
          key={it.stId}
          onPress={() => onSelect(it.stId)}
          android_ripple={{ color: theme.colors.surfaceAlt }}
          style={styles.row}
        >
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {it.name}
          </Text>
          {it.arsId !== '0' && (
            <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                {it.arsId}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
      <Pressable onPress={onMore} style={styles.more}>
        <Text style={[styles.moreText, { color: theme.colors.textMuted }]}>
          버스에서 {total}건 모두 보기 ›
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  name: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  more: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  moreText: { fontSize: 12, fontWeight: '500' },
});
