import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import type { WeatherAwsResultType, WeatherNowcastResultType, WeatherUltraHourType } from '@repo/api-contract';
import {
  KMA_CONDITION_LABEL,
  formatDistanceM,
  formatKmaBaseLabel,
  formatKmaTemp,
  kmaCondition,
  kmaPtyLabel,
  kmaWindDirection16,
  kmaWindStrength,
} from '@repo/utils';
import { WeatherGlyph } from './WeatherGlyph';
import { Tile } from '~/components/common/Cards';

// 지금 — 초단기실황 히어로(기온 큰 숫자 + 상태 아이콘) + 관측 타일 + 근처 AWS 관측소 한 줄 +
// 초단기예보 6시간 띠(웹 WeatherNowHero 이식, 세로 한 열). 상태 아이콘은 초단기예보 첫 시각의 하늘
// 상태 + 실황 강수형태(실황엔 하늘상태가 없다).

interface Props {
  data: WeatherNowcastResultType;
  aws?: WeatherAwsResultType | null;
}

const hourOf = (h: WeatherUltraHourType): number => Number(h.fcstTime.slice(0, 2));
const fmtHm = (iso: string | null): string => {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[1]}:${m[2]}` : '-';
};

export const WeatherNowCard = ({ data, aws }: Props) => {
  const theme = useTheme();
  const now = data.now;
  const first = data.hours[0] ?? null;
  const ncstHour = data.ncstBase ? Number(data.ncstBase.time.slice(0, 2)) : null;
  const condition = kmaCondition(first?.sky ?? null, now?.pty ?? first?.pty ?? null);
  const windDir = kmaWindDirection16(now?.wsd !== null && now?.wsd === 0 ? null : now?.vec);
  const awsItem = aws?.enabled ? (aws.items.find((i) => i.ta !== null || i.rn15m !== null || i.hm !== null) ?? aws.items[0] ?? null) : null;

  return (
    <View style={styles.wrap}>
      {now ? (
        <>
          <View style={styles.hero}>
            <WeatherGlyph condition={condition} hour={ncstHour} size={56} />
            <View style={styles.heroText}>
              <Text style={[styles.temp, { color: theme.colors.text }]}>
                {formatKmaTemp(now.t1h)}
                <Text style={[styles.tempUnit, { color: theme.colors.textMuted }]}>℃</Text>
              </Text>
              <Text style={[styles.cond, { color: theme.colors.text }]}>
                {KMA_CONDITION_LABEL[condition]}
                {now.pty !== null && now.pty > 0 ? (
                  <Text style={{ color: theme.colors.textMuted }}>  강수형태 {kmaPtyLabel(now.pty)}</Text>
                ) : null}
              </Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                {data.ncstBase ? `${formatKmaBaseLabel(data.ncstBase)} 관측` : ''} · 격자 ({data.grid.nx},{data.grid.ny})
              </Text>
            </View>
          </View>
          <View style={styles.tiles}>
            <Tile icon="umbrella" label="1시간 강수량" value={now.rn1 === null ? '-' : now.rn1 === 0 ? '없음' : `${now.rn1} mm`} />
            <Tile icon="water-percent" label="습도" value={now.reh === null ? '-' : `${now.reh}%`} />
            <Tile
              icon="weather-windy"
              label="바람"
              value={now.wsd === null ? '-' : `${windDir !== '-' ? `${windDir}풍 ` : ''}${now.wsd} m/s`}
              sub={now.wsd === null ? null : kmaWindStrength(now.wsd)}
            />
            <Tile
              icon="navigation-variant"
              label="바람 성분"
              value={now.uuu === null && now.vvv === null ? '-' : `동서 ${now.uuu ?? '-'} · 남북 ${now.vvv ?? '-'}`}
              sub="m/s"
            />
          </View>
          {awsItem && (
            <View style={[styles.aws, { borderColor: theme.colors.border }]}>
              <View style={styles.awsHead}>
                <MaterialCommunityIcons name="radio-tower" size={13} color={theme.colors.textMuted} />
                <Text style={[styles.awsTitle, { color: theme.colors.text }]}>근처 관측소(AWS) {awsItem.name}</Text>
                <Text style={[styles.awsMeta, { color: theme.colors.textMuted }]}>
                  {formatDistanceM(awsItem.dist)} · {fmtHm(awsItem.observedAt)} 관측{aws?.stale ? ' · 저장본' : ''}
                </Text>
              </View>
              {awsItem.ta !== null || awsItem.rn15m !== null || awsItem.hm !== null ? (
                <Text style={[styles.awsValues, { color: theme.colors.text }]}>
                  기온 {formatKmaTemp(awsItem.ta)}℃ · 습도 {awsItem.hm ?? '-'}% · 바람 {kmaWindDirection16(awsItem.wd10)} {awsItem.ws10 ?? '-'} m/s · 최근 15분 강수{' '}
                  {awsItem.rn15m ?? '-'} mm · 오늘 {awsItem.rnDay ?? '-'} mm
                </Text>
              ) : (
                <Text style={[styles.awsMeta, { color: theme.colors.textMuted }]}>최근 관측값이 없습니다(결측·통신 지연).</Text>
              )}
              {((awsItem.rn15m ?? 0) > 0 || awsItem.re === 1) && (now.pty === null || now.pty === 0) && (
                <Text style={styles.awsRain}>관측소가 최근 15분 강수를 감지했어요 — 정시 실황엔 아직 반영 전일 수 있습니다.</Text>
              )}
            </View>
          )}
        </>
      ) : (
        <Text style={[styles.empty, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
          이 시각의 실황이 아직 없습니다. 매시 10분 이후 갱신됩니다.
        </Text>
      )}

      {/* 앞으로 6시간 */}
      <View style={styles.sixHead}>
        <Text style={[styles.sixTitle, { color: theme.colors.text }]}>앞으로 6시간</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          {data.ultraBase ? `${formatKmaBaseLabel(data.ultraBase)} 발표` : ''}
        </Text>
      </View>
      {data.hours.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.textMuted, borderColor: theme.colors.border }]}>
          초단기예보가 아직 없습니다. 매시 45분 이후 갱신됩니다.
        </Text>
      ) : (
        <View style={[styles.six, { borderColor: theme.colors.border }]} accessibilityRole="summary" accessibilityLabel="초단기예보 6시간">
          {data.hours.map((h) => {
            const cond = kmaCondition(h.sky, h.pty);
            const wet = (h.pty !== null && h.pty > 0) || (h.pop ?? 0) >= 30;
            return (
              <View key={h.at} style={styles.sixCell}>
                <Text style={[styles.sixHour, { color: theme.colors.textMuted }]}>{hourOf(h)}시</Text>
                <WeatherGlyph condition={cond} hour={hourOf(h)} size={22} />
                <Text style={[styles.sixTemp, { color: theme.colors.text }]}>{formatKmaTemp(h.t1h)}°</Text>
                <Text style={[styles.sixPop, { color: wet ? '#3b82f6' : theme.colors.textMuted }]}>{h.pop ?? '-'}%</Text>
                {h.rn1.none ? null : (
                  <Text style={[styles.sixRain, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {h.rn1.text}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroText: { flex: 1, gap: 2 },
  temp: { fontSize: 48, fontWeight: '600', lineHeight: 54, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  tempUnit: { fontSize: 20, fontWeight: '500' },
  cond: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 11 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aws: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  awsHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  awsTitle: { fontSize: 12, fontWeight: '600' },
  awsMeta: { fontSize: 11 },
  awsValues: { fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  awsRain: { fontSize: 11, color: '#2563eb' },
  empty: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderRadius: 8, padding: 14, fontSize: 13, textAlign: 'center' },
  sixHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sixTitle: { fontSize: 13, fontWeight: '600' },
  six: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingVertical: 8 },
  sixCell: { flex: 1, alignItems: 'center', gap: 3 },
  sixHour: { fontSize: 11, fontVariant: ['tabular-nums'] },
  sixTemp: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sixPop: { fontSize: 11, fontVariant: ['tabular-nums'] },
  sixRain: { fontSize: 9 },
});
