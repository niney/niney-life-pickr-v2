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

  // v2 라우트(/restaurants-v2/:placeId) 에서도 동일하게 쓰이므로 닫기 경로를
  // useMatch 로 분기 — 그 외 로직(탭 동기화 등)은 동일.
  const v2Match = useMatch('/restaurants-v2/:placeId');
  const basePath = v2Match ? '/restaurants-v2' : '/restaurants';

  const handleClose = useCallback(() => {
    // 리스트 영역으로. 검색/필터 query 는 그대로 보존.
    navigate({ pathname: basePath, search: window.location.search });
  }, [navigate, basePath]);

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
