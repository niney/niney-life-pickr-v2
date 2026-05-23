import { Coins } from 'lucide-react';
import type {
  ReceiptItemCategoryType,
  SharedSettlementSessionType,
} from '@repo/api-contract';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '비주류',
  SIDE: '안주',
  UNCATEGORIZED: '미분류',
};

const participantName = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 카드 컴포넌트들은 SharedSettlementSessionType (소유자 식별/영수증 미리보기가
// 빠진 type) 으로 typed — SettlementSessionType 도 구조적 subtyping 으로
// 그대로 전달 가능해서 결과 페이지와 공유 페이지에서 같은 카드를 쓸 수 있다.

export const SessionSummaryCard = ({
  session,
}: {
  session: SharedSettlementSessionType;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <Coins className="size-4" />
        합계
      </CardTitle>
    </CardHeader>
    <CardContent>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">항목 합계</dt>
        <dd className="text-right font-medium">
          {session.itemsSubtotal.toLocaleString('ko-KR')}원
        </dd>
        {session.totalAmount != null && (
          <>
            <dt className="text-muted-foreground">영수증 총액</dt>
            <dd className="text-right">{session.totalAmount.toLocaleString('ko-KR')}원</dd>
          </>
        )}
        <dt className="text-muted-foreground">출처</dt>
        <dd className="text-right">{session.source === 'RECEIPT' ? '영수증' : '직접 입력'}</dd>
        <dt className="text-muted-foreground">생성</dt>
        <dd className="text-right">
          {new Date(session.createdAt).toLocaleString('ko-KR')}
        </dd>
      </dl>
    </CardContent>
  </Card>
);

export const ParticipantsCard = ({
  session,
}: {
  session: SharedSettlementSessionType;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">참여자별 분담</CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="divide-y">
        {session.participants.map((p, idx) => {
          const tags: string[] = [];
          if (p.excludeAlcohol) tags.push('주류 X');
          if (p.excludeNonAlcohol) tags.push('비주류 X');
          if (p.excludeSide) tags.push('안주 X');
          return (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {participantName(p, idx)}
                </div>
                {tags.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    {tags.map((t) => (
                      <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-base font-semibold">
                {p.shareAmount.toLocaleString('ko-KR')}원
              </div>
            </li>
          );
        })}
      </ul>
    </CardContent>
  </Card>
);

export const ItemsCard = ({
  session,
}: {
  session: SharedSettlementSessionType;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">항목 ({session.items.length})</CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="divide-y">
        {session.items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{it.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {CATEGORY_LABEL[it.category]}
                {it.unitPrice != null && it.quantity != null && (
                  <> · {it.unitPrice.toLocaleString('ko-KR')}원 × {it.quantity}</>
                )}
              </div>
            </div>
            <div className="shrink-0 text-sm">{it.amount.toLocaleString('ko-KR')}원</div>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);
