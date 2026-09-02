import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Share2, Trash2 } from 'lucide-react';
import { ApiError, useDeleteTarotReading, useMyTarotReading } from '@repo/shared';
import { TarotReadingView } from '~/components/tarot/TarotReadingView';
import { TarotShareSheet } from '~/components/tarot/TarotShareSheet';
import { Button } from '~/components/ui/button';

// 내 타로 기록 상세 — 저장된 리딩을 2D 로 다시 보고, 공유(readingId 토큰)·삭제.

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

export const MyTarotReadingPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useMyTarotReading(id ?? null);
  const del = useDeleteTarotReading();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[radial-gradient(ellipse_at_50%_0%,#1a2358,#05071a_60%)] text-[#ece6d6]">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2">
          <Link to="/me/tarot" className="flex items-center gap-1 text-sm text-[#ece6d6]/70 hover:text-[#ece6d6]">
            <ArrowLeft className="size-4" /> 내 타로 기록
          </Link>
          {query.data && <span className="ml-auto text-xs text-[#ece6d6]/50">{fmtDate(query.data.createdAt)}</span>}
        </div>

        {query.isLoading ? (
          <p className="flex items-center gap-2 py-16 text-sm text-[#ece6d6]/60">
            <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> 불러오는 중…
          </p>
        ) : query.isError || !query.data ? (
          <div className="rounded-2xl border border-white/10 bg-[#0b1030]/80 p-6 text-center">
            <p className="font-semibold text-[#f3e9c6]">
              {query.error instanceof ApiError && query.error.statusCode === 404 ? '리딩을 찾을 수 없어요' : '리딩을 불러오지 못했어요'}
            </p>
            <Button asChild className="mt-5 bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]">
              <Link to="/me/tarot">기록으로</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-[#0b1030]/80 p-5 shadow-2xl backdrop-blur">
              <TarotReadingView reading={query.data} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setShareOpen(true)}
                className="bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]"
              >
                <Share2 className="size-4" /> 공유
              </Button>
              {confirming ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(query.data.readingId ?? '', {
                        onSuccess: () => navigate('/me/tarot', { replace: true }),
                      })
                    }
                  >
                    정말 삭제
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} className="text-[#ece6d6]">
                    취소
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(true)}
                  className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10"
                >
                  <Trash2 className="size-4" /> 삭제
                </Button>
              )}
            </div>
            {query.data.readingId && (
              <TarotShareSheet
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                base={{ readingId: query.data.readingId }}
                hasQuestion={!!query.data.question}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
