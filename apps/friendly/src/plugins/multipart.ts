import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';

// 영수증 이미지 업로드 등 multipart/form-data 요청을 지원한다. 한도는
// 영수증 한 장 기준으로 충분히 잡되, DoS 여지를 줄이려 5MB 로 제한.
// 한도 초과 시 @fastify/multipart 가 자동으로 413 응답을 돌려준다.
export default fp(async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
      files: 1,
      fields: 5,
    },
  });
});
