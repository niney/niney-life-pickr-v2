import { useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import { Lightbox } from '~/components/Lightbox';
import { thumbUrl } from '~/lib/thumbUrl';

interface Props {
  detail: RestaurantPublicDetailType;
}

interface Section {
  key: string;
  title: string;
  images: string[];
}

const COLS = 3;
const GUTTER = 6;
const SCREEN_PAD = 16;

// 카테고리(대표/메뉴/리뷰)별 그리드. Lightbox 는 전체 시퀀스 + 평탄화된 인덱스
// 로 열어 모달 안에서도 섹션 경계 없이 자연스럽게 넘어간다.
export const PhotosTab = ({ detail }: Props) => {
  const theme = useTheme();

  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    if (detail.imageUrls.length > 0) {
      out.push({ key: 'hero', title: '대표 사진', images: detail.imageUrls });
    }
    const menuImages = detail.menus.flatMap((m) => m.imageUrls);
    if (menuImages.length > 0) {
      out.push({ key: 'menu', title: '메뉴 사진', images: menuImages });
    }
    // 첫 페이지 reviews 의 이미지만. 전체 reviews 가 필요하면 별도 endpoint 필요.
    const reviewImages = detail.reviewsFirstPage.flatMap((r) => r.imageUrls);
    if (reviewImages.length > 0) {
      out.push({ key: 'reviews', title: '방문자 리뷰 사진', images: reviewImages });
    }
    return out;
  }, [detail.imageUrls, detail.menus, detail.reviewsFirstPage]);

  const allImages = useMemo(
    () => sections.flatMap((s) => s.images),
    [sections],
  );

  const sectionOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let acc = 0;
    for (const s of sections) {
      offsets.set(s.key, acc);
      acc += s.images.length;
    }
    return offsets;
  }, [sections]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const screenW = Dimensions.get('window').width;
  const tileSize = Math.floor((screenW - SCREEN_PAD * 2 - GUTTER * (COLS - 1)) / COLS);

  if (sections.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: theme.colors.textMuted }}>사진이 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {sections.map((s) => {
        const offset = sectionOffsets.get(s.key)!;
        return (
          <View key={s.key} style={{ gap: 8 }}>
            <View style={styles.headerRow}>
              <Text style={[styles.h3, { color: theme.colors.text }]}>{s.title}</Text>
              <Text style={[styles.count, { color: theme.colors.textMuted }]}>
                {s.images.length}
              </Text>
            </View>
            <View style={styles.grid}>
              {s.images.map((u, i) => (
                <Pressable
                  key={`${s.key}-${i}`}
                  onPress={() => setLightboxIndex(offset + i)}
                  accessibilityLabel={`${s.title} ${i + 1}번 사진 크게 보기`}
                  style={{ width: tileSize, height: tileSize }}
                >
                  <Image
                    source={thumbUrl(u, 400)}
                    style={styles.tile}
                    recyclingKey={u}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      {lightboxIndex !== null && (
        <Lightbox
          images={allImages}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: SCREEN_PAD, gap: 16 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h3: { fontSize: 14, fontWeight: '600' },
  count: { fontSize: 11, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GUTTER },
  tile: { width: '100%', height: '100%', borderRadius: 4, backgroundColor: '#f4f4f5' },
});
