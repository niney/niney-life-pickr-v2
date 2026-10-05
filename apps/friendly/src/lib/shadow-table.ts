/**
 * 표 전량 교체용 섀도(스테이징) 표 — 같은 정의의 표를 따로 채운 뒤 원본 DROP + RENAME 으로 바꿔 끼운다. 쓰기 락을
 * 교체 순간에만 잡으려고 쓴다(집값 통계 D-4·X-5, 상가 X-V3).
 *
 * 스테이징 이름은 실행마다 다르다(`<표>_next_<시작 시각 36진수>_<난수>`). 이름을 고정하면 서버 cron 과 CLI 처럼 서로
 * 다른 프로세스가 겹쳐 돌 때, 늦게 시작한 쪽이 그 이름을 지우고 다시 만든 표에 먼저 쪽의 남은 INSERT 가 들어가 두
 * 실행의 행이 섞인 채 게시됐다(먼저 쪽은 성공으로 기록). 이름이 다르면 겹쳐도 각자 온전한 표를 만들고 늦게 교체한
 * 쪽이 남는다 — 예전 한 트랜잭션 교체가 겹쳤을 때와 같은 결과다.
 *
 * 중단된 실행이 남긴 스테이징은 다음 실행이 시작할 때 지운다(migrate drift·디스크). 다만 이름에 적힌 시각이
 * SHADOW_STALE_MS 보다 오래된 것만 — 돌고 있는 다른 실행의 표는 건드리지 않는다. 예전 고정 이름(`<표>_next`)은 이제
 * 만드는 코드가 없어 바로 지운다. 표 정의·보조 인덱스는 sqlite_master 에서 복사하므로 마이그레이션이 열을 더해도
 * 따라가고 Prisma 스키마는 그대로다.
 */
import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

// 교체 한 번은 길어야 몇 분(상가 130만 행)이다 — 이보다 오래된 스테이징은 중단 잔여물로 본다. 살아 있는 실행을
// 잘못 지워도 그 실행이 "no such table" 로 실패할 뿐 원본은 교체 트랜잭션에서만 바뀐다.
export const SHADOW_STALE_MS = 30 * 60_000;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 예전 고정 스테이징 이름이자 실행별 이름의 접두. */
export const shadowTablePrefix = (table: string): string => `${table}_next`;

const shadowTableName = (table: string, nowMs: number): string =>
  `${shadowTablePrefix(table)}_${Math.floor(nowMs).toString(36)}_${randomBytes(4).toString('hex')}`;

// 우리가 만든 이름이면 만든 시각(ms), 예전 고정 이름이면 0(늘 잔여물), 그 밖(접두만 같은 남의 표)은 null.
const shadowCreatedAt = (table: string, name: string): number | null => {
  const prefix = shadowTablePrefix(table);
  if (name === prefix) return 0;
  if (!name.startsWith(`${prefix}_`)) return null;
  const m = /^([0-9a-z]{1,12})_[0-9a-f]{8}$/.exec(name.slice(prefix.length + 1));
  return m ? parseInt(m[1]!, 36) : null;
};

export interface ShadowTable {
  /** 이번 실행의 스테이징 표 이름. */
  name: string;
  /** 교체 뒤 원래 이름으로 다시 만들 보조 인덱스 DDL(PK autoindex 는 sql 이 없고 RENAME 이 이름을 따라 바꾼다). */
  indexes: string[];
}

const dropStaleShadowTables = async (prisma: PrismaClient, table: string, nowMs: number): Promise<void> => {
  const rows = await prisma.$queryRaw<{ name: string }[]>(
    Prisma.sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB ${`${shadowTablePrefix(table)}*`}`,
  );
  for (const { name } of rows) {
    const createdAt = shadowCreatedAt(table, name);
    if (createdAt === null || nowMs - createdAt <= SHADOW_STALE_MS) continue;
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${name}"`);
  }
};

/** 원본과 같은 정의의 빈 스테이징 표를 이번 실행만의 이름으로 만든다(오래된 잔여물은 먼저 지운다). */
export const createShadowTable = async (prisma: PrismaClient, table: string, nowMs: number = Date.now()): Promise<ShadowTable> => {
  if (!IDENT.test(table)) throw new Error(`섀도 표를 만들 수 없는 표 이름입니다: ${table}`);
  const objs = await prisma.$queryRaw<{ type: string; sql: string | null }[]>(
    Prisma.sql`SELECT type, sql FROM sqlite_master WHERE tbl_name = ${table} AND sql IS NOT NULL`,
  );
  const ddl = objs.find((o) => o.type === 'table')?.sql ?? '';
  const name = shadowTableName(table, nowMs);
  const createNext = ddl.replace(new RegExp(`^CREATE TABLE\\s+"?${table}"?(?=\\s*\\()`, 'i'), `CREATE TABLE "${name}"`);
  if (!ddl || createNext === ddl) throw new Error(`${table} 표 정의를 복사하지 못했습니다`);
  await dropStaleShadowTables(prisma, table, nowMs);
  await prisma.$executeRawUnsafe(createNext);
  return { name, indexes: objs.filter((o) => o.type === 'index').map((o) => o.sql!) };
};

/**
 * 원본 DROP + 스테이징 RENAME + 보조 인덱스 재생성을 한 트랜잭션으로. after(적재 이력 등)도 같은 트랜잭션에 넣는다 —
 * 교체와 기록이 함께 남거나 함께 없다.
 */
export const swapShadowTable = async (
  prisma: PrismaClient,
  table: string,
  shadow: ShadowTable,
  after: Prisma.PrismaPromise<unknown>[] = [],
): Promise<void> => {
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`DROP TABLE "${table}"`),
    prisma.$executeRawUnsafe(`ALTER TABLE "${shadow.name}" RENAME TO "${table}"`),
    ...shadow.indexes.map((sql) => prisma.$executeRawUnsafe(sql)),
    ...after,
  ]);
};

/** 실패 정리 — 이번 실행의 스테이징만 지운다. 정리 실패는 삼킨다(원래 에러를 가리지 않게, 잔여물은 다음 실행이 치운다). */
export const dropShadowTable = async (prisma: PrismaClient, shadow: ShadowTable): Promise<void> => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${shadow.name}"`).catch(() => undefined);
};
