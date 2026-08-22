import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SegmentedControl, useTheme } from '@repo/shared';
import { AIR_FORECAST_CODES, type AirForecastCodeType, type AirForecastItemType, type AirForecastResultType } from '@repo/api-contract';
import { relativeDayLabel, sortAirRegions } from '@repo/utils';
import { airGradeColorFromText } from '~/lib/airGradeColor';
import { AirGradeBadge } from './AirPrimitives';

// 대기질 예보통보 — 항목(PM10/PM2.5/O3) 세그먼트 → 발표 시각 칩 → 대상일(오늘/내일/모레)별 19권역
// 등급 칩 묶음 + 예보개황/발생원인/행동요령(접힘) + 예측모델 이미지(가로 스크롤, 탭하면 원본).
// 웹 AirForecastSection 의 권역×대상일 표를 모바일 폭에 맞게 "대상일 → 권역 칩" 으로 접었다.

const CODE_LABEL: Record<AirForecastCodeType, string> = { PM10: 'PM10', PM25: 'PM2.5', O3: '오존' };

interface Props {
  data: AirForecastResultType;
  code: AirForecastCodeType;
  onCode: (c: AirForecastCodeType) => void;
  todayYmd: string;
}

export const AirForecastCard = ({ data, code, onCode, todayYmd }: Props) => {
  const theme = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const items = data.items.filter((i) => i.code === code);
  const announcements = [...new Set(items.map((i) => i.announced))];
  const announced = picked && announcements.includes(picked) ? picked : (announcements[0] ?? null);
  const current: AirForecastItemType[] = items
    .filter((i) => i.announced === announced)
    .sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0));

  const segment = (
    <SegmentedControl
      value={code}
      options={AIR_FORECAST_CODES.map((c) => ({ value: c, label: CODE_LABEL[c] }))}
      onChange={onCode}
    />
  );

  if (current.length === 0) {
    return (
      <View style={styles.wrap}>
        {segment}
        <Text style={[styles.empty, { color: theme.colors.textMuted }]}>{data.date} 통보분에 이 항목의 예보가 없습니다.</Text>
      </View>
    );
  }

  const texts = current.map((it) => ({ targetDate: it.targetDate, overall: it.overall, cause: it.cause, actionKnack: it.actionKnack }));
  const uniqueTexts = texts.filter((t, i) => texts.findIndex((u) => u.overall === t.overall && u.cause === t.cause && u.actionKnack === t.actionKnack) === i);
  const imgMap = new Map<string, AirForecastItemType['images'][number]>();
  for (const it of current) for (const img of it.images) imgMap.set(img.url, img);
  const images = [...imgMap.values()];

  return (
    <View style={styles.wrap}>
      {segment}
      <View style={styles.annRow}>
        <Text style={[styles.annLabel, { color: theme.colors.textMuted }]}>발표</Text>
        {announcements.map((a) => {
          const active = a === announced;
          return (
            <Pressable
              key={a}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPicked(a)}
              style={[styles.chip, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' }]}
            >
              <Text style={[styles.chipText, { color: active ? theme.colors.primaryText : theme.colors.textMuted }]}>{a.replace(/^\d{4}-/, '')}</Text>
            </Pressable>
          );
        })}
      </View>
      {current.map((it) => {
        const regions = sortAirRegions(it.grades.map((g) => ({ region: g.region, grade: g.grade })));
        return (
          <View key={it.targetDate} style={styles.day}>
            <Text style={[styles.dayHead, { color: theme.colors.text }]}>
              {relativeDayLabel(it.targetDate, todayYmd)}
              <Text style={[styles.dayDate, { color: theme.colors.textMuted }]}>  {it.targetDate.slice(5).replace('-', '/')}</Text>
            </Text>
            <View style={styles.regionWrap}>
              {regions.map((r) => {
                const c = airGradeColorFromText(r.grade);
                return (
                  <View key={r.region} style={[styles.regionChip, { backgroundColor: c.tint }]}>
                    <View style={[styles.regionDot, { backgroundColor: c.hex }]} />
                    <Text style={[styles.regionText, { color: theme.colors.text }]}>
                      {r.region} <Text style={{ fontWeight: '600' }}>{r.grade}</Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showText }} onPress={() => setShowText((v) => !v)} style={styles.textToggle}>
        <Text style={[styles.textToggleLabel, { color: theme.colors.primary }]}>{showText ? '예보 원문 접기' : '예보개황 · 발생원인 · 행동요령 보기'}</Text>
      </Pressable>
      {showText &&
        uniqueTexts.map((t, i) => (
          <View key={`${t.targetDate}-${i}`} style={[styles.textBox, { backgroundColor: theme.colors.surfaceAlt }]}>
            {uniqueTexts.length > 1 && <Text style={[styles.textHead, { color: theme.colors.textMuted }]}>{relativeDayLabel(t.targetDate, todayYmd)} {t.targetDate}</Text>}
            <TextRow label="예보개황" text={t.overall} />
            <TextRow label="발생원인" text={t.cause} />
            <TextRow label="행동요령" text={t.actionKnack} emptyText="이번 발표에는 행동요령이 없습니다." />
          </View>
        ))}
      {images.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[styles.annLabel, { color: theme.colors.textMuted }]}>예측모델 이미지 {images.length}장 — 탭하면 원본(airkorea.or.kr)을 엽니다.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {images.map((img) => (
              <Pressable key={img.url} accessibilityRole="link" onPress={() => Linking.openURL(img.url).catch(() => {})} style={[styles.img, { borderColor: theme.colors.border }]}>
                <Image source={{ uri: img.url }} style={styles.imgPic} resizeMode="cover" accessibilityLabel={`${img.pollutant ?? '대기질'} 예측모델 ${img.animated ? '애니메이션' : (img.at ?? '')}`} />
                <Text style={[styles.imgCap, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {img.pollutant ?? '-'} {img.animated ? '애니메이션' : img.at}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={styles.legend}>
        {['좋음', '보통', '나쁨', '매우나쁨'].map((g) => (
          <AirGradeBadge key={g} text={g} />
        ))}
      </View>
    </View>
  );
};

const TextRow = ({ label, text, emptyText }: { label: string; text: string | null; emptyText?: string }) => {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[styles.textLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.textBody, { color: text ? theme.colors.text : theme.colors.textMuted }]}>{text ?? emptyText ?? '-'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  annRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  annLabel: { fontSize: 11 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '500' },
  day: { gap: 6 },
  dayHead: { fontSize: 13, fontWeight: '700' },
  dayDate: { fontSize: 11, fontWeight: '400' },
  regionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  regionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  regionDot: { width: 6, height: 6, borderRadius: 3 },
  regionText: { fontSize: 11 },
  textToggle: { paddingVertical: 4 },
  textToggleLabel: { fontSize: 12, fontWeight: '600' },
  textBox: { borderRadius: 8, padding: 10, gap: 8 },
  textHead: { fontSize: 11, fontWeight: '600' },
  textLabel: { fontSize: 11, fontWeight: '600' },
  textBody: { fontSize: 12, lineHeight: 18 },
  img: { width: 176, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 4, gap: 3 },
  imgPic: { width: '100%', aspectRatio: 4 / 3, borderRadius: 4, backgroundColor: 'rgba(127,127,127,0.15)' },
  imgCap: { fontSize: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
