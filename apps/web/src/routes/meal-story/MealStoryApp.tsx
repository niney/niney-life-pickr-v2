import { Navigate, Route, Routes } from 'react-router-dom';
import { useMealFont } from '../meal/mealFont';
import '../meal/mealTheme.css';
import './mealStory.css';
import { MealStoryList } from './MealStoryList';
import { MealStoryPlayer } from './MealStoryPlayer';
import { MealStoryRecipe } from './MealStoryRecipe';

// 건강식단 스토리(2026-11-09) — 원고·숫자는 서버(/meal-stories)가 준다. 주소는 /meal/stories(목록) · /meal/stories/:slug(이야기
// 한 편 — 영상·글 재생기) · /meal/stories/:slug/recipe(레시피 전체 보기). 식단 들머리(meal/MealEntry)가 로그인 여부로 가른다:
//   · 로그인 전 — 이 파일의 기본 내보내기. 식단 셸 없이 띄운다(공유 링크로 들어온 사람에게 식단 메뉴는 뜻이 없다): 공개 목록,
//     전체 화면 재생기, 레시피. 식단 테마(.meal-app — 색·글꼴)만 쓴다.
//   · 로그인 — 식단 셸 안(MealApp 의 stories 라우트): 목록은 MealStoriesPage, 이야기·레시피는 아래 두 화면. 넓은 화면에서는
//     사이드 메뉴가 그대로 남고(식단을 떠나지 않는다) 재생기는 본문 자리에, 휴대폰은 화면 가득(2026-11-10: 건강식단을 별도
//     메뉴·별도 화면으로 두지 않는다).

/** 로그인 전(/meal/* 아래 — MealEntry 가 /meal/stories… 일 때만 부른다). */
export default function MealStoryApp() {
  useMealFont();
  return (
    <div className="meal-app meal-story-app">
      <Routes>
        <Route path="stories" element={<MealStoryList />} />
        <Route path="stories/:slug" element={<MealStoryPlayer />} />
        <Route path="stories/:slug/recipe" element={<MealStoryRecipe />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </div>
  );
}

/** 식단 셸 안의 이야기 한 편 — 넓은 화면은 본문 자리의 카드, 휴대폰은 화면 가득(.meal-story-inshell). */
export const MealStoryPlayerPage = () => (
  <div className="meal-story-app meal-story-inshell">
    <MealStoryPlayer inShell />
  </div>
);

/** 식단 셸 안의 레시피 전체 보기. */
export const MealStoryRecipePage = () => (
  <div className="meal-story-app meal-story-inshell">
    <MealStoryRecipe />
  </div>
);
