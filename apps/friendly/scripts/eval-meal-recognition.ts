// 식단 사진 인식 측정 — 개인정보 보호형 디버그 덤프의 호출 성공률을 집계한다.
// 기본 덤프(rawIncluded=false)는 음식명·사진 토큰을 저장하지 않으므로 호출/파싱 지표만
// 계산한다. 음식 수·신뢰도·매칭률은 명시적으로 RAW 디버그를 켠 덤프에서만 표시한다.
//
// 수집:
//   MEAL_RECOGNITION_DEBUG=1 pnpm --filter friendly dev
//   원문 품질까지 로컬에서 볼 때만 MEAL_RECOGNITION_DEBUG_RAW=1도 함께 설정
// 실행:
//   pnpm --filter friendly eval:meal-recognition -- --dir=data/meal-recognition-debug
//   pnpm --filter friendly eval:meal-recognition -- --labels=data/meal-labels --require-raw
// 라벨 파일(선택)은 아래 키 중 하나를 파일명으로 쓴다.
//   <dump 파일명>.json, <photoTokenHash>.json, <hash 앞 12자>.json, 구버전 <photoToken>.json
// 내용: { "dishes": ["김치찌개", "공깃밥"] }

import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  aggregateMealRecognitionEval,
  normalizeMealLabel,
  parseMealRecognitionEvalRecord,
  type MealRecognitionEvalRecord,
} from '../src/modules/meal-recognition/meal-recognition-eval.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DIR = opt('dir') ?? 'data/meal-recognition-debug';
const LABELS = opt('labels');
const REQUIRE_RAW = args.includes('--require-raw');
const JSON_OUTPUT = args.includes('--json');

const pct = (numerator: number, denominator: number): string =>
  denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : '-';

const safeLabelKey = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 160 &&
  basename(value) === value &&
  /^[\p{L}\p{N}._-]+$/u.test(value);

const loadLabel = async (
  labelsDir: string,
  keys: string[],
): Promise<{ dishes: string[] } | null> => {
  for (const key of keys) {
    if (!safeLabelKey(key)) continue;
    try {
      const parsed: unknown = JSON.parse(await readFile(join(labelsDir, `${key}.json`), 'utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { dishes?: unknown }).dishes) &&
        (parsed as { dishes: unknown[] }).dishes.every((dish) => typeof dish === 'string')
      ) {
        return { dishes: (parsed as { dishes: string[] }).dishes };
      }
    } catch {
      // 이 키의 라벨이 없거나 손상됐으면 다음 개인정보 안전 키를 시도한다.
    }
  }
  return null;
};

const main = async (): Promise<void> => {
  const dir = resolve(DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  } catch {
    console.error(
      `덤프 폴더가 없습니다: ${dir}\nMEAL_RECOGNITION_DEBUG=1로 서버를 띄우고 사진을 올려 주세요.`,
    );
    process.exitCode = 1;
    return;
  }
  if (files.length === 0) {
    console.error(`덤프가 없습니다: ${dir}`);
    process.exitCode = 1;
    return;
  }

  const records: MealRecognitionEvalRecord[] = [];
  let invalidDumps = 0;
  for (const file of files) {
    try {
      const record = parseMealRecognitionEvalRecord(
        JSON.parse(await readFile(join(dir, file), 'utf8')),
        file,
      );
      if (record) records.push(record);
      else invalidDumps += 1;
    } catch {
      invalidDumps += 1;
    }
  }

  const byModel = aggregateMealRecognitionEval(records);
  let labeledPhotos = 0;
  let labelHit = 0;
  let labelTotal = 0;
  let labelExtra = 0;
  if (LABELS) {
    const labelsDir = resolve(LABELS);
    for (const record of records) {
      if (record.phase !== 'success' || record.dishes === null) continue;
      const label = await loadLabel(labelsDir, record.labelKeys);
      if (!label) continue;
      const truth = new Set(label.dishes.map(normalizeMealLabel));
      const got = new Set(
        record.dishes.map((dish) => normalizeMealLabel(dish.matchedName ?? dish.name)),
      );
      labeledPhotos += 1;
      labelTotal += truth.size;
      for (const expected of truth) if (got.has(expected)) labelHit += 1;
      for (const actual of got) if (!truth.has(actual)) labelExtra += 1;
    }
  }

  const rawSuccess = [...byModel.values()].reduce((sum, stat) => sum + stat.rawSuccess, 0);
  const output = {
    schemaVersion: 2,
    files: files.length,
    validDumps: records.length,
    invalidDumps,
    rawSuccess,
    models: Object.fromEntries(byModel),
    labels: LABELS ? { labeledPhotos, hit: labelHit, total: labelTotal, extra: labelExtra } : null,
  };
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`=== 식단 인식 측정 (덤프 ${files.length}건, 유효 ${records.length}건) ===\n`);
    if (invalidDumps > 0) {
      console.log(`손상/구버전 불일치 덤프 ${invalidDumps}건은 제외했습니다.\n`);
    }
    for (const [model, stat] of byModel) {
      console.log(`[${model}]`);
      console.log(
        `  호출 ${stat.total} — 성공 ${stat.success} / 파싱실패 ${stat.parseError}(${pct(stat.parseError, stat.total)}) / 호출실패 ${stat.llmError}`,
      );
      if (stat.rawSuccess === 0) {
        console.log('  음식 품질 지표: 원문 미보관(rawIncluded=false)으로 계산 불가\n');
      } else {
        console.log(
          `  원문 표본 ${stat.rawSuccess}/${stat.success} · 음식 평균 ${(stat.dishes / stat.rawSuccess).toFixed(1)}개`,
        );
        console.log(
          `  저신뢰(<0.4) ${stat.lowConfidence}/${stat.dishes} (${pct(stat.lowConfidence, stat.dishes)})`,
        );
        console.log(
          `  카탈로그 매칭 ${stat.matched}/${stat.dishes} (${pct(stat.matched, stat.dishes)})\n`,
        );
      }
    }

    if (LABELS) {
      if (labeledPhotos === 0) {
        console.log('라벨과 짝지어진 원문 포함 덤프가 없습니다.');
      } else {
        console.log(`=== 라벨 대조 (사진 ${labeledPhotos}장) ===`);
        console.log(`  재현율 ${labelHit}/${labelTotal} (${pct(labelHit, labelTotal)})`);
        console.log(`  오검출 ${labelExtra}건`);
      }
    } else {
      console.log('힌트: --labels=<디렉터리>를 주면 원문 포함 덤프의 이름 정확도도 측정합니다.');
    }
  }

  if (REQUIRE_RAW && rawSuccess === 0) {
    console.error('원문 포함 성공 덤프가 없어 --require-raw 조건을 충족하지 못했습니다.');
    process.exitCode = 2;
  }
};

void main();
