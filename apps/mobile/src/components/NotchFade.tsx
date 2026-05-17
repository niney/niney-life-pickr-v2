import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@repo/shared';

interface Props {
  /** 페이드 구간 픽셀. safe-area 경계 아래로 bg 가 투명해지는 길이. */
  fade?: number;
  /** 노치 영역 bg 알파 (16진수). 'FF'=완전 불투명, 'CC'≈80%, 'B3'≈70%, '99'≈60%. */
  alpha?: string;
}

// edge-to-edge 스크롤 화면에서 노치/safe-area 위에 깔리는 페이드 오버레이.
// 위쪽 insets.top 만큼은 alpha 만큼의 bg 색으로 깔려 시계·배터리 가독성을
// 유지하고, 그 아래 fade 픽셀 동안 투명으로 그라데이션 — 컨텐츠가 노치로
// 흘러들어갈 때 부드럽게 사라진다. pointerEvents='none' 이라 터치 통과.
export const NotchFade = ({ fade = 24, alpha = 'CC' }: Props) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        theme.colors.bg + alpha,
        theme.colors.bg + alpha,
        theme.colors.bg + '00',
      ]}
      locations={[0, insets.top / (insets.top + fade), 1]}
      style={[styles.overlay, { height: insets.top + fade }]}
    />
  );
};

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
});
