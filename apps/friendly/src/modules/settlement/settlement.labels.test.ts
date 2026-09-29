import { describe, expect, it } from 'vitest';
import { uncategorizedNote, type ReceiptItemCategoryType } from '@repo/api-contract';

// 정산표 하단 '기타' 설명 — 웹·앱 정산표와 공유 PNG 가 같은 문구를 쓴다.
// 받는 사람이 "기타" 가 무엇인지 항목 이름으로 읽게 하는 게 목적이라, 이름
// 나열 규칙(차수 표기·중복·개수 상한)과 "기타 없으면 설명도 없음" 이 계약이다.

const item = (name: string, category: ReceiptItemCategoryType, amount = 1000) => ({
  name,
  category,
  amount,
});

const TAIL = ' — 술·음료·안주 외 항목으로, 참석자 모두가 똑같이 나눕니다.';

describe('uncategorizedNote', () => {
  it('기타 항목이 없으면 null', () => {
    expect(uncategorizedNote([{ items: [item('소주', 'ALCOHOL'), item('삼겹살', 'SIDE')] }])).toBeNull();
  });

  it('차수가 하나면 차수 표기 없이 항목 이름만', () => {
    expect(
      uncategorizedNote([{ items: [item('소주', 'ALCOHOL'), item('공기밥', 'UNCATEGORIZED')] }]),
    ).toBe(`기타: 공기밥${TAIL}`);
  });

  it('여러 차수면 기타가 있는 차수에만 N차를 붙인다', () => {
    expect(
      uncategorizedNote([
        { items: [item('공기밥', 'UNCATEGORIZED')] },
        { items: [item('맥주', 'ALCOHOL')] },
        { items: [item('라면', 'UNCATEGORIZED'), item('김밥', 'UNCATEGORIZED')] },
      ]),
    ).toBe(`기타: 1차 공기밥 · 3차 라면, 김밥${TAIL}`);
  });

  it('같은 이름은 한 번만, 0원·빈 이름은 빼고, 차수당 3개 넘으면 외 N개', () => {
    expect(
      uncategorizedNote([
        {
          items: [
            item('공기밥', 'UNCATEGORIZED'),
            item('공기밥', 'UNCATEGORIZED'),
            item('서비스', 'UNCATEGORIZED', 0),
            item('  ', 'UNCATEGORIZED'),
            item('라면', 'UNCATEGORIZED'),
            item('김밥', 'UNCATEGORIZED'),
            item('계란찜', 'UNCATEGORIZED'),
            item('볶음밥', 'UNCATEGORIZED'),
          ],
        },
      ]),
    ).toBe(`기타: 공기밥, 라면, 김밥 외 2개${TAIL}`);
  });
});
