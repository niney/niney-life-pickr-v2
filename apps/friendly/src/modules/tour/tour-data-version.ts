// 여행로그 데이터 버전 — 공개 집계 캐시(인사이트 · 밀도·숙소·지역 비교 · 코스 프로필)를 적재·제거와 맞춘다.
//
// 적재(load:tour → replaceTourTables)와 제거(unload:tour → unloadTourTables)는 API 와 다른 프로세스에서 돌아 서비스의
// invalidate() 를 부를 수 없다. 대신 둘 다 데이터와 같은 트랜잭션에서 적재 이력(life_master_syncs, layer = utils tourSyncLayer)을
// 한 행 남기므로, 그 이력의 가장 큰 id 를 "데이터 버전" 으로 읽어 캐시를 그 버전에 묶는다. 떠 있는 API 는 커밋 뒤 첫 요청부터
// 새로 집계한다 — 환수·폐기(unload) 뒤에 옛 집계가 TTL 만큼 남지 않는다.
//
//   · 서비스는 요청마다 집계 쿼리보다 **먼저** 버전을 읽는다. 그래야 어떤 버전으로 담긴 값이 그 버전보다 옛 데이터일 수 없다
//     (나중에 읽으면 커밋 직전에 읽은 옛 데이터를 새 버전으로 담게 된다).
//   · 버전은 메모하지 않는다. 조회는 (layer, loadedAt) 인덱스만 읽는 한 번이고(이력 600행에서 0.07ms — 2026-10-04 실측),
//     몇 초라도 메모하면 그만큼 제거 뒤에도 옛 집계가 나간다.
//   · 이력 행을 남기지 않는 변경은 버전이 그대로라 TTL 로만 따라간다 — 표를 직접 고친 경우(테스트 픽스처는 늘 버전 0),
//     맛집 매칭(match:restaurant-tour)·사업자 상태(check:tour-biz) 갱신.
//   · 관광정보 동기화(sync:tour-kto — 코스 프로필이 읽는 운영 정보)도 바뀐 것이 있으면 제 layer 로 이력을 남긴다(15차).

import type { PrismaClient } from '@prisma/client';
import { TOUR_DATASET_KEYS, tourSyncLayer } from '@repo/utils';
import { LRUCache } from 'lru-cache';
import { TOUR_KTO_SYNC_LAYER } from './tour-kto-info.js';

const TOUR_SYNC_LAYERS = [...TOUR_DATASET_KEYS.map((key) => tourSyncLayer(key)), TOUR_KTO_SYNC_LAYER];

// 어느 데이터셋이든 적재·제거가 한 번 일어나면 값이 오른다(id 는 AUTOINCREMENT 라 다시 쓰이지 않는다). 이력이 없으면 0.
export const tourDataVersion = async (prisma: PrismaClient): Promise<number> => {
  const { _max } = await prisma.lifeMasterSync.aggregate({ where: { layer: { in: TOUR_SYNC_LAYERS } }, _max: { id: true } });
  return _max.id ?? 0;
};

// 데이터 버전 하나에 묶인 LRU. 키에 버전을 붙여 옛 항목을 비켜 가는 대신, 다른 버전으로 읽는 순간 담긴 것을 전부 버린다 —
// 제거된 데이터에서 나온 집계·프로필을 (다음 요청 때) 프로세스 메모리에서도 내려놓는다. 계산하는 사이에 버전이 바뀐 결과는
// 담지 않는다(그 결과가 옛 데이터일 수 있다).
export class TourVersionedCache<V extends object> {
  private readonly lru: LRUCache<string, V>;
  private version = 0;

  constructor(options: { max: number; ttl: number }) {
    this.lru = new LRUCache<string, V>(options);
  }

  get(version: number, key: string): V | undefined {
    if (version !== this.version) {
      this.lru.clear();
      this.version = version;
    }
    return this.lru.get(key);
  }

  set(version: number, key: string, value: V): void {
    if (version === this.version) this.lru.set(key, value);
  }

  // 지금 담긴 것이 그 값일 때만 뺀다(버전이 바뀌어 비워졌거나 다른 값이 들어왔으면 건드리지 않는다).
  drop(key: string, value: V): void {
    if (this.lru.peek(key) === value) this.lru.delete(key);
  }

  clear(): void {
    this.lru.clear();
  }
}
