import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicMenuBoardType } from '@repo/api-contract';
import { Lightbox } from '~/components/Lightbox';
import { thumbUrl } from '~/lib/thumbUrl';
import { MenuGrid } from './shared/MenuGrid';

// 메뉴 탭의 메뉴판 사진 — 가게가 네이버에 올린 메뉴판 사진과, AI 가 그 사진을 읽어 찾은 '등록 메뉴에 없는 메뉴'.
// 등록 메뉴와 섞지 않고 출처·사진 날짜를 밝혀 따로 보인다(사진을 눌러 원본으로 확인할 수 있게). 웹 MenuBoardSection 과 같은 구성.

const FIRST_SHOWN = 8;
// 메뉴판은 글자라 웹(96×72)보다 조금 크게. 프록시 폭은 3배 화면에서 또렷하게(112pt → 400 버킷).
const THUMB_W = 112;
const THUMB_H = 84;
const THUMB_PROXY_W = 400;

export const MenuBoardSection = ({ menuBoard }: { menuBoard: RestaurantPublicMenuBoardType }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { images, addedMenus } = menuBoard;
  const dates = images.flatMap((image) => (image.uploadedOn ? [image.uploadedOn] : [])).sort();
  const dateText =
    dates.length === 0 ? null : dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ~ ${dates.at(-1)}`;
  const shown = expanded ? addedMenus : addedMenus.slice(0, FIRST_SHOWN);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.h3, { color: theme.colors.text }]}>메뉴판 사진</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          {images.length}장{dateText && ` · ${dateText}`}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.thumbRow}
      >
        {images.map((image, index) => (
          <Pressable
            key={image.url}
            onPress={() => setLightboxIndex(index)}
            accessibilityRole="button"
            accessibilityLabel={`메뉴판 사진 ${index + 1} 크게 보기`}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Image
              source={thumbUrl(image.url, THUMB_PROXY_W)}
              style={[
                styles.thumb,
                { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
              ]}
              recyclingKey={image.url}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          </Pressable>
        ))}
      </ScrollView>

      {addedMenus.length > 0 && (
        <View style={styles.added}>
          <View style={styles.headerRow}>
            <Text style={[styles.h3, { color: theme.colors.text }]}>메뉴판 사진에서 찾은 메뉴</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{addedMenus.length}개</Text>
          </View>
          <Text style={[styles.notice, { color: theme.colors.textMuted }]}>
            등록 메뉴에 없는 것만 모았어요. 가게가 올린 메뉴판 사진을 AI 가 읽은 결과라 실제와 다를 수 있으니 사진으로
            확인해 주세요.
          </Text>
          <MenuGrid
            menus={shown.map((m) => ({
              name: m.name,
              price: m.price,
              description: m.description,
              recommend: null,
              imageUrls: [],
            }))}
            insights={undefined}
          />
          {addedMenus.length > FIRST_SHOWN && (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.moreBtn,
                { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
              ]}
            >
              <Text style={[styles.moreText, { color: theme.colors.text }]}>
                {expanded ? '접기' : `${addedMenus.length - FIRST_SHOWN}개 더 보기`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={images.map((image) => image.url)}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  h3: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 11, fontVariant: ['tabular-nums'] },
  // 사진 줄만 탭 좌우 패딩(16)을 뚫고 화면 끝까지 — ReviewCard 사진 줄과 같은 방식.
  scroller: { marginHorizontal: -16 },
  thumbRow: { gap: 8, paddingHorizontal: 16 },
  thumb: { width: THUMB_W, height: THUMB_H, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  added: { gap: 4, marginTop: 4 },
  notice: { fontSize: 11, lineHeight: 15 },
  moreBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  moreText: { fontSize: 13, fontWeight: '500' },
});
