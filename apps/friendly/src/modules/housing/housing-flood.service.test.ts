import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { HousingFloodIndex } from './housing-flood.service.js';

// 침수 흔적 색인의 지도 배지 개수 메모(D-V1) — 같은 적재 안에서는 좌표당 한 번만 세고(값은 near 와 같다), 적재(sync id)가
// 바뀌면 메모도 새 색인과 함께 버려진다. DB 는 가짜(적재 이력 + 흔적 행).

// 색인은 '마지막 확인 뒤 10분' 으로 재확인하므로 시계는 0 이 아닌 실제 같은 값에서 시작한다.
const T0 = Date.parse('2026-10-05T00:00:00Z');

const trace = (lat: number, lng: number) => ({ lat, lng, eventYear: 2022, eventMonth: 8, depthM: 0.3, sggCd: '11140' });

const fakePrisma = (state: { syncId: number; rows: ReturnType<typeof trace>[] }) =>
  ({
    lifeMasterSync: { findFirst: vi.fn(async () => ({ id: state.syncId })) },
    lifeFloodTrace: { findMany: vi.fn(async () => state.rows) },
  }) as unknown as PrismaClient;

describe('HousingFloodIndex.countNear', () => {
  it('near().length 와 같고, 같은 좌표는 다시 세지 않는다', async () => {
    const db = { syncId: 1, rows: [trace(37.5667, 126.9783), trace(37.566, 126.9782), trace(37.568, 126.9782)] };
    const index = new HousingFloodIndex(fakePrisma(db), () => T0);
    const s = (await index.ensure())!;
    const near = vi.spyOn(HousingFloodIndex, 'near');
    expect(HousingFloodIndex.countNear(s, 37.5666, 126.9782)).toBe(HousingFloodIndex.near(s, 37.5666, 126.9782).length);
    near.mockClear();
    for (let i = 0; i < 5; i += 1) expect(HousingFloodIndex.countNear(s, 37.5666, 126.9782)).toBe(2);
    expect(near).not.toHaveBeenCalled();
    expect(HousingFloodIndex.countNear(s, 37.568, 126.9782)).toBe(1); // 다른 좌표는 새로 센다
    expect(near).toHaveBeenCalledTimes(1);
    near.mockRestore();
  });

  it('적재가 바뀌면(sync id) 새 색인의 메모로 다시 센다', async () => {
    let t = T0;
    const db = { syncId: 1, rows: [trace(37.5667, 126.9783)] };
    const index = new HousingFloodIndex(fakePrisma(db), () => t);
    expect(await index.countFor(37.5666, 126.9782, '11140')).toBe(1);
    db.syncId = 2;
    db.rows = [trace(37.5667, 126.9783), trace(37.566, 126.9782), trace(37.5663, 126.9775)];
    expect(await index.countFor(37.5666, 126.9782, '11140')).toBe(1); // 확인 TTL 안 — 이전 색인
    t = T0 + 11 * 60_000;
    expect(await index.countFor(37.5666, 126.9782, '11140')).toBe(3);
    expect(await index.countFor(37.5666, 126.9782, '26470')).toBeNull(); // 범위 밖 시도
  });
});
