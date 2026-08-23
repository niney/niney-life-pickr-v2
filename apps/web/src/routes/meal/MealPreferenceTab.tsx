import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_ALLERGEN_LABEL,
  MEAL_WEIGHT_PRESETS,
  MealAllergen,
  type MealAllergenType,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
} from '@repo/api-contract';
import {
  useDeleteAllMealData,
  useExportMealData,
  useMealPreference,
  useUpdateMealPreference,
} from '@repo/shared';
import { MEAL_SLOTS, MEAL_SLOT_LABEL, MEAL_TYPES, MEAL_TYPE_LABEL } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

// 추천 중요도(가중치) + 절대 제외/소프트 비선호·식사 유형·기록 끼니. 가중치는 0~5 슬라이더,
// 프리셋은 네 가지 성향을 한 번에 채운다.

const WEIGHT_FIELDS: ReadonlyArray<{ key: keyof MealWeightsType; label: string; desc: string }> = [
  { key: 'variety', label: '겹침 피하기', desc: '최근 먹은 음식·분류를 피해요' },
  { key: 'taste', label: '내 취향', desc: '자주 먹고 좋아한 음식을 더 권해요' },
  { key: 'balance', label: '골고루', desc: '요즘 부족한 분류를 채워요' },
  { key: 'health', label: '건강', desc: '튀김·야식·나트륨을 줄이고 채소·단백질을 늘려요' },
  { key: 'novelty', label: '새로운 시도', desc: '안 먹어본 음식을 섞어요' },
  { key: 'weather', label: '날씨·계절', desc: '더우면 시원하게, 추우면 국물로' },
  { key: 'convenience', label: '간편함', desc: '집밥은 손 덜 가는 쪽, 외식은 흔한 메뉴' },
];

export const MealPreferenceTab = () => {
  const pref = useMealPreference();
  const save = useUpdateMealPreference();
  const [weights, setWeights] = useState<MealWeightsType | null>(null);
  const [excluded, setExcluded] = useState('');
  const [allergens, setAllergens] = useState<MealAllergenType[]>([]);
  const [disliked, setDisliked] = useState('');
  const [liked, setLiked] = useState('');
  const [slots, setSlots] = useState<MealSlotType[]>([]);
  const [mealTypes, setMealTypes] = useState<MealTypeType[]>([]);
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 서버 값이 도착하면 폼 초기화(사용자가 이미 손댔으면 덮어쓰지 않는다).
  useEffect(() => {
    if (!pref.data || dirty) return;
    setWeights(pref.data.weights);
    setExcluded(pref.data.excludedFoods.join(', '));
    setAllergens(pref.data.allergens ?? []);
    setDisliked(pref.data.dislikedFoods.join(', '));
    setLiked(pref.data.likedFoods.join(', '));
    setSlots(pref.data.slots);
    setMealTypes(pref.data.mealTypes);
  }, [pref.data, dirty]);

  if (pref.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (pref.isError) {
    return (
      <div className="space-y-3 rounded-lg border p-5 text-sm">
        <p className="text-destructive">식단 설정을 불러오지 못했어요.</p>
        <Button variant="outline" size="sm" onClick={() => void pref.refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }
  if (!weights) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 설정 준비 중…
      </div>
    );
  }

  const setWeight = (key: keyof MealWeightsType, value: number) => {
    setWeights({ ...weights, [key]: value });
    setDirty(true);
  };

  const parseList = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 50);

  const onSave = () => {
    setFormError(null);
    save.mutate(
      {
        weights,
        excludedFoods: parseList(excluded),
        allergens,
        dislikedFoods: parseList(disliked),
        likedFoods: parseList(liked),
        slots,
        mealTypes,
        onboarded: true,
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  return (
    <div className="space-y-4">
      {pref.data && !pref.data.onboarded ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">첫 추천을 위한 기본 설정</p>
          <p className="mt-1 text-xs text-muted-foreground">
            좋아하는 음식, 덜 선호하는 음식, 알레르기 주의 항목과 끼니를 저장하면 기록이 적어도
            반영돼요.
          </p>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">무엇을 중요하게 볼까요</CardTitle>
          <p className="text-sm text-muted-foreground">
            추천이 이 비중대로 골라요. 0이면 아예 보지 않아요.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(MEAL_WEIGHT_PRESETS).map(([key, preset]) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                onClick={() => {
                  setWeights(preset.weights);
                  setDirty(true);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {WEIGHT_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">{weights[f.key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={1}
                value={weights[f.key]}
                onChange={(e) => setWeight(f.key, Number(e.target.value))}
                aria-label={f.label}
                className="w-full accent-primary"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">먹는 것</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">알레르기 주의 항목</p>
            <div className="flex flex-wrap gap-2">
              {MealAllergen.options.map((allergen) => (
                <Toggle
                  key={allergen}
                  label={MEAL_ALLERGEN_LABEL[allergen]}
                  selected={allergens.includes(allergen)}
                  onClick={() => {
                    setAllergens(
                      allergens.includes(allergen)
                        ? allergens.filter((value) => value !== allergen)
                        : [...allergens, allergen],
                    );
                    setDirty(true);
                  }}
                />
              ))}
            </div>
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              알려진 음식명·재료만 보조적으로 걸러요. 원재료 누락이나 조리 중 교차접촉까지 확인할 수
              없으므로, 심한 알레르기는 제품 표시와 식당에 반드시 다시 확인해 주세요.
            </p>
          </div>
          <Field
            label="취향상 제외할 음식"
            hint="이름과 알려진 재료가 맞으면 추천 후보에서 빼지만, 재료 정보가 없는 음식은 남을 수 있어요."
            value={excluded}
            onChange={(v) => {
              setExcluded(v);
              setDirty(true);
            }}
          />
          <Field
            label="덜 선호하는 음식"
            hint="후보에서 지우지 않고 점수를 크게 낮춰 가능하면 피해요. 대안이 부족하면 나올 수 있어요."
            value={disliked}
            onChange={(v) => {
              setDisliked(v);
              setDirty(true);
            }}
          />
          <Field
            label="좋아하는 음식"
            hint="쉼표로 구분. 추천 후보에 항상 포함돼요."
            value={liked}
            onChange={(v) => {
              setLiked(v);
              setDirty(true);
            }}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">주로 하는 식사</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((t) => (
                <Toggle
                  key={t}
                  label={MEAL_TYPE_LABEL[t]}
                  selected={mealTypes.includes(t)}
                  onClick={() => {
                    setMealTypes(
                      mealTypes.includes(t) ? mealTypes.filter((x) => x !== t) : [...mealTypes, t],
                    );
                    setDirty(true);
                  }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">기록·추천할 끼니</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_SLOTS.map((s) => (
                <Toggle
                  key={s}
                  label={MEAL_SLOT_LABEL[s]}
                  selected={slots.includes(s)}
                  onClick={() => {
                    if (slots.includes(s) && slots.length === 1) {
                      setFormError('기록·추천할 끼니는 하나 이상 남겨 주세요.');
                      return;
                    }
                    setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s]);
                    setFormError(null);
                    setDirty(true);
                  }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <MealDataManagement />

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={save.isPending || !dirty}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
        {save.isSuccess && !dirty ? (
          <span className="text-sm text-muted-foreground">저장했어요.</span>
        ) : null}
        {save.error ? (
          <span className="text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : '저장 실패'}
          </span>
        ) : null}
      </div>
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
    </div>
  );
};

const MealDataManagement = () => {
  const exportData = useExportMealData();
  const deleteAll = useDeleteAllMealData();
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await exportData.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `meal-data-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice('JSON 파일을 만들었어요. 사진 원본은 포함되지 않아요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '식단 데이터를 내보내지 못했어요.');
    }
  };

  const handleDelete = async () => {
    if (confirmation !== MEAL_DATA_DELETE_CONFIRMATION) return;
    if (!window.confirm('식단 기록·사진·추천·선호 설정을 모두 영구 삭제할까요? 계정은 유지됩니다.'))
      return;
    setError(null);
    setNotice(null);
    try {
      const result = await deleteAll.mutateAsync({ confirmation: MEAL_DATA_DELETE_CONFIRMATION });
      setShowDelete(false);
      setConfirmation('');
      setNotice(`기록 ${result.deleted.entries}개와 사진 ${result.deleted.photos}개를 삭제했어요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '식단 데이터를 삭제하지 못했어요.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">내 데이터</CardTitle>
        <p className="text-sm text-muted-foreground">
          식단 기록은 공개되지 않으며 언제든 내보내거나 모두 삭제할 수 있어요.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void handleExport()}
            disabled={exportData.isPending || deleteAll.isPending}
          >
            {exportData.isPending ? '파일 만드는 중…' : 'JSON으로 내보내기'}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDelete((value) => !value)}
            disabled={deleteAll.isPending}
            aria-expanded={showDelete}
          >
            식단 데이터 전체 삭제
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          내보내기에는 기록·사진 메타·추천·선호 설정이 들어가며 사진 바이너리는 제외됩니다.
        </p>
        {showDelete ? (
          <div className="space-y-2 rounded-md border border-destructive/40 p-3">
            <p className="text-xs text-destructive">
              계정은 유지하고 식단 기능의 내 데이터만 삭제합니다. 아래 문구를 정확히 입력하세요.
            </p>
            <code className="block select-all rounded bg-muted px-2 py-1 text-xs">
              {MEAL_DATA_DELETE_CONFIRMATION}
            </code>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-label="식단 데이터 전체 삭제 확인 문구"
              placeholder="확인 문구 입력"
              autoComplete="off"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={confirmation !== MEAL_DATA_DELETE_CONFIRMATION || deleteAll.isPending}
            >
              {deleteAll.isPending ? '삭제 중…' : '영구 삭제'}
            </Button>
          </div>
        ) : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
};

const Field = ({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="space-y-1">
    <label className="text-sm font-medium">{label}</label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      placeholder="쉼표로 구분"
      aria-label={label}
    />
    <p className="text-xs text-muted-foreground">{hint}</p>
  </div>
);

const Toggle = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      'rounded-full border px-3 py-1.5 text-sm transition-colors',
      selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
    )}
  >
    {label}
  </button>
);
