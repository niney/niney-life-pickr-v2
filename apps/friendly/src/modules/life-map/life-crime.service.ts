// 일상지도 범죄 통계(배경 레이어) 조회 — 빌드 산출물 data/life-crime-stats.json(scripts/build-life-crime.ts,
// life-crime-build.ts)을 기동 시 한 번 계약으로 검증해 들고 있다가 그대로 내려준다. 정적 데이터라
// bbox·필터·DB 가 없다. 빌드 산출물이 계약과 어긋나면 서버가 뜨지 않게(조용한 500 대신) 여기서 막는다.

import { LifeCrimeStatsResult, type LifeCrimeStatsResultType } from '@repo/api-contract';
import lifeCrimeStatsJson from './data/life-crime-stats.json' with { type: 'json' };

export type LifeCrimeStatsData = Omit<LifeCrimeStatsResultType, 'fetchedAt'>;

const STATS: LifeCrimeStatsData = LifeCrimeStatsResult.omit({ fetchedAt: true }).parse(lifeCrimeStatsJson);

export class LifeCrimeService {
  private readonly now: () => Date;
  private readonly stats: LifeCrimeStatsData;

  constructor(deps: { now?: () => Date; stats?: LifeCrimeStatsData } = {}) {
    this.now = deps.now ?? (() => new Date());
    this.stats = deps.stats ?? STATS;
  }

  getStats(): LifeCrimeStatsResultType {
    return { ...this.stats, fetchedAt: this.now().toISOString() };
  }
}
