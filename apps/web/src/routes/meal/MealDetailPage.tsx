import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import type { MealEntrySourceType } from '@repo/api-contract';
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
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { MealPhotoImg } from './MealPhotoImg';
import { useMealDraftReady } from './useMealDraftReady';

// 식단 상세(웹) — 한 끼의 음식·영양·사진을 보고 수정·다시 기록·삭제로 넘어간다.
// 수정과 다시 기록은 앱 상세와 같은 shared 도우미로 draft 를 채운 뒤 입력 화면으로 보낸다.

const SOURCE_LABEL: Record<MealEntrySourceType, string> = {
  photo: '사진 기록',
  manual: '직접 기록',
  recommendation: '추천에서 기록',
};

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealDetailPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const entry = useMealEntry(id);
  const remove = useDeleteMealEntry();
  const draftReady = useMealDraftReady();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (entry.isLoading) {
    return (
      <PageFrame>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </div>
      </PageFrame>
    );
  }
  if (entry.error || !entry.data) {
    const notFound = entry.error instanceof ApiError && entry.error.statusCode === 404;
    return (
      <PageFrame>
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="text-sm text-destructive">
              {notFound ? '기록을 찾을 수 없어요.' : '기록을 불러오지 못했어요.'}
            </p>
            {notFound ? null : (
              <Button variant="outline" onClick={() => void entry.refetch()}>
                재시도
              </Button>
            )}
          </CardContent>
        </Card>
      </PageFrame>
    );
  }

  const data = entry.data;
  // 영양은 값이 있는 항목만 더한 합계다(카탈로그 커버리지가 100% 가 아니다) — 몇 개가 반영됐는지 같이 보여 준다.
  const nutrition = summarizeMealNutrition(data.items);
  const today = toLocalDateKey(new Date());

  const startEdit = () => {
    useMealDraftStore.getState().start(mealDraftInitFromEntry(data));
    navigate(`/me/meals/${data.id}/edit`);
  };

  const repeatEntry = () => {
    useMealDraftStore.getState().start(mealDraftInitForRepeat(data, new Date()));
    navigate('/me/meals/new');
  };

  const confirmDelete = () => {
    setRemoveError(null);
    remove.mutate(data.id, {
      onSuccess: () => {
        // 이 기록을 고치다 남긴 draft 가 있으면 함께 버린다 — 지워진 기록을 되살리는 저장을 막는다.
        const draft = useMealDraftStore.getState();
        if (draft.entryId === data.id) draft.clear();
        setConfirmOpen(false);
        if (location.key !== 'default') navigate(-1);
        else navigate('/me/meals', { replace: true });
      },
      onError: (e) => {
        setConfirmOpen(false);
        setRemoveError(e instanceof ApiError ? e.message : '삭제하지 못했어요. 다시 시도해 주세요.');
      },
    });
  };

  return (
    <PageFrame>
      <header className="mb-5 space-y-1">
        <Link
          to="/me/meals"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          내 식단
        </Link>
        <h1 className="text-xl font-semibold">
          {mealDateLabel(data.eatenDate, today)} {MEAL_SLOT_LABEL[data.slot]}
        </h1>
        <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span>
            {data.eatenDate} {timeText(data.eatenAt)}
          </span>
          {data.mealType ? <span>· {MEAL_TYPE_LABEL[data.mealType]}</span> : null}
          <span>· {SOURCE_LABEL[data.source]}</span>
        </p>
      </header>

      <div className="space-y-4">
        {data.placeName ? (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">기록한 식당</p>
                <p className="truncate text-sm font-medium">{data.placeName}</p>
              </div>
              {data.placeId ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/restaurants-v2/${data.placeId}`}>상세 보기</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">음식 {data.items.length}개</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items.map((item) => (
              <div key={item.id} className="space-y-0.5">
                <p className="text-sm">
                  {item.isMain ? null : <span className="text-muted-foreground">곁들임 · </span>}
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    item.dishType ? FOOD_DISH_TYPE_LABEL[item.dishType] : null,
                    item.mainIngredient ? FOOD_MAIN_INGREDIENT_LABEL[item.mainIngredient] : null,
                    item.cuisine ? FOOD_CUISINE_LABEL[item.cuisine] : null,
                    item.portion ? MEAL_PORTION_LABEL[item.portion] : null,
                    item.servings !== null ? `${item.servings}인분(직접 입력)` : null,
                    item.kcal !== null ? `${Math.round(item.kcal)}kcal` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {item.nutritionBasis === 'donor_estimate' || item.nutritionBasis === 'typical_portion' ? (
                  <p className="text-xs italic text-muted-foreground">
                    {item.nutritionFrom ?? '유사 음식'} 기준 추정
                  </p>
                ) : item.nutritionBasis === 'missing' ? (
                  <p className="text-xs italic text-muted-foreground">공개된 영양 근거 없음</p>
                ) : null}
              </div>
            ))}
            {nutrition.kcal !== null ? (
              <div className="mt-3 border-t pt-3">
                <p className="text-sm font-medium">
                  약 {nutrition.kcal.toLocaleString('ko-KR')}kcal
                  {nutrition.proteinG ? ` · 단백질 ${nutrition.proteinG}g` : ''}
                  {nutrition.sodiumMg ? ` · 나트륨 ${nutrition.sodiumMg.toLocaleString('ko-KR')}mg` : ''}
                </p>
                {nutrition.counted < nutrition.total ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nutrition.total}개 중 {nutrition.counted}개만 반영 — 나머지는 공개된 영양 정보가 없어요.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {data.memo ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">메모</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{data.memo}</p>
            </CardContent>
          </Card>
        ) : null}

        {data.photos.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">사진</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {data.photos.map((photo) => (
                <MealPhotoImg key={photo.token} token={photo.token} className="aspect-square w-full" />
              ))}
            </CardContent>
          </Card>
        ) : data.photoPurgedAt ? (
          <p className="text-xs text-muted-foreground">
            보존 설정에 따라 사진은 {data.photoPurgedAt.slice(0, 10)}에 정리됐어요.
          </p>
        ) : null}

        {data.recognition?.model ? (
          <p className="text-xs text-muted-foreground">사진 인식: {data.recognition.model}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={repeatEntry} disabled={!draftReady}>
            <Copy className="size-4" />
            이 식단 다시 기록
          </Button>
          <Button variant="outline" onClick={startEdit} disabled={!draftReady}>
            <Pencil className="size-4" />
            수정
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            삭제
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          다시 기록은 음식·양·장소만 지금 시각으로 복사해요. 사진과 메모는 빼요.
        </p>
        {removeError ? (
          <p role="alert" className="text-sm text-destructive">
            {removeError}
          </p>
        ) : null}
      </div>

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
    </PageFrame>
  );
};

const PageFrame = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
);
