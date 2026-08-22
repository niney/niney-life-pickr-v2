// 식단 사진 인식 측정 — MEAL_RECOGNITION_DEBUG=1 로 돌 때 남은 덤프를 집계한다.
// 라벨(정답) 없이도 의미 있는 신호(파싱 실패율, 저신뢰 비율, 음식 수 분포, 카탈로그 매칭률)를
// 뽑고, --labels 디렉터리를 주면 이름 정확도까지 낸다.
//
// 수집:
//   1) MEAL_RECOGNITION_DEBUG=1 pnpm --filter friendly dev
//   2) 앱에서 식단 사진을 몇 장 올린다 → data/meal-recognition-debug/*.json 이 쌓인다.
// 실행:
//   pnpm --filter friendly eval:meal-recognition [-- --dir=data/meal-recognition-debug --labels=data/meal-labels]
// 라벨 파일(선택): <labels>/<photoToken>.json → { "dishes": ["김치찌개", "공깃밥"] }

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DIR = opt('dir') ?? 'data/meal-recognition-debug';
const LABELS = opt('labels');

interface Dump {
  phase: 'success' | 'parse_error' | 'llm_error';
  model: string | null;
  photoTokens: string[];
  rawText?: string;
  error?: string;
  dishes?: {
    name: string;
    confidence: number;
    isMain: boolean;
    isDrink: boolean;
    foodId: string | null;
    matchedName: string | null;
  }[];
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');

const main = async (): Promise<void> => {
  const dir = resolve(DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    console.error(`덤프 폴더가 없습니다: ${dir}\nMEAL_RECOGNITION_DEBUG=1 로 서버를 띄우고 사진을 올려 주세요.`);
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.error(`덤프가 없습니다: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const byModel = new Map<
    string,
    { total: number; success: number; parseError: number; llmError: number; dishes: number; low: number; matched: number; items: number }
  >();

  let labeledPhotos = 0;
  let labelHit = 0;
  let labelTotal = 0;
  let labelExtra = 0;

  for (const file of files) {
    let dump: Dump;
    try {
      dump = JSON.parse(await readFile(join(dir, file), 'utf-8')) as Dump;
    } catch {
      continue;
    }
    const key = dump.model ?? '(unknown)';
    let stat = byModel.get(key);
    if (!stat) {
      stat = { total: 0, success: 0, parseError: 0, llmError: 0, dishes: 0, low: 0, matched: 0, items: 0 };
      byModel.set(key, stat);
    }
    stat.total += 1;
    if (dump.phase === 'parse_error') stat.parseError += 1;
    else if (dump.phase === 'llm_error') stat.llmError += 1;
    else {
      stat.success += 1;
      const dishes = dump.dishes ?? [];
      stat.dishes += dishes.length;
      for (const d of dishes) {
        stat.items += 1;
        if (d.confidence < 0.4) stat.low += 1;
        if (d.foodId) stat.matched += 1;
      }

      if (LABELS && dump.photoTokens[0]) {
        try {
          const raw = await readFile(join(resolve(LABELS), `${dump.photoTokens[0]}.json`), 'utf-8');
          const label = JSON.parse(raw) as { dishes: string[] };
          const truth = new Set(label.dishes.map(norm));
          const got = new Set(dishes.map((d) => norm(d.matchedName ?? d.name)));
          labeledPhotos += 1;
          labelTotal += truth.size;
          for (const t of truth) if (got.has(t)) labelHit += 1;
          for (const g of got) if (!truth.has(g)) labelExtra += 1;
        } catch {
          // 라벨 없으면 건너뛴다.
        }
      }
    }
  }

  console.log(`=== 식단 인식 측정 (덤프 ${files.length}건) ===\n`);
  for (const [model, s] of byModel) {
    const pct = (n: number, d: number): string => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-');
    console.log(`[${model}]`);
    console.log(`  호출 ${s.total} — 성공 ${s.success} / 파싱실패 ${s.parseError}(${pct(s.parseError, s.total)}) / 호출실패 ${s.llmError}`);
    console.log(`  음식 평균 ${(s.dishes / Math.max(1, s.success)).toFixed(1)}개`);
    console.log(`  저신뢰(<0.4) ${s.low}/${s.items} (${pct(s.low, s.items)})`);
    console.log(`  카탈로그 매칭 ${s.matched}/${s.items} (${pct(s.matched, s.items)})\n`);
  }

  if (LABELS) {
    if (labeledPhotos === 0) {
      console.log('라벨과 짝지어진 덤프가 없습니다.');
    } else {
      console.log(`=== 라벨 대조 (사진 ${labeledPhotos}장) ===`);
      console.log(`  재현율(정답 중 맞힘) ${labelHit}/${labelTotal} (${Math.round((labelHit / Math.max(1, labelTotal)) * 100)}%)`);
      console.log(`  오검출(정답에 없는 것) ${labelExtra}건`);
    }
  } else {
    console.log('힌트: --labels=<디렉터리> 를 주면 이름 정확도까지 측정합니다.');
  }
};

void main();
