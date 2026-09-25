import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTypewriter } from '@repo/shared';
import { Para } from '../common/Para';
import { SERIF, TR, coral, gold, ink, white } from './tarotTokens';

// 타로 네이티브 화면 공용 조각 — 유리 패널·버튼·칩·체크·타자 효과. 웹 TarotOverlay 의 금색 버튼·남색 유리와 같은 모양.

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export { Para };

export const Icon = ({ name, size = 16, color = TR.gold }: { name: IconName; size?: number; color?: string }) => <MaterialCommunityIcons name={name} size={size} color={color} />;

/** 유리 패널 — 웹 `rounded-2xl border border-white/10 bg-[#0b1030]/85`. */
export const Glass = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.glass, style]}>{children}</View>;

export const Caption = ({ children, color = TR.gold, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) => <Para style={[s.caption, { color }, style]}>{children}</Para>;

export const Body = ({ children, dim = 0.9, size = 14, color, style }: { children: ReactNode; dim?: number; size?: number; color?: string; style?: StyleProp<TextStyle> }) => (
  <Para style={[{ color: color ?? ink(dim), fontSize: size, lineHeight: Math.round(size * 1.6) }, style]}>{children}</Para>
);

export const Muted = ({ children, size = 11, dim = 0.55, style }: { children: ReactNode; size?: number; dim?: number; style?: StyleProp<TextStyle> }) => (
  <Para style={[{ color: ink(dim), fontSize: size, lineHeight: Math.round(size * 1.5) }, style]}>{children}</Para>
);

export const SerifTitle = ({ children, size = 17, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) => (
  <Text style={[{ fontFamily: SERIF, fontSize: size, fontWeight: '700', color: TR.cream }, style]}>{children}</Text>
);

/** 작은 테두리 알약(원문 뱃지·역방향 표시). */
export const Pill = ({ children, color = ink(0.6), border = white(0.2), style }: { children: ReactNode; color?: string; border?: string; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.pill, { borderColor: border }, style]}>
    <Text style={{ fontSize: 10, color }}>{children}</Text>
  </View>
);

/** 키워드 조각 — 웹 `rounded bg-white/5 px-1.5 text-[10px]`. */
export const Tag = ({ children }: { children: ReactNode }) => (
  <View style={s.tag}>
    <Text style={{ fontSize: 10, color: ink(0.7) }}>{children}</Text>
  </View>
);

export const Chip = ({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active, disabled }}
    accessibilityLabel={label}
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [s.chip, active ? { borderColor: TR.gold, backgroundColor: gold(0.15) } : { borderColor: white(0.15) }, pressed && { opacity: 0.7 }]}
  >
    <Text style={{ fontSize: 12, color: active ? TR.cream : ink(0.7) }}>{label}</Text>
  </Pressable>
);

export const PrimaryButton = ({ label, icon, onPress, busy, disabled, style }: { label: string; icon?: IconName; onPress: () => void; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy }}
    onPress={onPress}
    disabled={disabled || busy}
    style={({ pressed }) => [s.primary, { backgroundColor: pressed ? TR.goldHi : TR.gold }, (disabled || busy) && { opacity: 0.4 }, style]}
  >
    {busy ? <ActivityIndicator size="small" color={TR.onGold} /> : icon ? <Icon name={icon} size={16} color={TR.onGold} /> : null}
    <Text style={s.primaryText}>{label}</Text>
  </Pressable>
);

export const OutlineButton = ({ label, icon, onPress, busy, disabled, style }: { label: string; icon?: IconName; onPress: () => void; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy }}
    onPress={onPress}
    disabled={disabled || busy}
    style={({ pressed }) => [s.outline, pressed && { backgroundColor: white(0.1) }, (disabled || busy) && { opacity: 0.4 }, style]}
  >
    {busy ? <ActivityIndicator size="small" color={TR.ink} /> : icon ? <Icon name={icon} size={15} color={TR.ink} /> : null}
    <Text style={s.outlineText}>{label}</Text>
  </Pressable>
);

export const TextButton = ({ label, icon, onPress, color = ink(0.7), disabled, accessibilityLabel }: { label: string; icon?: IconName; onPress: () => void; color?: string; disabled?: boolean; accessibilityLabel?: string }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} disabled={disabled} hitSlop={8} style={({ pressed }) => [s.textBtn, (pressed || disabled) && { opacity: 0.5 }]}>
    {icon ? <Icon name={icon} size={15} color={color} /> : null}
    {label ? <Text style={{ fontSize: 12, color }}>{label}</Text> : null}
  </Pressable>
);

export const CheckRow = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={() => onChange(!checked)} hitSlop={6} style={s.check}>
    <Icon name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={19} color={checked ? TR.gold : ink(0.5)} />
    <Text style={{ fontSize: 13, color: ink(0.75) }}>{label}</Text>
  </Pressable>
);

export const Loading = ({ text }: { text: string }) => (
  <View style={s.loading}>
    <ActivityIndicator size="small" color={TR.gold} />
    <Text style={{ fontSize: 13, color: ink(0.7) }}>{text}</Text>
  </View>
);

/** 타자 효과 글 — LLM 문장이 도착하면 한 글자씩(동작 줄이기면 한 번에). */
export const TypedText = ({ text, animate, size = 14, color = ink(0.9) }: { text: string; animate: boolean; size?: number; color?: string }) => {
  const shown = useTypewriter(text, animate);
  return <Para style={{ fontSize: size, lineHeight: Math.round(size * 1.6), color }}>{shown}</Para>;
};

export const ErrorText = ({ children }: { children: ReactNode }) => <Para style={{ fontSize: 13, lineHeight: 20, color: coral(1) }}>{children}</Para>;

const s = StyleSheet.create({
  glass: { borderRadius: 18, borderWidth: 1, borderColor: white(0.1), backgroundColor: 'rgba(11,16,48,0.92)' },
  caption: { fontSize: 11, lineHeight: 16 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  tag: { borderRadius: 4, backgroundColor: white(0.05), paddingHorizontal: 6, paddingVertical: 1 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 12, paddingHorizontal: 16 },
  primaryText: { fontSize: 15, fontWeight: '700', color: TR.onGold },
  outline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 10, borderWidth: 1, borderColor: white(0.2), paddingHorizontal: 12 },
  outlineText: { fontSize: 13, color: TR.ink },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
