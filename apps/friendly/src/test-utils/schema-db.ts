import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IsolatedDatabase } from './temp-db.js';

// 현재 스키마로 빈 임시 DB를 만든다. 실제 데이터를 복사하거나 운영 DB에 연결하지 않는다.
export function useSchemaDatabase(): IsolatedDatabase {
  const folder = mkdtempSync(join(tmpdir(), 'friendly-schema-test-'));
  const url = `file:${join(folder, 'test.db')}`;
  const previous = process.env.DATABASE_URL;
  const schema = resolve(dirname(fileURLToPath(import.meta.url)), '../../prisma/schema.prisma');
  const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  try {
    execFileSync(process.execPath, [cli, 'db', 'push', '--schema', schema, '--skip-generate'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
      timeout: 30_000,
    });
    process.env.DATABASE_URL = url;
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return {
    url,
    restore: () => {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
