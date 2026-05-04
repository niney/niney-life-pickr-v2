import { useState, type FormEvent } from 'react';
import { Beaker, Link as LinkIcon, Loader2, Play, AlertCircle } from 'lucide-react';
import { useCrawlNaverPlace, ApiError } from '@repo/shared';
import type { NaverPlaceDataType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

const formatField = (v: string | number | null): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toString();
  return v.length ? v : '—';
};

const FieldRow = ({ label, value }: { label: string; value: string | number | null }) => (
  <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="break-all">{formatField(value)}</span>
  </div>
);

const ParsedDataCard = ({ data }: { data: NaverPlaceDataType }) => (
  <Card>
    <CardHeader>
      <CardTitle>파싱된 데이터</CardTitle>
      <CardDescription>placeId: {data.placeId}</CardDescription>
    </CardHeader>
    <CardContent className="divide-y">
      <FieldRow label="이름" value={data.name} />
      <FieldRow label="카테고리" value={data.category} />
      <FieldRow label="주소" value={data.address} />
      <FieldRow label="도로명주소" value={data.roadAddress} />
      <FieldRow label="전화" value={data.phone} />
      <FieldRow label="영업시간" value={data.businessHours} />
      <FieldRow label="위도" value={data.latitude} />
      <FieldRow label="경도" value={data.longitude} />
      <FieldRow label="평점" value={data.rating} />
      <FieldRow label="리뷰 수" value={data.reviewCount} />
      <div className="grid grid-cols-[8rem_1fr] gap-3 py-2 text-sm">
        <span className="text-muted-foreground">이미지 ({data.imageUrls.length})</span>
        <div className="flex flex-wrap gap-2">
          {data.imageUrls.length === 0
            ? '—'
            : data.imageUrls.slice(0, 6).map((u) => (
                <img
                  key={u}
                  src={u}
                  alt=""
                  className="h-16 w-16 rounded object-cover"
                  loading="lazy"
                />
              ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

export const AdminCrawlTestPage = () => {
  const [url, setUrl] = useState('');
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);
  const mutation = useCrawlNaverPlace();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setSubmittedUrl(trimmed);
    mutation.mutate(trimmed);
  };

  const result = mutation.data;
  const transportError = mutation.error instanceof ApiError ? mutation.error : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Beaker className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">크롤링 테스트</h1>
          <p className="text-sm text-muted-foreground">
            네이버 플레이스 URL을 넣고 추출 결과를 확인합니다. (DB 저장은 다음 단계)
          </p>
        </div>
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL</CardTitle>
          <CardDescription>
            <code>https://map.naver.com/...</code> 또는 <code>https://naver.me/...</code> 형태
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="relative flex-1">
              <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                inputMode="url"
                placeholder="https://naver.me/..."
                className="pl-9"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <Button type="submit" disabled={!url.trim() || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Play />
              )}
              크롤링
            </Button>
          </form>
        </CardContent>
      </Card>

      {transportError && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              요청 실패 ({transportError.statusCode})
            </CardTitle>
            <CardDescription>{transportError.message}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {result && result.ok === false && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              크롤링 실패
            </CardTitle>
            <CardDescription className="space-y-1">
              <div>
                <Badge variant="outline" className="mr-2">{result.error}</Badge>
                {result.message}
              </div>
              {result.triedUrl && (
                <div className="break-all text-xs">tried: {result.triedUrl}</div>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {result && result.ok === true && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary">{result.durationMs} ms</Badge>
            <span>fetched: {new Date(result.fetchedAt).toLocaleString('ko-KR')}</span>
            <span className="break-all">final: {result.data.rawSourceUrl}</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ParsedDataCard data={result.data} />
            <Card>
              <CardHeader>
                <CardTitle>원본 응답</CardTitle>
                <CardDescription>NaverPlaceData JSON</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!result && !transportError && submittedUrl && mutation.isPending && (
        <Card>
          <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            크롤링 중… (Playwright 첫 실행은 1~2초 더 걸릴 수 있습니다)
          </CardContent>
        </Card>
      )}
    </div>
  );
};
