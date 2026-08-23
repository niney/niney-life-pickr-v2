import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ApiError,
  useMealPreference,
  useTheme,
  useUpdateMealPreference,
  type Theme,
} from '@repo/shared';
import {
  MEAL_WEIGHT_PRESETS,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
} from '@repo/api-contract';
import { MEAL_SLOTS, MEAL_SLOT_LABEL, MEAL_TYPES, MEAL_TYPE_LABEL } from '@repo/utils';
import { Card, CardTitle, Note, StateBlock } from '~/components/common/Cards';
import { MealDataManagementCard } from './MealDataManagementCard';
import { MealReminderSettingsCard } from './MealReminderSettingsCard';
import { Chip, ChipRow, FieldLabel } from './mealUi';

// 추천 중요도(0~5) + 절대 제외/소프트 비선호. 앱에는 슬라이더 라이브러리가 없어 0~5 칩 스테퍼로 만든다
// (새 네이티브 의존성을 들이지 않는다 — 리포 관례).

const WEIGHT_FIELDS: ReadonlyArray<{ key: keyof MealWeightsType; label: string; desc: string }> = [
  { key: 'variety', label: '겹침 피하기', desc: '최근 먹은 음식·분류를 피해요' },
  { key: 'taste', label: '내 취향', desc: '자주 먹고 좋아한 음식을 더 권해요' },
  { key: 'balance', label: '골고루', desc: '요즘 부족한 분류를 채워요' },
  { key: 'health', label: '건강', desc: '튀김·야식·나트륨을 줄이고 채소·단백질을 늘려요' },
  { key: 'novelty', label: '새로운 시도', desc: '안 먹어본 음식을 섞어요' },
  { key: 'weather', label: '날씨·계절', desc: '더우면 시원하게, 추우면 국물로' },
  { key: 'convenience', label: '간편함', desc: '집밥은 손 덜 가는 쪽, 외식은 흔한 메뉴' },
];

const LEVELS = [0, 1, 2, 3, 4, 5];

export const MealPreferenceView = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pref = useMealPreference();
  const save = useUpdateMealPreference();

  const [weights, setWeights] = useState<MealWeightsType | null>(null);
  const [excluded, setExcluded] = useState('');
  const [disliked, setDisliked] = useState('');
  const [liked, setLiked] = useState('');
  const [slots, setSlots] = useState<MealSlotType[]>([]);
  const [mealTypes, setMealTypes] = useState<MealTypeType[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버 값 도착 시 폼 초기화. 사용자가 이미 손댔으면 덮어쓰지 않는다.
  useEffect(() => {
    if (!pref.data || dirty) return;
    setWeights(pref.data.weights);
    setExcluded(pref.data.excludedFoods.join(', '));
    setDisliked(pref.data.dislikedFoods.join(', '));
    setLiked(pref.data.likedFoods.join(', '));
    setSlots(pref.data.slots);
    setMealTypes(pref.data.mealTypes);
  }, [pref.data, dirty]);

  if (pref.isLoading) return <StateBlock kind="loading" />;
  if (pref.isError) {
    return (
      <StateBlock
        kind="error"
        message="식단 설정을 불러오지 못했어요."
        onRetry={() => void pref.refetch()}
      />
    );
  }
  if (!weights) return <StateBlock kind="loading" />;

  const parseList = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 50);

  const onSave = () => {
    setError(null);
    save.mutate(
      {
        weights,
        excludedFoods: parseList(excluded),
        dislikedFoods: parseList(disliked),
        likedFoods: parseList(liked),
        slots,
        mealTypes,
        onboarded: true,
      },
      {
        onSuccess: () => setDirty(false),
        onError: (e) => setError(e instanceof ApiError ? e.message : '저장하지 못했어요.'),
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {pref.data && !pref.data.onboarded ? (
        <Note tone="muted">
          첫 추천을 위해 좋아하는 음식, 덜 선호하는 음식, 절대 제외할 음식과 끼니를 고른 뒤 저장해 주세요.
          기록이 적을 때도 이 설정을 먼저 반영해요.
        </Note>
      ) : null}
      <Card>
        <CardTitle title="무엇을 중요하게 볼까요" sub="추천이 이 비중대로 골라요. 0이면 아예 보지 않아요." />
        <ChipRow>
          {Object.entries(MEAL_WEIGHT_PRESETS).map(([key, preset]) => (
            <Chip
              key={key}
              label={preset.label}
              onPress={() => {
                setWeights(preset.weights);
                setDirty(true);
              }}
            />
          ))}
        </ChipRow>
        <View style={styles.weightList}>
          {WEIGHT_FIELDS.map((f) => (
            <View key={f.key} style={styles.weightRow}>
              <View style={styles.weightHead}>
                <Text style={styles.weightLabel}>{f.label}</Text>
                <Text style={styles.weightValue}>{weights[f.key]}</Text>
              </View>
              <Text style={styles.weightDesc}>{f.desc}</Text>
              <View style={styles.levels}>
                {LEVELS.map((v) => (
                  <Pressable
                    key={v}
                    accessibilityRole="button"
                    accessibilityLabel={`${f.label} ${v}`}
                    accessibilityState={{ selected: weights[f.key] === v }}
                    onPress={() => {
                      setWeights({ ...weights, [f.key]: v });
                      setDirty(true);
                    }}
                    style={[
                      styles.level,
                      {
                        borderColor: weights[f.key] >= v && v > 0 ? theme.colors.primary : theme.colors.border,
                        backgroundColor: weights[f.key] >= v && v > 0 ? theme.colors.primary : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: weights[f.key] >= v && v > 0 ? theme.colors.primaryText : theme.colors.textMuted,
                      }}
                    >
                      {v}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <CardTitle title="먹는 것" />
        <FieldLabel>절대 제외 (알레르기·못 먹는 음식)</FieldLabel>
        <TextInput
          value={excluded}
          onChangeText={(v) => {
            setExcluded(v);
            setDirty(true);
          }}
          placeholder="쉼표로 구분 — 예: 오이, 고수"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
        <Text style={styles.hint}>
          이름과 알려진 재료가 맞으면 완전히 빼요. 재료 정보가 없는 카탈로그 음식은 막지 못할 수 있어요.
        </Text>

        <FieldLabel>덜 선호하는 음식</FieldLabel>
        <TextInput
          value={disliked}
          onChangeText={(v) => {
            setDisliked(v);
            setDirty(true);
          }}
          placeholder="쉼표로 구분 — 예: 고수, 내장"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
        <Text style={styles.hint}>후보에서 지우지는 않고 점수를 크게 낮춰 가능하면 피해요. 대안이 부족하면 나올 수 있어요.</Text>

        <FieldLabel>좋아하는 음식</FieldLabel>
        <TextInput
          value={liked}
          onChangeText={(v) => {
            setLiked(v);
            setDirty(true);
          }}
          placeholder="쉼표로 구분"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />

        <FieldLabel>주로 하는 식사</FieldLabel>
        <ChipRow>
          {MEAL_TYPES.map((t) => (
            <Chip
              key={t}
              label={MEAL_TYPE_LABEL[t]}
              selected={mealTypes.includes(t)}
              onPress={() => {
                setMealTypes(mealTypes.includes(t) ? mealTypes.filter((x) => x !== t) : [...mealTypes, t]);
                setDirty(true);
              }}
            />
          ))}
        </ChipRow>

        <FieldLabel>기록·추천할 끼니</FieldLabel>
        <ChipRow>
          {MEAL_SLOTS.map((s) => (
            <Chip
              key={s}
              label={MEAL_SLOT_LABEL[s]}
              selected={slots.includes(s)}
              onPress={() => {
                if (slots.includes(s) && slots.length === 1) {
                  setError('기록·추천할 끼니는 하나 이상 남겨 주세요.');
                  return;
                }
                setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s]);
                setError(null);
                setDirty(true);
              }}
            />
          ))}
        </ChipRow>
      </Card>

      <MealReminderSettingsCard slots={slots} />

      <MealDataManagementCard />

      {error ? <Note tone="warn">{error}</Note> : null}

      <Pressable
        accessibilityRole="button"
        onPress={onSave}
        disabled={!dirty || save.isPending}
        style={[
          styles.saveBtn,
          { backgroundColor: theme.colors.primary, opacity: !dirty || save.isPending ? 0.5 : 1 },
        ]}
      >
        <Text style={{ color: theme.colors.primaryText, fontWeight: '700', fontSize: 15 }}>
          {save.isPending ? '저장 중…' : '저장'}
        </Text>
      </Pressable>
      {save.isSuccess && !dirty ? <Text style={styles.hint}>저장했어요.</Text> : null}
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 96 },
    weightList: { gap: 14 },
    weightRow: { gap: 4 },
    weightHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    weightLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
    weightValue: { fontSize: 13, color: theme.colors.textMuted },
    weightDesc: { fontSize: 11, color: theme.colors.textMuted },
    levels: { flexDirection: 'row', gap: 6, marginTop: 2 },
    level: {
      width: 36,
      height: 28,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: 14,
    },
    hint: { fontSize: 11, color: theme.colors.textMuted },
    saveBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  });
