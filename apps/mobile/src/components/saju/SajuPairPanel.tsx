import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SajuMatchResultType } from '@repo/api-contract';
import { SAJU_DISCLAIMER, type SajuPairStatus } from '@repo/shared';
import { SajuMatchResultView } from './SajuTools';
import { ErrorBox, Loading, Muted, TextButton } from './sajuUi';
import { SERIF, SJ, ink, white } from './sajuTokens';

// "우리 궁합" 결과 — 입구에서 궁합 모드로 두 사주를 맞춰 한 화면에 보여 준다(탭 없음, 연출 없음).
// "내 사주 자세히 보기" 는 나를 그대로 단독 풀이로 넘긴다(웹 SajuPairPanel 과 같다).

export interface SajuPairPanelProps {
  labels: { a: string; b: string };
  result: SajuMatchResultType | null;
  status: SajuPairStatus;
  onRetry: () => void;
  onEdit: () => void;
  onDetail: () => void;
}

export const SajuPairPanel = ({ labels, result, status, onRetry, onEdit, onDetail }: SajuPairPanelProps) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }} accessibilityLabel="궁합" testID="saju-pair-panel">
      <View style={styles.header}>
        <Text style={styles.title}>우리 궁합</Text>
        <Muted size={12} dim={0.6}>
          {labels.a} × {labels.b}
        </Muted>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
        {status === 'pending' ? <Loading text="두 사주를 맞춰 보는 중…" /> : null}
        {status === 'failed' ? <ErrorBox message="궁합을 불러오지 못했어요." onRetry={onRetry} /> : null}
        {result ? <SajuMatchResultView m={result} /> : null}
        <Muted size={10} dim={0.45}>
          두 사람의 생년월일은 서버에 저장하지 않아요.
        </Muted>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <TextButton label="다시 입력" icon="pencil-outline" onPress={onEdit} />
        <TextButton label="내 사주 자세히 보기" icon="star-four-points-outline" color={SJ.gold} onPress={onDetail} />
        <Text style={styles.disclaimer} numberOfLines={2}>
          {SAJU_DISCLAIMER}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: white(0.12) },
  title: { fontFamily: SERIF, fontSize: 15, color: SJ.cream },
  body: { padding: 16, gap: 12, paddingBottom: 28 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12), backgroundColor: 'rgba(18,18,24,0.96)' },
  disclaimer: { flex: 1, textAlign: 'right', fontSize: 10, lineHeight: 13, color: ink(0.4) },
});
