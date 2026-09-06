import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Routes, type SajuBirthInputType, type SajuShareResultType } from '@repo/api-contract';
import { isLpEmbedded, postLpEmbedMessage, useCreateSajuShare } from '@repo/shared';
import { Button } from '~/components/ui/button';

// 풀이 공유 시트 — 링크(토큰) 발급 → 복사/OS 공유, 세로 이미지 저장. 회원은 readingId, 게스트는 생년월일
// 입력을 보낸다(서버가 캐시된 풀이로 행을 만든다). 생년월일은 기본 숨김이고 체크로만 포함한다.

export type SajuShareBase = { readingId: string } | { birth: SajuBirthInputType };

interface Props {
  open: boolean;
  onClose: () => void;
  base: SajuShareBase;
}

export const SajuShareSheet = ({ open, onClose, base }: Props) => {
  const [includeBirth, setIncludeBirth] = useState(false);
  const [share, setShare] = useState<SajuShareResultType | null>(null);
  const [copied, setCopied] = useState(false);
  const mutation = useCreateSajuShare();
  if (!open) return null;

  const url = share ? `${window.location.origin}${share.path}` : null;
  const stale = share !== null && share.includeBirth !== includeBirth;
  const embedded = isLpEmbedded();
  const canOsShare = embedded || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  const imageUrl = (format: 'og' | 'story') => (share ? `${window.location.origin}${Routes.Saju.shareImage(share.token, format)}` : '');

  const create = () => {
    mutation.mutate(
      { ...base, includeBirth },
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
    if (postLpEmbedMessage({ type: 'share', url, title: '사주 풀이' })) return;
    try {
      await navigator.share({ title: '사주 풀이', url });
    } catch {
      // 사용자가 시트를 닫은 경우 — 조용히.
    }
  };
  const openImage = (format: 'og' | 'story') => {
    const href = imageUrl(format);
    if (postLpEmbedMessage({ type: 'open', url: href })) return;
    window.open(href, '_blank', 'noopener');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="풀이 공유" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[#d9b65b]/15 bg-[#121218] p-5 text-[#e9e2d2] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Share2 className="size-4 text-[#d9b65b]" />
          <h3 className="font-serif-kr text-lg font-bold text-[#f3e9c6]">풀이 공유</h3>
          <button type="button" aria-label="닫기" onClick={onClose} className="ml-auto rounded p-1 text-[#e9e2d2]/60 hover:text-[#e9e2d2]">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-[#e9e2d2]/60">링크를 받은 사람은 로그인 없이 원국과 풀이를 볼 수 있어요. 생년월일은 기본으로 숨겨요.</p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeBirth} onChange={(e) => setIncludeBirth(e.target.checked)} className="accent-[#d9b65b]" />
          생년월일도 보여 주기
        </label>
        {!share || stale ? (
          <Button type="button" onClick={create} disabled={mutation.isPending} className="mt-4 h-11 w-full bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />} {share ? '링크 다시 만들기' : '공유 링크 만들기'}
          </Button>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <div className="truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-[#e9e2d2]/80" data-testid="saju-share-url">
              {url}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={copy} className="h-10 border-white/20 bg-transparent text-[#e9e2d2] hover:bg-white/10">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} 링크 복사
              </Button>
              {canOsShare && (
                <Button type="button" variant="outline" onClick={osShare} className="h-10 border-white/20 bg-transparent text-[#e9e2d2] hover:bg-white/10">
                  <ExternalLink className="size-4" /> 공유하기
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => openImage('story')} className="col-span-2 h-10 border-white/20 bg-transparent text-[#e9e2d2] hover:bg-white/10">
                <Download className="size-4" /> 세로 이미지 열기
              </Button>
            </div>
            <img src={imageUrl('og')} alt="공유 미리보기" className="mt-1 w-full rounded-lg border border-white/10" />
          </div>
        )}
      </div>
    </div>
  );
};
