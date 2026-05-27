// 실제 구현은 ~/components/tabs-layout 으로 분리 — Metro 가 web 빌드에서
// 형제 파일 .web.tsx 를 자동 채택해 native-only import 가 RN-Web 번들에
// 들어가지 않게 한다.
export { default } from '~/components/tabs-layout';
