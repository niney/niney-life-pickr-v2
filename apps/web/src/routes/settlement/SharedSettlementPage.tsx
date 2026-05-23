import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Receipt } from 'lucide-react';
import { ApiError, useSharedSettlement } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { ItemsCard, ParticipantsCard, SessionSummaryCard } from './SettlementCards';

// 공유 토큰으로 read-only 결과 보기. /share/settlements/:token.
// 비로그인 사용자도 접근 가능 — 서버가 토큰 검증만 한다. 응답에서 영수증
// 미리보기와 소유자 식별은 제거되어 있다.
export const SharedSettlementPage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const session = useSharedSettlement(token);

  if (session.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (session.isError || !session.data) {
    const status = session.error instanceof ApiError ? session.error.statusCode : null;
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="size-5" />
        </div>
        <h1 className="text-base font-semibold">공유된 정산을 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === 404
            ? '링크가 만료되었거나 잘못된 주소입니다.'
            : session.error instanceof ApiError
              ? session.error.message
              : '잠시 후 다시 시도해 주세요.'}
        </p>
        <Button asChild variant="ghost" size="sm" className="mt-4">
          <Link to="/">🎲 Life Pickr 홈으로</Link>
        </Button>
      </main>
    );
  }

  const s = session.data;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Receipt className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{s.restaurantName}</div>
          <div className="text-xs text-muted-foreground">정산 결과 (공유 링크)</div>
        </div>
      </header>

      <div className="flex-1 space-y-4 px-4 py-6">
        <SessionSummaryCard session={s} />
        {s.warning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{s.warning}</p>
          </div>
        )}

        <ParticipantsCard session={s} />
        <ItemsCard session={s} />
      </div>

      <footer className="mt-auto border-t bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          🎲 Life Pickr 에서 정산하기
        </Link>
      </footer>
    </main>
  );
};
