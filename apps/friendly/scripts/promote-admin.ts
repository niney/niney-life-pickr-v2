import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx scripts/promote-admin.ts <email>');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
    select: { id: true, email: true, role: true },
  });
  console.log(`Promoted: ${user.email} (${user.id}) → ${user.role}`);
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
    console.error(`No user with email "${email}".`);
    process.exit(1);
  }
  throw err;
} finally {
  await prisma.$disconnect();
}
