import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import { useSettlementDraftStore, type DraftRound } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

// 차수 할인 입력 — Step3 / Step4 두 곳에서 같은 형태로 사용. 할인 없으면
// '+ 할인 추가' 버튼 하나, 추가 후엔 카테고리 셀렉트 + 금액 + 삭제 버튼.
// 풀 초과 시 인라인 빨간 메시지. 저장은 zod refine 이 한 번 더 막는다.

const CATEGORIES: ReceiptItemCategoryType[] = [
  'ALCOHOL',
  'NON_ALCOHOL',
  'SIDE',
  'UNCATEGORIZED',
];

// 정산표/결과 페이지와 통일된 라벨 (술/음료/안주/기타).
const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};

interface Props {
  round: DraftRound;
}

export const RoundDiscountEditor = ({ round }: Props) => {
  const setRoundDiscount = useSettlementDraftStore((s) => s.setRoundDiscount);

  // 카테고리별 풀. 활성화 상태에서 카테고리 옆에 풀 금액을 같이 보여 사용자가
  // 한도를 파악할 수 있게.
  const pools = useMemo(() => {
    const p: Record<ReceiptItemCategoryType, number> = {
      ALCOHOL: 0,
      NON_ALCOHOL: 0,
      SIDE: 0,
      UNCATEGORIZED: 0,
    };
    for (const it of round.items) {
      p[it.category] += it.amount;
    }
    return p;
  }, [round.items]);

  const active = round.discountAmount != null && round.discountCategory != null;

  if (!active) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          setRoundDiscount(round.clientId, { amount: 0, category: 'SIDE' })
        }
      >
        + 할인 추가
      </Button>
    );
  }

  const category = round.discountCategory!;
  const amount = round.discountAmount!;
  const pool = pools[category];
  const exceeded = amount > pool;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">할인</span>
        <select
          value={category}
          onChange={(e) =>
            setRoundDiscount(round.clientId, {
              amount,
              category: e.target.value as ReceiptItemCategoryType,
            })
          }
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]} ({pools[c].toLocaleString('ko-KR')}원)
            </option>
          ))}
        </select>
        <Input
          type="number"
          inputMode="numeric"
          value={amount === 0 ? '' : amount}
          placeholder="0"
          aria-invalid={exceeded ? true : undefined}
          className="h-9 w-28"
          onChange={(e) => {
            const v = e.target.value;
            const n = v === '' ? 0 : Math.max(0, Number(v) || 0);
            setRoundDiscount(round.clientId, { amount: n, category });
          }}
        />
        <span className="text-xs text-muted-foreground">원</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="할인 삭제"
          onClick={() => setRoundDiscount(round.clientId, null)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {exceeded && (
        <p className="text-xs text-destructive">
          {CATEGORY_LABEL[category]} 풀({pool.toLocaleString('ko-KR')}원)을 초과합니다.
        </p>
      )}
      {amount === 0 && !exceeded && (
        <p className="text-xs text-muted-foreground">
          금액을 입력하거나 삭제하세요.
        </p>
      )}
    </div>
  );
};
