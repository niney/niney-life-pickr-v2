import { useCallback } from 'react';
import { useMatch, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PublicRestaurantDetail } from '~/components/restaurant/detail/PublicRestaurantDetail';
import { TAB_ORDER, type TabKey } from '~/components/restaurant/detail/tabs';

const TAB_KEYS = TAB_ORDER.map((t) => t.key) as TabKey[];
const isTabKey = (s: string | null): s is TabKey =>
  s !== null && (TAB_KEYS as string[]).includes(s);

// /restaurants/:placeId 라우트의 상세 outlet. URL ?tab= 으로 탭을 관리한다.
// 탭 전환은 push — 뒤로가기로 직전 탭/식당으로 돌아갈 수 있도록 history 에
// 누적된다. (사용자 요청: 뒤로가기 1회 = 직전 탭)
// /r/:placeId 는 공유/SEO 대표 URL — RestaurantsV2Page 가 리스트를 숨기고
// 지도 + 상세 레이아웃을 제공한다.
export const RestaurantDetailRoute = () => {
  const { placeId = '' } = useParams<{ placeId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const tabRaw = searchParams.get('tab');
  const tab: TabKey = isTabKey(tabRaw) ? tabRaw : 'home';

  const handleChangeTab = useCallback(
    (next: TabKey) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'home') params.delete('tab');
        else params.set('tab', next);
        return params;
      });
    },
    [setSearchParams],
  );

  // v2 라우트(/restaurants-v2/:placeId) 와 공유 라우트(/r/:placeId) 에서도
  // 동일하게 쓰이므로 닫기 경로를 useMatch 로 분기한다.
  const v2Match = useMatch('/restaurants-v2/:placeId');
  const shareMatch = useMatch('/r/:placeId');
  const basePath = v2Match || shareMatch ? '/restaurants-v2' : '/restaurants';

  const handleClose = useCallback(() => {
    // 리스트 영역으로. 목록에서 들어온 상세는 검색/필터 query 를 보존하고,
    // 공유 대표 URL 은 tab 같은 상세 전용 query 를 목록으로 넘기지 않는다.
    navigate({ pathname: basePath, search: shareMatch ? '' : window.location.search });
  }, [navigate, basePath, shareMatch]);

  if (!placeId) return null;
  return (
    <PublicRestaurantDetail
      key={placeId}
      placeId={placeId}
      onClose={handleClose}
      tab={tab}
      onChangeTab={handleChangeTab}
    />
  );
};
