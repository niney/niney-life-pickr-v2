// 카탈로그에 없는 음식의 웹 실측(fatsecret.kr 검색) 추정 프로브 — 파서·집계 규칙 검증용.
//
// 실행: pnpm --filter friendly probe:food-web-estimate --names=까르보나라,불족발,골뱅이탕 [--raw]
//   각 이름의 검색 페이지를 직접 받아(1초 간격) 항목·100g당 환산·중앙값·채택 여부를 찍는다.

import {
  aggregateWebSamples,
  buildFatsecretSearchUrl,
  htmlToText,
  parseFatsecretSearch,
} from '../src/modules/food/food-web-estimate.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const NAMES = (opt('names') ?? '까르보나라,불족발,골뱅이탕,부타동,어리굴젓,항정살구이,명란덮밥,하이볼')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const RAW = args.includes('--raw');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  for (const name of NAMES) {
    const url = buildFatsecretSearchUrl(name);
    const started = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko' } });
    const html = await res.text();
    const text = htmlToText(html);
    const samples = parseFatsecretSearch(text, name);
    const agg = aggregateWebSamples(samples);
    console.log(
      `\n### ${name} — http ${res.status}, ${html.length}b, ${Date.now() - started}ms, 항목 ${samples.length}` +
        (agg ? ` → 채택 ${agg.kcalPer100g}kcal/100g (일치 ${agg.agreeing}/${agg.samples.length})` : ' → 미채택'),
    );
    for (const s of agg?.samples ?? samples) {
      console.log(`  ${s.agrees === false ? '✗' : ' '} ${s.label} | ${s.grams ?? '?'}g ${s.kcal}kcal → ${s.per100}/100g`);
    }
    if (RAW) console.log(text.slice(0, 1500));
    await sleep(1000);
  }
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
