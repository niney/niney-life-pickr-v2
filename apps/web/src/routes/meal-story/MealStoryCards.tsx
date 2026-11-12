import { Link } from 'react-router-dom';
import type { MealStoryListItemType } from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { MEAL_STORY_PATH } from '../meal/mealPaths';
import { mealStoryCardLabel } from './mealStoryTopic';

/**
 * 건강식단 이야기 카드 격자 — 로그인 전 목록(MealStoryList)과 식단 안 목록(MealStoriesPage)이 같이 쓴다.
 * flagOf 는 카드 위 한 줄(내 기록에 맞는 이야기 표시), wide 는 식단 셸의 넓은 본문에 맞춰 칸 수를 늘린다.
 * 카드의 이름(사진 없는 편의 큰 글·제목 위 한 줄)은 그 편의 머리말 — 한 주제에 편이 여럿이어도 구분된다.
 */
export const MealStoryCards = ({
  items,
  wide = false,
  flagOf,
}: {
  items: readonly MealStoryListItemType[];
  wide?: boolean;
  flagOf?: (story: MealStoryListItemType) => string | null;
}) => (
  <ul className={cn('msl-grid', wide && 'msl-grid-wide')}>
    {items.map((s) => {
      const flag = flagOf?.(s) ?? null;
      return (
        <li key={s.slug}>
          <Link to={MEAL_STORY_PATH.story(s.slug)} className="msl-card">
            {s.coverUrl ? (
              <img src={s.coverUrl} alt="" className="msl-cover" loading="lazy" />
            ) : (
              <div className="msl-cover msl-cover-text" aria-hidden>
                {mealStoryCardLabel(s)}
              </div>
            )}
            <div className="msl-body">
              {flag ? <p className="msl-flag">{flag}</p> : null}
              <p className="msl-kicker">
                {mealStoryCardLabel(s)} · {s.sceneCount}장면{s.status === 'draft' ? ' · 초안' : ''}
              </p>
              <h2 className="msl-title">{s.title}</h2>
              <p className="msl-summary">{s.summary}</p>
            </div>
          </Link>
        </li>
      );
    })}
  </ul>
);
