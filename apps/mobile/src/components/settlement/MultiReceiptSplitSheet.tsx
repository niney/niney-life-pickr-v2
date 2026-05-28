import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ApiError,
  settlementExtractionApi,
  useExtractReceipt,
  useTheme,
  useUploadReceipt,
  type DraftItem,
  type DraftRound,
  type Theme,
} from '@repo/shared';

interface ApplyArgs {
  imageToken: string;
  previewUrl: string;
  items: DraftItem[];
  totalAmount: number | null;
  warning: string | null;
}

interface Props {
  open: boolean;
  rounds: DraftRound[]; // 매핑 대상 (호출자가 placeId 있는 것만 넘김)
  totalRounds: number;
  onClose: () => void;
  // 슬롯 추출 끝날 때마다 차수에 즉시 반영.
  onApplyOne: (roundClientId: string, args: ApplyArgs) => void;
}

// 한 사진에 영수증이 가로로 N개 있을 때. 사진 업로드 → 분할 개수 N(2~5) +
// 슬롯→차수 매핑 → 서버 split 옵션으로 N 번 순차 추출. 웹 MultiReceiptSplitDialog
// 의 RN 포팅.
export const MultiReceiptSplitSheet = ({
  open,
  rounds,
  totalRounds,
  onClose,
  onApplyOne,
}: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const upload = useUploadReceipt();
  const extract = useExtractReceipt();

  const maxCount = Math.min(rounds.length, 5);

  const [uploaded, setUploaded] = useState<{
    imageToken: string;
    previewUrl: string;
  } | null>(null);
  const [count, setCount] = useState<number>(Math.min(2, Math.max(2, maxCount)));
  const [mapping, setMapping] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 다이얼로그 열림 / count / rounds 변동 시 기본 매핑 재계산 (1:1 좌→우).
  useEffect(() => {
    if (!open) return;
    setMapping((prev) => {
      const next: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const keep = prev[i];
        if (keep && rounds.some((r) => r.clientId === keep)) {
          next.push(keep);
          continue;
        }
        const fallback = rounds[i]?.clientId ?? rounds[0]?.clientId ?? '';
        next.push(fallback);
      }
      return next;
    });
  }, [open, count, rounds]);

  // 닫힐 때 상태 리셋.
  useEffect(() => {
    if (open) return;
    setUploaded(null);
    setCount(Math.min(2, Math.max(2, maxCount)));
    setMapping([]);
    setProgress(null);
    setError(null);
  }, [open, maxCount]);

  const duplicateRounds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const id of mapping) seen.set(id, (seen.get(id) ?? 0) + 1);
    return new Set(
      Array.from(seen.entries())
        .filter(([, c]) => c > 1)
        .map(([id]) => id),
    );
  }, [mapping]);

  const isWorking = upload.isPending || extract.isPending || progress !== null;
  const canExtract =
    uploaded !== null && mapping.length === count && duplicateRounds.size === 0;

  const pickImage = () => {
    setError(null);
    Alert.alert(
      '영수증 사진',
      undefined,
      [
        {
          text: '카메라',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              setError('카메라 권한이 필요합니다.');
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (res.canceled) return;
            await runUpload(res.assets[0]!);
          },
        },
        {
          text: '앨범',
          onPress: async () => {
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              // iOS 앨범 원본 HEIC(HEVC) → 서버 sharp 디코드 불가. Compatible
              // 모드로 픽 시점에 JPEG 로 트랜스코딩.
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            });
            if (res.canceled) return;
            await runUpload(res.assets[0]!);
          },
        },
        { text: '취소', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  // RN 은 fetch(uri).blob() 을 FormData 에 넣으면 본문이 비어 서버에 빈 파일이
  // 도착한다 — { uri, name, type } 객체를 그대로 넘긴다.
  const runUpload = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      const res = await upload.mutateAsync({
        uri: asset.uri,
        name: asset.fileName ?? 'receipt.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      setUploaded({ imageToken: res.imageToken, previewUrl: res.previewUrl });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '업로드 실패');
    }
  };

  const handleExtract = async () => {
    if (!uploaded) return;
    setError(null);
    setProgress({ done: 0, total: count });
    try {
      for (let i = 0; i < count; i += 1) {
        const roundClientId = mapping[i]!;
        const round = rounds.find((r) => r.clientId === roundClientId);
        if (!round) continue;
        const roundIndexInWhole = rounds.indexOf(round) + 1;
        const extracted = await extract.mutateAsync({
          imageToken: uploaded.imageToken,
          placeId: round.placeId,
          roundIndex: roundIndexInWhole,
          roundTotal: totalRounds,
          split: { count, index: i + 1 },
        });
        onApplyOne(roundClientId, {
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
        setProgress({ done: i + 1, total: count });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '추출 실패');
      setProgress(null);
    }
  };

  return (
    <Modal
      visible={open}
      onRequestClose={isWorking ? undefined : onClose}
      animationType="slide"
      presentationStyle="formSheet"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            분할 영수증 업로드
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            disabled={isWorking}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
                opacity: isWorking ? 0.5 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!uploaded && (
            <View
              style={[
                styles.uploadBox,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <Text style={[styles.uploadBoxText, { color: theme.colors.textMuted }]}>
                한 사진에 영수증 여러 장이 가로로 나란히 있어야 합니다.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={upload.isPending}
                onPress={pickImage}
                style={({ pressed }) => [
                  styles.pickButton,
                  {
                    backgroundColor: pressed
                      ? theme.colors.primaryHover
                      : theme.colors.primary,
                    opacity: upload.isPending ? 0.5 : 1,
                  },
                ]}
              >
                {upload.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.primaryText} />
                ) : (
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: theme.colors.primaryText },
                    ]}
                  >
                    사진 선택
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {uploaded && (
            <>
              <View
                style={[
                  styles.previewWrap,
                  { borderColor: theme.colors.border },
                ]}
              >
                <ReceiptBlobImage url={uploaded.previewUrl} theme={theme} />
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
                  이 사진의 영수증 수
                </Text>
                <View style={styles.countRow}>
                  {Array.from({ length: maxCount - 1 }, (_, i) => i + 2).map(
                    (n) => {
                      const sel = count === n;
                      return (
                        <Pressable
                          key={n}
                          accessibilityRole="button"
                          disabled={isWorking}
                          onPress={() => setCount(n)}
                          style={({ pressed }) => [
                            styles.countChip,
                            {
                              borderColor: sel
                                ? theme.colors.primary
                                : theme.colors.border,
                              backgroundColor: sel
                                ? theme.colors.primary
                                : pressed
                                  ? theme.colors.surfaceAlt
                                  : 'transparent',
                              opacity: isWorking ? 0.5 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '500',
                              color: sel
                                ? theme.colors.primaryText
                                : theme.colors.text,
                            }}
                          >
                            {n}장
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>
              </View>

              <View>
                <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
                  왼쪽부터 차수 매핑
                </Text>
                {Array.from({ length: count }, (_, i) => (
                  <View key={i} style={styles.slotRow}>
                    <Text
                      style={[styles.slotLabel, { color: theme.colors.textMuted }]}
                    >
                      {i + 1}번째
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 6 }}
                    >
                      {rounds.map((r) => {
                        const sel = mapping[i] === r.clientId;
                        const orderIdx = rounds.indexOf(r) + 1;
                        return (
                          <Pressable
                            key={r.clientId}
                            accessibilityRole="button"
                            disabled={isWorking}
                            onPress={() =>
                              setMapping((prev) => {
                                const next = [...prev];
                                next[i] = r.clientId;
                                return next;
                              })
                            }
                            style={({ pressed }) => [
                              styles.slotChip,
                              {
                                borderColor: sel
                                  ? theme.colors.primary
                                  : theme.colors.border,
                                backgroundColor: sel
                                  ? theme.colors.primary
                                  : pressed
                                    ? theme.colors.surfaceAlt
                                    : 'transparent',
                                opacity: isWorking ? 0.5 : 1,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                color: sel
                                  ? theme.colors.primaryText
                                  : theme.colors.text,
                              }}
                            >
                              {orderIdx}차 — {r.placeName}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ))}
                {duplicateRounds.size > 0 && (
                  <Text style={[styles.errorText, { color: theme.colors.danger }]}>
                    같은 차수에 두 슬롯이 매핑돼 있습니다. 매핑을 조정해주세요.
                  </Text>
                )}
              </View>

              {progress && (
                <View
                  style={[
                    styles.progressBox,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={theme.colors.text} />
                  <Text style={{ color: theme.colors.text, fontSize: 13 }}>
                    추출 중… {progress.done} / {progress.total}
                  </Text>
                </View>
              )}

              {error && (
                <Text style={[styles.errorText, { color: theme.colors.danger }]}>
                  {error}
                </Text>
              )}
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Pressable
            accessibilityRole="button"
            disabled={isWorking}
            onPress={onClose}
            style={({ pressed }) => [
              styles.ghostButton,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
                opacity: isWorking ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>
              취소
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!canExtract || isWorking}
            onPress={handleExtract}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor:
                  !canExtract || isWorking
                    ? theme.colors.surfaceAlt
                    : pressed
                      ? theme.colors.primaryHover
                      : theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryButtonText,
                {
                  color:
                    !canExtract || isWorking
                      ? theme.colors.textMuted
                      : theme.colors.primaryText,
                },
              ]}
            >
              {progress ? '추출 중…' : '추출 시작'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// 영수증 미리보기 — JWT 라우트 fetch → data URL.
const ReceiptBlobImage = ({ url, theme }: { url: string; theme: Theme }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = url.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (cancelled) return;
          if (typeof reader.result === 'string') setDataUrl(reader.result);
          else setError('미리보기 변환 실패');
        };
        reader.onerror = () => {
          if (!cancelled) setError('미리보기 변환 실패');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <Text style={{ padding: 10, fontSize: 12, color: theme.colors.danger }}>
        {error}
      </Text>
    );
  }
  if (!dataUrl) {
    return (
      <Text style={{ padding: 10, fontSize: 12, color: theme.colors.textMuted }}>
        미리보기 불러오는 중…
      </Text>
    );
  }
  return (
    <Image
      source={{ uri: dataUrl }}
      style={{ width: '100%', height: 200, backgroundColor: theme.colors.surfaceAlt }}
      resizeMode="contain"
    />
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 15, fontWeight: '600' },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    scrollContent: { padding: 12, gap: 12 },
    uploadBox: {
      alignItems: 'center',
      gap: 12,
      padding: 24,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
    },
    uploadBoxText: { fontSize: 13, textAlign: 'center' },
    previewWrap: {
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
    countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    countChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 4,
    },
    slotLabel: { fontSize: 12, width: 50 },
    slotChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    errorText: { fontSize: 12, marginTop: 4 },
    progressBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    footer: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.bg,
    },
    ghostButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
    },
    ghostButtonText: { fontSize: 14, fontWeight: '500' },
    primaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    // 업로드 박스 안 '사진 선택' — footer 버튼과 달리 flex 로 늘리지 않고
    // 내용 크기로 가운데 둔다. 좌우 패딩이 없으면 글자가 버튼에 끼어 보인다.
    pickButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryButtonText: { fontSize: 14, fontWeight: '600' },
  });
