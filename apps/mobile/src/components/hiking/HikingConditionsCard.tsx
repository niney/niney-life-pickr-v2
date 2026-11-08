import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { HikingConditionsType, HikingCourseDetailType } from '@repo/api-contract';
import { hikingDefaultPick, isoHm, kstHm, startMs, useHikingConditions, useTheme } from '@repo/shared';
import {
  AIR_GRADE_LABEL,
  HIKING_FIRE_LABEL,
  formatHikingDuration,
  formatHikingEle,
  hikingCautions,
  hikingDaylight,
  hikingFireInWindow,
  kmaPtyLabel,
  kmaSkyLabel,
  summarizeHikingWeather,
  type AirGradeLevel,
  type HikingDaylightStatus,
} from '@repo/utils';
import { HikingDayStartPicker, type HikingDayStart } from './HikingDayStartPicker';

// 코스 상세의 "산행 조건" 카드(앱) — 오늘·내일·모레 중 날짜와 출발 시각을 고르면 그 산행 시간대(출발 ~ 출발 + 예상 시간)로
// 날씨(가장 높은 곳 추정 기온·체감)·대기·산불위험·해 지기 전 하산을 접어 주의할 점을 한 줄씩 보인다. 웹 CourseConditions 의
// 앱 판 — 판단은 같은 @repo/utils 도우미를 쓰고, 날짜·시각은 HikingDayStartPicker(칩 + ‹ 08:00 › 스텝퍼)로 고른다.

// 예상 시간이 없는 코스(고도 없음)는 날씨만 이만큼 본다.
const FALLBACK_WINDOW_MIN = 240;

const worstGrade = (...gs: (number | null)[]): AirGradeLevel | null => {
  const v = gs.filter((g): g is number => g !== null);
  return v.length > 0 ? (Math.max(...v) as AirGradeLevel) : null;
};

// 하산 판정 칩 — 글자색은 라이트·다크를 따로, 바탕은 공용 반투명.
const STATUS_CHIP: Record<HikingDaylightStatus, { label: string; light: string; dark: string; bg: string }> = {
  ok: { label: '해 지기 전 하산', light: '#15803d', dark: '#86efac', bg: 'rgba(34,197,94,0.14)' },
  tight: { label: '일몰 직전 하산', light: '#b45309', dark: '#fcd34d', bg: 'rgba(245,158,11,0.16)' },
  dark: { label: '해 진 뒤 하산', light: '#b91c1c', dark: '#fca5a5', bg: 'rgba(239,68,68,0.14)' },
};
const WARN = { light: '#92400e', dark: '#fcd34d' };

const Row = ({ label, children }: { label: string; children: ReactNode }) => {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.colors.text }]}>{children}</Text>
    </View>
  );
};

const ConditionsBody = ({ course, data }: { course: HikingCourseDetailType; data: HikingConditionsType }) => {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const muted = { color: theme.colors.textMuted };
  // 렌더 중 Date.now() 를 부르지 않게 처음 그린 시각을 잡아 둔다(오늘 지난 시각 거르기·기본 출발).
  const [openedAt] = useState(() => Date.now());
  const [pick, setPick] = useState<HikingDayStart | null>(null);
  const days = data.days;
  const dates = days.map((d) => d.date);
  const cur = pick ?? hikingDefaultPick(dates, openedAt);
  const day = days[cur.day];
  if (!day) return null;

  const outingMin = course.roundTripMin ?? course.timeMin;
  const from = startMs(day.date, cur.startMin);
  const to = from + (outingMin ?? FALLBACK_WINDOW_MIN) * 60_000;
  const weather = data.weather ? summarizeHikingWeather(data.weather.hours, from, to) : null;
  const fire = data.fire ? hikingFireInWindow(data.fire.areas, from, to) : null;
  const forecast = data.air?.forecast.find((f) => f.date === day.date) ?? null;
  const station = cur.day === 0 ? (data.air?.station ?? null) : null;
  const airNow = station ? data.air : null;
  const airGrade = airNow ? worstGrade(airNow.pm10Grade, airNow.pm25Grade) : forecast ? worstGrade(forecast.pm10Grade, forecast.pm25Grade) : null;
  const sun = { sunrise: day.sunrise ? new Date(day.sunrise) : null, sunset: day.sunset ? new Date(day.sunset) : null };
  const daylight = outingMin !== null ? hikingDaylight(new Date(from), outingMin, sun) : null;
  const cautions = hikingCautions({ weather, fire, airGrade, daylight });
  const chip = daylight?.status ? STATUS_CHIP[daylight.status] : null;

  return (
    <>
      <HikingDayStartPicker
        dates={dates}
        value={cur}
        openedAt={openedAt}
        onChange={setPick}
        trailing={
          daylight && (
            <Text style={[styles.endAt, { color: theme.colors.text }]}>
              → <Text style={styles.strong}>{kstHm(daylight.endAt.getTime())}</Text> 하산
            </Text>
          )
        }
      />

      {daylight && (
        <View style={styles.daylight}>
          {chip && (
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Text style={[styles.chipText, { color: isDark ? chip.dark : chip.light }]}>{chip.label}</Text>
            </View>
          )}
          <Text style={[styles.small, muted]}>
            일몰 {isoHm(day.sunset)}
            {daylight.marginMin !== null && daylight.marginMin >= 0 && ` · 여유 ${formatHikingDuration(Math.max(daylight.marginMin, 5))}`}
            {daylight.latestStartAt && ` · 늦어도 ${kstHm(daylight.latestStartAt.getTime())} 출발`}
          </Text>
        </View>
      )}
      {outingMin === null && <Text style={[styles.small, muted]}>예상 시간이 없는 코스라 해 지기 전 하산은 판단하지 못했습니다(날씨는 출발 뒤 4시간).</Text>}

      {cautions.length > 0 ? (
        <View style={styles.cautions}>
          {cautions.map((c) => {
            const warn = c.level === 'warn';
            const color = warn ? (isDark ? WARN.dark : WARN.light) : theme.colors.textMuted;
            return (
              <View key={c.text} style={styles.caution}>
                <MaterialCommunityIcons name={warn ? 'alert-outline' : 'information-outline'} size={14} color={color} style={styles.cautionIcon} />
                <Text style={[styles.cautionText, { color }]}>{c.text}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        weather && <Text style={[styles.small, muted]}>고른 시간대에 비·강풍·추위·산불·미세먼지로 주의할 신호가 없습니다.</Text>
      )}

      <View style={[styles.rows, { borderTopColor: theme.colors.border }]}>
        <Row label="날씨">
          {weather ? (
            <>
              {weather.pty ? kmaPtyLabel(weather.pty) : kmaSkyLabel(weather.sky)}
              {weather.tmpMin !== null && ` · 들머리 ${weather.tmpMin === weather.tmpMax ? weather.tmpMin : `${weather.tmpMin}~${weather.tmpMax}`}°C`}
              {weather.topTmpMin !== null && data.topEle !== null && (
                <>
                  {' · '}가장 높은 곳({formatHikingEle(data.topEle)}) {weather.topTmpMin}°C
                  {weather.topChillMin !== null && weather.topChillMin < weather.topTmpMin && `(체감 ${weather.topChillMin}°C)`}
                  <Text style={muted}> 추정</Text>
                </>
              )}
              {weather.popMax !== null && ` · 강수확률 ${weather.popMax}%`}
              {weather.windMax !== null && ` · 바람 ${weather.windMax}m/s`}
            </>
          ) : (
            <Text style={muted}>{data.errors.weather ?? '고른 시간대의 단기예보가 없습니다.'}</Text>
          )}
        </Row>
        <Row label="대기">
          {airNow && station ? (
            <>
              미세먼지 {airNow.pm10Grade ? AIR_GRADE_LABEL[airNow.pm10Grade] : '—'}
              {airNow.pm10 !== null && ` ${airNow.pm10}`} · 초미세먼지 {airNow.pm25Grade ? AIR_GRADE_LABEL[airNow.pm25Grade] : '—'}
              {airNow.pm25 !== null && ` ${airNow.pm25}`}
              <Text style={muted}>
                {' '}
                지금, {station.name} 측정소({(station.distM / 1000).toFixed(0)}km)
              </Text>
            </>
          ) : forecast && data.air ? (
            <>
              예보 미세먼지 {forecast.pm10Grade ? AIR_GRADE_LABEL[forecast.pm10Grade] : '—'} · 초미세먼지 {forecast.pm25Grade ? AIR_GRADE_LABEL[forecast.pm25Grade] : '—'}
              <Text style={muted}> {data.air.regions.join('·')} 권역</Text>
            </>
          ) : (
            <Text style={muted}>{data.errors.air ?? (cur.day === 0 ? '가까운 측정소 값이 없습니다.' : '이 날의 대기 예보가 아직 없습니다.')}</Text>
          )}
        </Row>
        <Row label="산불위험">
          {fire && data.fire ? (
            <>
              {HIKING_FIRE_LABEL[fire.level]}
              {fire.level > 1 && ` ${fire.sharePct}%`}
              <Text style={muted}> {fire.level > 1 ? fire.area : data.fire.areas.map((a) => a.name).join('·')}</Text>
            </>
          ) : (
            <Text style={muted}>{data.errors.fire ?? '고른 시간대의 산불위험예보가 없습니다.'}</Text>
          )}
        </Row>
        <Row label="해">
          일출 {isoHm(day.sunrise)} · 일몰 {isoHm(day.sunset)}
        </Row>
      </View>
      <Text style={[styles.note, muted]}>
        기상청 단기예보(들머리 격자{data.weather?.base ? ` · ${Number(data.weather.base.time.slice(0, 2))}시 발표` : ''}) · 에어코리아 · 산림청 산불위험예보. 가장
        높은 곳 기온은 들머리에서 100m 오를 때마다 0.6°C 낮춘 추정이고, 산불은 시군구 면적 중 그 등급의 비율입니다.
      </Text>
    </>
  );
};

export const HikingConditionsCard = ({ course }: { course: HikingCourseDetailType }) => {
  const theme = useTheme();
  const q = useHikingConditions(course.id);
  return (
    <View style={[styles.card, { borderColor: theme.colors.border }]} accessibilityLabel="산행 조건">
      <Text style={[styles.title, { color: theme.colors.text }]}>산행 조건</Text>
      {q.data ? (
        <ConditionsBody key={course.id} course={course} data={q.data} />
      ) : (
        <Text style={[styles.small, { color: theme.colors.textMuted }]}>
          {q.isError ? '산행 조건을 불러오지 못했습니다.' : '날씨·대기·산불위험을 불러오는 중…'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 12, gap: 8, marginTop: 6 },
  title: { fontSize: 14, fontWeight: '700' },
  endAt: { fontSize: 13, fontVariant: ['tabular-nums'] },
  strong: { fontWeight: '700' },
  daylight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '700' },
  small: { fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
  cautions: { gap: 4 },
  caution: { flexDirection: 'row', gap: 6 },
  cautionIcon: { marginTop: 2 },
  cautionText: { flex: 1, fontSize: 12, lineHeight: 18 },
  rows: { gap: 5, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: 8 },
  rowLabel: { width: 52, fontSize: 12, lineHeight: 18 },
  rowValue: { flex: 1, fontSize: 12, lineHeight: 18 },
  note: { fontSize: 10, lineHeight: 15 },
});
