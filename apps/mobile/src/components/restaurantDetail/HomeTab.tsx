import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type {
  PublicVisitorReviewType,
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { STAR } from './colors';
import { AiSummary } from './shared/AiSummary';
import { MenuGrid } from './shared/MenuGrid';
import { QuickActions } from './shared/QuickActions';
import { ReviewCard } from './shared/ReviewCard';
import { SectionHead } from './shared/SectionHead';
import type { TabKey } from './tabs';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  insightsLoading: boolean;
  onChangeTab(next: TabKey): void;
}

const HOME_MENU_PREVIEW = 4;
const HOME_REVIEW_PREVIEW = 3;

// 홈 탭 — 모든 정보의 요약. 각 섹션에 "전체 보기" 액션으로 해당 탭 점프.
export const HomeTab = ({ detail, insights, insightsLoading, onChangeTab }: Props) => {
  const theme = useTheme();
  const hero = detail.imageUrls[0] ?? null;
  const previewMenus = detail.menus.slice(0, HOME_MENU_PREVIEW);
  const previewReviews: PublicVisitorReviewType[] = [...detail.reviews]
    .sort((a, b) => Number(!!b.analysis) - Number(!!a.analysis))
    .slice(0, HOME_REVIEW_PREVIEW);

  return (
    <View>
      {hero ? (
        <Pressable
          onPress={() => onChangeTab('photos')}
          accessibilityLabel="사진 전체 보기"
        >
          <View style={styles.heroWrap}>
            <Image source={{ uri: hero }} style={styles.heroImg} />
            {detail.imageUrls.length > 1 && (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>
                  사진 {detail.imageUrls.length}장
                </Text>
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

      <View style={styles.section}>
        <View style={{ gap: 4 }}>
          <Text style={[styles.name, { color: theme.colors.text }]}>{detail.name}</Text>
          <View style={styles.metaRow}>
            {detail.category && (
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                {detail.category}
              </Text>
            )}
            {detail.rating !== null && (
              <Text style={[styles.meta, { color: STAR }]}>★ {detail.rating}</Text>
            )}
            {detail.reviewCount !== null && (
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                리뷰 {detail.reviewCount}
              </Text>
            )}
          </View>
        </View>
        <QuickActions detail={detail} />
      </View>

      <View
        style={[
          styles.section,
          styles.sectionBordered,
          { borderTopColor: theme.colors.border },
        ]}
      >
        <SectionHead
          title="AI 분석"
          actionLabel="분석 전체 보기"
          onAction={() => onChangeTab('insights')}
        />
        {insights && insights.analyzedCount > 0 ? (
          <AiSummary insights={insights} />
        ) : insightsLoading ? (
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            분석 정보 불러오는 중…
          </Text>
        ) : (
          <Text style={[styles.note, { color: theme.colors.textMuted }]}>
            아직 분석된 리뷰가 없습니다.
          </Text>
        )}
      </View>

      {previewMenus.length > 0 && (
        <View
          style={[
            styles.section,
            styles.sectionBordered,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <SectionHead
            title="대표 메뉴"
            actionLabel={`메뉴 전체 보기 (${detail.menus.length})`}
            onAction={() => onChangeTab('menu')}
            disabled={detail.menus.length <= HOME_MENU_PREVIEW}
          />
          <MenuGrid menus={previewMenus} insights={insights} />
        </View>
      )}

      {previewReviews.length > 0 && (
        <View
          style={[
            styles.section,
            styles.sectionBordered,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <SectionHead
            title="대표 리뷰"
            actionLabel={`리뷰 전체 보기 (${detail.reviews.length})`}
            onAction={() => onChangeTab('reviews')}
            disabled={detail.reviews.length <= HOME_REVIEW_PREVIEW}
          />
          <View style={{ gap: 8 }}>
            {previewReviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </View>
        </View>
      )}

      <View
        style={[
          styles.section,
          styles.sectionBordered,
          styles.lastSection,
          { borderTopColor: theme.colors.border },
        ]}
      >
        <SectionHead
          title="영업 정보"
          actionLabel="정보 전체 보기"
          onAction={() => onChangeTab('info')}
        />
        {(detail.roadAddress || detail.address) && (
          <View style={styles.addrRow}>
            <Text style={{ fontSize: 14 }}>📍</Text>
            <Text
              style={[styles.addrText, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {detail.roadAddress ?? detail.address}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  section: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  sectionBordered: { borderTopWidth: 1 },
  lastSection: { paddingBottom: 24 },
  name: { fontSize: 18, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  meta: { fontSize: 12 },
  note: { fontSize: 12 },
  addrRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  addrText: { fontSize: 12, flexShrink: 1 },
});
