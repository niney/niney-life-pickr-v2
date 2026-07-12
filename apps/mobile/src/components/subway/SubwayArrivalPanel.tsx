import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';
import type {
  SubwayArrivalItemType,
  SubwayCongestionDirectionType,
  SubwayCongestionResultType,
  SubwayTimetableDirectionType,
  SubwayTimetableResultType,
} from '@repo/api-contract';
import {
  arrivalUpdnToTimetable,
  formatHHMM,
  formatRelativeSec,
  lastTrainRemainMin,
  subwayLineName,
} from '@repo/utils';
import { SubwayLineBadge } from './SubwayLineBadge';
import { congestionBand, currentSlotKey, matchCongestionDir, slotLevel } from './congestionUtils';


// arvlCd 원문 → 상태 문구. 0접근/1도착/2출발/3전역출발/4전역진입/5전역도착.
const STATUS_BY_CODE: Record<string, string> = {
  '0': '진입',
  '1': '도착',
  '2': '출발',
  '3': '전역 출발',
  '4': '전역 진입',
  '5': '전역 도착',
};

// 잔여초 파생 — receivedAt(원문 수신시각) 기준 보정. arrivalSec 0·null 은
// 카운트다운이 아니라 상태 문구로.
const remainSec = (it: SubwayArrivalItemType, nowMs: number): number | null => {
  if (it.arrivalSec === null || it.arrivalSec === 0) return null;
  if (it.receivedAt === null) return it.arrivalSec;
  const elapsed = Math.floor((nowMs - Date.parse(it.receivedAt)) / 1000);
  return it.arrivalSec - elapsed;
};

const statusText = (it: SubwayArrivalItemType): string => {
  const byCode = it.arrivalCode ? STATUS_BY_CODE[it.arrivalCode] : undefined;
  return byCode ?? it.arrivalMsg ?? '운행 중';
};

// 'm분 s초' — m 이 0이면 's초'만.
const formatCountdown = (remain: number): string => {
  const m = Math.floor(remain / 60);
  const s = remain % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
};

export interface SubwayArrivalPanelProps {
  stationName: string;
  // 그룹의 lineId 집합(오름차순) — 헤더 뱃지·환승 표시.
  lines: string[];
  items: SubwayArrivalItemType[];
  fetchedAt: string | null;
  isLoading: boolean;
  isError: boolean;
  // 404 — 즐겨찾기로 진입한 죽은 stationId. 재등록 안내.
  notFound?: boolean;
  onBack(): void;
  onRetry(): void;
  // 호선 섹션 헤더 별(M6) — 미지정이면 숨김.
  headerStar?(lineId: string): React.ReactNode;
  // 노선 보기(M8) — 추적 중 lineId. onTrackLine 미지정이면 버튼 숨김.
  trackedLineId?: string | null;
  onTrackLine?(lineId: string): void;
  // 도착↔지도 연계(M8) — 열차 행 '지도에서 보기'.
  onLocateTrain?(lineId: string, trainNo: string): void;
  // 시간표 뷰 전환 — 섹션 헤더 버튼.
  onOpenTimetable?(lineId: string): void;
  // 선택 stn 호선의 오늘 시간표 — coverage·lineId 매칭 섹션의 updn 그룹에
  // 첫차/막차 푸터 + 막차 임박 뱃지(환승역의 다른 호선 섹션은 생략).
  footerTimetable?: SubwayTimetableResultType | null;
  // 혼잡도(정적 통계) — 같은 배선. updn 그룹 헤더에 현재 슬롯 게이지.
  footerCongestion?: SubwayCongestionResultType | null;
  // 길찾기(M10) — 헤더 버튼.
  onOpenPath?(): void;
  // 스크롤 하단 부착 콘텐츠(M11 — 주변 버스 섹션).
  bottomContent?: React.ReactNode;
  // 스크롤 하단 여백(탭바 높이 등).
  bottomPad?: number;
}

// 선택 역의 실시간 도착정보 패널 — Detail 바텀시트 내부 뷰(웹 동명 컴포넌트
// 이식). 호선(lineId asc) → 상하행(updnLine 원문) → 열차 행 3단 구조.
export const SubwayArrivalPanel = ({
  stationName,
  lines,
  items,
  fetchedAt,
  isLoading,
  isError,
  notFound,
  onBack,
  onRetry,
  headerStar,
  trackedLineId,
  onTrackLine,
  onLocateTrain,
  onOpenTimetable,
  footerTimetable,
  footerCongestion,
  onOpenPath,
  bottomContent,
  bottomPad = 24,
}: SubwayArrivalPanelProps) => {
  const theme = useTheme();
  // 카운트다운 tick — 패널 하나의 1초 interval 만(행마다 금지). 패널 로컬이라
  // 스크린/지도 리렌더에 영향 없음.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 호선(lineId asc) → 상하행(updnLine 원문, 첫 등장 순서) 그룹.
  const sections = useMemo(() => {
    const byLine = new Map<string, SubwayArrivalItemType[]>();
    for (const it of items) {
      const arr = byLine.get(it.lineId);
      if (arr) arr.push(it);
      else byLine.set(it.lineId, [it]);
    }
    return [...byLine.keys()].sort().map((lineId) => {
      const byUpDn = new Map<string, SubwayArrivalItemType[]>();
      for (const it of byLine.get(lineId)!) {
        const key = it.updnLine || '';
        const arr = byUpDn.get(key);
        if (arr) arr.push(it);
        else byUpDn.set(key, [it]);
      }
      return {
        lineId,
        groups: [...byUpDn.entries()].map(([updn, list]) => ({ updn, list })),
      };
    });
  }, [items]);

  const transfer = lines.length > 1;

  return (
    <View style={styles.container}>
      {/* 헤더 — 목록 복귀 + 역명 + 호선 뱃지 (+ 길찾기). */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Text style={[styles.backText, { color: theme.colors.textMuted }]}>← 목록</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
              {stationName}
            </Text>
            {transfer && (
              <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>환승</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {onOpenPath && (
              <Pressable onPress={onOpenPath} hitSlop={8} style={styles.headerAction}>
                <Text style={[styles.headerActionText, { color: theme.colors.textMuted }]}>
                  길찾기
                </Text>
              </Pressable>
            )}
            <View style={styles.badges}>
              {lines.map((l) => (
                <SubwayLineBadge key={l} lineId={l} />
              ))}
            </View>
          </View>
        </View>
        {fetchedAt && (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
            갱신 {formatRelativeSec(fetchedAt, nowMs)} · 30초마다 자동 갱신
          </Text>
        )}
      </View>

      <BottomSheetScrollView
        contentContainerStyle={[styles.scrollPad, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading && items.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={[styles.centerText, { color: theme.colors.textMuted }]}>
              도착정보 불러오는 중…
            </Text>
          </View>
        ) : isError && notFound ? (
          <Hint>
            역 정보가 갱신되어 찾을 수 없습니다. 즐겨찾기를 다시 등록해 주세요.
          </Hint>
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
          <Hint>
            지금은 도착 정보가 없습니다 — 운행 종료 시간대이거나 실시간 미제공
            역(서울 외 구간)일 수 있어요.
          </Hint>
        ) : (
          <View style={styles.sections}>
            {sections.map((sec) => (
              <View key={sec.lineId}>
                <View style={styles.sectionHeader}>
                  <SubwayLineBadge lineId={sec.lineId} />
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                    {subwayLineName(sec.lineId)}
                  </Text>
                  <View style={styles.sectionActions}>
                    {onOpenTimetable && (
                      <Pressable
                        onPress={() => onOpenTimetable(sec.lineId)}
                        hitSlop={6}
                        style={styles.headerAction}
                      >
                        <Text
                          style={[styles.headerActionText, { color: theme.colors.textMuted }]}
                        >
                          시간표
                        </Text>
                      </Pressable>
                    )}
                    {onTrackLine && (
                      <Pressable
                        onPress={() => onTrackLine(sec.lineId)}
                        hitSlop={6}
                        style={[
                          styles.headerAction,
                          trackedLineId === sec.lineId && {
                            backgroundColor: theme.colors.surfaceAlt,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.headerActionText,
                            {
                              color:
                                trackedLineId === sec.lineId
                                  ? theme.colors.text
                                  : theme.colors.textMuted,
                            },
                          ]}
                        >
                          {trackedLineId === sec.lineId ? '노선 닫기' : '노선 보기'}
                        </Text>
                      </Pressable>
                    )}
                    {headerStar?.(sec.lineId)}
                  </View>
                </View>
                <View style={styles.groups}>
                  {(() => {
                    // 이 호선 섹션에 첫차/막차·혼잡을 붙일지 — footerTimetable
                    // (선택 stn 호선 1개만 조회)의 lineId·coverage 매칭 시만.
                    const secTt =
                      footerTimetable &&
                      footerTimetable.coverage &&
                      footerTimetable.lineId === sec.lineId
                        ? footerTimetable
                        : null;
                    const secCong =
                      footerCongestion &&
                      footerCongestion.coverage &&
                      footerCongestion.lineId === sec.lineId
                        ? footerCongestion
                        : null;
                    return sec.groups.map((g) => {
                      const ttUpdn = arrivalUpdnToTimetable(g.updn);
                      const ttDir =
                        secTt && ttUpdn
                          ? (secTt.directions.find((d) => d.updn === ttUpdn) ?? null)
                          : null;
                      const congDir = secCong
                        ? matchCongestionDir(g.updn, secCong.directions)
                        : null;
                      return (
                        <UpDnGroup
                          key={g.updn}
                          updn={g.updn}
                          list={g.list}
                          nowMs={nowMs}
                          lineId={sec.lineId}
                          onLocateTrain={onLocateTrain}
                          timetableDir={ttDir}
                          congestionDir={congDir}
                        />
                      );
                    });
                  })()}
                </View>
              </View>
            ))}
          </View>
        )}
        {bottomContent}
      </BottomSheetScrollView>
    </View>
  );
};

// 상하행 그룹 — 상위 3개만 노출, 나머지 '더보기 N' 토글. 그룹 키(lineId+updn)가
// 폴링 간 안정적이라 펼침 상태가 유지된다.
const VISIBLE_LIMIT = 3;

const UpDnGroup = ({
  updn,
  list,
  nowMs,
  lineId,
  onLocateTrain,
  timetableDir,
  congestionDir,
}: {
  updn: string;
  list: SubwayArrivalItemType[];
  nowMs: number;
  lineId: string;
  onLocateTrain?(lineId: string, trainNo: string): void;
  // 이 방향의 시간표(첫차/막차) — 없으면 푸터 생략.
  timetableDir?: SubwayTimetableDirectionType | null;
  // 이 방향의 혼잡도(정적 통계) — 현재 슬롯 게이지. 없으면 생략.
  congestionDir?: SubwayCongestionDirectionType | null;
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? list : list.slice(0, VISIBLE_LIMIT);
  const hidden = list.length - visible.length;
  // 막차 임박 — 현재 시각(1초 tick 재사용) 기준 ≤30분. 자정 넘김은 헬퍼가 보정.
  const lastRemain = timetableDir
    ? lastTrainRemainMin(timetableDir.lastTrain, new Date(nowMs))
    : null;
  const lastImminent = lastRemain !== null && lastRemain >= 0 && lastRemain <= 30;
  // 현재 시간대 혼잡 — 30분 슬롯 전환은 nowMs tick 으로 자연 갱신.
  const congLevel = congestionDir
    ? slotLevel(congestionDir, currentSlotKey(new Date(nowMs)))
    : null;
  const congBand = congLevel !== null ? congestionBand(congLevel) : null;
  const amberColor = theme.mode === 'dark' ? '#fbbf24' : '#b45309';
  return (
    <View>
      {(updn !== '' || lastImminent || congBand) && (
        <View style={styles.updnHeader}>
          {updn !== '' && (
            <Text style={[styles.updnText, { color: theme.colors.textMuted }]}>{updn}</Text>
          )}
          {lastImminent && (
            <View style={[styles.pill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Text style={[styles.pillText, { color: amberColor }]}>
                막차 {lastRemain}분 전
              </Text>
            </View>
          )}
          {congBand && congLevel !== null && (
            <View style={styles.congWrap}>
              <View style={[styles.congDot, { backgroundColor: congBand.dot }]} />
              <Text
                style={[
                  styles.congText,
                  { color: theme.mode === 'dark' ? congBand.textDark : congBand.textLight },
                ]}
              >
                {congBand.label} {Math.round(congLevel)}%
              </Text>
              <Text style={[styles.congStat, { color: theme.colors.textMuted }]}>통계</Text>
            </View>
          )}
        </View>
      )}
      <View>
        {visible.map((it, idx) => (
          <ArrivalRow
            key={`${it.trainNo ?? 'x'}-${idx}`}
            item={it}
            nowMs={nowMs}
            lineId={lineId}
            onLocateTrain={onLocateTrain}
          />
        ))}
      </View>
      {hidden > 0 && (
        <Pressable onPress={() => setExpanded(true)} hitSlop={6}>
          <Text style={[styles.moreText, { color: theme.colors.textMuted }]}>
            더보기 {hidden}
          </Text>
        </Pressable>
      )}
      {expanded && list.length > VISIBLE_LIMIT && (
        <Pressable onPress={() => setExpanded(false)} hitSlop={6}>
          <Text style={[styles.moreText, { color: theme.colors.textMuted }]}>접기</Text>
        </Pressable>
      )}
      {/* 첫차/막차 푸터 — 이 방향 시간표가 있을 때만(오늘 dayType). */}
      {timetableDir && (timetableDir.firstTrain || timetableDir.lastTrain) && (
        <Text style={[styles.ttFooter, { color: theme.colors.textMuted }]}>
          첫차 {timetableDir.firstTrain ? formatHHMM(timetableDir.firstTrain) : '—'} · 막차{' '}
          {timetableDir.lastTrain ? formatHHMM(timetableDir.lastTrain) : '—'}
        </Text>
      )}
    </View>
  );
};

const ArrivalRow = ({
  item,
  nowMs,
  lineId,
  onLocateTrain,
}: {
  item: SubwayArrivalItemType;
  nowMs: number;
  lineId: string;
  onLocateTrain?(lineId: string, trainNo: string): void;
}) => {
  const theme = useTheme();
  const remain = remainSec(item, nowMs);
  const counting = remain !== null && remain > 0;
  const text = counting ? formatCountdown(remain) : statusText(item);
  const imminent =
    (remain !== null && remain <= 30) ||
    item.arrivalCode === '0' ||
    item.arrivalCode === '1';
  const imminentColor = theme.mode === 'dark' ? '#34d399' : '#059669';
  const amberColor = theme.mode === 'dark' ? '#fbbf24' : '#b45309';
  // 주 표기 — trainLineNm('성수행 - 역삼방면') 우선, 없으면 종착역명 폴백.
  const label =
    item.trainLineNm ?? (item.destination ? `${item.destination}행` : '행선지 미상');
  const showKind = item.trainKind !== null && item.trainKind !== '일반';
  return (
    <View style={styles.arrivalRow}>
      <View style={styles.arrivalLeft}>
        <Text style={[styles.arrivalLabel, { color: theme.colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {(showKind || item.isLastTrain) && (
          <View style={styles.arrivalBadges}>
            {showKind && (
              <View style={[styles.pill, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Text style={[styles.pillText, { color: amberColor }]}>{item.trainKind}</Text>
              </View>
            )}
            {item.isLastTrain && (
              <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>막차</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <View style={styles.arrivalRight}>
        <Text
          style={[
            styles.arrivalTime,
            imminent
              ? { color: imminentColor, fontWeight: '600' }
              : { color: theme.colors.textMuted },
          ]}
        >
          {text}
        </Text>
        {onLocateTrain && item.trainNo && (
          <Pressable
            onPress={() => onLocateTrain(lineId, item.trainNo!)}
            hitSlop={8}
            accessibilityLabel={`${label} 지도에서 보기`}
            style={styles.locateBtn}
          >
            <Text style={{ fontSize: 13 }}>📍</Text>
          </Pressable>
        )}
      </View>
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
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  title: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  headerRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerAction: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerActionText: { fontSize: 12, fontWeight: '500' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 11, fontVariant: ['tabular-nums'] },
  scrollPad: { padding: 12 },
  center: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
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
  sections: { gap: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  sectionActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  groups: { gap: 10 },
  updnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  updnText: { fontSize: 12, fontWeight: '500' },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  arrivalLeft: { flexShrink: 1, minWidth: 0, gap: 3 },
  arrivalLabel: { fontSize: 14 },
  arrivalBadges: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  pillText: { fontSize: 10, fontWeight: '600' },
  arrivalRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  arrivalTime: { fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'right' },
  locateBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  congWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  congDot: { width: 8, height: 8, borderRadius: 4 },
  congText: { fontSize: 12, fontWeight: '600' },
  congStat: { fontSize: 10 },
  ttFooter: {
    marginTop: 4,
    paddingHorizontal: 12,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
