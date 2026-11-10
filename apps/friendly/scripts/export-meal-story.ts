// 건강식단 스토리 한 편을 화면이 받는 모양(MealStory — 숫자는 서버가 계산한 값)으로 JSON 파일에 쓴다.
// MP4 렌더 도구(tools/meal-motion)가 영상 입력으로 쓴다. 초안도 쓴다(관리자 미리보기와 같은 내용).
//
// 실행: pnpm --filter friendly export:meal-story --slug=<slug> [--out=<file>] [--mine=3120] [--standard=2100] [--dark]
//   --mine 을 주면 '내 최근 2주 하루 평균 나트륨'을 그 값으로 넣은 로그인 화면(검수용 예시 값), 없으면 로그인 전 화면.
//   --standard 는 그 사람의 기준(mg) — 나이에 따라 원고의 성인 기준과 다를 때(65~74세 2,100)의 화면을 본다. 없으면 원고의 기준.
/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadMealStoryDir, mealStoryDir } from '../src/modules/meal-story/meal-story.store.js';

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const slug = arg('slug');
if (!slug) {
  console.error('--slug=<slug> 가 필요하다');
  process.exit(1);
}
const out = resolve(arg('out') ?? `meal-story-${slug}.json`);
const mineMg = arg('mine');

const loaded = await loadMealStoryDir(join(mealStoryDir(), slug));
const reference = loaded.story.scenes
  .flatMap((s) => (s.type === 'stat' ? s.figures : []))
  .find((f) => !f.figure.my && f.figure.unit === 'mg' && f.figure.value !== null)?.figure.value;
// 통계 영양소가 주는 값과 같은 모양 — 기준 대비 %·판정은 '그 사람의 기준'으로 센다.
const standard = Number(arg('standard') ?? reference ?? 0);
const mine =
  mineMg && standard > 0
    ? {
        sodium: {
          value: Number(mineMg),
          unit: 'mg',
          percent: Math.round((Number(mineMg) / standard) * 100),
          standard,
          // 웹의 storyStatus 와 같은 글자 — 나트륨이 기준 안이면 '충분'이 아니라 '기준 안'.
          statusLabel: Number(mineMg) > standard ? '많음' : '기준 안',
          over: Number(mineMg) > standard,
        },
      }
    : null;
writeFileSync(
  out,
  `${JSON.stringify({ story: loaded.story, mine, loggedIn: mine !== null, dark: process.argv.includes('--dark') }, null, 1)}\n`,
);
console.log(
  `${out} — 장면 ${loaded.story.scenes.length} · 풀리지 않은 가리킴 ${loaded.issues.length}${mine ? ` · 내 평균 ${mineMg}mg(예시, 기준 ${standard}mg)` : ''}`,
);
