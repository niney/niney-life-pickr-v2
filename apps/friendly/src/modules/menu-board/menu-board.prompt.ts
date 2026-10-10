import type { MenuBoardItemType } from '@repo/api-contract';

// 메뉴판 읽기 프롬프트 — docs/menu-board-ocr-probe.md 에서 검수 정답 20장으로 고른 것 그대로(kimi-k3 F1 99.8%).
// 문구를 바꾸면 pnpm --filter friendly eval:menu-boards 로 다시 잰다.
//
// 뒤의 두 규칙('규칙 보강')이 점수를 가른다 — 없으면 분류 제목 아래 'A 38,000' 을 이름 'A' 로 뽑아 코스끼리 합쳐지고,
// 제목과 떨어진 코스 가격을 놓친다. 구성 요리를 빼라고 하면 코스 사진에서 요리 이름이 사라지고, 말이 없으면 코스
// 가격을 구성 요리마다 붙인다 — 그래서 '가격 없이 따로 넣는다'.
export const MENU_BOARD_PROMPT = `이 사진은 한국 식당의 메뉴판이다. 사진에 적힌 메뉴 항목을 빠짐없이 뽑아 JSON 으로만 답하라.

형식: {"items": [{"name": "메뉴명", "price": "가격 표기" 또는 null, "description": "설명" 또는 null}]}

규칙
- name 은 사진에 적힌 글자 그대로(띄어쓰기·괄호 포함). 번역하거나 고쳐 쓰지 말 것.
- 사진에 없는 메뉴를 지어내지 말 것. 읽기 어려운 글자는 가장 그럴듯하게 읽되 항목을 빼먹지 말 것.
- 분류 제목(식사류, 주류, MENU 등)과 가게 소개 문구는 항목이 아니다.
- 가격은 사진 표기 그대로(예: "10,000", "11.0"). 크기·인분별 가격이 여러 개면 첫 번째만.
- 주류·음료·추가·사리도 메뉴판에 가격과 함께 있으면 항목으로 넣는다.
- 분류 제목 아래 이름이 'A', 'B', '1번'처럼 그것만으로 무엇인지 모르면 분류 제목을 앞에 붙인다(예: "LUNCH COURSE A").
- 코스·세트는 이름과 가격이 떨어져 있어도(이름은 위, 1인 가격은 아래) 코스 이름과 그 가격을 한 항목으로 넣는다.
  코스에 딸린 구성 요리는 price 를 null 로 따로 넣는다(코스 가격을 구성 요리마다 붙이지 말 것).
- 설명 없이 JSON 만 출력.`;

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const itemsOf = (data: unknown): MenuBoardItemType[] | null => {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : null;
  if (!raw) return null;
  const items: MenuBoardItemType[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const name = toText(record.name);
    if (!name) continue;
    items.push({ name, price: toText(record.price), description: toText(record.description) });
  }
  return items;
};

// 응답에서 JSON 을 찾아 items 를 꺼낸다 — 코드 블록·앞뒤 말을 허용하고, 생각을 꺼도 본문에 생각 과정을 쓰고
// '</think>' 뒤에 답을 붙이는 모델(glm 계열)은 그 뒤를 먼저 본다. 못 찾으면 null.
export const parseMenuBoardItems = (text: string): MenuBoardItemType[] | null => {
  const afterThink = text.includes('</think>') ? [text.slice(text.lastIndexOf('</think>') + '</think>'.length)] : [];
  const codeBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1] ?? '');
  for (const candidate of [...afterThink, ...codeBlocks, text]) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const items = itemsOf(JSON.parse(candidate.slice(start, end + 1)));
      if (items) return items;
    } catch {
      // 다음 후보
    }
  }
  return null;
};
