// Metro 가 플랫폼별로 .native.tsx / .web.tsx 를 우선 선택한다. 이 파일은
// 타입스크립트 해석 및 비-RN 환경 대비 fallback — 실제 런타임은 native 구현.
export { PublicRestaurantsWebMap } from './PublicRestaurantsWebMap.native';
