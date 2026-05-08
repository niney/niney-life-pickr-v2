// vworld WMTS 타일 URL 빌더. 지도 렌더링은 OpenLayers 가 직접 담당하고,
// vworld 는 단지 타일 서버로만 쓴다 — vworld JS SDK (vw.ol3.Map) 를 안
// 쓰기 때문에 도메인 화이트리스트 부담이 없다 (WMTS 는 키만 검증).

// vworld 는 WMTS 1.0.0 엔드포인트를 다음 형태로 서빙한다:
//   https://api.vworld.kr/req/wmts/1.0.0/{KEY}/{LAYER}/{z}/{y}/{x}.png
// LAYER 는 'Base' (일반), 'gray', 'midnight', 'Satellite', 'Hybrid' 등.
const WMTS_BASE = 'https://api.vworld.kr/req/wmts/1.0.0';

export type VworldLayer = 'Base' | 'gray' | 'midnight' | 'Satellite' | 'Hybrid';

export const buildVworldTileUrl = (
  apiKey: string,
  layer: VworldLayer = 'Base',
): string => `${WMTS_BASE}/${apiKey}/${layer}/{z}/{y}/{x}.png`;

// 키 유효성 빠르게 확인용 — 서울 시청 부근의 1:1 줌 타일 한 장을 fetch.
// vworld 가 200(이미지) 또는 403/401(키 거부) 로 응답하므로, no-cors 모드
// 로도 ok 여부는 아니어도 fetch 실패 자체는 잡을 수 있다. 정확한 검증은
// 실제 지도가 그려지는지 확인.
export const probeVworldKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  // z/y/x = 7/44/109 정도면 한반도 한 장 들어옴. 작은 타일 하나만.
  const url = `${WMTS_BASE}/${apiKey}/Base/7/44/109.png`;
  try {
    const res = await fetch(url, { method: 'GET' });
    // vworld 는 키 거부 시 403 또는 빈 본문 200 + content-type 비-이미지로
    // 응답하기도 한다. 보수적으로 status + content-type 체크.
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return ct.startsWith('image/');
  } catch {
    return false;
  }
};
