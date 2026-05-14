import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
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
}

// 식당 상세 컨테이너. 데이터 fetch(상세 + 인사이트) 는 여기 한 번 — 탭 전환은
// 콘텐츠만 바꾼다. ScrollView 의 stickyHeaderIndices 로 TabBar 가 헤더 바로
// 아래에서 sticky. 탭 전환 시 스크롤 top 으로 reset.
export const PublicRestaurantDetail = ({ placeId, onResolveName }: Props) => {
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

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={styles.scrollContent}
      stickyHeaderIndices={[0]}
    >
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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  note: { fontSize: 13, textAlign: 'center' },
});
