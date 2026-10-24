import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { MealSlotType } from '@repo/api-contract';
import { useTheme, type Theme } from '@repo/shared';
import { MEAL_SLOT_LABEL, daysBetween, mealDateLabel, mealDateTitle, parseTimeOfDay, toLocalDateKey } from '@repo/utils';
import { Chip, ChipRow, FieldLabel, MealIconButton } from './mealUi';
import { mealFont, mealRadius } from './mealTokens';

// 식단 입력의 '언제 먹었나요' 시트 — 화면에는 시각 한 줄만 두고, 날짜 이동·시각 직접 입력·끼니별 보통 시각·
// ±30분·지금을 여기 모았다(예전엔 입력 화면에 칩 11개가 늘어서 있었다). 값은 고르는 즉시 draft 에 들어가고
// '완료'는 닫기만 한다. 네이티브 날짜 피커는 새 네이티브 의존성이라 들이지 않았다.

const timeLabel = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealTimeSheet = ({
  open,
  onClose,
  eatenAt,
  eatenDate,
  presets,
  onShiftDay,
  onShiftTime,
  onSetTime,
  onPreset,
  onNow,
}: {
  open: boolean;
  onClose: () => void;
  eatenAt: string;
  eatenDate: string;
  presets: ReadonlyArray<{ slot: MealSlotType; time: string }>;
  onShiftDay: (days: number) => void;
  onShiftTime: (minutes: number) => void;
  onSetTime: (minutesOfDay: number) => void;
  onPreset: (slot: MealSlotType, time: string) => void;
  onNow: () => void;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [editingTime, setEditingTime] = useState<string | null>(null);
  const today = toLocalDateKey(new Date());
  const diff = daysBetween(eatenDate, today);
  const relative = diff !== null && diff >= 0 && diff <= 6 ? mealDateLabel(eatenDate, today) : null;

  // 연 적이 없는 시트에 dismiss() 를 부르면 gorhom v5 모달이 '닫는 중(DISMISSING)'에 갇혀 이후 present() 가
  // 먹히지 않는다(시뮬레이터 실측 — 첫 렌더의 open=false 가 그랬다). 연 뒤에만 닫는다.
  const presentedRef = useRef(false);
  useEffect(() => {
    if (open) {
      presentedRef.current = true;
      sheetRef.current?.present();
    } else if (presentedRef.current) {
      presentedRef.current = false;
      sheetRef.current?.dismiss();
    }
  }, [open]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  const commitTime = () => {
    const minutes = editingTime === null ? null : parseTimeOfDay(editingTime);
    if (minutes !== null) onSetTime(minutes);
    setEditingTime(null);
  };
  // 시각을 바꾸는 다른 버튼을 누르면 입력칸을 닫는다 — 안 닫으면 바뀐 시각이 입력칸에 가려진다(시뮬레이터 실측).
  const run = (fn: () => void) => {
    setEditingTime(null);
    fn();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.textMuted }}
      onDismiss={() => {
        presentedRef.current = false;
        setEditingTime(null);
        onClose();
      }}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>언제 먹었나요</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              commitTime();
              sheetRef.current?.dismiss();
            }}
            hitSlop={8}
          >
            <Text style={styles.done}>완료</Text>
          </Pressable>
        </View>

        <View style={styles.dayRow}>
          <MealIconButton icon="chevron-left" accessibilityLabel="하루 전" onSurface onPress={() => run(() => onShiftDay(-1))} />
          <View style={styles.dayText}>
            {relative ? <Text style={styles.relative}>{relative}</Text> : null}
            <Text style={styles.date}>{mealDateTitle(eatenDate, today)}</Text>
          </View>
          <MealIconButton icon="chevron-right" accessibilityLabel="하루 뒤" onSurface onPress={() => run(() => onShiftDay(1))} />
        </View>

        {editingTime === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`시각 ${timeLabel(eatenAt)}, 눌러서 직접 입력`}
            // 빈 칸으로 열고 지금 시각을 placeholder 로 보여 준다. 값을 채워 두면 maxLength(5)에
            // 걸려 한 글자도 못 치고 백스페이스를 다섯 번 눌러야 한다(시뮬레이터 실측).
            onPress={() => setEditingTime('')}
            style={[styles.timeBox, { backgroundColor: theme.colors.surfaceAlt }]}
          >
            <Text style={styles.time}>{timeLabel(eatenAt)}</Text>
            <Text style={styles.timeHint}>눌러서 직접 입력</Text>
          </Pressable>
        ) : (
          <View style={[styles.timeBox, { backgroundColor: theme.colors.surfaceAlt }]}>
            <BottomSheetTextInput
              value={editingTime}
              onChangeText={setEditingTime}
              onBlur={commitTime}
              onSubmitEditing={commitTime}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={5}
              autoFocus
              selectTextOnFocus
              placeholder={timeLabel(eatenAt)}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.timeInput}
              accessibilityLabel="시각 입력"
            />
            <Text style={styles.timeHint}>예: 1240 · 12:40</Text>
          </View>
        )}

        {presets.length > 0 ? (
          <View style={styles.group}>
            {/* 끼니별 '내가 보통 먹는 시각' — 한 번에 시각+끼니를 정한다. 기록이 적으면 일반값. */}
            <FieldLabel>끼니별 보통 시각</FieldLabel>
            <ChipRow>
              {presets.map((p) => (
                <Chip
                  key={p.slot}
                  label={`${MEAL_SLOT_LABEL[p.slot]} ${p.time}`}
                  onPress={() => run(() => onPreset(p.slot, p.time))}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <ChipRow>
          <Chip label="30분" icon="minus" accessibilityLabel="30분 이르게" onPress={() => run(() => onShiftTime(-30))} />
          <Chip label="30분" icon="plus" accessibilityLabel="30분 늦게" onPress={() => run(() => onShiftTime(30))} />
          <Chip label="지금" icon="clock-outline" onPress={() => run(onNow)} />
        </ChipRow>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: mealFont.headline, fontWeight: '700', color: theme.colors.text },
    done: { fontSize: mealFont.body, fontWeight: '700', color: theme.colors.primary },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dayText: { flex: 1, alignItems: 'center', gap: 2 },
    relative: { fontSize: mealFont.caption, fontWeight: '600', color: theme.colors.primary },
    date: { fontSize: mealFont.headline, fontWeight: '700', color: theme.colors.text },
    timeBox: { borderRadius: mealRadius.control, alignItems: 'center', paddingVertical: 12, gap: 2 },
    time: {
      fontSize: mealFont.display,
      lineHeight: 42,
      fontWeight: '700',
      color: theme.colors.text,
      fontVariant: ['tabular-nums'],
    },
    timeInput: {
      minWidth: 140,
      height: 42,
      textAlign: 'center',
      fontSize: mealFont.display,
      fontWeight: '700',
      color: theme.colors.text,
      fontVariant: ['tabular-nums'],
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.primary,
    },
    timeHint: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    group: { gap: 8 },
  });
