import {
  CircleHelp,
  Cloud,
  CloudDrizzle,
  CloudHail,
  CloudMoon,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { KMA_CONDITION_LABEL, kmaIsDaytimeHour, type KmaConditionKey } from '@repo/utils';
import { cn } from '~/lib/utils';

// 날씨 상태(하늘+강수형태 → KmaConditionKey) 아이콘 — lucide 선 아이콘 한 벌. 색은 상태를
// 돕는 보조 신호일 뿐이고 항상 라벨(aria-label/title 또는 옆 글자)과 함께 쓴다. 맑음/구름
// 많음은 시각이 있으면 해/달을 가른다(06~19시 낮 근사 — 일출몰 API 미연동). 아이콘 컴포넌트는
// 모듈 상수 표에서 고른다(렌더 중 컴포넌트 생성 금지 — React Compiler 규칙).

const DAY_ICONS: Record<KmaConditionKey, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  rain: CloudRain,
  sleet: CloudHail,
  snow: CloudSnow,
  shower: CloudRainWind,
  drizzle: CloudDrizzle,
  flurry: Snowflake,
  unknown: CircleHelp,
};
const NIGHT_ICONS: Record<KmaConditionKey, LucideIcon> = { ...DAY_ICONS, clear: Moon, partly: CloudMoon };

// 아이콘 색 — 맑음 난색, 강수 한색, 흐림 중성. 텍스트 토큰이 아닌 hue 를 쓰는 유일한 자리.
const TONE: Record<KmaConditionKey, string> = {
  clear: 'text-amber-500 dark:text-amber-400',
  partly: 'text-sky-500 dark:text-sky-400',
  cloudy: 'text-slate-400 dark:text-slate-400',
  rain: 'text-blue-500 dark:text-blue-400',
  shower: 'text-blue-500 dark:text-blue-400',
  drizzle: 'text-blue-500 dark:text-blue-400',
  sleet: 'text-indigo-400 dark:text-indigo-300',
  snow: 'text-cyan-500 dark:text-cyan-300',
  flurry: 'text-cyan-500 dark:text-cyan-300',
  unknown: 'text-muted-foreground',
};

interface Props {
  condition: KmaConditionKey;
  hour?: number | null;
  className?: string;
  // 접근성 라벨 — 생략 시 상태 라벨.
  label?: string;
}

export const WeatherConditionIcon = ({ condition, hour, className, label }: Props) => {
  const day = hour === null || hour === undefined ? true : kmaIsDaytimeHour(hour);
  const Icon = (day ? DAY_ICONS : NIGHT_ICONS)[condition];
  const text = label ?? KMA_CONDITION_LABEL[condition];
  return <Icon aria-label={text} role="img" className={cn('shrink-0', TONE[condition], className)} strokeWidth={1.75} />;
};
