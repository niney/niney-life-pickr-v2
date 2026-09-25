import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TAROT_DISCLAIMER, type TarotSession } from '@repo/shared';
import { getTarotSetupError, getTarotSpread, TAROT_AVAILABLE_SPREADS, TAROT_CHOICE_MAX_LENGTH, TAROT_QUESTION_MAX_LENGTH, TAROT_TOPIC_LABEL, TAROT_TOPICS } from '@repo/utils';
import { CheckRow, Chip, ErrorText, Glass, Icon, Muted, PrimaryButton, SerifTitle } from './tarotUi';
import { TR, gold, ink, white } from './tarotTokens';

// 설정 패널 — 웹 TarotOverlay 의 SetupPanel 과 같은 구성: 스프레드(2열) · 주제 칩(메뉴 타로는 설명) · 선택 타로 A/B ·
// 질문 · 역방향 · 카드 섞기. 회원이 오늘의 카드를 이미 뽑았으면(서버 하루 1장 잠금) 섞기 대신 그 기록으로 안내하고,
// 게스트는 이 기기의 최근 리딩 5건을 다시 볼 수 있다.

const fmtDay = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const QUESTION_PLACEHOLDER = {
  daily: '오늘의 카드는 질문 없이도 괜찮아요',
  menu: '예: 회식 메뉴, 혼밥 야식, 비 오는 날 점심',
  default: '적지 않아도 돼요. 적으면 해석이 질문에 맞춰져요.',
} as const;

export const TarotSetupPanel = ({ session, onOpenRecord, onOpenRecords }: { session: TarotSession; onOpenRecord: (id: string) => void; onOpenRecords: () => void }) => {
  const { state, send } = session;
  const error = getTarotSetupError(state);
  const todayDailyId = session.todayDailyId;
  const dailyLocked = session.isMember && state.spreadId === 'daily' && !!todayDailyId;
  const [focus, setFocus] = useState<'q' | 'a' | 'b' | null>(null);
  const placeholder = state.spreadId === 'daily' ? QUESTION_PLACEHOLDER.daily : state.spreadId === 'menu' ? QUESTION_PLACEHOLDER.menu : QUESTION_PLACEHOLDER.default;

  return (
    <Glass style={styles.panel}>
      <View style={{ gap: 3 }}>
        <SerifTitle size={18}>무엇이 궁금한가요?</SerifTitle>
        <Muted size={12} dim={0.6}>
          스프레드와 주제를 고르고, 원하면 질문을 적어 주세요.
        </Muted>
      </View>

      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="스프레드">
        {TAROT_AVAILABLE_SPREADS.map((s) => {
          const active = state.spreadId === s.id;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={s.nameKo}
              onPress={() => send({ type: 'set_spread', spreadId: s.id })}
              style={({ pressed }) => [styles.spread, active ? { borderColor: TR.gold, backgroundColor: gold(0.1) } : { borderColor: white(0.1) }, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.spreadName}>{s.nameKo}</Text>
              <Text style={styles.spreadDesc}>
                {s.positions.length}장 · {s.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.spreadId === 'menu' ? (
        <Muted size={12} dim={0.6}>
          카드의 원소(불·물·바람·땅)를 입맛으로 읽어 메뉴 세 가지를 골라 드려요. 첫 번째가 오늘의 추천.
        </Muted>
      ) : (
        <View style={styles.chips} accessibilityLabel="주제">
          {TAROT_TOPICS.filter((t) => t !== 'food').map((t) => (
            <Chip key={t} label={TAROT_TOPIC_LABEL[t]} active={state.topic === t} onPress={() => send({ type: 'set_topic', topic: t })} />
          ))}
        </View>
      )}

      {state.spreadId === 'choice' ? (
        <View style={styles.choices}>
          {(['A', 'B'] as const).map((k) => (
            <View key={k} style={{ flex: 1, gap: 4 }}>
              <Text style={styles.label}>{k}</Text>
              <TextInput
                accessibilityLabel={`선택지 ${k}`}
                value={k === 'A' ? state.choiceA : state.choiceB}
                maxLength={TAROT_CHOICE_MAX_LENGTH}
                placeholder={k === 'A' ? '예: 치킨' : '예: 피자'}
                placeholderTextColor={ink(0.3)}
                onFocus={() => setFocus(k === 'A' ? 'a' : 'b')}
                onBlur={() => setFocus(null)}
                onChangeText={(t) => send({ type: 'set_choices', a: k === 'A' ? t : state.choiceA, b: k === 'B' ? t : state.choiceB })}
                style={[styles.input, focus === (k === 'A' ? 'a' : 'b') && { borderColor: TR.gold }]}
                returnKeyType="done"
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        <Text style={styles.label}>질문</Text>
        <TextInput
          accessibilityLabel="질문"
          value={state.question}
          maxLength={TAROT_QUESTION_MAX_LENGTH}
          multiline
          placeholder={placeholder}
          placeholderTextColor={ink(0.3)}
          onFocus={() => setFocus('q')}
          onBlur={() => setFocus(null)}
          onChangeText={(t) => send({ type: 'set_question', question: t })}
          style={[styles.input, styles.question, focus === 'q' && { borderColor: TR.gold }]}
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
        />
        <Text style={styles.counter}>
          {state.question.length}/{TAROT_QUESTION_MAX_LENGTH}
        </Text>
      </View>

      <CheckRow label="역방향 카드 사용" checked={state.reversedEnabled} onChange={(v) => send({ type: 'set_reversed', enabled: v })} />

      <View style={{ gap: 6 }}>
        <PrimaryButton label="카드 섞기" icon="auto-fix" onPress={session.start} disabled={!!error || dailyLocked} />
        {error === 'choice_required' ? (
          <View style={{ alignItems: 'center' }}>
            <ErrorText>A 와 B 선택지를 모두 적어 주세요.</ErrorText>
          </View>
        ) : null}
        {dailyLocked && todayDailyId ? (
          <Text style={styles.notice}>
            오늘의 카드는 이미 뽑았어요.{' '}
            <Text style={styles.link} accessibilityRole="link" onPress={() => onOpenRecord(todayDailyId)}>
              오늘 카드 보기
            </Text>
          </Text>
        ) : null}
      </View>

      <Muted size={11} dim={0.45} style={{ textAlign: 'center' }}>
        {TAROT_DISCLAIMER}
      </Muted>
      {session.isMember ? (
        <Text style={styles.notice}>
          리딩은 자동 저장돼요 ·{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={onOpenRecords}>
            내 타로 기록
          </Text>
        </Text>
      ) : null}

      {!session.isMember && session.history.length > 0 ? (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>최근 리딩 (이 기기)</Text>
          {session.history.slice(0, 5).map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${h.result.keyword} 다시 보기`} onPress={() => session.setReview(h)} style={({ pressed }) => [styles.historyMain, pressed && { backgroundColor: white(0.05) }]}>
                <Text style={styles.historyKeyword}>{h.result.keyword}</Text>
                <Text style={styles.historySub} numberOfLines={1}>
                  {getTarotSpread(h.result.spreadId)?.nameKo} · {h.result.question || TAROT_TOPIC_LABEL[h.result.topic]}
                </Text>
                <Text style={styles.historyDate}>{fmtDay(h.createdAt)}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="기록 삭제" onPress={() => session.removeHistory(h.id)} hitSlop={8} style={{ padding: 4 }}>
                <Icon name="trash-can-outline" size={16} color={ink(0.4)} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Glass>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spread: { width: '48.5%', borderWidth: 1, borderRadius: 12, padding: 11, gap: 3 },
  spreadName: { fontSize: 14, fontWeight: '600', color: TR.cream },
  spreadDesc: { fontSize: 11, lineHeight: 15, color: ink(0.6) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choices: { flexDirection: 'row', gap: 8 },
  label: { fontSize: 12, color: ink(0.7) },
  input: { borderWidth: 1, borderColor: white(0.15), borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: TR.cream },
  question: { minHeight: 64, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 10, color: ink(0.4) },
  notice: { textAlign: 'center', fontSize: 12, lineHeight: 18, color: ink(0.65) },
  link: { color: TR.gold, textDecorationLine: 'underline' },
  history: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.15), paddingTop: 10, gap: 2 },
  historyTitle: { fontSize: 12, fontWeight: '600', color: ink(0.7), marginBottom: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 7 },
  historyKeyword: { fontSize: 12, color: TR.gold },
  historySub: { flex: 1, fontSize: 12, color: ink(0.7) },
  historyDate: { fontSize: 10, color: ink(0.4) },
});
