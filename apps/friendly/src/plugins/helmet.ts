import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';

export default fp(async (app) => {
  // CSP 는 의도적으로 끈다(문서화된 결정). 이유: helmet 은 Fastify 응답에만
  // 적용되는데, 공개 SEO 라우트(/r/:placeId, /share/settlements/:token)는 nginx 가
  // 정적으로 주는 것과 "동일한 SPA index.html"(vworld 지도 타일·jsdelivr 폰트·번들
  // 스크립트·네이버 이미지 다수)을 서빙한다. 여기에만 strict CSP 를 걸면 (a) nginx
  // 경유 같은 SPA 와 정책이 불일치하고 (b) 지도/폰트/이미지가 이 라우트에서만
  // 깨질 위험이 크다. SSR-lite 주입값은 이미 전부 escapeHtml/escapeJsonLd 로
  // 이스케이프돼 XSS 1차 방어가 견고하므로, SPA 전역 CSP 는 모든 경로를 균일하게
  // 덮는 nginx 레이어에서 도입하는 것이 옳다(배포 설정). 나머지 보호헤더
  // (X-Content-Type-Options·X-Frame-Options·HSTS 등)는 그대로 켠다.
  await app.register(helmet, { contentSecurityPolicy: false });
});
