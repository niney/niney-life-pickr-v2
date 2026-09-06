import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Link2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, postLpEmbedMessage, useSharedSajuReading } from '@repo/shared';
import { SajuReadingView } from '~/components/saju/SajuReadingView';
import { Button } from '~/components/ui/button';

// 사주 공유 페이지 — /saju-c/s/:token. 받는 사람은 로그인·3D 없이 원국과 풀이만 본다. OG 는 friendly 가
// 같은 경로에서 주입(nginx `^~ /saju-c/s/`), 이미지는 satori 렌더(/saju-c/s/:token/image.png).

export const SajuSharedPage = () => {
  const { token } = useParams<{ token: string }>();
  const query = useSharedSajuReading(token ?? null);

  const copyLink = async () => {
    const url = window.location.href;
    if (postLpEmbedMessage({ type: 'share', url, title: '사주(C) 풀이' })) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: '사주(C) 풀이', url });
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
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[radial-gradient(ellipse_at_50%_0%,#1c1a22,#0b0b0f_60%)] text-[#e9e2d2]">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-5 text-[#d9b65b]" />
          <h1 className="font-serif-kr text-2xl font-bold text-[#f3e9c6]">사주 풀이</h1>
          {query.data && (
            <Button type="button" variant="outline" size="sm" onClick={copyLink} className="ml-auto border-white/20 bg-transparent text-[#e9e2d2] hover:bg-white/10">
              <Link2 className="size-4" /> 링크 공유
            </Button>
          )}
        </div>
        {query.isLoading ? (
          <p className="flex items-center gap-2 py-16 text-sm text-[#e9e2d2]/60">
            <Loader2 className="size-4 animate-spin text-[#d9b65b]" /> 불러오는 중…
          </p>
        ) : query.isError || !query.data ? (
          <div className="rounded-2xl border border-white/10 bg-[#121218]/85 p-6 text-center">
            <AlertTriangle className="mx-auto size-8 text-[#ffb4a2]" />
            <p className="mt-3 font-semibold text-[#f3e9c6]">{query.error instanceof ApiError && query.error.statusCode === 404 ? '공유 링크를 찾을 수 없어요' : '풀이를 불러오지 못했어요'}</p>
            <p className="mt-1 text-sm text-[#e9e2d2]/60">주소가 잘못됐거나 삭제된 풀이예요.</p>
            <Button asChild className="mt-5 bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
              <Link to="/saju-c">내 사주 보러 가기</Link>
            </Button>
          </div>
        ) : (
          <>
            <SajuReadingView chart={query.data.chart} sections={query.data.sections} source={query.data.source} birthHidden={!query.data.includeBirth} />
            <div className="mt-6 text-center">
              <Button asChild className="bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
                <Link to="/saju-c">
                  <Sparkles className="size-4" /> 나도 사주 보기
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
