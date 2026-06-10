import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  effectiveExcludes,
  type ReceiptItemCategoryType,
  type SharedSettlementSessionType,
} from '@repo/api-contract';
import type { Theme } from '@repo/shared';

// 세부 분배 근거(읽기 전용) — 결과/공유 화면의 차수 카드 아래에서 "왜 내
// 주류가 더 비싸?" 를 바로 읽게 한다. 웹 RoundItemsCard 풋노트와 동일 규칙:
// 잔수 그룹은 멤버·잔수 나열, 균등 그룹은 전원 나열 대신 '빠진 사람' 명시
// (예외만 보여 한눈에 읽힌다). SettlementSessionType 도 구조적 subtyping 으로
// 그대로 전달 가능 — 결과 페이지와 공유 페이지가 같은 컴포넌트를 쓴다.

interface Props {
  round: SharedSettlementSessionType['rounds'][number];
  participants: SharedSettlementSessionType['participants'];
  theme: Theme;
}

const participantName = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

export const RoundGroupSplitNote = ({ round, participants, theme }: Props) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!round.groupSplits || round.groupSplits.length === 0) return null;

  const nameById = new Map(
    participants.map((p, idx) => [p.id, participantName(p, idx)]),
  );
  const participantById = new Map(participants.map((p) => [p.id, p]));
  // 이 차수에서 그 카테고리를 분담할 자격이 있는(참석 + 제외 아님) 참여자 id —
  // 균등 그룹의 '빠진 사람'을 역산하는 기준.
  const candidateIdsFor = (category: ReceiptItemCategoryType): string[] =>
    round.attendees
      .filter((a) => {
        if (!a.attended) return false;
        const master = participantById.get(a.participantId);
        if (!master) return false;
        const eff = effectiveExcludes(master, a);
        if (category === 'ALCOHOL') return !eff.excludeAlcohol;
        if (category === 'NON_ALCOHOL') return !eff.excludeNonAlcohol;
        if (category === 'SIDE') return !eff.excludeSide;
        return true;
      })
      .map((a) => a.participantId);

  return (
    <View style={[styles.box, { backgroundColor: theme.colors.surfaceAlt }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>세부 분배</Text>
      {round.groupSplits.map((g, gi) => {
        if (g.mode === 'GLASSES') {
          return (
            <Text key={gi} style={[styles.line, { color: theme.colors.textMuted }]}>
              {g.label}:{' '}
              {g.members
                .map((m) => `${nameById.get(m.participantId) ?? '?'} ${m.glasses}잔`)
                .join(' · ')}
            </Text>
          );
        }
        const memberIds = new Set(g.members.map((m) => m.participantId));
        const excluded = candidateIdsFor(g.category).filter(
          (id) => !memberIds.has(id),
        );
        return (
          <Text key={gi} style={[styles.line, { color: theme.colors.textMuted }]}>
            {g.label}: {g.members.length}명 균등
            {excluded.length > 0
              ? ` — ${excluded.map((id) => nameById.get(id) ?? '?').join('·')} 제외`
              : ''}
          </Text>
        );
      })}
    </View>
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    box: {
      padding: 8,
      borderRadius: 8,
      gap: 2,
    },
    title: { fontSize: 11, fontWeight: '600' },
    line: { fontSize: 11, lineHeight: 16 },
  });
