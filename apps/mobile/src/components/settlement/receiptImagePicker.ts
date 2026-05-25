import { ActionSheetIOS, Alert, Platform } from 'react-native';

// expo-image-picker 는 네이티브 모듈. apps/mobile/node_modules 가 비어 있고
// root 로 hoist 된 pnpm 구조에선 autolinking 이 빠지는 경우가 있어, JS 는
// 모듈을 못 찾을 수도 있고 / 찾아도 native binding 이 없어 호출이 throw 한다.
// 두 경우 모두 module evaluation 이 실패하면 named export 가 통째로 undefined
// 가 되어 호출부에서 "Cannot read property X of undefined" 로 죽는다.
//
// 이걸 막기 위해 require 를 함수 안에서 try/catch 로 감싼다. typeof import 같은
// type-only 표현은 일부 babel preset 환경에서 runtime require 로 leak 할 수
// 있어, 타입은 우리가 쓰는 멤버만 손으로 좁게 적어 둔다(런타임에 완전히 사라짐).

interface ImagePickerLike {
  requestCameraPermissionsAsync(): Promise<{ status: string }>;
  requestMediaLibraryPermissionsAsync(): Promise<{ status: string }>;
  launchCameraAsync(opts: Record<string, unknown>): Promise<PickerResult>;
  launchImageLibraryAsync(opts: Record<string, unknown>): Promise<PickerResult>;
}

interface PickerResult {
  canceled: boolean;
  assets?: Array<{
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
  }>;
}

const loadImagePicker = (): ImagePickerLike | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-image-picker') as ImagePickerLike | undefined;
    // 일부 환경에서 require 가 성공해도 빈 객체를 돌려주는 케이스 대비.
    if (!mod || typeof mod.launchCameraAsync !== 'function') return null;
    return mod;
  } catch {
    return null;
  }
};

// 영수증 사진 선택 결과. shared 의 settlementExtractionApi.upload 는 web 의
// Blob 시그니처지만 RN 의 FormData 는 { uri, name, type } 셰입을 그대로 받아
// 멀티파트로 직렬화한다 — 호출 측에서 한 번 캐스트해서 넘긴다.
export interface PickedReceipt {
  uri: string;
  name: string;
  type: string;
}

const OPTIONS = ['사진 촬영', '앨범에서 선택', '취소'] as const;
const TAKE_PHOTO = 0;
const PICK_LIBRARY = 1;

type SourceChoice = 'camera' | 'library' | null;

const askSource = (): Promise<SourceChoice> =>
  new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: OPTIONS as unknown as string[],
          cancelButtonIndex: 2,
          title: '영수증 이미지',
        },
        (buttonIndex) => {
          if (buttonIndex === TAKE_PHOTO) resolve('camera');
          else if (buttonIndex === PICK_LIBRARY) resolve('library');
          else resolve(null);
        },
      );
      return;
    }
    Alert.alert(
      '영수증 이미지',
      undefined,
      [
        { text: '사진 촬영', onPress: () => resolve('camera') },
        { text: '앨범에서 선택', onPress: () => resolve('library') },
        { text: '취소', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });

const requestPerm = async (
  picker: ImagePickerLike,
  kind: SourceChoice,
): Promise<boolean> => {
  if (kind === 'camera') {
    const res = await picker.requestCameraPermissionsAsync();
    if (res.status !== 'granted') {
      Alert.alert('카메라 권한이 필요합니다', '설정 > 권한에서 카메라 접근을 허용해 주세요.');
      return false;
    }
    return true;
  }
  if (kind === 'library') {
    const res = await picker.requestMediaLibraryPermissionsAsync();
    if (res.status !== 'granted') {
      Alert.alert('사진 권한이 필요합니다', '설정 > 권한에서 사진 라이브러리 접근을 허용해 주세요.');
      return false;
    }
    return true;
  }
  return false;
};

const mimeFromUri = (uri: string): string => {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return 'image/jpeg';
};

const fileNameFromUri = (uri: string): string => {
  const last = uri.split('/').pop() ?? 'receipt.jpg';
  return last.includes('.') ? last : `${last}.jpg`;
};

/**
 * ActionSheet → 권한 요청 → 카메라/앨범으로 영수증 1장 선택.
 * 사용자가 취소하거나 권한 거부, 또는 expo-image-picker 가 없는 dev client 일
 * 경우 null. 호출부는 null 만 보고 "조용히 종료" 로 다루면 된다.
 */
export const pickReceiptImage = async (): Promise<PickedReceipt | null> => {
  const picker = loadImagePicker();
  if (!picker) {
    Alert.alert(
      '영수증 사진 사용 불가',
      'expo-image-picker 네이티브 모듈이 빌드되어 있지 않습니다. dev client 를 다시 빌드하거나 직접 입력을 사용하세요.',
    );
    return null;
  }

  const src = await askSource();
  if (!src) return null;
  const ok = await requestPerm(picker, src);
  if (!ok) return null;

  const opts: Record<string, unknown> = {
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
    exif: false,
  };

  const result =
    src === 'camera'
      ? await picker.launchCameraAsync(opts)
      : await picker.launchImageLibraryAsync(opts);

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? fileNameFromUri(asset.uri),
    type: asset.mimeType ?? mimeFromUri(asset.uri),
  };
};
