import type { ReceiptItemCategoryType } from './schemas/settlement-extraction.js';

// 정산 항목 분류 표시명 — 웹·앱·공유 PNG 공용 단일 소스. 화면마다 사본을 두던
// 시절 '주류/비주류/미분류' 와 '술/음료/기타' 가 섞였다.
export const SETTLEMENT_CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};

// 항목 편집 선택지용 — 기타는 새 행·메뉴 추가의 기본값이라 뜻을 드러내, 술을
// 분류하지 않고 넘어가 안 마신 사람까지 나눠 내는 실수를 줄인다.
export const SETTLEMENT_CATEGORY_OPTION_LABEL: Record<ReceiptItemCategoryType, string> = {
  ...SETTLEMENT_CATEGORY_LABEL,
  UNCATEGORIZED: '기타(모두 나눔)',
};

const NOTE_ITEMS_PER_ROUND = 3;

/**
 * 정산표 하단 '기타' 설명 — 받는 사람이 "기타 500원" 이 무엇인지 항목 이름으로
 * 읽게 한다. 기타 항목이 없으면 null (기타 열도 없다).
 *
 * rounds 는 차수 순서 그대로 — 차수가 여럿이면 기타가 있는 차수에 'N차' 를
 * 붙인다. 표에서 기타 열이 숨는 차수(할인으로 풀 0 등)는 호출부가 items 를 비워
 * 넘긴다. 차수당 이름 3개까지, 나머지는 '외 N개'.
 */
export const uncategorizedNote = (
  rounds: ReadonlyArray<{
    items: ReadonlyArray<{ name: string; category: ReceiptItemCategoryType; amount: number }>;
  }>,
): string | null => {
  const parts: string[] = [];
  rounds.forEach((r, rIdx) => {
    const names = [
      ...new Set(
        r.items
          .filter((it) => it.category === 'UNCATEGORIZED' && it.amount > 0)
          .map((it) => it.name.trim())
          .filter(Boolean),
      ),
    ];
    if (names.length === 0) return;
    const shown = names.slice(0, NOTE_ITEMS_PER_ROUND).join(', ');
    const rest = names.length - NOTE_ITEMS_PER_ROUND;
    const list = rest > 0 ? `${shown} 외 ${rest}개` : shown;
    parts.push(rounds.length > 1 ? `${rIdx + 1}차 ${list}` : list);
  });
  if (parts.length === 0) return null;
  return `기타: ${parts.join(' · ')} — 술·음료·안주 외 항목으로, 참석자 모두가 똑같이 나눕니다.`;
};
