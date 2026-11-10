// 건강식단 스토리 한 편을 화면이 받는 모양(MealStory — 숫자는 서버가 계산한 값)으로 JSON 파일에 쓴다.
// MP4 렌더 도구(tools/meal-motion)가 영상 입력으로 쓴다. 초안도 쓴다(관리자 미리보기와 같은 내용).
//
// 실행: pnpm --filter friendly export:meal-story --slug=<slug> [--out=<file>] [--mine=3120] [--dark]
//   --mine 을 주면 '내 최근 2주 하루 평균 나트륨'을 그 값으로 넣은 로그인 화면(검수용 예시 값), 없으면 로그인 전 화면.
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
const mine =
  mineMg && reference
    ? {
        sodium: {
          value: Number(mineMg),
          unit: 'mg',
          percent: Math.round((Number(mineMg) / reference) * 100),
          statusLabel: Number(mineMg) > reference ? '많음' : '충분',
          over: Number(mineMg) > reference,
        },
      }
    : null;
writeFileSync(
  out,
  `${JSON.stringify({ story: loaded.story, mine, loggedIn: mine !== null, dark: process.argv.includes('--dark') }, null, 1)}\n`,
);
console.log(`${out} — 장면 ${loaded.story.scenes.length} · 풀리지 않은 가리킴 ${loaded.issues.length}${mine ? ` · 내 평균 ${mineMg}mg(예시)` : ''}`);
