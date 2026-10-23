// 테스트용 최소 JPEG(SOI + [APP0] + APP1 Exif + SOS + EOI). original 은 Exif IFD 의 DateTimeOriginal, dateTime 은
// IFD0 의 DateTime 으로 넣는다(형식 'YYYY:MM:DD HH:MM:SS'). little 이면 리틀엔디언('II') TIFF.
export const exifJpeg = (opts: {
  original?: string;
  dateTime?: string;
  little?: boolean;
  app0?: boolean;
}): ArrayBuffer => {
  const little = opts.little ?? false;
  const ifd0Count = (opts.dateTime ? 1 : 0) + (opts.original ? 1 : 0);
  const exifIfdOffset = 8 + 2 + ifd0Count * 12 + 4;
  let dataOffset = exifIfdOffset + (opts.original ? 2 + 12 + 4 : 0);
  const tiff = new DataView(new ArrayBuffer(dataOffset + 40));
  const writeAsciiEntry = (at: number, tag: number, text: string) => {
    tiff.setUint16(at, tag, little);
    tiff.setUint16(at + 2, 2, little); // ASCII
    tiff.setUint32(at + 4, 20, little); // 19자 + NUL
    tiff.setUint32(at + 8, dataOffset, little);
    for (let i = 0; i < text.length; i += 1) tiff.setUint8(dataOffset + i, text.charCodeAt(i));
    dataOffset += 20;
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
