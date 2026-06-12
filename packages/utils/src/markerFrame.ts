// 지도 마커 공용 프레임 빌더 — 식당(restaurantCategory)·버스(busMarker)가
// 문자 단위로 동일했던 SVG 골격을 한 곳으로. MapCanvas 의 anchor·라벨
// offset·SMALL_ICON_SCALE 이 이 규격(선택 32×48 핀 / 비선택 26×26 원)에
// 맞춰져 있어 수치를 바꾸면 MapCanvas 와 함께 봐야 한다.

export interface MarkerFrameOptions {
  // 배경 채움색. 흰 외곽선(stroke 2)은 프레임 고정.
  fill: string;
  // 24×24 viewBox 기준 흰색 라인 아이콘 조각 — 프레임이 16×16 영역으로
  // 축소(scale 0.667) 배치한다.
  innerSvg: string;
}

// 선택 핀: 32×48, 마커 좌표는 핀 꼭지점(anchor [0.5, 1]).
export function buildPinMarkerSvg({ fill, innerSvg }: MarkerFrameOptions): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">' +
    `<path fill="${fill}" stroke="#fff" stroke-width="2" ` +
    'd="M16 2C8.268 2 2 8.268 2 16c0 10 14 30 14 30s14-20 14-30c0-7.732-6.268-14-14-14z"/>' +
    // 아이콘 16×16 영역 (8..24). viewBox 24의 0.667 scale + offset 8.
    '<g transform="translate(8 8) scale(0.667)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    innerSvg +
    '</g>' +
    '</svg>'
  );
}

// 비선택 원: 26×26, 마커 좌표는 중심(anchor [0.5, 0.5]).
export function buildCircleMarkerSvg({ fill, innerSvg }: MarkerFrameOptions): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">' +
    `<circle fill="${fill}" stroke="#fff" stroke-width="2" cx="13" cy="13" r="11.5"/>` +
    // 아이콘 16×16 영역 (5..21). 24의 0.667 scale + offset 5.
    '<g transform="translate(5 5) scale(0.667)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
    innerSvg +
    '</g>' +
    '</svg>'
  );
}
