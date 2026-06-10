import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  isEligibleGroupMember,
  isGroupableCategory,
  suggestItemGroups,
  useSettlementDraftStore,
  useTheme,
  type DraftItem,
  type DraftItemGroup,
  type DraftParticipant,
  type DraftRound,
  type GroupableCategoryType,
  type Theme,
} from '@repo/shared';

// 세부 분배 에디터(앱) — 주류/음료 풀에서 소주·맥주 같은 항목 그룹을 떼어내
// 그룹 멤버끼리 균등 또는 잔수(정수 가중치)로 나눈다. 로직은 웹
// RoundGroupSplitEditor 와 동일하고 표현만 앱 관용구를 따른다:
//
// - 웹의 사람×그룹 매트릭스(행=사람, 열=그룹) 대신 **그룹 카드 세로 스택** —
//   좁은 화면에 열이 안 나오고, 그룹은 보통 1~3개라 카드가 자연스럽다.
//   멤버 체크/잔수 스테퍼는 각 그룹 카드 안의 참석자 리스트 행.
// - 점진 노출: 평소엔 라벨 한 줄(+요약 칩), 펼치면 키워드 제안 → 원탭 생성.
//   안 건드리면 기존 카테고리 균등 분배와 100% 동일.
// - hover 툴팁이 없으므로 자격 없는 행(카테고리 제외자) 안내는 인라인 텍스트.

interface Props {
  round: DraftRound;
  participants: DraftParticipant[];
}

const CATEGORY_LABEL: Record<GroupableCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '음료',
};

const labelFallback = (category: ReceiptItemCategoryType): string =>
  isGroupableCategory(category) ? CATEGORY_LABEL[category] : '그룹';

const participantLabel = (p: DraftParticipant, idx: number): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 경고 텍스트 색 — 웹의 amber-600/400 에 대응. 앱 팔레트에선 primary 계열이
// 정확히 amber 라 모드별로 골라 쓴다 (다크는 밝은 500이 가독성 좋음).
const warnColor = (theme: Theme): string =>
  theme.mode === 'dark' ? theme.colors.primary : theme.colors.primaryHover;

export const RoundGroupSplitEditor = ({ round, participants }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const groups = round.groupSplits ?? [];
  const hasGroupableItems = round.items.some((it) =>
    isGroupableCategory(it.category),
  );
  if (!hasGroupableItems && groups.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.headerRow}
      >
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          세부 분배 — 소주·맥주 그룹/잔수
          {groups.length > 0 ? ` (${groups.length})` : ''}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      {/* 접힌 상태 요약 — 설정된 그룹이 있으면 한 줄 칩으로. */}
      {!open && groups.length > 0 && (
        <View style={styles.chipWrap}>
          {groups.map((g) => (
            <View
              key={g.clientId}
              style={[
                styles.summaryChip,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <Text style={[styles.summaryChipText, { color: theme.colors.text }]}>
                {g.label || labelFallback(g.category)} ·{' '}
                {g.mode === 'GLASSES' ? '잔수' : '균등'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {open && (
        <EditorBody round={round} participants={participants} theme={theme} />
      )}
    </View>
  );
};

const EditorBody = ({
  round,
  participants,
  theme,
}: Props & { theme: Theme }) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const applyGroupSplits = useSettlementDraftStore((s) => s.applyGroupSplits);
  const addGroupSplit = useSettlementDraftStore((s) => s.addGroupSplit);
  const groups = round.groupSplits ?? [];

  const eligible = (category: ReceiptItemCategoryType): DraftParticipant[] =>
    participants.filter((p) =>
      isEligibleGroupMember(round, participants, p.clientId, category),
    );

  // 아직 그룹에 안 묶인 주류/음료 항목 — 수동 그룹 추가의 기본 선택.
  const groupedItemIds = new Set(groups.flatMap((g) => g.itemClientIds));
  const ungroupedOf = (category: GroupableCategoryType): DraftItem[] =>
    round.items.filter(
      (it) => it.category === category && !groupedItemIds.has(it.clientId),
    );

  const suggestions = useMemo(() => suggestItemGroups(round.items), [round.items]);

  const handleApplySuggestions = () => {
    applyGroupSplits(
      round.clientId,
      suggestions.map((s) => ({
        label: s.label,
        category: s.category,
        itemClientIds: s.itemClientIds,
        mode: 'EQUAL' as const,
        members: eligible(s.category).map((p) => ({
          participantClientId: p.clientId,
          glasses: 1,
        })),
      })),
    );
  };

  const handleAddGroup = (category: GroupableCategoryType) => {
    addGroupSplit(round.clientId, {
      label: CATEGORY_LABEL[category],
      category,
      itemClientIds: ungroupedOf(category).map((it) => it.clientId),
      mode: 'EQUAL',
      members: eligible(category).map((p) => ({
        participantClientId: p.clientId,
        glasses: 1,
      })),
    });
  };

  return (
    <View style={{ gap: 10 }}>
      {/* 첫 진입 — 키워드 제안. 그룹이 이미 있으면 제안은 숨긴다. */}
      {groups.length === 0 &&
        (suggestions.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              항목명으로 이런 그룹을 만들 수 있어요:
            </Text>
            <View style={styles.chipWrap}>
              {suggestions.map((s) => (
                <View
                  key={`${s.category}:${s.label}`}
                  style={[
                    styles.summaryChip,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[styles.summaryChipText, { color: theme.colors.text }]}
                  >
                    {s.label} · 항목 {s.itemClientIds.length}개
                  </Text>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleApplySuggestions}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: pressed
                    ? theme.colors.primaryHover
                    : theme.colors.primary,
                },
              ]}
            >
              <Text style={[styles.primaryBtnText, { color: theme.colors.primaryText }]}>
                ✨ 이대로 그룹 만들기
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            소주/맥주처럼 따로 나눌 항목을 그룹으로 묶고, 그룹마다 균등 또는
            잔수로 나눠보세요.
          </Text>
        ))}

      {groups.map((g) => (
        <GroupCard
          key={g.clientId}
          round={round}
          participants={participants}
          group={g}
          theme={theme}
        />
      ))}

      {/* 수동 그룹 추가 — 그 카테고리에 미배정 항목이 있을 때만. */}
      <View style={styles.chipWrap}>
        {(['ALCOHOL', 'NON_ALCOHOL'] as const).map(
          (cat) =>
            ungroupedOf(cat).length > 0 && (
              <Pressable
                key={cat}
                accessibilityRole="button"
                onPress={() => handleAddGroup(cat)}
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
                  + {CATEGORY_LABEL[cat]} 그룹 추가
                </Text>
              </Pressable>
            ),
        )}
      </View>
    </View>
  );
};

// 그룹 카드 — 라벨/풀/모드/항목 칩 + 멤버(참석자) 리스트까지 한 카드.
// 웹은 멤버 입력을 매트릭스로 분리하지만 앱은 세로 폭이 자원이라 합친다.
const GroupCard = ({
  round,
  participants,
  group,
  theme,
}: Props & { group: DraftItemGroup; theme: Theme }) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const updateGroupSplit = useSettlementDraftStore((s) => s.updateGroupSplit);
  const removeGroupSplit = useSettlementDraftStore((s) => s.removeGroupSplit);

  const itemsInGroup = group.itemClientIds
    .map((id) => round.items.find((it) => it.clientId === id))
    .filter((it): it is DraftItem => Boolean(it));
  const pool = itemsInGroup.reduce((sum, it) => sum + it.amount, 0);

  // 같은 카테고리의 모든 항목 — 칩 토글로 그룹에 넣고 뺀다.
  const categoryItems = round.items.filter((it) => it.category === group.category);
  const otherGroups = (round.groupSplits ?? []).filter(
    (g) => g.clientId !== group.clientId,
  );

  const toggleItem = (itemClientId: string) => {
    if (group.itemClientIds.includes(itemClientId)) {
      updateGroupSplit(round.clientId, group.clientId, {
        itemClientIds: group.itemClientIds.filter((id) => id !== itemClientId),
      });
      return;
    }
    // 다른 그룹에 있던 항목이면 옮긴다 — 항목은 최대 1개 그룹. 옮긴 뒤 빈
    // 그룹이 되면 그 그룹은 제거.
    const from = otherGroups.find((g) => g.itemClientIds.includes(itemClientId));
    if (from) {
      const rest = from.itemClientIds.filter((id) => id !== itemClientId);
      if (rest.length === 0) removeGroupSplit(round.clientId, from.clientId);
      else updateGroupSplit(round.clientId, from.clientId, { itemClientIds: rest });
    }
    updateGroupSplit(round.clientId, group.clientId, {
      itemClientIds: [...group.itemClientIds, itemClientId],
    });
  };

  const setMode = (mode: DraftItemGroup['mode']) => {
    if (mode === group.mode) return;
    // 잔수 → 균등 전환 시 0잔 멤버는 뺀다 — 0잔(분담 0)이던 사람이 균등에서
    // 갑자기 부담하게 되는 깜짝을 막는다.
    if (mode === 'EQUAL') {
      updateGroupSplit(round.clientId, group.clientId, {
        mode,
        members: group.members.filter((m) => m.glasses > 0),
      });
      return;
    }
    updateGroupSplit(round.clientId, group.clientId, { mode });
  };

  const attendees = participants.filter(
    (p) =>
      round.attendances.find((a) => a.participantClientId === p.clientId)
        ?.attended,
  );
  const memberOf = (participantClientId: string) =>
    group.members.find((m) => m.participantClientId === participantClientId);

  const toggleMember = (participantClientId: string) => {
    const members = memberOf(participantClientId)
      ? group.members.filter((m) => m.participantClientId !== participantClientId)
      : [...group.members, { participantClientId, glasses: 1 }];
    updateGroupSplit(round.clientId, group.clientId, { members });
  };

  const setGlasses = (participantClientId: string, glasses: number) => {
    const members = memberOf(participantClientId)
      ? group.members.map((m) =>
          m.participantClientId === participantClientId ? { ...m, glasses } : m,
        )
      : [...group.members, { participantClientId, glasses }];
    updateGroupSplit(round.clientId, group.clientId, { members });
  };

  const fallback = labelFallback(group.category);
  const candidates = attendees.filter((p) =>
    isEligibleGroupMember(round, participants, p.clientId, group.category),
  );
  const hasIneligible = candidates.length < attendees.length;

  // 캡션 — 균등은 제외자 명시, 잔수는 잔당 금액. 비정상 상태는 경고로.
  let caption: { text: string; warn: boolean } | null = null;
  if (pool > 0) {
    if (group.mode === 'EQUAL') {
      const included = candidates.filter((p) => memberOf(p.clientId));
      const excluded = candidates.filter((p) => !memberOf(p.clientId));
      caption =
        included.length === 0
          ? { text: `멤버가 없어 ${fallback} 전체 균등으로 계산됩니다.`, warn: true }
          : {
              text:
                `${included.length}명 균등 · 인당 약 ${Math.floor(pool / included.length).toLocaleString('ko-KR')}원` +
                (excluded.length > 0
                  ? ` · ${excluded
                      .map((p) => participantLabel(p, participants.indexOf(p)))
                      .join('·')} 빠짐`
                  : ''),
              warn: false,
            };
    } else {
      const totalGlasses = candidates.reduce(
        (sum, p) => sum + (memberOf(p.clientId)?.glasses ?? 0),
        0,
      );
      caption =
        totalGlasses === 0
          ? { text: '잔수가 모두 0 — 그룹 멤버끼리 균등으로 계산됩니다.', warn: true }
          : {
              text: `총 ${totalGlasses}잔 · 1잔 약 ${Math.floor(pool / totalGlasses).toLocaleString('ko-KR')}원`,
              warn: false,
            };
    }
  }

  return (
    <View
      style={[
        styles.groupCard,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      {/* 라벨 + 풀 금액 + 모드 토글 + 삭제 */}
      <View style={styles.groupHeader}>
        <TextInput
          value={group.label}
          onChangeText={(text) =>
            updateGroupSplit(round.clientId, group.clientId, { label: text })
          }
          placeholder={fallback}
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="그룹 이름"
          style={[
            styles.labelInput,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
              color: theme.colors.text,
            },
          ]}
        />
        <Text style={[styles.poolText, { color: theme.colors.textMuted }]}>
          {pool.toLocaleString('ko-KR')}원
        </Text>
        <View style={{ flexDirection: 'row', marginLeft: 'auto', gap: 4 }}>
          {(['EQUAL', 'GLASSES'] as const).map((m) => {
            const sel = group.mode === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                onPress={() => setMode(m)}
                style={({ pressed }) => [
                  styles.modeChip,
                  {
                    borderColor: sel ? theme.colors.primary : theme.colors.border,
                    backgroundColor: sel
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
                    color: sel ? theme.colors.primaryText : theme.colors.text,
                  }}
                >
                  {m === 'EQUAL' ? '균등' : '잔수'}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="그룹 삭제"
            onPress={() => removeGroupSplit(round.clientId, group.clientId)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.removeBtn,
              {
                backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
              },
            ]}
          >
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* 항목 칩 — 같은 카테고리 항목 전체. ✓ = 이 그룹. 다른 그룹 항목을
          누르면 이쪽으로 옮겨온다. */}
      <View style={styles.chipWrap}>
        {categoryItems.map((it) => {
          const inThis = group.itemClientIds.includes(it.clientId);
          const inOther = otherGroups.some((g) =>
            g.itemClientIds.includes(it.clientId),
          );
          return (
            <Pressable
              key={it.clientId}
              accessibilityRole="button"
              accessibilityState={{ selected: inThis }}
              onPress={() => toggleItem(it.clientId)}
              style={({ pressed }) => [
                styles.itemChip,
                {
                  borderColor: inThis ? theme.colors.primary : theme.colors.border,
                  backgroundColor: pressed
                    ? theme.colors.surfaceAlt
                    : 'transparent',
                  opacity: inOther && !inThis ? 0.55 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: inThis ? theme.colors.text : theme.colors.textMuted,
                }}
                numberOfLines={1}
              >
                {inThis ? '✓ ' : ''}
                {it.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {itemsInGroup.length === 0 && (
        <Text style={[styles.captionText, { color: warnColor(theme) }]}>
          항목을 선택하세요 — 비어 있는 그룹은 저장 시 무시됩니다.
        </Text>
      )}

      {/* 멤버 — 참석자 세로 리스트. 균등=행 탭 토글, 잔수=행 우측 스테퍼. */}
      <View style={{ gap: 0 }}>
        {attendees.map((p, idx) => {
          const ok = isEligibleGroupMember(
            round,
            participants,
            p.clientId,
            group.category,
          );
          const name = participantLabel(p, participants.indexOf(p));
          const rowBorder =
            idx === 0
              ? {}
              : {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                };
          if (!ok) {
            return (
              <View key={p.clientId} style={[styles.memberRow, rowBorder]}>
                <Text
                  style={[styles.memberName, { color: theme.colors.textMuted, opacity: 0.5 }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.textMuted, opacity: 0.5 }}>
                  —
                </Text>
              </View>
            );
          }
          if (group.mode === 'EQUAL') {
            const checked = Boolean(memberOf(p.clientId));
            return (
              <Pressable
                key={p.clientId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={`${name} ${group.label || fallback} 마심`}
                onPress={() => toggleMember(p.clientId)}
                style={({ pressed }) => [
                  styles.memberRow,
                  rowBorder,
                  { backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.memberName,
                    { color: checked ? theme.colors.text : theme.colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                <View
                  style={[
                    styles.checkBox,
                    {
                      borderColor: checked
                        ? theme.colors.primary
                        : theme.colors.border,
                      backgroundColor: checked
                        ? theme.colors.primary
                        : 'transparent',
                    },
                  ]}
                >
                  {checked && (
                    <Text style={{ fontSize: 11, color: theme.colors.primaryText }}>
                      ✓
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }
          const glasses = memberOf(p.clientId)?.glasses ?? 0;
          return (
            <View key={p.clientId} style={[styles.memberRow, rowBorder]}>
              <Text
                style={[
                  styles.memberName,
                  {
                    color: glasses > 0 ? theme.colors.text : theme.colors.textMuted,
                  },
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="잔수 줄이기"
                  disabled={glasses <= 0}
                  onPress={() => setGlasses(p.clientId, Math.max(0, glasses - 1))}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                      opacity: glasses <= 0 ? 0.3 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.stepBtnText, { color: theme.colors.text }]}>
                    −
                  </Text>
                </Pressable>
                <Text
                  style={[
                    styles.glassValue,
                    {
                      color:
                        glasses > 0 ? theme.colors.text : theme.colors.textMuted,
                      opacity: glasses > 0 ? 1 : 0.5,
                    },
                  ]}
                >
                  {glasses}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="잔수 늘리기"
                  onPress={() => setGlasses(p.clientId, Math.min(99, glasses + 1))}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: pressed
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.stepBtnText, { color: theme.colors.text }]}>
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {hasIneligible && (
        <Text style={[styles.captionText, { color: theme.colors.textMuted }]}>
          — 표시는 {fallback} 안 하는 사람 · &apos;차수 특이사항&apos;에서 바꿀 수
          있어요
        </Text>
      )}
      {caption && (
        <Text
          style={[
            styles.captionText,
            { color: caption.warn ? warnColor(theme) : theme.colors.textMuted },
          ]}
        >
          {caption.text}
        </Text>
      )}
    </View>
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    label: { fontSize: 12, fontWeight: '500' },
    hint: { fontSize: 11, lineHeight: 16 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    summaryChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    summaryChipText: { fontSize: 11 },
    primaryBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
    },
    primaryBtnText: { fontSize: 12, fontWeight: '600' },
    addBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    addBtnText: { fontSize: 12, fontWeight: '500' },
    groupCard: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 8,
    },
    groupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    labelInput: {
      width: 88,
      height: 32,
      paddingHorizontal: 8,
      paddingVertical: 0,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      fontSize: 12,
      fontWeight: '500',
    },
    poolText: { fontSize: 12 },
    modeChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    removeBtn: {
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemChip: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      maxWidth: '100%',
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 7,
      minHeight: 40,
    },
    memberName: { fontSize: 13, flex: 1, minWidth: 0 },
    checkBox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: 6,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: { fontSize: 15, fontWeight: '500' },
    glassValue: {
      width: 26,
      textAlign: 'center',
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    captionText: { fontSize: 11, lineHeight: 15 },
  });
