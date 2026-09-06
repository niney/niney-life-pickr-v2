import {
  SAJU_G_BRANCHES,
  SAJU_G_ELEMENT_META,
  SAJU_G_PILLAR_LABEL,
  SAJU_G_STEMS,
  SAJU_GOD_MEANING,
  sajuGPronunciation,
  type SajuGElementId,
} from './saju-g.js';

// 계산은 하지 않는다. 서버에서 확정한 명식만 소비하는 웹/서버 공용 콘텐츠.
type StoryChart = {
  dayMaster: { symbol: string; element: SajuGElementId } | null;
  pillars: Array<{
    key: keyof typeof SAJU_G_PILLAR_LABEL;
    ganZhi: string | null;
    tenGod: string | null;
    hiddenStems: Array<{ ko: string; tenGod: string | null }>;
  }>;
};

// 일지의 전통 해석을 단정하는 표가 아닌, 오행 상징을 그리는 창작 장면이다.
const LANDSCAPE: Record<SajuGElementId, { place: string; invitation: string }> = {
  wood: { place: '새잎이 돋는 숲', invitation: '새롭게 시작하고 싶은 일' },
  fire: { place: '온기가 번지는 뜰', invitation: '누군가와 나누고 싶은 마음' },
  earth: { place: '흙길이 이어지는 정원', invitation: '오래 돌보고 싶은 일상' },
  metal: { place: '맑은 윤곽의 바위산', invitation: '나만의 기준을 세우고 싶은 일' },
  water: { place: '물결이 머무는 호숫가', invitation: '서두르지 않고 살펴보고 싶은 생각' },
};

export function sajuGDayStory(chart: StoryChart) {
  const day = chart.pillars.find((p) => p.key === 'day');
  if (!chart.dayMaster || !day?.ganZhi) return null;
  const stem = SAJU_G_STEMS.find((s) => s.hanja === day.ganZhi![0]);
  const branch = SAJU_G_BRANCHES.find((b) => b.hanja === day.ganZhi![1]);
  if (!stem || !branch) return null;
  const landscape = LANDSCAPE[branch.element];
  return {
    ganZhi: day.ganZhi,
    name: `${sajuGPronunciation(day.ganZhi)}일주`,
    title: `${landscape.place}, ${stem.symbol}`,
    symbol: stem.symbol,
    stemElement: stem.element,
    branchElement: branch.element,
    text: `일주 윗글자 ${stem.ko}(${stem.hanja})에서 ‘${stem.symbol}’의 이미지를, 아랫글자 ${branch.ko}(${branch.hanja})의 ${SAJU_G_ELEMENT_META[branch.element].name} 기운에서는 ‘${SAJU_G_ELEMENT_META[branch.element].meaning}’을 떠올려 보세요. 이 두 상징을 ${landscape.place}에 놓인 ${stem.symbol}의 장면으로 그려봤어요.`,
    invitation: `${stem.symbol}의 이미지를 떠올리면, ${landscape.invitation}은 무엇인가요?`,
    evidenceIds: ['pillar-day', 'day-master'],
  };
}

export const SAJU_G_GOD_STORIES: Record<
  string,
  { keyword: string; text: string; question: string }
> = {
  비견: {
    keyword: '나란히 서기',
    text: '같은 오행과 음양의 관계를 자기 기준과 동료라는 관점으로 읽어요. 내 방식과 상대의 방식을 함께 존중할 자리를 생각해 보세요.',
    question: '같이 하더라도 내가 지키고 싶은 기준은 무엇인가요?',
  },
  겁재: {
    keyword: '함께 조율하기',
    text: '같은 오행, 다른 음양의 관계예요. 협력과 경쟁이 함께 있는 장면에서 역할과 경계를 어떻게 정할지 돌아볼 수 있어요.',
    question: '누군가와 나눌 몫과 나에게 남길 몫은 무엇인가요?',
  },
  식신: {
    keyword: '꾸준히 만들기',
    text: '일간이 생하는 오행과 같은 음양의 관계예요. 작은 결과물을 꾸준히 만드는 즐거움과 일상의 표현에 비추어 보세요.',
    question: '결과를 서두르지 않고 계속 만들고 싶은 것은 무엇인가요?',
  },
  상관: {
    keyword: '다르게 표현하기',
    text: '일간이 생하는 오행과 다른 음양의 관계예요. 익숙한 방식에 질문을 던지고 새로운 표현을 시도하는 관점이에요.',
    question: '평소와 다른 방식으로 전해 보고 싶은 생각이 있나요?',
  },
  편재: {
    keyword: '넓게 경험하기',
    text: '일간이 극하는 오행과 같은 음양의 관계예요. 재물의 많고 적음이 아니라, 여러 경험에 시간과 자원을 어떻게 나눌지 생각해 보세요.',
    question: '관심 가는 여러 일 중 이번 주에 경험해 볼 한 가지는요?',
  },
  정재: {
    keyword: '차근히 관리하기',
    text: '일간이 극하는 오행과 다른 음양의 관계예요. 일상의 시간과 자원을 꾸준히 관리하는 관점으로 읽을 수 있어요.',
    question: '작게 기록해 두면 도움이 될 생활 습관은 무엇인가요?',
  },
  편관: {
    keyword: '도전에 기준 세우기',
    text: '일간을 극하는 오행과 같은 음양의 관계예요. 낯선 과제 앞에서 필요한 기준과 감당할 수 있는 범위를 살펴보세요.',
    question: '도전하고 싶은 일에서 도움을 요청할 부분은 어디인가요?',
  },
  정관: {
    keyword: '약속을 살피기',
    text: '일간을 극하는 오행과 다른 음양의 관계예요. 책임을 맡는 마음과 내 여유 사이에서 지킬 수 있는 약속을 돌아보세요.',
    question: '지금 맡은 역할 중 조정이 필요한 약속이 있나요?',
  },
  편인: {
    keyword: '다른 관점 찾기',
    text: '일간을 생하는 오행과 같은 음양의 관계예요. 익숙하지 않은 분야를 탐구하고 혼자 생각을 엮는 시간에 비추어 보세요.',
    question: '정답을 찾지 않아도 더 알아보고 싶은 주제는 무엇인가요?',
  },
  정인: {
    keyword: '배우고 돌보기',
    text: '일간을 생하는 오행과 다른 음양의 관계예요. 배움과 돌봄을 주고받으며 내가 기대는 기반을 살펴보세요.',
    question: '최근에 도움을 받은 사람이나 배움은 무엇인가요?',
  },
};

export function sajuGGodCards(chart: StoryChart) {
  if (!chart.dayMaster) return [];
  const positions = new Map<string, string[]>();
  const add = (god: string | null, position: string) => {
    if (!god || !SAJU_G_GOD_STORIES[god]) return;
    positions.set(god, [...(positions.get(god) ?? []), position]);
  };
  for (const pillar of chart.pillars) {
    if (!pillar.ganZhi) continue;
    const label = SAJU_G_PILLAR_LABEL[pillar.key];
    // 일간 자신을 비견 하나로 집계하지 않는다.
    if (pillar.key !== 'day') add(pillar.tenGod, `${label} 천간`);
    for (const hidden of pillar.hiddenStems) add(hidden.tenGod, `${label} 지장간 ${hidden.ko}`);
  }
  return Object.entries(SAJU_G_GOD_STORIES).flatMap(([name, story]) => {
    const found = positions.get(name);
    return found ? [{ name, ...story, meaning: SAJU_GOD_MEANING[name]!, positions: found }] : [];
  });
}

export const SAJU_G_SCENES = [
  { id: 'meeting', title: '처음 만난 사람 앞에서', caption: '나를 소개하는 순간', glyph: '01' },
  { id: 'busy', title: '할 일이 한꺼번에 몰릴 때', caption: '나의 속도를 찾는 순간', glyph: '02' },
  { id: 'conflict', title: '마음이 부딪히는 대화에서', caption: '다시 연결되는 순간', glyph: '03' },
] as const;

export function basicSajuGLifeScenes(chart: StoryChart) {
  const symbol = chart.dayMaster?.symbol;
  const basis = symbol ? 'day-master' : 'scope';
  const intro = symbol
    ? `${symbol}의 상징을 이 장면에 비추어 보세요.`
    : '일간이 확정되지 않아 특정 성향을 붙이지 않고, 생활을 돌아볼 질문을 준비했어요.';
  const content = [
    {
      text: `${intro} 처음부터 모든 모습을 보여 줄 필요는 없어요. 내가 편한 소개 방식과 상대에게 궁금한 점을 하나씩 골라 보세요.`,
      action: '요즘 좋아하는 일을 한 문장으로 소개하고 상대에게도 물어보세요.',
      question: '어떤 이야기를 할 때 가장 자연스러운 내가 되나요?',
    },
    {
      text: `${symbol ? `${symbol}의 이미지를 나의 작업 리듬에 겹쳐 보세요.` : '확인되지 않은 성향 대신 현재의 일정과 여유부터 살펴보세요.'} 바쁜 날에는 할 일의 양과 내 가치를 분리해 생각해도 좋아요.`,
      action: '오늘 꼭 마칠 일 하나와 미뤄도 되는 일 하나를 나누어 적어보세요.',
      question: '집중이 잘됐던 날에는 어떤 환경이었나요?',
    },
    {
      text: `${symbol ? `${symbol}의 상징을 대화의 출발점으로 삼아보세요.` : '사주로 상대의 마음을 추측하기보다 실제 대화를 돌아보세요.'} 서로 다르게 이해한 부분을 확인하면 지금 필요한 부탁을 찾는 데 도움이 될 수 있어요.`,
      action: '상대의 의도를 단정하기 전에 “나는 이렇게 이해했는데 맞을까요?”라고 물어보세요.',
      question: '이번 대화에서 내가 정말 전하고 싶었던 것은 무엇인가요?',
    },
  ];
  return SAJU_G_SCENES.map((scene, i) => ({ id: scene.id, ...content[i]!, evidenceIds: [basis] }));
}
