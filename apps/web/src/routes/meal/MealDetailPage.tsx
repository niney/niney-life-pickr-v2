import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { MealEntrySourceType, MealEntryType } from '@repo/api-contract';
import {
  ApiError,
  mealDraftInitForRepeat,
  mealDraftInitFromEntry,
  useDeleteMealEntry,
  useMealDraftStore,
  useMealEntry,
} from '@repo/shared';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_PORTION_LABEL,
  MEAL_SLOT_LABEL,
  MEAL_TYPE_LABEL,
  mealDateLabel,
  summarizeMealNutrition,
  toLocalDateKey,
} from '@repo/utils';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { MealPhotoImg } from './MealPhotoImg';
import { MealPhotoLightbox } from './MealPhotoLightbox';
import { MealSurface, type MealSurfaceNav } from './MealSurface';
import { RecipeStoryLink } from './MealStoryLink';
import { useMealDraftReady } from './useMealDraftReady';
import { mealPanelStateOf, useMealFrame, useMealLeave, useMealOpen } from './mealPanel';
import { MEAL_PATH } from './mealPaths';

// 식단 상세(웹) — 한 끼의 음식·영양·사진을 보고 수정·같은 메뉴로 새 기록·삭제로 넘어간다.
// 수정과 같은 메뉴로 새 기록은 앱 상세와 같은 shared 도우미로 draft 를 채운 뒤 입력으로 보낸다.
// 2026-11-08 리뉴얼: 데스크톱은 목록 옆 패널(비모달 — 옆 목록 눌러 바꾸기·↑↓ 이전·다음), 좁은 화면은 자체 상단바 + 아래
// 동작 줄. 이 끼니의 영양은 포장 식품 '영양정보' 표의 말투로 — % 는 식품 표시의 1일 영양성분 기준치 대비다.

const SOURCE_LABEL: Record<MealEntrySourceType, string> = {
  photo: '사진 기록',
  manual: '직접 기록',
  recommendation: '추천에서 기록',
};

// 식품 등의 표시기준 1일 영양성분 기준치 — 포장 식품 영양정보 표의 % 와 같은 기준.
const DAILY_VALUE = { proteinG: 55, sodiumMg: 2000 } as const;

const FALLBACK = { to: MEAL_PATH.records, label: '기록' };

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export const MealDetailPage = () => {
  const { id = '' } = useParams();
  const location = useLocation();
  const frame = useMealFrame();
  const open = useMealOpen();
  const leave = useMealLeave(MEAL_PATH.records);
  const entry = useMealEntry(id);
  const remove = useDeleteMealEntry();
  const draftReady = useMealDraftReady();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // 패널의 이전·다음 — 연 목록의 순서(기록 상태에 실려 온다). 줄을 바꿔도 기록 한 칸이다(뒤로 = 닫기).
  const siblings = frame.type === 'panel' ? (mealPanelStateOf(location)?.mealSiblings ?? []) : [];
  const at = siblings.indexOf(id);
  const goTo = (target: string | undefined) =>
    target ? () => open(MEAL_PATH.entry(target), { siblings, swap: true }) : null;
  const nav: MealSurfaceNav | undefined =
    at >= 0 && siblings.length > 1
      ? { onPrev: goTo(siblings[at - 1]), onNext: goTo(siblings[at + 1]) }
      : undefined;

  if (entry.isLoading || entry.error || !entry.data) {
    const notFound = entry.error instanceof ApiError && entry.error.statusCode === 404;
    return (
      <MealSurface title="기록" fallback={FALLBACK} nav={nav} entryId={id}>
        {entry.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : (
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm text-destructive">
              {notFound ? '기록을 찾을 수 없어요.' : '기록을 불러오지 못했어요.'}
            </p>
            {notFound ? null : (
              <button type="button" className="meal-btn-line" onClick={() => void entry.refetch()}>
                재시도
              </button>
            )}
          </div>
        )}
      </MealSurface>
    );
  }

  const data = entry.data;
  const today = toLocalDateKey(new Date());
  const Heading = frame.type === 'panel' ? 'h3' : 'h2';

  const startEdit = () => {
    useMealDraftStore.getState().start(mealDraftInitFromEntry(data));
    open(MEAL_PATH.edit(data.id));
  };

  const repeatEntry = () => {
    useMealDraftStore.getState().start(mealDraftInitForRepeat(data, new Date()));
    open(MEAL_PATH.new);
  };

  const confirmDelete = () => {
    setRemoveError(null);
    remove.mutate(data.id, {
      onSuccess: () => {
        // 이 기록을 고치다 남긴 draft 가 있으면 함께 버린다 — 지워진 기록을 되살리는 저장을 막는다.
        const draft = useMealDraftStore.getState();
        if (draft.entryId === data.id) draft.clear();
        setConfirmOpen(false);
        leave();
      },
      onError: (e) => {
        setConfirmOpen(false);
        setRemoveError(
          e instanceof ApiError ? e.message : '삭제하지 못했어요. 다시 시도해 주세요.',
        );
      },
    });
  };

  const meta = [
    `${data.eatenDate} ${timeText(data.eatenAt)}`,
    data.mealType ? MEAL_TYPE_LABEL[data.mealType] : null,
    SOURCE_LABEL[data.source],
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <MealSurface
      title={`${mealDateLabel(data.eatenDate, today)} ${MEAL_SLOT_LABEL[data.slot]}`}
      meta={meta}
      fallback={FALLBACK}
      nav={nav}
      entryId={data.id}
      overlay={
        <ConfirmDialog
          open={confirmOpen}
          title="기록 삭제"
          description={
            data.photos.length > 0
              ? '이 기록과 사진을 삭제할까요? 되돌릴 수 없어요.'
              : '이 기록을 삭제할까요? 되돌릴 수 없어요.'
          }
          confirmLabel="삭제"
          variant="destructive"
          pending={remove.isPending}
          onConfirm={confirmDelete}
          onClose={() => setConfirmOpen(false)}
        />
      }
      footer={
        <>
          {removeError ? (
            <p role="alert" className="meal-foot-error">
              {removeError}
            </p>
          ) : null}
          {/* 수정이 기본 동작 — "다시 기록"을 수정으로 읽고 눌러 새 기록이 생긴 일이 있어(2026-10-02) 새로 만드는
              버튼은 이름에 '새 기록'을 넣고 보조 버튼으로 둔다. */}
          <button type="button" className="meal-btn" onClick={startEdit} disabled={!draftReady}>
            <Pencil className="size-4" aria-hidden />
            수정
          </button>
          <button
            type="button"
            className="meal-btn-line"
            onClick={repeatEntry}
            disabled={!draftReady}
          >
            <Copy className="size-4" aria-hidden />
            같은 메뉴로 새 기록
          </button>
          <button
            type="button"
            className="meal-btn-quiet meal-over ml-auto"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            삭제
          </button>
        </>
      }
    >
      <div className="meal-detail">
        <div className="meal-detail-main">
          {data.photos.length > 0 ? (
            <PhotoGrid tokens={data.photos.map((photo) => photo.token)} />
          ) : data.photoPurgedAt ? (
            <p className="text-xs text-muted-foreground">
              보존 설정에 따라 사진은 {data.photoPurgedAt.slice(0, 10)}에 정리됐어요.
            </p>
          ) : null}
          <section className="meal-sec" aria-labelledby="meal-detail-foods">
            <div className="meal-sec-head">
              <Heading id="meal-detail-foods" className="meal-sec-title">
                먹은 음식
              </Heading>
              <span className="text-sm font-semibold text-muted-foreground">
                {data.items.length}개
              </span>
            </div>
            <ul>
              {data.items.map((item) => (
                <FoodRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        </div>

        <div className="meal-detail-side">
          <EntryLabel items={data.items} />
          {data.placeName ? (
            <section className="meal-sec">
              <Heading className="meal-sec-title mb-2">기록한 식당</Heading>
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-bold">{data.placeName}</p>
                {data.placeId ? (
                  <Link to={`/restaurants-v2/${data.placeId}`} className="meal-btn-line shrink-0">
                    상세 보기
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}
          {data.memo ? (
            <section className="meal-sec">
              <Heading className="meal-sec-title mb-2">메모</Heading>
              <p className="whitespace-pre-wrap">{data.memo}</p>
            </section>
          ) : null}
          <div className="space-y-1 text-xs text-muted-foreground">
            {data.recognition?.model ? <p>사진 인식: {data.recognition.model}</p> : null}
            <p>
              같은 메뉴로 새 기록은 음식·양·장소만 지금 시각의 새 기록으로 복사해요(사진·메모 제외).
              이 기록은 그대로 남아요.
            </p>
          </div>
        </div>
      </div>
    </MealSurface>
  );
};

type MealItem = MealEntryType['items'][number];

const FoodRow = ({ item }: { item: MealItem }) => {
  const sub = [
    item.dishType ? FOOD_DISH_TYPE_LABEL[item.dishType] : null,
    item.mainIngredient ? FOOD_MAIN_INGREDIENT_LABEL[item.mainIngredient] : null,
    item.cuisine ? FOOD_CUISINE_LABEL[item.cuisine] : null,
    item.portion ? MEAL_PORTION_LABEL[item.portion] : null,
    item.servings !== null ? `${item.servings}인분(직접 입력)` : null,
  ].filter(Boolean);
  return (
    <li className="meal-food-row">
      <div className="min-w-0">
        <p className="meal-food-name">
          {item.isMain ? null : <span className="meal-food-tag">곁들임</span>}
          {item.name}
        </p>
        {sub.length > 0 ? <p className="meal-food-sub">{sub.join(' · ')}</p> : null}
        {item.nutritionBasis === 'donor_estimate' || item.nutritionBasis === 'typical_portion' ? (
          <p className="meal-food-note">{item.nutritionFrom ?? '유사 음식'} 기준 추정</p>
        ) : item.nutritionBasis === 'missing' ? (
          <p className="meal-food-note">공개된 영양 근거 없음</p>
        ) : null}
        <RecipeStoryLink foodId={item.foodId} />
      </div>
      <span className="meal-food-kcal">{item.kcal !== null ? `${fmt(item.kcal)}kcal` : '—'}</span>
    </li>
  );
};

// 이 끼니의 영양정보 — 값이 있는 항목만 더한 합계다(카탈로그 커버리지가 100% 가 아니다). 몇 개가 반영됐는지 같이 보여 준다.
const EntryLabel = ({ items }: { items: MealItem[] }) => {
  const sum = summarizeMealNutrition(items);
  if (sum.kcal === null) {
    return (
      <section className="meal-label" aria-label="영양정보">
        <div className="meal-label-head">
          <p className="meal-label-title">영양정보</p>
        </div>
        <p className="p-4 text-sm text-muted-foreground">
          공개된 영양 정보가 있는 음식이 없어 합계를 내지 못했어요.
        </p>
      </section>
    );
  }
  const rows = [
    { key: 'protein', label: '단백질', amount: sum.proteinG, unit: 'g', dv: DAILY_VALUE.proteinG },
    { key: 'sodium', label: '나트륨', amount: sum.sodiumMg, unit: 'mg', dv: DAILY_VALUE.sodiumMg },
  ];
  return (
    <section className="meal-label" aria-label="영양정보">
      <div className="meal-label-head">
        <p className="meal-label-title">영양정보</p>
        <p className="meal-label-total">
          이 끼니 합계
          <br />
          <b>약 {sum.kcal.toLocaleString('ko-KR')}kcal</b>
        </p>
      </div>
      <div className="meal-label-colhead">
        <span>
          음식 {sum.total}개 중 {sum.counted}개
        </span>
        <span>1일 영양성분 기준치에 대한 비율</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="meal-label-row">
          <span>
            <span className="meal-label-name">{row.label}</span>
            <span className="meal-label-amt">
              {row.amount !== null ? `${row.amount.toLocaleString('ko-KR')}${row.unit}` : '—'}
            </span>
          </span>
          <span className="meal-label-pct">
            {row.amount !== null ? `${Math.round((row.amount / row.dv) * 100)}%` : '—'}
          </span>
        </div>
      ))}
      <div className="meal-label-fine space-y-1 pt-2">
        {sum.counted < sum.total ? (
          <p>
            {sum.total}개 중 {sum.counted}개만 반영 — 나머지는 공개된 영양 정보가 없어요.
          </p>
        ) : null}
        <p>
          1일 영양성분 기준치(단백질 {DAILY_VALUE.proteinG}g · 나트륨{' '}
          {DAILY_VALUE.sodiumMg.toLocaleString('ko-KR')}mg)는 포장 식품 영양정보 표와 같은
          기준이에요.
        </p>
      </div>
    </section>
  );
};

// 사진 칸 — 누르면 그 장부터 크게 보고 좌우로 넘긴다.
const PhotoGrid = ({ tokens }: { tokens: string[] }) => {
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <div className="meal-photos" data-count={Math.min(tokens.length, 5)}>
      {tokens.map((token, i) => (
        <button
          key={token}
          type="button"
          onClick={() => setViewing(i)}
          aria-label={`사진 ${i + 1} 크게 보기`}
          className="block cursor-zoom-in"
        >
          <MealPhotoImg token={token} className="aspect-square w-full" />
        </button>
      ))}
      {viewing !== null ? (
        <MealPhotoLightbox
          tokens={tokens}
          index={viewing}
          onChangeIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
};
