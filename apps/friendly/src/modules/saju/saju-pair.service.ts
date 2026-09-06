import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import type { CreateSajuPairInputType, SajuPairResultType } from '@repo/api-contract';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import type { UsageQuotaActor, UsageQuotaService } from '../usage-quota/usage-quota.service.js';
import { calculateSajuPair } from './saju-pair.engine.js';
import {
  basicSajuPairReport,
  requestSajuPairLlm,
  SAJU_PAIR_PROMPT_VERSION,
} from './saju-pair.prompts.js';

export class SajuPairService {
  private readonly results = new LRUCache<string, SajuPairResultType>({
    max: 200,
    ttl: 24 * 60 * 60_000,
  });
  private readonly pending = new Map<string, Promise<SajuPairResultType>>();
  constructor(
    private readonly ai: AiConfigService,
    private readonly deps: { quota: UsageQuotaService; cache?: AdapterCache; timeoutMs?: number },
  ) {}
  async create(
    input: CreateSajuPairInputType,
    actor: UsageQuotaActor,
  ): Promise<SajuPairResultType> {
    const chart = calculateSajuPair(input);
    const config = await this.ai.getResolved('ollama-cloud', 'saju');
    const model = config?.defaultModel.trim() ?? '';
    const owner = actor.userId ? `user:${actor.userId}` : `guest:${actor.guestKey ?? actor.ip}`;
    const key = createHash('sha256')
      .update(
        JSON.stringify({
          owner,
          input,
          model,
          version: SAJU_PAIR_PROMPT_VERSION,
          calc: [
            chart.calculationVersion,
            chart.first.calculationVersion,
            chart.second.calculationVersion,
          ],
        }),
      )
      .digest('hex');
    const cached = this.results.get(key);
    if (cached)
      return {
        ...cached,
        remainingToday: actor.userId
          ? null
          : await this.deps.quota.remainingForGuest('saju-reading', actor),
      };
    const running = this.pending.get(key);
    if (running) return running;
    const task = (async () => {
      const result: SajuPairResultType = {
        chart,
        report: basicSajuPairReport(chart),
        source: 'basic',
        model: null,
        promptVersion: SAJU_PAIR_PROMPT_VERSION,
        fallbackReason: 'not_configured',
        remainingToday: null,
        createdAt: new Date().toISOString(),
      };
      if (config && model) {
        const quota = await this.deps.quota.consume('saju-reading', actor);
        result.remainingToday = quota.remainingToday;
        result.fallbackReason = quota.allowed ? 'unavailable' : 'quota';
        if (quota.allowed) {
          try {
            const llm = await requestSajuPairLlm(
              (this.deps.cache ?? adapterCache).get(config),
              model,
              chart,
              input.relationship,
              input.note,
              AbortSignal.timeout(this.deps.timeoutMs ?? 60_000),
            );
            if (llm)
              Object.assign(result, {
                report: llm.report,
                source: 'ai',
                model: llm.model,
                fallbackReason: null,
              });
          } catch {
            /* 개인 입력과 공급자 원문은 로그로 남기지 않는다. */
          }
        }
      }
      if (result.source === 'ai') this.results.set(key, result);
      return result;
    })();
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
}
