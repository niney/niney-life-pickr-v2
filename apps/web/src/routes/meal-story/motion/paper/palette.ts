// 종이 오리기 색 — 크림 바탕에 색종이. 무대 색종이만 주제색(나트륨 = 파랑, 식이섬유 = 초록, 칼슘 = 보라, 비타민 C = 귤색), 빨강은 판정('많음')에만.
// 다크 모드는 어두운 판지 위에 같은 색종이(종이는 종이 — 쪽지 글은 그대로 먹색), 바탕 위 글만 밝게.
// 다만 어두운 화면에서 눈부시지 않게 밝은 종이(쪽지·식탁보·노랑·분홍)를 한 톤 낮추고, 낮춘 종이 위에서도 읽히게 보조 글은
// 더 짙게, 판지 위에서 종이가 떠 보이게 그림자는 더 진하게 한다(DARK).

export interface PaperPalette {
  bg: string;
  /** 종이 그림자 세 겹(아래로 갈수록 가까운 겹). */
  shadow: readonly [string, string, string];
  /** 깅엄 식탁보의 흰 바탕. */
  cloth: string;
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

/** 그림자 — 흐림 없이 세 겹(휴대폰에서 매 프레임 흐림을 다시 그리지 않게). */
export const SHADOW = ['rgba(42,29,24,0.07)', 'rgba(42,29,24,0.09)', 'rgba(42,29,24,0.1)'] as const;

// 다크 모드에서 바뀌는 색 — 밝은 종이는 약 6~8% 낮추고(먹색 글과의 대비는 그대로 넉넉하다), 보조 글은 낮춘 크림 쪽지 위에서도
// 대비 4.5:1 을 넘게 짙게.
const DARK = {
  bg: '#221f1b',
  onBg: '#f2ece0',
  onBgFaint: '#b9b0a3',
  paper: '#e8dfcc',
  cream: '#dad1bd',
  cloth: '#dfdbd0',
  inkFaint: '#584940',
  yellow: '#ecc650',
  pink: '#e69bb5',
  salt: '#f4f0e7',
  shadow: ['rgba(0,0,0,0.14)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.22)'],
} as const;

// 무대 색 — 머리말 쪽지의 흰 손글씨가 읽히게 흰색과의 대비 4.5:1 안팎으로 잡는다. darkDeep 은 다크 모드의 줄무늬 짙은 쪽.
const TOPIC_STAGE: Readonly<Record<string, { stage: string; stageDeep: string; darkDeep: string }>> = {
  sodium: { stage: '#4c6fb5', stageDeep: '#3f5e9c', darkDeep: '#324d85' },
  fiber: { stage: '#35805d', stageDeep: '#2c6d4f', darkDeep: '#235a41' },
  calcium: { stage: '#6b5b9e', stageDeep: '#5a4b8a', darkDeep: '#493c73' },
  vitaminC: { stage: '#b8551a', stageDeep: '#9f4614', darkDeep: '#853a10' },
  // 열량(면 편) — 청록. 흰 손글씨 머리말과의 대비 4.9:1.
  kcal: { stage: '#1b7c8c', stageDeep: '#166978', darkDeep: '#115562' },
};
const DEFAULT_STAGE = TOPIC_STAGE.sodium!;

export const paperPalette = (topicNutrient: string | null, dark: boolean): PaperPalette => {
  const { darkDeep, ...stage } = (topicNutrient && TOPIC_STAGE[topicNutrient]) || DEFAULT_STAGE;
  return {
    ...BASE,
    ...stage,
    bg: '#f3ead6',
    onBg: '#2a1d18',
    onBgFaint: '#6b5a4f',
    cloth: '#ffffff',
    shadow: SHADOW,
    ...(dark ? { ...DARK, stage: stage.stageDeep, stageDeep: darkDeep } : {}),
  };
};
