import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { calculateMultiRoundShares, type SharedSettlementSessionType } from '@repo/api-contract';
import { formatThousands } from '../../lib/html.js';
import {
  CARD_MAX_PARTICIPANT_ROWS,
  CARD_MAX_PIXELS,
  CARD_MAX_TABLE_WIDTH,
  buildSettlementCardTree,
  cardScale,
  isCardTruncated,
  renderSettlementCardPng,
} from './settlement-card.js';

// 정산 공유 카드 상한(perf-2 F-V2) — 계약 상한(참여자 100·차수 10·항목 200)을 그대로 그리면 5초·픽스맵 70MB 였다.
// 앞 30명 + '외 n명' 합계 행, 넓으면 차수 소계만, 래스터 면적 상한. 예전 크기 카드는 그대로.

const CATS = ['SIDE', 'ALCOHOL', 'NON_ALCOHOL', 'UNCATEGORIZED'] as const;

// 참여자 P · 차수 R · 차수당 항목 I — 분담은 계산기로 채워 화면 정산표와 같은 숫자.
function makeSession(P: number, R: number, I: number): SharedSettlementSessionType {
  const participants = Array.from({ length: P }, (_, i) => ({
    id: `p${i}`,
    name: `사람${i}`,
    nickname: null,
    excludeAlcohol: i % 5 === 4,
    excludeNonAlcohol: false,
    excludeSide: false,
    shareAmount: 0,
    orderIndex: i,
    contactId: null,
  }));
  const rounds = Array.from({ length: R }, (_, r) => {
    const items = Array.from({ length: I }, (_, k) => ({
      id: `r${r}i${k}`,
      name: `메뉴${k}`,
      unitPrice: 10000 + k * 500,
      quantity: 1,
      amount: 10000 + k * 500,
      category: CATS[k % CATS.length]!,
      matchedMenuName: null,
      orderIndex: k,
    }));
    const subtotal = items.reduce((s, it) => s + it.amount, 0);
    return {
      id: `r${r}`,
      orderIndex: r,
      restaurantPlaceId: `place${r}`,
      restaurantName: `${r + 1}번째 가게`,
      source: 'MANUAL' as const,
      totalAmount: subtotal,
      warning: null,
      itemsSubtotal: subtotal,
      discountAmount: null,
      discountCategory: null,
      categoryAdjustments: null,
      groupSplits: null,
      items,
      attendees: participants.map((p, i) => ({
        participantId: p.id,
        attended: r === 0 || i % (r + 1) !== 1,
        excludeAlcoholOverride: null,
        excludeNonAlcoholOverride: null,
        excludeSideOverride: null,
        shareAmount: 0,
      })),
    };
  });
  const calc = calculateMultiRoundShares({
    participantCount: P,
    rounds: rounds.map((r) => ({
      items: r.items.map((it) => ({ amount: it.amount, category: it.category })),
      attendees: r.attendees
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.attended)
        .map(({ i }) => ({
          participantIndex: i,
          excludeAlcohol: participants[i]!.excludeAlcohol,
          excludeNonAlcohol: false,
          excludeSide: false,
        })),
    })),
  });
  participants.forEach((p, i) => (p.shareAmount = calc.perParticipant[i] ?? 0));
  return {
    id: 's',
    restaurantPlaceId: 'place0',
    restaurantName: '테스트 식당',
    grandTotal: calc.grandTotal,
    rounds,
    participants,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
    editedAt: null,
  };
}

type VNode = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const kids = (n: VNode): VNode[] => (Array.isArray(n.props.children) ? (n.props.children as VNode[]) : []);
const textOf = (n: VNode): string => (typeof n.props.children === 'string' ? n.props.children : '');
// 루트 → [제목, 부제, 표, (기타 설명), 브랜드]. 표 → 행들, 행 → 칸들.
const tableRows = (session: SharedSettlementSessionType) => {
  const { node, width } = buildSettlementCardTree(session);
  const table = kids(node as VNode)[2]!;
  return { rows: kids(table), tableWidth: table.props.style!.width as number, width };
};
const cellTexts = (row: VNode) => kids(row).map(textOf);

describe('settlement card 상한', () => {
  it(`참여자 ${CARD_MAX_PARTICIPANT_ROWS}명 이하·좁은 표는 예전 그대로(카테고리 열·전원 행)`, () => {
    const { rows, tableWidth } = tableRows(makeSession(7, 1, 8));
    expect(rows).toHaveLength(2 + 7 + 1); // 헤더 2 + 참여자 + 합계
    expect(rows.flatMap(cellTexts).some((t) => t.startsWith('외 '))).toBe(false);
    expect(cellTexts(rows[1]!)).toEqual(expect.arrayContaining(['안주', '술', '음료', '기타', '소계']));
    expect(tableWidth).toBe(40 + 140 + 4 * 74 + 84 + 96);
  });

  it(`${CARD_MAX_PARTICIPANT_ROWS}명을 넘으면 앞 ${CARD_MAX_PARTICIPANT_ROWS}명 + '외 n명' 합계 행 — 보이는 행과 합하면 총계`, () => {
    const session = makeSession(35, 1, 8);
    const { rows } = tableRows(session);
    expect(rows).toHaveLength(2 + CARD_MAX_PARTICIPANT_ROWS + 1 + 1);
    const rest = rows[2 + CARD_MAX_PARTICIPANT_ROWS]!;
    expect(cellTexts(rest)[1]).toBe('외 5명');
    const hidden = session.participants.slice(CARD_MAX_PARTICIPANT_ROWS).reduce((s, p) => s + p.shareAmount, 0);
    expect(cellTexts(rest).at(-1)).toBe(formatThousands(hidden));
    const shown = session.participants.slice(0, CARD_MAX_PARTICIPANT_ROWS).reduce((s, p) => s + p.shareAmount, 0);
    expect(shown + hidden).toBe(session.grandTotal);
    expect(cellTexts(rows.at(-1)!).at(-1)).toBe(formatThousands(session.grandTotal));
    // 부제는 전체 인원.
    const { node } = buildSettlementCardTree(session);
    expect(textOf(kids(node as VNode)[1]!)).toContain('35명');
  });

  it(`카테고리 열까지 펼친 폭이 ${CARD_MAX_TABLE_WIDTH}px 을 넘으면 차수 소계만(머리글은 말줄임)`, () => {
    const { rows, tableWidth } = tableRows(makeSession(12, 10, 8));
    expect(tableWidth).toBeLessThanOrEqual(CARD_MAX_TABLE_WIDTH);
    expect(rows.flatMap(cellTexts)).not.toContain('안주');
    const headA = kids(rows[0]!).slice(1, -1);
    expect(headA).toHaveLength(10);
    expect(headA.every((c) => c.props.style!.textOverflow === 'ellipsis')).toBe(true);
    expect(cellTexts(rows[1]!).filter((t) => t === '소계')).toHaveLength(10);
  });

  it('계약 상한 크기(100명×10차×200항목)도 면적 상한 안에서 그린다', async () => {
    const png = await renderSettlementCardPng(makeSession(100, 10, 200));
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width! * meta.height!).toBeLessThanOrEqual(CARD_MAX_PIXELS);
  });

  it('배율 — 예전 규칙(폭별 2·1.5·1배)을 지키고 면적이 넘칠 때만 낮춘다', () => {
    expect(cardScale(704, 612)).toBe(1.5);
    expect(cardScale(500, 400)).toBe(2);
    expect(cardScale(1200, 900)).toBe(1);
    const s = cardScale(600, 2000);
    expect(600 * s * 2000 * s).toBeLessThanOrEqual(CARD_MAX_PIXELS + 1);
    expect(s).toBeLessThan(2);
  });

  it('og:image 를 기본 이미지로 돌릴 큰 정산 판정', () => {
    expect(isCardTruncated(CARD_MAX_PARTICIPANT_ROWS)).toBe(false);
    expect(isCardTruncated(CARD_MAX_PARTICIPANT_ROWS + 1)).toBe(true);
  });
});
