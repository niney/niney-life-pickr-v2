import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useSettlementDraftStore,
  useTheme,
  type DraftAttendance,
  type DraftParticipant,
  type DraftRound,
  type ExcludeKey,
  type Theme,
} from '@repo/shared';

interface Props {
  round: DraftRound;
  participants: DraftParticipant[];
}

// 차수 특이사항 편집기 — 평소엔 0개 칩, 명시적 override 만 칩 1개씩 누적.
// 마스터 default 와 같은 값을 override 로 박은 행은 silent dedupe (표시 X).
//
// 추가 폼은 인라인 펼침 — RN 에선 모달까지 띄울 만한 복잡도가 아니다.
export const RoundExceptionsEditor = ({ round, participants }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setExcludeOverride = useSettlementDraftStore((s) => s.setExcludeOverride);
  const [open, setOpen] = useState(false);

  const exceptions = useMeaningfulExceptions(round, participants);

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          차수 특이사항{exceptions.length > 0 ? ` (${exceptions.length})` : ''}
        </Text>
      </View>
      {exceptions.length === 0 && !open && (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          모두 마스터 설정을 따릅니다. 이 차수에만 다르면 아래에서 추가하세요.
        </Text>
      )}
      {exceptions.length > 0 && (
        <View style={styles.chipWrap}>
          {exceptions.map((e) => (
            <View
              key={`${e.participantClientId}-${e.key}`}
              style={[
                styles.chip,
                {
                  borderColor: theme.colors.primary,
                  backgroundColor: theme.colors.dangerBg,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.colors.text }]}>
                {e.participantName}: {categoryLabel(e.key)} {valueLabel(e.key, e.value)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="제거"
                onPress={() =>
                  setExcludeOverride(
                    round.clientId,
                    e.participantClientId,
                    e.key,
                    null,
                  )
                }
                style={({ pressed }) => [
                  styles.chipRemoveBtn,
                  {
                    backgroundColor: pressed
                      ? theme.colors.surfaceAlt
                      : 'transparent',
                  },
                ]}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                  ✕
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {open ? (
        <AddExceptionForm
          round={round}
          participants={participants}
          theme={theme}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.addBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={[styles.addBtnText, { color: theme.colors.text }]}>
            + 특이사항 추가
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const AddExceptionForm = ({
  round,
  participants,
  theme,
  onClose,
}: {
  round: DraftRound;
  participants: DraftParticipant[];
  theme: Theme;
  onClose: () => void;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setExcludeOverride = useSettlementDraftStore((s) => s.setExcludeOverride);
  const attendedParticipants = participants.filter((p) =>
    round.attendances.find((a) => a.participantClientId === p.clientId)?.attended,
  );
  const [pid, setPid] = useState<string>(
    attendedParticipants[0]?.clientId ?? '',
  );
  const [key, setKey] = useState<ExcludeKey>('excludeAlcohol');
  const [value, setValue] = useState<boolean>(true);

  const selectedMaster = participants.find((p) => p.clientId === pid);
  const masterMatch =
    selectedMaster &&
    (key === 'excludeAlcohol'
      ? selectedMaster.excludeAlcohol === value
      : key === 'excludeNonAlcohol'
        ? selectedMaster.excludeNonAlcohol === value
        : selectedMaster.excludeSide === value);

  const handleAdd = () => {
    if (!pid) return;
    setExcludeOverride(round.clientId, pid, key, value);
    onClose();
  };

  return (
    <View
      style={[
        styles.form,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <Text style={[styles.formLabel, { color: theme.colors.textMuted }]}>
        참여자
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
      >
        {attendedParticipants.map((p, idx) => {
          const sel = pid === p.clientId;
          return (
            <Pressable
              key={p.clientId}
              onPress={() => setPid(p.clientId)}
              style={({ pressed }) => [
                styles.optionChip,
                {
                  borderColor: sel ? theme.colors.primary : theme.colors.border,
                  backgroundColor: sel
                    ? theme.colors.primary
                    : pressed
                      ? theme.colors.surface
                      : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: sel ? theme.colors.primaryText : theme.colors.text,
                }}
              >
                {participantLabel(p, idx)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.formLabel, { color: theme.colors.textMuted, marginTop: 8 }]}>
        카테고리
      </Text>
      <View style={styles.optionRow}>
        {(['excludeAlcohol', 'excludeNonAlcohol', 'excludeSide'] as const).map(
          (k) => {
            const sel = key === k;
            return (
              <Pressable
                key={k}
                onPress={() => setKey(k)}
                style={({ pressed }) => [
                  styles.optionChip,
                  {
                    borderColor: sel ? theme.colors.primary : theme.colors.border,
                    backgroundColor: sel
                      ? theme.colors.primary
                      : pressed
                        ? theme.colors.surface
                        : 'transparent',
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: sel ? theme.colors.primaryText : theme.colors.text,
                  }}
                >
                  {categoryLabel(k)}
                </Text>
              </Pressable>
            );
          },
        )}
      </View>

      <Text style={[styles.formLabel, { color: theme.colors.textMuted, marginTop: 8 }]}>
        이 차수엔
      </Text>
      <View style={styles.optionRow}>
        {[false, true].map((v) => {
          const sel = value === v;
          return (
            <Pressable
              key={String(v)}
              onPress={() => setValue(v)}
              style={({ pressed }) => [
                styles.optionChip,
                {
                  borderColor: sel ? theme.colors.primary : theme.colors.border,
                  backgroundColor: sel
                    ? theme.colors.primary
                    : pressed
                      ? theme.colors.surface
                      : 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: sel ? theme.colors.primaryText : theme.colors.text,
                }}
              >
                {verb(key, v)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {masterMatch && (
        <Text style={[styles.hint, { color: theme.colors.textMuted, marginTop: 6 }]}>
          마스터 설정과 같아 칩은 표시되지 않습니다.
        </Text>
      )}

      <View style={styles.formActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.formBtn,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={[styles.formBtnText, { color: theme.colors.text }]}>
            취소
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!pid}
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.formBtnPrimary,
            {
              backgroundColor: !pid
                ? theme.colors.surfaceAlt
                : pressed
                  ? theme.colors.primaryHover
                  : theme.colors.primary,
            },
          ]}
        >
          <Text
            style={[
              styles.formBtnPrimaryText,
              {
                color: !pid ? theme.colors.textMuted : theme.colors.primaryText,
              },
            ]}
          >
            추가
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

interface MeaningfulException {
  participantClientId: string;
  participantName: string;
  key: ExcludeKey;
  value: boolean;
}

const useMeaningfulExceptions = (
  round: DraftRound,
  participants: DraftParticipant[],
): MeaningfulException[] => {
  const out: MeaningfulException[] = [];
  const pById = new Map(
    participants.map((p, idx) => [p.clientId, { p, idx }]),
  );
  for (const a of round.attendances) {
    const ref = pById.get(a.participantClientId);
    if (!ref) continue;
    const name = participantLabel(ref.p, ref.idx);
    pushIfMeaningful(out, a, ref.p, name, 'excludeAlcohol', 'excludeAlcoholOverride');
    pushIfMeaningful(out, a, ref.p, name, 'excludeNonAlcohol', 'excludeNonAlcoholOverride');
    pushIfMeaningful(out, a, ref.p, name, 'excludeSide', 'excludeSideOverride');
  }
  return out;
};

const pushIfMeaningful = (
  out: MeaningfulException[],
  a: DraftAttendance,
  master: DraftParticipant,
  name: string,
  key: ExcludeKey,
  overrideKey: 'excludeAlcoholOverride' | 'excludeNonAlcoholOverride' | 'excludeSideOverride',
): void => {
  const override = a[overrideKey];
  if (override === null) return;
  const masterVal =
    key === 'excludeAlcohol'
      ? master.excludeAlcohol
      : key === 'excludeNonAlcohol'
        ? master.excludeNonAlcohol
        : master.excludeSide;
  if (override === masterVal) return;
  out.push({
    participantClientId: a.participantClientId,
    participantName: name,
    key,
    value: override,
  });
};

const participantLabel = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

const categoryLabel = (key: ExcludeKey): string => {
  if (key === 'excludeAlcohol') return '주류';
  if (key === 'excludeNonAlcohol') return '비주류';
  return '안주';
};

const verb = (key: ExcludeKey, exclude: boolean): string => {
  if (key === 'excludeSide') return exclude ? '안 먹음' : '먹음';
  return exclude ? '안 함' : '마심';
};

const valueLabel = (key: ExcludeKey, exclude: boolean): string => verb(key, exclude);

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: { fontSize: 12, fontWeight: '500' },
    hint: { fontSize: 11 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingLeft: 8,
      paddingRight: 2,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    chipText: { fontSize: 11 },
    chipRemoveBtn: {
      width: 20,
      height: 20,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    addBtnText: { fontSize: 12, fontWeight: '500' },
    form: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 4,
    },
    formLabel: { fontSize: 11, fontWeight: '500' },
    optionRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    optionChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    formActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
      marginTop: 8,
    },
    formBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    formBtnText: { fontSize: 12, fontWeight: '500' },
    formBtnPrimary: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    formBtnPrimaryText: { fontSize: 12, fontWeight: '600' },
  });
