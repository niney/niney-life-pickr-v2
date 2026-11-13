import { Utensils } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useMealDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { prepareMealEntry } from './mealDraftStart';
import { MEAL_PATH } from './mealPaths';
import { useMealDraftReady } from './useMealDraftReady';

// 여기서 먹었어요 — 식당 상세에서 식단 기록으로 넘어가는 입구. 새 기록에 이 식당을 채워 입력 화면을 열면 그 집 메뉴가
// 바로 떠서 누르기만 하면 된다. 쓰다 둔 새 기록이 있으면 그 위에 식당만 얹는다(다른 입구와 같은 규칙).
// 식당 상세는 식단 셸 밖이라 draft 복원이 끝났는지(useMealDraftReady) 보고 쓴다 — 그 전에 쓴 값은 사라진다.
export const MealHereButton = ({ placeId, placeName }: { placeId: string; placeName: string }) => {
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((s) => !!s.token);
  const ready = useMealDraftReady();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={isLoggedIn && !ready}
      onClick={() => {
        // 비로그인은 로그인 페이지로(정산 버튼과 같다).
        if (!isLoggedIn) {
          navigate('/login');
          return;
        }
        prepareMealEntry();
        useMealDraftStore.getState().setPlace({ placeId, placeName });
        navigate(MEAL_PATH.new);
      }}
      aria-label="여기서 먹었어요"
      title="여기서 먹은 것을 식단에 기록"
    >
      <Utensils className="size-4" />
      <span className="hidden sm:inline">먹었어요</span>
    </Button>
  );
};
