import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Routes, type CreateTarotReadingInputType, type TarotShareResultType } from '@repo/api-contract';
import { useCreateTarotShare } from '@repo/shared';
import { Button } from '~/components/ui/button';

// 리딩 공유 시트 — 링크(토큰) 발급 → 복사/OS 공유, 세로 이미지 저장, 미리보기 이미지.
// 회원은 readingId, 게스트는 리딩 입력을 보낸다(서버가 본문을 다시 확보 — 클라이언트 텍스트를 게시하지
// 않는다). 질문은 사적일 수 있어 기본 숨김이고 체크로만 포함한다.

export type TarotShareBase = { readingId: string } | { reading: CreateTarotReadingInputType };

interface Props {
  open: boolean;
  onClose: () => void;
  base: TarotShareBase;
  hasQuestion: boolean;
}

export const TarotShareSheet = ({ open, onClose, base, hasQuestion }: Props) => {
  const [includeQuestion, setIncludeQuestion] = useState(false);
  const [share, setShare] = useState<TarotShareResultType | null>(null);
  const [copied, setCopied] = useState(false);
  const mutation = useCreateTarotShare();
  if (!open) return null;

  const url = share ? `${window.location.origin}${share.path}` : null;
  const stale = share !== null && share.includeQuestion !== includeQuestion;

  const create = () => {
    mutation.mutate(
      { ...base, includeQuestion },
      {
        onSuccess: (res) => {
          setShare(res);
          setCopied(false);
        },
        onError: () => toast.error('공유 링크를 만들지 못했어요'),
      },
    );
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('링크를 복사했어요');
    } catch {
      toast.error('링크를 복사하지 못했어요');
    }
  };

  const osShare = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: '타로 리딩', url });
    } catch {
      // 사용자가 시트를 닫은 경우 — 조용히.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="리딩 공유"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1030] p-5 text-[#ece6d6] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Share2 className="size-4 text-[#d9b65b]" />
          <h3 className="font-serif-kr text-lg font-bold text-[#f3e9c6]">리딩 공유</h3>
          <button type="button" aria-label="닫기" onClick={onClose} className="ml-auto rounded p-1 text-[#ece6d6]/60 hover:text-[#ece6d6]">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#ece6d6]/60">
          링크를 받은 사람은 로그인 없이 카드와 해석을 볼 수 있어요. 링크는 만료되지 않아요.
        </p>

        {hasQuestion && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeQuestion}
              onChange={(e) => setIncludeQuestion(e.target.checked)}
              className="accent-[#d9b65b]"
            />
            질문도 함께 보여주기
          </label>
        )}

        {!share || stale ? (
          <Button
            type="button"
            onClick={create}
            disabled={mutation.isPending}
            className="mt-4 h-11 w-full bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]"
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
            {stale ? '설정대로 링크 다시 만들기' : '공유 링크 만들기'}
          </Button>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-[#f3e9c6]" data-testid="tarot-share-url">
                {url}
              </span>
              <button type="button" onClick={copy} aria-label="링크 복사" className="rounded p-1 text-[#d9b65b] hover:bg-white/10">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <Button type="button" size="sm" onClick={osShare} className="bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]">
                  <Share2 className="size-4" /> 공유하기
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10">
                <a href={Routes.Tarot.shareImage(share.token, 'story')} download={`tarot-${share.token}.png`}>
                  <Download className="size-4" /> 세로 이미지 저장
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10">
                <a href={Routes.Tarot.shareImage(share.token, 'og')} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> 미리보기 이미지
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
