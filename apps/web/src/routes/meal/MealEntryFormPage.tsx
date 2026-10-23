import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { MEAL_MAX_ITEMS_PER_ENTRY, type MealSlotType } from '@repo/api-contract';
import {
  ApiError,
  draftItemToInput,
  getMealDraftIdentity,
  isMealDraftIdentityCurrent,
  mealDraftInitFromEntry,
  mealItemNameKey,
  runMealDraftSaveSingleFlight,
  useCreateMealEntry,
  useCurrentUser,
  useFrequentMealItems,
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
import { MEAL_MAIN_CLASS, MEAL_PAGE_CLASS, MEAL_SIDE_CLASS, MEAL_SPLIT_CLASS } from './mealLayout';
import { MealPhotoSection } from './MealPhotoSection';
import { useMealDraftReady } from './useMealDraftReady';
import { useMealPhotoIntake } from './useMealPhotoIntake';

// 식단 입력(웹) — 새 기록 / 기존 기록 수정. 사진을 넣으면 음식을 인식해 채우고(useMealPhotoIntake), 손으로
// 적어도 된다. 사진·인식 규칙은 앱과 같다.
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
  const photoIntake = useMealPhotoIntake();
  const [error, setError] = useState<string | null>(null);
  // "음식 추가"로 막 만든 줄에만 포커스를 준다(처음 열 때는 자동 포커스하지 않는다).
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;
  // 사진을 올리거나 인식하는 동안은 저장을 막는다(앱과 같이) — 끝나야 사진·인식 결과가 함께 저장된다.
  const canSave = draft.items.some((item) => item.name.trim().length > 0) && !saving && !photoIntake.busy;
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
        // 수정도 사진 전체를 보낸다 — 서버는 받은 목록으로 갈아끼우고 빠진 사진을 지운다(draft 가 기존 사진을 들고 연다).
        photoTokens: current.photos.map((photo) => photo.token),
      };
      try {
        let createdId: string | null = null;
        if (entryId) {
          await update.mutateAsync({
            id: entryId,
            input: payload,
            expectedPrincipalId: identity.principalId,
          });
        } else {
          const created = await create.mutateAsync({
            input: {
              ...payload,
              source: current.originRecommendationId
                ? 'recommendation'
                : current.recognition || current.photos.length > 0
                  ? 'photo'
                  : 'manual',
              originRecommendationId: current.originRecommendationId,
              recognition: current.recognition,
            },
            expectedPrincipalId: identity.principalId,
          });
          createdId = created.id;
        }
        if (!isMealDraftIdentityCurrent(identity)) return;
        if (!useMealDraftStore.getState().clear(identity.sessionId)) return;
        // 새 기록은 방금 만든 기록의 상세로(입력 화면 자리를 바꿔 뒤로 가면 들어온 화면). 들어온 화면으로 돌아가면
        // "같은 메뉴로 새 기록"을 상세에서 눌렀을 때 원래 기록이 그대로 보여 저장이 안 된 것처럼 보였다.
        if (createdId) navigate(`/me/meals/${createdId}`, { replace: true });
        else leave();
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
            ? '음식·시각·메모·사진을 고칠 수 있어요.'
            : '사진을 넣으면 음식을 찾아 채워요. 직접 적어도 돼요.'}
        </p>
      </header>

      <div className={MEAL_SPLIT_CLASS}>
        <div className={MEAL_MAIN_CLASS}>
          {draft.originRecommendationId ? (
            <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              추천에서 고른 메뉴예요. 저장하면 그 추천을 실제로 먹은 것으로 이어요.
            </p>
          ) : null}

          <MealPhotoSection intake={photoIntake} />

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">먹은 음식</CardTitle>
              <p className="text-xs text-muted-foreground">
                이름을 치면 음식 목록에서 골라 분류·영양을 붙일 수 있어요. 목록에 없으면 그대로 적어도 돼요.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <QuickAddChips slot={draft.slot} />
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
        </div>

        {/* 데스크톱은 언제·어떻게를 오른쪽 패널에 붙여 두고 저장 줄은 화면 아래에 둔다 — 한 단일 땐 저장 버튼이
            1,251px 아래였다. 패널 높이는 저장 줄(약 60px)에 끝이 가리지 않게 그만큼 줄인다. */}
        <div className={cn(MEAL_SIDE_CLASS, 'lg:max-h-[calc(100dvh-10rem)]')}>
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
        </div>
      </div>

      {/* 저장 줄 — 데스크톱은 화면 아래에 붙여 둔다(오른쪽 패널 맨 아래면 첫 화면 밖이었다). 좁은 화면은 예전처럼
          맨 끝에 오류 → 버튼. */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 lg:sticky lg:bottom-0 lg:z-10 lg:-mx-6 lg:border-t lg:bg-background/95 lg:px-6 lg:py-3 lg:backdrop-blur">
        {error ? (
          <p role="alert" className="basis-full text-sm text-destructive lg:mr-auto lg:basis-auto">
            {error}
          </p>
        ) : null}
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
    </PageFrame>
  );
};

// 빠른 추가 — 자주 먹는 음식(고른 끼니 우선)과 기본 목록. 누르면 넣고, 이미 있으면 뺀다.
// 반찬은 반찬으로 들어간다(주식으로 넣으면 통상 1인분으로 커져 멸치볶음이 690kcal 가 된다).
const QuickAddChips = ({ slot }: { slot: MealSlotType }) => {
  const frequent = useFrequentMealItems(slot);
  const items = useMealDraftStore((s) => s.items);
  const toggleQuickItem = useMealDraftStore((s) => s.toggleQuickItem);
  const list = frequent.data?.items ?? [];
  if (list.length === 0) return null;
  const chosen = new Set(items.map((item) => mealItemNameKey(item.name)));
  return (
    <div className="space-y-1.5 pb-1">
      <p className="text-xs font-medium text-muted-foreground">빠르게 추가</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((quick) => (
          <button
            key={quick.name}
            type="button"
            aria-pressed={chosen.has(mealItemNameKey(quick.name))}
            title={quick.count > 0 ? `최근 90일 ${quick.count}번` : '기본 목록'}
            onClick={() => toggleQuickItem(quick)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              chosen.has(mealItemNameKey(quick.name))
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent',
            )}
          >
            {quick.name}
          </button>
        ))}
      </div>
    </div>
  );
};

const PageFrame = ({ children }: { children: ReactNode }) => (
  <div className={MEAL_PAGE_CLASS}>{children}</div>
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
