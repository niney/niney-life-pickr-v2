// 건강식단 스토리 한 편을 화면이 받는 모양(MealStory — 숫자는 서버가 계산한 값)으로 JSON 파일에 쓴다.
// MP4 렌더 도구(tools/meal-motion)가 영상 입력으로 쓴다. 초안도 쓴다(관리자 미리보기와 같은 내용).
//
// 실행: pnpm --filter friendly export:meal-story --slug=<slug> [--out=<file>] [--mine=3120] [--standard=2100] [--dark]
//   --mine 을 주면 '내 최근 2주 하루 평균'을 그 값으로 넣은 로그인 화면(검수용 예시 값), 없으면 로그인 전 화면. 어느 영양소인지는
//          원고가 정한다 — 큰 숫자 장면의 '내 기록' 숫자({ my: 'sodium' } → 나트륨 mg, { my: 'fiber' } → 식이섬유 g).
//   --standard 는 그 사람의 기준 — 나이·성별에 따라 원고의 기준 숫자와 다를 때(나트륨 65~74세 2,100, 식이섬유 여자 20)의
//          화면을 본다. 없으면 그 장면의 첫 기준 숫자.
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
const mineArg = arg('mine');

const loaded = await loadMealStoryDir(join(mealStoryDir(), slug));
// 내 값을 넣을 자리 — '내 기록' 숫자가 있는 첫 큰 숫자 장면과, 그 장면의 첫 기준 숫자(단위도 거기서).
const figures = loaded.story.scenes.flatMap((s) => (s.type === 'stat' && s.figures.some((f) => f.figure.my) ? [s.figures] : []))[0] ?? [];
const myKey = figures.find((f) => f.figure.my)?.figure.my ?? null;
const reference = figures.find((f) => !f.figure.my && f.figure.value !== null)?.figure;
const unit = reference?.unit ?? 'mg';
// 통계 영양소가 주는 값과 같은 모양 — 기준 대비 %·판정은 '그 사람의 기준'으로 센다.
const standard = Number(arg('standard') ?? reference?.value ?? 0);
const value = Number(mineArg);
const percent = standard > 0 ? Math.round((value / standard) * 100) : 0;
// 웹의 storyStatus 와 같은 글자 — 줄이는 주제(나트륨)는 넘으면 '많음', 지키면 '충분'이 아니라 '기준 안'. 채우는 주제
// (식이섬유)는 기준에 닿으면 '충분', 못 미치면 '조금 부족'·'부족'(영양 탭의 판정을 어림한 예시 — 75% 로 가른다).
const reduce = loaded.story.topic?.direction !== 'increase';
const statusLabel = reduce ? (value > standard ? '많음' : '기준 안') : percent >= 100 ? '충분' : percent >= 75 ? '조금 부족' : '부족';
const mine =
  mineArg && myKey && standard > 0
    ? { [myKey]: { value, unit, percent, standard, statusLabel, over: reduce && value > standard } }
    : null;
writeFileSync(
  out,
  `${JSON.stringify({ story: loaded.story, mine, loggedIn: mine !== null, dark: process.argv.includes('--dark') }, null, 1)}\n`,
);
console.log(
  `${out} — 장면 ${loaded.story.scenes.length} · 풀리지 않은 가리킴 ${loaded.issues.length}${mine ? ` · 내 평균 ${mineArg}${unit}(예시 ${myKey}, 기준 ${standard}${unit})` : ''}`,
);
