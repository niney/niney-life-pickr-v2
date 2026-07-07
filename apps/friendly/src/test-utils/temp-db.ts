import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// dev.db 의 실제 경로. 이 파일이 src/test-utils/temp-db.ts 이므로 두 단계 위가
// apps/friendly, 그 아래 data/dev.db. (DATABASE_URL 의 "file:../data/dev.db" 는
// prisma 스키마 디렉터리 기준 상대경로라 여기서 그대로 못 쓴다.)
const DEV_DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/dev.db');

export interface IsolatedDatabase {
  /** 격리 DB 의 file: URL. 이미 process.env.DATABASE_URL 에 설정돼 있다. */
  url: string;
  /** process.env.DATABASE_URL 원복 + 임시 파일 삭제. afterAll 에서 호출한다. */
  restore: () => void;
}

// dev.db 를 복사해 스키마만 남기고 모든 행을 비운 격리 SQLite 를 만들고,
// process.env.DATABASE_URL 을 그 파일로 바꾼다. 이후 build 되는 앱의
// PrismaClient(plugins/prisma.ts 의 `new PrismaClient()`)가 이 빈 DB 에 붙는다.
//
// 왜 필요한가: 테스트 스위트는 .env 의 실 dev.db(실데이터 다수)를 그대로 물고
// 도는데, 랭킹·글로벌 메뉴처럼 "테이블 전역"을 집계·페이지네이션하는 기능은
// 실데이터가 시드를 밀어내(페이지 컷오프) 결과가 비결정적이 된다. 이 헬퍼로
// 해당 describe 만 빈 DB 에 격리하면 시드만 남아 결정적으로 검증된다.
//
// 안전성: vitest.config.ts 의 fileParallelism:false 로 파일이 직렬 실행되고,
// 스왑/원복을 같은 describe 의 beforeAll/afterAll 로 감싸므로 전역 process.env
// 변경이 다른 테스트와 경합하지 않는다. 스키마는 dev.db 를 복사해 그대로 쓰므로
// 마이그레이션과 항상 일치한다(행만 비움).
//
// 구현 메모: 행 비우기는 node:sqlite 가 아니라 Prisma 원시 SQL 로 한다 —
// node:sqlite 는 아직 Vite 가 외부 모듈로 해석하지 못해 테스트 로드가 깨진다.
export async function useIsolatedDatabase(): Promise<IsolatedDatabase> {
  const dir = mkdtempSync(join(tmpdir(), 'friendly-testdb-'));
  const dbPath = join(dir, 'test.db');
  copyFileSync(DEV_DB_PATH, dbPath);

  const url = `file:${dbPath.replace(/\\/g, '/')}`;
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;

  // 임시 클라이언트로 모든 사용자 테이블을 비운다 — FK 를 끄고 삭제 순서 무관하게
  // 전량 제거. 앱이 붙기 전에 disconnect 한다.
  const cleaner = new PrismaClient();
  try {
    await cleaner.$executeRawUnsafe('PRAGMA foreign_keys=OFF');
    const tables = await cleaner.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'",
    );
    for (const { name } of tables) {
      await cleaner.$executeRawUnsafe(`DELETE FROM "${name}"`);
    }
  } finally {
    await cleaner.$disconnect();
  }

  return {
    url,
    restore: () => {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
