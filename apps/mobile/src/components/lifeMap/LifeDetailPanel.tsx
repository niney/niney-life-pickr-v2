import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';
import type { LifeMapItemType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_HOSPITAL_COLOR,
  LIFE_TOILET_COLOR,
  LIFE_TOILET_FEATURES,
  formatDistanceM,
  formatLifeYm,
  lifeCctvPurposeGroup,
  lifeToiletOpenLabel,
  summarizeLifeToiletFixtures,
} from '@repo/utils';

// 선택 항목 상세(앱) — 화장실(개방시간·변기수·편의·관리기관·주소)·CCTV(목적·대수·화소·방면·보관일수)·
// 병의원(종별·주소·연락처·홈페이지·개설일·의사수). 웹 LifeDetailCard 이식. Detail 시트 안 콘텐츠.

interface Props {
  item: LifeMapItemType | null;
  loading: boolean;
  error: boolean;
  distM: number | null;
  onBack: () => void;
  onFlyTo: (lat: number, lng: number) => void;
  bottomPad: number;
}

export const LifeDetailPanel = ({ item, loading, error, distM, onBack, onFlyTo, bottomPad }: Props) => {
  const theme = useTheme();
  const hasCoords = item !== null && item.lat !== null && item.lng !== null;
  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.backText, { color: theme.colors.textMuted }]}>목록</Text>
        </Pressable>
        {hasCoords && (
          <Pressable onPress={() => onFlyTo(item!.lat!, item!.lng!)} hitSlop={8} accessibilityRole="button" style={styles.backBtn}>
            <MaterialCommunityIcons name="crosshairs" size={16} color={theme.colors.textMuted} />
            <Text style={[styles.backText, { color: theme.colors.textMuted }]}>지도 중심으로</Text>
          </Pressable>
        )}
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomPad }]}>
        {loading ? (
          <Text style={[styles.state, { color: theme.colors.textMuted }]}>상세 불러오는 중…</Text>
        ) : error || !item ? (
          <View style={{ gap: 8, alignItems: 'center' }}>
            <Text style={[styles.state, { color: theme.colors.textMuted }]}>항목을 찾을 수 없습니다(데이터가 갱신돼 빠졌을 수 있음).</Text>
            <Pressable onPress={onBack} accessibilityRole="button">
              <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '600' }}>목록으로</Text>
            </Pressable>
          </View>
        ) : item.layer === 'toilet' ? (
          <ToiletDetail item={item} distM={distM} />
        ) : item.layer === 'hospital' ? (
          <HospitalDetail item={item} distM={distM} />
        ) : (
          <CctvDetail item={item} distM={distM} />
        )}
      </BottomSheetScrollView>
    </View>
  );
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
      <Text style={[styles.rowLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <View style={styles.rowValue}>{typeof children === 'string' ? <Text style={[styles.rowText, { color: theme.colors.text }]}>{children}</Text> : children}</View>
    </View>
  );
};

const PhoneLink = ({ phone }: { phone: string }) => {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {})} style={styles.phone}>
      <MaterialCommunityIcons name="phone" size={12} color={theme.colors.primary} />
      <Text style={{ color: theme.colors.primary, fontSize: 13, textDecorationLine: 'underline' }}>{phone}</Text>
    </Pressable>
  );
};

const ToiletDetail = ({ item, distM }: { item: Extract<LifeMapItemType, { layer: 'toilet' }>; distM: number | null }) => {
  const theme = useTheme();
  const badges = LIFE_TOILET_FEATURES.filter((f) => item[f.key]);
  const fixtures = summarizeLifeToiletFixtures(item.fixtures);
  const special: string[] = [];
  if (item.fixtures.maleDisabledToilet + item.fixtures.maleDisabledUrinal + item.fixtures.femaleDisabledToilet > 0) {
    special.push(`장애인용 남 ${item.fixtures.maleDisabledToilet + item.fixtures.maleDisabledUrinal}·여 ${item.fixtures.femaleDisabledToilet}`);
  }
  if (item.fixtures.maleKidsToilet + item.fixtures.maleKidsUrinal + item.fixtures.femaleKidsToilet > 0) {
    special.push(`어린이용 남 ${item.fixtures.maleKidsToilet + item.fixtures.maleKidsUrinal}·여 ${item.fixtures.femaleKidsToilet}`);
  }
  return (
    <>
      <View style={styles.titleRow}>
        <View style={[styles.titleDot, { backgroundColor: LIFE_TOILET_COLOR }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{item.name}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {item.kind}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </Text>
        </View>
      </View>
      {badges.length > 0 && (
        <View style={styles.badges}>
          {badges.map((b) => (
            <Text key={b.key} style={[styles.badge, { borderColor: theme.colors.border, color: theme.colors.text }]}>
              {b.label}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.rows}>
        <Row label="개방시간">{lifeToiletOpenLabel(item.openType, item.openDetail, item.open24)}</Row>
        <Row label="변기">
          <Text style={[styles.rowText, { color: theme.colors.text }]}>{fixtures ?? '정보 없음'}</Text>
          {special.length > 0 && <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>{special.join(' / ')}</Text>}
        </Row>
        {item.bell && <Row label="비상벨">{item.bellPlace ?? '설치'}</Row>}
        {item.diaper && <Row label="기저귀교환대">{item.diaperPlace ?? '있음'}</Row>}
        <Row label="입구 CCTV">{item.entranceCctv ? '있음' : '없음'}</Row>
        <Row label="관리기관">
          <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.orgName}</Text>
          {item.phone ? <PhoneLink phone={item.phone} /> : null}
        </Row>
        <Row label="주소">
          <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.roadAddr ?? item.lotAddr ?? '-'}</Text>
          {item.roadAddr && item.lotAddr ? <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>{item.lotAddr}</Text> : null}
        </Row>
        <Row label="소유·처리">{`${item.ownerType}${item.disposal ? ` · ${item.disposal}` : ''}`}</Row>
        {(item.installedYm || item.remodeledYm) && (
          <Row label="설치·개보수">{`${formatLifeYm(item.installedYm) ?? '-'}${item.remodeledYm ? ` · 리모델링 ${formatLifeYm(item.remodeledYm)}` : ''}`}</Row>
        )}
        <Row label="기준일">{item.baseDate || '-'}</Row>
      </View>
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        {item.geoSource
          ? `위치는 ${item.geoSource === 'road' ? '도로명' : '지번'} 주소를 VWorld 지오코더로 변환한 값이라 실제 입구와 수십 m 차이 날 수 있습니다.`
          : '주소를 좌표로 변환하지 못해 지도에는 표시되지 않습니다.'}
      </Text>
    </>
  );
};

const HospitalDetail = ({ item, distM }: { item: Extract<LifeMapItemType, { layer: 'hospital' }>; distM: number | null }) => {
  const theme = useTheme();
  return (
    <>
      <View style={styles.titleRow}>
        <View style={[styles.titleDot, { backgroundColor: LIFE_HOSPITAL_COLOR }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{item.name}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {item.kindName}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.rows}>
        <Row label="종별">{item.kindName}</Row>
        <Row label="주소">
          <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.addr ?? '-'}</Text>
          {item.postNo ? <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>우편번호 {item.postNo}</Text> : null}
        </Row>
        {item.phone ? (
          <Row label="전화">
            <PhoneLink phone={item.phone} />
          </Row>
        ) : null}
        {item.url ? (
          <Row label="홈페이지">
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(item.url!).catch(() => {})}>
              <Text style={{ color: theme.colors.primary, fontSize: 13, textDecorationLine: 'underline' }} numberOfLines={1}>
                {item.url.replace(/^https?:\/\//, '')}
              </Text>
            </Pressable>
          </Row>
        ) : null}
        <Row label="개설일">{item.openedDate ?? '-'}</Row>
        <Row label="총의사수">{item.doctorCount !== null ? `${item.doctorCount}명` : '-'}</Row>
      </View>
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        출처: 건강보험심사평가원 병원정보서비스(요양기관 신고 기준 — 실제 운영·진료시간과 다를 수 있습니다).
        {item.geoSource === 'road' || item.geoSource === 'parcel'
          ? ' 위치는 주소를 지오코더로 변환한 값이라 실제 입구와 차이 날 수 있습니다.'
          : item.geoSource === null
            ? ' 좌표가 없어 지도에는 표시되지 않습니다.'
            : ''}
      </Text>
    </>
  );
};

const CctvDetail = ({ item, distM }: { item: Extract<LifeMapItemType, { layer: 'cctv' }>; distM: number | null }) => {
  const theme = useTheme();
  return (
    <>
      <View style={styles.titleRow}>
        <View style={[styles.titleDot, { backgroundColor: LIFE_CCTV_GROUP_COLOR[lifeCctvPurposeGroup(item.purpose)] }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{item.purpose} CCTV</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {item.orgName}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.rows}>
        <Row label="카메라">{`${item.cameraCount !== null ? `${item.cameraCount}대` : '-'}${item.pixels !== null ? ` · ${item.pixels}만 화소` : ''}`}</Row>
        <Row label="촬영 방면">{item.direction ?? '-'}</Row>
        <Row label="보관일수">{item.keepDays !== null ? `${item.keepDays}일` : '-'}</Row>
        <Row label="설치연월">{formatLifeYm(item.installedYm) ?? '-'}</Row>
        <Row label="관리기관">
          <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.orgName}</Text>
          {item.phone ? <PhoneLink phone={item.phone} /> : null}
        </Row>
        <Row label="주소">
          <Text style={[styles.rowText, { color: theme.colors.text }]}>{item.roadAddr ?? item.lotAddr ?? '-'}</Text>
          {item.roadAddr && item.lotAddr ? <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>{item.lotAddr}</Text> : null}
        </Row>
        <Row label="관리번호">{item.id}</Row>
        <Row label="기준일">{item.baseDate || '-'}</Row>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backText: { fontSize: 12 },
  body: { paddingHorizontal: 14, paddingTop: 12 },
  state: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { fontSize: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  rows: { marginTop: 12 },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { width: 84, fontSize: 12 },
  rowValue: { flex: 1, gap: 2 },
  rowText: { fontSize: 14 },
  rowSub: { fontSize: 12 },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  note: { fontSize: 11, lineHeight: 16, marginTop: 12 },
});
