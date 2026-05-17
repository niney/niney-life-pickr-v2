import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ApiError,
  useRestaurantPublic,
  useRestaurantPublicInsights,
  useTheme,
} from '@repo/shared';
import { HomeTab } from './HomeTab';
import { InfoTab } from './InfoTab';
import { InsightsTab } from './InsightsTab';
import { MenuTab } from './MenuTab';
import { PhotosTab } from './PhotosTab';
import { ReviewsTab } from './ReviewsTab';
import { TabBar } from './TabBar';
import type { TabKey } from './tabs';

interface Props {
  placeId: string;
  // 컨테이너가 stack 헤더에 식당명을 채울 수 있게, 부모로 노출. 미지정 시 동작 X.
  onResolveName?(name: string | null): void;
  // 시트 안에서 BottomSheetScrollView 주입용. 호환 ref 타입이 라이브러리마다
  // 달라 ComponentType<any> 로 받는다 — 사용처는 RN ScrollView 인터페이스만 씀.
  Scroller?: ComponentType<any>;
  // 시트 모드에서 사용. 지정하면 콘텐츠 최상단에 '← + 식당명' sticky 헤더가
  // 추가로 렌더된다. 미지정(deep-link 라우트) 이면 헤더 없이 stack 의 네이티브
  // 헤더가 처리한다.
  onBack?(): void;
}

// 식당 상세 컨테이너. 데이터 fetch(상세 + 인사이트) 는 여기 한 번 — 탭 전환은
// 콘텐츠만 바꾼다. 시트 모드 헤더는 스크롤러 밖에 고정하고, TabBar 만
// Scroller 의 stickyHeaderIndices 로 붙인다. 탭 전환 시 스크롤 top 으로 reset.
export const PublicRestaurantDetail = ({
  placeId,
  onResolveName,
  Scroller = ScrollView,
  onBack,
}: Props) => {
  const theme = useTheme();
  const detail = useRestaurantPublic(placeId);
  const insights = useRestaurantPublicInsights(placeId);
  const [tab, setTab] = useState<TabKey>('home');
  const scrollRef = useRef<ScrollView | null>(null);

  // placeId 가 바뀌면 처음 탭(home) 으로 리셋. 같은 화면 안에서 일어날 일은
  // 거의 없지만 안전망.
  useEffect(() => {
    setTab('home');
  }, [placeId]);

  useEffect(() => {
    if (onResolveName) onResolveName(detail.data?.name ?? null);
  }, [detail.data?.name, onResolveName]);

  const handleChangeTab = useCallback((next: TabKey) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const isNotFound =
    detail.isError &&
    detail.error instanceof ApiError &&
    detail.error.statusCode === 404;

  if (detail.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator />
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          불러오는 중…
        </Text>
      </View>
    );
  }
  if (isNotFound) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          요청한 식당을 찾을 수 없습니다.
        </Text>
      </View>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
        <Text style={[styles.note, { color: theme.colors.danger }]}>
          상세 정보를 불러오지 못했습니다.
        </Text>
      </View>
    );
  }

  // [hero, TabBar(sticky), ...탭콘텐츠] → [1]
  const stickyIndices = [1];
  const hero = detail.data.imageUrls[0] ?? null;
  const imageCount = detail.data.imageUrls.length;

  const scroller = (
    <Scroller
      ref={scrollRef}
      style={[styles.scroller, { backgroundColor: theme.colors.bg }]}
      contentContainerStyle={styles.scrollContent}
      stickyHeaderIndices={stickyIndices}
    >
      {hero ? (
        <Pressable
          onPress={() => handleChangeTab('photos')}
          accessibilityLabel="사진 전체 보기"
        >
          <View style={styles.heroWrap}>
            <Image source={{ uri: hero }} style={styles.heroImg} />
            {imageCount > 1 && (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>사진 {imageCount}장</Text>
              </View>
            )}
          </View>
        </Pressable>
      ) : (
        <View style={[styles.heroEmpty, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
            사진이 없습니다.
          </Text>
        </View>
      )}

      <TabBar active={tab} onChange={handleChangeTab} />

      {tab === 'home' && (
        <HomeTab
          detail={detail.data}
          insights={insights.data}
          insightsLoading={insights.isLoading}
          onChangeTab={handleChangeTab}
        />
      )}
      {tab === 'insights' && (
        <InsightsTab
          detail={detail.data}
          insights={insights.data}
          insightsLoading={insights.isLoading}
        />
      )}
      {tab === 'menu' && <MenuTab detail={detail.data} insights={insights.data} />}
      {tab === 'reviews' && <ReviewsTab detail={detail.data} />}
      {tab === 'photos' && <PhotosTab detail={detail.data} />}
      {tab === 'info' && <InfoTab detail={detail.data} />}
    </Scroller>
  );

  if (!onBack) return scroller;

  return (
    <>
      <View
        style={[
          styles.sheetHeader,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          {/* ‹ 와 식당명을 하나의 Text 안에 nested 로 두면 RN 이 같은
              baseline 으로 inline 정렬 — flex row 박스 가운데정렬에 의존하지
              않아 'cap 위치'/lineHeight 차이로 어긋나지 않는다.
              numberOfLines + ellipsizeMode 로 식당명이 길어도 wrap 안 됨. */}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.headerText, { color: theme.colors.text }]}
          >
            <Text style={styles.headerBackIcon}>‹{'  '}</Text>
            {detail.data.name}
          </Text>
        </Pressable>
      </View>
      {scroller}
    </>
  );
};

const styles = StyleSheet.create({
  scroller: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  note: { fontSize: 13, textAlign: 'center' },
  sheetHeader: {
    height: 48,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  headerText: { fontSize: 16, fontWeight: '600' },
  headerBackIcon: { fontSize: 24, fontWeight: '400' },
  heroWrap: { height: 224, width: '100%', position: 'relative' },
  heroImg: { width: '100%', height: '100%' },
  heroEmpty: { height: 128, alignItems: 'center', justifyContent: 'center' },
  heroBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontVariant: ['tabular-nums'] },
});
