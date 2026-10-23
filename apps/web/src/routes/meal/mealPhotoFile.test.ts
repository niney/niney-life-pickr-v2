import { describe, expect, it } from 'vitest';
import { exifJpeg } from '~/test/fixtures/exifJpeg';
import { MEAL_PHOTO_UPLOAD_LIMIT_BYTES, parseExifTakenAt, prepareMealPhoto, readPhotoTakenAt } from './mealPhotoFile';

// 식단 사진 파일 손질 — EXIF 촬영 시각 파싱(바이트 순서·IFD 위치·없는 경우)과, 브라우저가 못 읽는 사진의 처리.

describe('parseExifTakenAt', () => {
  it('Exif IFD 의 DateTimeOriginal 을 IFD0 DateTime 보다 먼저 읽는다(빅엔디언, 앞의 APP0 는 건너뛴다)', () => {
    const at = parseExifTakenAt(
      exifJpeg({ original: '2026:09:20 12:34:56', dateTime: '2026:09:21 08:00:00', app0: true }),
    );
    expect(at).toEqual(new Date(2026, 8, 20, 12, 34, 56));
  });

  it('리틀엔디언도 읽고, DateTimeOriginal 이 없으면 IFD0 DateTime 을 쓴다', () => {
    expect(parseExifTakenAt(exifJpeg({ original: '2026:01:02 03:04:05', little: true }))).toEqual(
      new Date(2026, 0, 2, 3, 4, 5),
    );
    expect(parseExifTakenAt(exifJpeg({ dateTime: '2025:12:31 23:59:00', little: true }))).toEqual(
      new Date(2025, 11, 31, 23, 59, 0),
    );
  });

  it('EXIF 가 없거나 JPEG 가 아니거나 잘렸거나 시각이 비어 있으면 null', () => {
    expect(parseExifTakenAt(exifJpeg({}))).toBeNull();
    expect(parseExifTakenAt(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(parseExifTakenAt(exifJpeg({ original: '2026:09:20 12:34:56' }).slice(0, 40))).toBeNull();
    expect(parseExifTakenAt(exifJpeg({ original: '    :  :     :  :  ' }))).toBeNull();
  });
});

describe('readPhotoTakenAt', () => {
  const now = new Date(2026, 9, 23, 12, 0, 0);

  it('파일 앞부분에서 촬영 시각을 읽는다', async () => {
    const file = new File([exifJpeg({ original: '2026:10:22 19:05:00' })], 'a.jpg', { type: 'image/jpeg' });
    expect(await readPhotoTakenAt(file, now)).toEqual(new Date(2026, 9, 22, 19, 5, 0));
  });

  it('카메라 시계가 틀려 미래로 찍힌 시각은 쓰지 않는다', async () => {
    const file = new File([exifJpeg({ original: '2026:10:24 09:00:00' })], 'a.jpg', { type: 'image/jpeg' });
    expect(await readPhotoTakenAt(file, now)).toBeNull();
  });
});

describe('prepareMealPhoto', () => {
  // jsdom 은 사진을 그리지 못한다 — 브라우저가 못 읽는 형식(데스크톱 Chrome 의 HEIC)과 같은 경로를 탄다.
  it('못 읽는 사진은 원본을 그대로 쓰고, 서버 한도를 넘으면 올리지 않는다', async () => {
    const small = new File(['x'], 'a.heic', { type: 'image/heic' });
    expect(await prepareMealPhoto(small)).toEqual({ ok: true, blob: small });

    const big = new File(['x'], 'big.heic', { type: 'image/heic' });
    Object.defineProperty(big, 'size', { value: MEAL_PHOTO_UPLOAD_LIMIT_BYTES + 1 });
    expect(await prepareMealPhoto(big)).toEqual({ ok: false, message: expect.stringContaining('5MB') });
  });
});
