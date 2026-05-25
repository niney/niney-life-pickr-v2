import { useMemo } from 'react';
import {
  calculateMultiRoundShares,
  effectiveExcludes,
  type ReceiptItemCategoryType,
  type SharedSettlementSessionType,
} from '@repo/api-contract';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

interface Props {
  session: SharedSettlementSessionType;
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};

// 표시 순서. 영수증에 흔한 순서대로 — 안주 → 술 → 음료 → 기타.
const CATEGORY_ORDER: ReceiptItemCategoryType[] = [
  'SIDE',
  'ALCOHOL',
  'NON_ALCOHOL',
  'UNCATEGORIZED',
];

// 연번 컬럼 폭 — table cell 에서 Tailwind w-12 가 콘텐츠 기반 폭에 무시되는
// 경우가 있어 inline style 로 width + minWidth 둘 다 강제. left-12 (= 48px)
// 와 매칭되어야 이름 컬럼 시작점과 정확히 붙는다. 두 자리 연번(예: 27)도
// 여유 있게 들어가는 폭.
const SEQ_COL_STYLE = { width: 48, minWidth: 48 } as const;

const participantLabel = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 정산표 — 행 = 마스터 참여자, 열 = (차수 × 사용된 카테고리 + 차수 소계) × N차 + 총계.
// 하단에 합계 행. 이름/총계/합계 행은 sticky 로 가로 스크롤 시에도 보이게.
//
// 사용 카테고리만 컬럼 노출 — UNCATEGORIZED 가 한 번도 안 쓰였으면 전 차수에서
// 컬럼 자체가 빠진다. 차수마다 어떤 카테고리가 있었는지가 달라도 OK
// (차수별로 컬럼이 다름).
//
// 데이터는 calculateMultiRoundShares 의 perRound[].perCategoryShares 를 매트릭스로
// 그대로 전개. 비참석/제외자는 0 — 시각상 빈 셀로 표시.
export const SettlementBreakdownTable = ({ session }: Props) => {
  const matrix = useMatrix(session);

  if (matrix.rounds.length === 0 || matrix.participants.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">정산표</CardTitle>
      </CardHeader>
      {/* CardContent 의 좌우 패딩 제거 — 표 전체가 카드 가장자리까지 가도록.
          overflow-x-auto 가 표 폭을 카드 안에서 가로 스크롤로 처리. */}
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th
                  className="sticky left-0 z-20 bg-background px-2 py-1.5 text-left font-medium"
                  style={SEQ_COL_STYLE}
                >
                  연번
                </th>
                <th className="sticky left-12 z-20 bg-background px-2 py-1.5 text-left font-medium">
                  이름
                </th>
                {matrix.rounds.map((r, rIdx) => (
                  <th
                    key={r.id}
                    colSpan={r.categories.length + 1}
                    className="border-l bg-muted/30 px-2 py-1.5 text-center font-medium text-foreground"
                  >
                    {matrix.rounds.length > 1 ? `${rIdx + 1}차 · ` : ''}
                    {r.restaurantName}
                  </th>
                ))}
                <th className="sticky right-0 z-20 border-l bg-amber-50 px-2 py-1.5 text-right font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  총계
                </th>
              </tr>
              <tr className="border-b text-muted-foreground">
                <th
                  className="sticky left-0 z-20 bg-background"
                  style={SEQ_COL_STYLE}
                />
                <th className="sticky left-12 z-20 bg-background" />
                {matrix.rounds.flatMap((r) => [
                  ...r.categories.map((c) => (
                    <th
                      key={`${r.id}-${c}`}
                      className="border-l px-2 py-1 text-right font-medium"
                    >
                      {CATEGORY_LABEL[c]}
                    </th>
                  )),
                  <th
                    key={`${r.id}-subtotal`}
                    className="border-l bg-muted/20 px-2 py-1 text-right font-semibold text-foreground"
                  >
                    소계
                  </th>,
                ])}
                <th className="sticky right-0 z-20 border-l bg-amber-50 dark:bg-amber-950" />
              </tr>
            </thead>
            <tbody>
              {matrix.participants.map((p, pIdx) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td
                    className="sticky left-0 z-10 bg-background px-2 py-1 text-muted-foreground"
                    style={SEQ_COL_STYLE}
                  >
                    {pIdx + 1}
                  </td>
                  <td className="sticky left-12 z-10 truncate bg-background px-2 py-1 font-medium">
                    {participantLabel(p, pIdx)}
                  </td>
                  {matrix.rounds.flatMap((r) => {
                    const attended = r.attendedMap[p.id] ?? false;
                    return [
                      ...r.categories.map((c) => {
                        const v = r.cells[pIdx]?.[c] ?? 0;
                        return (
                          <td
                            key={`${p.id}-${r.id}-${c}`}
                            className={cn(
                              'border-l px-2 py-1 text-right',
                              v === 0 && 'text-muted-foreground/40',
                            )}
                          >
                            {attended && v > 0 ? v.toLocaleString('ko-KR') : ''}
                          </td>
                        );
                      }),
                      <td
                        key={`${p.id}-${r.id}-subtotal`}
                        className={cn(
                          'border-l bg-muted/20 px-2 py-1 text-right font-semibold',
                          !attended && 'text-muted-foreground/40',
                        )}
                      >
                        {attended ? (r.rowSubtotals[pIdx] ?? 0).toLocaleString('ko-KR') : '—'}
                      </td>,
                    ];
                  })}
                  <td className="sticky right-0 z-10 border-l bg-amber-50 px-2 py-1 text-right font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    {p.shareAmount.toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 border-t-2 bg-background font-semibold">
                <td
                  className="sticky left-0 z-20 bg-background px-2 py-1.5"
                  style={SEQ_COL_STYLE}
                />
                <td className="sticky left-12 z-20 bg-background px-2 py-1.5">계</td>
                {matrix.rounds.flatMap((r) => [
                  ...r.categories.map((c) => (
                    <td
                      key={`foot-${r.id}-${c}`}
                      className="border-l px-2 py-1.5 text-right"
                    >
                      {(r.columnTotals[c] ?? 0).toLocaleString('ko-KR')}
                    </td>
                  )),
                  <td
                    key={`foot-${r.id}-subtotal`}
                    className="border-l bg-muted/30 px-2 py-1.5 text-right"
                  >
                    {r.grandSubtotal.toLocaleString('ko-KR')}
                  </td>,
                ])}
                <td className="sticky right-0 z-20 border-l bg-amber-100 px-2 py-1.5 text-right font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-50">
                  {matrix.grandTotal.toLocaleString('ko-KR')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

interface RoundMatrix {
  id: string;
  orderIndex: number;
  restaurantName: string;
  // 이 차수에서 풀이 0 보다 큰 카테고리만 (UNCATEGORIZED 도 풀 0 이면 숨김).
  categories: ReceiptItemCategoryType[];
  // [pIdx] → { category: amount }
  cells: Array<Partial<Record<ReceiptItemCategoryType, number>>>;
  // [pIdx] → 차수 소계
  rowSubtotals: number[];
  // category → 풀 amount (열 합계, fallback 케이스도 동일 값)
  columnTotals: Partial<Record<ReceiptItemCategoryType, number>>;
  // 차수 전체 (소계 컬럼의 합계 행)
  grandSubtotal: number;
  // participantId → 참석 여부
  attendedMap: Record<string, boolean>;
}

interface SettlementMatrix {
  participants: SharedSettlementSessionType['participants'];
  rounds: RoundMatrix[];
  grandTotal: number;
}

const useMatrix = (session: SharedSettlementSessionType): SettlementMatrix =>
  useMemo(() => {
    // session 의 attendees 는 participantId(db) 로 참조. master 인덱스로
    // 매핑해 calculator 입력 구성.
    const pIdxById = new Map(session.participants.map((p, i) => [p.id, i]));

    const calc = calculateMultiRoundShares({
      participantCount: session.participants.length,
      rounds: session.rounds.map((r) => ({
        items: r.items.map((it) => ({ amount: it.amount, category: it.category })),
        attendees: r.attendees
          .filter((a) => a.attended)
          .map((a) => {
            const idx = pIdxById.get(a.participantId) ?? 0;
            const master = session.participants[idx]!;
            const eff = effectiveExcludes(master, a);
            return { participantIndex: idx, ...eff };
          }),
      })),
    });

    const rounds: RoundMatrix[] = session.rounds.map((r, rIdx) => {
      const rc = calc.perRound[rIdx]!;
      // 사용된 카테고리: poolAmount > 0 인 것만, 정의된 순서로.
      const categories = CATEGORY_ORDER.filter(
        (c) => (rc.poolBreakdown[c]?.poolAmount ?? 0) > 0,
      );
      // 각 행의 카테고리별 분담 + 소계.
      const cells = session.participants.map((_, pIdx) => {
        const row: Partial<Record<ReceiptItemCategoryType, number>> = {};
        for (const c of categories) {
          row[c] = rc.perCategoryShares[c]?.[pIdx] ?? 0;
        }
        return row;
      });
      const rowSubtotals = session.participants.map(
        (_, pIdx) => rc.shareAmounts[pIdx] ?? 0,
      );
      const columnTotals: Partial<Record<ReceiptItemCategoryType, number>> = {};
      for (const c of categories) {
        columnTotals[c] = rc.poolBreakdown[c]?.poolAmount ?? 0;
      }
      const attendedMap: Record<string, boolean> = {};
      for (const a of r.attendees) attendedMap[a.participantId] = a.attended;

      return {
        id: r.id,
        orderIndex: r.orderIndex,
        restaurantName: r.restaurantName,
        categories,
        cells,
        rowSubtotals,
        columnTotals,
        grandSubtotal: rc.itemsSubtotal,
        attendedMap,
      };
    });

    return {
      participants: session.participants,
      rounds,
      grandTotal: calc.grandTotal,
    };
  }, [session]);
