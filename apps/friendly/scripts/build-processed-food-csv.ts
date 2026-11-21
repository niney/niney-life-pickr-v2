// 가공식품 전체판(식약처 식품영양성분 DB 내려받기 — XLSX, 33만 행·시트 2.3GB)을 건강식단 스토리가 읽는 가벼운 CSV 로 줄인다.
//
// 실행: pnpm --filter friendly build:processed-food-csv [--from=<xlsx 경로>]
//   --from 을 안 주면 data/open/food/ 의 `*가공식품DB*.xlsx` 중 이름이 가장 뒤인 것(날짜가 앞에 붙는다).
//   결과: data/open/food/mfds-processed-full.csv(git 밖) — 스토리 원고의 묶음(group) `db: "processed-full"` 이 읽는다.
//
// 공공데이터포털 표준데이터 CSV(mfds-nutrition-15100066.csv)는 5만 행에서 잘린 조각이고 이름 가나다순의 뒤쪽(ㅋ~ㅎ)이라
// 제품 묶음의 중앙값이 한쪽으로 치우친다(이름이 ㄴ·ㅅ·ㅇ·ㅊ 으로 시작하는 큰 제조사의 제품이 통째로 빠진다). 제품을 견주는
// 편은 전체판으로 낸다. 필요한 열만 남긴다(전체 150여 열 → 20열, 약 45MB). 받는 곳은 docs/data-sources.md.

/* eslint-disable no-console */
import { createWriteStream, existsSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamXlsxRows } from '../src/lib/xlsx-stream.js';
import { MEAL_STORY_FOOD_FILES } from '../src/modules/meal-story/meal-story.foods.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const FOOD_DIR = join(REPO_ROOT, 'data', 'open', 'food');

// 남기는 열 — 스토리 빌더(meal-story.foods.ts HEADER)가 읽는 이름 그대로. 앞의 넷이 없으면 쓸 수 없는 파일이다.
const REQUIRED = ['식품코드', '식품명', '영양성분함량기준량', '나트륨(mg)'] as const;
const KEEP = [
  '식품코드',
  '식품명',
  '식품대분류명',
  '대표식품명',
  '식품중분류명',
  '식품소분류명',
  '영양성분함량기준량',
  '에너지(kcal)',
  '탄수화물(g)',
  '단백질(g)',
  '지방(g)',
  '당류(g)',
  '식이섬유(g)',
  '나트륨(mg)',
  '칼륨(mg)',
  '칼슘(mg)',
  '비타민 C(mg)',
  '1회 섭취참고량',
  '식품중량',
  '제조사명',
] as const;

const csvCell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const main = async (): Promise<void> => {
  const fromArg = process.argv.find((a) => a.startsWith('--from='))?.slice('--from='.length);
  const from =
    fromArg ??
    (existsSync(FOOD_DIR)
      ? readdirSync(FOOD_DIR)
          .filter((n) => n.includes('가공식품DB') && n.endsWith('.xlsx'))
          .sort()
          .map((n) => join(FOOD_DIR, n))
          .at(-1)
      : undefined);
  if (!from || !existsSync(from)) {
    console.log(`가공식품 전체판 XLSX 가 없다(${fromArg ?? `${FOOD_DIR} 의 *가공식품DB*.xlsx`}) — 받는 곳은 docs/data-sources.md`);
    process.exitCode = 1;
    return;
  }
  const to = join(FOOD_DIR, MEAL_STORY_FOOD_FILES['processed-full']);
  console.log(`읽기: ${from}`);

  const out = createWriteStream(to, 'utf8');
  out.write('﻿');
  let index: number[] | null = null;
  let rows = 0;
  const started = Date.now();
  for await (const row of streamXlsxRows(from)) {
    if (!index) {
      const header = row.map((h) => h.trim());
      const missing = REQUIRED.filter((name) => !header.includes(name));
      if (missing.length > 0) {
        console.log(`머리글에 ${missing.join('·')} 열이 없다 — 가공식품 DB 배포본이 맞는지 본다`);
        process.exitCode = 1;
        out.end();
        return;
      }
      const absent = KEEP.filter((name) => !header.includes(name));
      if (absent.length > 0) console.log(`없는 열(비워 둔다): ${absent.join('·')}`);
      index = KEEP.map((name) => header.indexOf(name));
      out.write(`${KEEP.join(',')}\n`);
      continue;
    }
    const line = `${index.map((i) => csvCell(i < 0 ? '' : (row[i] ?? ''))).join(',')}\n`;
    if (!out.write(line)) await once(out, 'drain');
    rows += 1;
    if (rows % 50_000 === 0) console.log(`  ${rows.toLocaleString('ko-KR')}행 …`);
  }
  out.end();
  await once(out, 'finish');
  console.log(`쓰기: ${to} — ${rows.toLocaleString('ko-KR')}행 (${Math.round((Date.now() - started) / 1000)}초)`);
};

void main();
