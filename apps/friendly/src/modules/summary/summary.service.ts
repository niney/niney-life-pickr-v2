import type { PrismaClient } from '@prisma/client';
import type { LLMProvider } from '../ai/adapters/llm-provider.js';
import type { AiConfigService } from '../ai/ai.config.service.js';
import { adapterCache, type AdapterCache } from '../ai/adapter-cache.js';
import { classifyError } from '../ai/ai.service.js';

const SYSTEM_PROMPT =
  '다음은 한 식당에 대한 방문자 리뷰입니다. 1-2문장으로 핵심(분위기/맛/서비스/장단점)을 요약해 주세요. 추측하지 말고 본문에 있는 내용만 사용하세요.';

const TEMPERATURE = 0.3;
const MAX_TOKENS = 200;
// Mirrors the public batch endpoint's cap. Real concurrency is governed by
// the adapter's FIFO gate; chunking here is just a defensive boundary so a
// single fan-out doesn't allocate thousands of pending Promises at once.
const DEFAULT_CHUNK_SIZE = 10;

export interface SummaryServiceOptions {
  cache?: AdapterCache;
  chunkSize?: number;
  // Test seam — bypass AiConfigService and return a fixed (provider, model).
  // Keeps the unit test independent of DB rows / env setup.
  resolveOverride?: () => Promise<{ provider: LLMProvider; model: string } | null>;
}

// Background AI summarization. The crawl pipeline calls
// queueSummariesForReviews(...) right after persisting a "더보기" batch — we
// want the LLM round-trip to overlap with the next page's fetch, so this is
// fire-and-forget by design. Failures are recorded on the ReviewSummary row
// (status='failed' + errorMessage) so the UI can surface them; we never throw.
export class SummaryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
    private readonly opts: SummaryServiceOptions = {},
  ) {}

  queueSummariesForReviews(reviewIds: string[]): void {
    if (reviewIds.length === 0) return;
    void this.run(reviewIds).catch(() => undefined);
  }

  // Exposed for tests so they can await completion deterministically. The
  // crawl path never awaits — it relies on queueSummariesForReviews.
  async runForTests(reviewIds: string[]): Promise<void> {
    await this.run(reviewIds);
  }

  private async run(reviewIds: string[]): Promise<void> {
    if (reviewIds.length === 0) return;
    const startedAt = new Date();

    // Mark every accepted review as pending up-front. Re-summarizing an
    // existing row is allowed (recrawl path wipes reviews+summaries first
    // via cascade, so this is mainly defensive).
    for (const id of reviewIds) {
      await this.prisma.reviewSummary.upsert({
        where: { reviewId: id },
        create: { reviewId: id, status: 'pending', startedAt },
        update: {
          status: 'pending',
          startedAt,
          finishedAt: null,
          text: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    }

    const resolved = await this.resolveProvider();
    if (!resolved) {
      // No key / no model / disabled — leave rows pending. Admin can fix
      // config and re-trigger via recrawl. We don't fail loud because the
      // primary path (crawling reviews) succeeded; summaries are auxiliary.
      return;
    }
    const { provider, model } = resolved;

    const reviews = await this.prisma.visitorReview.findMany({
      where: { id: { in: reviewIds } },
      select: { id: true, body: true, authorName: true, rating: true },
    });

    const chunkSize = this.opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    for (let i = 0; i < reviews.length; i += chunkSize) {
      const chunk = reviews.slice(i, i + chunkSize);
      await this.prisma.reviewSummary.updateMany({
        where: { reviewId: { in: chunk.map((r) => r.id) } },
        data: { status: 'running' },
      });

      const settled = await Promise.allSettled(
        chunk.map((r) =>
          provider.complete({
            prompt: this.buildPrompt(r),
            model,
            systemPrompt: SYSTEM_PROMPT,
            temperature: TEMPERATURE,
            maxTokens: MAX_TOKENS,
          }),
        ),
      );

      const finishedAt = new Date();
      await Promise.all(
        settled.map(async (s, idx) => {
          const reviewId = chunk[idx]!.id;
          if (s.status === 'fulfilled') {
            await this.prisma.reviewSummary.update({
              where: { reviewId },
              data: {
                status: 'done',
                text: s.value.text.trim(),
                model: s.value.model,
                finishedAt,
                errorCode: null,
                errorMessage: null,
              },
            });
          } else {
            const { error, message } = classifyError(s.reason);
            await this.prisma.reviewSummary.update({
              where: { reviewId },
              data: {
                status: 'failed',
                errorCode: error,
                errorMessage: message,
                finishedAt,
              },
            });
          }
        }),
      );
    }
  }

  private async resolveProvider(): Promise<
    { provider: LLMProvider; model: string } | null
  > {
    if (this.opts.resolveOverride) return this.opts.resolveOverride();

    const resolved = await this.aiConfig.getResolved('ollama-cloud');
    if (!resolved) return null;
    const model = resolved.defaultModel?.trim();
    if (!model) return null;
    const provider = (this.opts.cache ?? adapterCache).get(resolved);
    return { provider, model };
  }

  private buildPrompt(r: {
    body: string;
    authorName: string | null;
    rating: number | null;
  }): string {
    const meta = [
      r.authorName ? `작성자: ${r.authorName}` : null,
      r.rating !== null ? `평점: ${r.rating}` : null,
    ]
      .filter(Boolean)
      .join(' / ');
    return meta ? `${meta}\n\n${r.body}` : r.body;
  }
}
