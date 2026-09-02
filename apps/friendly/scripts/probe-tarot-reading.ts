// 타로 해석 모델 비교 프로브 — 샘플 스프레드를 모델별로 돌려 JSON 준수율·지연·글자수·샘플 문장을 찍는다.
//
// 실행: pnpm --filter friendly probe:tarot-reading [--models=gpt-oss:120b,gemma4:31b] [--samples=5] [--seed=1] [--show=1]
//   - 키·baseUrl 은 어드민 AI 설정(tarot 용도, 없으면 chat 계정 상속)에서 읽는다. 모델만 --models 로 바꿔 돌린다.
//   - 서비스와 같은 requestTarotLlm(프롬프트·수리 재시도 1회)을 쓰므로 실제 경로와 동일하다.
//   - 결과는 .env.example 의 OLLAMA_TAROT_MODEL 주석과 docs/PLAN-tarot.md 진행 기록에 남긴다.

import { PrismaClient } from '@prisma/client';
import {
  buildDrawnCards,
  createSeededRng,
  getTarotCard,
  getTarotSpread,
  shuffleTarotDeck,
  type TarotSpreadId,
  type TarotTopic,
} from '@repo/utils';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { OllamaCloudAdapter } from '../src/modules/ai/adapters/ollama-cloud.adapter.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import type { TarotPromptCard } from '../src/modules/tarot/tarot.prompts.js';
import { requestTarotLlm } from '../src/modules/tarot/tarot.service.js';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const SAMPLES = Number(opt('samples', '5'));
const SEED = Number(opt('seed', '1'));
const SHOW = Number(opt('show', '1'));

interface Sample {
  spreadId: TarotSpreadId;
  topic: TarotTopic;
  question: string;
  choices: { a: string; b: string } | null;
}

const SAMPLE_POOL: Sample[] = [
  { spreadId: 'daily', topic: 'general', question: '', choices: null },
  { spreadId: 'three-ppf', topic: 'love', question: '헤어진 사람에게서 연락이 올까요?', choices: null },
  { spreadId: 'three-sar', topic: 'work', question: '지금 회사를 계속 다니는 게 맞을까요? 이직 제안이 하나 있어요.', choices: null },
  { spreadId: 'choice', topic: 'choice', question: '주말에 뭘 할지 고민이에요.', choices: { a: '집에서 쉬기', b: '친구랑 여행' } },
  { spreadId: 'three-sar', topic: 'money', question: '모아둔 돈으로 뭔가 시작해도 될까요?', choices: null },
  { spreadId: 'three-ppf', topic: 'relationship', question: '동료와 사이가 어색해졌어요. 풀릴까요?', choices: null },
  { spreadId: 'choice', topic: 'choice', question: '', choices: { a: '대학원 진학', b: '바로 취업' } },
  { spreadId: 'daily', topic: 'general', question: '', choices: null },
];

const buildCards = (sample: Sample, seed: number): TarotPromptCard[] => {
  const spread = getTarotSpread(sample.spreadId)!;
  const rng = createSeededRng(seed);
  const order = shuffleTarotDeck(rng);
  const drawn = buildDrawnCards(spread, order.slice(0, spread.positions.length), { rng });
  return drawn.map((d, i) => ({
    drawn: d,
    card: getTarotCard(d.cardId)!,
    positionLabel: spread.positions[i]!.label,
    positionHint: spread.positions[i]!.hint,
  }));
};

const p50 = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const resolved = await aiConfig.getResolved('ollama-cloud', 'tarot');
  if (!resolved) {
    console.error('Ollama Cloud 키가 없습니다 — 어드민 AI 설정 또는 OLLAMA_CLOUD_API_KEY 를 확인하세요.');
    process.exit(1);
  }
  const models = opt('models', resolved.defaultModel || 'gpt-oss:120b').split(',').map((m) => m.trim()).filter(Boolean);
  const samples = Array.from({ length: SAMPLES }, (_, i) => SAMPLE_POOL[i % SAMPLE_POOL.length]!);
  console.log(`모델 ${models.join(', ')} · 샘플 ${samples.length} · seed ${SEED}\n`);

  for (const model of models) {
    const provider = new OllamaCloudAdapter({
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      timeoutMs: 90_000,
      maxConcurrent: 2,
    });
    let ok = 0;
    let repaired = 0;
    const latencies: number[] = [];
    const chars: number[] = [];
    let shown = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!;
      const spread = getTarotSpread(sample.spreadId)!;
      const cards = buildCards(sample, SEED * 100 + i);
      const started = Date.now();
      try {
        const { output, calls, lastText } = await requestTarotLlm(provider, model, {
          spread,
          topic: sample.topic,
          question: sample.question,
          choices: sample.choices,
          cards,
        });
        const ms = Date.now() - started;
        latencies.push(ms);
        if (output) {
          ok++;
          if (calls > 1) repaired++;
          const total = output.cards.reduce((a, c) => a + c.text.length, 0) + output.summary.length + output.advice.length;
          chars.push(total);
          const tag = `${sample.spreadId}/${sample.topic}${calls > 1 ? ' (수리)' : ''} ${ms}ms ${total}자`;
          if (shown < SHOW) {
            shown++;
            console.log(`— ${model} · ${tag}`);
            console.log(`  카드: ${cards.map((c) => `${c.positionLabel}=${c.card.nameKo}${c.drawn.reversed ? '(역)' : ''}`).join(' · ')}`);
            for (const c of output.cards) console.log(`  [${c.position}] ${c.text}`);
            console.log(`  종합: ${output.summary}\n  조언: ${output.advice}\n  키워드: ${output.keyword}`);
            if (output.choice) console.log(`  선택: ${output.choice.recommended} (${output.choice.confidence}) — ${output.choice.reason}`);
            console.log('');
          } else {
            console.log(`  ✓ ${tag}`);
          }
        } else {
          console.log(`  ✗ ${sample.spreadId}/${sample.topic} JSON 실패 (${ms}ms): ${lastText.slice(0, 120).replace(/\s+/g, ' ')}`);
        }
      } catch (e) {
        latencies.push(Date.now() - started);
        console.log(`  ✗ ${sample.spreadId}/${sample.topic} 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(
      `\n[${model}] JSON 채택 ${ok}/${samples.length} (수리 ${repaired}) · p50 ${p50(latencies)}ms · 평균 ${chars.length ? Math.round(chars.reduce((a, b) => a + b, 0) / chars.length) : 0}자\n`,
    );
  }
  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
