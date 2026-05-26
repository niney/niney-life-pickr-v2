import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';

// Universal Links (iOS) / App Links (Android) 검증 파일을 동적으로 응답.
// 정적 파일 대신 라우트로 만든 이유:
// - env 변경만으로 즉시 반영 (재배포·dist 복사 불필요)
// - fastify 가 이미 떠 있어 추가 정적 플러그인 의존성 불필요
// - 비어있을 때 404 로 명확히 — 잘못된 빈 JSON 으로 검증 실패하는 사고 회피
//
// 두 파일 모두 인증 불필요. iOS/Android 가 시스템 단에서 fetch 한다.
// Cache-Control 짧게 — 첫 설정 후 변경되어도 빨리 반영되게.

const wellKnownRoutes: FastifyPluginAsync = async (app) => {
  // iOS Universal Links — /.well-known/apple-app-site-association
  // - 응답: JSON. 확장자 없는 path 라 (1) 라우트 우선매칭, (2) Content-Type
  //   application/json 명시.
  // - components 의 "/" 는 path 매칭. 토큰 자리는 "*" wildcard.
  // - 한 앱이 여러 환경(dev/staging/prod bundle) 일 땐 details 를 여러 개 둘 수도.
  app.get('/.well-known/apple-app-site-association', async (_req, reply) => {
    const teamId = env.APP_TEAM_ID.trim();
    const bundle = env.APP_BUNDLE_ID.trim();
    if (!teamId || !bundle) {
      reply.code(404);
      return { error: 'apple-app-site-association not configured' };
    }
    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      applinks: {
        details: [
          {
            appIDs: [`${teamId}.${bundle}`],
            components: [{ '/': '/share/settlements/*' }],
          },
        ],
      },
    };
  });

  // Android App Links — /.well-known/assetlinks.json
  // - 응답: JSON array.
  // - sha256_cert_fingerprints 는 콤마 구분 env 를 split. 디버그/릴리스 다르면
  //   둘 다 넣는다 (개발자 단말에서 .apk 직접 설치한 빌드도 검증되게).
  app.get('/.well-known/assetlinks.json', async (_req, reply) => {
    const pkg = env.ANDROID_APP_PACKAGE.trim();
    const fingerprints = env.ANDROID_SHA256_FINGERPRINTS.split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!pkg || fingerprints.length === 0) {
      reply.code(404);
      return { error: 'assetlinks.json not configured' };
    }
    reply.header('Content-Type', 'application/json');
    reply.header('Cache-Control', 'public, max-age=300');
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: pkg,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ];
  });
};

export default wellKnownRoutes;
