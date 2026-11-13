import type { QueryClient } from '@tanstack/react-query';
import {
  getMealDraftIdentity,
  isMealDraftIdentityCurrent,
  mealPlaceMenusQuery,
  useMealDraftStore,
} from '@repo/shared';

// 사진에서 인식한 음식을 고른 식당의 메뉴에 잇는다(웹). 식당을 고른 직후와 사진 인식이 끝난 직후 — 두 사건 어느 쪽이
// 먼저든 같은 결과가 되게 양쪽에서 부른다. 메뉴는 화면과 같은 캐시(mealPlaceMenusQuery)에서 받고, 받는 사이 draft 나
// 식당이 바뀌었으면 아무것도 하지 않는다. LLM 을 다시 부르지 않는다(일일 인식 한도를 쓰지 않는다).

export interface MealMenuLinkResult {
  /** 메뉴에 이은 줄 수. */
  linked: number;
  /** 주식인데 메뉴에서 못 찾은 줄 수. */
  unmatched: number;
  placeName: string;
}

export const linkRecognizedToPlaceMenus = async (
  queryClient: QueryClient,
): Promise<MealMenuLinkResult | null> => {
  const identity = getMealDraftIdentity();
  const draft = useMealDraftStore.getState();
  const placeId = draft.placeId;
  if (!placeId) return null;
  // 이을 줄(손대지 않은 인식 줄)이 없으면 메뉴를 묻지 않는다.
  const linkable = draft.items.some(
    (item) => item.source === 'recognized' && !item.userEdited && !item.menuName && item.name.trim(),
  );
  if (!linkable) return null;
  try {
    const data = await queryClient.fetchQuery(mealPlaceMenusQuery(placeId));
    if (!isMealDraftIdentityCurrent(identity) || useMealDraftStore.getState().placeId !== placeId) return null;
    if (data.menus.length === 0) return null;
    return { ...useMealDraftStore.getState().linkRecognizedToMenus(data.menus), placeName: data.placeName };
  } catch {
    // 메뉴를 못 받았으면(식당이 지워졌거나 통신 오류) 잇지 않을 뿐이다 — 인식 결과는 그대로 쓴다.
    return null;
  }
};
