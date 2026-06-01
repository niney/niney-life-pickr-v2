import { Beer, Coins, CupSoda, Pencil, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type {
  ReceiptItemCategoryType,
  SharedSettlementSessionType,
} from '@repo/api-contract';
import { Button } from '~/components/ui/button';
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
}) => {
  // 1차 round 가 대표 — source/식당이 summary 카드의 기준.
  const first = session.rounds[0];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="size-4" />
          합계
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted-foreground">총 합계</dt>
          <dd className="text-right font-medium">
            {session.grandTotal.toLocaleString('ko-KR')}원
          </dd>
          <dt className="text-muted-foreground">차수</dt>
          <dd className="text-right">{session.rounds.length}차</dd>
          {first && (
            <>
              <dt className="text-muted-foreground">1차 출처</dt>
              <dd className="text-right">{first.source === 'RECEIPT' ? '영수증' : '직접 입력'}</dd>
            </>
          )}
          <dt className="text-muted-foreground">생성</dt>
          <dd className="text-right">
            {new Date(session.createdAt).toLocaleString('ko-KR')}
          </dd>
          {session.editedAt && (
            <>
              <dt className="text-muted-foreground">수정됨</dt>
              <dd className="text-right">
                {new Date(session.editedAt).toLocaleString('ko-KR')}
              </dd>
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
};

export const ParticipantsCard = ({
  session,
  onEdit,
}: {
  session: SharedSettlementSessionType;
  // 소유자가 보고 있을 때만 수정 콜백을 넘긴다. SharedSettlementPage 는
  // 비전달 → 버튼 자체가 안 그려진다.
  onEdit?: () => void;
}) => {
  const multiRound = session.rounds.length > 1;
  // round 의 attendees 에서 participantId → 차수별 분담 lookup 만들어 둔다.
  // multiRound 일 때 각 참여자 행 아래에 "1차 12,000 + 2차 8,000" 라인 표시.
  const sharesByParticipant = new Map<string, Array<{ orderIndex: number; amount: number; attended: boolean }>>();
  for (const r of session.rounds) {
    for (const a of r.attendees) {
      const arr = sharesByParticipant.get(a.participantId) ?? [];
      arr.push({ orderIndex: r.orderIndex, amount: a.shareAmount, attended: a.attended });
      sharesByParticipant.set(a.participantId, arr);
    }
  }

  // 참여 축이 "쟁점"인 경우(한 명이라도 제외된 축)에만 배지를 띄운다. 전원 포함이면
  // 구분할 게 없으니 생략. 표시는 제외(X)가 아니라 '참여(양수)' 기준 — 술을 마시는
  // 사람에 🍺 처럼, 결과만 봐도 누가 무엇을 분담했는지 바로 읽힌다. (예: 한 명만
  // 술을 안 마시면, 마시는 사람들에 🍺 가 붙고 안 마시는 사람은 빈칸으로 구분된다.)
  const axisInPlay = {
    alcohol: session.participants.some((p) => p.excludeAlcohol),
    nonAlcohol: session.participants.some((p) => p.excludeNonAlcohol),
    side: session.participants.some((p) => p.excludeSide),
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>참여자별 분담</span>
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={onEdit}
            >
              <Pencil className="size-3" />
              수정
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {session.participants.map((p, idx) => {
            const tags: Array<{ icon: LucideIcon; label: string }> = [];
            if (axisInPlay.alcohol && !p.excludeAlcohol) tags.push({ icon: Beer, label: '술' });
            if (axisInPlay.nonAlcohol && !p.excludeNonAlcohol)
              tags.push({ icon: CupSoda, label: '음료' });
            if (axisInPlay.side && !p.excludeSide)
              tags.push({ icon: UtensilsCrossed, label: '안주' });
            const perRound = sharesByParticipant.get(p.id) ?? [];
            return (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {participantName(p, idx)}
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                      {tags.map((t) => (
                        <span
                          key={t.label}
                          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"
                        >
                          <t.icon className="size-3" />
                          {t.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {multiRound && perRound.length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {perRound
                        .sort((a, b) => a.orderIndex - b.orderIndex)
                        .map((r) =>
                          r.attended
                            ? `${r.orderIndex + 1}차 ${r.amount.toLocaleString('ko-KR')}원`
                            : `${r.orderIndex + 1}차 불참`,
                        )
                        .join(' · ')}
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
};

// 차수별 항목 카드. 차수가 1개여도 동일 컴포넌트로 표시되어 일관성 유지.
export const RoundItemsCard = ({
  round,
  total,
}: {
  round: SharedSettlementSessionType['rounds'][number];
  total: number;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center justify-between text-base">
        <span>
          {total > 1 ? `${round.orderIndex + 1}차 · ` : ''}
          {round.restaurantName}
        </span>
        <span className="text-sm font-normal text-muted-foreground">
          {round.itemsSubtotal.toLocaleString('ko-KR')}원
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {round.source === 'RECEIPT' ? '영수증' : '직접 입력'}
        {round.totalAmount != null && (
          <> · 영수증 총액 {round.totalAmount.toLocaleString('ko-KR')}원</>
        )}
        {' · 항목 '}
        {round.items.length}개
      </div>
      <ul className="divide-y">
        {round.items.map((it) => (
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
        {round.discountAmount != null && round.discountCategory != null && (
          <li className="flex items-center justify-between gap-2 py-2 text-emerald-700 dark:text-emerald-400">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">할인</div>
              <div className="mt-0.5 text-xs opacity-80">
                {CATEGORY_LABEL[round.discountCategory]} 풀에서 차감
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold">
              −{round.discountAmount.toLocaleString('ko-KR')}원
            </div>
          </li>
        )}
      </ul>
    </CardContent>
  </Card>
);
