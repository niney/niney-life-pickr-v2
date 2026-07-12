import type { FastifyInstance } from 'fastify';

type Role = 'USER' | 'ADMIN';

// 인증 라우트 테스트가 app.jwt.sign 으로 만드는 합성 토큰의 userId 에 대응하는
// 실제 User 행을 시딩한다. 2차 하드닝 이후 authenticate/resolveSseAdmin 가 발급 후
// 무효화(tokenVersion)와 role 을 DB 에서 확인하므로, 토큰만으론 401 이 난다. role 은
// DB 값으로 갱신되므로 requireAdmin 검증을 위해 정확한 role 을 심어야 한다.
// id 로 upsert(멱등) — fileParallelism:false(직렬)라 공유 dev.db 에서 같은 합성 id
// 를 재시딩해도 안전하다. 격리 DB(useIsolatedDatabase) 케이스에서도 앱의 prisma 를
// 그대로 쓰므로 해당 빈 DB 에 시딩된다.
export async function seedAuthUsers(
  app: FastifyInstance,
  users: Array<{ id: string; role: Role }>,
): Promise<void> {
  for (const { id, role } of users) {
    await app.prisma.user.upsert({
      where: { id },
      update: { role },
      create: { id, email: `${id}@seed.local`, passwordHash: 'x', role },
    });
  }
}
