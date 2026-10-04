import {
  SETTLEMENT_CATEGORY_LABEL,
  calculateMultiRoundShares,
  effectiveExcludes,
  toGroupCalcInputs,
  uncategorizedNote,
  type ReceiptItemCategoryType,
  type SharedSettlementSessionType,
} from '@repo/api-contract';
import { formatThousands } from '../../lib/html.js';
import { loadPlexOnlyFonts } from '../../lib/share-fonts.js';
import { loadSatori, svgToPng, type SatoriNode } from '../../lib/share-render.js';

// 공유 정산을 카카오톡 등에 '이미지'로 바로 보내기 위한 정산표 PNG 렌더.
//
// 화면의 정산표(SettlementBreakdownTable)와 동일한 매트릭스 — 행=참여자,
// 열=(차수 × 사용된 카테고리 + 차수 소계) + 총계, 하단 합계 행 — 를 satori
// (레이아웃→SVG) + resvg(SVG→PNG) 로 서버에서 렌더한다. 웹·앱이 같은 URL 을
// 소비하므로 플랫폼 간 결과가 100% 동일하고, 받는 사람은 클릭/로그인 없이 본다.
//
// satori 는 display:table 이 없어, 모든 셀을 고정폭 flex 박스로 깔아 격자를
// 만든다(열 너비 합이 행마다 같아 세로선이 정렬된다). 분담 계산은 화면의
// useMatrix 와 동일하게 calculateMultiRoundShares 로 재현한다.
//
// 폰트: 한글 글리프 커버를 위해 IBM Plex Sans KR(Regular/Bold) ttf 를 번들.
// satori 는 system 폰트를 못 쓰므로 ttf 버퍼를 명시 주입해야 한다(lib/share-fonts 가
// 프로세스 수명 동안 1회 읽는다).
//
// 카드 상한(perf-2 F-V2): 계약은 참여자 100·차수 10·차수당 항목 200 까지 받는데, 그대로
// 그리면 100명×10차가 satori+래스터 5초·픽스맵 70MB 였고 받는 사람도 읽을 수 없다.
// 참여자는 앞 CARD_MAX_PARTICIPANT_ROWS 명 + '외 n명' 합계 행, 카테고리 열까지 펼친 폭이
// CARD_MAX_TABLE_WIDTH 를 넘으면 차수마다 소계 열만, 래스터는 CARD_MAX_PIXELS 면적까지.
// 전체 정산표는 공유 페이지(웹·앱)에서 그대로 본다.

/** 카드에 이름으로 그리는 참여자 수 — 넘으면 나머지는 '외 n명' 한 행으로 합친다. */
export const CARD_MAX_PARTICIPANT_ROWS = 30;
/** 카테고리 열까지 펼친 표 폭(px) 상한 — 넘으면 차수마다 소계 열만 그린다. */
export const CARD_MAX_TABLE_WIDTH = 1600;
/** 래스터 면적 상한(px²) — 넘으면 배율을 낮춘다. */
export const CARD_MAX_PIXELS = 4_000_000;

const participantLabel = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// ── 매트릭스 계산 (apps/web SettlementBreakdownTable 의 useMatrix 포팅) ────────
// 영수증에 흔한 순서 — 안주 → 술 → 음료 → 기타.
const CATEGORY_ORDER: ReceiptItemCategoryType[] = [
  'SIDE',
  'ALCOHOL',
  'NON_ALCOHOL',
  'UNCATEGORIZED',
];

interface RoundMatrix {
  restaurantName: string;
  categories: ReceiptItemCategoryType[];
  cells: Array<Partial<Record<ReceiptItemCategoryType, number>>>; // [pIdx][cat]
  rowSubtotals: number[]; // [pIdx]
  columnTotals: Partial<Record<ReceiptItemCategoryType, number>>;
  grandSubtotal: number;
  attendedMap: Record<string, boolean>; // participantId → attended
}

interface Matrix {
  participants: SharedSettlementSessionType['participants'];
  rounds: RoundMatrix[];
  grandTotal: number;
}

function computeMatrix(
  session: SharedSettlementSessionType,
  participants: SharedSettlementSessionType['participants'],
): Matrix {
  const pIdxById = new Map(participants.map((p, i) => [p.id, i]));

  const calc = calculateMultiRoundShares({
    participantCount: participants.length,
    rounds: session.rounds.map((r) => ({
      items: r.items.map((it) => ({ amount: it.amount, category: it.category })),
      attendees: r.attendees
        .filter((a) => a.attended)
        .map((a) => {
          const idx = pIdxById.get(a.participantId) ?? 0;
          const master = participants[idx]!;
          const eff = effectiveExcludes(master, a);
          return { participantIndex: idx, ...eff };
        }),
      discount:
        r.discountAmount != null && r.discountCategory != null
          ? { amount: r.discountAmount, category: r.discountCategory }
          : null,
      categoryAdjustments: r.categoryAdjustments
        ? Object.fromEntries(
            Object.entries(r.categoryAdjustments)
              .filter(([, v]) => v != null)
              .map(([cat, v]) => [
                cat,
                {
                  leftoverParticipantIndexes: v!.leftoverParticipantIds
                    .map((id) => pIdxById.get(id) ?? -1)
                    .filter((idx) => idx >= 0),
                  roundUnit: v!.roundUnit,
                },
              ]),
          )
        : null,
      groups: toGroupCalcInputs(r.groupSplits, pIdxById),
    })),
  });

  const rounds: RoundMatrix[] = session.rounds.map((r, rIdx) => {
    const rc = calc.perRound[rIdx]!;
    const categories = CATEGORY_ORDER.filter(
      (c) => (rc.poolBreakdown[c]?.poolAmount ?? 0) > 0,
    );
    const cells = participants.map((_, pIdx) => {
      const row: Partial<Record<ReceiptItemCategoryType, number>> = {};
      for (const c of categories) row[c] = rc.perCategoryShares[c]?.[pIdx] ?? 0;
      return row;
    });
    const rowSubtotals = participants.map((_, pIdx) => rc.shareAmounts[pIdx] ?? 0);
    const columnTotals: Partial<Record<ReceiptItemCategoryType, number>> = {};
    for (const c of categories) columnTotals[c] = rc.poolBreakdown[c]?.poolAmount ?? 0;
    const attendedMap: Record<string, boolean> = {};
    for (const a of r.attendees) attendedMap[a.participantId] = a.attended;

    return {
      restaurantName: r.restaurantName,
      categories,
      cells,
      rowSubtotals,
      columnTotals,
      grandSubtotal: rc.itemsSubtotal,
      attendedMap,
    };
  });

  return { participants, rounds, grandTotal: calc.grandTotal };
}

// ── 렌더 ──────────────────────────────────────────────────────────────────

// satori 는 React 엘리먼트 또는 동형의 VDOM 객체를 받는다. JSX 없이 쓰기 위해
// { type, props } 객체를 직접 만드는 작은 헬퍼.
type Node = { type: string; props: Record<string, unknown> };
const h = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): Node => ({ type, props: { style, ...(children !== undefined ? { children } : {}) } });

const C = {
  text: '#1c1917',
  sub: '#78716c',
  faint: 'rgba(120,113,108,0.4)',
  line: '#e7e5e4',
  line2: '#d6d3d1',
  head: '#f5f5f4', // 헤더/합계 행 muted 배경
  subBg: '#fafaf9', // 소계 컬럼 light
  subBg2: '#efedea', // 소계 컬럼(합계 행)
  amount: '#92400e', // amber-800
  amountBg: '#fffbeb', // amber-50
  amountBg2: '#fde9c8', // 총계(합계 행)
  brand: '#a8a29e',
  white: '#ffffff',
};

const SEQ_W = 40;
const NAME_W = 140;
const CAT_W = 74;
const SUB_W = 84;
const TOTAL_W = 96;
const HROW = 38; // 헤더 행 높이
const ROW = 40; // 본문/합계 행 높이
const PAD = 24;

// 카드 상한 모드('외 n명'·소계만)에서만 쓰는 폭. 예전 크기 카드는 위 고정 폭 그대로(픽셀 동일).
/** 소계만 그릴 때 소계 열 최소 폭 — 머리글 'N차 · 식당…' 이 말줄임으로라도 읽히게. */
const COMPACT_SUB_W = 112;
// 숫자 칸 폭 — 굵은 Plex 숫자·쉼표는 19px 에서 글자당 약 10.3px(0.54em, 실측). 오른쪽 정렬이라 오른쪽 여백 8 + 여유 4.
// 합계 행 값이 그 열의 최댓값이라 그것으로 잰다.
const fitNumW = (v: number, min: number): number =>
  Math.max(min, Math.ceil(formatThousands(v).length * 19 * 0.56) + 12);

type CellOpt = {
  h?: number;
  align?: 'left' | 'right' | 'center';
  fs?: number;
  fw?: number;
  color?: string;
  bg?: string;
  borderLeft?: 1 | 2;
  // 넘치는 글자를 '…' 로(satori 는 왼쪽 정렬일 때만 맞게 자른다).
  ellipsis?: boolean;
};

const cell = (content: unknown, w: number, o: CellOpt = {}): Node =>
  h(
    'div',
    {
      display: 'flex',
      flexShrink: 0,
      width: w,
      height: o.h ?? ROW,
      alignItems: 'center',
      justifyContent:
        o.align === 'right'
          ? 'flex-end'
          : o.align === 'center'
            ? 'center'
            : 'flex-start',
      paddingLeft: 8,
      paddingRight: 8,
      fontSize: o.fs ?? 19,
      fontWeight: o.fw ?? 400,
      color: o.color ?? C.text,
      backgroundColor: o.bg ?? 'transparent',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      ...(o.ellipsis ? { textOverflow: 'ellipsis' } : {}),
      ...(o.borderLeft
        ? {
            borderLeftWidth: o.borderLeft === 2 ? 2 : 1,
            borderLeftStyle: 'solid',
            borderLeftColor: o.borderLeft === 2 ? C.line2 : C.line,
          }
        : {}),
    },
    content,
  );

const rowBox = (
  cells: Node[],
  o: { borderBottom?: boolean; borderTop?: boolean } = {},
): Node =>
  h(
    'div',
    {
      display: 'flex',
      flexDirection: 'row',
      ...(o.borderBottom
        ? { borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.line }
        : {}),
      ...(o.borderTop
        ? { borderTopWidth: 2, borderTopStyle: 'solid', borderTopColor: C.line2 }
        : {}),
    },
    cells,
  );

function buildTable(session: SharedSettlementSessionType): {
  node: Node;
  width: number;
  note: string | null;
} {
  const participants = [...session.participants].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  // 분담 계산은 숨기는 참여자까지 전원으로 해야 금액이 화면 정산표와 같다.
  const m = computeMatrix(session, participants);
  const multi = m.rounds.length > 1;

  // 이름으로 그릴 참여자(앞쪽 N명)와 '외 n명' 으로 합칠 나머지.
  const shownCount = Math.min(participants.length, CARD_MAX_PARTICIPANT_ROWS);
  const restIdx = participants.slice(shownCount).map((_, i) => shownCount + i);
  const truncated = restIdx.length > 0;

  // 열 폭 — 예전 크기 카드는 고정 폭, '외 n명' 카드는 합계 금액이 잘리지 않게 넓힌다.
  const catW = (r: RoundMatrix, c: ReceiptItemCategoryType): number =>
    truncated ? fitNumW(r.columnTotals[c] ?? 0, CAT_W) : CAT_W;
  const fullSubW = (r: RoundMatrix): number => (truncated ? fitNumW(r.grandSubtotal, SUB_W) : SUB_W);
  const fullTotalW = truncated ? fitNumW(m.grandTotal, TOTAL_W) : TOTAL_W;
  const fullWidth =
    SEQ_W +
    NAME_W +
    m.rounds.reduce((s, r) => s + r.categories.reduce((a, c) => a + catW(r, c), 0) + fullSubW(r), 0) +
    fullTotalW;
  // 너무 넓으면 카테고리 열을 접고 차수 소계만 — 소계 열이 차수 구분선(굵은 왼쪽 선)을 맡는다.
  const compact = fullWidth > CARD_MAX_TABLE_WIDTH;
  const catsOf = (r: RoundMatrix): ReceiptItemCategoryType[] => (compact ? [] : r.categories);
  const subW = (r: RoundMatrix): number => (compact ? fitNumW(r.grandSubtotal, COMPACT_SUB_W) : fullSubW(r));
  const totalW = compact ? fitNumW(m.grandTotal, TOTAL_W) : fullTotalW;
  const subBorder = compact ? 2 : 1;
  const groupW = (r: RoundMatrix): number => catsOf(r).reduce((a, c) => a + catW(r, c), 0) + subW(r);
  const tableWidth = compact ? SEQ_W + NAME_W + m.rounds.reduce((s, r) => s + subW(r), 0) + totalW : fullWidth;

  // 헤더 행 A — 차수 그룹(식당명) + 총계. 소계만 그리면 칸이 좁아 왼쪽 정렬 + 말줄임.
  const headA = rowBox([
    cell('', SEQ_W + NAME_W, { h: HROW, bg: C.head }),
    ...m.rounds.map((r, rIdx) =>
      cell((multi ? `${rIdx + 1}차 · ` : '') + r.restaurantName, groupW(r), {
        h: HROW,
        align: compact ? 'left' : 'center',
        ellipsis: compact,
        bg: C.head,
        fw: 700,
        fs: 17,
        borderLeft: 2,
      }),
    ),
    cell('총계', totalW, {
      h: HROW,
      align: 'center',
      bg: C.amountBg,
      color: C.amount,
      fw: 700,
      fs: 17,
      borderLeft: 2,
    }),
  ]);

  // 헤더 행 B — 연번/이름 + (카테고리…/소계)×차수 + (총계 빈칸).
  const headB = rowBox(
    [
      cell('연번', SEQ_W, { h: HROW, align: 'center', color: C.sub, fs: 15 }),
      cell('이름', NAME_W, { h: HROW, color: C.sub, fs: 15 }),
      ...m.rounds.flatMap((r) => [
        ...catsOf(r).map((c, j) =>
          cell(SETTLEMENT_CATEGORY_LABEL[c], catW(r, c), {
            h: HROW,
            align: 'right',
            color: C.sub,
            fs: 15,
            borderLeft: j === 0 ? 2 : 1,
          }),
        ),
        cell('소계', subW(r), {
          h: HROW,
          align: 'right',
          fw: 700,
          fs: 15,
          bg: C.subBg,
          borderLeft: subBorder,
        }),
      ]),
      cell('', totalW, { h: HROW, bg: C.amountBg, borderLeft: 2 }),
    ],
    { borderBottom: true },
  );

  // 본문 행 — 참여자별(앞쪽 N명).
  const bodyRows = participants.slice(0, shownCount).map((p, pIdx) =>
    rowBox(
      [
        cell(String(pIdx + 1), SEQ_W, { align: 'center', color: C.sub, fs: 17 }),
        cell(participantLabel(p, pIdx), NAME_W, { fw: 600 }),
        ...m.rounds.flatMap((r) => {
          const attended = r.attendedMap[p.id] ?? false;
          return [
            ...catsOf(r).map((c, j) => {
              const v = r.cells[pIdx]?.[c] ?? 0;
              return cell(attended && v > 0 ? formatThousands(v) : '', catW(r, c), {
                align: 'right',
                borderLeft: j === 0 ? 2 : 1,
                color: v === 0 ? C.faint : C.text,
              });
            }),
            cell(attended ? formatThousands(r.rowSubtotals[pIdx] ?? 0) : '—', subW(r), {
              align: 'right',
              fw: 700,
              bg: C.subBg,
              borderLeft: subBorder,
              color: attended ? C.text : C.faint,
            }),
          ];
        }),
        cell(formatThousands(p.shareAmount), totalW, {
          align: 'right',
          fw: 700,
          bg: C.amountBg,
          color: C.amount,
          borderLeft: 2,
        }),
      ],
      { borderBottom: true },
    ),
  );

  // '외 n명' 행 — 숨긴 참여자의 칸별 합(비참석 칸은 계산기가 0 을 준다). 보이는 행 + 이 행 = 합계 행.
  const sumRest = (pick: (pIdx: number) => number): number => restIdx.reduce((s, i) => s + pick(i), 0);
  const attendedAt = (r: RoundMatrix, i: number): boolean => r.attendedMap[participants[i]!.id] ?? false;
  const restRows = !truncated
    ? []
    : [
        rowBox(
          [
            cell('', SEQ_W),
            cell(`외 ${restIdx.length}명`, NAME_W, { fw: 600, color: C.sub }),
            ...m.rounds.flatMap((r) => [
              ...catsOf(r).map((c, j) => {
                const v = sumRest((i) => (attendedAt(r, i) ? (r.cells[i]?.[c] ?? 0) : 0));
                return cell(v > 0 ? formatThousands(v) : '', catW(r, c), {
                  align: 'right',
                  borderLeft: j === 0 ? 2 : 1,
                  color: C.sub,
                });
              }),
              cell(formatThousands(sumRest((i) => (attendedAt(r, i) ? (r.rowSubtotals[i] ?? 0) : 0))), subW(r), {
                align: 'right',
                fw: 700,
                bg: C.subBg,
                borderLeft: subBorder,
                color: C.sub,
              }),
            ]),
            cell(formatThousands(sumRest((i) => participants[i]!.shareAmount)), totalW, {
              align: 'right',
              fw: 700,
              bg: C.amountBg,
              color: C.amount,
              borderLeft: 2,
            }),
          ],
          { borderBottom: true },
        ),
      ];

  // 합계 행.
  const footRow = rowBox(
    [
      cell('', SEQ_W, { bg: C.head }),
      cell('계', NAME_W, { fw: 700, bg: C.head }),
      ...m.rounds.flatMap((r) => [
        ...catsOf(r).map((c, j) =>
          cell(formatThousands(r.columnTotals[c] ?? 0), catW(r, c), {
            align: 'right',
            fw: 700,
            bg: C.head,
            borderLeft: j === 0 ? 2 : 1,
          }),
        ),
        cell(formatThousands(r.grandSubtotal), subW(r), {
          align: 'right',
          fw: 700,
          bg: C.subBg2,
          borderLeft: subBorder,
        }),
      ]),
      cell(formatThousands(m.grandTotal), totalW, {
        align: 'right',
        fw: 700,
        bg: C.amountBg2,
        color: C.amount,
        borderLeft: 2,
      }),
    ],
    { borderTop: true },
  );

  const table = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: tableWidth,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: C.line,
      borderRadius: 8,
      overflow: 'hidden',
    },
    [headA, headB, ...bodyRows, ...restRows, footRow],
  );

  // 기타 열 설명 — 웹·앱 정산표와 같은 규칙(열이 숨는 차수는 항목을 비워 넘긴다).
  // 카톡으로 받는 사람은 이 이미지만 보므로 여기에 가장 필요하다. 소계만 그리면 기타 열도 없다.
  const note = uncategorizedNote(
    session.rounds.map((r, i) => {
      const mr = m.rounds[i];
      return { items: mr && catsOf(mr).includes('UNCATEGORIZED') ? r.items : [] };
    }),
  );

  return { node: table, width: tableWidth, note };
}

/** 카드 VDOM(satori 입력) — 렌더와 같은 트리. 테스트가 행·열 구성을 확인할 때도 쓴다. */
export function buildSettlementCardTree(session: SharedSettlementSessionType): {
  node: Node;
  width: number;
} {
  const { node: table, width: tableWidth, note } = buildTable(session);
  const n = session.participants.length;
  const subtitle = `총 ${formatThousands(session.grandTotal)}원 · ${n}명`;
  const contentWidth = Math.max(tableWidth, 320);

  const root = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: contentWidth + PAD * 2,
      padding: PAD,
      backgroundColor: C.white,
      fontFamily: 'Plex',
    },
    [
      h(
        'div',
        { display: 'flex', fontSize: 28, fontWeight: 700, color: C.text },
        `${session.restaurantName} 정산`,
      ),
      h(
        'div',
        { display: 'flex', marginTop: 4, marginBottom: 14, fontSize: 18, color: C.sub },
        subtitle,
      ),
      table,
      ...(note
        ? [
            h(
              'div',
              { display: 'flex', marginTop: 10, fontSize: 16, lineHeight: 1.45, color: C.sub },
              `* ${note}`,
            ),
          ]
        : []),
      h(
        'div',
        {
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 12,
          fontSize: 16,
          color: C.brand,
          fontWeight: 600,
        },
        'Life Pickr',
      ),
    ],
  );

  return { node: root, width: contentWidth + PAD * 2 };
}

/** 카드가 정산 전체를 다 싣지 못하는지(참여자를 '외 n명' 으로 접는지) — 큰 정산은 og:image 를 기본 이미지로 돌린다. */
export const isCardTruncated = (participantCount: number): boolean =>
  participantCount > CARD_MAX_PARTICIPANT_ROWS;

/** 폭 배율 — 넓은 표는 2x 가 과하고, 면적이 CARD_MAX_PIXELS 를 넘으면 그 안으로 낮춘다. */
export const cardScale = (width: number, height: number): number => {
  // 표가 넓을수록 2x 는 과해진다 — 폭에 따라 스케일을 낮춰 PNG 크기를 억제하되
  // 좁은 표는 또렷하게.
  const scale = width > 900 ? 1 : width > 640 ? 1.5 : 2;
  const area = width * scale * height * scale;
  return area > CARD_MAX_PIXELS ? Math.sqrt(CARD_MAX_PIXELS / (width * height)) : scale;
};

// satori SVG 루트의 height(내용 높이) — `<svg width=".." height=".." ...>`.
const svgHeight = (svg: string): number =>
  Number(/\sheight="([\d.]+)"/.exec(svg.slice(0, svg.indexOf('>')))?.[1] ?? 0);

export async function renderSettlementCardPng(
  session: SharedSettlementSessionType,
): Promise<Buffer> {
  const fonts = await loadPlexOnlyFonts();
  const satori = await loadSatori();
  const { node, width } = buildSettlementCardTree(session);

  // height 미지정 → satori 가 내용 높이를 자동 계산(참여자/차수 많아도 안 잘림).
  const svg = await satori(node as unknown as SatoriNode, { width, fonts });

  const scale = cardScale(width, svgHeight(svg));
  return svgToPng(svg, {
    fitTo: { mode: 'width', value: Math.round(width * scale) },
    background: C.white,
  });
}
