// 테스트용 최소 JPEG(SOI + [APP0] + APP1 Exif + SOS + EOI). original 은 Exif IFD 의 DateTimeOriginal, dateTime 은
// IFD0 의 DateTime 으로 넣는다(형식 'YYYY:MM:DD HH:MM:SS'). gps 는 GPS IFD 의 위도·경도(도·분·초 유리수 + N/S·E/W).
// little 이면 리틀엔디언('II') TIFF.
export const exifJpeg = (opts: {
  original?: string;
  dateTime?: string;
  little?: boolean;
  app0?: boolean;
  gps?: { lat: number; lng: number };
}): ArrayBuffer => {
  const little = opts.little ?? false;
  const ifd0Count = (opts.dateTime ? 1 : 0) + (opts.original ? 1 : 0) + (opts.gps ? 1 : 0);
  const exifIfdOffset = 8 + 2 + ifd0Count * 12 + 4;
  const gpsIfdOffset = exifIfdOffset + (opts.original ? 2 + 12 + 4 : 0);
  let dataOffset = gpsIfdOffset + (opts.gps ? 2 + 4 * 12 + 4 : 0);
  const tiff = new DataView(new ArrayBuffer(dataOffset + 40 + (opts.gps ? 48 : 0)));
  const writeAsciiEntry = (at: number, tag: number, text: string) => {
    tiff.setUint16(at, tag, little);
    tiff.setUint16(at + 2, 2, little); // ASCII
    tiff.setUint32(at + 4, 20, little); // 19자 + NUL
    tiff.setUint32(at + 8, dataOffset, little);
    for (let i = 0; i < text.length; i += 1) tiff.setUint8(dataOffset + i, text.charCodeAt(i));
    dataOffset += 20;
  };
  // 방위 한 글자 — 4바이트 이하라 값 칸에 그대로 들어간다.
  const writeRefEntry = (at: number, tag: number, ref: string) => {
    tiff.setUint16(at, tag, little);
    tiff.setUint16(at + 2, 2, little); // ASCII
    tiff.setUint32(at + 4, 2, little); // 1자 + NUL
    tiff.setUint8(at + 8, ref.charCodeAt(0));
  };
  // 도·분·초 — 유리수 3개(분자/분모 각 4바이트)를 데이터 영역에 둔다.
  const writeDmsEntry = (at: number, tag: number, degrees: number) => {
    tiff.setUint16(at, tag, little);
    tiff.setUint16(at + 2, 5, little); // RATIONAL
    tiff.setUint32(at + 4, 3, little);
    tiff.setUint32(at + 8, dataOffset, little);
    const d = Math.floor(degrees);
    const minutes = (degrees - d) * 60;
    const m = Math.floor(minutes);
    const s = Math.round((minutes - m) * 60 * 10_000);
    for (const [i, [num, den]] of [[d, 1], [m, 1], [s, 10_000]].entries()) {
      tiff.setUint32(dataOffset + i * 8, num!, little);
      tiff.setUint32(dataOffset + i * 8 + 4, den!, little);
    }
    dataOffset += 24;
  };

  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, little);
  tiff.setUint32(4, 8, little);
  tiff.setUint16(8, ifd0Count, little);
  let entry = 10;
  if (opts.dateTime) {
    writeAsciiEntry(entry, 0x0132, opts.dateTime);
    entry += 12;
  }
  if (opts.original) {
    tiff.setUint16(entry, 0x8769, little); // Exif IFD 포인터
    tiff.setUint16(entry + 2, 4, little);
    tiff.setUint32(entry + 4, 1, little);
    tiff.setUint32(entry + 8, exifIfdOffset, little);
    tiff.setUint16(exifIfdOffset, 1, little);
    writeAsciiEntry(exifIfdOffset + 2, 0x9003, opts.original);
    entry += 12;
  }
  if (opts.gps) {
    tiff.setUint16(entry, 0x8825, little); // GPS IFD 포인터
    tiff.setUint16(entry + 2, 4, little);
    tiff.setUint32(entry + 4, 1, little);
    tiff.setUint32(entry + 8, gpsIfdOffset, little);
    tiff.setUint16(gpsIfdOffset, 4, little);
    writeRefEntry(gpsIfdOffset + 2, 1, opts.gps.lat >= 0 ? 'N' : 'S');
    writeDmsEntry(gpsIfdOffset + 14, 2, Math.abs(opts.gps.lat));
    writeRefEntry(gpsIfdOffset + 26, 3, opts.gps.lng >= 0 ? 'E' : 'W');
    writeDmsEntry(gpsIfdOffset + 38, 4, Math.abs(opts.gps.lng));
  }

  const app1Size = 2 + 6 + tiff.byteLength;
  return new Uint8Array([
    0xff, 0xd8,
    ...(opts.app0 ? [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00] : []),
    0xff, 0xe1, app1Size >> 8, app1Size & 0xff,
    ...Array.from('Exif\0\0', (c) => c.charCodeAt(0)),
    ...new Uint8Array(tiff.buffer),
    0xff, 0xda, 0x00, 0x02,
    0xff, 0xd9,
  ]).buffer;
};
