// 영수증 사진을 올리기 전에 브라우저에서 줄인다.
//
// 서버는 받은 사진을 어차피 장변 1600px JPEG 로 정규화해 저장하고(friendly
// settlement-extraction 의 MAX_DIMENSION), multipart 한도는 5MB 다. 폰 카메라 원본
// (3~5MB, 고화소 모드는 8MB 이상)을 그대로 보내면 식당 실내의 약한 상향에서 업로드만
// 수십 초가 걸리고, 5MB 를 넘는 사진은 다 올린 뒤에야 413 으로 거절된다. 먼저 줄여
// 보내면 둘 다 없어진다.
//
// 줄이기는 최적화일 뿐 업로드의 전제가 아니다 — 못 줄이는 경우(브라우저가 디코드
// 못 하는 HEIC, canvas 가 없는 환경 등)는 원본을 그대로 돌려준다.

/** 서버 multipart 한도(friendly plugins/multipart.ts 의 fileSize)와 같은 값. */
export const RECEIPT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const RECEIPT_TOO_LARGE_MESSAGE =
  '사진이 너무 큽니다(5MB 초과). 더 작은 사진으로 다시 올려 주세요.';

// 서버 정규화(1600px)보다 조금 크게 보낸다 — 서버가 한 번 더 줄이면서 JPEG 재압축
// 흔적이 덜어져, 글자 가독성(비전 추출 정확도)이 원본을 올릴 때와 비슷하게 남는다.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.9;
// 장변도 바이트도 이미 이만큼 작으면 다시 인코딩하지 않는다 — 화질만 잃는다.
const SKIP_BELOW_BYTES = 1024 * 1024;

const toJpegName = (name: string): string => `${name.replace(/\.[^.]*$/, '') || 'receipt'}.jpg`;

// <img>·canvas 가 EXIF 방향을 적용해 그리는 브라우저인가. canvas 를 거치면 EXIF 가
// 사라져 서버의 rotate() 가 고쳐 줄 수 없으므로, 방향을 적용하지 않는 옛 브라우저
// (image-orientation 미지원)에서는 줄이지 않고 원본을 보낸다 — 세로로 찍은 영수증이
// 누운 채 추출되는 것보다 업로드가 느린 편이 낫다.
const appliesExifOrientation = (): boolean =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('image-orientation', 'from-image');

// 줄인 사진, 또는 줄일 필요가 없거나 이 환경에서 줄일 수 없으면 null.
const downscale = async (file: File): Promise<File | null> => {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  if (!appliesExifOrientation()) return null;
  const url = URL.createObjectURL(file);
  try {
    // <img> 로 디코드한다 — EXIF 방향이 적용된 상태로 그려져(naturalWidth/Height 도
    // 회전 후 기준), 세로로 찍은 영수증이 눕지 않는다.
    const img = new Image();
    // decode() 가 없는 환경(jsdom 등)은 load 이벤트도 오지 않는다 — 기다리지 않는다.
    if (typeof img.decode !== 'function') return null;
    img.src = url;
    await img.decode();

    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) return null;
    const longEdge = Math.max(width, height);
    if (longEdge <= MAX_EDGE && file.size <= SKIP_BELOW_BYTES) return null;

    const scale = Math.min(1, MAX_EDGE / longEdge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    // JPEG 엔 알파가 없다 — 투명 배경 PNG 가 검게 깔리지 않게 흰 바탕부터.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    return blob ? new File([blob], toJpegName(file.name), { type: 'image/jpeg' }) : null;
  } finally {
    URL.revokeObjectURL?.(url);
  }
};

/**
 * 업로드할 영수증 사진을 준비한다. 줄일 수 있으면 장변 2000px JPEG 로 줄인 파일을,
 * 아니면 원본을 돌려준다. 실패해도 throw 하지 않는다(원본 폴백).
 *
 * 돌려받은 파일이 여전히 `RECEIPT_MAX_UPLOAD_BYTES` 를 넘으면 서버가 거절하므로
 * 호출처가 올리기 전에 안내한다.
 */
export const prepareReceiptImage = async (file: File): Promise<File> => {
  try {
    const resized = await downscale(file);
    // 줄였는데 오히려 커졌으면(이미 잘 압축된 사진) 원본이 낫다.
    return resized && resized.size < file.size ? resized : file;
  } catch {
    return file;
  }
};
