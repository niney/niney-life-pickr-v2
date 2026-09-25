import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WUXING_TEXT_COLOR, useTypewriter } from '@repo/shared';
import { SAJU_WUXING_META, type Wuxing } from '@repo/utils';
import { SERIF, SJ, gold, ink, jusa, salmon, white, wuxingAlpha } from './sajuTokens';
import { Para } from '../common/Para';

// 사주(C) 네이티브 화면 공용 조각 — 상자·칩·버튼·타자 효과 등. 색·글꼴은 sajuTokens.ts(웹 sajuTheme 와 같은 값).

// 여러 줄 글은 Para(iOS 마지막 줄 사라짐 우회, common/Para) — 다른 파일도 여기서 가져간다.
export { Para };

export const Glass = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.glass, style]}>{children}</View>;

/** 테두리 상자 — 금(기본)·주의(연주황)·흐림. 웹의 `rounded-lg border p-2`. */
export const Box = ({ tone = 'gold', children, style, accessibilityLabel }: { tone?: 'gold' | 'salmon' | 'dim' | 'active'; children: ReactNode; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) => (
  <View
    accessibilityLabel={accessibilityLabel}
    style={[
      s.box,
      tone === 'gold' && { borderColor: gold(0.3) },
      tone === 'salmon' && { borderColor: salmon(0.35) },
      tone === 'dim' && { borderColor: white(0.1) },
      tone === 'active' && { borderColor: gold(0.6), backgroundColor: gold(0.1) },
      style,
    ]}
  >
    {children}
  </View>
);

/** 상자 머리 작은 글씨(금). */
export const Caption = ({ children, color = SJ.gold, style }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle> }) => <Para style={[s.caption, { color }, style]}>{children}</Para>;

export const Title = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Para style={[s.title, style]}>{children}</Para>;

export const Body = ({ children, dim = 0.85, size = 14, style }: { children: ReactNode; dim?: number; size?: number; style?: StyleProp<TextStyle> }) => (
  <Para style={[{ color: ink(dim), fontSize: size, lineHeight: Math.round(size * 1.6) }, style]}>{children}</Para>
);

export const Muted = ({ children, size = 11, dim = 0.55, style }: { children: ReactNode; size?: number; dim?: number; style?: StyleProp<TextStyle> }) => (
  <Para style={[{ color: ink(dim), fontSize: size, lineHeight: Math.round(size * 1.5) }, style]}>{children}</Para>
);

export const Bullets = ({ items, dim = 0.8, size = 12 }: { items: readonly string[]; dim?: number; size?: number }) => (
  <View style={{ gap: 2 }}>
    {items.map((x) => (
      <Para key={x} style={{ color: ink(dim), fontSize: size, lineHeight: Math.round(size * 1.5) }}>
        · {x}
      </Para>
    ))}
  </View>
);

/** 둥근 칩 — 신살·관계·태그. */
export const Pill = ({ children, color = ink(0.7), border = white(0.15), bg, style }: { children: ReactNode; color?: string; border?: string; bg?: string; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.pill, { borderColor: border, backgroundColor: bg }, style]}>
    <Text style={{ color, fontSize: 10 }}>{children}</Text>
  </View>
);

export const Wrap = ({ children, gap = 4, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap }, style]}>{children}</View>;

/** 오행 칩 — "용신 목" 처럼. */
export const ElChip = ({ label, e }: { label: string; e: Wuxing }) => (
  <Pill border={wuxingAlpha(e, 0.55)} color={WUXING_TEXT_COLOR[e]}>
    {label} {SAJU_WUXING_META[e].ko}
  </Pill>
);

export const Stars5 = ({ n, size = 11 }: { n: number; size?: number }) => (
  <Text accessibilityLabel={`별 ${n}개`} style={{ fontSize: size, color: SJ.gold }}>
    {'★'.repeat(n)}
    <Text style={{ color: ink(0.2) }}>{'★'.repeat(Math.max(0, 5 - n))}</Text>
  </Text>
);

/** 토글 버튼 — 선택되면 금 테두리. tool 이면 붉은 테두리(도구 탭 구분). */
export const SegButton = ({ label, active, onPress, tool, round, flex, accessibilityLabel, disabled }: { label: string; active: boolean; onPress: () => void; tool?: boolean; round?: boolean; flex?: boolean; accessibilityLabel?: string; disabled?: boolean }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active, disabled }}
    accessibilityLabel={accessibilityLabel ?? label}
    onPress={onPress}
    disabled={disabled}
    hitSlop={4}
    style={({ pressed }) => [
      s.seg,
      round && s.segRound,
      flex && { flex: 1 },
      active ? { borderColor: SJ.gold, backgroundColor: gold(0.15) } : { borderColor: tool ? jusa(0.55) : white(0.12) },
      pressed && !active && { borderColor: white(0.35) },
      disabled && { opacity: 0.4 },
    ]}
  >
    <Text style={[s.segText, round && { fontSize: 12 }, { color: active ? SJ.cream : ink(tool ? 0.78 : 0.62) }]}>{label}</Text>
  </Pressable>
);

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** 주사(朱砂) 기본 버튼 — 사주 세우기·궁합 보기. */
export const PrimaryButton = ({ label, icon, onPress, busy, disabled, style }: { label: string; icon?: IconName; onPress: () => void; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy, busy }}
    onPress={onPress}
    disabled={disabled || busy}
    style={({ pressed }) => [s.primary, { backgroundColor: pressed ? '#cc3d33' : SJ.jusa }, (disabled || busy) && { opacity: 0.6 }, style]}
  >
    {busy ? <ActivityIndicator size="small" color={SJ.onJusa} /> : icon ? <MaterialCommunityIcons name={icon} size={16} color={SJ.onJusa} /> : null}
    <Text style={s.primaryText}>{label}</Text>
  </Pressable>
);

/** 테두리만 있는 보조 버튼. */
export const OutlineButton = ({ label, icon, onPress, busy, disabled, color = SJ.ink, style }: { label: string; icon?: IconName; onPress: () => void; busy?: boolean; disabled?: boolean; color?: string; style?: StyleProp<ViewStyle> }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: disabled || busy, busy }}
    onPress={onPress}
    disabled={disabled || busy}
    style={({ pressed }) => [s.outline, pressed && { backgroundColor: white(0.08) }, (disabled || busy) && { opacity: 0.5 }, style]}
  >
    {busy ? <ActivityIndicator size="small" color={color} /> : icon ? <MaterialCommunityIcons name={icon} size={15} color={color} /> : null}
    <Text style={[s.outlineText, { color }]}>{label}</Text>
  </Pressable>
);

/** 글자 버튼 — 다시 입력·다시 시도 등. */
export const TextButton = ({ label, icon, onPress, color = ink(0.8), disabled, accessibilityLabel }: { label: string; icon?: IconName; onPress: () => void; color?: string; disabled?: boolean; accessibilityLabel?: string }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [s.textBtn, pressed && { opacity: 0.6 }, disabled && { opacity: 0.4 }]}>
    {icon ? <MaterialCommunityIcons name={icon} size={14} color={color} /> : null}
    <Text style={{ color, fontSize: 13 }}>{label}</Text>
  </Pressable>
);

export const Icon = ({ name, size = 16, color = SJ.gold }: { name: IconName; size?: number; color?: string }) => <MaterialCommunityIcons name={name} size={size} color={color} />;

/** 인라인 로딩 한 줄. */
export const Loading = ({ text, size = 12 }: { text: string; size?: number }) => (
  <View style={s.loadingRow}>
    <ActivityIndicator size="small" color={SJ.gold} />
    <Text style={{ color: ink(0.6), fontSize: size }}>{text}</Text>
  </View>
);

/** 오류 상자 + 다시 시도. */
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Box tone="salmon" style={s.errorBox}>
    <Text style={{ color: SJ.salmon, fontSize: 12, flex: 1 }}>{message}</Text>
    {onRetry ? <TextButton label="다시 시도" icon="restore" color={SJ.cream} onPress={onRetry} /> : null}
  </Box>
);

/** LLM 문장 — 도착하면 타자 효과(웹과 같은 60cps). */
export const TypedText = ({ text, animate, size = 14, dim = 0.85 }: { text: string; animate: boolean; size?: number; dim?: number }) => {
  const shown = useTypewriter(text, animate);
  if (!text) return null;
  return <Body size={size} dim={dim}>{shown}</Body>;
};

/** 체크 한 줄 — 웹 checkbox 대응. */
export const CheckRow = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={label} onPress={() => onChange(!checked)} disabled={disabled} hitSlop={6} style={[s.check, disabled && { opacity: 0.4 }]}>
    <Icon name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={18} color={checked ? SJ.gold : ink(0.5)} />
    <Text style={{ fontSize: 12, color: ink(0.75), flexShrink: 1 }}>{label}</Text>
  </Pressable>
);

/** 표 한 줄(용어 · 값) — 웹의 dl grid. */
export const DefRow = ({ term, children }: { term: string; children: ReactNode }) => (
  <View style={s.defRow}>
    <Text style={s.defTerm}>{term}</Text>
    <View style={{ flex: 1 }}>{typeof children === 'string' ? <Para style={s.defValue}>{children}</Para> : children}</View>
  </View>
);

const s = StyleSheet.create({
  glass: { backgroundColor: 'rgba(18,18,24,0.94)', borderColor: gold(0.15), borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 16 },
  box: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  caption: { fontSize: 10, lineHeight: 14 },
  title: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: '#f3e9c6', lineHeight: 22 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  seg: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  segRound: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  segText: { fontSize: 13, fontWeight: '600' },
  primary: { height: 46, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryText: { color: '#f7eddc', fontSize: 15, fontWeight: '700' },
  outline: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: white(0.2), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  outlineText: { fontSize: 13, fontWeight: '600' },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2 },
  defRow: { flexDirection: 'row', gap: 10, paddingVertical: 1 },
  defTerm: { color: '#d9b65b', fontSize: 12, width: 30 },
  defValue: { color: ink(0.8), fontSize: 12, lineHeight: 18 },
});
