import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { HikingCourseSummaryType, HikingMountainDetailType } from '@repo/api-contract';
import { courseOutingLabel, useTheme } from '@repo/shared';
import {
  HIKING_DIFFICULTY_LABEL,
  HIKING_KNPS_CLOSURE_URL,
  HIKING_KNPS_ENTRY_TIME_URL,
  HIKING_SHAPE_LABEL,
  formatHikingLength,
  hikingCourseColor,
} from '@repo/utils';
import { hikingImageUrl } from './hikingUrls';

// 산 상세(앱, Detail 시트) — 사진·이름·배지·소재지·소개 + 국립공원 산행 전 확인 링크 + 코스 목록(국립공원 공식 코스 먼저).
// 웹 MountainDetail 의 앱 판(추천 이유·이어진 봉우리·산림청 안내 문구는 다음 차수).

interface Props {
  mountain: HikingMountainDetailType | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onSelectCourse: (id: string) => void;
  bottomPad: number;
}

export const HikingMountainPanel = ({ mountain, loading, error, onBack, onSelectCourse, bottomPad }: Props) => {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.backText, { color: theme.colors.textMuted }]}>산 목록</Text>
        </Pressable>
      </View>
      <BottomSheetScrollView contentContainerStyle={[styles.body, { paddingBottom: bottomPad }]}>
        {loading ? (
          <Text style={[styles.state, { color: theme.colors.textMuted }]}>산 정보를 불러오는 중…</Text>
        ) : error || !mountain ? (
          <Text style={[styles.state, { color: theme.colors.textMuted }]}>산을 찾을 수 없습니다.</Text>
        ) : (
          <>
            {mountain.images.length > 0 && (
              <Image source={{ uri: hikingImageUrl(mountain.id, mountain.images[0]!) }} style={[styles.photo, { backgroundColor: theme.colors.surfaceAlt }]} resizeMode="cover" />
            )}
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.colors.text }]}>{mountain.name}</Text>
              {mountain.heightM !== null && (
                <Text style={[styles.height, { color: theme.colors.textMuted }]}>{Math.round(mountain.heightM).toLocaleString('ko-KR')}m</Text>
              )}
            </View>
            <View style={styles.badges}>
              {mountain.kind === 'top100' && <Text style={[styles.badge, styles.top100]}>100대 명산</Text>}
              {mountain.park && <Text style={[styles.badge, styles.park]}>{mountain.park}</Text>}
            </View>
            {mountain.subtitle && <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{mountain.subtitle}</Text>}
            {mountain.area && <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{mountain.area}</Text>}
            {mountain.park && <KnpsLinks />}
            {mountain.overview && (
              <Text style={[styles.overview, { color: theme.colors.text }]} numberOfLines={6}>
                {mountain.overview}
              </Text>
            )}
            <Text style={[styles.section, { color: theme.colors.text }]}>코스 {mountain.courses.length}개</Text>
            {mountain.courses.map((c, i) => (
              <CourseRow key={c.id} course={c} color={hikingCourseColor(i)} onPress={() => onSelectCourse(c.id)} />
            ))}
          </>
        )}
      </BottomSheetScrollView>
    </View>
  );
};

// 국립공원 산행 전 확인 — 탐방로 통제·입산 가능 시각(공개 API 가 없어 국립공원공단 누리집으로).
export const KnpsLinks = () => {
  const theme = useTheme();
  const link = (label: string, url: string) => (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => {})} hitSlop={6} style={styles.link}>
      <Text style={[styles.linkText, { color: theme.colors.primary }]}>{label}</Text>
      <MaterialCommunityIcons name="open-in-new" size={12} color={theme.colors.primary} />
    </Pressable>
  );
  return (
    <View style={styles.knps}>
      <Text style={[styles.knpsLabel, { color: theme.colors.textMuted }]}>산행 전 확인</Text>
      {link('탐방로 통제정보', HIKING_KNPS_CLOSURE_URL)}
      {link('입산 가능 시각', HIKING_KNPS_ENTRY_TIME_URL)}
    </View>
  );
};

const CourseRow = ({ course: c, color, onPress }: { course: HikingCourseSummaryType; color: string; onPress: () => void }) => {
  const theme = useTheme();
  const outing = courseOutingLabel(c);
  const facts = [formatHikingLength(c.lengthM), outing, c.difficulty ? HIKING_DIFFICULTY_LABEL[c.difficulty] : null, HIKING_SHAPE_LABEL[c.shape]].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.course, { borderTopColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.courseDot, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.courseTitleRow}>
          <Text style={[styles.courseName, { color: theme.colors.text }]}>{c.name}</Text>
          {c.park ? (
            <Text style={[styles.badge, styles.park]}>국립공원 코스</Text>
          ) : c.source === 'network' ? (
            <Text style={[styles.badge, { color: theme.colors.textMuted, backgroundColor: theme.colors.surfaceAlt }]}>이어 만든 길</Text>
          ) : null}
        </View>
        <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{facts.join(' · ')}</Text>
        {/* 국립공원 안내 문구는 원문 그대로(공공누리 변경금지). */}
        {c.park && (
          <Text style={[styles.sub, { color: '#0369a1' }]}>
            안내 {c.park.duration} · 난이도 {c.park.difficulty}
            {c.park.schedule && c.park.schedule !== '당일' ? ` · ${c.park.schedule}` : ''}
            {c.park.reversed ? ' · 반대 방향 기준' : ''}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, fontWeight: '500' },
  body: { paddingHorizontal: 14, paddingTop: 12, gap: 6 },
  state: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  photo: { width: '100%', height: 160, borderRadius: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  height: { fontSize: 13 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { fontSize: 10, fontWeight: '600', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, overflow: 'hidden' },
  top100: { color: '#047857', backgroundColor: 'rgba(16,185,129,0.12)' },
  park: { color: '#0369a1', backgroundColor: 'rgba(14,165,233,0.12)' },
  sub: { fontSize: 12, lineHeight: 17 },
  overview: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  section: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  course: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  courseDot: { width: 10, height: 10, borderRadius: 5 },
  courseTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  courseName: { fontSize: 14, fontWeight: '600' },
  knps: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 2 },
  knpsLabel: { fontSize: 11 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 12, fontWeight: '600' },
});
