import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import { KMA_CONDITION_LABEL, type KmaConditionKey } from '@repo/utils';
import { weatherGlyph } from '~/lib/weatherGlyph';

interface Props {
  condition: KmaConditionKey;
  // 시각(시) — 낮/밤 아이콘 선택. 없으면 낮.
  hour?: number | null;
  size?: number;
  // 접근성 라벨 — 생략 시 상태 라벨.
  label?: string;
}

// 날씨 상태 아이콘 — 글리프/색은 weatherGlyph 표에서(렌더 중 컴포넌트 생성 없음).
export const WeatherGlyph = ({ condition, hour, size = 24, label }: Props) => {
  const theme = useTheme();
  const g = weatherGlyph(condition, hour, theme.mode);
  return (
    <MaterialCommunityIcons
      name={g.name}
      size={size}
      color={g.color}
      accessibilityLabel={label ?? KMA_CONDITION_LABEL[condition]}
    />
  );
};
