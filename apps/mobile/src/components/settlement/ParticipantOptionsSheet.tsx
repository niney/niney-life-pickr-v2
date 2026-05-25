import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '@repo/shared';

export interface ParticipantDraftFields {
  name: string;
  nickname: string;
  excludeAlcohol: boolean;
  excludeNonAlcohol: boolean;
  excludeSide: boolean;
}

export interface ParticipantOptionsSheetRef {
  present(clientId: string, initial: ParticipantDraftFields): void;
  dismiss(): void;
}

interface Props {
  onApply(clientId: string, patch: ParticipantDraftFields): void;
  onRemove(clientId: string): void;
}

// 참여자 칩 탭 시 뜨는 옵션 편집 시트. 이름/닉네임 정정 + 카테고리 제외 +
// 삭제. 한 명을 편집하는 동안에만 떠 있으므로 내부 state 로 충분 — 부모는
// 적용/삭제 콜백만 받는다.
export const ParticipantOptionsSheet = forwardRef<ParticipantOptionsSheetRef, Props>(
  ({ onApply, onRemove }, ref) => {
    const theme = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [clientId, setClientId] = useState<string | null>(null);
    const [draft, setDraft] = useState<ParticipantDraftFields>({
      name: '',
      nickname: '',
      excludeAlcohol: false,
      excludeNonAlcohol: false,
      excludeSide: false,
    });

    useImperativeHandle(ref, () => ({
      present: (id, initial) => {
        setClientId(id);
        setDraft(initial);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    );

    const apply = () => {
      if (clientId) onApply(clientId, draft);
      sheetRef.current?.dismiss();
    };

    const remove = () => {
      if (clientId) onRemove(clientId);
      sheetRef.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['55%']}
        enableDynamicSizing={false}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={[styles.title, { color: theme.colors.text }]}>참여자 옵션</Text>

          <View style={styles.row}>
            <View style={styles.colHalf}>
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>이름</Text>
              <TextInput
                value={draft.name}
                placeholder="홍길동"
                placeholderTextColor={theme.colors.textMuted}
                onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                  },
                ]}
              />
            </View>
            <View style={styles.colHalf}>
              <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>닉네임</Text>
              <TextInput
                value={draft.nickname}
                placeholder="길동이"
                placeholderTextColor={theme.colors.textMuted}
                onChangeText={(nickname) => setDraft((d) => ({ ...d, nickname }))}
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                  },
                ]}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.colors.textMuted, marginTop: 12 }]}>
            카테고리 제외
          </Text>
          <View style={styles.toggleRow}>
            <ExcludeChip
              label="주류"
              checked={draft.excludeAlcohol}
              onChange={(v) => setDraft((d) => ({ ...d, excludeAlcohol: v }))}
            />
            <ExcludeChip
              label="비주류"
              checked={draft.excludeNonAlcohol}
              onChange={(v) => setDraft((d) => ({ ...d, excludeNonAlcohol: v }))}
            />
            <ExcludeChip
              label="안주"
              checked={draft.excludeSide}
              onChange={(v) => setDraft((d) => ({ ...d, excludeSide: v }))}
            />
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={remove}
              style={({ pressed }) => [
                styles.ghostBtn,
                {
                  borderColor: theme.colors.danger,
                  backgroundColor: pressed ? theme.colors.dangerBg : 'transparent',
                },
              ]}
            >
              <Text style={[styles.ghostText, { color: theme.colors.danger }]}>삭제</Text>
            </Pressable>
            <Pressable
              onPress={apply}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: pressed
                    ? theme.colors.primaryHover
                    : theme.colors.primary,
                },
              ]}
            >
              <Text style={[styles.primaryText, { color: theme.colors.primaryText }]}>
                적용
              </Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ParticipantOptionsSheet.displayName = 'ParticipantOptionsSheet';

const ExcludeChip = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: checked
            ? theme.colors.primary
            : pressed
              ? theme.colors.surfaceAlt
              : theme.colors.surface,
          borderColor: checked ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: checked ? theme.colors.primaryText : theme.colors.text },
        ]}
      >
        {label} {checked ? '제외' : ''}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8 },
  colHalf: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 'auto',
    paddingTop: 16,
  },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '700' },
});
