import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
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
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { useMediaQuery } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { MealFoodSheet, type MealFoodSheetMode } from './MealFoodSheet';
import { MealItemInputRow } from './MealItemInputRow';
import { MealPhotoSection } from './MealPhotoSection';
import { MealSurface } from './MealSurface';
import { useMealDraftReady } from './useMealDraftReady';
import { useMealPhotoIntake } from './useMealPhotoIntake';
import {
  emptyMealItem,
  isMealDraftChanged,
  isMealDraftStale,
  startFreshMealDraft,
} from './mealDraftStart';
import { useMealFrame, useMealLeave, useMealOpen } from './mealPanel';
import { receiveMealPhotos } from './mealPhotoHandoff';
import { MEAL_PATH } from './mealPaths';

// 식단 입력(웹) — 새 기록 / 기존 기록 수정. 사진을 넣으면 음식을 인식해 채우고(useMealPhotoIntake), 손으로
// 적어도 된다. 사진·인식 규칙은 앱과 같다.
//
// 앱과 같은 mealDraftStore 를 쓴다(웹은 sessionStorage, 탭 수명). 그래서 새로고침해도 쓰던
// 기록이 남고, 추천 탭의 "먹은 메뉴 기록"·상세의 "수정"·"같은 메뉴로 새 기록"이 draft 를 채운 뒤 이 화면으로
// 넘어온다. 새로고침 직후에는 draft 복원이 끝날 때까지(useMealDraftReady) 화면을 열지 않는다.
//
// 2026-11-08 리뉴얼: 데스크톱은 모달 패널(약 880px — 왼쪽 사진·음식, 오른쪽 언제·어떻게, 아래 저장 줄), 좁은 화면은
// 자체 상단바 + 아래 고정 저장 줄. 닫기(✕·Esc·바깥·←)는 새 기록이면 쓰던 것을 남겨 두고(다음에 이어 쓴다), 수정이면
// 고친 내용이 있을 때 버릴지 묻는다(다시 '수정'을 누르면 서버 기록으로 새로 채워 고친 것이 사라진다).

// 'HH:MM' — eatenAt(ISO)은 UTC 지만 입력·표시는 로컬.
const timeValue = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

const NEW_FALLBACK = { to: MEAL_PATH.home, label: '식단 홈' };

export const MealNewPage = () => (
  <MealDraftGate fallback={NEW_FALLBACK}>
    <NewMealDraft />
  </MealDraftGate>
);

export const MealEditPage = () => {
  const { id = '' } = useParams();
  return (
    <MealDraftGate fallback={{ to: MEAL_PATH.entry(id), label: '기록으로' }}>
      <EditMealDraft id={id} />
    </MealDraftGate>
  );
};

type Fallback = { to: string; label: string };

const MealDraftGate = ({ fallback, children }: { fallback: Fallback; children: ReactNode }) => {
  const me = useCurrentUser();
  const ready = useMealDraftReady();
  if (ready) return <>{children}</>;
  return (
    <MealSurface title="식단 기록" fallback={fallback}>
      {me.isError ? (
        <ErrorBox message="로그인 정보를 확인하지 못했어요." onRetry={() => void me.refetch()} />
      ) : (
        <Loading />
      )}
    </MealSurface>
  );
};

const NewMealDraft = () => {
  const needsStart = useMealDraftStore((s) => s.entryId !== null || s.eatenDate === '');
  const started = useRef(false);
  // 한참 전에 쓰다 둔 새 기록으로 열리면 알린다 — 닫기(✕)가 쓰던 것을 남겨 두기 때문이다. 방금 채워 넘어온 draft
  // (홈의 끼니 칸·추천의 먹은 메뉴·같은 메뉴로 새 기록)는 새것이라 알리지 않는다.
  const [continued, setContinued] = useState(() =>
    isMealDraftStale(useMealDraftStore.getState(), Date.now()),
  );

  // 이어 쓸 새 기록이 없으면(처음 열었거나 수정하던 draft 가 남아 있으면) 지금 시각으로 연다.
  // 탭 안에서 쓰다 만 새 기록은 그대로 이어진다(앱과 같은 규칙). draft 가 외부 저장소라 effect 다.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const current = useMealDraftStore.getState();
    if (current.entryId === null && current.eatenDate !== '') return;
    startFreshMealDraft(new Date());
  }, []);

  if (needsStart) {
    return (
      <MealSurface title="식단 기록" fallback={NEW_FALLBACK}>
        <Loading />
      </MealSurface>
    );
  }
  return (
    <MealEntryForm
      entryId={null}
      notice={
        continued ? (
          <p className="meal-note">
            쓰다 둔 기록을 이어서 열었어요.
            <button
              type="button"
              className="meal-note-action"
              onClick={() => {
                startFreshMealDraft(new Date());
                setContinued(false);
              }}
            >
              새로 쓰기
            </button>
          </p>
        ) : null
      }
    />
  );
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
    <MealSurface
      title="식단 수정"
      fallback={{ to: MEAL_PATH.entry(id), label: '기록으로' }}
      entryId={id}
    >
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
    </MealSurface>
  );
};

const MealEntryForm = ({ entryId, notice }: { entryId: string | null; notice?: ReactNode }) => {
  const frame = useMealFrame();
  const open = useMealOpen();
  const draft = useMealDraftStore();
  const original = useMealEntry(entryId);
  const timePresets = useMealTimePresets();
  const create = useCreateMealEntry();
  const update = useUpdateMealEntry();
  const photoIntake = useMealPhotoIntake();
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  // "음식 추가"로 막 만든 줄에만 포커스를 준다(처음 열 때는 자동 포커스하지 않는다).
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  // 휴대폰은 음식을 '음식 찾기' 시트에서 넣는다(입력칸 아래 자동완성은 키보드에 가린다).
  const compact = useMediaQuery('(max-width: 47.99rem)', false);
  const [sheet, setSheet] = useState<MealFoodSheetMode | null>(null);

  // 식단 어디서든 끌어다 놓거나 붙여넣은 사진(MealPhotoDrop)을 이 기록에 넣는다 — 맡아 둔 사진이 있으면 열자마자.
  // 받는 창구는 문서 밖(모듈) 상태라 effect, 최신 넣기 함수는 ref 로 읽어 다시 달지 않는다.
  const addPhotosRef = useRef(photoIntake.addFiles);
  useEffect(() => {
    addPhotosRef.current = photoIntake.addFiles;
  });
  useEffect(() => receiveMealPhotos((files) => void addPhotosRef.current(files)), []);

  const saving = create.isPending || update.isPending;
  // 사진을 올리거나 인식하는 동안은 저장을 막는다(앱과 같이) — 끝나야 사진·인식 결과가 함께 저장된다.
  const canSave =
    draft.items.some((item) => item.name.trim().length > 0) && !saving && !photoIntake.busy;
  const fallbackPath = entryId ? MEAL_PATH.entry(entryId) : MEAL_PATH.home;
  const fallback = { to: fallbackPath, label: entryId ? '기록으로' : '식단 홈' };
  // 들어온 화면(목록·추천·상세)으로 돌아간다. 주소로 바로 열었으면 돌아갈 곳이 없어 기본 경로로.
  const leave = useMealLeave(fallbackPath);
  const today = toLocalDateKey(new Date());
  const Heading = frame.type === 'panel' ? 'h3' : 'h2';

  // 닫기(✕·Esc·바깥·←) — 고치던 기록에 저장 안 한 내용이 있으면 묻는다. 새 기록은 남겨 두고 닫는다.
  const requestClose = () => {
    if (
      entryId &&
      original.data &&
      isMealDraftChanged(useMealDraftStore.getState(), original.data)
    ) {
      setDiscardOpen(true);
      return;
    }
    leave();
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
    draft.addItem(emptyMealItem());
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
        // 새 기록은 방금 만든 기록의 상세로(입력 자리를 바꿔 뒤로 가면 들어온 화면 — 패널이면 같은 배경 위 상세 패널).
        // 들어온 화면으로 돌아가면 "같은 메뉴로 새 기록"을 상세에서 눌렀을 때 원래 기록이 그대로 보여 저장이 안 된
        // 것처럼 보였다.
        if (createdId) open(MEAL_PATH.entry(createdId), { replace: true });
        else leave();
      } catch (e) {
        if (isMealDraftIdentityCurrent(identity)) {
          setError(e instanceof ApiError ? e.message : '저장에 실패했어요.');
        }
      }
    });
  };

  return (
    <MealSurface
      title={entryId ? '식단 수정' : '식단 기록'}
      meta={
        entryId
          ? '음식·시각·메모·사진을 고칠 수 있어요.'
          : '사진을 넣으면 음식을 찾아 채워요. 직접 적어도 돼요.'
      }
      fallback={fallback}
      onClose={requestClose}
      entryId={entryId ?? undefined}
      overlay={
        <ConfirmDialog
          open={discardOpen}
          title="고친 내용 버리기"
          description="저장하지 않고 닫으면 고친 내용이 사라져요."
          confirmLabel="버리고 닫기"
          cancelLabel="계속 고치기"
          variant="destructive"
          onConfirm={() => {
            setDiscardOpen(false);
            useMealDraftStore.getState().clear();
            leave();
          }}
          onClose={() => setDiscardOpen(false)}
        />
      }
      footer={
        <>
          {error ? (
            <p role="alert" className="meal-foot-error">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="meal-btn-line ml-auto"
            disabled={saving}
            onClick={() => {
              draft.clear();
              leave();
            }}
          >
            취소
          </button>
          <button type="button" className="meal-btn" onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <div className="meal-form">
        <div className="meal-form-main">
          {notice}
          {draft.originRecommendationId ? (
            <p className="meal-note">
              추천에서 고른 메뉴예요. 저장하면 그 추천을 실제로 먹은 것으로 이어요.
            </p>
          ) : null}

          <MealPhotoSection intake={photoIntake} heading={Heading} />

          <section className="meal-sec" aria-labelledby="meal-form-foods">
            <div className="meal-sec-head">
              <Heading id="meal-form-foods" className="meal-sec-title">
                먹은 음식
              </Heading>
            </div>
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">
              {compact
                ? '음식 찾기에서 내 기록·음식 목록으로 고르거나, 친 이름 그대로 넣을 수 있어요.'
                : '이름을 치면 음식 목록에서 골라 분류·영양을 붙일 수 있어요. 목록에 없으면 그대로 적어도 돼요.'}
            </p>
            <div className="space-y-2.5">
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
                    // 빈 줄은 이어서 여러 개 넣는 '찾기', 이름 있는 줄은 그 줄만 바꾸는 '바꾸기'.
                    onOpenSearch={
                      compact
                        ? () =>
                            setSheet(
                              item.name.trim()
                                ? { kind: 'replace', clientId: item.clientId }
                                : { kind: 'add' },
                            )
                        : undefined
                    }
                  />
                ))
              )}
              {draft.items.length < MEAL_MAX_ITEMS_PER_ENTRY ? (
                <button
                  type="button"
                  className="meal-btn-line"
                  onClick={compact ? () => setSheet({ kind: 'add' }) : addItem}
                >
                  <Plus className="size-4" aria-hidden />
                  음식 추가
                </button>
              ) : null}
            </div>
            {sheet ? (
              <MealFoodSheet mode={sheet} slot={draft.slot} onClose={() => setSheet(null)} />
            ) : null}
          </section>
        </div>

        <div className="meal-form-side">
          <section className="meal-sec" aria-labelledby="meal-form-when">
            <Heading id="meal-form-when" className="meal-sec-title mb-3">
              언제 먹었나요
            </Heading>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={draft.eatenDate}
                  max={today}
                  onChange={(event) => changeDate(event.target.value)}
                  aria-label="먹은 날짜"
                  className="meal-input"
                />
                <input
                  type="time"
                  value={timeValue(draft.eatenAt)}
                  onChange={(event) => changeTime(event.target.value)}
                  aria-label="먹은 시각"
                  className="meal-input"
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
            </div>
          </section>

          <section className="meal-sec" aria-labelledby="meal-form-how">
            <Heading id="meal-form-how" className="meal-sec-title mb-3">
              어떻게 먹었나요
            </Heading>
            <div className="space-y-4">
              <Field label="식사 방식">
                {MEAL_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={MEAL_TYPE_LABEL[type]}
                    selected={draft.mealType === type}
                    onClick={() =>
                      draft.setField('mealType', draft.mealType === type ? null : type)
                    }
                  />
                ))}
              </Field>
              {draft.placeName ? (
                <div className="space-y-1.5">
                  <p className="meal-field-label">식당 / 장소</p>
                  <div className="flex items-center gap-2">
                    <span className="meal-input min-w-0 flex-1 truncate">{draft.placeName}</span>
                    <button
                      type="button"
                      className="meal-btn-quiet"
                      onClick={() => {
                        draft.setField('placeId', null);
                        draft.setField('placeName', null);
                      }}
                    >
                      지우기
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <label htmlFor="meal-memo" className="meal-field-label">
                  메모
                </label>
                <textarea
                  id="meal-memo"
                  value={draft.memo}
                  onChange={(event) => draft.setField('memo', event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="선택 — 같이 먹은 사람, 기분 등"
                  className="meal-input w-full"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </MealSurface>
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
      <p className="meal-field-label">빠르게 추가</p>
      <div className="flex flex-wrap gap-1.5">
        {list.map((quick) => (
          <button
            key={quick.name}
            type="button"
            aria-pressed={chosen.has(mealItemNameKey(quick.name))}
            title={quick.count > 0 ? `최근 90일 ${quick.count}번` : '기본 목록'}
            onClick={() => toggleQuickItem(quick)}
            className="meal-opt"
          >
            {quick.name}
          </button>
        ))}
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <p className="meal-field-label">{label}</p>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

// selected 를 주지 않으면 켜고 끄는 선택지가 아니라 한 번 누르는 동작 버튼이다(지금·평소 시각).
const Chip = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={cn('meal-opt', selected === undefined && 'meal-opt-action')}
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
  <div className="space-y-3 py-10 text-center">
    <p className="text-sm text-destructive">{message}</p>
    <button type="button" className="meal-btn-line" onClick={onRetry}>
      재시도
    </button>
  </div>
);
