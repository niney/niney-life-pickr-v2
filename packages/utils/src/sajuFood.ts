// 오행 음식 — 타로 메뉴 카탈로그(TAROT_MENU_ITEMS 100종)를 후보 풀로 쓰고 별도 오행 친화도 표를 얹어
// "보완 오행" 에 맞는 메뉴 3개를 결정적으로 고른다. LLM 은 이유만 쓴다(메뉴 타로와 같은 원칙).
// 전통 오행 음식: 목=신맛·푸른 채소, 화=쓴맛·구이·붉은 음식, 토=단맛·곡물·노란 음식, 금=매운맛·흰 음식·닭,
// 수=짠맛·검은 음식·해조류·국물·돼지고기.

import { createSeededRng } from './tarot.js';
import { TAROT_MENU_ITEMS, type TarotMenuItem } from './tarotMenu.js';
import { SAJU_WUXING_META, chartSignature, type SajuChart, type Wuxing } from './saju.js';
import { SAJU_WUXING_LUCKY } from './sajuText.js';

type Affinity = Partial<Record<Wuxing, 1 | 2>>;

export const SAJU_FOOD_WUXING: Record<string, Affinity> = {
  'kimchi-jjigae': { fire: 1, water: 2 }, 'doenjang-jjigae': { earth: 2, water: 1 }, sundubu: { fire: 1, water: 2 },
  'budae-jjigae': { fire: 1, water: 1 }, gamjatang: { earth: 1, water: 2 }, seolleongtang: { water: 2, metal: 1 },
  galbitang: { water: 1, earth: 1 }, samgyetang: { metal: 2, earth: 1 }, yukgaejang: { fire: 2, water: 1 },
  haemultang: { water: 2, fire: 1 }, 'kongnamul-gukbap': { wood: 1, water: 1, metal: 1 }, 'dwaeji-gukbap': { water: 2, earth: 1 },
  'sundae-gukbap': { water: 2 }, ddukguk: { earth: 2, metal: 1 }, 'dak-hanmari': { metal: 2, water: 1 }, jeongol: { wood: 2, water: 1 },
  samgyeopsal: { fire: 1, water: 2 }, galbi: { earth: 2, fire: 1 }, bulgogi: { earth: 1, fire: 1 }, 'dak-galbi': { fire: 2, metal: 1 },
  jeyuk: { fire: 2, water: 1 }, 'ojingeo-bokkeum': { fire: 2, water: 1 }, 'godeungeo-gui': { water: 2, fire: 1 },
  jjimdak: { metal: 1, earth: 1, water: 1 }, 'galbi-jjim': { earth: 2, water: 1 }, agujjim: { fire: 1, water: 2 },
  jokbal: { water: 2, earth: 1 }, bossam: { water: 2, wood: 1 }, pajeon: { water: 1, wood: 1, earth: 1 }, dakbal: { fire: 2, metal: 1 },
  bibimbap: { wood: 2, earth: 1 }, kimbap: { wood: 1, earth: 1 }, 'dolsot-bibimbap': { wood: 1, earth: 1, fire: 1 },
  'kimchi-bokkeumbap': { fire: 1, earth: 1 }, naengmyeon: { water: 2, wood: 1 }, 'bibim-naengmyeon': { fire: 1, wood: 1, water: 1 },
  kalguksu: { earth: 1, water: 1, metal: 1 }, kongguksu: { water: 2, earth: 1 }, makguksu: { wood: 2, water: 1 },
  'janchi-guksu': { metal: 1, water: 1, earth: 1 }, tteokbokki: { fire: 2, earth: 1 }, sundae: { water: 2 }, twigim: { fire: 1, earth: 1 },
  ramyeon: { fire: 1, water: 1 }, jjolmyeon: { fire: 1, wood: 1 }, jjajangmyeon: { earth: 2, water: 1 }, jjamppong: { fire: 2, water: 1 },
  tangsuyuk: { earth: 1, fire: 1 }, 'mapo-tofu': { fire: 2, water: 1 }, 'mala-tang': { fire: 2, water: 1 },
  yangjangpi: { wood: 1, metal: 1, water: 1 }, kkanpunggi: { fire: 1, metal: 1 }, 'bokkeumbap-chinese': { earth: 1, fire: 1 },
  yangkkochi: { fire: 2, earth: 1 }, sushi: { water: 2, metal: 1 }, sashimi: { water: 2 }, ramen: { water: 1, earth: 1, fire: 1 },
  udon: { earth: 1, water: 1, metal: 1 }, soba: { wood: 2, water: 1 }, tonkatsu: { earth: 1, fire: 1, water: 1 }, katsudon: { earth: 1, fire: 1 },
  gyudon: { earth: 2 }, onigiri: { earth: 1, metal: 1, water: 1 }, okonomiyaki: { earth: 1, wood: 1 }, yakitori: { metal: 2, fire: 1 },
  'curry-japanese': { earth: 2, fire: 1 }, 'pasta-tomato': { fire: 2, wood: 1 }, 'pasta-cream': { earth: 1, metal: 1 },
  'pasta-oil': { wood: 1, metal: 1 }, pizza: { fire: 1, earth: 1 }, steak: { earth: 2, fire: 1 }, hamburger: { earth: 1, fire: 1 },
  risotto: { earth: 1, metal: 1 }, 'salad-bowl': { wood: 2 }, sandwich: { wood: 1, earth: 1 }, 'fish-and-chips': { water: 1, fire: 1 },
  'fried-chicken': { metal: 2, fire: 1 }, brunch: { earth: 1, wood: 1, metal: 1 }, pho: { water: 1, wood: 1, earth: 1 },
  'pad-thai': { wood: 1, fire: 1, earth: 1 }, 'bun-cha': { wood: 1, water: 1, fire: 1 }, 'tom-yum': { fire: 2, water: 1, wood: 1 },
  'curry-indian': { fire: 1, earth: 1, metal: 1 }, 'nasi-goreng': { fire: 1, earth: 1 }, 'banh-mi': { wood: 1, earth: 1 },
  'khao-pad': { earth: 1, fire: 1 }, dimsum: { earth: 1, water: 1 }, mandu: { earth: 1, water: 1 }, 'jeon-modum': { earth: 1, wood: 1, water: 1 },
  dakgangjeong: { metal: 1, fire: 1, earth: 1 }, hotdog: { fire: 1, earth: 1 }, toast: { earth: 2 }, 'dak-jjim-andong': { metal: 1, earth: 1, water: 1 },
  gopchang: { fire: 2, earth: 1 }, 'jogae-gui': { water: 2, fire: 1 }, 'hoe-deopbap': { water: 2, wood: 1 }, yukhoe: { earth: 1, water: 1, wood: 1 },
};

export const SAJU_FOOD_PICK_COUNT = 3;

export interface SajuFoodPick {
  item: TarotMenuItem;
  score: number;
  /** 이 메뉴가 맞는 오행(친화도 높은 순). */
  elements: readonly Wuxing[];
}

export interface SajuFoodSelection {
  picks: readonly SajuFoodPick[];
  /** 기준 오행(보완·보조·피할). */
  primary: Wuxing;
  secondary: Wuxing | null;
  avoid: readonly Wuxing[];
  /** 오늘 기준이면 일진 오행. */
  dayElement: Wuxing | null;
  profile: string;
  avoidText: string;
}

const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export interface SelectSajuFoodOptions {
  /** 오늘 일진 오행을 가점(오늘 기준). */
  dayElement?: Wuxing | null;
  /** 시드 보조(날짜 키 등) — 같은 사주라도 날마다 다른 순서. */
  seedSalt?: string;
}

/** 보완 오행 기준 메뉴 3개 — 조리형태·계통이 겹치지 않게. */
export const selectSajuFood = (chart: SajuChart, opts: SelectSajuFoodOptions = {}): SajuFoodSelection => {
  const primary = chart.favorable.primary;
  const secondary = chart.favorable.secondary;
  const avoid = chart.excess.filter((e) => e !== primary && e !== secondary);
  const dayElement = opts.dayElement ?? null;
  const rng = createSeededRng(hashString(`${chartSignature(chart)}|${primary}|${opts.seedSalt ?? ''}`));
  const scored = TAROT_MENU_ITEMS.map((item) => {
    const aff = SAJU_FOOD_WUXING[item.id] ?? {};
    let score = (aff[primary] ?? 0) * 3 + (secondary ? (aff[secondary] ?? 0) * 1.5 : 0);
    for (const e of avoid) score -= (aff[e] ?? 0) * 1;
    if (dayElement) score += (aff[dayElement] ?? 0) * 1;
    score += rng() * 0.75;
    const elements = (Object.keys(aff) as Wuxing[]).sort((a, b) => (aff[b] ?? 0) - (aff[a] ?? 0));
    return { item, score: Math.round(score * 100) / 100, elements };
  });
  scored.sort((a, b) => b.score - a.score);
  const picks: SajuFoodPick[] = [];
  const usedDish = new Set<string>();
  const usedCuisine = new Set<string>();
  for (const c of scored) {
    if (picks.length >= SAJU_FOOD_PICK_COUNT) break;
    if (usedDish.has(c.item.dishType) || usedCuisine.has(c.item.cuisine)) continue;
    picks.push(c);
    usedDish.add(c.item.dishType);
    usedCuisine.add(c.item.cuisine);
  }
  for (const c of scored) {
    if (picks.length >= SAJU_FOOD_PICK_COUNT) break;
    if (!picks.includes(c)) picks.push(c);
  }
  const lucky = SAJU_WUXING_LUCKY[primary];
  const ko = (e: Wuxing): string => SAJU_WUXING_META[e].ko;
  const profile = `${ko(primary)} 기운을 채우는 ${lucky.taste}·${lucky.foods.slice(0, 2).join('·')} 쪽${secondary ? `, 보조로 ${ko(secondary)}` : ''}${dayElement ? ` (오늘 일진 ${ko(dayElement)})` : ''}`;
  const avoidText = avoid.length ? `${avoid.map(ko).join('·')} 기운이 이미 넉넉하니 ${avoid.map((e) => SAJU_WUXING_LUCKY[e].taste).join('·')} 위주는 조금만` : '특별히 피할 기운은 없어요';
  return { picks, primary, secondary, avoid, dayElement, profile, avoidText };
};
