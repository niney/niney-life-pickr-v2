import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Download, Link2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Routes } from '@repo/api-contract';
import { ApiError, useSharedTarotReading } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { TarotReadingView } from '~/components/tarot/TarotReadingView';

// 타로 공유 페이지 — /tarot/s/:token. 받는 사람은 로그인·3D 없이 결과만 본다. OG 는 friendly 가
// 같은 경로에서 주입(nginx `^~ /tarot/s/`), 세로 이미지는 satori 렌더(/tarot/s/:token/image.png?format=story).

export const TarotSharedPage = () => {
  const { token } = useParams<{ token: string }>();
  const query = useSharedTarotReading(token ?? null);

  const copyLink = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: '타로 리딩', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('링크를 복사했어요');
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('링크를 복사했어요');
      } catch {
        toast.error('링크를 복사하지 못했어요');
      }
    }
  };

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[radial-gradient(ellipse_at_50%_0%,#1a2358,#05071a_60%)] text-[#ece6d6]">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-5 text-[#d9b65b]" />
          <h1 className="font-serif-kr text-2xl font-bold text-[#f3e9c6]">타로 리딩</h1>
        </div>

        {query.isLoading ? (
          <p className="flex items-center gap-2 py-16 text-sm text-[#ece6d6]/60">
            <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> 불러오는 중…
          </p>
        ) : query.isError || !query.data ? (
          <div className="rounded-2xl border border-white/10 bg-[#0b1030]/80 p-6 text-center">
            <AlertTriangle className="mx-auto size-8 text-[#ffb4a2]" />
            <p className="mt-3 font-semibold text-[#f3e9c6]">
              {query.error instanceof ApiError && query.error.statusCode === 404
                ? '공유 링크를 찾을 수 없어요'
                : '리딩을 불러오지 못했어요'}
            </p>
            <p className="mt-1 text-sm text-[#ece6d6]/60">주소가 잘못됐거나 삭제된 리딩이에요.</p>
            <Button asChild className="mt-5 bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]">
              <Link to="/tarot">나도 타로 보기</Link>
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
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10"
              >
                <Link2 className="size-4" /> 링크 복사
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-white/20 bg-transparent text-[#ece6d6] hover:bg-white/10"
              >
                <a href={Routes.Tarot.shareImage(query.data.token, 'story')} download={`tarot-${query.data.token}.png`}>
                  <Download className="size-4" /> 세로 이미지 저장
                </a>
              </Button>
              <Button asChild size="sm" className="ml-auto bg-[#d9b65b] text-[#1a1408] hover:bg-[#e6c86f]">
                <Link to="/tarot">
                  <Sparkles className="size-4" /> 나도 타로 보기
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
