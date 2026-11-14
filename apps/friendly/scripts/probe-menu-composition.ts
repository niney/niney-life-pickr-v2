// 메뉴 구성 읽기 프로브 — 식당 메뉴의 이름 + 설명에서 구성(코스·세트의 음식 나열)과 택1 묶음을 LLM 이 얼마나 잘 읽는지.
//
// 식당 스냅샷의 메뉴 가운데 실제로 물어볼 대상(이름으로는 표준 음식에 못 잇고, 설명·이름에 구성·고르기 표식이 있는 것)을
// 뽑아 모델에 묻고, 답과 채택 결과(decideComposition)를 나란히 찍는다. 정답 라벨이 없으니 눈으로 본다 — 틀린 것을
// 고르기 쉽게 한 줄씩. 캐시(menu_llm_compositions)에는 쓰지 않는다.
//
// 실행:
//   pnpm --filter friendly probe:menu-composition -- [--limit=60] [--place=도원반점] [--model=gemma4:31b] [--all]
//   --limit : 물어볼 메뉴 수(기본 60). 목록 전체에 고르게 퍼뜨려 뽑는다.
//   --place : 식당 이름에 이 말이 든 곳만.
//   --all   : 표식 없는 메뉴도 대상에 넣는다(홍보 문구를 구성으로 오해하는지 볼 때).
//   --shift : 0~0.99. 같은 간격으로 뽑되 그만큼 밀린 다른 표본(기본 0).

import { PrismaClient } from '@prisma/client';
import { thinkOptionForModel } from '@repo/utils';
import { adapterCache } from '../src/modules/ai/adapter-cache.js';
import { AiConfigService } from '../src/modules/ai/ai.config.service.js';
import { buildLlmProviderEnv } from '../src/modules/ai/llm-provider-env.js';
import {
  compositionKey,
  decideComposition,
  isCompositionCandidate,
  parseCompositionOutput,
} from '../src/modules/food/menu-composition.js';
import {
  MENU_COMPOSITION_JSON_SCHEMA,
  MENU_COMPOSITION_SYSTEM_PROMPT,
  buildCompositionUserPrompt,
} from '../src/modules/food/menu-composition.service.js';
import { MenuNutritionResolver } from '../src/modules/food/menu-nutrition.js';
import { standardFoodId } from '../src/modules/meal/meal-place-menu.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const LIMIT = Number(opt('limit') ?? '60') || 60;
const PLACE = opt('place');
const MODEL = opt('model') ?? process.env['OLLAMA_MENU_MATCH_MODEL'] ?? 'gemma4:31b';
const ALL = args.includes('--all');
const SHIFT = Math.min(0.99, Math.max(0, Number(opt('shift') ?? '0') || 0));
const CONCURRENCY = 4;

const prisma = new PrismaClient();
const resolver = new MenuNutritionResolver(prisma);

interface Line {
  place: string;
  name: string;
  description: string;
}

const main = async (): Promise<void> => {
  const rows = await prisma.restaurant.findMany({
    where: { placeId: { not: null } },
    select: { name: true, snapshotJson: true },
    orderBy: { placeId: 'asc' },
  });
  const seen = new Set<string>();
  const lines: Line[] = [];
  let menus = 0;
  let withDesc = 0;
  for (const row of rows) {
    if (PLACE && !row.name.includes(PLACE)) continue;
    const list = (JSON.parse(row.snapshotJson).menus ?? []) as { name?: string; description?: string | null }[];
    for (const m of list) {
      const name = (m.name ?? '').trim();
      if (!name) continue;
      menus += 1;
      const description = (m.description ?? '').replace(/\s+/g, ' ').trim();
      if (description) withDesc += 1;
      if (!ALL && !isCompositionCandidate(name, description)) continue;
      const key = compositionKey(name, description);
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({ place: row.name, name, description });
    }
  }
  // 이름으로 표준 음식에 이어지는 메뉴는 묻지 않는다(식단의 식당 메뉴 조회와 같은 기준).
  const resolved = await resolver.resolveMany(lines.map((l) => l.name));
  const targets = lines.filter((l) => standardFoodId(l.name, resolved.get(l.name)) === null);
  console.log(
    `메뉴 ${menus}개(설명 ${withDesc}개) → 표식 있는 글 ${lines.length}개 → 이름으로 못 잇는 대상 ${targets.length}개`,
  );
  // --shift=0.5 처럼 주면 같은 간격으로 뽑되 반 칸 밀린 다른 표본이 된다(프롬프트를 한 표본에만 맞추지 않으려고).
  const picked =
    LIMIT >= targets.length
      ? targets
      : Array.from({ length: LIMIT }, (_, i) => targets[Math.floor(((i + SHIFT) * targets.length) / LIMIT)]!);

  const aiConfig = new AiConfigService(prisma, buildLlmProviderEnv());
  const config = await aiConfig.getResolved('ollama-cloud', 'chat');
  if (!config) {
    console.error('chat 용도의 provider(키)가 설정되지 않았습니다.');
    process.exitCode = 1;
    return;
  }
  const provider = adapterCache.get(config);
  console.log(`모델 ${MODEL}, ${picked.length}개를 묻는다.\n`);

  const stat = { asked: 0, parseFail: 0, adopted: 0, withChoice: 0, high: 0, medium: 0, low: 0, ms: 0 };
  const out: string[] = new Array<string>(picked.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < picked.length) {
      const i = next++;
      const line = picked[i]!;
      const t0 = Date.now();
      let text = '';
      try {
        const res = await provider.complete({
          prompt: buildCompositionUserPrompt(line.name, line.description),
          systemPrompt: MENU_COMPOSITION_SYSTEM_PROMPT,
          model: MODEL,
          temperature: 0,
          maxTokens: 400,
          numCtx: 4096,
          format: MENU_COMPOSITION_JSON_SCHEMA as unknown as Record<string, unknown>,
          think: thinkOptionForModel(MODEL),
        });
        text = res.text;
      } catch (e) {
        out[i] = `[${i + 1}] ${line.place} / ${line.name}\n    호출 실패: ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }
      stat.asked += 1;
      stat.ms += Date.now() - t0;
      const parsed = parseCompositionOutput(text);
      if (!parsed) {
        stat.parseFail += 1;
        out[i] = `[${i + 1}] ${line.place} / ${line.name}\n    파싱 실패: ${text.slice(0, 160)}`;
        continue;
      }
      stat[parsed.confidence] += 1;
      const adopted = decideComposition(parsed, line);
      if (adopted) stat.adopted += 1;
      if (adopted && adopted.choices.length > 0) stat.withChoice += 1;
      const show = (c: { fixed: string[]; choices: { label: string | null; options: string[] }[] }): string =>
        [
          c.fixed.join(', ') || '—',
          ...c.choices.map((g) => `택1${g.label ? `(${g.label})` : ''}[${g.options.join(' | ')}]`),
        ].join('  +  ');
      out[i] =
        `[${i + 1}] ${line.place} / ${line.name}\n    설명: ${line.description.slice(0, 170) || '(없음)'}\n` +
        `    답(${parsed.confidence}${parsed.reason ? `, ${parsed.reason}` : ''}): ${show(parsed)}\n` +
        `    채택: ${adopted ? show(adopted) : '없음'}`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, picked.length) }, worker));
  console.log(out.join('\n'));
  console.log(
    `\n합계 ${JSON.stringify({ ...stat, avgMs: stat.asked ? Math.round(stat.ms / stat.asked) : 0 })}`,
  );
};

await main().finally(() => prisma.$disconnect());
