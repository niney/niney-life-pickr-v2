import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';
import { formatCountdown, formatRelativeSec, remainSecSince } from '@repo/utils';
import type { AlightEtaModel } from './useAlightEta';
import type { RideView } from './rideView';
import type { AlightTarget } from '~/hooks/useTransitScreen';

export interface RideDetailPanelProps {
  // 표시 모델 — 계산은 rideView.buildRideView(호출부에서 memo). 하차 알림과 같은
  // 모델을 공유해야 '몇 번째 정차'가 화면과 알림에서 어긋나지 않는다.
  view: RideView;
  onBack(): void;
  onUnpin(): void;
  // 정류장/역 행 탭 — 기존 선택 흐름으로 점프(미지정이면 행이 비활성).
  onSelectBusStation?(stId: string): void;
  onSelectSubwayStation?(stationId: string): void;
  // 하차 지점 — 지정하면 그 역 도착정보에서 내 차량을 조인해 도착 예정을 띄운다.
  alight: AlightTarget | null;
  eta: AlightEtaModel;
  onSetAlight(target: AlightTarget): void;
  onClearAlight(): void;
  // 하차 임박 로컬 알림 — 켤 때 권한을 요청하고, 거부되면 alertDenied 로 안내.
  alertEnabled: boolean;
  alertDenied: boolean;
  onToggleAlert(enabled: boolean): void;
  bottomPad?: number;
}

// 탑승(핀) 차량 상세 — Detail 바텀시트 내부 뷰. 데이터는 usePinnedVehicle 이
// 이미 구독 중인 실시간 위치 + 노선/호선 상세를 그대로 받는다(추가 요청 없음).
export const RideDetailPanel = ({
  view,
  onBack,
  onUnpin,
  onSelectBusStation,
  onSelectSubwayStation,
  alight,
  eta,
  onSetAlight,
  onClearAlight,
  alertEnabled,
  alertDenied,
  onToggleAlert,
  bottomPad = 24,
}: RideDetailPanelProps) => {
  const theme = useTheme();
  // 갱신 상대시각 tick — 패널 하나의 1초 interval(도착 패널과 동일 패턴).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 하차 도착 예정 — 지하철은 초 카운트다운(발신시각 보정), 버스는 메시지 원문.
  const alightRemain = remainSecSince(eta.arrivalSec, eta.receivedAt, nowMs);
  const etaText = !alight
    ? null
    : eta.unavailable
      ? '이 정류장은 도착정보를 제공하지 않아요.'
      : eta.isError
        ? '도착정보를 불러오지 못했어요.'
        : alightRemain !== null && alightRemain > 0
          ? `${formatCountdown(alightRemain)} 후 도착`
          : eta.matched
            ? (eta.message ?? '곧 도착')
            : eta.isLoading
              ? '도착정보 확인 중…'
              : '아직 도착정보에 잡히지 않았어요.';
  // 임박 — 다음 정차거나 1분 이내. 내릴 준비 문구로 강조.
  const alightImminent =
    !!alight &&
    ((view.alightSteps !== null && view.alightSteps <= 1) ||
      (alightRemain !== null && alightRemain > 0 && alightRemain <= 60));
  const accent = theme.mode === 'dark' ? '#34d399' : '#059669';

  const onSelect =
    view.mode === null
      ? undefined
      : view.mode === 'bus'
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
        {/* 하차 지점 — 지정 시에만. 남은 정차 수 + 내 차량 도착 예정. */}
        {alight && (
          <View
            style={[
              styles.card,
              styles.alightCard,
              {
                borderColor: alightImminent ? accent : theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <View style={styles.alightHead}>
              <Text
                style={[styles.alightTitle, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                하차 {alight.name}
              </Text>
              <Pressable onPress={onClearAlight} hitSlop={8} accessibilityLabel="하차 지점 해제">
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>✕</Text>
              </Pressable>
            </View>
            <Text
              style={[
                styles.alightEta,
                { color: alightImminent ? accent : theme.colors.text },
              ]}
            >
              {etaText}
            </Text>
            <Text style={[styles.statusSub, { color: theme.colors.textMuted }]}>
              {/* 문구는 위치(남은 정차 수) 기준 — ETA 임박(<=60s)은 색으로만
                  강조한다. 두 소스가 어긋날 때 '다음에 내려요'가 거짓말하지 않게. */}
              {view.alightSteps === null
                ? '앞으로 지날 목록에 없어요 — 이미 지났을 수 있습니다.'
                : view.alightSteps <= 1
                  ? '다음에 내려요 — 준비하세요.'
                  : `${view.alightSteps}번째 · ${view.alightSteps - 1}개 지나고 하차`}
            </Text>
            {/* 도착 알림 — 앱을 닫아도 울리게 미리 예약한다(예약 시각은 폴링마다
                더 정확한 값으로 갱신). 권한은 켤 때만 묻는다. */}
            <Pressable
              onPress={() => onToggleAlert(!alertEnabled)}
              hitSlop={6}
              style={[
                styles.alertToggle,
                {
                  borderColor: alertEnabled ? accent : theme.colors.border,
                  backgroundColor: alertEnabled ? accent : 'transparent',
                },
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: alertEnabled }}
            >
              <Text
                style={[
                  styles.alertToggleText,
                  { color: alertEnabled ? '#ffffff' : theme.colors.textMuted },
                ]}
              >
                {alertEnabled ? '🔔 도착 알림 켜짐' : '🔕 도착 알림 켜기'}
              </Text>
            </Pressable>
            {alertDenied && (
              <Text style={[styles.statusSub, { color: theme.colors.danger }]}>
                알림 권한이 없어 켤 수 없어요. 설정에서 알림을 허용해 주세요.
              </Text>
            )}
          </View>
        )}

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
            {view.upcoming.map((u, i) => {
              const isAlight =
                alight != null &&
                u.id === (alight.mode === 'bus' ? alight.stId : alight.stationId);
              return (
                <View
                  key={u.key}
                  style={[
                    styles.listRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth },
                    { borderTopColor: theme.colors.border },
                  ]}
                >
                  <Text style={[styles.listOrd, { color: theme.colors.textMuted }]}>
                    {i + 1}
                  </Text>
                  {/* 이름 탭 = 그 역 도착정보로 점프(기존 선택 흐름). */}
                  <Pressable
                    onPress={onSelect ? () => onSelect(u.id) : undefined}
                    disabled={!onSelect}
                    style={styles.listNameWrap}
                  >
                    <Text
                      style={[styles.listName, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {u.name}
                    </Text>
                  </Pressable>
                  {u.tag && (
                    <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                        {u.tag}
                      </Text>
                    </View>
                  )}
                  {/* 하차 지정 토글 — 지정된 행은 해제 버튼이 된다. */}
                  <Pressable
                    onPress={() => (isAlight ? onClearAlight() : onSetAlight(u.target))}
                    disabled={u.alightDisabled}
                    hitSlop={6}
                    style={[
                      styles.alightBtn,
                      {
                        backgroundColor: isAlight ? accent : theme.colors.surfaceAlt,
                        opacity: u.alightDisabled ? 0.4 : 1,
                      },
                    ]}
                    accessibilityLabel={`${u.name} ${isAlight ? '하차 해제' : '하차 지정'}`}
                  >
                    <Text
                      style={[
                        styles.alightBtnText,
                        { color: isAlight ? '#ffffff' : theme.colors.textMuted },
                      ]}
                    >
                      하차
                    </Text>
                  </Pressable>
                </View>
              );
            })}
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
  listNameWrap: { flexShrink: 1, minWidth: 0 },
  listName: { fontSize: 13 },
  alightBtn: {
    marginLeft: 'auto',
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  alightBtnText: { fontSize: 11, fontWeight: '600' },
  alightCard: { borderWidth: 1.5 },
  alightHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alightTitle: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  alightEta: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  alertToggle: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  alertToggleText: { fontSize: 12, fontWeight: '600' },
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
