import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ApiError,
  useExtractReceipt,
  useSettlementDraftStore,
  useTheme,
  useUploadReceipt,
  type DraftItem,
  type DraftRound,
  type Theme,
} from '@repo/shared';
import { MultiReceiptSplitSheet } from './MultiReceiptSplitSheet';
import { RestaurantPickerSheet } from './RestaurantPickerSheet';

interface Props {
  onBack: () => void;
  onNext: () => void;
}

// Step2 — 차수 구성 + 영수증 OCR. 웹 Step2Rounds 의 RN 포팅.
// 분할 영수증 진입은 #77 에서 추가, 1장씩 업로드만 지원.
export const Step2Rounds = ({ onBack, onNext }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const rounds = useSettlementDraftStore((s) => s.rounds);
  const addRound = useSettlementDraftStore((s) => s.addRound);
  const removeRound = useSettlementDraftStore((s) => s.removeRound);
  const updateRoundMeta = useSettlementDraftStore((s) => s.updateRoundMeta);
  const setRoundItems = useSettlementDraftStore((s) => s.setRoundItems);
  const setRoundReceipt = useSettlementDraftStore((s) => s.setRoundReceipt);

  // 식당 선택 모달의 대상 — 기존 차수의 변경 / 신규 차수 추가 두 모드.
  const [pickingRoundClientId, setPickingRoundClientId] = useState<string | null>(null);
  const [pickingForNewRound, setPickingForNewRound] = useState(false);
  const [splitSheetOpen, setSplitSheetOpen] = useState(false);

  // 분할 영수증 진입 — 차수 2개 이상 + 모두 식당 선택돼야.
  const splitCandidateRounds = useMemo(
    () => rounds.filter((r) => r.placeId.length > 0),
    [rounds],
  );
  const canOpenSplit = splitCandidateRounds.length >= 2;

  const alreadyPicked = useMemo(
    () => new Set(rounds.map((r) => r.placeId).filter((x) => x.length > 0)),
    [rounds],
  );

  const canProceed =
    rounds.length > 0 && rounds.every((r) => r.source !== null);

  const handlePick = (target: { placeId: string; name: string }) => {
    if (pickingForNewRound) {
      addRound(target.placeId, target.name);
      setPickingForNewRound(false);
      return;
    }
    if (pickingRoundClientId) {
      updateRoundMeta(pickingRoundClientId, {
        placeId: target.placeId,
        placeName: target.name,
      });
      setPickingRoundClientId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 4 }}>
          <Text style={styles.h2}>차수 구성</Text>
          <Text style={styles.body}>
            1차 식당부터 시작해 2차·3차로 자리가 옮겨졌다면 차수를 추가하세요.
            영수증 사진은 차수마다 1장씩 올리면 자동으로 항목이 추출됩니다.
          </Text>
        </View>

        {rounds.length === 0 && (
          <View style={[styles.card, { alignItems: 'center', gap: 12 }]}>
            <Text style={[styles.body, { textAlign: 'center' }]}>
              아직 차수가 없습니다.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickingForNewRound(true)}
              style={({ pressed }) => [
                styles.primarySmall,
                {
                  backgroundColor: pressed
                    ? theme.colors.primaryHover
                    : theme.colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.primarySmallText,
                  { color: theme.colors.primaryText },
                ]}
              >
                + 1차 식당 선택
              </Text>
            </Pressable>
          </View>
        )}

        {rounds.map((r, idx) => (
          <RoundCard
            key={r.clientId}
            round={r}
            index={idx}
            total={rounds.length}
            onPickRestaurant={() => setPickingRoundClientId(r.clientId)}
            onRemove={() => removeRound(r.clientId)}
            onChooseManual={() => {
              setRoundItems(r.clientId, []);
              updateRoundMeta(r.clientId, { source: 'MANUAL' });
            }}
            onReceiptDone={(args) => setRoundReceipt(r.clientId, args)}
            theme={theme}
          />
        ))}

        {rounds.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPickingForNewRound(true)}
            style={({ pressed }) => [
              styles.addButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
              },
            ]}
          >
            <Text style={[styles.addButtonText, { color: theme.colors.text }]}>
              + 차수 추가
            </Text>
          </Pressable>
        )}

        {rounds.length >= 1 && (
          <View
            style={[
              styles.splitHintBox,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text style={[styles.splitHintTitle, { color: theme.colors.text }]}>
              한 사진에 영수증이 여러 장?
            </Text>
            <Text
              style={[styles.splitHintBody, { color: theme.colors.textMuted }]}
            >
              사진 한 장을 좌→우로 N등분해 각 차수에 자동 배분합니다.
              {!canOpenSplit && ' (차수 2개 이상 + 모두 식당 선택 필요)'}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!canOpenSplit}
              onPress={() => setSplitSheetOpen(true)}
              style={({ pressed }) => [
                styles.outlineSmall,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: pressed
                    ? theme.colors.surface
                    : 'transparent',
                  opacity: canOpenSplit ? 1 : 0.5,
                  alignSelf: 'flex-start',
                },
              ]}
            >
              <Text
                style={[styles.outlineSmallText, { color: theme.colors.text }]}
              >
                분할 영수증 업로드
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <MultiReceiptSplitSheet
        open={splitSheetOpen}
        rounds={splitCandidateRounds}
        totalRounds={rounds.length}
        onClose={() => setSplitSheetOpen(false)}
        onApplyOne={(roundClientId, args) =>
          setRoundReceipt(roundClientId, args)
        }
      />

      <RestaurantPickerSheet
        open={pickingRoundClientId !== null || pickingForNewRound}
        alreadyPicked={alreadyPicked}
        onClose={() => {
          setPickingRoundClientId(null);
          setPickingForNewRound(false);
        }}
        onPick={handlePick}
      />

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.ghostButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>
            이전
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canProceed}
          onPress={onNext}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: !canProceed
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
                color: !canProceed
                  ? theme.colors.textMuted
                  : theme.colors.primaryText,
              },
            ]}
          >
            다음
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

interface RoundCardProps {
  round: DraftRound;
  index: number;
  total: number;
  onPickRestaurant: () => void;
  onRemove: () => void;
  onChooseManual: () => void;
  onReceiptDone: (args: {
    imageToken: string;
    previewUrl: string;
    items: DraftItem[];
    totalAmount: number | null;
    warning: string | null;
  }) => void;
  theme: Theme;
}

const RoundCard = ({
  round,
  index,
  total,
  onPickRestaurant,
  onRemove,
  onChooseManual,
  onReceiptDone,
  theme,
}: RoundCardProps) => {
  const upload = useUploadReceipt();
  const extract = useExtractReceipt();
  const [error, setError] = useState<string | null>(null);

  const isWorking = upload.isPending || extract.isPending;
  const styles = useMemo(() => createStyles(theme), [theme]);

  // 사진 입력 — Alert 로 카메라/앨범/취소 3택. 권한 거부 시 메시지만 남기고
  // 종료(시스템 설정 안내는 별도 도입 — 현재는 단순 fail).
  const pickImage = async () => {
    if (!round.placeId) {
      setError('식당을 먼저 선택해 주세요.');
      return;
    }
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
            await runUploadExtract(res.assets[0]!.uri);
          },
        },
        {
          text: '앨범',
          onPress: async () => {
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              // iOS 앨범 원본은 HEIC(HEVC) 라 서버 sharp 가 디코드 못 한다.
              // Compatible 모드로 픽 시점에 JPEG 로 트랜스코딩시켜 업로드.
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            });
            if (res.canceled) return;
            await runUploadExtract(res.assets[0]!.uri);
          },
        },
        { text: '취소', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  // 로컬 URI → blob → 업로드 → 추출 → 콜백. RN 의 fetch(localFileUri) 는
  // 파일 시스템 URI 에서 blob 을 만들어줘 그대로 FormData 에 append 가능.
  const runUploadExtract = async (uri: string) => {
    setError(null);
    try {
      const blob = (await fetch(uri).then((r) => r.blob())) as unknown as Blob;
      const uploaded = await upload.mutateAsync(blob);
      const extracted = await extract.mutateAsync({
        imageToken: uploaded.imageToken,
        placeId: round.placeId,
        roundIndex: index + 1,
        roundTotal: total,
      });
      onReceiptDone({
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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '업로드/추출 실패');
    }
  };

  const sourceLabel =
    round.source === 'MANUAL'
      ? '직접 입력'
      : round.source === 'RECEIPT'
        ? '영수증'
        : '미선택';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <View style={[styles.roundBadge, { backgroundColor: theme.colors.dangerBg }]}>
            <Text style={[styles.roundBadgeText, { color: theme.colors.primary }]}>
              {index + 1}차
            </Text>
          </View>
          <Text
            style={[styles.cardTitle, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {round.placeName || '식당 미선택'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="차수 삭제"
          onPress={onRemove}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>🗑</Text>
        </Pressable>
      </View>

      <View style={[styles.metaRow, { borderColor: theme.colors.border }]}>
        <Text
          style={[styles.metaText, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          📍 {round.placeName || '식당 미선택'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onPickRestaurant}
          style={({ pressed }) => [
            styles.outlineSmall,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text
            style={[styles.outlineSmallText, { color: theme.colors.text }]}
          >
            {round.placeId ? '변경' : '식당 선택'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.statusLine}>
        <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>
          입력 방식: {sourceLabel}
        </Text>
        {round.items.length > 0 && (
          <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>
            항목 {round.items.length}개
            {round.totalAmount != null
              ? ` · ${round.totalAmount.toLocaleString('ko-KR')}원`
              : ''}
          </Text>
        )}
      </View>

      {round.source === null && (
        <View style={styles.sourceButtonsRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!round.placeId || isWorking}
            onPress={onChooseManual}
            style={({ pressed }) => [
              styles.sourceButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
                opacity: !round.placeId || isWorking ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[styles.sourceButtonText, { color: theme.colors.text }]}
            >
              ✍ 직접 입력
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!round.placeId || isWorking}
            onPress={pickImage}
            style={({ pressed }) => [
              styles.sourceButton,
              {
                borderColor: theme.colors.border,
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
                opacity: !round.placeId || isWorking ? 0.5 : 1,
              },
            ]}
          >
            {isWorking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color={theme.colors.text} />
                <Text
                  style={[styles.sourceButtonText, { color: theme.colors.text }]}
                >
                  {upload.isPending ? '업로드 중…' : '추출 중…'}
                </Text>
              </View>
            ) : (
              <Text
                style={[styles.sourceButtonText, { color: theme.colors.text }]}
              >
                📷 영수증 사진
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {round.source !== null && (
        <View style={[styles.doneBanner, { backgroundColor: theme.colors.dangerBg }]}>
          <Text style={[styles.doneText, { color: theme.colors.text }]}>
            입력 완료 — 다음 단계에서 항목을 확인·수정하세요.
          </Text>
          {round.source === 'RECEIPT' && (
            <Pressable
              accessibilityRole="button"
              disabled={isWorking}
              onPress={pickImage}
              style={({ pressed }) => [
                styles.doneAction,
                {
                  backgroundColor: pressed
                    ? theme.colors.surfaceAlt
                    : 'transparent',
                },
              ]}
            >
              {isWorking ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Text
                  style={[styles.doneActionText, { color: theme.colors.text }]}
                >
                  다른 사진
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}

      {error && (
        <Text style={[styles.errorText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      )}
      {round.warning && (
        <Text style={[styles.errorText, { color: theme.colors.danger }]}>
          ⚠ {round.warning}
        </Text>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
    h2: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    body: { fontSize: 13, lineHeight: 20, color: theme.colors.textMuted },
    card: {
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
    roundBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    roundBadgeText: { fontSize: 11, fontWeight: '600' },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.bg,
    },
    metaText: { fontSize: 13, flex: 1 },
    outlineSmall: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
    },
    outlineSmallText: { fontSize: 12, fontWeight: '500' },
    statusLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    statusText: { fontSize: 11 },
    sourceButtonsRow: { flexDirection: 'row', gap: 8 },
    sourceButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    sourceButtonText: { fontSize: 13, fontWeight: '500' },
    doneBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
    },
    doneText: { fontSize: 12, flex: 1 },
    doneAction: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    doneActionText: { fontSize: 11, fontWeight: '500' },
    errorText: { fontSize: 12 },
    addButton: {
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      alignItems: 'center',
    },
    splitHintBox: {
      padding: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      gap: 6,
    },
    splitHintTitle: { fontSize: 13, fontWeight: '600' },
    splitHintBody: { fontSize: 11, lineHeight: 16 },
    addButtonText: { fontSize: 14, fontWeight: '600' },
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
    primaryButtonText: { fontSize: 15, fontWeight: '600' },
    primarySmall: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    primarySmallText: { fontSize: 14, fontWeight: '600' },
  });
