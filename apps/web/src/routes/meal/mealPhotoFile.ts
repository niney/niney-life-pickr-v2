// 식단 사진 파일 손질(웹) — 올리기 전에 촬영 시각(EXIF)을 읽고, 큰 사진은 브라우저에서 줄인다.
//
// 앱은 픽커가 EXIF 를 주고 품질 0.8 로 다시 저장해 크기를 줄여 주지만, 웹 <input type="file"> 은 원본을 그대로
// 준다. 요즘 휴대전화 원본은 서버 multipart 한도(5MB, apps/friendly/src/plugins/multipart.ts)를 자주 넘고, 서버도
// 어차피 긴 변 1,600px JPEG 로 다시 만들며 EXIF 를 버린다. 그래서 시각을 먼저 읽고 같은 크기로 줄여 올린다.
// 브라우저가 못 읽는 형식(데스크톱 Chrome 의 HEIC 등)은 원본 그대로 서버 변환에 맡긴다.

/** 서버 multipart 한도. 줄이지 못한 원본이 이보다 크면 올리지 않고 바로 알린다. */
export const MEAL_PHOTO_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
// 서버 저장 크기(meal-photo.service MAX_DIMENSION)와 같게 — 더 크게 보내도 서버가 줄일 뿐이다.
const MAX_EDGE = 1600;
// 서버가 한 번 더 JPEG 로 저장하니 여기서는 높게 둔다.
const JPEG_QUALITY = 0.9;
// 이보다 작고 긴 변도 넘지 않는 JPEG 는 다시 저장하지 않는다(화질 손실 없이 그대로).
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;
// EXIF(APP1)는 파일 앞 64KB 안에 있다. 앞에 다른 APP 세그먼트가 붙는 경우를 생각해 넉넉히 읽는다.
const EXIF_SCAN_BYTES = 256 * 1024;
// 카메라 시계가 틀려 미래 시각이 찍힌 사진은 쓰지 않는다(먹은 날짜는 오늘까지만 고를 수 있다).
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export const isImageFile = (file: File): boolean =>
  file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name);

// 'YYYY:MM:DD HH:MM:SS' — 앱(MealEntryEditor firstExifTime)과 같이 기기 로컬 시각으로 읽는다.
const parseExifDateTime = (raw: string): Date | null => {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return Number.isNaN(d.getTime()) ? null : d;
};

const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TYPE_ASCII = 2;

/**
 * JPEG 앞부분에서 촬영 시각을 읽는다 — Exif IFD 의 DateTimeOriginal, 없으면 IFD0 의 DateTime(앱과 같은 순서).
 * EXIF 가 없거나 깨졌거나 JPEG 가 아니면 null. 범위를 벗어난 읽기는 모두 null 로 끝낸다.
 */
export const parseExifTakenAt = (buffer: ArrayBuffer): Date | null => {
  const view = new DataView(buffer);
  const len = view.byteLength;
  if (len < 4 || view.getUint16(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 <= len) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // 영상 데이터(SOS)부터는 메타데이터가 없다
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= len && readAscii(view, offset + 4, 6) === 'Exif\0\0') {
      return parseTiff(view, offset + 10, Math.min(len, offset + 2 + size));
    }
    offset += 2 + size;
  }
  return null;
};

const readAscii = (view: DataView, start: number, length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(start + i));
  return out;
};

const parseTiff = (view: DataView, tiff: number, end: number): Date | null => {
  if (tiff + 8 > end) return null;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  if (u16(tiff + 2) !== 42) return null;

  // IFD 하나의 항목을 tag → { type, count, valueAt } 로 모은다(값이 4바이트를 넘으면 TIFF 기준 오프셋).
  const readIfd = (ifdOffset: number) => {
    const entries = new Map<number, { type: number; count: number; field: number }>();
    const start = tiff + ifdOffset;
    if (start + 2 > end) return entries;
    const count = u16(start);
    for (let i = 0; i < count; i += 1) {
      const at = start + 2 + i * 12;
      if (at + 12 > end) break;
      entries.set(u16(at), { type: u16(at + 2), count: u32(at + 4), field: at + 8 });
    }
    return entries;
  };

  const readDate = (entry: { type: number; count: number; field: number } | undefined): Date | null => {
    if (!entry || entry.type !== TYPE_ASCII || entry.count < 19) return null;
    const at = entry.count > 4 ? tiff + u32(entry.field) : entry.field;
    if (at + 19 > end) return null;
    return parseExifDateTime(readAscii(view, at, 19));
  };

  const ifd0 = readIfd(u32(tiff + 4));
  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  const original = exifPointer ? readDate(readIfd(u32(exifPointer.field)).get(TAG_DATE_TIME_ORIGINAL)) : null;
  return original ?? readDate(ifd0.get(TAG_DATE_TIME));
};

/** 사진의 촬영 시각. 못 읽거나 미래 시각이면 null — 그때는 먹은 시각을 건드리지 않는다. */
export const readPhotoTakenAt = async (file: Blob, now: Date = new Date()): Promise<Date | null> => {
  try {
    const takenAt = parseExifTakenAt(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
    if (!takenAt || takenAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return null;
    return takenAt;
  } catch {
    return null;
  }
};

const decodeImage = async (file: Blob): Promise<HTMLImageElement | null> => {
  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    // 브라우저가 못 읽는 형식이면 decode 가 거절한다. 방향(EXIF Orientation)은 브라우저가 적용한 크기로 나온다.
    await img.decode();
    return img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null;
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
};

export type PreparedMealPhoto = { ok: true; blob: Blob } | { ok: false; message: string };

/**
 * 올릴 사진을 준비한다. 긴 변 1,600px 를 넘거나 큰 사진은 JPEG 로 줄이고, 작은 JPEG 는 그대로 둔다.
 * 브라우저가 못 읽으면 원본을 그대로 쓰되, 서버 한도를 넘으면 올리지 않는다.
 */
export const prepareMealPhoto = async (file: File): Promise<PreparedMealPhoto> => {
  const img = await decodeImage(file);
  const tooBig = {
    ok: false as const,
    message: `사진(${file.name})이 5MB 를 넘어 올리지 못했어요. JPEG 로 바꿔 올려 주세요.`,
  };
  if (!img) return file.size > MEAL_PHOTO_UPLOAD_LIMIT_BYTES ? tooBig : { ok: true, blob: file };

  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  if (longEdge <= MAX_EDGE && file.size <= KEEP_ORIGINAL_BYTES && file.type === 'image/jpeg') {
    return { ok: true, blob: file };
  }
  const scale = Math.min(1, MAX_EDGE / longEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 투명 PNG 가 JPEG 에서 검게 나오지 않게 흰 바탕을 깐다.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (blob && blob.size > 0) return { ok: true, blob };
  }
  return file.size > MEAL_PHOTO_UPLOAD_LIMIT_BYTES ? tooBig : { ok: true, blob: file };
};
