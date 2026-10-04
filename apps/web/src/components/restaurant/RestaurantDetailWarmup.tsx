import { useRestaurantPublic, useRestaurantPublicInsights } from '@repo/shared';

// 상세 패널(RestaurantDetailRoute → PublicRestaurantDetail)은 lazy 청크라, 처음 열 때(딥링크·첫
// 클릭)는 청크를 다 받은 뒤에야 상세·인사이트 조회가 시작된다. 목록 페이지가 placeId 를 아는 즉시
// 같은 쿼리를 여기서 먼저 걸어 두면 청크 다운로드와 조회가 나란히 진행되고, 상세는 같은 queryKey 의
// 캐시(또는 진행 중인 요청)를 그대로 이어받는다.
//
// 페이지에서 훅을 직접 부르지 않고 아무것도 그리지 않는 컴포넌트로 뗀 이유 — 결과를 읽지 않는
// useQuery 는 상태가 바뀔 때마다 구독 컴포넌트를 다시 그리는데(추적할 필드가 없으면 전부 알린다),
// 그게 페이지면 목록·지도까지 따라 돈다. 여기선 이 빈 컴포넌트만 다시 그려진다.
//
// 이 파일은 상세 탭 묶음(detail/*)을 import 하지 않는다 — 하면 lazy 청크가 페이지 청크로 딸려 온다.
export const RestaurantDetailWarmup = ({ placeId }: { placeId: string }) => {
  useRestaurantPublic(placeId);
  useRestaurantPublicInsights(placeId);
  return null;
};
