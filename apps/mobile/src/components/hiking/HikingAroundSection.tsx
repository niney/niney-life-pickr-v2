import type { ComponentProps } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { HikingAroundPlaceType, HikingAroundType, HikingCourseDetailType } from '@repo/api-contract';
import { useHikingAround, useTheme } from '@repo/shared';
import { formatDistanceM } from '@repo/utils';

// 코스 상세의 "가는 법·주변"(앱) — 들머리(편도면 날머리도) 정류장·주차·화장실과 하산 후 맛집. 웹 CourseAround 의 앱 판.
// 맛집(공개 네이버 행)은 앱 맛집 상세로, 나머지는 좌표로 기기 지도 앱을 연다(앱의 버스·지하철·주차 화면은 특정 정류장·주차장을
// 여는 경로가 없다). 맨 위 "들머리 길찾기"는 맛집 상세의 길찾기와 같은 네이버 지도 길찾기.

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const KIND_TAG: Partial<Record<HikingAroundPlaceType['kind'], string>> = {
  trail: '등산 지점',
  bus: '버스',
  subway: '지하철',
  lot: '주차장',
  public: '공중화장실',
};

// 좌표에 이름 핀 — iOS 는 Apple 지도, Android 는 geo: (기본 지도 앱 고르기).
const mapUrl = (p: { lat: number; lng: number; name: string }): string =>
  Platform.OS === 'ios'
    ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`
    : `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${encodeURIComponent(p.name)})`;

const directionsUrl = (p: { lat: number; lng: number; name: string }): string =>
  `https://map.naver.com/p/directions/-/${p.lng},${p.lat},${encodeURIComponent(p.name)}/-/transit?c=15`;

const open = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

const PlaceRow = ({ p, showEnd, first }: { p: HikingAroundPlaceType; showEnd: boolean; first: boolean }) => {
  const theme = useTheme();
  const router = useRouter();
  const inApp = p.kind === 'restaurant' && p.refId !== null;
  const sub = [KIND_TAG[p.kind], p.detail].filter(Boolean).join(' · ');
  const onPress = () => (inApp ? router.push(`/restaurant/${encodeURIComponent(p.refId ?? '')}` as never) : open(mapUrl(p)));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={inApp ? 'button' : 'link'}
      accessibilityHint={inApp ? '맛집 상세를 엽니다' : '지도 앱에서 엽니다'}
      style={({ pressed }) => [
        styles.place,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
        pressed && { backgroundColor: theme.colors.surfaceAlt },
      ]}
    >
      <View style={styles.placeMain}>
        <View style={styles.placeTop}>
          <Text style={[styles.placeName, { color: theme.colors.text }]} numberOfLines={1}>
            {p.name}
          </Text>
          {showEnd && p.at === 'end' && (
            <View style={[styles.endTag, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.endTagText, { color: theme.colors.textMuted }]}>날머리</Text>
            </View>
          )}
          <Text style={[styles.dist, { color: theme.colors.textMuted }]}>{formatDistanceM(p.distM)}</Text>
        </View>
        {sub.length > 0 && (
          <Text style={[styles.placeSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons name={inApp ? 'chevron-right' : 'map-marker-outline'} size={16} color={theme.colors.textMuted} />
    </Pressable>
  );
};

const Group = ({
  icon,
  title,
  places,
  empty,
  showEnd,
}: {
  icon: IconName;
  title: string;
  places: readonly HikingAroundPlaceType[];
  empty: string;
  showEnd: boolean;
}) => {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <MaterialCommunityIcons name={icon} size={14} color={theme.colors.text} />
        <Text style={[styles.groupTitle, { color: theme.colors.text }]}>{title}</Text>
      </View>
      {places.length > 0 ? (
        <View style={[styles.list, { borderColor: theme.colors.border }]}>
          {places.map((p, i) => (
            <PlaceRow key={`${p.kind}:${p.at}:${p.name}:${p.distM}`} p={p} showEnd={showEnd} first={i === 0} />
          ))}
        </View>
      ) : (
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>{empty}</Text>
      )}
    </View>
  );
};

const AroundBody = ({ data }: { data: HikingAroundType }) => {
  const theme = useTheme();
  const showEnd = data.end !== null;
  const foodTitle = data.food.source === 'stores' ? '하산 후 음식점(상가정보)' : '하산 후 맛집';
  const start = { lat: data.start.lat, lng: data.start.lng, name: data.start.name ?? '들머리' };
  const end = data.end ? { lat: data.end.lat, lng: data.end.lng, name: data.end.name ?? '날머리' } : null;
  return (
    <>
      <View style={styles.dirs}>
        <Pressable
          onPress={() => open(directionsUrl(start))}
          accessibilityRole="link"
          accessibilityHint="네이버 지도 길찾기를 엽니다"
          style={({ pressed }) => [styles.dirBtn, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <MaterialCommunityIcons name="directions" size={16} color={theme.colors.primaryText} />
          <Text style={[styles.dirText, { color: theme.colors.primaryText }]} numberOfLines={1}>
            들머리 길찾기
          </Text>
        </Pressable>
        {end && (
          <Pressable
            onPress={() => open(mapUrl(end))}
            accessibilityRole="link"
            accessibilityHint="지도 앱에서 엽니다"
            style={({ pressed }) => [styles.dirBtn, { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialCommunityIcons name="flag-checkered" size={15} color={theme.colors.text} />
            <Text style={[styles.dirText, { color: theme.colors.text }]} numberOfLines={1}>
              날머리 위치
            </Text>
          </Pressable>
        )}
      </View>
      {(data.start.name || data.end?.name) && (
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          들머리 {data.start.name ?? '—'}
          {data.end && ` · 날머리 ${data.end.name ?? '—'}`}
        </Text>
      )}
      <Group icon="bus" title="정류장·역" places={data.transit} empty="근처 정류장 정보가 없습니다." showEnd={showEnd} />
      <Group icon="car" title="들머리 주차" places={data.parking} empty="들머리 근처 주차장 정보가 없습니다." showEnd={false} />
      <Group icon="toilet" title="화장실" places={data.toilets} empty="근처 화장실 정보가 없습니다." showEnd={showEnd} />
      <Group icon="silverware-fork-knife" title={foodTitle} places={data.food.items} empty="근처 음식점 정보가 없습니다." showEnd={false} />
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        거리는 {showEnd ? '들머리·날머리' : '들머리'}에서 직선거리입니다. 정류장·주차·화장실은 등산 조사 지점에 버스·지하철(수도권)·주차장·
        공중화장실 자료를 더했고, 운행·운영 여부는 바뀌었을 수 있습니다.
      </Text>
    </>
  );
};

export const HikingAroundSection = ({ course }: { course: HikingCourseDetailType }) => {
  const theme = useTheme();
  const q = useHikingAround(course.id);
  return (
    <View style={styles.section} accessibilityLabel="가는 법·주변">
      <Text style={[styles.title, { color: theme.colors.text }]}>가는 법·주변</Text>
      {q.data ? (
        <AroundBody data={q.data} />
      ) : (
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>{q.isError ? '주변 정보를 불러오지 못했습니다.' : '정류장·주차·화장실을 찾는 중…'}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: 10, marginTop: 14 },
  title: { fontSize: 14, fontWeight: '700' },
  dirs: { flexDirection: 'row', gap: 8 },
  dirBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: 10, paddingHorizontal: 10 },
  dirText: { fontSize: 14, fontWeight: '600' },
  group: { gap: 6 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { fontSize: 12, fontWeight: '600' },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: 'hidden' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  placeMain: { flex: 1, gap: 1 },
  placeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeName: { flexShrink: 1, fontSize: 13 },
  endTag: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  endTagText: { fontSize: 10 },
  dist: { marginLeft: 'auto', fontSize: 11, fontVariant: ['tabular-nums'] },
  placeSub: { fontSize: 11 },
  note: { fontSize: 11, lineHeight: 16 },
});
