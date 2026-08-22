import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  MEAL_WEIGHT_PRESETS,
  type MealSlotType,
  type MealTypeType,
  type MealWeightsType,
} from '@repo/api-contract';
import { useMealPreference, useUpdateMealPreference } from '@repo/shared';
import { MEAL_SLOTS, MEAL_SLOT_LABEL, MEAL_TYPES, MEAL_TYPE_LABEL } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

// 추천 중요도(가중치) + 하드 제약(제외 음식·식사 유형·기록 끼니). 가중치는 0~5 슬라이더,
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
  const [liked, setLiked] = useState('');
  const [slots, setSlots] = useState<MealSlotType[]>([]);
  const [mealTypes, setMealTypes] = useState<MealTypeType[]>([]);
  const [dirty, setDirty] = useState(false);

  // 서버 값이 도착하면 폼 초기화(사용자가 이미 손댔으면 덮어쓰지 않는다).
  useEffect(() => {
    if (!pref.data || dirty) return;
    setWeights(pref.data.weights);
    setExcluded(pref.data.excludedFoods.join(', '));
    setLiked(pref.data.likedFoods.join(', '));
    setSlots(pref.data.slots);
    setMealTypes(pref.data.mealTypes);
  }, [pref.data, dirty]);

  if (pref.isLoading || !weights) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 불러오는 중…
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
    save.mutate(
      {
        weights,
        excludedFoods: parseList(excluded),
        likedFoods: parseList(liked),
        slots: slots.length > 0 ? slots : undefined,
        mealTypes,
        onboarded: true,
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">무엇을 중요하게 볼까요</CardTitle>
          <p className="text-sm text-muted-foreground">추천이 이 비중대로 골라요. 0이면 아예 보지 않아요.</p>
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
          <Field
            label="못 먹는 / 싫어하는 음식"
            hint="쉼표로 구분. 이름은 물론 재료까지 봐요 — '오이'를 적으면 오이냉국뿐 아니라 오이가 들어간 김밥도 빠져요."
            value={excluded}
            onChange={(v) => {
              setExcluded(v);
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
                    setMealTypes(mealTypes.includes(t) ? mealTypes.filter((x) => x !== t) : [...mealTypes, t]);
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
                    setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s]);
                    setDirty(true);
                  }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={save.isPending || !dirty}>
          {save.isPending ? '저장 중…' : '저장'}
        </Button>
        {save.isSuccess && !dirty ? <span className="text-sm text-muted-foreground">저장했어요.</span> : null}
        {save.error ? (
          <span className="text-sm text-destructive">
            {save.error instanceof Error ? save.error.message : '저장 실패'}
          </span>
        ) : null}
      </div>
    </div>
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

const Toggle = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
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
