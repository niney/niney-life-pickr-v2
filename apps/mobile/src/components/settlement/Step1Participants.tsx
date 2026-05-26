import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useSettlementDraftStore,
  useTheme,
  type Theme,
} from '@repo/shared';

interface Props {
  onNext: () => void;
}

// Step1 — 정산 참여자 입력. 한 행 = 한 명.
// 단골 자동완성/픽커는 #73 에서 추가, 새 행 기본 exclude prefs 는 추후 도입.
export const Step1Participants = ({ onNext }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const participants = useSettlementDraftStore((s) => s.participants);
  const addParticipant = useSettlementDraftStore((s) => s.addParticipant);
  const updateParticipant = useSettlementDraftStore((s) => s.updateParticipant);
  const removeParticipant = useSettlementDraftStore((s) => s.removeParticipant);

  const [submitAttempt, setSubmitAttempt] = useState(false);
  const [aliasOpened, setAliasOpened] = useState<Set<string>>(new Set());

  // 행 추가 직후 그 행으로 focus 이동하기 위한 ref Map. 행이 unmount 되면
  // 자동 정리.
  const nameRefs = useRef(new Map<string, TextInput | null>());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFocusId) return;
    const ref = nameRefs.current.get(pendingFocusId);
    if (ref) {
      ref.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, participants]);

  const toggleAlias = (clientId: string, open: boolean) => {
    setAliasOpened((cur) => {
      const next = new Set(cur);
      if (open) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
  };

  // 이름 input 의 submit (return key) — 마지막 행이면 새 행 추가 + focus,
  // 중간 행이면 다음 행으로 focus. 빈 행이면 아무것도 안 함.
  const handleSubmitName = (clientId: string) => {
    const idx = participants.findIndex((p) => p.clientId === clientId);
    const p = participants[idx];
    if (!p) return;
    const nm = (p.name ?? '').trim();
    const nick = (p.nickname ?? '').trim();
    if (nm.length === 0 && nick.length === 0) return;
    const isLast = idx === participants.length - 1;
    if (isLast) {
      const newId = addParticipant({
        name: '',
        nickname: '',
        excludeAlcohol: false,
        excludeNonAlcohol: false,
        excludeSide: false,
      });
      setPendingFocusId(newId);
    } else {
      const nextId = participants[idx + 1]?.clientId;
      if (nextId) setPendingFocusId(nextId);
    }
  };

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach((p) => {
      const nm = (p.name ?? '').trim();
      const nick = (p.nickname ?? '').trim();
      if (nm.length === 0 && nick.length === 0) {
        map.set(p.clientId, '이름을 입력해 주세요.');
      }
    });
    return map;
  }, [participants]);

  const canProceed = participants.length > 0 && errors.size === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 4 }}>
          <Text style={styles.h2}>참여자</Text>
          <Text style={styles.body}>
            누구끼리 나눌까요? 한 사람당 한 줄로 추가하세요. 같은 이름이 두 명이면
            "+ 별칭" 으로 구분할 수 있고, 술/안주 등 특이사항은 칩으로 표시하면 해당
            카테고리는 그 사람을 제외하고 나눠 부담합니다.
          </Text>
        </View>

        {participants.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={[styles.body, { textAlign: 'center' }]}>
              아직 참여자가 없습니다. 아래 버튼으로 추가하세요.
            </Text>
          </View>
        )}

        {participants.map((p, idx) => {
          const err = errors.get(p.clientId);
          const hasNickname = (p.nickname ?? '').trim().length > 0;
          const showAlias = hasNickname || aliasOpened.has(p.clientId);
          return (
            <View key={p.clientId} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardIndex}>#{idx + 1}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="삭제"
                  onPress={() => removeParticipant(p.clientId)}
                  style={({ pressed }) => [
                    styles.iconButton,
                    {
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{ color: theme.colors.textMuted, fontSize: 18 }}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>이름</Text>
                  <TextInput
                    ref={(el) => {
                      if (el) nameRefs.current.set(p.clientId, el);
                      else nameRefs.current.delete(p.clientId);
                    }}
                    value={p.name ?? ''}
                    placeholder={showAlias ? '홍길동' : '홍길동 또는 길동이'}
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    returnKeyType={
                      idx === participants.length - 1 ? 'done' : 'next'
                    }
                    onSubmitEditing={() => handleSubmitName(p.clientId)}
                    onChangeText={(v) =>
                      // 자동완성 기능 추가(#73) 시 contactId hint clear 도 함께.
                      updateParticipant(p.clientId, { name: v })
                    }
                  />
                </View>
                {!showAlias && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => toggleAlias(p.clientId, true)}
                    style={({ pressed }) => [
                      styles.aliasAdd,
                      {
                        backgroundColor: pressed
                          ? theme.colors.surfaceAlt
                          : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.aliasAddText, { color: theme.colors.textMuted }]}>
                      + 별칭
                    </Text>
                  </Pressable>
                )}
              </View>

              {showAlias && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.label}>별칭</Text>
                  <View style={styles.fieldRow}>
                    <TextInput
                      value={p.nickname ?? ''}
                      placeholder="길동이"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, { flex: 1 }]}
                      onChangeText={(v) =>
                        updateParticipant(p.clientId, { nickname: v })
                      }
                    />
                    {!hasNickname && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="별칭 칸 닫기"
                        onPress={() => toggleAlias(p.clientId, false)}
                        style={({ pressed }) => [
                          styles.iconButton,
                          {
                            backgroundColor: pressed
                              ? theme.colors.surfaceAlt
                              : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={{ color: theme.colors.textMuted, fontSize: 18 }}
                        >
                          ✕
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.chipRow}>
                <ExcludeChip
                  label="주류 안 함"
                  checked={p.excludeAlcohol}
                  onChange={(v) =>
                    updateParticipant(p.clientId, { excludeAlcohol: v })
                  }
                  theme={theme}
                />
                <ExcludeChip
                  label="비주류 안 함"
                  checked={p.excludeNonAlcohol}
                  onChange={(v) =>
                    updateParticipant(p.clientId, { excludeNonAlcohol: v })
                  }
                  theme={theme}
                />
                <ExcludeChip
                  label="안주 안 먹음"
                  checked={p.excludeSide}
                  onChange={(v) =>
                    updateParticipant(p.clientId, { excludeSide: v })
                  }
                  theme={theme}
                />
              </View>

              {submitAttempt && err && (
                <Text style={[styles.errorText, { color: theme.colors.danger }]}>
                  {err}
                </Text>
              )}
            </View>
          );
        })}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const newId = addParticipant({
              name: '',
              nickname: '',
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            });
            setPendingFocusId(newId);
          }}
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
            + 참여자 추가
          </Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Pressable
          accessibilityRole="button"
          disabled={submitAttempt && !canProceed}
          onPress={() => {
            setSubmitAttempt(true);
            if (canProceed) onNext();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor:
                submitAttempt && !canProceed
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
                  submitAttempt && !canProceed
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

// 토글 칩 — 체크되면 채워진 배경, 아니면 외곽선만. RN 에 기본 체크박스가
// 없어서 chip 형태가 모바일 관용. 한 줄 안에서 wrap 되도록 row + flexWrap.
const ExcludeChip = ({
  label,
  checked,
  onChange,
  theme,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  theme: Theme;
}) => (
  <Pressable
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    onPress={() => onChange(!checked)}
    style={({ pressed }) => [
      {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: checked ? theme.colors.primary : theme.colors.border,
        backgroundColor: checked
          ? theme.colors.primary
          : pressed
            ? theme.colors.surfaceAlt
            : 'transparent',
      },
    ]}
  >
    <Text
      style={{
        fontSize: 12,
        fontWeight: '500',
        color: checked ? theme.colors.primaryText : theme.colors.text,
      }}
    >
      {label}
    </Text>
  </Pressable>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
    h2: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    body: { fontSize: 13, lineHeight: 20, color: theme.colors.textMuted },
    emptyBox: {
      padding: 24,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
    },
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
    },
    cardIndex: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    fieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    label: {
      fontSize: 11,
      fontWeight: '500',
      color: theme.colors.textMuted,
      marginBottom: 4,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: theme.colors.text,
      backgroundColor: theme.colors.bg,
    },
    aliasAdd: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 6,
    },
    aliasAddText: { fontSize: 12, fontWeight: '500' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    errorText: { fontSize: 11, marginTop: 4 },
    addButton: {
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      borderStyle: 'dashed',
    },
    addButtonText: { fontSize: 14, fontWeight: '600' },
    footer: {
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.bg,
    },
    primaryButton: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryButtonText: { fontSize: 15, fontWeight: '600' },
  });
