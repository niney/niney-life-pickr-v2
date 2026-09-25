import { StyleSheet, Text, View } from 'react-native';
import type { TarotReadingResultType } from '@repo/api-contract';
import { TAROT_DISCLAIMER, TAROT_SOURCE_LABEL } from '@repo/shared';
import { getTarotSpread, tarotOrientationLabel, TAROT_TOPIC_LABEL } from '@repo/utils';
import { TarotCardFace } from './TarotCardImage';
import { TarotChoiceBox, TarotMenuBox } from './TarotVerdicts';
import { Body, Caption, Icon, Muted, Para, Pill, SerifTitle, Tag } from './tarotUi';
import { SERIF, TR, coral, gold, ink, white } from './tarotTokens';

// 완성된 리딩의 한 장짜리 보기 — 웹 TarotReadingView 와 같은 순서(내 타로 기록 상세). 카드 줄 + 카드별 해석 + 종합·조언·
// 메뉴·선택 판정·키워드.

type Reading = Pick<TarotReadingResultType, 'spreadId' | 'topic' | 'question' | 'choices' | 'source' | 'cards' | 'summary' | 'advice' | 'keyword' | 'choice' | 'menu'>;

export const TarotReadingView = ({ reading }: { reading: Reading }) => {
  const spread = getTarotSpread(reading.spreadId);
  const { choices, choice, menu } = reading;
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 4 }}>
        <View style={styles.meta}>
          <Text style={styles.metaText}>
            {spread?.nameKo} · {TAROT_TOPIC_LABEL[reading.topic]}
          </Text>
          <Pill color={reading.source === 'llm' ? TR.gold : ink(0.6)} border={reading.source === 'llm' ? gold(0.6) : white(0.2)}>
            {TAROT_SOURCE_LABEL[reading.source]}
          </Pill>
        </View>
        {reading.question ? <Para style={styles.question}>“{reading.question}”</Para> : null}
        {choices ? (
          <Text style={styles.choices}>
            A {choices.a} · B {choices.b}
          </Text>
        ) : null}
      </View>

      <View style={styles.cardRow}>
        {reading.cards.map((c) => (
          <View key={c.cardId} style={styles.figure}>
            <TarotCardFace cardId={c.cardId} reversed={c.reversed} style={{ width: '100%' }} />
            <Caption style={{ textAlign: 'center', marginTop: 4 }}>{c.positionLabel}</Caption>
            <Text style={styles.figureName}>{c.nameKo}</Text>
            <Text style={styles.figureDir}>{tarotOrientationLabel(c.reversed)}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 16 }}>
        {reading.cards.map((c) => (
          <View key={c.cardId} style={{ gap: 3 }}>
            <Caption>{c.positionLabel}</Caption>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{c.nameKo}</Text>
              <Text style={styles.nameEn}>{c.nameEn}</Text>
              <Pill color={c.reversed ? coral(1) : ink(0.6)} border={c.reversed ? coral(0.5) : white(0.2)}>
                {tarotOrientationLabel(c.reversed)}
              </Pill>
            </View>
            <View style={styles.tags}>
              {c.keywords.map((k) => (
                <Tag key={k}>{k}</Tag>
              ))}
            </View>
            <Body>{c.text}</Body>
          </View>
        ))}
      </View>

      <View style={styles.final}>
        <View style={{ gap: 3 }}>
          <Caption>종합</Caption>
          <Body color={TR.cream}>{reading.summary}</Body>
        </View>
        <View style={{ gap: 3 }}>
          <Caption>조언</Caption>
          <Body>{reading.advice}</Body>
        </View>
        {menu ? <TarotMenuBox menu={menu} /> : null}
        {choice && choices ? <TarotChoiceBox choice={choice} choices={choices} /> : null}
        <View style={styles.keyword}>
          <Icon name="star-four-points" size={15} />
          <SerifTitle size={17}>{reading.keyword}</SerifTitle>
        </View>
        <Muted size={11} dim={0.4}>
          {TAROT_DISCLAIMER}
        </Muted>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: ink(0.6) },
  question: { fontFamily: SERIF, fontSize: 17, lineHeight: 25, color: TR.cream },
  choices: { fontSize: 13, color: ink(0.7) },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  figure: { width: 96, alignItems: 'center' },
  figureName: { fontFamily: SERIF, fontSize: 13, fontWeight: '700', color: TR.cream, textAlign: 'center' },
  figureDir: { fontSize: 10, color: ink(0.55) },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  name: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: TR.cream },
  nameEn: { fontSize: 11, color: ink(0.5) },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  final: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12), paddingTop: 14, gap: 12 },
  keyword: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
