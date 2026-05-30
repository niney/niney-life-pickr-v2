import { useContext } from 'react';
import { BottomTabBarHeightContext } from 'react-native-bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 하단 네이티브 탭바 높이(홈 인디케이터 safe-area 포함). react-native-bottom-tabs
// 는 translucent 여부와 무관하게 scene 을 풀블리드로 깔고 인셋은 직접 넣어야
// 하므로(그래서 이 훅이 존재), 스크롤 contentContainerStyle 의 paddingBottom 에
// 더해 마지막 콘텐츠가 탭바 뒤로 안 가리게 한다.
//
// useBottomTabBarHeight() 는 탭 네비게이터 밖(딥링크 restaurant/[placeId] route)
// 에서 throw 하므로 context 를 직접 읽는다. 폴백 연산은 ?? 가 아니라 || — 탭
// 밖이면 context 가 undefined 지만, 탭 안이라도 측정 전 첫 프레임엔 Provider
// 초기값 0 이 내려온다(TabView 가 onTabBarMeasured 로 갱신). 둘 다 홈 인디케이터
// inset 을 바닥값으로 잡아야 첫 프레임에 콘텐츠가 탭바 뒤로 안 가린다. 탭바
// 높이는 항상 insets.bottom 을 포함하므로 || 가 under-pad 를 만들지 않는다.
//
// .web.ts 형제 파일이 RN-Web 번들에서 우선 채택 — 이 파일의 native-only
// react-native-bottom-tabs import 가 web 빌드 트리에 들어가지 않게 한다.
export function useTabBarHeight(): number {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useSafeAreaInsets();
  return tabBarHeight || insets.bottom;
}
