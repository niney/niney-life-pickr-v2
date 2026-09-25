import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './sajuUi';
import { SJ, gold, ink, white } from './sajuTokens';

// 사주 입력용 격자 피커 — 웹 <select> 대응. 누르면 바닥 시트에 선택지를 격자로 펼친다(월·일·시·분처럼 개수가
// 정해진 값). 네이티브 피커 모듈을 새로 들이지 않으려고 RN Modal 로 만든다.

export interface PickerOption<T> {
  value: T;
  label: string;
}

export const PickerField = <T extends string | number | null>({
  label,
  value,
  options,
  onChange,
  disabled,
  columns = 4,
  accessibilityLabel,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<PickerOption<T>>;
  onChange: (v: T) => void;
  disabled?: boolean;
  columns?: number;
  accessibilityLabel?: string;
}) => {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);
  const sheetW = Math.min(width, 520);
  const gap = 6;
  const cellW = Math.floor((sheetW - 32 - gap * (columns - 1)) / columns);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? label} ${current?.label ?? ''}`.trim()}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && { borderColor: gold(0.6) }, disabled && { opacity: 0.4 }]}
      >
        <Text style={styles.fieldText} numberOfLines={1}>
          {current?.label ?? '-'}
        </Text>
        <Icon name="chevron-down" size={16} color={ink(0.5)} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="닫기">
          <Pressable style={[styles.sheet, { width: sheetW, paddingBottom: Math.max(16, insets.bottom + 8) }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={[styles.grid, { gap }]}>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={o.label}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.cell, { width: cellW }, active ? styles.cellActive : null, pressed && !active ? { borderColor: white(0.35) } : null]}
                  >
                    <Text style={[styles.cellText, active ? { color: SJ.cream } : null]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderWidth: 1, borderColor: white(0.15), backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 9, paddingHorizontal: 10, height: 40 },
  fieldText: { flex: 1, fontSize: 14, color: SJ.cream },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: '#16130f', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: gold(0.2), paddingTop: 14, paddingHorizontal: 16, gap: 12 },
  sheetTitle: { color: SJ.cream, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: 9, borderWidth: 1, borderColor: white(0.12) },
  cellActive: { borderColor: SJ.gold, backgroundColor: 'rgba(58,47,20,0.9)' },
  cellText: { fontSize: 14, color: ink(0.75) },
});
