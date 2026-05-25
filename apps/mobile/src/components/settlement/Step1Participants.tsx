import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementDraftStore, useTheme } from '@repo/shared';
import { ContactPickerSheet, type ContactPickerSheetRef } from './ContactPickerSheet';
import { ContactSuggestions } from './ContactSuggestions';
import {
  ParticipantOptionsSheet,
  type ParticipantDraftFields,
  type ParticipantOptionsSheetRef,
} from './ParticipantOptionsSheet';

interface Props {
  onNext: () => void;
}

// 1단계 — 참여자 입력. 모바일 등록 편의를 위한 패턴:
//   1) 상단에 한 줄 input 고정 — 이름·닉네임 둘 다 받지만 한 글자만 쳐도
//      자동완성으로 단골 매칭. 엔터(submit) 또는 + 버튼으로 즉시 추가.
//   2) 추가된 사람은 아래에 칩 리스트. 칩 탭하면 옵션 시트가 떠 카테고리
//      제외/이름·닉네임 정정/삭제. 카테고리는 default 그대로 두는 경우가 많아
//      옵션 시트를 두 번째 액션으로 미룬다.
//   3) '단골에서 추가' 시트는 그대로 — 여러 명 일괄 추가용.
// 이 구조라면 input 이 항상 상단이라 키보드가 input 을 가리지 않고, 카드별
// 키보드 열고 닫기 반복이 사라진다.
export const Step1Participants = ({ onNext }: Props) => {
  const theme = useTheme();
  const participants = useSettlementDraftStore((s) => s.participants);
  const addParticipant = useSettlementDraftStore((s) => s.addParticipant);
  const addParticipantsAndCompact = useSettlementDraftStore(
    (s) => s.addParticipantsAndCompact,
  );
  const updateParticipant = useSettlementDraftStore((s) => s.updateParticipant);
  const removeParticipant = useSettlementDraftStore((s) => s.removeParticipant);

  const pickerRef = useRef<ContactPickerSheetRef>(null);
  const optionsRef = useRef<ParticipantOptionsSheetRef>(null);
  const inputRef = useRef<TextInput>(null);

  // 인라인 input 의 현재 값. 추가 시 비워지고 다시 포커스 유지 → 연속 추가가
  // 한 손으로 가능.
  const [draftName, setDraftName] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  const existingKeys = useMemo(
    () =>
      new Set(
        participants.map((p) => normalizeContactKey(p.name ?? null, p.nickname ?? null)),
      ),
    [participants],
  );
  const existingContactIds = useMemo(
    () =>
      new Set(
        participants.map((p) => p.contactId).filter((id): id is string => !!id),
      ),
    [participants],
  );

  const handleAddTyped = () => {
    const name = draftName.trim();
    if (name.length === 0) return;
    // 동일 정규화 키가 이미 있으면 중복 추가 무시 — 빠른 연타 시 사고 방지.
    const key = normalizeContactKey(name, null);
    if (existingKeys.has(key)) {
      setDraftName('');
      return;
    }
    addParticipant({
      name,
      nickname: '',
      excludeAlcohol: false,
      excludeNonAlcohol: false,
      excludeSide: false,
    });
    setDraftName('');
    // input 포커스 유지 → 다음 사람 바로 입력 가능.
    inputRef.current?.focus();
  };

  const handlePickFromSuggestion = (c: SettlementContactType) => {
    const key = normalizeContactKey(c.name, c.nickname);
    if (existingKeys.has(key)) {
      setDraftName('');
      return;
    }
    addParticipant({
      name: c.name ?? '',
      nickname: c.nickname ?? '',
      excludeAlcohol: c.lastExcludeAlcohol,
      excludeNonAlcohol: c.lastExcludeNonAlcohol,
      excludeSide: c.lastExcludeSide,
      contactId: c.id,
    });
    setDraftName('');
    inputRef.current?.focus();
  };

  const handleBulkAdd = (picked: SettlementContactType[]) => {
    addParticipantsAndCompact(
      picked.map((c) => ({
        name: c.name ?? '',
        nickname: c.nickname ?? '',
        excludeAlcohol: c.lastExcludeAlcohol,
        excludeNonAlcohol: c.lastExcludeNonAlcohol,
        excludeSide: c.lastExcludeSide,
        contactId: c.id,
      })),
    );
  };

  const handleApplyOptions = (clientId: string, patch: ParticipantDraftFields) => {
    updateParticipant(clientId, {
      name: patch.name,
      nickname: patch.nickname,
      excludeAlcohol: patch.excludeAlcohol,
      excludeNonAlcohol: patch.excludeNonAlcohol,
      excludeSide: patch.excludeSide,
      // 이름/닉네임을 손으로 바꿨으면 contactId hint 무효화.
      contactId: undefined,
    });
  };

  const canProceed = participants.length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.colors.text }]}>참여자</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          이름을 입력하고 엔터 또는 + 를 누르세요. 추가한 사람을 탭하면 닉네임·옵션을 바꿀 수
          있어요.
        </Text>
      </View>

      {/* 인라인 입력 — 화면 상단에 sticky 가 아닌 정상 흐름이지만 ScrollView
          상단이라 키보드 위로 항상 자동 정렬됨(automaticallyAdjustKeyboardInsets). */}
      <View>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.colors.surface,
              borderColor: inputFocused ? theme.colors.primary : theme.colors.border,
            },
          ]}
        >
          <TextInput
            ref={inputRef}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="이름 또는 닉네임 입력"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            onFocus={() => setInputFocused(true)}
            onBlur={() => {
              // 자동완성 onPressIn 이 먼저 처리되도록 microtask 늦춤.
              setTimeout(() => setInputFocused(false), 0);
            }}
            onSubmitEditing={handleAddTyped}
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.input, { color: theme.colors.text }]}
          />
          <Pressable
            onPress={handleAddTyped}
            disabled={draftName.trim().length === 0}
            android_ripple={{ color: theme.colors.surfaceAlt }}
            style={({ pressed }) => [
              styles.addCircle,
              {
                backgroundColor:
                  draftName.trim().length === 0
                    ? theme.colors.surfaceAlt
                    : pressed
                      ? theme.colors.primaryHover
                      : theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.addCirclePlus,
                {
                  color:
                    draftName.trim().length === 0
                      ? theme.colors.textMuted
                      : theme.colors.primaryText,
                },
              ]}
            >
              +
            </Text>
          </Pressable>
        </View>
        <ContactSuggestions
          query={draftName}
          open={inputFocused}
          onPick={handlePickFromSuggestion}
        />
      </View>

      <Pressable
        onPress={() => pickerRef.current?.present()}
        android_ripple={{ color: theme.colors.surfaceAlt }}
        style={({ pressed }) => [
          styles.contactsBtn,
          {
            borderColor: theme.colors.border,
            backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
          },
        ]}
      >
        <Text style={[styles.contactsBtnText, { color: theme.colors.text }]}>
          단골에서 여러 명 추가
        </Text>
      </Pressable>

      {/* 칩 리스트 — 추가된 순서대로. 카드보다 훨씬 dense 해서 화면에 한눈에 다
          들어옴. 옵션 표시는 칩 안쪽에 작은 배지로. */}
      {participants.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            아직 참여자가 없습니다.
          </Text>
        </View>
      ) : (
        <View>
          <Text style={[styles.countLabel, { color: theme.colors.textMuted }]}>
            {participants.length}명
          </Text>
          <View style={styles.chipWrap}>
            {participants.map((p, idx) => {
              const label = displayParticipant(p, idx);
              const hasExclude =
                p.excludeAlcohol || p.excludeNonAlcohol || p.excludeSide;
              return (
                <Pressable
                  key={p.clientId}
                  onPress={() =>
                    optionsRef.current?.present(p.clientId, {
                      name: p.name ?? '',
                      nickname: p.nickname ?? '',
                      excludeAlcohol: p.excludeAlcohol,
                      excludeNonAlcohol: p.excludeNonAlcohol,
                      excludeSide: p.excludeSide,
                    })
                  }
                  android_ripple={{ color: theme.colors.surfaceAlt }}
                  style={({ pressed }) => [
                    styles.personChip,
                    {
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipName, { color: theme.colors.text }]}>
                    {label}
                  </Text>
                  {hasExclude && (
                    <View style={styles.excludeBadges}>
                      {p.excludeAlcohol && <MiniBadge>주류 X</MiniBadge>}
                      {p.excludeNonAlcohol && <MiniBadge>비주류 X</MiniBadge>}
                      {p.excludeSide && <MiniBadge>안주 X</MiniBadge>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={onNext}
          disabled={!canProceed}
          style={({ pressed }) => [
            styles.nextBtn,
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
              styles.nextText,
              {
                color: !canProceed ? theme.colors.textMuted : theme.colors.primaryText,
              },
            ]}
          >
            다음
          </Text>
        </Pressable>
      </View>

      <ContactPickerSheet
        ref={pickerRef}
        existingContactIds={existingContactIds}
        existingKeys={existingKeys}
        onConfirm={handleBulkAdd}
      />
      <ParticipantOptionsSheet
        ref={optionsRef}
        onApply={handleApplyOptions}
        onRemove={removeParticipant}
      />
    </View>
  );
};

const MiniBadge = ({ children }: { children: string }) => {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.miniBadge,
        { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.textMuted },
      ]}
    >
      {children}
    </Text>
  );
};

const displayParticipant = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 서버 normalizeContactKey 와 동일 정의 — 중복 추가 방지용.
const normalizeContactKey = (name: string | null, nickname: string | null): string => {
  const n = (name ?? '').trim().toLowerCase();
  const k = (nickname ?? '').trim().toLowerCase();
  return `${n}|${k}`;
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  head: { gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 8 },
  addCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCirclePlus: { fontSize: 22, fontWeight: '700', lineHeight: 24, marginTop: -2 },
  contactsBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  contactsBtnText: { fontSize: 14, fontWeight: '600' },
  emptyCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
  },
  countLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  personChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipName: { fontSize: 14, fontWeight: '600' },
  excludeBadges: { flexDirection: 'row', gap: 3 },
  miniBadge: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  footer: { marginTop: 12 },
  nextBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  nextText: { fontSize: 15, fontWeight: '700' },
});
