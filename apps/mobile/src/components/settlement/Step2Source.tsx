import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  useExtractReceipt,
  useSettlementDraftStore,
  useTheme,
  useUploadReceipt,
} from '@repo/shared';
import { pickReceiptImage } from './receiptImagePicker';

interface Props {
  placeId: string;
  onBack: () => void;
  onProceedToEdit: () => void;
}

// 2단계 — 입력 소스 선택. 직접 입력은 즉시 다음 단계. 영수증 사진은
// ActionSheet 로 카메라/앨범 선택 → 업로드 → 추출 → draft prefill → 다음 단계.
export const Step2Source = ({ placeId, onBack, onProceedToEdit }: Props) => {
  const theme = useTheme();
  const setSource = useSettlementDraftStore((s) => s.setSource);
  const setItems = useSettlementDraftStore((s) => s.setItems);
  const setReceipt = useSettlementDraftStore((s) => s.setReceipt);

  const upload = useUploadReceipt();
  const extract = useExtractReceipt();
  const [error, setError] = useState<string | null>(null);

  const handleManual = () => {
    setSource('MANUAL');
    setItems([]);
    onProceedToEdit();
  };

  const handleReceipt = async () => {
    setError(null);
    const picked = await pickReceiptImage();
    if (!picked) return;

    try {
      // RN 의 FormData 는 { uri, name, type } 셰입을 그대로 받는다 — 시그니처
      // 는 Blob 이지만 런타임은 이 객체를 그대로 직렬화. 타입만 한 번 캐스트.
      const uploaded = await upload.mutateAsync(picked as unknown as Blob);
      const extracted = await extract.mutateAsync({
        imageToken: uploaded.imageToken,
        placeId,
      });
      setReceipt({
        imageToken: uploaded.imageToken,
        previewUrl: uploaded.previewUrl,
        items: extracted.items.map((it) => ({
          clientId: '',
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          amount: it.amount,
          category: it.category,
          matchedMenuName: it.matchedMenuName,
        })),
        totalAmount: extracted.totalAmount,
        warning: extracted.warning,
      });
      onProceedToEdit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '업로드 또는 추출에 실패했습니다.');
    }
  };

  const isWorking = upload.isPending || extract.isPending;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          어떻게 입력할까요?
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          영수증 사진을 올리면 자동으로 메뉴·금액을 추출합니다. 결과는 다음 단계에서 직접
          확인·수정할 수 있어요.
        </Text>
      </View>

      <Pressable
        onPress={isWorking ? undefined : handleManual}
        disabled={isWorking}
        android_ripple={{ color: theme.colors.surfaceAlt }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: isWorking ? 0.6 : 1,
          },
        ]}
      >
        <Text style={styles.cardIcon}>✏️</Text>
        <View style={styles.cardMid}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>직접 입력</Text>
          <Text style={[styles.cardDesc, { color: theme.colors.textMuted }]}>
            메뉴와 가격을 하나씩 추가합니다.
          </Text>
        </View>
        <Text style={[styles.chev, { color: theme.colors.textMuted }]}>›</Text>
      </Pressable>

      <Pressable
        onPress={isWorking ? undefined : handleReceipt}
        disabled={isWorking}
        android_ripple={{ color: theme.colors.surfaceAlt }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
            borderColor: theme.colors.border,
            opacity: isWorking ? 0.6 : 1,
          },
        ]}
      >
        <Text style={styles.cardIcon}>📷</Text>
        <View style={styles.cardMid}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>영수증 사진</Text>
          <Text style={[styles.cardDesc, { color: theme.colors.textMuted }]}>
            촬영하거나 앨범에서 골라 자동 추출합니다.
          </Text>
        </View>
        {isWorking ? (
          <ActivityIndicator />
        ) : (
          <Text style={[styles.chev, { color: theme.colors.textMuted }]}>›</Text>
        )}
      </Pressable>

      {isWorking && (
        <Text style={[styles.working, { color: theme.colors.textMuted }]}>
          {upload.isPending ? '업로드 중…' : '추출 중…'}
        </Text>
      )}

      {error && (
        <Text style={[styles.errText, { color: theme.colors.danger }]}>{error}</Text>
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={isWorking ? undefined : onBack}
          disabled={isWorking}
          style={({ pressed }) => [
            styles.ghostBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
              opacity: isWorking ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.ghostText, { color: theme.colors.text }]}>이전</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  head: { gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  cardIcon: { fontSize: 24, width: 32, textAlign: 'center' },
  cardMid: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardDesc: { fontSize: 12, marginTop: 2 },
  chev: { fontSize: 22, fontWeight: '300' },
  working: { fontSize: 12, textAlign: 'center' },
  errText: { fontSize: 13 },
  footer: { marginTop: 12 },
  ghostBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  ghostText: { fontSize: 15, fontWeight: '600' },
});
