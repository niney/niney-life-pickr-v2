import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { getTarotCard } from '@repo/utils';
import { tarotFaceUri } from './tarotImages';
import { CARD_RATIO, SERIF, TR, gold } from './tarotTokens';

// 카드 그림 — 앞면은 웹 정적 자산을 받아 캐시(tarotImages), 뒷면은 부채꼴에 78장이 깔리므로 작게 줄여 번들
// (assets/tarot/back-256.webp). 못 받은 앞면은 이름을 적은 대체 카드, 역방향은 180° 회전. 비율 7:12 는 여기서 준다 — 부모는 너비만.

const BACK = require('../../../assets/tarot/back-256.webp') as number;

export const TarotCardFace = ({ cardId, reversed = false, style }: { cardId: string; reversed?: boolean; style?: StyleProp<ViewStyle> }) => {
  // 실패한 카드 id — 다른 카드로 바뀌면 다시 받아 본다.
  const [failed, setFailed] = useState<string | null>(null);
  const card = getTarotCard(cardId);
  const label = card ? `${card.nameKo} (${card.nameEn})` : cardId;
  return (
    <View style={[s.card, reversed && s.reversed, style]} accessibilityRole="image" accessibilityLabel={label}>
      {failed === cardId || !card ? (
        <View style={s.fallback}>
          <Text style={s.fallbackKo}>{card?.nameKo ?? cardId}</Text>
          <Text style={s.fallbackEn}>{card?.nameEn}</Text>
        </View>
      ) : (
        <Image
          source={{ uri: tarotFaceUri(cardId) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={cardId}
          transition={150}
          onError={() => setFailed(cardId)}
        />
      )}
    </View>
  );
};

export const TarotCardBack = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[s.card, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    <Image source={BACK} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" />
  </View>
);

const s = StyleSheet.create({
  card: { aspectRatio: 1 / CARD_RATIO, borderRadius: 6, overflow: 'hidden', backgroundColor: '#101638' },
  reversed: { transform: [{ rotate: '180deg' }] },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 3, borderWidth: 1, borderColor: gold(0.6), borderRadius: 6, backgroundColor: '#1b2452' },
  fallbackKo: { fontFamily: SERIF, fontSize: 12, fontWeight: '700', color: TR.cream, textAlign: 'center' },
  fallbackEn: { fontSize: 9, color: TR.gold, textAlign: 'center' },
});
