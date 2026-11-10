// 종이 오리기 색 — 크림 바탕에 색종이. 무대 색종이만 주제색(나트륨 = 파랑), 빨강은 판정('많음')에만.
// 다크 모드는 어두운 판지 위에 같은 색종이(종이는 종이 — 쪽지 글은 그대로 먹색), 바탕 위 글만 밝게.

export interface PaperPalette {
  bg: string;
  onBg: string;
  onBgFaint: string;
  paper: string;
  ink: string;
  inkFaint: string;
  stage: string;
  stageDeep: string;
  navy: string;
  silver: string;
  silverDeep: string;
  shine: string;
  salt: string;
  saltDot: string;
  red: string;
  yellow: string;
  pink: string;
  mint: string;
  tape: string;
  wood: string;
  soup: string;
  tomato: string;
  leaf: string;
  cream: string;
  onion: string;
  cheese: string;
  oil: string;
  steel: string;
}

const BASE = {
  paper: '#fbf6ea',
  ink: '#2a1d18',
  inkFaint: '#6b5a4f',
  navy: '#26315f',
  silver: '#cdd3dd',
  silverDeep: '#a9b3c4',
  shine: '#eef1f6',
  salt: '#fffdf8',
  saltDot: '#d8dde6',
  red: '#d24a36',
  yellow: '#f6cf55',
  pink: '#f3a3bf',
  mint: '#a9d9c6',
  tape: 'rgba(236, 214, 160, 0.85)',
  wood: '#c08048',
  soup: '#c9763f',
  tomato: '#e0533d',
  leaf: '#5aa05a',
  cream: '#f3ead6',
  onion: '#e9c9a3',
  cheese: '#f2c94c',
  oil: '#c9b13a',
  steel: '#8e99ab',
};

const TOPIC_STAGE: Readonly<Record<string, { stage: string; stageDeep: string }>> = {
  sodium: { stage: '#4c6fb5', stageDeep: '#3f5e9c' },
};
const DEFAULT_STAGE = TOPIC_STAGE.sodium!;

export const paperPalette = (topicNutrient: string | null, dark: boolean): PaperPalette => {
  const stage = (topicNutrient && TOPIC_STAGE[topicNutrient]) || DEFAULT_STAGE;
  return {
    ...BASE,
    ...stage,
    bg: dark ? '#1d1b18' : '#f3ead6',
    onBg: dark ? '#f2ece0' : '#2a1d18',
    onBgFaint: dark ? '#b9b0a3' : '#6b5a4f',
    ...(dark ? { paper: '#efe7d6', stage: stage.stageDeep, stageDeep: '#324d85' } : {}),
  };
};

/** 그림자 — 흐림 없이 세 겹(휴대폰에서 매 프레임 흐림을 다시 그리지 않게). */
export const SHADOW = ['rgba(42,29,24,0.07)', 'rgba(42,29,24,0.09)', 'rgba(42,29,24,0.1)'] as const;
