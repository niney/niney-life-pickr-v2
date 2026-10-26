import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { HikingCourseDetailType } from '@repo/api-contract';
import { courseDifficultyReasons, courseOutingLabel, courseTimeBreakdown, formatAtM, useTheme } from '@repo/shared';
import { HIKING_DIFFICULTY_LABEL, formatHikingEle, formatHikingLength, hikingPoiLabel, isHikingMapPoiCategory } from '@repo/utils';
import { HikingElevationBars } from './HikingElevationBars';
import { KnpsLinks } from './HikingMountainPanel';
import { hikingGpxUrl } from './hikingUrls';

// 코스 상세(앱, Detail 시트) — 국립공원 공식 안내(원문 그대로) · 숫자(거리·예상·난이도·오르막·내리막·최고 고도) · 시간 문구 ·
// 원천 안내 · 고도 그래프 · 코스 지점(갈림길 가는 길) · GPX 받기. 웹 CourseDetail 의 앱 판(산행 조건·가는 법은 다음 차수).

interface Props {
  course: HikingCourseDetailType | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onSelectPoi: (id: string, lat: number, lng: number) => void;
  bottomPad: number;
}

export const HikingCoursePanel = ({ course, loading, error, onBack, onSelectPoi, bottomPad }: Props) => {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.headerText, { color: theme.colors.textMuted }]}>{course ? `${course.mountain.name} 코스 목록` : '코스 목록'}</Text>
        </Pressable>
        {course && (
          <Pressable
            onPress={() => Linking.openURL(hikingGpxUrl(course.id)).catch(() => {})}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="GPX 파일 받기"
            style={styles.headerBtn}
          >
            <MaterialCommunityIcons name="download" size={16} color={theme.colors.textMuted} />
            <Text style={[styles.headerText, { color: theme.colors.textMuted }]}>GPX</Text>
          </Pressable>
        )}
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomPad }]}>
        {loading ? (
          <Text style={[styles.state, { color: theme.colors.textMuted }]}>코스를 불러오는 중…</Text>
        ) : error || !course ? (
          <Text style={[styles.state, { color: theme.colors.textMuted }]}>코스를 찾을 수 없습니다.</Text>
        ) : (
          <CourseBody course={course} onSelectPoi={onSelectPoi} />
        )}
      </BottomSheetScrollView>
    </View>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { borderColor: theme.colors.border }]}>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
};

const Note = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.colors.textMuted }]}>{children}</Text>;
};

const sourceNote = (c: HikingCourseDetailType): string | null => {
  if (c.source === 'peak') return '전국 주요 봉우리 자료라 선과 고도만 있습니다 — 이정표·노면 정보가 없고, 코스 지점은 선 가까이의 봉우리·등산 지점을 붙인 것입니다.';
  if (c.source === 'network') return '전국 주요 봉우리의 등산로 구간을 갈림길에서 이어 만든 길입니다(들머리에서 정상까지 가장 짧은 길). 실제 안내 코스와 다를 수 있습니다.';
  if (c.source === 'park' && c.hasElevation) {
    return c.park?.elevationFrom === 'terrain'
      ? '선은 국립공원 공식 탐방로이고, 고도는 지형 자료(SRTM 30m)로 계산했습니다 — 봉우리가 실제보다 수십 m 낮게 나올 수 있습니다.'
      : '선은 국립공원 공식 탐방로이고, 고도는 근처 등산 기록에서 가져와 계산했습니다.';
  }
  return null;
};

const CourseBody = ({ course: c, onSelectPoi }: { course: HikingCourseDetailType; onSelectPoi: Props['onSelectPoi'] }) => {
  const theme = useTheme();
  const breakdown = courseTimeBreakdown(c);
  const reasons = courseDifficultyReasons(c);
  const pois = c.pois.filter((p) => isHikingMapPoiCategory(p.category));
  const note = sourceNote(c);
  return (
    <>
      <Text style={[styles.title, { color: theme.colors.text }]}>{c.name}</Text>
      {c.park && <ParkBox park={c.park} />}
      <View style={styles.stats}>
        <Stat label="거리" value={formatHikingLength(c.lengthM)} />
        <Stat label={c.roundTripMin !== null ? '왕복 예상' : '예상 시간'} value={courseOutingLabel(c)?.replace(/^왕복 /, '') ?? '—'} />
        <Stat label="난이도" value={c.difficulty ? HIKING_DIFFICULTY_LABEL[c.difficulty] : '—'} />
        <Stat label="오르막" value={c.gainM !== null ? `${Math.round(c.gainM).toLocaleString('ko-KR')}m` : '—'} />
        <Stat label="내리막" value={c.lossM !== null ? `${Math.round(c.lossM).toLocaleString('ko-KR')}m` : '—'} />
        <Stat label="최고 고도" value={c.maxEle !== null ? formatHikingEle(c.maxEle) : '—'} />
      </View>
      {breakdown && <Text style={[styles.line, { color: theme.colors.text }]}>{breakdown}</Text>}
      {c.difficulty && reasons.length > 0 && (
        <Text style={[styles.line, { color: theme.colors.textMuted }]}>
          {HIKING_DIFFICULTY_LABEL[c.difficulty]} — {reasons.join(' · ')}
        </Text>
      )}
      <Note>
        {c.timeMin !== null
          ? '예상 시간은 경사별 걷는 속도로 계산한 추정입니다(짧은 휴식 포함, 점심·긴 휴식 제외).'
          : '고도 기록이 없어 예상 시간·난이도를 계산하지 못했습니다.'}
      </Note>
      {note && <Note>{note}</Note>}
      <HikingElevationBars profile={c.profile} lengthM={c.lengthM} />
      {pois.length > 0 && <Text style={[styles.section, { color: theme.colors.text }]}>코스 지점 {pois.length}</Text>}
      {pois.map((p) => {
        const next = p.guide.find((g) => g.way === 'next');
        const label = hikingPoiLabel(p.category);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => onSelectPoi(p.id, p.lat, p.lng)}
            style={({ pressed }) => [styles.poi, { borderTopColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.poiAt, { color: theme.colors.textMuted }]}>{formatAtM(p.atM)}</Text>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[styles.poiName, { color: theme.colors.text }]}>
                {/* 이름이 분류와 같으면("갈림길") 한 번만. */}
                {p.name && p.name !== label ? (
                  <>
                    <Text style={{ color: theme.colors.textMuted }}>{label} </Text>
                    {p.name}
                  </>
                ) : (
                  label
                )}
                {p.ele !== null ? <Text style={{ color: theme.colors.textMuted }}> {formatHikingEle(p.ele)}</Text> : null}
              </Text>
              {next && <Text style={[styles.poiSub, { color: '#15803d' }]}>가는 길 → {next.dest}</Text>}
              {p.description && (p.category === 'ENTRY' || p.category === 'SHELTER') && (
                <Text style={[styles.poiSub, { color: theme.colors.textMuted }]}>{p.description}</Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </>
  );
};

// 국립공원 공식 코스 — 행정안전부 산행안전지도(국립공원공단 탐방로) 문구를 고치지 않고 보인다(공공누리 3유형 변경금지).
const ParkBox = ({ park }: { park: NonNullable<HikingCourseDetailType['park']> }) => {
  const theme = useTheme();
  const phone = park.contact ? /\(?0\d{1,2}\)?[\d-]{7,9}/.exec(park.contact)?.[0] ?? null : null;
  return (
    <View style={styles.park}>
      <Text style={styles.parkTitle}>국립공원 공식 코스 · {park.parkName}</Text>
      <Text style={[styles.parkName, { color: theme.colors.text }]}>{park.name}</Text>
      {park.sections.length > 0 && <Text style={[styles.line, { color: theme.colors.text }]}>{park.sections.join(' → ')}</Text>}
      <Text style={[styles.line, { color: theme.colors.text }]}>
        소요시간 {park.duration} · 거리 {park.distance} · 난이도 {park.difficulty}
        {park.schedule ? ` · ${park.schedule}` : ''}
      </Text>
      {park.contact && (
        <Pressable
          accessibilityRole="link"
          disabled={!phone}
          onPress={() => phone && Linking.openURL(`tel:${phone.replace(/[^\d]/g, '')}`).catch(() => {})}
        >
          <Text style={[styles.poiSub, { color: theme.colors.textMuted }]}>문의 {park.contact}</Text>
        </Pressable>
      )}
      {park.reversed && <Text style={[styles.line, styles.parkStrong]}>공식 안내는 이 코스와 반대 방향(도착 → 출발)으로 걷는 기준입니다.</Text>}
      <KnpsLinks />
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        국립공원공단 안내 문구 그대로입니다(행정안전부 산행안전지도). 소요시간은 안내 구간 전체 기준이라 아래 예상 시간과 다를 수 있습니다.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerText: { fontSize: 13, fontWeight: '500' },
  body: { paddingHorizontal: 14, paddingTop: 12, gap: 6 },
  state: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  title: { fontSize: 17, fontWeight: '700' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  stat: { width: '31.5%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  statLabel: { fontSize: 10 },
  statValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  line: { fontSize: 12, lineHeight: 18 },
  note: { fontSize: 11, lineHeight: 16 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  poi: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  poiAt: { width: 44, fontSize: 11, fontVariant: ['tabular-nums'], paddingTop: 2 },
  poiName: { fontSize: 13 },
  poiSub: { fontSize: 11, lineHeight: 16 },
  park: { borderWidth: 1, borderColor: 'rgba(14,165,233,0.3)', backgroundColor: 'rgba(14,165,233,0.06)', borderRadius: 8, padding: 10, gap: 3 },
  parkTitle: { fontSize: 12, fontWeight: '700', color: '#0369a1' },
  parkName: { fontSize: 14, fontWeight: '600' },
  parkStrong: { color: '#0369a1', fontWeight: '600' },
});
