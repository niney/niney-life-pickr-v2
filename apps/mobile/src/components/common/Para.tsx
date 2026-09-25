import { Platform, Text, type TextProps } from 'react-native';

// iOS(Fabric) 여러 줄 글의 마지막 줄 사라짐 우회. RN 0.81 은 글을 "프레임 높이" 컨테이너로 그리는데
// (RCTTextLayoutManager drawAttributedString), 긴 스크롤 안쪽처럼 절대 좌표가 큰 곳에서는 Yoga 의 float 반올림으로
// 프레임이 글 높이보다 1e-4pt 모자라 마지막 줄이 통째로 빠진다(lineHeight 로 높이가 픽셀 격자에 딱 맞을 때 잘 난다).
// 끝에 1pt 짜리 빈 줄을 붙여 여유를 두면 그 빈 줄만 빠진다. 다른 Text 안에 중첩하거나 numberOfLines 와 함께 쓰지 말 것.
const IOS_TAIL = Platform.OS === 'ios' ? <Text style={{ fontSize: 1, lineHeight: 1 }}>{'\n​'}</Text> : null;

/** 여러 줄이 될 수 있는 글 — 위 iOS 우회를 붙인 Text(사주·타로 네이티브 화면). */
export const Para = ({ children, ...rest }: TextProps) => (
  <Text {...rest}>
    {children}
    {IOS_TAIL}
  </Text>
);
