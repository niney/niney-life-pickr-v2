// 웹 실측 추정 — fatsecret.kr 검색 페이지를 직접 받아(food-web-estimate.ts 파서) 어휘 단위로 영구 캐시.
//
// 검색엔진·LLM 을 쓰지 않는다: Ollama web_search 는 한국어 음식명을 매칭하지 못했고, LLM 은 숫자를 지어낼
// 여지가 있다. 페이지 한 장에 일반 항목 + 브랜드 실측이 여럿 실려 있어 그것으로 복수 출처 일치를 본다.
// 예의: 요청 간격 FETCH_INTERVAL_MS, UA 명시, 결과는 부정까지 저장해 같은 이름을 다시 묻지 않는다.

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { normalizeTerm } from '../../lib/text.js';
import { FailureBackoff } from './menu-failure-backoff.js';
import {
  FOOD_WEB_ESTIMATE_SOURCE,
  FOOD_WEB_ESTIMATE_VERSION,
  aggregateWebSamples,
  buildFatsecretSearchUrl,
  htmlToText,
  parseFatsecretSearch,
  webQueryStem,
  type WebEstimate,
} from './food-web-estimate.js';

// 어간 재질의까지 두 번 받을 수 있어 넉넉히.
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_INTERVAL_MS = 1_000;
// 한 번의 estimateMany 에서 새로 조회하는 이름 상한(식당 하나 메뉴판).
const MAX_FETCH_PER_CALL = 15;

export interface WebEstimateHit {
  kcalPer100g: number;
  agreeing: number;
  basis: 'multi' | 'single';
  source: string;
}

export type WebFetcher = (url: string, signal: AbortSignal) => Promise<{ status: number; text: string }>;

const defaultFetcher: WebFetcher = async (url, signal) => {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; life-pickr/1.0)', 'Accept-Language': 'ko' },
    signal,
  });
  return { status: res.status, text: await res.text() };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class FoodWebEstimateService {
  private readonly fetcher: WebFetcher;
  // 다음 요청을 보낼 수 있는 가장 이른 시각. 예약을 동기적으로 갱신해야 동시에 들어온 체인들이 같은 시각을 보고
  // 한꺼번에 fetch 하지 않는다(예전: 마지막 fetch 시각만 보고 기다려 4체인이 1초마다 4건씩 동시에 나갔다).
  private nextFetchAt = 0;
  private readonly intervalMs: number;
  private readonly failures: FailureBackoff;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: {
      logger?: FastifyBaseLogger;
      fetcher?: WebFetcher;
      intervalMs?: number;
      // 조회 실패(비200·네트워크) 이름의 재시도 간격(테스트 주입용). 기본 30분.
      failures?: FailureBackoff;
    } = {},
  ) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
    this.intervalMs = opts.intervalMs ?? FETCH_INTERVAL_MS;
    this.failures = opts.failures ?? new FailureBackoff();
  }

  /** 다음 fetch 자리를 예약하고 기다릴 시간(ms)을 돌려준다. */
  private reserveFetchSlot(): number {
    const now = Date.now();
    const at = Math.max(now, this.nextFetchAt);
    this.nextFetchAt = at + this.intervalMs;
    return at - now;
  }

  /**
   * 캐시만 읽는다. 값 null = "조회했고 미채택", 키 없음 = 아직 안 조회. 최근 조회에 실패해 재시도 간격 안인 이름도
   * null 로 준다 — 공개 메뉴 탭 폴링마다 같은 이름으로 외부 사이트를 다시 두드리지 않는다.
   */
  async lookupCached(names: string[]): Promise<Map<string, WebEstimateHit | null>> {
    const out = await this.lookupStored(names);
    for (const n of names) {
      if (!out.has(n) && this.failures.isBackingOff(normalizeTerm(n))) out.set(n, null);
    }
    return out;
  }

  private async lookupStored(names: string[]): Promise<Map<string, WebEstimateHit | null>> {
    const out = new Map<string, WebEstimateHit | null>();
    const normToNames = new Map<string, string[]>();
    for (const n of names) {
      const norm = normalizeTerm(n);
      if (norm) normToNames.set(norm, [...(normToNames.get(norm) ?? []), n]);
    }
    if (normToNames.size === 0) return out;
    const rows = await this.prisma.foodWebEstimate.findMany({
      where: { nameNorm: { in: [...normToNames.keys()] }, version: { gte: FOOD_WEB_ESTIMATE_VERSION } },
      select: { nameNorm: true, kcalPer100g: true, agreeing: true, basis: true, source: true },
    });
    for (const r of rows) {
      const hit: WebEstimateHit | null =
        r.kcalPer100g !== null
          ? {
              kcalPer100g: r.kcalPer100g,
              agreeing: r.agreeing,
              basis: r.basis === 'single' ? 'single' : 'multi',
              source: r.source,
            }
          : null;
      for (const n of normToNames.get(r.nameNorm) ?? []) out.set(n, hit);
    }
    return out;
  }

  /** 캐시에 없는 이름만 조회·저장한다. 반환은 이번에 새로 판정한 이름들만. */
  async estimateMany(
    names: string[],
    opts: { signal?: AbortSignal } = {},
  ): Promise<Map<string, WebEstimateHit | null>> {
    const out = new Map<string, WebEstimateHit | null>();
    const cached = await this.lookupCached(names);
    const byNorm = new Map<string, string>();
    for (const n of names) {
      const norm = normalizeTerm(n);
      if (norm && !cached.has(n) && !byNorm.has(norm)) byNorm.set(norm, n);
    }
    for (const [norm, name] of [...byNorm.entries()].slice(0, MAX_FETCH_PER_CALL)) {
      if (opts.signal?.aborted) break;
      const est = await this.fetchOne(name, opts.signal);
      if (est === undefined) continue; // 네트워크 오류 — 저장하지 않고 다음에 다시
      const hit: WebEstimateHit | null = est
        ? { kcalPer100g: est.kcalPer100g, agreeing: est.agreeing, basis: est.basis, source: FOOD_WEB_ESTIMATE_SOURCE }
        : null;
      for (const n of names) if (normalizeTerm(n) === norm) out.set(n, hit);
    }
    return out;
  }

  /** undefined = 조회 실패(저장 안 함), null = 미채택(저장), 객체 = 채택(저장). */
  private async fetchOne(name: string, outerSignal?: AbortSignal): Promise<WebEstimate | null | undefined> {
    const wait = this.reserveFetchSlot();
    if (wait > 0) await sleep(wait);

    const url = buildFatsecretSearchUrl(name);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    const onOuterAbort = (): void => ac.abort();
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const res = await this.fetcher(url, ac.signal);
      if (res.status !== 200) {
        this.opts.logger?.warn({ name, status: res.status }, '[food-web-estimate] 조회 실패');
        // 저장하지 않되 재시도 간격을 둔다(차단·장애 중에 같은 이름으로 다시 두드리지 않게).
        this.failures.record(normalizeTerm(name), false);
        return undefined;
      }
      let samples = parseFatsecretSearch(htmlToText(res.text), name);
      let usedUrl = url;
      if (samples.length === 0) {
        // 조리법 접미를 뗀 어간으로 한 번 더 — "항정살구이" 는 없어도 "항정살" 은 있다.
        const stem = webQueryStem(name);
        if (stem) {
          const stemWait = this.reserveFetchSlot();
          if (stemWait > 0) await sleep(stemWait);
          const stemUrl = buildFatsecretSearchUrl(stem);
          const res2 = await this.fetcher(stemUrl, ac.signal);
          if (res2.status === 200) {
            samples = parseFatsecretSearch(htmlToText(res2.text), stem);
            usedUrl = stemUrl;
          }
        }
      }
      const est = aggregateWebSamples(samples);
      const norm = normalizeTerm(name);
      const data = {
        name,
        kcalPer100g: est?.kcalPer100g ?? null,
        agreeing: est?.agreeing ?? 0,
        basis: est?.basis ?? null,
        samplesJson: JSON.stringify(est?.samples ?? samples),
        source: FOOD_WEB_ESTIMATE_SOURCE,
        sourceUrl: usedUrl,
        version: FOOD_WEB_ESTIMATE_VERSION,
        fetchedAt: new Date(),
      };
      await this.prisma.foodWebEstimate.upsert({ where: { nameNorm: norm }, create: { nameNorm: norm, ...data }, update: data });
      this.failures.clear(norm);
      return est;
    } catch (e) {
      this.opts.logger?.warn({ err: e instanceof Error ? e.message : String(e), name }, '[food-web-estimate] 오류');
      if (!outerSignal?.aborted) this.failures.record(normalizeTerm(name), false);
      return undefined;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    }
  }
}
