// 사주 상징·한글 풀이. 역법 계산은 서버, 이 표는 웹과 서버가 함께 사용한다.
export const SAJU_ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water'] as const;
export type SajuElementId = (typeof SAJU_ELEMENTS)[number];
export const SAJU_ELEMENT_META: Record<
  SajuElementId,
  { name: string; hanja: string; color: string; meaning: string }
> = {
  wood: { name: '목', hanja: '木', color: '#83bda0', meaning: '성장과 시작' },
  fire: { name: '화', hanja: '火', color: '#e89478', meaning: '표현과 온기' },
  earth: { name: '토', hanja: '土', color: '#d5b776', meaning: '중심과 돌봄' },
  metal: { name: '금', hanja: '金', color: '#c5cede', meaning: '기준과 정리' },
  water: { name: '수', hanja: '水', color: '#83b4d6', meaning: '사유와 유연함' },
};
export const SAJU_STEMS = [
  {
    hanja: '甲',
    ko: '갑',
    element: 'wood',
    symbol: '큰 나무',
    title: '뿌리 깊게, 나답게 자라는 사람',
    description:
      '큰 나무처럼 방향을 세우고 꾸준히 자라나는 상징이에요. 자신이 중요하게 여기는 기준을 지키면서도, 다른 성장 속도를 인정해 보세요.',
  },
  {
    hanja: '乙',
    ko: '을',
    element: 'wood',
    symbol: '풀과 덩굴',
    title: '유연하게 이어 가는 생명력',
    description:
      '풀과 덩굴처럼 주변을 살피며 길을 찾는 상징이에요. 관계의 흐름을 읽는 감각과 자신의 뜻을 함께 존중해 보세요.',
  },
  {
    hanja: '丙',
    ko: '병',
    element: 'fire',
    symbol: '태양',
    title: '세상에 온기를 건네는 사람',
    description:
      '태양처럼 밝게 드러내고 나누는 상징이에요. 표현하는 즐거움과 조용히 에너지를 채우는 시간을 함께 가져 보세요.',
  },
  {
    hanja: '丁',
    ko: '정',
    element: 'fire',
    symbol: '등불',
    title: '가까운 곳을 다정하게 밝히는 빛',
    description:
      '등불처럼 한곳을 오래 비추는 상징이에요. 작은 변화에 기울이는 관심을 자신에게도 돌려 보세요.',
  },
  {
    hanja: '戊',
    ko: '무',
    element: 'earth',
    symbol: '산',
    title: '자신의 자리에서 든든하게',
    description:
      '산처럼 중심을 잡고 버티는 상징이에요. 책임을 맡는 힘과 필요할 때 도움을 청하는 유연함을 함께 써 보세요.',
  },
  {
    hanja: '己',
    ko: '기',
    element: 'earth',
    symbol: '밭과 흙',
    title: '작은 가능성을 키워 내는 마음',
    description:
      '밭의 흙처럼 품고 가꾸는 상징이에요. 주변을 돌보는 정성을 자신의 생활과 휴식에도 나누어 주세요.',
  },
  {
    hanja: '庚',
    ko: '경',
    element: 'metal',
    symbol: '단단한 금속',
    title: '분명한 기준으로 길을 여는 사람',
    description:
      '단단한 금속처럼 결단과 정리를 상징해요. 명료한 기준을 따뜻한 표현에 담으면 뜻이 더 잘 전해질 수 있어요.',
  },
  {
    hanja: '辛',
    ko: '신',
    element: 'metal',
    symbol: '보석',
    title: '자신만의 결을 섬세하게 다듬는 사람',
    description:
      '보석처럼 세밀하게 다듬고 가치를 발견하는 상징이에요. 완벽함을 향한 관심에 작은 여유를 더해 보세요.',
  },
  {
    hanja: '壬',
    ko: '임',
    element: 'water',
    symbol: '강과 바다',
    title: '넓은 세상을 유연하게 흐르는 사람',
    description:
      '강과 바다처럼 넓게 탐색하고 연결하는 상징이에요. 다양한 가능성을 살피되 오늘의 한 가지에 머물러 보세요.',
  },
  {
    hanja: '癸',
    ko: '계',
    element: 'water',
    symbol: '비와 이슬',
    title: '조용히 스며드는 깊은 감각',
    description:
      '비와 이슬처럼 섬세하게 스며드는 상징이에요. 차분한 관찰을 작은 표현과 행동으로 이어 보세요.',
  },
] as const satisfies readonly {
  hanja: string;
  ko: string;
  element: SajuElementId;
  symbol: string;
  title: string;
  description: string;
}[];
export const SAJU_BRANCHES = [
  { hanja: '子', ko: '자', element: 'water', hidden: '癸' },
  { hanja: '丑', ko: '축', element: 'earth', hidden: '己癸辛' },
  { hanja: '寅', ko: '인', element: 'wood', hidden: '甲丙戊' },
  { hanja: '卯', ko: '묘', element: 'wood', hidden: '乙' },
  { hanja: '辰', ko: '진', element: 'earth', hidden: '戊乙癸' },
  { hanja: '巳', ko: '사', element: 'fire', hidden: '丙戊庚' },
  { hanja: '午', ko: '오', element: 'fire', hidden: '丁己' },
  { hanja: '未', ko: '미', element: 'earth', hidden: '己丁乙' },
  { hanja: '申', ko: '신', element: 'metal', hidden: '庚壬戊' },
  { hanja: '酉', ko: '유', element: 'metal', hidden: '辛' },
  { hanja: '戌', ko: '술', element: 'earth', hidden: '戊辛丁' },
  { hanja: '亥', ko: '해', element: 'water', hidden: '壬甲' },
] as const satisfies readonly {
  hanja: string;
  ko: string;
  element: SajuElementId;
  hidden: string;
}[];
export const SAJU_GOD_MEANING: Record<string, string> = {
  비견: '자기 기준과 나란히 서는 관계',
  겁재: '협력 속에서 조율하는 경계',
  식신: '꾸준한 표현과 일상의 생산성',
  상관: '새로운 표현과 기존 방식의 질문',
  편재: '넓은 경험과 자원의 활용',
  정재: '꾸준한 관리와 현실적인 계획',
  편관: '도전 속에서 세우는 기준',
  정관: '책임과 약속의 균형',
  편인: '새로운 관점과 깊은 탐구',
  정인: '배움과 돌봄의 기반',
};
export function sajuTenGod(dayStem: string | null, targetStem: string): string | null {
  const a = SAJU_STEMS.findIndex((s) => s.hanja === dayStem);
  const b = SAJU_STEMS.findIndex((s) => s.hanja === targetStem);
  if (a < 0 || b < 0) return null;
  const offset = (Math.floor(b / 2) - Math.floor(a / 2) + 5) % 5;
  return [
    ['비견', '겁재'],
    ['식신', '상관'],
    ['편재', '정재'],
    ['편관', '정관'],
    ['편인', '정인'],
  ][offset]![a % 2 === b % 2 ? 0 : 1]!;
}
export const sajuPronunciation = (ganZhi: string): string =>
  `${SAJU_STEMS.find((s) => s.hanja === ganZhi[0])?.ko ?? ''}${SAJU_BRANCHES.find((s) => s.hanja === ganZhi[1])?.ko ?? ''}`;
export const SAJU_KIND_LABEL = {
  natal: '나의 사주',
  annual: '올해의 흐름',
  daily: '오늘의 흐름',
} as const;
export const SAJU_PILLAR_LABEL = {
  year: '연주',
  month: '월주',
  day: '일주',
  hour: '시주',
} as const;
