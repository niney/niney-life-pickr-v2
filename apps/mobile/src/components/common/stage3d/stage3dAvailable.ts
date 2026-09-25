import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * 3D 무대(expo-gl)를 쓸 수 있는 빌드인지 — iOS 이고 expo-gl 네이티브 모듈이 든 빌드일 때만. 모듈이 없는 옛 빌드
 * (expo-gl 추가 전에 만든 개발 클라이언트 등)는 2D 로 — 화면이 3D 모듈을 불러오다 죽지 않게. Android 는 기기 검증
 * 전까지 2D. 켜져 있어도 실제로 3D 를 보여 줄지는 첫 프레임들의 실측 속도로 다시 판단한다(useStage3DGate).
 */
export const STAGE_3D_AVAILABLE = Platform.OS === 'ios' && requireOptionalNativeModule('ExponentGLObjectManager') !== null;
