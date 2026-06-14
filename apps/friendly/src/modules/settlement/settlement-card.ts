import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import {
  calculateMultiRoundShares,
  effectiveExcludes,
  toGroupCalcInputs,
  type ReceiptItemCategoryType,
  type SharedSettlementSessionType,
} from '@repo/api-contract';

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
// satori 는 system 폰트를 못 쓰므로 ttf 버퍼를 명시 주입해야 한다.

const __dirname = dirname(fileURLToPath(import.meta.url));

// dev(tsx, src 직접 실행) 와 prod(tsup 번들, dist) 모두에서 assets/fonts 를
// 찾도록 __dirname/cwd 에서 위로 올라가며 후보를 만든다. (share-preview 와 동일 전략)
function fontCandidates(file: string): string[] {
  const seen = new Set<string>();
  for (const base of [__dirname, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      seen.add(resolve(cur, 'apps/friendly/assets/fonts', file));
      seen.add(resolve(cur, 'assets/fonts', file));
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return [...seen];
}

async function readFirst(file: string): Promise<Buffer> {
  const tried = fontCandidates(file);
  for (const p of tried) {
    try {
      return await readFile(p);
    } catch {
      // 다음 후보
    }
  }
  throw new Error(`폰트를 찾지 못함: ${file} (tried ${tried.length} paths)`);
}

// 폰트는 프로세스 수명 동안 1회만 읽어 캐시.
let fontsPromise: Promise<{ regular: Buffer; bold: Buffer }> | null = null;
function loadFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFirst('IBMPlexSansKR-Regular.ttf'),
      readFirst('IBMPlexSansKR-Bold.ttf'),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontsPromise;
}

function formatWon(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

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

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};
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

type CellOpt = {
  h?: number;
  align?: 'left' | 'right' | 'center';
  fs?: number;
  fw?: number;
  color?: string;
  bg?: string;
  borderLeft?: 1 | 2;
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
} {
  const participants = [...session.participants].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const m = computeMatrix(session, participants);
  const multi = m.rounds.length > 1;

  const tableWidth =
    SEQ_W +
    NAME_W +
    m.rounds.reduce((s, r) => s + r.categories.length * CAT_W + SUB_W, 0) +
    TOTAL_W;

  // 헤더 행 A — 차수 그룹(식당명) + 총계.
  const headA = rowBox([
    cell('', SEQ_W + NAME_W, { h: HROW, bg: C.head }),
    ...m.rounds.map((r, rIdx) =>
      cell((multi ? `${rIdx + 1}차 · ` : '') + r.restaurantName, r.categories.length * CAT_W + SUB_W, {
        h: HROW,
        align: 'center',
        bg: C.head,
        fw: 700,
        fs: 17,
        borderLeft: 2,
      }),
    ),
    cell('총계', TOTAL_W, {
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
        ...r.categories.map((c, j) =>
          cell(CATEGORY_LABEL[c], CAT_W, {
            h: HROW,
            align: 'right',
            color: C.sub,
            fs: 15,
            borderLeft: j === 0 ? 2 : 1,
          }),
        ),
        cell('소계', SUB_W, {
          h: HROW,
          align: 'right',
          fw: 700,
          fs: 15,
          bg: C.subBg,
          borderLeft: 1,
        }),
      ]),
      cell('', TOTAL_W, { h: HROW, bg: C.amountBg, borderLeft: 2 }),
    ],
    { borderBottom: true },
  );

  // 본문 행 — 참여자별.
  const bodyRows = participants.map((p, pIdx) =>
    rowBox(
      [
        cell(String(pIdx + 1), SEQ_W, { align: 'center', color: C.sub, fs: 17 }),
        cell(participantLabel(p, pIdx), NAME_W, { fw: 600 }),
        ...m.rounds.flatMap((r) => {
          const attended = r.attendedMap[p.id] ?? false;
          return [
            ...r.categories.map((c, j) => {
              const v = r.cells[pIdx]?.[c] ?? 0;
              return cell(attended && v > 0 ? formatWon(v) : '', CAT_W, {
                align: 'right',
                borderLeft: j === 0 ? 2 : 1,
                color: v === 0 ? C.faint : C.text,
              });
            }),
            cell(attended ? formatWon(r.rowSubtotals[pIdx] ?? 0) : '—', SUB_W, {
              align: 'right',
              fw: 700,
              bg: C.subBg,
              borderLeft: 1,
              color: attended ? C.text : C.faint,
            }),
          ];
        }),
        cell(formatWon(p.shareAmount), TOTAL_W, {
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

  // 합계 행.
  const footRow = rowBox(
    [
      cell('', SEQ_W, { bg: C.head }),
      cell('계', NAME_W, { fw: 700, bg: C.head }),
      ...m.rounds.flatMap((r) => [
        ...r.categories.map((c, j) =>
          cell(formatWon(r.columnTotals[c] ?? 0), CAT_W, {
            align: 'right',
            fw: 700,
            bg: C.head,
            borderLeft: j === 0 ? 2 : 1,
          }),
        ),
        cell(formatWon(r.grandSubtotal), SUB_W, {
          align: 'right',
          fw: 700,
          bg: C.subBg2,
          borderLeft: 1,
        }),
      ]),
      cell(formatWon(m.grandTotal), TOTAL_W, {
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
    [headA, headB, ...bodyRows, footRow],
  );

  return { node: table, width: tableWidth };
}

function buildTree(session: SharedSettlementSessionType): {
  node: Node;
  width: number;
} {
  const { node: table, width: tableWidth } = buildTable(session);
  const n = session.participants.length;
  const subtitle = `총 ${formatWon(session.grandTotal)}원 · ${n}명`;
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

export async function renderSettlementCardPng(
  session: SharedSettlementSessionType,
): Promise<Buffer> {
  const { regular, bold } = await loadFonts();
  const { node, width } = buildTree(session);

  // height 미지정 → satori 가 내용 높이를 자동 계산(참여자/차수 많아도 안 잘림).
  const svg = await satori(node as never, {
    width,
    fonts: [
      { name: 'Plex', data: regular, weight: 400, style: 'normal' },
      { name: 'Plex', data: bold, weight: 700, style: 'normal' },
    ],
  });

  // 표가 넓을수록 2x 는 과해진다 — 폭에 따라 스케일을 낮춰 PNG 크기를 억제하되
  // 좁은 표는 또렷하게.
  const scale = width > 900 ? 1 : width > 640 ? 1.5 : 2;
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: Math.round(width * scale) },
    background: C.white,
  });
  return Buffer.from(resvg.render().asPng());
}
