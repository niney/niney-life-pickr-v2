import type { PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import type { AiConfigService } from '../ai/ai.config.service.js';
import {
  ASPECTS,
  Bm25,
  RRF_K,
  cosine,
  isJunk,
  type Aspect,
  type Polarity,
} from './retrieval.js';

// ─────────────────────────────────────────────────────────────────────────────
// review-search — DB 영속 문맥검색/RAG. vector-lab 프로토타입에서 검증된
// (BM25⊕dense 하이브리드 → listwise LLM 리랭크 → HyDE → RAG ask) 파이프라인을
// 인메모리 캐시 대신 ReviewSummary(embeddingJson/aspectsJson/contextLine)에서
// 로드해 돌린다. 임베딩=로컬 Ollama(bge-m3), 생성/리랭크=ollama-cloud chat.
// ─────────────────────────────────────────────────────────────────────────────

const EMBED_BASE_URL = process.env.OLLAMA_EMBED_BASE_URL?.trim() || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL?.trim() || 'bge-m3';
const EMBED_BATCH = 64;
const MAX_CHARS = 2000;
const ENRICH_VERSION = 1; // enrich 프롬프트/모델 변경 시 ↑ → 재enrich 트리거
const ENRICH_BATCH = 12; // enrich LLM 한 호출당 리뷰 수
const ENRICH_CONCURRENCY = 6;
const RERANK_POOL = 30;
const ASK_EVIDENCE = 6;

export type SearchMode = 'dense' | 'hybrid' | 'rerank';

export interface SearchHit {
  reviewId: string;
  body: string;
  rating: number | null;
  score: number;
  keyword: boolean;
}
export interface AskResult {
  answer: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  hyde: string | null;
  citations: SearchHit[];
  // 검증 가드레일 결과. applied=검증 패스 실행됨, dropped=근거 부족으로 제거된 주장.
  verification: { applied: boolean; dropped: string[] } | null;
}
export interface EnrichResult {
  enriched: number; // 이번에 새로 enrich 한 건수
  total: number; // 식당의 enrich 완료(=검색가능) 건수
  ms: number;
}

interface CorpusItem {
  reviewId: string;
  body: string;
  rating: number | null;
  vec: number[];
}

export class ReviewSearchService {
  // restaurantId → 검색 코퍼스(DB enrich 결과 로드, BM25 포함). enrich 시 무효화.
  // LRU 바운드 — 식당당 코퍼스가 ~수MB(임베딩)라 무한 증가 방지(단일 인스턴스 메모리 보호).
  private corpusCache = new LRUCache<string, { items: CorpusItem[]; bm25: Bm25 }>({ max: 16 });

  constructor(
    private readonly prisma: PrismaClient,
    private readonly aiConfig: AiConfigService,
  ) {}

  // 리뷰가 있는 식당 — 리뷰 많은 순. 드롭다운용.
  async listRestaurants(): Promise<Array<{ id: string; name: string; reviewCount: number }>> {
    const rows = await this.prisma.restaurant.findMany({
      where: { visitorReviews: { some: {} } },
      select: { id: true, name: true, _count: { select: { visitorReviews: true } } },
      orderBy: { visitorReviews: { _count: 'desc' } },
      take: 100,
    });
    return rows.map((r) => ({ id: r.id, name: r.name, reviewCount: r._count.visitorReviews }));
  }

  // ── enrich (관점+문맥+임베딩 생성·영속) ────────────────────────────────────

  // 식당 리뷰 중 enrich 안 된 것을 채운다(on-demand). ReviewSummary 행 기준 —
  // 요약된 리뷰만 검색 코퍼스에 든다(미요약/junk 제외).
  async ensureEnriched(restaurantId: string): Promise<EnrichResult> {
    const start = Date.now();
    const pending = await this.prisma.reviewSummary.findMany({
      where: {
        review: { restaurantId },
        OR: [{ embeddingJson: null }, { enrichVersion: null }, { enrichVersion: { lt: ENRICH_VERSION } }],
      },
      select: { id: true, review: { select: { body: true } } },
    });
    const targets = pending
      .map((p) => ({ id: p.id, body: p.review.body.trim() }))
      .filter((p) => !isJunk(p.body));

    const batches: Array<typeof targets> = [];
    for (let i = 0; i < targets.length; i += ENRICH_BATCH) batches.push(targets.slice(i, i + ENRICH_BATCH));

    let enriched = 0;
    const runBatch = async (batch: typeof targets): Promise<void> => {
      // 1) 관점+문맥 LLM 1콜.
      const meta = await this.extractMeta(batch.map((b) => b.body));
      // 2) (문맥+본문) 임베딩.
      const texts = batch.map((b, j) => `${meta[j]?.context ?? ''} ${b.body}`.trim());
      const vecs = await this.embed(texts);
      // 3) persist.
      await Promise.all(
        batch.map((b, j) =>
          this.prisma.reviewSummary.update({
            where: { id: b.id },
            data: {
              embeddingJson: JSON.stringify(vecs[j] ?? []),
              aspectsJson: JSON.stringify(meta[j]?.aspects ?? {}),
              contextLine: meta[j]?.context ?? null,
              enrichVersion: ENRICH_VERSION,
            },
          }),
        ),
      );
      enriched += batch.length;
    };
    for (let i = 0; i < batches.length; i += ENRICH_CONCURRENCY) {
      await Promise.all(batches.slice(i, i + ENRICH_CONCURRENCY).map((b) => runBatch(b)));
    }

    this.corpusCache.delete(restaurantId); // 무효화
    const total = await this.prisma.reviewSummary.count({
      where: { review: { restaurantId }, embeddingJson: { not: null } },
    });
    return { enriched, total, ms: Date.now() - start };
  }

  // 배치 리뷰 → 각 {aspects, context} 추출(LLM 1콜).
  private async extractMeta(
    bodies: string[],
  ): Promise<Array<{ aspects: Partial<Record<Aspect, Polarity>>; context: string }>> {
    const list = bodies.map((b, i) => `${i + 1}. ${b.slice(0, 200)}`).join('\n');
    const prompt =
      `다음 ${bodies.length}개 식당 리뷰 각각에 대해 두 가지를 뽑아라.\n` +
      `1) aspects: 평가/언급된 관점만 극성과 함께. 관점(이것만): ${ASPECTS.join(', ')} / 극성: pos|neg|neu (없으면 {}).\n` +
      `2) context: 이 리뷰가 무엇에 대한 평인지 한국어 한 줄(검색용 문맥).\n` +
      `리뷰 순서대로 JSON 배열 [{"aspects":{"맛":"pos"},"context":"..."}, ...].\n\n${list}`;
    const arr = await this.chatJson<Array<{ aspects?: Record<string, string>; context?: string }>>(prompt);
    return bodies.map((_, j) => {
      const a = arr?.[j]?.aspects ?? {};
      const clean: Partial<Record<Aspect, Polarity>> = {};
      for (const asp of ASPECTS) {
        const v = a[asp];
        if (v === 'pos' || v === 'neg' || v === 'neu') clean[asp] = v;
      }
      return { aspects: clean, context: (arr?.[j]?.context ?? '').trim() };
    });
  }

  // ── 검색 ──────────────────────────────────────────────────────────────────

  async search(
    restaurantId: string,
    query: string,
    topK: number,
    mode: SearchMode = 'hybrid',
    denseQuery?: string,
  ): Promise<SearchHit[]> {
    const { items, bm25 } = await this.loadCorpus(restaurantId);
    const [qvec] = await this.embed([denseQuery ?? query]);
    if (!qvec) throw new Error('질의 임베딩 실패');

    const scoreMap = bm25.score(query);
    const scored = items.map((c) => ({
      hit: {
        reviewId: c.reviewId,
        body: c.body,
        rating: c.rating,
        score: cosine(qvec, c.vec),
        keyword: scoreMap.has(c.reviewId),
      } satisfies SearchHit,
    }));

    if (mode === 'dense') {
      return scored.sort((a, b) => b.hit.score - a.hit.score).slice(0, topK).map((s) => s.hit);
    }

    const denseRank = new Map<string, number>();
    [...scored].sort((a, b) => b.hit.score - a.hit.score).forEach((s, i) => denseRank.set(s.hit.reviewId, i));
    const lexRank = new Map<string, number>();
    [...scoreMap.entries()].sort((a, b) => b[1] - a[1]).forEach(([id], i) => lexRank.set(id, i));
    const hybridRanked = scored
      .map((s) => {
        const dr = denseRank.get(s.hit.reviewId) ?? 9999;
        const lr = lexRank.get(s.hit.reviewId);
        return { hit: s.hit, rrf: 1 / (RRF_K + dr) + (lr !== undefined ? 1 / (RRF_K + lr) : 0) };
      })
      .sort((a, b) => b.rrf - a.rrf)
      .map((s) => s.hit);

    if (mode === 'hybrid') return hybridRanked.slice(0, topK);
    return this.llmRerank(query, hybridRanked.slice(0, RERANK_POOL), topK); // mode==='rerank'
  }

  // ── RAG ─────────────────────────────────────────────────────────────────

  async ask(restaurantId: string, query: string, opts?: { verify?: boolean }): Promise<AskResult> {
    await this.loadCorpus(restaurantId); // enrich 필요 시 에러
    const hyde = await this.hyde(query);
    const evidence = await this.search(restaurantId, query, ASK_EVIDENCE, 'rerank', hyde ?? undefined);
    if (evidence.length === 0) {
      return { answer: '관련 리뷰를 찾지 못했습니다.', confidence: 'none', hyde, citations: [], verification: null };
    }
    const ctx = evidence.map((h, i) => `[${i + 1}] ${h.body.slice(0, 300)}`).join('\n');
    const prompt =
      `아래 리뷰들만 근거로 질문에 한국어로 간결히 답하라. 규칙:\n` +
      `- 리뷰에 없는 내용은 절대 지어내지 말 것. 근거 부족하면 confidence 를 "none"/"low".\n` +
      `- 리뷰에 없는 구체적 한정어(요일·시간대·수치 등, 예: "평일", "20분")를 덧붙이지 말 것. ` +
      `리뷰가 말하지 않은 개별 사실을 리뷰의 말처럼 단정하지 말 것.\n` +
      `- 단, 여러 리뷰의 전반적 경향을 요약·결론짓는 것은 허용(예: "대체로 양이 충분하다는 평이 많다"). ` +
      `근거가 서로 다르면 양쪽을 반영하고, 특정 근거가 반증하는 주장은 하지 말 것.\n` +
      `- 리뷰 문구를 따옴표("")로 인용하지 말고 직접 요약해 전달할 것 (없는 인용문 날조 금지).\n` +
      `- 각 주장 뒤에 근거 리뷰 번호를 [n] 으로 표기(그 번호 리뷰가 실제로 그 내용을 담아야 함).\n\n` +
      `질문: ${query}\n\n리뷰:\n${ctx}\n\n` +
      `JSON {"answer": "...[n]...", "confidence": "high"|"medium"|"low"|"none"}`;
    const parsed = await this.chatJson<{ answer?: string; confidence?: string }>(prompt, {
      type: 'object',
      properties: { answer: { type: 'string' }, confidence: { enum: ['high', 'medium', 'low', 'none'] } },
      required: ['answer', 'confidence'],
    });
    const c = parsed?.confidence;
    let answer = parsed?.answer?.trim() || '답변 생성 실패 — 근거 리뷰를 참고하세요.';
    let confidence: AskResult['confidence'] =
      c === 'high' || c === 'medium' || c === 'low' || c === 'none' ? c : 'low';

    // 검증 가드레일 — 생성한 답을 claim 단위로 근거 대조. 미지원 주장 제거 + confidence 강등.
    let verification: AskResult['verification'] = null;
    if (opts?.verify !== false) {
      const v = await this.verifyAnswer(query, answer, evidence);
      if (v) {
        verification = { applied: true, dropped: v.dropped };
        if (v.dropped.length > 0) {
          answer = v.answer || '근거 리뷰에서 확인된 내용이 없습니다.';
          confidence = v.answer ? downgradeConfidence(confidence) : 'none';
        }
      }
    }

    return { answer, confidence, hyde, citations: evidence, verification };
  }

  // 검증 패스 — 답변을 사실 단위로 쪼개 각 주장이 근거 리뷰에 실제로 있는지 엄격 대조.
  // 미지원 주장 목록 + 지원되는 내용만 남긴 revisedAnswer 반환. 검증 불가(LLM 실패) 시 null.
  // public — ask() 내부 가드레일 + 평가 하니스(같은 생성에 on/off 격리)에서 사용.
  async verifyAnswer(
    query: string,
    answer: string,
    evidence: SearchHit[],
  ): Promise<{ answer: string; dropped: string[] } | null> {
    const ctx = evidence.map((h, i) => `[${i + 1}] ${h.body.slice(0, 300)}`).join('\n');
    const prompt =
      `질문, 답변, 근거 리뷰가 주어진다. 답변을 사실 단위(claim)로 나누고, 각 claim 을 근거 리뷰와 ` +
      `축자적으로 대조해 검증하라. 규칙(엄격):\n` +
      `- 각 claim 에 대해 뒷받침하는 근거 리뷰 번호(n)와 그 리뷰 속 실제 문구(span)를 찾아라.\n` +
      `- 그 문구가 claim 내용을 직접 담고 있어야 supported=true. 리뷰에 없는 내용을 리뷰가 "말했다/언급했다"고 ` +
      `돌리거나, 추론·과장·일반상식이면 supported=false.\n` +
      `- claim 이 어떤 근거 리뷰와 상충(반증)하면 supported=false.\n` +
      `- 직접적·축자적 근거가 없으면 보수적으로 false. span 을 지어내지 말 것(없으면 "" + false).\n` +
      `- revisedAnswer: 원문 답변에서 supported=false 인 부분만 삭제하고 나머지는 원문 표현 그대로 유지하라` +
      `(인용[n] 유지). 원문에 없는 새 표현·사실·한정어를 절대 추가하지 말 것 — 삭제 위주, 최소한으로만 매끄럽게 ` +
      `다듬기. 남길 게 없으면 빈 문자열.\n\n` +
      `질문: ${query}\n답변: ${answer}\n\n근거 리뷰:\n${ctx}\n\n` +
      `JSON {"claims":[{"text":"...","supported":true|false,"span":"근거 문구 또는 빈 문자열"}], "revisedAnswer":"..."}`;
    const parsed = await this.chatJson<{
      claims?: Array<{ text?: string; supported?: boolean; span?: string }>;
      revisedAnswer?: string;
    }>(prompt, {
      type: 'object',
      properties: {
        claims: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              supported: { type: 'boolean' },
              span: { type: 'string' },
            },
            required: ['text', 'supported', 'span'],
          },
        },
        revisedAnswer: { type: 'string' },
      },
      required: ['claims', 'revisedAnswer'],
    });
    if (!parsed?.claims) return null;
    const dropped = parsed.claims
      .filter((cl) => cl.supported === false)
      .map((cl) => (cl.text ?? '').trim())
      .filter(Boolean);
    return { answer: (parsed.revisedAnswer ?? '').trim(), dropped };
  }

  // ── 공개 QA (placeId 기반) ──────────────────────────────────────────────────

  // 공개 상세는 placeId 로 식별. enrich 된 리뷰 수만 센다(LLM 호출 없음).
  // 식당 없음 → null(라우트에서 404). enrich 0건 → ready:false (질문 무의미).
  async qaReady(placeId: string): Promise<{ ready: boolean; count: number } | null> {
    const r = await this.prisma.restaurant.findUnique({ where: { placeId }, select: { id: true } });
    if (!r) return null;
    const count = await this.prisma.reviewSummary.count({
      where: { review: { restaurantId: r.id }, embeddingJson: { not: null } },
    });
    return { ready: count > 0, count };
  }

  // 공개 질문 — placeId → 식당 해석 후 ask. 자동 enrich 안 함(비용). 식당 없음 → null.
  // enrich 안 된 식당은 graceful 'none' 으로 안내(에러 대신).
  async askByPlaceId(placeId: string, query: string, opts?: { verify?: boolean }): Promise<AskResult | null> {
    const r = await this.prisma.restaurant.findUnique({ where: { placeId }, select: { id: true } });
    if (!r) return null;
    const ready = await this.prisma.reviewSummary.count({
      where: { review: { restaurantId: r.id }, embeddingJson: { not: null } },
    });
    if (ready === 0) {
      return {
        answer: '아직 이 식당의 리뷰 분석이 준비되지 않았어요.',
        confidence: 'none',
        hyde: null,
        citations: [],
        verification: null,
      };
    }
    return this.ask(r.id, query, opts);
  }

  // ── 내부: 코퍼스 로드 / LLM ────────────────────────────────────────────────

  // DB enrich 결과를 로드해 코퍼스+BM25 구축(캐시). junk 제외 + 본문 dedup.
  private async loadCorpus(restaurantId: string): Promise<{ items: CorpusItem[]; bm25: Bm25 }> {
    const cached = this.corpusCache.get(restaurantId);
    if (cached) return cached;

    const rows = await this.prisma.reviewSummary.findMany({
      where: { review: { restaurantId }, embeddingJson: { not: null } },
      select: {
        reviewId: true,
        embeddingJson: true,
        review: { select: { body: true, rating: true } },
      },
    });
    const seen = new Set<string>();
    const items: CorpusItem[] = [];
    for (const r of rows) {
      const body = r.review.body.trim();
      if (isJunk(body) || seen.has(body)) continue;
      seen.add(body);
      items.push({
        reviewId: r.reviewId,
        body,
        rating: r.review.rating,
        vec: safeParse<number[]>(r.embeddingJson, []),
      });
    }
    if (items.length === 0) throw new Error('먼저 리뷰 enrich 를 실행하세요 (ensureEnriched)');
    const entry = { items, bm25: new Bm25(items.map((c) => ({ id: c.reviewId, text: c.body }))) };
    this.corpusCache.set(restaurantId, entry);
    return entry;
  }

  // 임베딩 엔드포인트(로컬/사이드카 Ollama) 도달성·차원 확인. 배포 preflight·부팅 헬스체크용.
  async embedHealth(): Promise<{ ok: boolean; baseUrl: string; model: string; dim?: number; error?: string }> {
    try {
      const [v] = await this.embed(['헬스체크']);
      if (!v?.length) return { ok: false, baseUrl: EMBED_BASE_URL, model: EMBED_MODEL, error: '빈 벡터 응답' };
      return { ok: true, baseUrl: EMBED_BASE_URL, model: EMBED_MODEL, dim: v.length };
    } catch (e) {
      return { ok: false, baseUrl: EMBED_BASE_URL, model: EMBED_MODEL, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH).map((t) => t.slice(0, MAX_CHARS) || ' ');
      let res: Response;
      try {
        res = await fetch(`${EMBED_BASE_URL}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
        });
      } catch (e) {
        // 운영에서 가장 흔한 케이스 — 임베딩 엔드포인트(Ollama) 미실행/미도달.
        throw new Error(
          `임베딩 엔드포인트(${EMBED_BASE_URL})에 연결 실패 — Ollama 가 떠 있고 모델(${EMBED_MODEL})이 ` +
            `pull 되어 있으며 OLLAMA_EMBED_BASE_URL 이 그곳을 가리키는지 확인하세요.`,
          { cause: e },
        );
      }
      if (!res.ok) {
        throw new Error(
          `임베딩 실패 HTTP ${res.status} (${EMBED_BASE_URL}, model=${EMBED_MODEL}): ${(await res.text().catch(() => '')).slice(0, 200)}`,
        );
      }
      const json = (await res.json().catch(() => null)) as { embeddings?: number[][] } | null;
      if (!json?.embeddings || json.embeddings.length !== batch.length) {
        throw new Error('임베딩 응답 비정상');
      }
      out.push(...json.embeddings);
    }
    return out;
  }

  // ollama-cloud chat 호출 — JSON 본문만 견고 파싱(코드펜스 제거). 실패 시 null.
  private async chatJson<T>(prompt: string, schema?: Record<string, unknown>): Promise<T | null> {
    const resolved = await this.aiConfig.getResolved('ollama-cloud', 'chat');
    if (!resolved?.defaultModel) return null;
    try {
      const res = await fetch(`${resolved.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${resolved.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolved.defaultModel,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
          ...(schema ? { format: schema } : {}),
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
      const content = (json?.message?.content ?? '').replace(/```(?:json)?/gi, '').trim();
      const m = content.match(/[[{][\s\S]*[\]}]/);
      return JSON.parse(m ? m[0] : content) as T;
    } catch {
      return null;
    }
  }

  // listwise LLM 리랭크 — 후보들을 함께 보고 관련도 순 번호 반환. 실패 시 입력 순.
  private async llmRerank(query: string, hits: SearchHit[], topN: number): Promise<SearchHit[]> {
    if (hits.length === 0) return [];
    const list = hits.map((h, i) => `${i + 1}. ${h.body.slice(0, 160)}`).join('\n');
    const prompt =
      `질의: "${query}"\n\n아래 리뷰 중 질의 "의도"에 실제로 부합하는 것을 관련도 높은 순으로 ` +
      `최대 ${topN}개 번호만 골라라. 글자/주제가 아니라 의미로 판단(부정 질의면 칭찬 제외). 없으면 빈 배열.\n\n리뷰:\n${list}`;
    const parsed = await this.chatJson<{ ranking?: number[] } | number[]>(prompt, {
      type: 'object',
      properties: { ranking: { type: 'array', items: { type: 'number' } } },
      required: ['ranking'],
    });
    const ranking = Array.isArray(parsed) ? parsed : (parsed?.ranking ?? []);
    const picked: SearchHit[] = [];
    const used = new Set<number>();
    for (const n of ranking) {
      const idx = n - 1;
      const h = hits[idx];
      if (h && !used.has(idx)) {
        used.add(idx);
        picked.push(h);
      }
      if (picked.length >= topN) break;
    }
    if (picked.length === 0) return hits.slice(0, topN);
    for (let i = 0; i < hits.length && picked.length < topN; i += 1) {
      if (!used.has(i)) picked.push(hits[i]!);
    }
    return picked.slice(0, topN);
  }

  private async hyde(query: string): Promise<string | null> {
    const r = await this.chatJson<{ review?: string }>(
      `식당 리뷰 검색을 돕기 위해, 다음 질문이 찾고자 하는 내용을 담은 가상의 한국어 리뷰를 ` +
        `한두 문장으로 지어내라(검색용). 질문: "${query}"\nJSON {"review": "..."}`,
      { type: 'object', properties: { review: { type: 'string' } }, required: ['review'] },
    );
    return r?.review?.trim() || null;
  }
}

// 검증에서 미지원 주장이 제거됐을 때 confidence 한 단계 강등.
const downgradeConfidence = (c: AskResult['confidence']): AskResult['confidence'] =>
  c === 'high' ? 'medium' : c === 'medium' ? 'low' : c === 'low' ? 'low' : 'none';

const safeParse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
