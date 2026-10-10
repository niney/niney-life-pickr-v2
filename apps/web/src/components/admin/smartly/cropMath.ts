// 사진 위 드래그 선택 — 좌표는 표시 크기와 무관하게 이미지 대비 비율(0~1)로 들고 있다가, 자를 때만 원본 픽셀로 바꾼다.

export interface FracPoint {
  x: number;
  y: number;
}

export interface FracRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 표시 크기 기준으로 이보다 작은 드래그는 클릭으로 보고 버린다.
export const MIN_SELECTION_PX = 8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const toFracPoint = (
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): FracPoint => ({
  x: clamp01((clientX - box.left) / box.width),
  y: clamp01((clientY - box.top) / box.height),
});

// 어느 방향으로 끌어도 같은 사각형.
export const rectBetween = (a: FracPoint, b: FracPoint): FracRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

export const isUsableSelection = (rect: FracRect, box: { width: number; height: number }) =>
  rect.w * box.width >= MIN_SELECTION_PX && rect.h * box.height >= MIN_SELECTION_PX;

export const toPixelRect = (rect: FracRect, naturalWidth: number, naturalHeight: number) => {
  const sx = Math.round(rect.x * naturalWidth);
  const sy = Math.round(rect.y * naturalHeight);
  return {
    sx,
    sy,
    sw: Math.max(1, Math.min(naturalWidth - sx, Math.round(rect.w * naturalWidth))),
    sh: Math.max(1, Math.min(naturalHeight - sy, Math.round(rect.h * naturalHeight))),
  };
};

export const rectStyle = (rect: FracRect) => ({
  left: `${rect.x * 100}%`,
  top: `${rect.y * 100}%`,
  width: `${rect.w * 100}%`,
  height: `${rect.h * 100}%`,
});

// 잘라 낸 영역 → 업로드용 PNG + 미리보기 data URL.
export const cropImage = (
  image: HTMLImageElement,
  rect: FracRect,
): Promise<{ blob: Blob; preview: string }> => {
  const { sx, sy, sw, sh } = toPixelRect(rect, image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('캔버스를 쓸 수 없습니다'));
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const preview = canvas.toDataURL('image/png');
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, preview }) : reject(new Error('잘라내기 실패'))),
      'image/png',
    ),
  );
};

export const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다'));
    reader.readAsDataURL(file);
  });
