import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicDetailType } from '@repo/api-contract';

interface Props {
  detail: RestaurantPublicDetailType;
}

// 영업 정보 + 블로그 리뷰 링크 + 등록일.
export const InfoTab = ({ detail }: Props) => {
  const theme = useTheme();
  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <View style={{ gap: 6 }}>
        <Text style={[styles.h3, { color: theme.colors.text }]}>영업 정보</Text>
        {detail.roadAddress && (
          <View style={styles.row}>
            <Text style={styles.icon}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.line, { color: theme.colors.text }]}>
                {detail.roadAddress}
              </Text>
              {detail.address && detail.address !== detail.roadAddress && (
                <Text style={[styles.subline, { color: theme.colors.textMuted }]}>
                  {detail.address}
                </Text>
              )}
            </View>
          </View>
        )}
        {detail.businessHours && (
          <Text style={[styles.hours, { color: theme.colors.textMuted }]}>
            {detail.businessHours}
          </Text>
        )}
        {detail.phone && (
          <Pressable onPress={() => open(`tel:${detail.phone}`)}>
            <Text style={[styles.linkRow, { color: theme.colors.text }]}>
              📞 {detail.phone}
            </Text>
          </Pressable>
        )}
        <Pressable onPress={() => open(detail.rawSourceUrl)}>
          <Text style={[styles.externalLink, { color: theme.colors.primary }]}>
            🔗 네이버 지도에서 보기
          </Text>
        </Pressable>
      </View>

      {detail.blogReviews.length > 0 && (
        <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
          <Text style={[styles.h3, { color: theme.colors.text }]}>
            블로그 리뷰 ({detail.blogReviews.length})
          </Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {detail.blogReviews.map((b, idx) => (
              <Pressable
                key={idx}
                onPress={() => open(b.url)}
                style={[
                  styles.blogRow,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
              >
                {b.thumbnailUrls[0] && (
                  <Image
                    source={b.thumbnailUrls[0]}
                    style={styles.blogThumb}
                    recyclingKey={b.thumbnailUrls[0]}
                    contentFit="cover"
                  />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.blogTitle, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {b.title}
                  </Text>
                  {b.excerpt && (
                    <Text
                      style={[styles.blogExcerpt, { color: theme.colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {b.excerpt}
                    </Text>
                  )}
                  <Text style={[styles.blogMeta, { color: theme.colors.textMuted }]}>
                    {b.authorName}
                    {b.date ? ` · ${b.date}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.section, { borderTopColor: theme.colors.border }]}>
        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          등록일 {new Date(detail.firstCrawledAt).toLocaleDateString('ko-KR')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 16 },
  h3: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  icon: { fontSize: 14 },
  line: { fontSize: 13 },
  subline: { fontSize: 11, marginTop: 2 },
  hours: { fontSize: 11, lineHeight: 16, paddingLeft: 22 },
  linkRow: { fontSize: 13, paddingLeft: 22 },
  externalLink: { fontSize: 12, paddingLeft: 22 },
  section: { paddingTop: 16, borderTopWidth: 1 },
  blogRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  blogThumb: { width: 56, height: 56, borderRadius: 6, backgroundColor: '#f4f4f5' },
  blogTitle: { fontSize: 13 },
  blogExcerpt: { fontSize: 11, marginTop: 2 },
  blogMeta: { fontSize: 10, marginTop: 2 },
  footer: { fontSize: 11 },
});
