import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useSchemaDatabase, type IsolatedDatabase } from '../test-utils/schema-db.js';
import { SHADOW_STALE_MS, createShadowTable, dropShadowTable, shadowTablePrefix, swapShadowTable } from './shadow-table.js';

// 섀도 표 교체(lib/shadow-table) — 임시 DB 의 작은 표로 ① 스테이징 이름이 실행마다 다르고 정의는 원본과 같음 ② 교체가
// 원본 자리·인덱스 이름을 그대로 두고 after 와 한 트랜잭션 ③ 겹친 실행이 서로의 표에 쓰지 않음(늦게 교체한 쪽이 남음)
// ④ 시작할 때 오래된 잔여물만 지움 을 고정한다.

const TABLE = 'shadow_demo';
const PREFIX = shadowTablePrefix(TABLE);
const NAME_RE = new RegExp(`^${PREFIX}_[0-9a-z]+_[0-9a-f]{8}$`);

describe('shadow-table (스키마 임시 DB)', () => {
  let db: IsolatedDatabase;
  let prisma: PrismaClient;

  const objects = async () =>
    (
      await prisma.$queryRawUnsafe<{ type: string; name: string }[]>(
        `SELECT type, name FROM sqlite_master WHERE tbl_name GLOB '${TABLE}*' ORDER BY type, name`,
      )
    ).map((o) => `${o.type}:${o.name}`);
  const rows = async () =>
    (await prisma.$queryRawUnsafe<{ id: string; v: number | bigint }[]>(`SELECT id, v FROM "${TABLE}" ORDER BY id`)).map((r) => `${r.id}=${Number(r.v)}`);
  const insert = (table: string, id: string, v: number) => prisma.$executeRawUnsafe(`INSERT INTO "${table}" (id, v) VALUES ('${id}', ${v})`);
  const BASE = [`index:${TABLE}_v_idx`, `index:sqlite_autoindex_${TABLE}_1`, `table:${TABLE}`];

  beforeAll(async () => {
    db = useSchemaDatabase();
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`CREATE TABLE "${TABLE}" (id TEXT NOT NULL PRIMARY KEY, v INTEGER NOT NULL)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "${TABLE}_v_idx" ON "${TABLE}"(v)`);
    await insert(TABLE, 'old', 0);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    db.restore();
  });

  it('스테이징 이름은 실행마다 다르고, 정의는 원본과 같되 보조 인덱스는 교체 뒤로 미룬다', async () => {
    const a = await createShadowTable(prisma, TABLE);
    const b = await createShadowTable(prisma, TABLE);
    try {
      expect(a.name).toMatch(NAME_RE);
      expect(b.name).toMatch(NAME_RE);
      expect(a.name).not.toBe(b.name);
      expect(a.indexes).toEqual([`CREATE INDEX "${TABLE}_v_idx" ON "${TABLE}"(v)`]);
      // 스테이징엔 PK 만 있다(보조 인덱스 없이 채워야 빠르다).
      expect(await objects()).toEqual(
        [...BASE, `index:sqlite_autoindex_${a.name}_1`, `index:sqlite_autoindex_${b.name}_1`, `table:${a.name}`, `table:${b.name}`].sort(),
      );
      await insert(a.name, 'x', 1);
      await expect(insert(a.name, 'x', 2)).rejects.toThrow();
    } finally {
      await dropShadowTable(prisma, a);
      await dropShadowTable(prisma, b);
    }
    expect(await objects()).toEqual(BASE);
    expect(await rows()).toEqual(['old=0']);
  });

  it('교체 — 원본 자리에 스테이징 행만 남고 인덱스 이름은 그대로, after 가 실패하면 교체도 없던 일', async () => {
    const failed = await createShadowTable(prisma, TABLE);
    await insert(failed.name, 'n1', 1);
    await expect(
      swapShadowTable(prisma, TABLE, failed, [prisma.$executeRawUnsafe('INSERT INTO "no_such_table" VALUES (1)')]),
    ).rejects.toThrow();
    expect(await rows()).toEqual(['old=0']);
    await dropShadowTable(prisma, failed);
    expect(await objects()).toEqual(BASE);

    const shadow = await createShadowTable(prisma, TABLE);
    await insert(shadow.name, 'n1', 1);
    await insert(shadow.name, 'n2', 2);
    await swapShadowTable(prisma, TABLE, shadow, [prisma.lifeMasterSync.create({ data: { layer: 'shadow-test', count: 2 } })]);
    expect(await rows()).toEqual(['n1=1', 'n2=2']);
    expect(await objects()).toEqual(BASE);
    expect(await prisma.lifeMasterSync.count({ where: { layer: 'shadow-test' } })).toBe(1);
    // 교체된 표도 PK 를 강제하고, 이미 교체된 정의를 다시 복사해 한 번 더 교체할 수 있다.
    await expect(insert(TABLE, 'n1', 9)).rejects.toThrow();
    const again = await createShadowTable(prisma, TABLE);
    await insert(again.name, 'm1', 1);
    await swapShadowTable(prisma, TABLE, again);
    expect(await rows()).toEqual(['m1=1']);
    expect(await objects()).toEqual(BASE);
  });

  it('겹친 실행 — 늦게 시작한 실행이 먼저 실행의 스테이징을 건드리지 않고, 각자 제 행만 게시한다', async () => {
    // 고정 이름이던 때: B 가 시작하며 A 의 스테이징을 지우고 다시 만들어, A 의 남은 행이 B 의 표로 들어간 채 A 가 게시했다.
    const a = await createShadowTable(prisma, TABLE);
    await insert(a.name, 'a1', 1);
    const b = await createShadowTable(prisma, TABLE);
    await insert(b.name, 'b1', 1);
    await insert(a.name, 'a2', 2);
    await swapShadowTable(prisma, TABLE, a);
    expect(await rows()).toEqual(['a1=1', 'a2=2']);
    await insert(b.name, 'b2', 2);
    await swapShadowTable(prisma, TABLE, b);
    expect(await rows()).toEqual(['b1=1', 'b2=2']);
    expect(await objects()).toEqual(BASE);
  });

  it('시작할 때 오래된 잔여물(예전 고정 이름·30분 넘은 스테이징)만 지운다 — 최근 것·형식이 다른 표는 둔다', async () => {
    const now = Date.now();
    const stale = `${PREFIX}_${(now - SHADOW_STALE_MS - 1_000).toString(36)}_0123abcd`;
    const live = `${PREFIX}_${(now - SHADOW_STALE_MS + 60_000).toString(36)}_89abcdef`;
    const foreign = `${PREFIX}_backup`;
    for (const name of [PREFIX, stale, live, foreign]) await prisma.$executeRawUnsafe(`CREATE TABLE "${name}" (junk TEXT)`);
    const shadow = await createShadowTable(prisma, TABLE, now);
    try {
      expect((await objects()).filter((o) => o.startsWith('table:'))).toEqual([`table:${TABLE}`, `table:${foreign}`, `table:${live}`, `table:${shadow.name}`].sort());
    } finally {
      await dropShadowTable(prisma, shadow);
      for (const name of [live, foreign]) await prisma.$executeRawUnsafe(`DROP TABLE "${name}"`);
    }
    expect(await objects()).toEqual(BASE);
  });

  it('표가 없거나 이름이 식별자가 아니면 만들지 않는다', async () => {
    await expect(createShadowTable(prisma, 'no_such_table_here')).rejects.toThrow('표 정의를 복사하지 못했습니다');
    await expect(createShadowTable(prisma, 'bad"name')).rejects.toThrow('섀도 표를 만들 수 없는 표 이름');
    expect(await objects()).toEqual(BASE);
  });
});
