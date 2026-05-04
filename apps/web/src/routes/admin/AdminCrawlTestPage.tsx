import { useState, type FormEvent } from 'react';
import { Beaker, Link as LinkIcon, Loader2, Play, AlertCircle } from 'lucide-react';
import { useCrawlNaverPlace, ApiError } from '@repo/shared';
import type {
  BlogReviewType,
  MenuItemType,
  NaverPlaceDataType,
  ReviewStatsType,
  VisitorReviewType,
} from '@repo/api-contract';
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

const MenuList = ({ menus }: { menus: MenuItemType[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>메뉴 ({menus.length})</CardTitle>
      <CardDescription>네이버 플레이스에서 추출한 메뉴</CardDescription>
    </CardHeader>
    <CardContent>
      {menus.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          메뉴 정보 없음
        </div>
      ) : (
        <ul className="divide-y">
          {menus.map((m, i) => (
            <li key={`${m.name}-${i}`} className="flex items-start gap-3 py-3">
              {m.imageUrls[0] ? (
                <img
                  src={m.imageUrls[0]}
                  alt=""
                  className="size-16 shrink-0 rounded object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="size-16 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {m.recommend && (
                    <Badge variant="secondary" className="shrink-0">추천</Badge>
                  )}
                </div>
                {m.price && (
                  <div className="text-sm text-muted-foreground">{m.price}</div>
                )}
                {m.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {m.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const ReviewStatsCard = ({ stats }: { stats: ReviewStatsType }) => (
  <Card>
    <CardHeader>
      <CardTitle>리뷰 통계</CardTitle>
      <CardDescription>네이버 방문자 리뷰 분석</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">평균 평점</div>
          <div className="text-lg font-semibold">{stats.averageRating ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">총 리뷰</div>
          <div className="text-lg font-semibold">{stats.totalCount ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">이미지 리뷰</div>
          <div className="text-lg font-semibold">{stats.imageReviewCount ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">작성자 수</div>
          <div className="text-lg font-semibold">{stats.authorCount ?? '—'}</div>
        </div>
      </div>
      {stats.themeKeywords.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">테마 키워드</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.themeKeywords.map((t) => (
              <Badge key={t.code} variant="secondary">
                {t.label} {t.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

const BlogReviewList = ({ reviews }: { reviews: BlogReviewType[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>블로그 리뷰 ({reviews.length})</CardTitle>
      <CardDescription>네이버에 노출된 외부 블로그/카페 후기</CardDescription>
    </CardHeader>
    <CardContent>
      {reviews.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          리뷰 없음
        </div>
      ) : (
        <ul className="divide-y">
          {reviews.map((r) => (
            <li key={r.url} className="flex items-start gap-3 py-3">
              {r.thumbnailUrls[0] ? (
                <img
                  src={r.thumbnailUrls[0]}
                  alt=""
                  className="size-16 shrink-0 rounded object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="size-16 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{r.type}</Badge>
                  {r.authorName && <span>{r.authorName}</span>}
                  {r.date && <span>· {r.date}</span>}
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-0.5 line-clamp-1 text-sm font-medium hover:underline"
                >
                  {r.title}
                </a>
                {r.excerpt && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {r.excerpt}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

const VisitorReviewList = ({ reviews }: { reviews: VisitorReviewType[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>방문자 리뷰 ({reviews.length})</CardTitle>
      <CardDescription>/review/visitor 서브페이지에서 추출</CardDescription>
    </CardHeader>
    <CardContent>
      {reviews.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          방문자 리뷰 추출 실패 또는 없음
        </div>
      ) : (
        <ul className="divide-y">
          {reviews.map((r, i) => (
            <li key={i} className="py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.authorName && <span className="font-medium">{r.authorName}</span>}
                {r.rating !== null && <Badge variant="secondary">★ {r.rating}</Badge>}
                {r.visitedAt && <span>· {r.visitedAt}</span>}
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{r.body}</p>
              {r.imageUrls.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {r.imageUrls.slice(0, 4).map((u) => (
                    <img
                      key={u}
                      src={u}
                      alt=""
                      className="size-12 rounded object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
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
                  referrerPolicy="no-referrer"
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

          <div className="mt-6">
            <MenuList menus={result.data.menus} />
          </div>

          {result.data.reviewStats && (
            <div className="mt-6">
              <ReviewStatsCard stats={result.data.reviewStats} />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <BlogReviewList reviews={result.data.blogReviews} />
            <VisitorReviewList reviews={result.data.visitorReviews} />
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
