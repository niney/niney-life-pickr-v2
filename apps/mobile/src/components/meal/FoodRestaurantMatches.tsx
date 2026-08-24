import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { FOOD_RESTAURANT_DATA_NOTICE, type FoodRestaurantType } from '@repo/api-contract';
import { useFoodRestaurants, useTheme, type Theme } from '@repo/shared';

interface FoodRestaurantMatchesProps {
  foodId: string | null;
  foodName: string;
  lat: number | null;
  lng: number | null;
  onOpened: () => void;
}

// 추천 카드의 작은 가로 영역에 식당 목록을 펼치지 않고, 카드 전체 폭 CTA에서
// 독립 바텀시트를 연다. 결과는 현재 판매 정보가 아니라 메뉴·리뷰 수집 근거이므로
// notice와 evidence/matchedMenus를 이름보다 먼저 이해할 수 있게 함께 보여 준다.
export const FoodRestaurantMatches = ({
  foodId,
  foodName,
  lat,
  lng,
  onOpened,
}: FoodRestaurantMatchesProps) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['65%', '90%'], []);
  const [opened, setOpened] = useState(false);
  const hasLocation = lat !== null && lng !== null;
  const matches = useFoodRestaurants(
    foodId ?? '',
    {
      ...(hasLocation ? { lat, lng, radiusM: 5_000 } : {}),
      limit: 5,
    },
    { enabled: opened && !!foodId },
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        accessible={false}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const searchByName = useCallback(() => {
    sheetRef.current?.dismiss();
    router.push({ pathname: '/(tabs)/restaurants', params: { q: foodName } } as never);
  }, [foodName, router]);

  const openMatches = useCallback(() => {
    onOpened();
    if (!foodId) {
      searchByName();
      return;
    }
    setOpened(true);
    sheetRef.current?.present();
  }, [foodId, onOpened, searchByName]);

  const openRestaurant = useCallback(
    (placeId: string) => {
      sheetRef.current?.dismiss();
      router.push(`/restaurant/${placeId}` as never);
    },
    [router],
  );

  const resultCount = matches.data?.items.length;
  const buttonTitle = foodId
    ? resultCount === undefined
      ? '주변 식당 찾기'
      : `주변 식당 ${resultCount}곳`
    : '음식 이름으로 식당 검색';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${foodName}가 확인된 주변 식당 찾기`}
        accessibilityHint={
          foodId ? '메뉴와 리뷰 근거가 있는 식당 목록을 엽니다' : '음식 이름으로 식당을 검색합니다'
        }
        onPress={openMatches}
        style={({ pressed }) => [
          styles.findButton,
          {
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
          },
        ]}
      >
        <View style={[styles.findIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={20}
            color={theme.colors.primary}
          />
        </View>
        <View style={styles.findCopy}>
          <Text style={[styles.findTitle, { color: theme.colors.text }]}>{buttonTitle}</Text>
          <Text style={[styles.findSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {foodId ? '메뉴·리뷰에서 확인된 근거로 찾아요' : `‘${foodName}’ 이름으로 찾아요`}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
      </Pressable>

      {foodId ? (
        <BottomSheetModal
          ref={sheetRef}
          accessible={false}
          index={0}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: theme.colors.surface }}
          handleIndicatorStyle={{ backgroundColor: theme.colors.textMuted }}
          onDismiss={() => setOpened(false)}
        >
          <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleCopy}>
                <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>
                  ‘{foodName}’가 확인된 식당
                </Text>
                <Text style={[styles.sheetSub, { color: theme.colors.textMuted }]}>
                  {hasLocation
                    ? '내 위치 반경 5km · 근거 신뢰도와 거리 순'
                    : '근거 신뢰도가 높은 순'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="주변 식당 닫기"
                onPress={() => sheetRef.current?.dismiss()}
                style={({ pressed }) => [
                  styles.closeButton,
                  { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
                ]}
              >
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={[styles.notice, { backgroundColor: theme.colors.surfaceAlt }]}>
              <MaterialCommunityIcons
                name="information-outline"
                size={18}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
                {matches.data?.notice ?? FOOD_RESTAURANT_DATA_NOTICE}
              </Text>
            </View>

            {matches.isLoading ? (
              <View style={styles.state}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>
                  식당을 찾는 중…
                </Text>
              </View>
            ) : matches.isError ? (
              <View style={styles.state}>
                <Text style={[styles.stateText, { color: theme.colors.danger }]}>
                  식당을 불러오지 못했어요.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void matches.refetch()}
                  style={({ pressed }) => [
                    styles.retryButton,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.retryText, { color: theme.colors.text }]}>다시 시도</Text>
                </Pressable>
              </View>
            ) : matches.data?.items.length ? (
              <View style={styles.restaurantList}>
                {matches.data.items.map((restaurant) => (
                  <RestaurantMatchRow
                    key={restaurant.placeId}
                    restaurant={restaurant}
                    onPress={() => openRestaurant(restaurant.placeId)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.state}>
                <MaterialCommunityIcons
                  name="map-marker-off-outline"
                  size={28}
                  color={theme.colors.textMuted}
                />
                <Text style={[styles.stateTitle, { color: theme.colors.text }]}>
                  연결된 식당을 찾지 못했어요.
                </Text>
                <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>
                  {hasLocation
                    ? '반경 5km 안에 수집 근거가 없어요. 음식 이름으로 더 넓게 검색해 보세요.'
                    : '수집된 메뉴·리뷰에 정확히 연결된 식당이 없어요.'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={searchByName}
                  style={({ pressed }) => [
                    styles.searchFallbackButton,
                    { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.searchFallbackText, { color: theme.colors.primaryText }]}>
                    이름으로 전체 식당 검색
                  </Text>
                </Pressable>
              </View>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>
      ) : null}
    </>
  );
};

const RestaurantMatchRow = ({
  restaurant,
  onPress,
}: {
  restaurant: FoodRestaurantType;
  onPress: () => void;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = [
    restaurant.distanceM !== null ? formatDistance(restaurant.distanceM) : null,
    restaurant.category,
    restaurant.rating !== null && restaurant.rating > 0 ? `★ ${restaurant.rating}` : null,
    restaurant.reviewCount !== null && restaurant.reviewCount > 0
      ? `리뷰 ${restaurant.reviewCount}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const matchedMenus = restaurant.matchedMenus.slice(0, 2).join(', ');
  const evidenceLabel = [
    restaurant.evidence.includes('menu_catalog') ? '메뉴판 확인' : null,
    restaurant.evidence.includes('review_mentions')
      ? restaurant.mentionCount > 0
        ? `리뷰 언급 ${restaurant.mentionCount}`
        : '리뷰 연결'
      : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name}, ${meta}, ${evidenceLabel}, 상세`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.restaurantRow,
        {
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
        },
      ]}
    >
      <View style={styles.restaurantCopy}>
        <Text style={[styles.restaurantName, { color: theme.colors.text }]} numberOfLines={1}>
          {restaurant.name}
        </Text>
        {meta ? (
          <Text
            style={[styles.restaurantMeta, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
        <View style={styles.evidenceRow}>
          {restaurant.evidence.includes('menu_catalog') ? (
            <View style={styles.menuEvidenceBadge}>
              <Text
                style={[
                  styles.menuEvidenceText,
                  { color: theme.mode === 'dark' ? theme.colors.primary : '#92400e' },
                ]}
              >
                메뉴판 확인
              </Text>
            </View>
          ) : null}
          {restaurant.evidence.includes('review_mentions') ? (
            <View
              style={[styles.reviewEvidenceBadge, { backgroundColor: theme.colors.surfaceAlt }]}
            >
              <Text style={[styles.reviewEvidenceText, { color: theme.colors.textMuted }]}>
                {restaurant.mentionCount > 0 ? `리뷰 언급 ${restaurant.mentionCount}` : '리뷰 연결'}
              </Text>
            </View>
          ) : null}
          {matchedMenus ? (
            <Text style={[styles.matchedMenu, { color: theme.colors.textMuted }]} numberOfLines={1}>
              확인 메뉴 · {matchedMenus}
            </Text>
          ) : null}
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
    </Pressable>
  );
};

const formatDistance = (distanceM: number): string =>
  distanceM < 1_000 ? `${distanceM}m` : `${(distanceM / 1_000).toFixed(1)}km`;

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    findButton: {
      minHeight: 52,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    findIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    findCopy: { flex: 1, minWidth: 0, gap: 2 },
    findTitle: { fontSize: 14, fontWeight: '700' },
    findSub: { fontSize: 11, lineHeight: 15 },
    sheetContent: { paddingHorizontal: 16, paddingBottom: 36, gap: 14 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    sheetTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
    sheetTitle: { fontSize: 19, lineHeight: 26, fontWeight: '700' },
    sheetSub: { fontSize: 12, lineHeight: 17 },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
    state: {
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 24,
    },
    stateTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
    stateText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
    retryButton: {
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryText: { fontSize: 13, fontWeight: '600' },
    searchFallbackButton: {
      minHeight: 44,
      borderRadius: 10,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchFallbackText: { fontSize: 13, fontWeight: '700' },
    restaurantList: { gap: 8 },
    restaurantRow: {
      minHeight: 82,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    restaurantCopy: { flex: 1, minWidth: 0, gap: 4 },
    restaurantName: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
    restaurantMeta: { fontSize: 12, lineHeight: 17 },
    evidenceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    menuEvidenceBadge: {
      borderRadius: 999,
      backgroundColor: 'rgba(245,158,11,0.14)',
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    menuEvidenceText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
    reviewEvidenceBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
    reviewEvidenceText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
    matchedMenu: { flexShrink: 1, fontSize: 11, lineHeight: 16 },
  });
