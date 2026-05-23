import { PrismaClient } from '@prisma/client';
import { normalizeContactKey } from '../src/modules/settlement/settlement.service.js';

// 기존 SettlementParticipant 들을 (session.userId, normalizedKey) 로 그룹화해
// SettlementContact 를 생성하고, 모든 participant 의 contactId 를 채운다.
// 멱등 — 다시 돌려도 같은 그룹에 같은 contact 가 매칭되고 last* 값만 최신화된다.
//
// 정렬: session.createdAt asc + participant.orderIndex asc — 최신 정산의
// exclude* 가 lastExclude* 로 남도록 보장.
//
// 실행: pnpm --filter friendly backfill:contacts

const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  // 한 번에 다 가져온다 — 단골 백필이 돌아가는 시점의 정산 데이터는
  // 사용자별 수십~수백 건 수준. SQLite 단일 인스턴스라 streaming 불필요.
  const rows = await prisma.settlementParticipant.findMany({
    select: {
      id: true,
      name: true,
      nickname: true,
      excludeAlcohol: true,
      excludeNonAlcohol: true,
      excludeSide: true,
      session: { select: { userId: true, createdAt: true } },
    },
    orderBy: [
      { session: { createdAt: 'asc' } },
      { orderIndex: 'asc' },
    ],
  });

  console.log(`Found ${rows.length} participant(s).`);

  let createdCount = 0;
  let mergedCount = 0;
  let updatedParticipantCount = 0;

  for (const p of rows) {
    const name = (p.name ?? '').trim() || null;
    const nickname = (p.nickname ?? '').trim() || null;
    if (!name && !nickname) continue; // skip — application 정책상 못 들어오지만 방어.

    const userId = p.session.userId;
    const usedAt = p.session.createdAt;
    const normalizedKey = normalizeContactKey(name, nickname);

    const existing = await prisma.settlementContact.findUnique({
      where: { userId_normalizedKey: { userId, normalizedKey } },
      select: { id: true, lastUsedAt: true },
    });

    let contactId: string;
    if (!existing) {
      const created = await prisma.settlementContact.create({
        data: {
          userId,
          name,
          nickname,
          normalizedKey,
          lastExcludeAlcohol: p.excludeAlcohol,
          lastExcludeNonAlcohol: p.excludeNonAlcohol,
          lastExcludeSide: p.excludeSide,
          useCount: 1,
          lastUsedAt: usedAt,
          createdAt: usedAt,
        },
      });
      contactId = created.id;
      createdCount += 1;
    } else {
      // 정렬이 createdAt asc 라 마지막 update 가 lastExclude* 의 최신값이
      // 된다. lastUsedAt 도 그때그때 최신으로 갱신.
      const updated = await prisma.settlementContact.update({
        where: { id: existing.id },
        data: {
          name,
          nickname,
          lastExcludeAlcohol: p.excludeAlcohol,
          lastExcludeNonAlcohol: p.excludeNonAlcohol,
          lastExcludeSide: p.excludeSide,
          useCount: { increment: 1 },
          lastUsedAt: usedAt,
        },
        select: { id: true },
      });
      contactId = updated.id;
      mergedCount += 1;
    }

    await prisma.settlementParticipant.update({
      where: { id: p.id },
      data: { contactId },
    });
    updatedParticipantCount += 1;
  }

  console.log(
    `Done. created=${createdCount}, merged=${mergedCount}, participants linked=${updatedParticipantCount}`,
  );
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
