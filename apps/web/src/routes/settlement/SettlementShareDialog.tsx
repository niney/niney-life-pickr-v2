import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Share2, Trash2, X } from 'lucide-react';
import {
  ApiError,
  useCreateSettlementShare,
  useRevokeSettlementShare,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  open: boolean;
  sessionId: string;
  onClose(): void;
}

// 결과 페이지의 "공유" 버튼이 여는 다이얼로그. open 되면 서버에 POST /share
// 를 한 번 호출 — 서버가 멱등이라 이미 토큰이 있으면 같은 토큰을 돌려준다.
// 토큰을 받으면 절대 URL(현재 origin + 서버 경로) 로 만들어 보여준다.
//
// MenuPickerDialog 와 동일하게 외부 dialog 라이브러리 없이 fixed overlay 로
// 구현. ESC 닫기, 백드롭 클릭 닫기.
export const SettlementShareDialog = ({ open, sessionId, onClose }: Props) => {
  const create = useCreateSettlementShare();
  const revoke = useRevokeSettlementShare();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 다이얼로그가 열리면 자동으로 토큰 생성/조회. 멱등이라 같은 세션을 여러 번
  // 열어도 동일 토큰. 닫혀 있는 동안에는 호출하지 않는다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCopied(false);
    create
      .mutateAsync(sessionId)
      .then((res) => {
        if (cancelled) return;
        if (res.shareUrl) setShareUrl(absoluteUrl(res.shareUrl));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : '공유 링크 생성 실패');
      });
    return () => {
      cancelled = true;
    };
    // sessionId 가 바뀌면 다시 — 일반 사용에선 한 페이지가 한 세션을 다룬다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);

  // ESC 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사 실패 — 수동으로 선택해서 복사하세요.');
    }
  };

  // Web Share API — 모바일 단말에서 네이티브 공유 시트(카톡/메시지/메일 등)
  // 호출. 데스크톱 일부 브라우저에서도 동작. 미지원이면 버튼 숨김.
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.share({ title: '정산 결과', url: shareUrl });
    } catch {
      // 사용자가 취소하면 그대로 무시. 다른 에러는 isolated 라 별도 토스트 없이.
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('공유 링크를 해제할까요? 이전에 공유한 링크는 더 이상 동작하지 않습니다.')) {
      return;
    }
    try {
      await revoke.mutateAsync(sessionId);
      setShareUrl(null);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '공유 해제 실패');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="정산 결과 공유"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-t-lg bg-background p-5 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Link2 className="size-4" />
            공유 링크
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          링크 받은 사람은 로그인 없이 결과를 볼 수 있습니다. 영수증 사진은 공유되지 않으며,
          공유를 해제하면 이전 링크는 영구히 동작하지 않습니다.
        </p>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!shareUrl && !error && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {shareUrl && (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
                aria-label="공유 URL"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
                aria-label="복사"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="hidden sm:inline">{copied ? '복사됨' : '복사'}</span>
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2">
              {canShare ? (
                <Button type="button" variant="default" size="sm" onClick={handleShare}>
                  <Share2 className="size-4" />
                  공유…
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevoke}
                disabled={revoke.isPending}
              >
                {revoke.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                공유 해제
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 서버는 항상 /api/v1/share/settlements/<token> 같은 상대 경로를 돌려준다.
// 브라우저에서 그대로 공유하려면 origin 까지 붙여야 한다. SSR 환경 고려하지
// 않음 — apps/web 은 클라이언트 전용 SPA.
const absoluteUrl = (path: string): string => {
  if (/^https?:/i.test(path)) return path;
  if (typeof window === 'undefined') return path;
  // 공유 페이지는 SPA 라우트(/share/settlements/:token) 로 매핑된다. 서버가
  // 돌려주는 API 경로(/api/v1/share/settlements/:token) 에서 토큰만 떼어
  // SPA 경로로 다시 조립.
  const token = path.split('/').pop() ?? '';
  return `${window.location.origin}/share/settlements/${token}`;
};
