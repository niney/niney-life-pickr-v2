import { createContext } from 'react';
import { SHADOW } from './palette';

/**
 * 종이 그림자 색 — 장면(StoryVideo 의 Chapter)이 팔레트의 그림자를 내려 준다(다크 모드는 더 진하게). 종이 조각(kit Paper)을 쓰는
 * 곳마다 팔레트를 넘기지 않으려고 컨텍스트로 둔다. 밖에서 쓰면(소품 점검 한 장) 밝은 화면의 그림자.
 */
export const PaperShadow = createContext<readonly [string, string, string]>(SHADOW);
