import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, History, Loader2, Pencil, Share2, Trash2 } from 'lucide-react';
import {
  ApiError,
  settlementExtractionApi,
  useDeleteSettlement,
  useSettlement,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { ParticipantsCard, RoundItemsCard, SessionSummaryCard } from './SettlementCards';
import { SettlementShareDialog } from './SettlementShareDialog';

// 저장된 정산 세션 단건 보기. /restaurants/:placeId/settle/:id.
// 본인 소유가 아니면 server 가 403, 없으면 404.
export const SettlementResultPage = () => {
  const { placeId = '', id = '' } = useParams<{ placeId: string; id: string }>();
  const navigate = useNavigate();
  const session = useSettlement(id);
  const remove = useDeleteSettlement();
  const [shareOpen, setShareOpen] = useState(false);

  const handleEdit = () => navigate(`/restaurants/${placeId}/settle/${id}/edit`);

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
  // 1차 식당 이름이 헤더 라벨. 차수가 여러 개면 '외 N개' 부기.
  const headerLabel =
    s.rounds.length > 1
      ? `${s.restaurantName} 외 ${s.rounds.length - 1}곳`
      : s.restaurantName;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={handleBack} aria-label="뒤로">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex-1 truncate text-sm font-semibold">정산 결과 · {headerLabel}</div>
        <Button asChild variant="ghost" size="sm" aria-label="내 정산 이력">
          <Link to="/me/settlements">
            <History className="size-4" />
            <span className="hidden sm:inline">이력</span>
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleEdit}
          aria-label="수정"
        >
          <Pencil className="size-4" />
          <span className="hidden sm:inline">수정</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShareOpen(true)}
          aria-label="공유"
        >
          <Share2 className="size-4" />
          <span className="hidden sm:inline">공유</span>
        </Button>
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

      <SettlementShareDialog
        open={shareOpen}
        sessionId={s.id}
        onClose={() => setShareOpen(false)}
      />

      <div className="flex-1 space-y-4 px-4 py-6">
        <SessionSummaryCard session={s} />

        <ParticipantsCard session={s} onEdit={handleEdit} />

        {/* 차수별 영수증 + 항목 카드. 차수 1개여도 동일 컴포넌트로 표시. */}
        {s.rounds.map((r) => (
          <div key={r.id} className="space-y-3">
            {r.warning && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {s.rounds.length > 1 ? `${r.orderIndex + 1}차 · ` : ''}
                  {r.warning}
                </p>
              </div>
            )}
            {r.receiptPreviewUrl && <ReceiptCard previewUrl={r.receiptPreviewUrl} />}
            <RoundItemsCard round={r} total={s.rounds.length} />
          </div>
        ))}
      </div>
    </main>
  );
};

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
