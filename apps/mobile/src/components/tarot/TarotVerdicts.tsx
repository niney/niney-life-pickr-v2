import { StyleSheet, Text, View } from 'react-native';
import type { TarotChoicesType, TarotChoiceVerdictType, TarotMenuVerdictType } from '@repo/api-contract';
import { Body, Caption, Icon, Muted, SerifTitle, Tag } from './tarotUi';
import { TR, coral, gold, ink } from './tarotTokens';

// 풀이 끝의 판정 상자 — 메뉴 타로(카드가 고른 한 끼 + 대안 둘 + 입맛·피할 것)와 선택 타로(A/B 판정).
// 웹 TarotMenuBox·TarotOverlay 의 선택 상자와 같은 구성. 풀이 패널·기록 상세가 같이 쓴다.

const Meta = ({ pick }: { pick: TarotMenuVerdictType['picks'][number] }) => (
  <View style={s.meta}>
    <Tag>{pick.cuisine}</Tag>
    <Tag>{pick.dishType}</Tag>
    {pick.kcal !== null ? <Tag>약 {pick.kcal} kcal</Tag> : null}
  </View>
);

/** 메뉴 타로 — pending 이면 후보는 이미 확정(카드로 결정적)이라 보여 주되 이유는 비워 둔다. */
export const TarotMenuBox = ({ menu, pending = false }: { menu: TarotMenuVerdictType; pending?: boolean }) => {
  const [first, ...rest] = menu.picks;
  if (!first) return null;
  return (
    <View style={s.box} testID="tarot-menu-box">
      <View style={s.head}>
        <Icon name="silverware-fork-knife" size={13} />
        <Caption>카드가 고른 오늘의 한 끼</Caption>
      </View>
      <SerifTitle size={24} style={{ marginTop: 2 }}>
        {first.name}
      </SerifTitle>
      <Meta pick={first} />
      {first.reason ? <Body style={{ marginTop: 4 }}>{first.reason}</Body> : pending ? <Muted style={{ marginTop: 4 }}>카드 근거 이유는 AI 해석이 오면 채워져요.</Muted> : null}
      {rest.length > 0 ? (
        <View style={s.section}>
          <Caption>이것도 괜찮아요</Caption>
          {rest.map((p) => (
            <View key={p.menuId} style={{ gap: 2 }}>
              <View style={s.altRow}>
                <Text style={s.altName}>{p.name}</Text>
                <Meta pick={p} />
              </View>
              {p.reason ? <Body size={12} dim={0.8}>{p.reason}</Body> : null}
            </View>
          ))}
        </View>
      ) : null}
      <View style={s.section}>
        <View style={s.def}>
          <Text style={[s.term, { color: TR.gold }]}>오늘의 입맛</Text>
          <Muted size={11} dim={0.8} style={{ flex: 1 }}>{menu.profile}</Muted>
        </View>
        <View style={s.def}>
          <Text style={[s.term, { color: coral(1) }]}>피할 것</Text>
          <Muted size={11} dim={0.8} style={{ flex: 1 }}>{menu.avoid}</Muted>
        </View>
      </View>
    </View>
  );
};

const CONFIDENCE = { high: '높음', mid: '보통', low: '낮음' } as const;

/** 선택 타로 — 카드의 선택(A·B·어느 쪽이든)과 확신·이유. */
export const TarotChoiceBox = ({ choice, choices }: { choice: TarotChoiceVerdictType; choices: TarotChoicesType }) => (
  <View style={s.box}>
    <Caption>카드의 선택</Caption>
    <Text style={s.choice}>
      {choice.recommended === 'either' ? '어느 쪽이든' : `${choice.recommended} · ${choice.recommended === 'A' ? choices.a : choices.b}`}
      <Text style={s.confidence}>{`  확신 ${CONFIDENCE[choice.confidence]}`}</Text>
    </Text>
    <Body style={{ marginTop: 2 }}>{choice.reason}</Body>
  </View>
);

const s = StyleSheet.create({
  box: { borderRadius: 14, borderWidth: 1, borderColor: gold(0.4), backgroundColor: gold(0.1), padding: 12, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  section: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: gold(0.3), gap: 6 },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  altName: { fontSize: 14, fontWeight: '600', color: TR.cream },
  def: { flexDirection: 'row', gap: 8 },
  term: { fontSize: 11, width: 62 },
  choice: { fontSize: 15, fontWeight: '600', color: TR.cream, marginTop: 2 },
  confidence: { fontSize: 11, fontWeight: '400', color: ink(0.6) },
});
