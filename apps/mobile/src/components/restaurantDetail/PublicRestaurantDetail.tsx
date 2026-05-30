import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import {
  ApiError,
  useRestaurantPublic,
  useRestaurantPublicInsights,
  useRestaurantPublicReviews,
  useTheme,
} from '@repo/shared';
import type {
  PublicVisitorReviewType,
  RestaurantPublicReviewSentimentType,
  RestaurantPublicReviewSortType,
} from '@repo/api-contract';
import { useTabBarHeight } from '~/hooks/useTabBarHeight';
import { HomeTab } from './HomeTab';
import { InfoTab } from './InfoTab';
import { InsightsTab } from './InsightsTab';
import { MenuTab } from './MenuTab';
import { PhotosTab } from './PhotosTab';
import { ReviewsControls } from './ReviewsControls';
import { ReviewCard } from './shared/ReviewCard';
import { TabBar } from './TabBar';
import type { TabKey } from './tabs';

interface Props {
  placeId: string;
  // 컨테이너가 stack 헤더에 식당명을 채울 수 있게, 부모로 노출. 미지정 시 동작 X.
  onResolveName?(name: string | null): void;
  // 시트 안에서 BottomSheetFlatList 주입용. 호환 ref 타입이 라이브러리마다
  // 달라 ComponentType<any> 로 받는다 — 사용처는 RN FlatList 인터페이스만 씀.
  // 미지정(deep-link 라우트) 이면 RN FlatList.
  List?: ComponentType<any>;
  // 시트 모드에서 사용. 지정하면 콘텐츠 최상단에 '← + 식당명' sticky 헤더가
  // 추가로 렌더된다. 미지정(deep-link 라우트) 이면 헤더 없이 stack 의 네이티브
  // 헤더가 처리한다.
  onBack?(): void;
}

// 스크롤 루트인 단일 FlatList 의 행 타입. [hero, TabBar(sticky), ...콘텐츠].
// 리뷰 탭일 때만 카드가 행 단위로 펼쳐져 가상화 + 무한 스크롤이 걸린다.
type Row =
  | { type: 'hero'; key: string }
  | { type: 'tabbar'; key: string; activeTab: TabKey }
  | { type: 'tab'; key: string; tab: TabKey }
  | {
      type: 'review-controls';
      key: string;
      filter: RestaurantPublicReviewSentimentType;
      sort: RestaurantPublicReviewSortType;
    }
  | { type: 'review'; key: string; review: PublicVisitorReviewType }
  | { type: 'review-loading'; key: string }
  | { type: 'review-empty'; key: string; card: boolean }
  | { type: 'review-footer'; key: string; loading: boolean };

// 식당 상세 컨테이너. 데이터 fetch(상세 + 인사이트 + 리뷰) 는 여기 한 번 —
// 탭 전환은 콘텐츠 행만 바꾼다. 스크롤 루트는 단일 FlatList 라 리뷰 카드가
// 가상화되고, 바닥 근처에서 onEndReached → fetchNextPage 로 무한 스크롤된다.
// 시트 모드 헤더는 FlatList 밖에 고정하고, TabBar 만 stickyHeaderIndices 로
// 붙인다. 탭 전환 시 hero 를 가린 위치로 스크롤.
export const PublicRestaurantDetail = ({
  placeId,
  onResolveName,
  List = FlatList,
  onBack,
}: Props) => {
  const theme = useTheme();
  const { height: screenH } = useWindowDimensions();
  // 스크롤 끝이 하단 탭바(시트 모드) / 홈 인디케이터(딥링크 route) 뒤로 안
  // 가리게 그만큼 하단 패딩을 더한다.
  const tabBarH = useTabBarHeight();
  const detail = useRestaurantPublic(placeId);
  const insights = useRestaurantPublicInsights(placeId);
  const [tab, setTab] = useState<TabKey>('home');
  const [filter, setFilter] = useState<RestaurantPublicReviewSentimentType>('all');
  const [sort, setSort] = useState<RestaurantPublicReviewSortType>('recent');
  const [heroH, setHeroH] = useState(0);
  const scrollRef = useRef<FlatList<Row> | null>(null);

  // 리뷰 페이지네이션. detail 로드 전엔 placeId=null 로 비활성(중복 fetch 방지),
  // 로드되면 reviewsFirstPage 를 seed 로 — 추가 fetch 없이 첫 페이지 즉시.
  const reviewSeed = useMemo(
    () =>
      detail.data
        ? {
            items: detail.data.reviewsFirstPage,
            total: detail.data.reviewCounts.all,
          }
        : undefined,
    [detail.data],
  );
  const reviewsQuery = useRestaurantPublicReviews(
    detail.data ? placeId : null,
    { sentiment: filter, sort },
    reviewSeed,
  );
  const reviews: PublicVisitorReviewType[] = useMemo(
    () =>
      reviewsQuery.data ? reviewsQuery.data.pages.flatMap((p) => p.items) : [],
    [reviewsQuery.data],
  );

  const handleHeroLayout = useCallback((e: LayoutChangeEvent) => {
    setHeroH(e.nativeEvent.layout.height);
  }, []);

  // placeId 가 바뀌면 처음 탭(home)·기본 필터로 리셋. 같은 화면 안에서 일어날
  // 일은 거의 없지만 안전망.
  useEffect(() => {
    setTab('home');
    setFilter('all');
    setSort('recent');
  }, [placeId]);

  useEffect(() => {
    if (onResolveName) onResolveName(detail.data?.name ?? null);
  }, [detail.data?.name, onResolveName]);

  const handleChangeTab = useCallback(
    (next: TabKey) => {
      setTab(next);
      // 탭을 누르면 hero 를 가린 위치(heroH)로 부드럽게 스크롤 → 콘텐츠를 최대로
      // 노출. hero 가 보이던 상태(top)면 스르륵 올라가고, 이미 가린 상태면 이동
      // 거리가 0 이라 모션 없이 그대로. contentContainerStyle 의 minHeight 가
      // 짧은 탭에서도 heroH 까지 스크롤 가능 + 위로 클램프되지 않게 보장.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToOffset({ offset: heroH, animated: true });
      });
    },
    [heroH],
  );

  const handleEndReached = useCallback(() => {
    if (tab !== 'reviews') return;
    if (reviewsQuery.hasNextPage && !reviewsQuery.isFetchingNextPage) {
      reviewsQuery.fetchNextPage();
    }
  }, [
    tab,
    reviewsQuery.hasNextPage,
    reviewsQuery.isFetchingNextPage,
    reviewsQuery.fetchNextPage,
  ]);

  // 비-리뷰 탭 콘텐츠 — 통째로 FlatList 한 행. 리뷰 탭은 카드 단위 행이라 여기서
  // 처리하지 않는다(null).
  const renderTabContent = useCallback(
    (t: TabKey) => {
      const d = detail.data;
      if (!d) return null;
      switch (t) {
        case 'home':
          return (
            <HomeTab
              detail={d}
              insights={insights.data}
              insightsLoading={insights.isLoading}
              onChangeTab={handleChangeTab}
            />
          );
        case 'insights':
          return (
            <InsightsTab
              detail={d}
              insights={insights.data}
              insightsLoading={insights.isLoading}
            />
          );
        case 'menu':
          return <MenuTab detail={d} insights={insights.data} />;
        case 'photos':
          return <PhotosTab detail={d} />;
        case 'info':
          return <InfoTab detail={d} />;
        default:
          return null;
      }
    },
    [detail.data, insights.data, insights.isLoading, handleChangeTab],
  );

  const hero = detail.data?.imageUrls[0] ?? null;
  const imageCount = detail.data?.imageUrls.length ?? 0;

  const data = useMemo<Row[]>(() => {
    const rows: Row[] = [
      { type: 'hero', key: 'hero' },
      { type: 'tabbar', key: 'tabbar', activeTab: tab },
    ];
    if (tab === 'reviews' && detail.data) {
      const counts = detail.data.reviewCounts;
      if (counts.all === 0) {
        rows.push({ type: 'review-empty', key: 'review-empty', card: false });
      } else {
        rows.push({ type: 'review-controls', key: 'review-controls', filter, sort });
        if (reviewsQuery.isLoading) {
          rows.push({ type: 'review-loading', key: 'review-loading' });
        } else if (reviews.length === 0) {
          rows.push({ type: 'review-empty', key: 'review-empty-card', card: true });
        } else {
          for (const r of reviews) {
            rows.push({ type: 'review', key: `review-${r.id}`, review: r });
          }
          rows.push({
            type: 'review-footer',
            key: 'review-footer',
            loading: reviewsQuery.isFetchingNextPage,
          });
        }
      }
    } else {
      rows.push({ type: 'tab', key: `tab-${tab}`, tab });
    }
    return rows;
  }, [
    tab,
    filter,
    sort,
    reviews,
    reviewsQuery.isLoading,
    reviewsQuery.isFetchingNextPage,
    detail.data,
  ]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      switch (item.type) {
        case 'hero':
          return hero ? (
            <Pressable
              onPress={() => handleChangeTab('photos')}
              onLayout={handleHeroLayout}
              accessibilityLabel="사진 전체 보기"
            >
              <View style={styles.heroWrap}>
                <Image
                  source={hero}
                  style={styles.heroImg}
                  contentFit="cover"
                  transition={150}
                />
                {imageCount > 1 && (
                  <View style={styles.heroBadge}>
                    <Text style={styles.heroBadgeText}>사진 {imageCount}장</Text>
                  </View>
                )}
              </View>
            </Pressable>
          ) : (
            <View
              onLayout={handleHeroLayout}
              style={[styles.heroEmpty, { backgroundColor: theme.colors.surfaceAlt }]}
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                사진이 없습니다.
              </Text>
            </View>
          );
        case 'tabbar':
          return <TabBar active={item.activeTab} onChange={handleChangeTab} />;
        case 'tab':
          return renderTabContent(item.tab);
        case 'review-controls':
          return (
            <View style={styles.reviewControls}>
              <ReviewsControls
                filter={item.filter}
                sort={item.sort}
                counts={detail.data!.reviewCounts}
                onChangeFilter={setFilter}
                onChangeSort={setSort}
              />
            </View>
          );
        case 'review':
          return (
            <View style={styles.reviewItem}>
              <ReviewCard review={item.review} />
            </View>
          );
        case 'review-loading':
          return (
            <View style={styles.reviewLoading}>
              <ActivityIndicator />
            </View>
          );
        case 'review-empty':
          return item.card ? (
            <View style={styles.reviewEmptyCardWrap}>
              <View
                style={[
                  styles.emptyCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                <Text style={{ color: theme.colors.textMuted }}>
                  조건에 맞는 리뷰가 없습니다.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.reviewEmpty}>
              <Text style={{ color: theme.colors.textMuted }}>
                아직 수집된 리뷰가 없습니다.
              </Text>
            </View>
          );
        case 'review-footer':
          return item.loading ? (
            <View style={styles.reviewFooter}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <View style={styles.reviewFooterEnd} />
          );
        default:
          return null;
      }
    },
    [hero, imageCount, handleHeroLayout, handleChangeTab, renderTabContent, detail.data, theme],
  );

  const keyExtractor = useCallback((item: Row) => item.key, []);

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
  const isNotFound =
    detail.isError &&
    detail.error instanceof ApiError &&
    detail.error.statusCode === 404;
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

  // hero 영역 사이에선 scroll snap — 사용자가 위로 살짝만 밀어도 hero 끝
  // (= TabBar 가 헤더 바닥에 닿는 위치) 으로 자동 점프. decelerationRate='fast'
  // 로 snap 이 빠르게 안착.
  const snapOffsets = heroH > 0 ? [0, heroH] : undefined;

  const scroller = (
    <List
      ref={scrollRef}
      style={[styles.scroller, { backgroundColor: theme.colors.bg }]}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      extraData={insights.data}
      // [hero, TabBar(sticky), ...콘텐츠] → TabBar = index 1
      stickyHeaderIndices={STICKY_INDICES}
      snapToOffsets={snapOffsets}
      snapToEnd={false}
      decelerationRate="fast"
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      // 짧은 탭으로 바뀌어도 heroH 까지 스크롤 가능 + 스크롤이 위로 클램프되지
      // 않아 hero 를 가린 상태가 유지된다. 위로 스크롤하면 hero 는 다시 보인다.
      contentContainerStyle={{
        paddingBottom: tabBarH + 24,
        minHeight: heroH + screenH,
      }}
      scrollIndicatorInsets={{ bottom: tabBarH }}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={9}
    />
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
          style={styles.headerButton}
        >
          <Text style={[styles.headerBackIcon, { color: theme.colors.text }]}>←</Text>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.headerText, { color: theme.colors.text }]}
          >
            {detail.data.name}
          </Text>
        </Pressable>
      </View>
      {scroller}
    </>
  );
};

const STICKY_INDICES = [1];

const styles = StyleSheet.create({
  scroller: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  note: { fontSize: 13, textAlign: 'center' },
  sheetHeader: {
    height: 56,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  headerButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: { flexShrink: 1, fontSize: 20, lineHeight: 28, fontWeight: '700' },
  headerBackIcon: { marginRight: 10, fontSize: 24, lineHeight: 28, fontWeight: '600' },
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
  reviewControls: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  reviewItem: { paddingHorizontal: 16, paddingBottom: 8 },
  reviewLoading: { paddingVertical: 24, alignItems: 'center' },
  reviewEmpty: { paddingVertical: 48, alignItems: 'center' },
  reviewEmptyCardWrap: { paddingHorizontal: 16, paddingTop: 16 },
  emptyCard: {
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  reviewFooter: { paddingVertical: 16, alignItems: 'center' },
  reviewFooterEnd: { height: 8 },
});
