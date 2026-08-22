import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { kmaIsDaytimeHour, type KmaConditionKey } from '@repo/utils';

// 날씨 상태(KmaConditionKey) → MaterialCommunityIcons 글리프 + 톤 색. 웹의 lucide 아이콘 표
// (apps/web weatherIcons.tsx)와 같은 규칙 — 맑음/구름많음은 시각이 있으면 해/달을 가르고(06~19시 낮
// 근사), 색은 상태를 돕는 보조 신호라 항상 라벨과 함께 쓴다. 앱 번들엔 @expo/vector-icons 가 이미
// 있어 새 의존성 없이 간다.

export type MciGlyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

const DAY: Record<KmaConditionKey, MciGlyph> = {
  clear: 'weather-sunny',
  partly: 'weather-partly-cloudy',
  cloudy: 'weather-cloudy',
  rain: 'weather-rainy',
  sleet: 'weather-snowy-rainy',
  snow: 'weather-snowy',
  shower: 'weather-pouring',
  drizzle: 'weather-rainy',
  flurry: 'weather-snowy',
  unknown: 'help-circle-outline',
};
const NIGHT: Record<KmaConditionKey, MciGlyph> = {
  ...DAY,
  clear: 'weather-night',
  partly: 'weather-night-partly-cloudy',
};

// 맑음 난색, 강수 한색, 흐림 중성(tailwind 팔레트 500/400 단계 — 라이트/다크).
const TONE: Record<KmaConditionKey, { light: string; dark: string }> = {
  clear: { light: '#f59e0b', dark: '#fbbf24' },
  partly: { light: '#0ea5e9', dark: '#38bdf8' },
  cloudy: { light: '#94a3b8', dark: '#94a3b8' },
  rain: { light: '#3b82f6', dark: '#60a5fa' },
  shower: { light: '#3b82f6', dark: '#60a5fa' },
  drizzle: { light: '#3b82f6', dark: '#60a5fa' },
  sleet: { light: '#818cf8', dark: '#a5b4fc' },
  snow: { light: '#06b6d4', dark: '#67e8f9' },
  flurry: { light: '#06b6d4', dark: '#67e8f9' },
  unknown: { light: '#71717a', dark: '#a1a1aa' },
};

export const weatherGlyph = (
  condition: KmaConditionKey,
  hour: number | null | undefined,
  mode: 'light' | 'dark',
): { name: MciGlyph; color: string } => {
  const day = hour === null || hour === undefined ? true : kmaIsDaytimeHour(hour);
  return { name: (day ? DAY : NIGHT)[condition], color: TONE[condition][mode] };
};
