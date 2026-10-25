import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ApiError,
  useMealPreference,
  useTheme,
  useUpdateMealPreference,
  type Theme,
} from '@repo/shared';
import {
  MEAL_WEIGHT_PRESETS,
  MEAL_ALLERGEN_LABEL,
  MealAllergen,
  type MealAllergenType,
  type MealSexType,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
} from '@repo/api-contract';
import {
  MEAL_SEX_OPTIONS,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  parseMealBirthYear,
} from '@repo/utils';
import { Note, StateBlock } from '~/components/common/Cards';
import { MealDataManagementCard } from './MealDataManagementCard';
import { MealReminderSettingsCard } from './MealReminderSettingsCard';
import {
  Chip,
  ChipRow,
  FieldLabel,
  MealButton,
  MealLevelBar,
  MealSection,
  MealSectionTitle,
  MealStepper,
} from './mealUi';
import { mealFont, mealRadius } from './mealTokens';

// 추천 중요도(0~5) + 절대 제외/소프트 비선호. 앱에는 슬라이더 라이브러리가 없어 − 숫자 + 스테퍼와 칸 막대로
// 만든다(새 네이티브 의존성을 들이지 않는다 — 리포 관례). 예전 0~5 버튼 6개 × 7줄(주황 블록 42개)을 걷었다.
//
// 이 화면은 /meal/settings 다(식단 화면 헤더 톱니). 저장 버튼은 추천 설정(중요도·먹는 것·영양 기준) 바로 아래에
// 둔다 — 식사 알림·내 데이터 카드는 각자 저장·실행 버튼이 따로 있다.

const WEIGHT_FIELDS: ReadonlyArray<{ key: keyof MealWeightsType; label: string; desc: string }> = [
  { key: 'variety', label: '겹침 피하기', desc: '최근 먹은 음식·분류를 피해요' },
  { key: 'taste', label: '내 취향', desc: '자주 먹고 좋아한 음식을 더 권해요' },
  { key: 'balance', label: '골고루', desc: '요즘 부족한 분류를 채워요' },
  { key: 'health', label: '건강', desc: '튀김·야식·나트륨을 줄이고 채소·단백질을 늘려요' },
  { key: 'novelty', label: '새로운 시도', desc: '안 먹어본 음식을 섞어요' },
  { key: 'weather', label: '날씨·계절', desc: '더우면 시원하게, 추우면 국물로' },
  { key: 'convenience', label: '간편함', desc: '집밥은 손 덜 가는 쪽, 외식은 흔한 메뉴' },
];

const WEIGHT_MAX = 5;

export const MealPreferenceView = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pref = useMealPreference();
  const save = useUpdateMealPreference();

  const [weights, setWeights] = useState<MealWeightsType | null>(null);
  const [excluded, setExcluded] = useState('');
  const [allergens, setAllergens] = useState<MealAllergenType[]>([]);
  const [disliked, setDisliked] = useState('');
  const [liked, setLiked] = useState('');
  const [slots, setSlots] = useState<MealSlotType[]>([]);
  const [mealTypes, setMealTypes] = useState<MealTypeType[]>([]);
  const [sex, setSex] = useState<MealSexType | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버 값 도착 시 폼 초기화. 사용자가 이미 손댔으면 덮어쓰지 않는다.
  useEffect(() => {
    if (!pref.data || dirty) return;
    setWeights(pref.data.weights);
    setExcluded(pref.data.excludedFoods.join(', '));
    setAllergens(pref.data.allergens);
    setDisliked(pref.data.dislikedFoods.join(', '));
    setLiked(pref.data.likedFoods.join(', '));
    setSlots(pref.data.slots);
    setMealTypes(pref.data.mealTypes);
    setSex(pref.data.sex ?? null);
    setBirthYear(pref.data.birthYear ? String(pref.data.birthYear) : '');
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
    const year = parseMealBirthYear(birthYear);
    if (year === undefined) {
      setError('출생연도는 1900년부터 올해까지 네 자리로 적어 주세요.');
      return;
    }
    save.mutate(
      {
        weights,
        excludedFoods: parseList(excluded),
        allergens,
        dislikedFoods: parseList(disliked),
        likedFoods: parseList(liked),
        slots,
        mealTypes,
        sex,
        birthYear: year,
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
          첫 추천을 위해 좋아하는 음식, 덜 선호하는 음식, 알레르기 주의 항목과 끼니를 고른 뒤 저장해 주세요.
          기록이 적을 때도 이 설정을 먼저 반영해요.
        </Note>
      ) : null}
      <MealSection>
        <MealSectionTitle title="무엇을 중요하게 볼까요" sub="추천이 이 비중대로 골라요. 0이면 아예 보지 않아요." />
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
        <View>
          {WEIGHT_FIELDS.map((f, index) => (
            <View key={f.key} style={[styles.weightRow, index > 0 ? styles.weightDivider : null]}>
              <View style={styles.weightText}>
                <Text style={styles.weightLabel}>{f.label}</Text>
                <Text style={styles.weightDesc}>{f.desc}</Text>
                <MealLevelBar value={weights[f.key]} max={WEIGHT_MAX} />
              </View>
              <MealStepper
                value={weights[f.key]}
                max={WEIGHT_MAX}
                accessibilityLabel={`${f.label} 중요도`}
                onChange={(v) => {
                  setWeights({ ...weights, [f.key]: v });
                  setDirty(true);
                }}
              />
            </View>
          ))}
        </View>
      </MealSection>

      <MealSection>
        <MealSectionTitle title="먹는 것" />
        <FieldLabel>알레르기 주의 항목</FieldLabel>
        <ChipRow>
          {MealAllergen.options.map((allergen) => (
            <Chip
              key={allergen}
              label={MEAL_ALLERGEN_LABEL[allergen]}
              selected={allergens.includes(allergen)}
              onPress={() => {
                setAllergens(
                  allergens.includes(allergen)
                    ? allergens.filter((value) => value !== allergen)
                    : [...allergens, allergen],
                );
                setDirty(true);
              }}
            />
          ))}
        </ChipRow>
        <Note tone="warn">
          알려진 음식명·재료만 보조적으로 걸러요. 원재료 누락이나 조리 중 교차접촉까지 확인할 수 없으므로,
          심한 알레르기는 제품 표시와 식당에 반드시 다시 확인해 주세요.
        </Note>

        <FieldLabel>취향상 제외할 음식</FieldLabel>
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
          이름과 알려진 재료가 맞으면 추천 후보에서 빼지만, 재료 정보가 없는 음식은 남을 수 있어요.
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
      </MealSection>

      <MealSection>
        <MealSectionTitle
          title="영양소 점검 기준"
          sub="분석 탭의 영양소 점검이 성별·나이에 맞는 섭취기준으로 봐요. 비워 두면 30-49세 성인 기준(남녀 중 낮은 값)으로 봐요."
        />
        <FieldLabel>성별</FieldLabel>
        <ChipRow>
          {MEAL_SEX_OPTIONS.map((o) => (
            <Chip
              key={o.label}
              label={o.label}
              selected={sex === o.value}
              onPress={() => {
                setSex(o.value);
                setDirty(true);
              }}
            />
          ))}
        </ChipRow>
        <FieldLabel>출생연도</FieldLabel>
        <TextInput
          value={birthYear}
          onChangeText={(v) => {
            setBirthYear(v.replace(/\D/g, '').slice(0, 4));
            setDirty(true);
          }}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="예: 1990"
          placeholderTextColor={theme.colors.textMuted}
          accessibilityLabel="출생연도"
          style={[styles.input, styles.yearInput]}
        />
        <Text style={styles.hint}>나이 구간을 고르는 데만 쓰고 공개되지 않아요.</Text>
      </MealSection>

      {error ? <Note tone="warn">{error}</Note> : null}

      <MealButton
        label={save.isSuccess && !dirty ? '저장했어요' : '추천 설정 저장'}
        onPress={onSave}
        loading={save.isPending}
        disabled={!dirty}
      />

      <MealReminderSettingsCard slots={slots} />

      <MealDataManagementCard />
    </ScrollView>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 48 },
    weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    weightDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    weightText: { flex: 1, minWidth: 0, gap: 3 },
    weightLabel: { fontSize: mealFont.body, fontWeight: '600', color: theme.colors.text },
    weightDesc: { fontSize: mealFont.caption, color: theme.colors.textMuted, marginBottom: 3 },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: mealRadius.small,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: mealFont.callout,
    },
    hint: { fontSize: mealFont.caption, color: theme.colors.textMuted },
    yearInput: { width: 120 },
  });
