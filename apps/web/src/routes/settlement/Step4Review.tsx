import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Save, Loader2, Coins } from 'lucide-react';
import {
  calculateShares,
  type ReceiptItemCategoryType,
} from '@repo/api-contract';
import {
  ApiError,
  useCreateSettlement,
  useSettlementDraftStore,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

interface Props {
  placeId: string;
  onBack: () => void;
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '비주류',
  SIDE: '안주',
  UNCATEGORIZED: '미분류',
};

const participantName = (p: { name: string | null; nickname: string | null }, idx: number) => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 마지막 단계 — 분배 계산 결과 미리보기 + 저장. 클라이언트에서도 동일한
// calculateShares 를 호출해 서버 라운드트립 없이 보여준다. 저장은 server 가
// 다시 한 번 계산해 권위 있는 값으로 만든다 (클라이언트 변조 방지).
export const Step4Review = ({ placeId, onBack }: Props) => {
  const draft = useSettlementDraftStore();
  const create = useCreateSettlement();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const calc = useMemo(
    () =>
      calculateShares({
        items: draft.items.map((it) => ({ amount: it.amount, category: it.category })),
        participants: draft.participants.map((p) => ({
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
        })),
      }),
    [draft.items, draft.participants],
  );

  const handleSave = async () => {
    setError(null);
    if (!draft.source) {
      setError('입력 방식이 결정되지 않았습니다.');
      return;
    }
    try {
      const saved = await create.mutateAsync({
        restaurantPlaceId: placeId,
        source: draft.source,
        totalAmount: draft.totalAmount,
        warning: draft.warning,
        receiptImageToken: draft.receiptImageToken,
        items: draft.items.map((it) => ({
          name: it.name,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          amount: it.amount,
          category: it.category,
          matchedMenuName: it.matchedMenuName,
        })),
        participants: draft.participants.map((p) => ({
          name: p.name?.trim() || null,
          nickname: p.nickname?.trim() || null,
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
          // 자동완성에서 골랐을 때 hint 로 같이 전송. 서버는 어차피 정규화 키로
          // 다시 매칭하지만 의도 명시 + 추후 서버 확장 여지.
          ...(p.contactId ? { contactId: p.contactId } : {}),
        })),
      });
      // 저장 성공 — draft 정리하고 결과 페이지로.
      draft.reset();
      navigate(`/restaurants/${placeId}/settle/${saved.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  const subtotalMismatch =
    draft.source === 'RECEIPT' &&
    draft.totalAmount != null &&
    Math.abs(calc.itemsSubtotal - draft.totalAmount) >= 1;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">분배 결과</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          참여자별 분담액입니다. 저장하면 이력으로 남아 나중에 다시 볼 수 있어요.
        </p>
      </div>

      {(draft.warning || subtotalMismatch) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {draft.warning && <p>{draft.warning}</p>}
            {subtotalMismatch && (
              <p>
                항목 합계 {calc.itemsSubtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
                {draft.totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
              </p>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4" />
            참여자별 분담
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {draft.participants.map((p, idx) => {
              const tags: string[] = [];
              if (p.excludeAlcohol) tags.push('주류 X');
              if (p.excludeNonAlcohol) tags.push('비주류 X');
              if (p.excludeSide) tags.push('안주 X');
              return (
                <li
                  key={p.clientId}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {participantName(p, idx)}
                    </div>
                    {tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-muted px-1.5 py-0.5"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-base font-semibold">
                    {(calc.shareAmounts[idx] ?? 0).toLocaleString('ko-KR')}원
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">총 합계</span>
            <span className="font-semibold">
              {calc.itemsSubtotal.toLocaleString('ko-KR')}원
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <button
              type="button"
              className="w-full text-left text-base font-semibold"
              onClick={() => setBreakdownOpen((v) => !v)}
            >
              카테고리별 풀 상세 {breakdownOpen ? '▴' : '▾'}
            </button>
          </CardTitle>
        </CardHeader>
        {breakdownOpen && (
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(
                ['ALCOHOL', 'NON_ALCOHOL', 'SIDE', 'UNCATEGORIZED'] as ReceiptItemCategoryType[]
              ).map((c) => {
                const b = calc.poolBreakdown[c];
                if (b.poolAmount === 0) return null;
                return (
                  <li
                    key={c}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>{CATEGORY_LABEL[c]}</span>
                    <span className="text-muted-foreground">
                      {b.poolAmount.toLocaleString('ko-KR')}원 · {b.participantCount}명 · 1인 {b.perParticipant.toLocaleString('ko-KR')}원
                    </span>
                  </li>
                );
              })}
              {Object.values(calc.poolBreakdown).every((b) => b.poolAmount === 0) && (
                <li className="text-muted-foreground">항목이 없습니다.</li>
              )}
            </ul>
          </CardContent>
        )}
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={create.isPending}>
          이전
        </Button>
        <Button type="button" onClick={handleSave} disabled={create.isPending}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          저장
        </Button>
      </div>
    </section>
  );
};
