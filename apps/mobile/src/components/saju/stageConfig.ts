import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// 천문도 무대 설정 — 2D·3D 무대와 사주 화면이 함께 쓴다.

// 타이밍 — 웹 3D 무대(stage/sajuLayout TIMING)와 같은 값. 흐름 전환(onCastingDone·onStamp)은 사주 화면의 JS 타이머가
// 이 값으로 낸다(렌더가 버벅여도 흐름은 멈추지 않는다).
//   casting   고리 바깥·중간·안이 1.4·2.1·2.8초에 멈추고, 3초 뒤 onCastingDone.
//   stamping  구간 시작 0.22초 뒤 인장이 떨어지기 시작해 0.32초 뒤 착지(onStamp) + 파문 0.9초.
export const SAJU_STAGE_TIMING = { castMs: 3000, stopsMs: [1400, 2100, 2800], dropStartMs: 220, dropMs: 320, rippleMs: 900 } as const;

/**
 * 3D 무대(expo-gl)를 쓰는지 — iOS 이고 expo-gl 네이티브 모듈이 든 빌드일 때만. 모듈이 없는 옛 빌드(expo-gl 추가 전에
 * 만든 개발 클라이언트 등)는 2D 로 — 사주 화면이 3D 모듈을 불러오다 죽지 않게. Android 는 기기 검증 전까지 2D.
 * 켜져 있어도 실제로 3D 를 보여 줄지는 무대가 첫 프레임들의 실측 속도로 다시 판단한다(느리면 2D).
 */
export const SAJU_STAGE_3D_ENABLED = Platform.OS === 'ios' && requireOptionalNativeModule('ExponentGLObjectManager') !== null;
