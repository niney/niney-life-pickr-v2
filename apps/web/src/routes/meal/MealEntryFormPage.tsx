import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { MEAL_MAX_ITEMS_PER_ENTRY } from '@repo/api-contract';
import {
  ApiError,
  draftItemToInput,
  getMealDraftIdentity,
  isMealDraftIdentityCurrent,
  mealDraftInitFromEntry,
  runMealDraftSaveSingleFlight,
  useCreateMealEntry,
  useCurrentUser,
  useMealDraftStore,
  useMealEntry,
  useMealTimePresets,
  useUpdateMealEntry,
  type MealDraftItem,
} from '@repo/shared';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  guessMealSlot,
  parseLocalDateKey,
  parseTimeOfDay,
  toLocalDateKey,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { MealItemInputRow } from './MealItemInputRow';
import { MealPhotoImg } from './MealPhotoImg';
import { useMealDraftReady } from './useMealDraftReady';

// 식단 입력(웹) — 손으로 적는 새 기록 / 기존 기록 수정. 사진 촬영·인식은 앱에서만 한다.
//
// 앱과 같은 mealDraftStore 를 쓴다(웹은 sessionStorage, 탭 수명). 그래서 새로고침해도 쓰던
// 기록이 남고, 추천 탭의 "먹은 메뉴 기록"·상세의 "수정"·"다시 기록"이 draft 를 채운 뒤 이 화면으로
// 넘어온다. 새로고침 직후에는 draft 복원이 끝날 때까지(useMealDraftReady) 화면을 열지 않는다.

const emptyItem = (): Omit<MealDraftItem, 'clientId'> => ({
  name: '',
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  portion: null,
  isMain: true,
  confidence: null,
  source: 'manual',
  candidates: [],
});

// 'HH:MM' — eatenAt(ISO)은 UTC 지만 입력·표시는 로컬.
const timeValue = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealNewPage = () => (
  <MealDraftGate>
    <NewMealDraft />
  </MealDraftGate>
);

export const MealEditPage = () => {
  const { id = '' } = useParams();
  return (
    <MealDraftGate>
      <EditMealDraft id={id} />
    </MealDraftGate>
  );
};

const MealDraftGate = ({ children }: { children: ReactNode }) => {
  const me = useCurrentUser();
  const ready = useMealDraftReady();
  if (ready) return <>{children}</>;
  if (me.isError) {
    return (
      <PageFrame>
        <ErrorBox message="로그인 정보를 확인하지 못했어요." onRetry={() => void me.refetch()} />
      </PageFrame>
    );
  }
  return (
    <PageFrame>
      <Loading />
    </PageFrame>
  );
};

const NewMealDraft = () => {
  const needsStart = useMealDraftStore((s) => s.entryId !== null || s.eatenDate === '');
  const started = useRef(false);

  // 이어 쓸 새 기록이 없으면(처음 열었거나 수정하던 draft 가 남아 있으면) 지금 시각으로 연다.
  // 탭 안에서 쓰다 만 새 기록은 그대로 이어진다(앱과 같은 규칙). draft 가 외부 저장소라 effect 다.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const current = useMealDraftStore.getState();
    if (current.entryId === null && current.eatenDate !== '') return;
    const now = new Date();
    current.start({ eatenAt: now.toISOString(), eatenDate: toLocalDateKey(now), slot: guessMealSlot(now) });
    useMealDraftStore.getState().addItem(emptyItem());
  }, []);

  if (needsStart) {
    return (
      <PageFrame>
        <Loading />
      </PageFrame>
    );
  }
  return <MealEntryForm entryId={null} />;
};

const EditMealDraft = ({ id }: { id: string }) => {
  const entry = useMealEntry(id);
  const draftEntryId = useMealDraftStore((s) => s.entryId);
  const initialized = useRef(false);

  // 상세의 "수정"은 draft 를 채운 뒤 들어온다. 주소로 바로 열었을 때만 서버 기록으로 채우고,
  // 같은 기록을 고치던 draft 가 탭에 남아 있으면(새로고침) 그대로 이어 쓴다.
  useEffect(() => {
    if (!entry.data || initialized.current) return;
    initialized.current = true;
    if (useMealDraftStore.getState().entryId !== entry.data.id) {
      useMealDraftStore.getState().start(mealDraftInitFromEntry(entry.data));
    }
  }, [entry.data]);

  if (draftEntryId === id) return <MealEntryForm entryId={id} />;
  return (
    <PageFrame>
      {entry.error ? (
        <ErrorBox
          message={
            entry.error instanceof ApiError && entry.error.statusCode === 404
              ? '기록을 찾을 수 없어요.'
              : '기록을 불러오지 못했어요.'
          }
          onRetry={() => void entry.refetch()}
        />
      ) : (
        <Loading />
      )}
    </PageFrame>
  );
};

const MealEntryForm = ({ entryId }: { entryId: string | null }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const draft = useMealDraftStore();
  const timePresets = useMealTimePresets();
  const create = useCreateMealEntry();
  const update = useUpdateMealEntry();
  const [error, setError] = useState<string | null>(null);
  // "음식 추가"로 막 만든 줄에만 포커스를 준다(처음 열 때는 자동 포커스하지 않는다).
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;
  const canSave = draft.items.some((item) => item.name.trim().length > 0) && !saving;
  const fallbackPath = entryId ? `/me/meals/${entryId}` : '/me/meals';
  const today = toLocalDateKey(new Date());

  // 들어온 화면(목록·추천·상세)으로 돌아간다. 주소로 바로 열었으면 돌아갈 곳이 없어 기본 경로로.
  const leave = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(fallbackPath, { replace: true });
  };

  const setEatenAt = (d: Date) => {
    draft.setField('eatenAt', d.toISOString());
    draft.setField('eatenDate', toLocalDateKey(d));
  };

  // 날짜를 바꿔도 시:분은 그대로, 시:분을 바꿔도 날짜는 그대로 둔다.
  const changeDate = (key: string) => {
    const day = parseLocalDateKey(key);
    if (!day) return;
    const d = new Date(draft.eatenAt);
    d.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setEatenAt(d);
  };

  const changeTime = (hhmm: string) => {
    const minutes = parseTimeOfDay(hhmm);
    if (minutes === null) return;
    const d = new Date(draft.eatenAt);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    setEatenAt(d);
  };

  const addItem = () => {
    draft.addItem(emptyItem());
    setFocusItemId(useMealDraftStore.getState().items.at(-1)?.clientId ?? null);
  };

  const save = () => {
    const identity = getMealDraftIdentity();
    void runMealDraftSaveSingleFlight(identity, async () => {
      setError(null);
      const current = useMealDraftStore.getState();
      const items = current.items.filter((item) => item.name.trim().length > 0);
      if (items.length === 0) {
        setError('음식을 하나 이상 적어 주세요.');
        return;
      }
      const payload = {
        eatenAt: new Date(current.eatenAt).toISOString(),
        eatenDate: current.eatenDate || toLocalDateKey(new Date(current.eatenAt)),
        slot: current.slot,
        mealType: current.mealType,
        placeId: current.placeId,
        placeName: current.placeName,
        memo: current.memo.trim() ? current.memo.trim() : null,
        items: items.map(draftItemToInput),
      };
      try {
        if (entryId) {
          // 사진은 앱에서만 바꾼다 — photoTokens 를 보내지 않아야 서버가 기존 사진 연결을 그대로 둔다.
          await update.mutateAsync({
            id: entryId,
            input: payload,
            expectedPrincipalId: identity.principalId,
          });
        } else {
          await create.mutateAsync({
            input: {
              ...payload,
              source: current.originRecommendationId ? 'recommendation' : 'manual',
              originRecommendationId: current.originRecommendationId,
              photoTokens: [],
            },
            expectedPrincipalId: identity.principalId,
          });
        }
        if (!isMealDraftIdentityCurrent(identity)) return;
        if (useMealDraftStore.getState().clear(identity.sessionId)) leave();
      } catch (e) {
        if (isMealDraftIdentityCurrent(identity)) {
          setError(e instanceof ApiError ? e.message : '저장에 실패했어요.');
        }
      }
    });
  };

  return (
    <PageFrame>
      <header className="mb-5 space-y-1">
        <BackLink to={fallbackPath} label={entryId ? '기록으로' : '내 식단'} />
        <h1 className="text-xl font-semibold">{entryId ? '식단 수정' : '식단 기록'}</h1>
        <p className="text-sm text-muted-foreground">
          {entryId
            ? '음식·시각·메모를 고칠 수 있어요. 사진은 앱에서 바꿔요.'
            : '먹은 음식을 직접 적어 남겨요. 사진으로 남기려면 앱을 써 주세요.'}
        </p>
      </header>

      <div className="space-y-4">
        {draft.originRecommendationId ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            추천에서 고른 메뉴예요. 저장하면 그 추천을 실제로 먹은 것으로 이어요.
          </p>
        ) : null}

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">먹은 음식</CardTitle>
            <p className="text-xs text-muted-foreground">
              이름을 치면 음식 목록에서 골라 분류·영양을 붙일 수 있어요. 목록에 없으면 그대로 적어도 돼요.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">음식을 추가해 주세요.</p>
            ) : (
              draft.items.map((item) => (
                <MealItemInputRow
                  key={item.clientId}
                  item={item}
                  autoFocus={item.clientId === focusItemId}
                  onChange={(patch) => draft.updateItem(item.clientId, patch)}
                  onRemove={() => draft.removeItem(item.clientId)}
                />
              ))
            )}
            {draft.items.length < MEAL_MAX_ITEMS_PER_ENTRY ? (
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="size-4" />
                음식 추가
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">언제 먹었나요</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={draft.eatenDate}
                max={today}
                onChange={(event) => changeDate(event.target.value)}
                aria-label="먹은 날짜"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={timeValue(draft.eatenAt)}
                onChange={(event) => changeTime(event.target.value)}
                aria-label="먹은 시각"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Chip
                label="지금"
                onClick={() => {
                  const now = new Date();
                  setEatenAt(now);
                  draft.setField('slot', guessMealSlot(now));
                }}
              />
            </div>
            {(timePresets.data?.presets.length ?? 0) > 0 ? (
              <Field label="끼니별 평소 시각">
                {timePresets.data!.presets.map((preset) => (
                  <Chip
                    key={preset.slot}
                    label={`${MEAL_SLOT_LABEL[preset.slot]} ${preset.time}`}
                    // 시각과 끼니를 함께 정하고 날짜는 건드리지 않는다.
                    onClick={() => {
                      changeTime(preset.time);
                      draft.setField('slot', preset.slot);
                    }}
                  />
                ))}
              </Field>
            ) : null}
            <Field label="끼니">
              {MEAL_SLOTS.map((slot) => (
                <Chip
                  key={slot}
                  label={MEAL_SLOT_LABEL[slot]}
                  selected={draft.slot === slot}
                  onClick={() => draft.setField('slot', slot)}
                />
              ))}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">어떻게 먹었나요</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="식사 방식">
              {MEAL_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={MEAL_TYPE_LABEL[type]}
                  selected={draft.mealType === type}
                  onClick={() => draft.setField('mealType', draft.mealType === type ? null : type)}
                />
              ))}
            </Field>
            {draft.placeName ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">식당 / 장소</p>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-sm">
                    {draft.placeName}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      draft.setField('placeId', null);
                      draft.setField('placeName', null);
                    }}
                  >
                    지우기
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="meal-memo" className="text-xs font-medium text-muted-foreground">
                메모
              </label>
              <textarea
                id="meal-memo"
                value={draft.memo}
                onChange={(event) => draft.setField('memo', event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="선택 — 같이 먹은 사람, 기분 등"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {draft.photos.length > 0 ? (
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">사진</CardTitle>
              <p className="text-xs text-muted-foreground">
                사진은 앱에서 추가·삭제해요. 여기서 저장해도 사진은 그대로 남아요.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {draft.photos.map((photo) => (
                <MealPhotoImg key={photo.token} token={photo.token} className="size-20" />
              ))}
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              draft.clear();
              leave();
            }}
          >
            취소
          </Button>
          <Button type="button" onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </div>
    </PageFrame>
  );
};

const PageFrame = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
);

const BackLink = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
    <ArrowLeft className="size-4" />
    {label}
  </Link>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

// selected 를 주지 않으면 켜고 끄는 선택지가 아니라 한 번 누르는 동작 버튼이다(지금·평소 시각).
const Chip = ({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={cn(
      'rounded-full border px-3 py-1.5 text-sm transition-colors',
      selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
    )}
  >
    {label}
  </button>
);

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" /> 불러오는 중…
  </div>
);

const ErrorBox = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Card>
    <CardContent className="space-y-3 py-8 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        재시도
      </Button>
    </CardContent>
  </Card>
);
