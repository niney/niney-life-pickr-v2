// 풀이 패널 탭 상수(8차) — 그룹 3 × 서브. 컴포넌트 파일과 분리(react-refresh).

export type SajuPanelGroup = 'chart' | 'flow' | 'theme';
export type SajuPanelTab = 'chart' | 'personality' | 'elements' | 'cycle' | 'year' | 'daily' | 'date' | 'love' | 'wealth' | 'career' | 'ask' | 'food';

export const SAJU_PANEL_GROUPS: ReadonlyArray<{ id: SajuPanelGroup; label: string; tabs: ReadonlyArray<{ id: SajuPanelTab; label: string; tool?: boolean }> }> = [
  { id: 'chart', label: '원국', tabs: [{ id: 'chart', label: '명식' }, { id: 'personality', label: '성격' }, { id: 'elements', label: '오행' }] },
  { id: 'flow', label: '흐름', tabs: [{ id: 'cycle', label: '대운' }, { id: 'year', label: '올해' }, { id: 'daily', label: '오늘', tool: true }, { id: 'date', label: '택일', tool: true }] },
  { id: 'theme', label: '테마', tabs: [{ id: 'love', label: '인연' }, { id: 'wealth', label: '재물' }, { id: 'career', label: '직업' }, { id: 'ask', label: '질문', tool: true }, { id: 'food', label: '음식', tool: true }] },
];
export const sajuPanelGroupOf = (tab: SajuPanelTab): SajuPanelGroup => SAJU_PANEL_GROUPS.find((g) => g.tabs.some((t) => t.id === tab))?.id ?? 'chart';
export const isSajuThemeTab = (tab: SajuPanelTab): tab is 'love' | 'wealth' | 'career' => tab === 'love' || tab === 'wealth' || tab === 'career';
export const isSajuPanelTab = (v: string | null): v is SajuPanelTab => !!v && SAJU_PANEL_GROUPS.some((g) => g.tabs.some((t) => t.id === v));
