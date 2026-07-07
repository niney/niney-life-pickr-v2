import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSubwayStationSearch, useTheme } from '@repo/shared';
import type { SubwayPathResultType } from '@repo/api-contract';
import { SubwayLineBadge } from './SubwayLineBadge';

export interface SubwayPathPanelProps {
  fromName: string;
  // 출발 stn — 도착 후보에서 제외(from===to 무효).
  fromId: string;
  // 선택된 도착 id. null 이면 도착역 검색 단계.
  to: string | null;
  toName: string;
  path: SubwayPathResultType | null;
  isLoading: boolean;
  isError: boolean;
  onSelectDest(id: string): void;
  onClearDest(): void;
  onBack(): void;
  bottomPad?: number;
}

// 길찾기 뷰 — Detail 시트가 도착 패널 대신 이 뷰로 전환('← 도착정보' 복귀).
// 도착역 미니 라이브 검색(입력 진실은 로컬 state + 300ms 디바운스) → 상위가
// to 세팅 → 경로(leg) 렌더(웹 동명 이식).
export const SubwayPathPanel = ({
  fromName,
  fromId,
  to,
  toName,
  path,
  isLoading,
  isError,
  onSelectDest,
  onClearDest,
  onBack,
  bottomPad = 24,
}: SubwayPathPanelProps) => {
  const theme = useTheme();
  const [destInput, setDestInput] = useState('');
  // 라이브 검색 디바운스 — 타이핑마다 조회하지 않게(웹은 useDeferredValue).
  const [destQ, setDestQ] = useState('');
  useEffect(() => {
    if (destInput === destQ) return;
    const t = setTimeout(() => setDestQ(destInput), 300);
    return () => clearTimeout(t);
  }, [destInput, destQ]);
  const search = useSubwayStationSearch(destQ);
  const trimmed = destQ.trim();
  const hasQ = trimmed.length >= 1 && trimmed.length <= 50;
  const results = hasQ ? (search.data?.items ?? []).filter((it) => it.id !== fromId) : [];
  const searchLoading =
    search.isLoading || (search.isFetching && search.isPlaceholderData);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.colors.textMuted }]}>
              ← 도착정보
            </Text>
          </Pressable>
          <Text style={styles.fromWrap} numberOfLines={1}>
            <Text style={[styles.fromLabel, { color: theme.colors.textMuted }]}>출발 </Text>
            <Text style={[styles.fromName, { color: theme.colors.text }]}>{fromName}</Text>
          </Text>
        </View>

        {to ? (
          <View style={styles.destRow}>
            <Text style={[styles.fromLabel, { color: theme.colors.textMuted }]}>도착</Text>
            <Text style={[styles.fromName, { color: theme.colors.text }]} numberOfLines={1}>
              {toName}
            </Text>
            <Pressable onPress={onClearDest} hitSlop={8} style={styles.reselect}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>다시 선택</Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={[
              styles.inputBox,
              { backgroundColor: theme.colors.bg, borderColor: theme.colors.border },
            ]}
          >
            <TextInput
              value={destInput}
              onChangeText={setDestInput}
              placeholder="도착역 검색"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={50}
              autoCorrect={false}
              style={[styles.input, { color: theme.colors.text }]}
            />
          </View>
        )}
      </View>

      <BottomSheetScrollView
        contentContainerStyle={[styles.scrollPad, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {to ? (
          isLoading && !path ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={[styles.centerText, { color: theme.colors.textMuted }]}>
                경로 찾는 중…
              </Text>
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <Text style={[styles.centerText, { color: theme.colors.danger }]}>
                경로를 불러오지 못했습니다.
              </Text>
            </View>
          ) : !path ? null : !path.found || path.legs.length === 0 ? (
            <Hint>경로를 찾지 못했어요. 다른 역으로 다시 시도해 주세요.</Hint>
          ) : (
            <View style={styles.result}>
              {/* 요약 — 소요는 근사라 '약' 필수. */}
              <View
                style={[
                  styles.summary,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <Text style={[styles.summaryMain, { color: theme.colors.text }]}>
                  {path.approxMinutes !== null ? `약 ${path.approxMinutes}분` : '소요 시간 미상'}
                </Text>
                <Text style={[styles.summarySub, { color: theme.colors.textMuted }]}>
                  환승 {path.transferCount}회 · {path.totalRideStations}개 역 이동
                </Text>
              </View>

              {path.legs.map((leg, idx) => {
                const first = leg.stations[0]!;
                const last = leg.stations[leg.stations.length - 1]!;
                return (
                  <View key={`${leg.lineId}-${idx}`}>
                    {idx > 0 && (
                      <Text style={[styles.transferLabel, { color: theme.colors.textMuted }]}>
                        ↳ 환승
                      </Text>
                    )}
                    <View style={[styles.legCard, { borderColor: theme.colors.border }]}>
                      <View style={styles.legHeader}>
                        <SubwayLineBadge lineId={leg.lineId} />
                        <Text style={[styles.legTitle, { color: theme.colors.text }]}>
                          {leg.lineName}
                        </Text>
                        <Text style={[styles.legCount, { color: theme.colors.textMuted }]}>
                          {leg.rideCount}개 역
                        </Text>
                      </View>
                      <View style={styles.legRow}>
                        <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                          <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                            탑승
                          </Text>
                        </View>
                        <Text
                          style={[styles.legStation, { color: theme.colors.text }]}
                          numberOfLines={1}
                        >
                          {first.name}
                        </Text>
                      </View>
                      <View style={styles.legRow}>
                        <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                          <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                            하차
                          </Text>
                        </View>
                        <Text
                          style={[styles.legStation, { color: theme.colors.text }]}
                          numberOfLines={1}
                        >
                          {last.name}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        ) : !hasQ ? (
          <Hint>도착역을 검색하세요.</Hint>
        ) : searchLoading && results.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : results.length === 0 ? (
          <Hint>검색 결과가 없습니다.</Hint>
        ) : (
          <View style={styles.destList}>
            {results.map((it) => (
              <Pressable
                key={it.id}
                onPress={() => {
                  onSelectDest(it.id);
                  setDestInput('');
                  setDestQ('');
                }}
                android_ripple={{ color: theme.colors.surfaceAlt }}
                style={styles.destItem}
              >
                <Text
                  style={[styles.destName, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {it.name}
                </Text>
                <View style={styles.badges}>
                  {it.lines.map((l) => (
                    <SubwayLineBadge key={l.stationId} lineId={l.lineId} />
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
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
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: { flexShrink: 0 },
  backText: { fontSize: 12 },
  fromWrap: { flexShrink: 1, minWidth: 0 },
  fromLabel: { fontSize: 13 },
  fromName: { fontSize: 14, fontWeight: '600' },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reselect: { marginLeft: 'auto' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 8 },
  scrollPad: { padding: 12 },
  center: { paddingVertical: 40, alignItems: 'center', gap: 10 },
  centerText: { fontSize: 13 },
  hint: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center',
  },
  hintText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  result: { gap: 10 },
  summary: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  summaryMain: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  summarySub: { fontSize: 12, fontVariant: ['tabular-nums'] },
  transferLabel: { fontSize: 12, paddingHorizontal: 4, marginBottom: 6 },
  legCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  legTitle: { fontSize: 14, fontWeight: '600' },
  legCount: { marginLeft: 'auto', fontSize: 12, fontVariant: ['tabular-nums'] },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legStation: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: { fontSize: 10, fontWeight: '600' },
  destList: { gap: 2 },
  destItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  destName: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
});
