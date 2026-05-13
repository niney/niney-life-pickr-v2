import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

  const handleClose = useCallback(() => {
    // 리스트 영역으로. 기존 검색/필터 query 를 보존하려면 list 라우트의
    // searchParams 를 유지해야 하는데, 현재 placeId 자체는 path 라 query 는
    // 이미 list 쪽 그대로다. 단순 navigate('/restaurants') 로 path 만 잘라낸다.
    navigate({ pathname: '/restaurants', search: window.location.search });
  }, [navigate]);

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
