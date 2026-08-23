import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '@repo/shared';
import type { MealSlotType } from '@repo/api-contract';
import { MEAL_SLOT_LABEL } from '@repo/utils';
import { Card, CardTitle, Note } from '~/components/common/Cards';
import {
  loadMealReminderSettings,
  MEAL_REMINDER_DEFAULT_TIMES,
  syncMealReminders,
} from '~/lib/mealReminders';
import { Chip, ChipRow, FieldLabel } from './mealUi';

interface MealReminderSettingsCardProps {
  slots: readonly MealSlotType[];
}

export const MealReminderSettingsCard = ({ slots }: MealReminderSettingsCardProps) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [scheduledSlots, setScheduledSlots] = useState<MealSlotType[]>([]);
  const [times, setTimes] = useState<Record<MealSlotType, string>>({
    ...MEAL_REMINDER_DEFAULT_TIMES,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMealReminderSettings().then((settings) => {
      if (cancelled) return;
      setEnabled(settings.enabled);
      setTimes(settings.times);
      setScheduledSlots(Object.keys(settings.notificationIds) as MealSlotType[]);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const slotKey = [...slots].sort().join(',');
  const scheduledSlotKey = [...scheduledSlots].sort().join(',');
  const needsSlotSync = ready && enabled && slotKey !== scheduledSlotKey;
  const hasChanges = dirty || needsSlotSync;

  if (Platform.OS === 'web') {
    return (
      <Card>
        <CardTitle title="식사 알림" />
        <Text style={styles.hint}>식사 알림은 iOS·Android 앱에서 설정할 수 있어요.</Text>
      </Card>
    );
  }

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await syncMealReminders({ enabled, slots, times });
      setEnabled(next.enabled);
      setTimes(next.times);
      setScheduledSlots(Object.keys(next.notificationIds) as MealSlotType[]);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '식사 알림을 저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitle title="식사 알림" sub="선택한 시간마다 기기에서 알려드려요. 권한은 켤 때만 요청해요." />
      {!ready ? (
        <Text style={styles.hint}>알림 설정을 불러오는 중…</Text>
      ) : (
        <>
          <FieldLabel>알림 받기</FieldLabel>
          <ChipRow>
            <Chip
              label={enabled ? '켜짐' : '꺼짐'}
              selected={enabled}
              onPress={() => {
                setEnabled(!enabled);
                setDirty(true);
                setSaved(false);
              }}
            />
          </ChipRow>

          {enabled ? (
            slots.length > 0 ? (
              <View style={styles.timeList}>
                {slots.map((slot) => (
                  <View key={slot} style={styles.timeRow}>
                    <Text style={styles.slotLabel}>{MEAL_SLOT_LABEL[slot]}</Text>
                    <TextInput
                      accessibilityLabel={`${MEAL_SLOT_LABEL[slot]} 알림 시간`}
                      value={times[slot]}
                      onChangeText={(value) => {
                        setTimes((current) => ({ ...current, [slot]: value }));
                        setDirty(true);
                        setSaved(false);
                      }}
                      placeholder="HH:MM"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      style={styles.timeInput}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Note tone="warn">위에서 기록·추천할 끼니를 하나 이상 선택해 주세요.</Note>
            )
          ) : null}

          {error ? <Note tone="warn">{error}</Note> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => void onSave()}
            disabled={!hasChanges || saving || (enabled && slots.length === 0)}
            style={[
              styles.saveBtn,
              {
                backgroundColor: theme.colors.primary,
                opacity: !hasChanges || saving || (enabled && slots.length === 0) ? 0.5 : 1,
              },
            ]}
          >
            <Text style={styles.saveText}>{saving ? '알림 저장 중…' : '알림 설정 저장'}</Text>
          </Pressable>
          {saved ? <Text style={styles.hint}>이 기기에 알림을 저장했어요.</Text> : null}
          <Text style={styles.hint}>알림 시각과 권한은 이 기기에만 저장돼요.</Text>
        </>
      )}
    </Card>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    timeList: { gap: 8 },
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    slotLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
    timeInput: {
      width: 92,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: 14,
      textAlign: 'center',
    },
    saveBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    saveText: { color: theme.colors.primaryText, fontWeight: '700', fontSize: 14 },
    hint: { fontSize: 11, color: theme.colors.textMuted },
  });
