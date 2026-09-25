import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { SajuAskResultType, SajuAskTopicType, SajuAskWhenType, SajuBirthInputType, SajuProfileType } from '@repo/api-contract';
import { SAJU_ASK_QUESTION_MAX_LENGTH } from '@repo/api-contract';
import { SAJU_SOURCE_LABEL, useAuthStore, useSajuAsk, useSajuProfileStore, useSajuProfiles } from '@repo/shared';
import { SAJU_ASK_TOPIC_META, SAJU_ASK_TOPICS, sajuAskBlockedReason, sajuAskOf, type SajuAskWindow, type SajuChart } from '@repo/utils';
import { Body, Box, Caption, Icon, Muted, Para, Pill, PrimaryButton, SegButton, Stars5, TextButton, Wrap } from './sajuUi';
import { SERIF, SJ, gold, ink, salmon, white } from './sajuTokens';

// 사주에 묻기 — "만약에 이랬다면"(웹 SajuAsk 와 같은 구성). 주제 칩 + 시점 + 자유 텍스트(선택) + 상대(결혼·고백, 선택).
// 계산(시점 점수·판정·대안·근거)은 utils 로 즉시 그리고, "물어보기" 를 누르면 서버가 같은 계산 위에 LLM 답을 얹는다.
// 답할 수 없는 주제(건강·법률·사행성)는 여기서 먼저 막고 서버도 막는다. "타로로도 보기" 는 앱 타로 화면에 질문·주제를 넘긴다.

const VERDICT_TONE = {
  good: { border: gold(0.6), color: SJ.gold },
  ok: { border: white(0.25), color: ink(0.8) },
  careful: { border: salmon(0.5), color: SJ.salmon },
} as const;

const WindowRow = ({ w, current }: { w: SajuAskWindow; current?: boolean }) => (
  <View style={[styles.window, current ? { borderColor: gold(0.6), backgroundColor: gold(0.1) } : null]}>
    <View style={styles.inline}>
      <Text style={{ fontFamily: SERIF, fontSize: 12, color: SJ.cream }}>{w.label}</Text>
      <Muted dim={0.6}>{w.score}점</Muted>
      <Stars5 n={w.stars} />
    </View>
    <Muted dim={0.6}>{w.reasons.join(' · ')}</Muted>
  </View>
);

const todayIso = (): string => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
type WhenKind = SajuAskWhenType['kind'];
const WHEN_LABEL: Record<WhenKind, string> = { 'this-month': '이번 달', 'this-year': '올해', year: '연도', date: '날짜' };

/** 숫자만 받아 YYYY-MM-DD 로 대시를 끼운다. */
const formatDate = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

export const SajuAskBox = ({ birth, chart }: { birth: SajuBirthInputType; chart: SajuChart }) => {
  const isMember = useAuthStore((s) => !!s.token);
  const localProfiles = useSajuProfileStore((s) => s.profiles);
  const serverProfiles = useSajuProfiles();
  const profiles: Array<{ id: string; label: string; birth: SajuBirthInputType }> = isMember
    ? (serverProfiles.data?.items ?? []).map((p: SajuProfileType) => ({ id: p.id, label: p.label, birth: p.birth }))
    : localProfiles.map((p) => ({ id: p.id, label: p.label, birth: p.birth }));

  const [topic, setTopic] = useState<SajuAskTopicType>('job-change');
  const [whenKind, setWhenKind] = useState<WhenKind>('this-year');
  const [yearText, setYearText] = useState(String(chart.asOf.year + 1));
  const [date, setDate] = useState(todayIso);
  const [question, setQuestion] = useState('');
  const [partner, setPartner] = useState<{ id: string; label: string; birth: SajuBirthInputType } | null>(null);
  const ask = useSajuAsk();

  const year = Number(yearText);
  const meta = SAJU_ASK_TOPIC_META[topic];
  const needsPartner = topic === 'marriage' || topic === 'confess';
  const validYear = Number.isInteger(year) && year >= chart.asOf.year && year <= 2050;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const when: SajuAskWhenType =
    whenKind === 'year' ? { kind: 'year', year: validYear ? year : chart.asOf.year } : whenKind === 'date' ? { kind: 'date', date: validDate ? date : todayIso() } : { kind: whenKind };
  // 계산은 렌더 중 즉시 — 서버 답과 같은 함수.
  const facts = sajuAskOf(chart, { topic, when });
  const blocked = sajuAskBlockedReason(question);
  const result: SajuAskResultType | null = ask.data ?? null;
  const tarotQ = question.trim() || `${meta.ko} — ${facts.whenKo}에 하면 어떨까`;

  const submit = () => {
    if (blocked) return;
    ask.mutate({ birth, topic, when, question: question.trim(), ...(needsPartner && partner ? { partner: partner.birth, partnerLabel: partner.label } : {}) });
  };
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    ask.reset();
  };

  return (
    <View style={styles.col} testID="saju-ask">
      <View style={styles.inline}>
        <Icon name="comment-question-outline" size={17} />
        <Text style={styles.headline}>만약에 이랬다면 — 사주에 묻기</Text>
      </View>
      <Muted>주제와 시점을 고르면 내 사주에 대 본 점수와 근거가 바로 나와요. 상황을 적고 물어보면 AI 가 그 위에 답을 써요.</Muted>

      <Wrap gap={6}>
        {SAJU_ASK_TOPICS.map((t) => (
          <SegButton key={t} round label={SAJU_ASK_TOPIC_META[t].ko} active={topic === t} onPress={() => change(setTopic)(t)} accessibilityLabel={`주제 ${SAJU_ASK_TOPIC_META[t].ko}`} />
        ))}
      </Wrap>

      <Wrap gap={6} style={{ alignItems: 'center' }}>
        {(Object.keys(WHEN_LABEL) as WhenKind[]).map((k) => (
          <SegButton key={k} round label={WHEN_LABEL[k]} active={whenKind === k} onPress={() => change(setWhenKind)(k)} accessibilityLabel={`시점 ${WHEN_LABEL[k]}`} />
        ))}
        {whenKind === 'year' ? (
          <TextInput
            accessibilityLabel="연도"
            value={yearText}
            onChangeText={(t) => change(setYearText)(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            style={[styles.field, { width: 80 }, !validYear && { borderColor: salmon(0.6) }]}
            placeholderTextColor={ink(0.3)}
          />
        ) : null}
        {whenKind === 'date' ? (
          <TextInput
            accessibilityLabel="날짜"
            value={date}
            onChangeText={(t) => change(setDate)(formatDate(t))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="2026-10-01"
            style={[styles.field, { width: 120 }, !validDate && { borderColor: salmon(0.6) }]}
            placeholderTextColor={ink(0.3)}
          />
        ) : null}
      </Wrap>

      {needsPartner ? (
        <Wrap gap={6} style={{ alignItems: 'center' }}>
          <Muted dim={0.6}>상대(선택)</Muted>
          <SegButton round label="없이" active={partner === null} onPress={() => change(setPartner)(null)} />
          {profiles.map((p) => (
            <SegButton key={p.id} round label={p.label} active={partner?.id === p.id} onPress={() => change(setPartner)(p)} />
          ))}
          {profiles.length === 0 ? <Muted dim={0.4}>저장된 사주가 있으면 궁합 점수를 근거에 더해요</Muted> : null}
        </Wrap>
      ) : null}

      <TextInput
        accessibilityLabel="질문"
        value={question}
        maxLength={SAJU_ASK_QUESTION_MAX_LENGTH}
        multiline
        placeholder={`예) ${meta.hint} — 지금 상황을 한두 줄로`}
        placeholderTextColor={ink(0.3)}
        onChangeText={change(setQuestion)}
        style={[styles.field, styles.textarea]}
      />
      {blocked ? <Para style={{ fontSize: 11, lineHeight: 16, color: SJ.salmon }}>{blocked} 주제는 사주로 답하지 않아요. 몸·법·돈의 확률은 전문가와 상의하는 게 맞아요.</Para> : null}

      {/* 계산 근거 — 즉시 */}
      <Box accessibilityLabel="계산 근거">
        <View style={styles.inline}>
          <Pill border={VERDICT_TONE[facts.verdict].border} color={VERDICT_TONE[facts.verdict].color}>
            {facts.verdictKo}
          </Pill>
          <Muted size={12} dim={0.7}>
            {meta.ko} · {facts.whenKo}
          </Muted>
        </View>
        <WindowRow w={facts.window} current />
        {facts.alternatives.length > 0 ? (
          <>
            <Caption style={{ marginTop: 4 }}>더 좋은 시점</Caption>
            {facts.alternatives.map((a) => (
              <WindowRow key={a.label} w={a} />
            ))}
          </>
        ) : null}
        <View style={{ marginTop: 4, gap: 2 }}>
          {facts.basis.map((b) => (
            <Muted key={b} dim={0.65}>
              · {b}
            </Muted>
          ))}
          <Muted dim={0.65}>· {facts.luckNote}</Muted>
        </View>
      </Box>

      <PrimaryButton label="물어보기" icon="auto-fix" onPress={submit} busy={ask.isPending} disabled={!!blocked} />
      {ask.isError ? <Text style={{ fontSize: 12, color: SJ.salmon }}>답을 불러오지 못했어요. 다시 시도해 주세요.</Text> : null}

      {result ? (
        <View style={{ gap: 8 }} testID="saju-ask-result">
          <Wrap gap={6} style={{ alignItems: 'center' }}>
            <Pill border={VERDICT_TONE[result.verdict].border} color={VERDICT_TONE[result.verdict].color}>
              {result.verdictKo}
            </Pill>
            <Pill border={result.source === 'llm' ? gold(0.6) : white(0.2)} color={result.source === 'llm' ? SJ.gold : ink(0.6)}>
              {SAJU_SOURCE_LABEL[result.source]}
            </Pill>
            {result.match ? (
              <Muted dim={0.6}>
                {result.match.label}와의 궁합 {result.match.score}점 · {result.match.gradeKo}
              </Muted>
            ) : null}
          </Wrap>
          <Body>{result.answer}</Body>
          {result.conditions.length > 0 ? (
            <Box>
              {result.conditions.map((c) => (
                <Muted key={c} size={12} dim={0.8}>
                  · {c}
                </Muted>
              ))}
            </Box>
          ) : null}
          {result.timingNote ? (
            <Muted size={12} dim={0.7}>
              {result.timingNote}
            </Muted>
          ) : null}
        </View>
      ) : null}

      <View style={styles.between}>
        <Muted>같은 질문을 카드로도 볼 수 있어요.</Muted>
        <TextButton label="타로로도 보기 →" color={SJ.gold} onPress={() => router.push({ pathname: '/tarot', params: { q: tarotQ, topic: meta.tarotTopic } })} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  col: { gap: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headline: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: SJ.cream },
  window: { borderWidth: 1, borderColor: white(0.1), borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, gap: 2 },
  field: { borderWidth: 1, borderColor: white(0.15), backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: SJ.cream },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
});
