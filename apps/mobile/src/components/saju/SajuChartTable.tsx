import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SajuChartType, SajuPillarType } from '@repo/api-contract';
import { WUXING_COLOR, WUXING_TEXT_COLOR } from '@repo/shared';
import {
  SAJU_PILLAR_LABEL,
  SAJU_STRENGTH_TEXT,
  SAJU_TEN_GOD_META,
  SAJU_WUXING_META,
  branchMeta,
  sajuHiddenGodsOf,
  sajuTenGodSummary,
  stemMeta,
  type SajuChart,
  type Wuxing,
} from '@repo/utils';
import { Muted, Para, Pill, Wrap } from './sajuUi';
import { SERIF, SJ, gold, ink, salmon, white } from './sajuTokens';

// 원국 표 — 웹 SajuChartTable 과 같은 구성. 왼쪽부터 년·월·일·시(무대 인장 순서와 같다). 천간·지지는 오행 색,
// 일간(나)은 금 테두리. 아래에 오행 분포 막대·십신 구성·신살·관계·공망. compact 는 표 + 오행 막대만.

type Chart = SajuChart | SajuChartType;
type Pillar = SajuChart['pillars']['day'] | SajuPillarType;

const godKo = (g: keyof typeof SAJU_TEN_GOD_META | null): string => (g ? SAJU_TEN_GOD_META[g].ko : '나');

const Glyph = ({ hanja, ko, element, accent }: { hanja: string; ko: string; element: Wuxing; accent?: boolean }) => (
  <View style={[styles.glyph, accent ? { borderColor: SJ.gold, backgroundColor: gold(0.1) } : null]}>
    <Text style={[styles.glyphHanja, { color: WUXING_TEXT_COLOR[element] }]}>{hanja}</Text>
    <Text style={styles.glyphKo}>
      {ko}·{SAJU_WUXING_META[element].ko}
    </Text>
  </View>
);

const Row = ({ pillars, render }: { pillars: Pillar[]; render: (p: Pillar) => ReactNode }) => (
  <View style={styles.row}>
    {pillars.map((p) => (
      <View key={p.key} style={styles.cell}>
        {render(p)}
      </View>
    ))}
  </View>
);

// 십신 구성 — 어떤 기운이 많고 없는지. 그룹 5칸은 0 이면 흐리게, 아래에 많음·없음 한 줄.
const TenGodSummary = ({ chart }: { chart: Chart }) => {
  const sum = sajuTenGodSummary(chart as SajuChart);
  const elKo = (e: Wuxing) => SAJU_WUXING_META[e].ko;
  return (
    <View style={{ gap: 6 }} accessibilityLabel="십신 구성">
      <View style={styles.row}>
        {sum.groups.map((g) => (
          <View key={g.group} style={[styles.godCell, { borderColor: g.count === 0 ? white(0.05) : gold(0.25) }]}>
            <Text style={{ fontSize: 10, color: g.count === 0 ? ink(0.3) : ink(0.8) }}>{g.ko}</Text>
            <Text style={{ fontFamily: SERIF, fontSize: 14, color: g.count === 0 ? ink(0.3) : ink(0.8) }}>{g.count}</Text>
          </View>
        ))}
      </View>
      {sum.chips.length > 0 ? (
        <Wrap>
          {sum.chips.map((c) => (
            <Pill key={c.god}>
              {c.ko} {c.count}
            </Pill>
          ))}
        </Wrap>
      ) : null}
      {chart.excess.length > 0 || chart.lacking.length > 0 ? (
        <Text style={{ fontSize: 11, color: ink(0.6) }}>
          {chart.excess.length > 0 ? (
            <Text>
              넘치는 기운 <Text style={{ color: SJ.salmon }}>{chart.excess.map(elKo).join('·')}</Text>
            </Text>
          ) : null}
          {chart.excess.length > 0 && chart.lacking.length > 0 ? ' · ' : null}
          {chart.lacking.length > 0 ? (
            <Text>
              부족한 기운 <Text style={{ color: SJ.gold }}>{chart.lacking.map(elKo).join('·')}</Text>
            </Text>
          ) : null}
        </Text>
      ) : null}
      {sum.notes.length > 0 ? (
        <View style={{ gap: 2 }}>
          {sum.notes.map((n) => (
            <Muted key={n} dim={0.65}>
              · {n}
            </Muted>
          ))}
        </View>
      ) : null}
      <Para style={{ fontSize: 11, lineHeight: 17, color: ink(0.55) }} accessibilityLabel="지장간 숨은 십신">
        <Text style={{ color: gold(0.8) }}>숨은 십신(지장간) </Text>
        {sajuHiddenGodsOf(chart as SajuChart)
          .map((p) => `${SAJU_PILLAR_LABEL[p.pillar]} ${p.items.map((i) => `${i.ko}(${i.tenGodKo})`).join('·')}`)
          .join('   ')}
      </Para>
    </View>
  );
};

export const SajuChartTable = ({ chart, compact = false }: { chart: Chart; compact?: boolean }) => {
  const pillars: Pillar[] = [chart.pillars.year, chart.pillars.month, chart.pillars.day, ...(chart.pillars.hour ? [chart.pillars.hour] : [])];
  return (
    <View style={{ gap: 12 }} testID="saju-chart">
      <View style={{ gap: 5 }}>
        <Row pillars={pillars} render={(p) => <Text style={styles.pillarLabel}>{SAJU_PILLAR_LABEL[p.key]}</Text>} />
        <Row pillars={pillars} render={(p) => <Text style={styles.god}>{godKo(p.stemTenGod)}</Text>} />
        <Row
          pillars={pillars}
          render={(p) => {
            const m = stemMeta(p.stem);
            return <Glyph hanja={m.hanja} ko={m.ko} element={m.element} accent={p.key === 'day'} />;
          }}
        />
        <Row
          pillars={pillars}
          render={(p) => {
            const m = branchMeta(p.branch);
            return <Glyph hanja={m.hanja} ko={m.ko} element={m.element} />;
          }}
        />
        <Row pillars={pillars} render={(p) => <Text style={styles.god}>{godKo(p.branchTenGod)}</Text>} />
        {!compact ? <Row pillars={pillars} render={(p) => <Text style={[styles.god, { color: ink(0.45) }]}>{p.hidden.map((h) => stemMeta(h).ko).join('·')}</Text>} /> : null}
        {!compact ? (
          <Row
            pillars={pillars}
            render={(p) => (
              <Text style={styles.god}>
                {p.twelveStage}
                {p.isVoid ? <Text style={{ color: SJ.salmon }}> 공망</Text> : null}
              </Text>
            )}
          />
        ) : null}
      </View>
      {!chart.pillars.hour ? <Muted dim={0.45}>시간을 몰라 시주 없이 세 기둥으로 봤어요.</Muted> : null}

      <View style={{ gap: 4 }} accessibilityLabel="오행 분포">
        {chart.elements.map((e) => (
          <View key={e.element} style={styles.barRow}>
            <Text style={[styles.barHanja, { color: WUXING_TEXT_COLOR[e.element] }]}>{SAJU_WUXING_META[e.element].hanja}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(2, e.percent)}%`, backgroundColor: WUXING_COLOR[e.element] }]} />
            </View>
            <Text style={styles.barPct}>{e.percent}%</Text>
          </View>
        ))}
        <Text style={{ marginTop: 2, fontSize: 11, color: ink(0.6) }}>
          {SAJU_STRENGTH_TEXT[chart.strength.level].ko}({chart.strength.score}) · 보완 기운{' '}
          <Text style={{ color: WUXING_TEXT_COLOR[chart.favorable.primary] }}>{SAJU_WUXING_META[chart.favorable.primary].ko}</Text>
          {chart.favorable.secondary ? <Text style={{ color: ink(0.45) }}>, 보조 {SAJU_WUXING_META[chart.favorable.secondary].ko}</Text> : null}
        </Text>
      </View>

      {!compact ? <TenGodSummary chart={chart} /> : null}

      {!compact && (chart.stars.length > 0 || chart.relations.length > 0) ? (
        <Wrap>
          {chart.stars.map((st) => (
            <Pill key={st.id} border={st.positive ? gold(0.5) : salmon(0.4)} color={st.positive ? SJ.gold : SJ.salmon}>
              {st.ko}
            </Pill>
          ))}
          {chart.relations.map((r, i) => (
            <Pill key={`${r.type}-${i}`}>{r.label}</Pill>
          ))}
        </Wrap>
      ) : null}
      {!compact && chart.warnings.length > 0 ? (
        <View style={{ gap: 2 }}>
          {chart.warnings.map((w) => (
            <Muted key={w}>· {w}</Muted>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5 },
  cell: { flex: 1, alignItems: 'stretch' },
  pillarLabel: { textAlign: 'center', fontSize: 11, color: SJ.gold },
  god: { textAlign: 'center', fontSize: 10, color: ink(0.55) },
  glyph: { alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: white(0.1), backgroundColor: 'rgba(0,0,0,0.25)', paddingVertical: 5 },
  glyphHanja: { fontFamily: SERIF, fontSize: 26, lineHeight: 32 },
  glyphKo: { marginTop: 1, fontSize: 10, color: ink(0.7) },
  godCell: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 7, paddingVertical: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barHanja: { width: 16, fontFamily: SERIF, fontSize: 12 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: white(0.1), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barPct: { width: 36, textAlign: 'right', fontSize: 11, color: ink(0.6) },
});
