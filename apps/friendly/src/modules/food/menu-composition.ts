// 메뉴 구성 읽기 — 식당 메뉴 한 줄(이름 + 설명)에 적힌 구성을 뽑는다: 코스·세트의 음식 나열과, 그중 하나를 고르는 묶음(택1).
//
// 메뉴 칼로리 엔진·세트 분해(menu-llm-decompose)는 메뉴 **이름**만 본다. "이 코스(2인이상)"처럼 식당마다 다른 이름은 이름만으로는
// 알 수 없지만 구성은 설명에 적혀 있다("춘권샐러드 + 유산슬 + 칠리새우 + 탕수육 + (짜장,짬뽕 택1)"). 설명은 대부분 홍보 문구라
// 규칙으로는 못 가른다 — 읽는 것은 LLM 이 하고(menu-composition.service), 이 파일은 물어볼 메뉴를 고르는 것·답을 믿을지
// 정하는 것만 한다(순수 함수). 숫자(열량)는 여기서도 LLM 이 만들지 않는다 — 구성 음식을 카탈로그에서 찾는다.

import { createHash } from 'node:crypto';
import { normalizeTerm } from '../../lib/text.js';
import { DEFAULT_LEXICON } from './engine/lexicon.js';

// v1: 최초 — 적힌 음식만, 재료·홍보 문구는 구성 아님, 택1 은 선택지가 적혀 있을 때만, 맛·크기 고르기 제외.
export const MENU_COMPOSITION_VERSION = 1;

export interface MenuChoice {
  /** 그 묶음이 무엇인지("식사") — 적혀 있지 않으면 null. */
  label: string | null;
  options: string[];
}

export interface MenuComposition {
  /** 정해진 구성 음식(적힌 차례). */
  fixed: string[];
  /** 고르는 묶음 — 묶음마다 하나만 먹는다. */
  choices: MenuChoice[];
}

export interface CompositionOutput {
  fixed: string[];
  choices: { label: string | null; options: string[] }[];
  confidence: 'high' | 'medium' | 'low';
  reason: string | null;
}

const MAX_FIXED = 10;
const MAX_CHOICES = 3;
const MAX_OPTIONS = 6;
const TEXT_MAX = 400;

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** 캐시 키 — 같은 글(이름 + 설명)이면 식당이 달라도(체인점) 한 번만 묻는다. */
export const compositionKey = (name: string, description: string | null | undefined): string =>
  createHash('sha256')
    .update(`${squash(name)}\n${squash(description ?? '').slice(0, TEXT_MAX)}`)
    .digest('hex');

// 설명의 '+' 나열 — 양쪽에 글자가 있어야 한다("1+1"·"++" 등급은 아니다).
const PLUS_RE = /[\p{L})）]\s*\+\s*[\p{L}(（]/u;
// 고르기 표식.
const PICK_RE = /택\s*[1일]|[1일]\s*택|중\s*택|\bor\b|또는/i;
// "…로 구성", "…포함" — 나열 기호와 함께 있을 때만.
const LIST_WORD_RE = /구성|포함/;
const LIST_SEP_RE = /[,，、·•/]/;
// 이름에 대안이 적힌 것("함흥냉면(비빔/물)", "물,비빔냉면").
const NAME_ALT_RE = /\p{L}\s*[,/]\s*\p{L}/u;
// 이름의 대안처럼 보이지만 음식 고르기가 아닌 것 — 온도·크기.
const NAME_NOT_FOOD_RE = /\b(hot|ice|iced|cold)\b|[소중대]\s*[,/]\s*[소중대]|[SML]\s*[,/]\s*[SML]/i;
// 이름 앞뒤의 표식("[NEW/순살]", "(NEW/순살)")은 이름이 아니다.
const TAG_RE = /\[[^\]]*\]|【[^】]*】|[（(]\s*(new|best|hot|신메뉴|추천|인기)[^)）]*[)）]/gi;

/**
 * 물어볼 만한 메뉴인가 — 설명이나 이름에 구성·고르기의 표식이 있을 때만(LLM 호출을 아낀다).
 * 운영 메뉴 7,005개(2026-11-14): 설명이 있는 것 4,178개 가운데 대부분은 "깊고 진한 국물…" 같은 홍보 문구라 표식이 없다.
 */
export const isCompositionCandidate = (name: string, description: string | null | undefined): boolean => {
  const desc = squash(description ?? '');
  if (desc) {
    if (PLUS_RE.test(desc) || PICK_RE.test(desc)) return true;
    if (LIST_WORD_RE.test(desc) && LIST_SEP_RE.test(desc)) return true;
  }
  const bare = name.replace(TAG_RE, ' ');
  if (PICK_RE.test(bare)) return true;
  return NAME_ALT_RE.test(bare) && !NAME_NOT_FOOD_RE.test(bare);
};

export const parseCompositionOutput = (text: string): CompositionOutput | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const conf = o['confidence'];
    if (conf !== 'high' && conf !== 'medium' && conf !== 'low') return null;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const choices = Array.isArray(o['choices'])
      ? (o['choices'] as unknown[]).flatMap((c) => {
          if (typeof c !== 'object' || c === null) return [];
          const g = c as Record<string, unknown>;
          return [{ label: typeof g['label'] === 'string' ? g['label'] : null, options: strings(g['options']) }];
        })
      : [];
    return {
      fixed: strings(o['fixed']),
      choices,
      confidence: conf,
      reason: typeof o['reason'] === 'string' ? o['reason'] : null,
    };
  } catch {
    return null;
  }
};

// 구성 하나는 짧은 음식명 — 숫자·기호가 섞였으면 수량·중량을 못 뗀 것이다.
const PART_OK_RE = /^[\p{L}\s]{2,15}$/u;
const LABEL_OK_RE = /^[\p{L}\s]{1,8}$/u;

// 선택지가 음식이 아니라 묶음·종류의 이름인 것("요리코스 또는 스시코스", "식사류") — 고를 음식이 적힌 것이 아니다.
const NON_FOOD_OPTION_RE = /(코스|세트|메뉴|종류|.{2}류)$/u;
// 코스의 차례·범주를 가리키는 말 — 무엇이 나오는지는 적히지 않았다(엔진의 범주어 목록에 없는 것만).
const NOT_A_FOOD: ReadonlySet<string> = new Set(
  [
    '애피타이저', '에피타이저', '전채', '전채요리', '메인', '메인요리', '메인메뉴', '디저트', '후식', '식사', '식사류',
    '밑반찬', '기본반찬', '스끼다시', '해산물', '해물', '야채', '채소', '특수부위', '음료수',
  ].map(normalizeTerm),
);
// 음식 이름 앞뒤에 붙는 꾸밈말 — 이것만으로는 그 음식이 글에 적혔다고 볼 수 없다.
const MODIFIER_RE = /반반|모둠|모듬/g;
// 묶음의 이름("다복정식", "커플세트", "낙지한상", "스낵박스") — 음식 이름이 아니다.
const SET_NAME_RE = /(세트|셋트|set|정식|한상|코스|박스|플래터)$/i;
// 그 가운데 다른 음식과 나란히 구성으로 적혔을 때 내용을 알 수 없는 것("반반세트 + 막국수"). 정식·한상은 음식 이름으로도 쓴다.
const SET_PART_RE = /(세트|셋트|set|코스|박스)$/i;
// 둘 이상 고르는 것("택2", "2가지 선택", "중 선택2") — 하나만 고르는 묶음으로는 담을 수 없다.
const MULTI_PICK_RE = /택\s*[2-9]|[2-9]\s*택|선택\s*[2-9]|[2-9]\s*(가지|개|종|종류)\s*(를\s*)?(선택|택|고르)|중\s*[2-9]\s*(가지|개|종)/;

/**
 * 그 음식이 글에 적혀 있는가 — LLM 이 지어낸 찬·사이드를 걸러 낸다. 줄임말을 편 이름("짜장" → 짜장면, "비빔/물" → 물냉면,
 * "함박" → 함박스테이크)은 글자 그대로는 없으므로, 이름의 절반 이상(2자 이상)이 이어서 글에 있거나 이름의 앞 2자 이상이
 * 글에 있으면 적힌 것으로 본다.
 */
const isGrounded = (part: string, sourceNorm: string): boolean => {
  const norm = normalizeTerm(part);
  if (!norm) return false;
  if (sourceNorm.includes(norm)) return true;
  const need = Math.max(2, Math.ceil(norm.length / 2));
  for (let len = norm.length - 1; len >= need; len -= 1) {
    for (let at = 0; at + len <= norm.length; at += 1) {
      if (sourceNorm.includes(norm.slice(at, at + len))) return true;
    }
  }
  for (let len = need - 1; len >= 2; len -= 1) {
    if (sourceNorm.includes(norm.slice(0, len))) return true;
  }
  return false;
};

/** 채택 규칙 — 채택되면 정리한 구성, 아니면 null. 순수 함수. */
export const decideComposition = (
  out: CompositionOutput,
  source: { name: string; description: string | null | undefined },
): MenuComposition | null => {
  // high 만 — 세트 분해 실측(2026-09-03)에서 medium 은 지어낸 찬이 섞였다.
  if (out.confidence !== 'high') return null;
  const sourceText = `${source.name} ${source.description ?? ''}`;
  const sourceNorm = normalizeTerm(sourceText);
  // 'skip' = 빼도 구성이 틀려지지 않는 것(범주어), 'bad' = 믿을 수 없는 것(수량이 섞였거나 글에 없는 이름).
  const check = (raw: string): { name: string; key: string } | 'skip' | 'bad' => {
    const name = squash(raw);
    const key = normalizeTerm(name);
    if (!key) return 'skip';
    // 범주어(고기·야채·음료·찌개·애피타이저)는 음식이 아니다 — 무엇인지 적히지 않았으니 넣을 것도 없다.
    if (DEFAULT_LEXICON.suffixBlock.has(key) || NOT_A_FOOD.has(key)) return 'skip';
    // 꾸밈말만 글에 있고 음식 이름은 지어낸 것("반반세트" → 반반치킨)을 거르려고, 꾸밈말을 뗀 나머지가 글에 있는지 본다.
    const core = key.replace(MODIFIER_RE, '');
    if (!core) return 'skip';
    if (!PART_OK_RE.test(name)) return 'bad';
    if (!isGrounded(core, sourceNorm)) return 'bad';
    return { name, key };
  };

  // 고르는 묶음부터 — 같은 음식을 고정 구성에도 적었으면("황도, 계절과일 + 택1[계절과일 | 과자]") 고르는 쪽이 맞다.
  const seen = new Set<string>();
  const choices: MenuChoice[] = [];
  if (!MULTI_PICK_RE.test(sourceText)) {
    for (const group of out.choices.slice(0, MAX_CHOICES)) {
      const options: string[] = [];
      const keys = new Set<string>();
      for (const raw of group.options.slice(0, MAX_OPTIONS)) {
        const part = check(raw);
        if (part === 'skip' || part === 'bad' || NON_FOOD_OPTION_RE.test(part.name)) continue;
        if (seen.has(part.key) || keys.has(part.key)) continue;
        keys.add(part.key);
        options.push(part.name);
      }
      // 선택지가 하나만 남으면 고르기가 아니다 — 무엇을 버렸는지 모르니 그 묶음은 쓰지 않는다.
      if (options.length < 2) continue;
      for (const key of keys) seen.add(key);
      const label = group.label ? squash(group.label) : '';
      choices.push({ label: LABEL_OK_RE.test(label) ? label : null, options });
    }
  }

  const ownKey = normalizeTerm(source.name.replace(TAG_RE, ' ').replace(/[（(][^)）]*[)）]/g, ' '));
  const fixed: string[] = [];
  for (const raw of out.fixed) {
    const part = check(raw);
    if (part === 'skip') continue;
    // 구성 하나를 못 믿으면 나머지만 남긴 구성도 틀린다("닭도리탕 + 옛날통닭" 에서 고쳐 쓴 이름을 버리면 통닭만 남는다)
    // — 통째로 쓰지 않는다. 그 메뉴는 이제까지처럼 메뉴 한 줄로 들어간다.
    if (part === 'bad') return null;
    if (seen.has(part.key)) continue;
    if (SET_NAME_RE.test(part.name)) {
      // 묶음의 이름은 음식이 아니다. 그 메뉴 자신의 이름("다복정식")을 구성에 끼워 넣은 것이면 그것만 빼고,
      // 구성 가운데 하나가 묶음이면("반반세트 + 막국수") 무엇이 든 것인지 모르니 통째로 쓰지 않는다.
      if (part.key === ownKey) continue;
      if (SET_PART_RE.test(part.name)) return null;
    }
    seen.add(part.key);
    fixed.push(part.name);
  }
  if (fixed.length > MAX_FIXED) return null;
  if (fixed.length === 0 && choices.length === 0) return null;
  return { fixed, choices };
};

/** 저장된 JSON → 구성. 깨졌거나 비었으면 null("물어봤고 구성 없음"). */
export const parseStoredComposition = (json: string): MenuComposition | null => {
  try {
    const v = JSON.parse(json) as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const o = v as { fixed?: unknown; choices?: unknown };
    const fixed = Array.isArray(o.fixed) ? o.fixed.filter((x): x is string => typeof x === 'string') : [];
    const choices = Array.isArray(o.choices)
      ? o.choices.flatMap((c): MenuChoice[] => {
          if (typeof c !== 'object' || c === null) return [];
          const g = c as { label?: unknown; options?: unknown };
          const options = Array.isArray(g.options) ? g.options.filter((x): x is string => typeof x === 'string') : [];
          return options.length >= 2 ? [{ label: typeof g.label === 'string' ? g.label : null, options }] : [];
        })
      : [];
    return fixed.length === 0 && choices.length === 0 ? null : { fixed, choices };
  } catch {
    return null;
  }
};
