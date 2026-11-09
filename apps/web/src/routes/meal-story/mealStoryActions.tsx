import { Loader2, NotebookPen, Share2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { MealStoryType } from '@repo/api-contract';
import { useAuthStore, useMealStoryFood } from '@repo/shared';
import { cn } from '~/lib/utils';
import { prepareMealEntry } from '../meal/mealDraftStart';
import { MEAL_PATH, MEAL_STORY_PATH } from '../meal/mealPaths';

// 스토리 끝의 행동 — [이 레시피로 기록]은 레시피를 카탈로그 음식으로 맞춘 뒤(서버) 새 기록을 그 음식으로 채워 입력 화면으로
// 간다. 로그인 전이면 로그인 뒤 이 장면으로 돌아온다. [공유하기]는 휴대폰 공유창, 없으면 링크 복사.

export const RecordRecipeButton = ({ story, primary = true }: { story: MealStoryType; primary?: boolean }) => {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const location = useLocation();
  const food = useMealStoryFood();
  if (!story.recipe) return null;

  const onClick = () => {
    if (!token) {
      navigate(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    food.mutate(story.slug, {
      onSuccess: (f) => {
        prepareMealEntry({
          quick: {
            name: f.name,
            foodId: f.foodId,
            dishType: f.dishType,
            mainIngredient: null,
            cuisine: null,
            isMain: true,
            portion: null,
            servings: null,
            portionSource: null,
            count: 0,
            lastEatenDate: null,
            from: 'default',
          },
        });
        navigate(MEAL_PATH.new);
      },
      onError: () => toast.error('기록을 준비하지 못했어요. 잠시 뒤 다시 해 주세요.'),
    });
  };

  return (
    <button
      type="button"
      className={cn('mss-btn', primary && 'mss-btn-primary')}
      onClick={onClick}
      disabled={food.isPending}
    >
      {food.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <NotebookPen className="size-4" aria-hidden />}
      {token ? '이 레시피로 기록' : '로그인하고 이 레시피로 기록'}
    </button>
  );
};

export const ShareStoryButton = ({ story }: { story: MealStoryType }) => {
  const onClick = async () => {
    const url = `${window.location.origin}${MEAL_STORY_PATH.story(story.slug)}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: story.title, text: story.summary, url });
      } catch {
        // 공유창을 닫았다 — 할 일 없음.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('링크를 복사했어요');
    } catch {
      toast.error('링크를 복사하지 못했어요');
    }
  };
  return (
    <button type="button" className="mss-btn" onClick={() => void onClick()}>
      <Share2 className="size-4" aria-hidden />
      공유하기
    </button>
  );
};
