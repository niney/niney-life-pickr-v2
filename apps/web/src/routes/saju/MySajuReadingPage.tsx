import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Share2, Trash2 } from 'lucide-react';
import { useDeleteSajuReading, useMySajuReading } from '@repo/shared';
import { SajuReadingView } from '~/components/saju/SajuReadingView';
import { SajuShareSheet } from '~/components/saju/SajuShareSheet';
import { Button } from '~/components/ui/button';

// 내 사주 기록 상세 — /me/saju/:id. 2D 보기 + 공유(readingId) + 삭제(확인 후 목록으로).

export const MySajuReadingPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const query = useMySajuReading(id ?? null);
  const del = useDeleteSajuReading();
  const [shareOpen, setShareOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[radial-gradient(ellipse_at_50%_0%,#1c1a22,#0b0b0f_60%)] text-[#e9e2d2]">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-[#e9e2d2]/80 hover:bg-white/10">
            <Link to="/me/saju">
              <ArrowLeft className="size-4" /> 목록
            </Link>
          </Button>
          {query.data && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)} className="ml-auto border-white/20 bg-transparent text-[#e9e2d2] hover:bg-white/10">
                <Share2 className="size-4" /> 공유
              </Button>
              {confirming ? (
                <>
                  <Button type="button" size="sm" variant="destructive" disabled={del.isPending} onClick={() => del.mutate(query.data!.readingId as string, { onSuccess: () => navigate('/me/saju') })}>
                    삭제
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} className="text-[#e9e2d2]/80">
                    취소
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-[#e9e2d2]/70 hover:text-[#ffb4a2]">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </>
          )}
        </div>
        {query.isLoading ? (
          <p className="flex items-center gap-2 py-16 text-sm text-[#e9e2d2]/60">
            <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> 불러오는 중…
          </p>
        ) : query.isError || !query.data ? (
          <p className="py-16 text-center text-sm text-[#ffb4a2]">풀이를 찾을 수 없어요.</p>
        ) : (
          <>
            <SajuReadingView chart={query.data.chart} sections={query.data.sections} source={query.data.source} />
            {query.data.readingId && <SajuShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={{ readingId: query.data.readingId }} />}
          </>
        )}
      </div>
    </div>
  );
};
