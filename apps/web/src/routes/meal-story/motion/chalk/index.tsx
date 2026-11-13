import type { MealStorySceneType } from '@repo/api-contract';
import type { ChapterContext } from '../types';
import { ChalkBars } from './ChalkBars';
import { ChalkCover } from './ChalkCover';
import { ChalkLineup } from './ChalkLineup';
import { ChalkList } from './ChalkList';
import { ChalkOutro } from './ChalkOutro';
import { ChalkStat } from './ChalkStat';

/** 칠판 메뉴판 그림체의 장면 하나 — 그리는 장면 목록은 chalkLayout 의 chalkDraws(못 그리는 장면은 null). */
export const ChalkChapter = ({ scene, ctx }: { scene: MealStorySceneType; ctx: ChapterContext }) => {
  switch (scene.type) {
    case 'cover':
      return <ChalkCover scene={scene} ctx={ctx} />;
    case 'stat':
      return <ChalkStat scene={scene} ctx={ctx} />;
    case 'bars':
      return <ChalkBars scene={scene} ctx={ctx} />;
    case 'lineup':
      return <ChalkLineup scene={scene} ctx={ctx} />;
    case 'list':
      return <ChalkList scene={scene} ctx={ctx} />;
    case 'outro':
      return <ChalkOutro scene={scene} ctx={ctx} />;
    default:
      return null;
  }
};
