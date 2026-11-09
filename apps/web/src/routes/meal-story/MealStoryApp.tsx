import { Route, Routes } from 'react-router-dom';
import { useMealFont } from '../meal/mealFont';
import '../meal/mealTheme.css';
import './mealStory.css';
import { MealStoryList } from './MealStoryList';
import { MealStoryPlayer } from './MealStoryPlayer';
import { MealStoryRecipe } from './MealStoryRecipe';

// 건강식단 스토리(2026-11-09) — /meal/stories 아래 누구나 보는 화면. 식단 테마(.meal-app — 색·글꼴)를 쓰되 식단 셸(사이드
// 메뉴·하단 탭) 없이 띄운다: 목록 · 스토리(전체 화면 재생기) · 레시피 전체 보기. 원고·숫자는 서버(/meal-stories)가 준다.
export default function MealStoryApp() {
  useMealFont();
  return (
    <div className="meal-app meal-story-app">
      <Routes>
        <Route index element={<MealStoryList />} />
        <Route path=":slug" element={<MealStoryPlayer />} />
        <Route path=":slug/recipe" element={<MealStoryRecipe />} />
      </Routes>
    </div>
  );
}
