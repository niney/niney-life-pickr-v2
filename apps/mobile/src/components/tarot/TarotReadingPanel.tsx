import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TarotChoicesType, TarotDrawnCardType, TarotReadingResultType, TarotSpreadIdType, TarotTopicType } from '@repo/api-contract';
import { tarotMenuOf, TAROT_DISCLAIMER, TAROT_SOURCE_LABEL, type TarotShareBase } from '@repo/shared';
import { getTarotCard, getTarotSpread, tarotCardKeywords, tarotCardMeaning, tarotOrientationLabel, TAROT_TOPIC_LABEL, type TarotResultStatus } from '@repo/utils';
import { TarotCardFace } from './TarotCardImage';
import { TarotShareSheet } from './TarotShareSheet';
import { TarotChoiceBox, TarotMenuBox } from './TarotVerdicts';
import { Body, Caption, ErrorText, Icon, Loading, Muted, OutlineButton, Pill, PrimaryButton, SerifTitle, Tag, TextButton, TypedText } from './tarotUi';
import { SERIF, TR, coral, gold, ink, white } from './tarotTokens';

// 해석 패널 — 웹 TarotOverlay 의 ReadingPanel(세로 화면 = 아래 시트)과 같은 구성. 첫 카드가 뒤집히면 올라와 뒤집힌 카드부터
// 채운다: 카드별(자리·이름·방향·키워드·해석) → 다 뒤집히면 "읽는 중" / 실패·다시 시도 / 종합·조언·메뉴·선택·키워드·한도.
// 결과가 오기 전엔 카드 기본 의미를 보이고, 오면 서버 해석으로 바뀐다(서버가 다른 카드를 돌려주면 — 회원 오늘의 카드 잠금 —
// 결과의 카드가 진실). 접으면 머리줄만 남아 카드가 보인다.

export interface TarotReadingPanelProps {
  spreadId: TarotSpreadIdType;
  topic: TarotTopicType;
  question: string;
  choices: TarotChoicesType | null;
  drawn: readonly TarotDrawnCardType[];
  revealed: number;
  result: TarotReadingResultType | null;
  resultStatus: TarotResultStatus;
  animate: boolean;
  /** 공유 근거 — null 이면 공유 버튼 없음(결과 미도착 등). */
  shareBase: TarotShareBase | null;
  /** 펼친 높이. */
  height: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRetry: () => void;
  onReset: () => void;
  /** 기록 다시 보기 — 닫기 버튼. */
  onClose?: () => void;
}

export const TarotReadingPanel = ({
  spreadId,
  topic,
  question,
  choices,
  drawn,
  revealed,
  result,
  resultStatus,
  animate,
  shareBase,
  height,
  collapsed,
  onToggleCollapsed,
  onRetry,
  onReset,
  onClose,
}: TarotReadingPanelProps) => {
  const insets = useSafeAreaInsets();
  const [shareOpen, setShareOpen] = useState(false);
  const spread = getTarotSpread(spreadId);
  const shown = drawn.slice(0, revealed);
  const allRevealed = revealed >= drawn.length && drawn.length > 0;
  const ready = resultStatus === 'ready' && !!result;
  const menu = tarotMenuOf(spreadId, drawn, ready ? result : null);

  return (
    <View style={[styles.panel, collapsed ? null : { height }, { paddingBottom: insets.bottom }]} accessibilityLabel="해석" testID="tarot-reading-panel">
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.meta}>
            <Text style={styles.metaText}>
              {spread?.nameKo} · {TAROT_TOPIC_LABEL[topic]}
            </Text>
            {ready ? (
              <Pill color={result.source === 'llm' ? TR.gold : ink(0.6)} border={result.source === 'llm' ? gold(0.6) : white(0.2)}>
                {TAROT_SOURCE_LABEL[result.source]}
              </Pill>
            ) : null}
          </View>
          {question ? (
            <Text style={styles.question} numberOfLines={1}>
              “{question}”
            </Text>
          ) : null}
          {choices ? (
            <Text style={styles.choices} numberOfLines={1}>
              A {choices.a} · B {choices.b}
            </Text>
          ) : null}
        </View>
        <TextButton label={collapsed ? '펼치기' : '접기'} icon={collapsed ? 'chevron-up' : 'chevron-down'} onPress={onToggleCollapsed} />
        {onClose ? <TextButton label="" icon="close" accessibilityLabel="닫기" onPress={onClose} /> : null}
      </View>

      {collapsed ? null : (
        <>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
            {shown.map((drawnCard, i) => {
              const r = ready ? result.cards[i] : undefined;
              const d = r ? { cardId: r.cardId, position: r.position, reversed: r.reversed } : drawnCard;
              const card = getTarotCard(d.cardId);
              if (!card) return null;
              const text = r?.text ?? tarotCardMeaning(card, d.reversed);
              const keywords = r?.keywords ?? tarotCardKeywords(card, d.reversed);
              const isLast = i === shown.length - 1;
              return (
                <View key={d.cardId} style={styles.card} testID="tarot-reading-card">
                  <TarotCardFace cardId={d.cardId} reversed={d.reversed} style={{ width: 58 }} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Caption>{spread?.positions[i]?.label}</Caption>
                    <View style={styles.nameRow}>
                      <Text style={styles.name}>{card.nameKo}</Text>
                      <Text style={styles.nameEn}>{card.nameEn}</Text>
                      <Pill color={d.reversed ? coral(1) : ink(0.6)} border={d.reversed ? coral(0.5) : white(0.2)}>
                        {tarotOrientationLabel(d.reversed)}
                      </Pill>
                    </View>
                    <View style={styles.tags}>
                      {keywords.map((k) => (
                        <Tag key={k}>{k}</Tag>
                      ))}
                    </View>
                    {isLast && ready ? <TypedText text={text} animate={animate} /> : <Body>{text}</Body>}
                    {!ready && resultStatus === 'pending' ? <Muted size={11} dim={0.4}>카드 기본 의미예요. AI 해석이 오면 바뀝니다.</Muted> : null}
                  </View>
                </View>
              );
            })}

            {allRevealed ? (
              <View style={styles.final}>
                {resultStatus === 'pending' ? <Loading text="카드를 읽는 중…" /> : null}
                {!ready && menu ? <TarotMenuBox menu={menu} pending /> : null}
                {resultStatus === 'failed' ? (
                  <View style={{ gap: 8 }}>
                    <ErrorText>AI 해석을 불러오지 못했어요. 위 카드 기본 의미를 참고하거나 다시 시도해 주세요.</ErrorText>
                    <OutlineButton label="다시 시도" icon="restore" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
                  </View>
                ) : null}
                {ready ? (
                  <View style={{ gap: 12 }}>
                    <View style={{ gap: 3 }}>
                      <Caption>종합</Caption>
                      <TypedText text={result.summary} animate={animate} color={TR.cream} />
                    </View>
                    <View style={{ gap: 3 }}>
                      <Caption>조언</Caption>
                      <Body>{result.advice}</Body>
                    </View>
                    {menu ? <TarotMenuBox menu={menu} /> : null}
                    {result.choice && choices ? <TarotChoiceBox choice={result.choice} choices={choices} /> : null}
                    <View style={styles.keyword}>
                      <Icon name="star-four-points" size={15} />
                      <SerifTitle size={16}>{result.keyword}</SerifTitle>
                    </View>
                    {result.quota.remainingToday !== null ? (
                      <Muted size={11} dim={0.4}>
                        오늘 AI 해석 {result.quota.remainingToday}회 남음 · 로그인하면 제한이 없어요.
                      </Muted>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            <Muted size={10} dim={0.35} style={{ marginTop: 14 }}>
              {TAROT_DISCLAIMER}
            </Muted>
          </ScrollView>

          <View style={styles.footer}>
            <PrimaryButton label={onClose ? '닫기' : '다시 뽑기'} icon={onClose ? 'close' : 'restore'} onPress={onReset} style={styles.footerButton} />
            {ready && shareBase ? <OutlineButton label="공유" icon="share-variant-outline" onPress={() => setShareOpen(true)} style={{ height: 40 }} /> : null}
          </View>
        </>
      )}
      {shareBase ? <TarotShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={shareBase} hasQuestion={!!question} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: white(0.1),
    backgroundColor: 'rgba(11,16,48,0.96)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: white(0.12) },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: ink(0.6) },
  question: { fontSize: 14, color: TR.cream },
  choices: { fontSize: 12, color: ink(0.7) },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 16 },
  card: { flexDirection: 'row', gap: 12 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  name: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: TR.cream },
  nameEn: { fontSize: 11, color: ink(0.5) },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  final: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12), paddingTop: 14, gap: 12 },
  keyword: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12) },
  footerButton: { height: 40, paddingHorizontal: 14 },
});
