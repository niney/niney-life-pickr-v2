import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  onSelectTip(term: string): void;
  onSelectMenu(name: string): void;
}

const HOME_MENU_PREVIEW = 4;
const HOME_REVIEW_PREVIEW = 3;

// 홈 탭 — 모든 정보의 요약. 각 섹션에 "전체 보기" 액션으로 해당 탭 점프.
// hero 이미지와 식당명은 컨테이너(PublicRestaurantDetail) 가 처리 — 여기선
// 메타(카테고리/별점/리뷰수) + QuickActions 부터 시작.
export const HomeTab = ({
  detail,
  insights,
  insightsLoading,
  onChangeTab,
  onSelectTip,
  onSelectMenu,
}: Props) => {
  const theme = useTheme();
  const previewMenus = useMemo(
    () => detail.menus.slice(0, HOME_MENU_PREVIEW),
    [detail.menus],
  );
  // reviewsFirstPage 가 이미 fetchedAt desc 로 정렬돼 있음. 분석된 리뷰를
  // 우선 노출하기 위해 한 번 더 stable sort + slice — 첫 페이지(10) 범위라
  // 비용은 무시할 수준.
  const previewReviews: PublicVisitorReviewType[] = useMemo(
    () =>
      [...detail.reviewsFirstPage]
        .sort((a, b) => Number(!!b.analysis) - Number(!!a.analysis))
        .slice(0, HOME_REVIEW_PREVIEW),
    [detail.reviewsFirstPage],
  );

  return (
    <View>
      <View style={styles.section}>
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
          <AiSummary insights={insights} onSelectTip={onSelectTip} />
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
          <MenuGrid menus={previewMenus} insights={insights} onSelectMenu={onSelectMenu} />
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
            actionLabel={`리뷰 전체 보기 (${detail.reviewCounts.all})`}
            onAction={() => onChangeTab('reviews')}
            disabled={detail.reviewCounts.all <= HOME_REVIEW_PREVIEW}
          />
          <View>
            {previewReviews.map((r, idx) => (
              <View
                key={r.id}
                style={
                  idx < previewReviews.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: theme.colors.border }
                    : undefined
                }
              >
                <ReviewCard review={r} />
              </View>
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
  section: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  sectionBordered: { borderTopWidth: 1 },
  lastSection: { paddingBottom: 24 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  meta: { fontSize: 12 },
  note: { fontSize: 12 },
  addrRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  addrText: { fontSize: 12, flexShrink: 1 },
});
