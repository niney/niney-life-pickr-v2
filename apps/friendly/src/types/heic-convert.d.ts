// heic-convert 는 타입 정의를 제공하지 않는다. storeImage 에서 쓰는 최소
// 시그니처만 선언. CommonJS default export (`module.exports = convert`).
declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array;
    format: 'JPEG' | 'PNG';
    // JPEG 일 때만 의미 있음. 0..1.
    quality?: number;
  }
  function convert(options: ConvertOptions): Promise<ArrayBuffer>;
  export = convert;
}
