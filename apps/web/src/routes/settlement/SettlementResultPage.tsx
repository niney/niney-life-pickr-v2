import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, Coins, Loader2, Trash2 } from 'lucide-react';
import type { ReceiptItemCategoryType, SettlementSessionType } from '@repo/api-contract';
import {
  ApiError,
  settlementExtractionApi,
  useDeleteSettlement,
  useSettlement,
} from '@repo/shared';
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
) => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 저장된 정산 세션 단건 보기. /restaurants/:placeId/settle/:id.
// 본인 소유가 아니면 server 가 403, 없으면 404.
export const SettlementResultPage = () => {
  const { placeId = '', id = '' } = useParams<{ placeId: string; id: string }>();
  const navigate = useNavigate();
  const session = useSettlement(id);
  const remove = useDeleteSettlement();

  const handleBack = () => navigate(`/restaurants/${placeId}`);

  const handleDelete = async () => {
    if (!window.confirm('이 정산 이력을 삭제할까요?')) return;
    try {
      await remove.mutateAsync(id);
      navigate(`/restaurants/${placeId}`);
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : '삭제 실패');
    }
  };

  if (session.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (session.isError || !session.data) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-center">
        <p className="text-sm text-destructive">
          정산을 불러오지 못했습니다.{' '}
          {session.error instanceof ApiError ? session.error.message : ''}
        </p>
        <Button type="button" variant="ghost" onClick={handleBack} className="mt-4">
          돌아가기
        </Button>
      </main>
    );
  }

  const s = session.data;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack} aria-label="뒤로">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex-1 truncate text-sm font-semibold">정산 결과 · {s.restaurantName}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={remove.isPending}
          aria-label="삭제"
        >
          {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </header>

      <div className="flex-1 space-y-4 px-4 py-6">
        <SessionSummaryCard session={s} />
        {s.warning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{s.warning}</p>
          </div>
        )}

        {s.receiptPreviewUrl && <ReceiptCard previewUrl={s.receiptPreviewUrl} />}

        <ParticipantsCard session={s} />

        <ItemsCard session={s} />
      </div>
    </main>
  );
};

const SessionSummaryCard = ({ session }: { session: SettlementSessionType }) => (
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

const ParticipantsCard = ({ session }: { session: SettlementSessionType }) => (
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

const ItemsCard = ({ session }: { session: SettlementSessionType }) => (
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

const ReceiptCard = ({ previewUrl }: { previewUrl: string }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const token = previewUrl.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewUrl]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">영수증</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !objectUrl ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : (
          <img
            src={objectUrl}
            alt="영수증"
            className="max-h-80 w-full rounded-md border object-contain"
          />
        )}
      </CardContent>
    </Card>
  );
};
