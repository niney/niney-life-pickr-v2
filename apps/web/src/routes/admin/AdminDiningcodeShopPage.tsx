import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Star,
  UtensilsCrossed,
} from 'lucide-react';
import {
  useDiningcodeShop,
  useDiningcodeShopReviews,
} from '@repo/shared';
import type {
  DiningcodeShopDataType,
  DiningcodeShopReviewType,
  DiningcodeShopReviewsResponseType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

// 다이닝코드 가게 상세 — /admin/diningcode-test/:vRid.
// /API/profile/ 한 방에 메뉴·사진·리뷰 첫 페이지·블로그·평점 분포가 모두 와서
// 메인 데이터는 단일 fetch. 리뷰만 페이지 단위 lazy fetch (use*Reviews 훅).

const formatScore = (v: number | null): string => {
  if (v === null) return '—';
  return v.toFixed(1);
};

const Stars = ({ value }: { value: number | null }) => {
  if (value === null || value === 0)
    return <span className="text-xs text-muted-foreground">평점 없음</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{formatScore(value)}</span>
    </span>
  );
};

const Header = ({ data }: { data: DiningcodeShopDataType }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-2xl font-semibold tracking-tight">
        {data.fullName}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {data.categories.length > 0 && (
          <span className="font-medium text-foreground">
            {data.categories.join(' · ')}
          </span>
        )}
        {data.area && <span>{data.area}</span>}
        {data.status && (
          <Badge
            variant="outline"
            className={`font-normal ${
              data.status.isOpen?.includes('영업 중')
                ? 'border-emerald-400/40 text-emerald-700'
                : ''
            }`}
          >
            {data.status.isOpen ?? '영업 정보 없음'}
          </Badge>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Stars value={data.scoreDetail?.average ?? null} />
        {data.scoreDetail && data.scoreDetail.reviewTotal > 0 && (
          <span className="text-muted-foreground">
            리뷰 {data.scoreDetail.reviewTotal.toLocaleString()}
          </span>
        )}
        {data.score !== null && (
          <Badge variant="outline" className="font-normal">
            다이닝코드 점수 {data.score}
          </Badge>
        )}
      </div>
    </div>
    <Button asChild variant="outline" size="sm">
      <a href={data.rawSourceUrl} target="_blank" rel="noreferrer">
        <ExternalLink className="size-4" />
        다이닝코드에서 열기
      </a>
    </Button>
  </div>
);

const ContactRow = ({ data }: { data: DiningcodeShopDataType }) => (
  <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
    <div className="flex items-start gap-2">
      <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        {data.roadAddress && <div>{data.roadAddress}</div>}
        {data.address && (
          <div className="text-xs text-muted-foreground">{data.address}</div>
        )}
        {!data.address && !data.roadAddress && (
          <span className="text-muted-foreground">주소 없음</span>
        )}
      </div>
    </div>
    <div className="flex items-start gap-2">
      <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>{data.phone ?? <span className="text-muted-foreground">전화 없음</span>}</div>
    </div>
  </div>
);

const Tags = ({ tags, facilities, descTags }: {
  tags: string[];
  facilities: string[];
  descTags: string[];
}) => {
  if (!tags.length && !facilities.length && !descTags.length) return null;
  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <Badge key={`tag-${i}`} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}
      {(facilities.length > 0 || descTags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {[...descTags, ...facilities].map((t, i) => (
            <Badge key={`fac-${i}`} variant="outline" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const BusinessHours = ({ data }: { data: DiningcodeShopDataType }) => {
  if (data.businessHours.length === 0 && data.businessHoursSummary.length === 0)
    return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="size-4" />
          영업시간
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.businessHoursSummary.length > 0 && (
          <div className="space-y-0.5">
            {data.businessHoursSummary.map((d, i) => (
              <div key={`seo-${i}`}>
                <span className="font-medium">{d.duration}</span>
                <span className="ml-2 text-muted-foreground">{d.time}</span>
              </div>
            ))}
          </div>
        )}
        {data.businessHours.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              주간 영업시간 상세
            </summary>
            <div className="mt-2 space-y-0.5 border-l pl-3 text-xs">
              {data.businessHours.map((d, i) => (
                <div key={`bh-${i}`} className={d.today ? 'font-semibold' : ''}>
                  <span>{d.duration}</span>
                  <span className="ml-2 text-muted-foreground">{d.time}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
};

const Menus = ({ data }: { data: DiningcodeShopDataType }) => {
  if (data.menus.length === 0) return null;
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? data.menus : data.menus.slice(0, 8);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <UtensilsCrossed className="size-4" />
            메뉴 ({data.menuTotalCount || data.menus.length})
          </span>
          {data.menus.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showAll ? '간략히' : `+${data.menus.length - 8}개 더`}
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {shown.map((m, i) => (
            <div
              key={`menu-${i}`}
              className="flex flex-col gap-1 rounded-md border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {m.best && (
                      <Badge
                        variant="default"
                        className="h-4 px-1 text-[9px] font-normal"
                      >
                        BEST
                      </Badge>
                    )}
                    <span className="truncate font-medium">{m.name}</span>
                  </div>
                  {m.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  )}
                </div>
                {m.price && (
                  <span className="shrink-0 text-sm font-medium">{m.price}</span>
                )}
              </div>
              {(m.reviewCount > 0 || m.selectionCount > 0) && (
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {m.reviewCount > 0 && <span>리뷰 {m.reviewCount}</span>}
                  {m.selectionCount > 0 && (
                    <span>
                      선택 {m.selectionCount} ({m.selectionRate}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const Photos = ({ data }: { data: DiningcodeShopDataType }) => {
  const list = data.photos.length > 0 ? data.photos : data.images;
  if (list.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {list.slice(0, 12).map((p, i) => (
        <a
          key={`photo-${i}`}
          href={p.origin}
          target="_blank"
          rel="noreferrer"
          className="aspect-square overflow-hidden rounded-md bg-muted"
        >
          <img
            src={p.thumb}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
      ))}
    </div>
  );
};

const ScoreBreakdown = ({ data }: { data: DiningcodeShopDataType }) => {
  const s = data.scoreDetail;
  if (!s) return null;
  const Bar = ({ label, value }: { label: string; value: number | null }) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-muted-foreground">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
        <div
          className="absolute inset-y-0 left-0 bg-primary/70"
          style={{ width: `${Math.min(100, ((value ?? 0) / 5) * 100)}%` }}
        />
      </div>
      <span className="w-8 text-right font-medium">{formatScore(value)}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">평점</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold">{formatScore(s.average)}</div>
          <div className="text-xs text-muted-foreground">
            <div>총 {s.total.toLocaleString()}개 평가</div>
            <div>리뷰 {s.reviewTotal.toLocaleString()}</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <Bar label="맛" value={s.taste} />
          <Bar label="서비스" value={s.service} />
          <Bar label="가격" value={s.price} />
          {s.clean !== null && s.clean > 0 && <Bar label="청결" value={s.clean} />}
        </div>
        {s.text && (
          <p className="text-[11px] text-muted-foreground">{s.text}</p>
        )}
      </CardContent>
    </Card>
  );
};

const ReviewCard = ({ rv }: { rv: DiningcodeShopReviewType }) => (
  <div className="space-y-2 rounded-md border p-3">
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        {rv.userProfileImg && (
          <img
            src={rv.userProfileImg}
            alt=""
            className="size-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        )}
        <div>
          <div className="text-sm font-medium">{rv.userName ?? '익명'}</div>
          <div className="text-[11px] text-muted-foreground">{rv.reviewDt}</div>
        </div>
      </div>
      {rv.totalScore !== null && (
        <span className="inline-flex items-center gap-1 text-sm">
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium">{rv.totalScore}</span>
        </span>
      )}
    </div>
    {rv.content && (
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{rv.content}</p>
    )}
    {(rv.tasteScore || rv.serviceScore || rv.priceScore) && (
      <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
        {rv.tasteScore && <Badge variant="outline" className="font-normal">맛 {rv.tasteScore}</Badge>}
        {rv.serviceScore && <Badge variant="outline" className="font-normal">서비스 {rv.serviceScore}</Badge>}
        {rv.priceScore && <Badge variant="outline" className="font-normal">가격 {rv.priceScore}</Badge>}
      </div>
    )}
    {rv.orderMenu.length > 0 && (
      <div className="text-[11px] text-muted-foreground">
        주문: {rv.orderMenu.join(', ')}
      </div>
    )}
    {rv.images.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {rv.images.slice(0, 8).map((img, i) => (
          <a
            key={`rv-img-${i}`}
            href={img.origin}
            target="_blank"
            rel="noreferrer"
            className="size-14 overflow-hidden rounded bg-muted"
          >
            <img
              src={img.thumb}
              alt=""
              className="size-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </a>
        ))}
      </div>
    )}
    {rv.keywords.length > 0 && (
      <div className="flex flex-wrap gap-1">
        {rv.keywords.map((k, i) => (
          <Badge key={`rv-kw-${i}`} variant="secondary" className="text-[10px] font-normal">
            {k}
          </Badge>
        ))}
      </div>
    )}
    {rv.replyComment && (
      <blockquote className="border-l-2 border-primary/30 bg-primary/5 px-2 py-1 text-xs">
        <div className="font-medium">{rv.replyPartner ?? '사장'} 답변</div>
        <div className="whitespace-pre-wrap text-muted-foreground">
          {rv.replyComment}
        </div>
      </blockquote>
    )}
  </div>
);

const Reviews = ({ data }: { data: DiningcodeShopDataType }) => {
  const [page, setPage] = useState<number>(1);
  // page=1 일 땐 디테일 응답의 reviewsFirstPage 재사용 — 추가 fetch 안 함.
  const lazy = useDiningcodeShopReviews(data.vRid, page, page > 1);
  const current: DiningcodeShopReviewsResponseType | {
    page: number;
    totalCount: number;
    totalPage: number;
    list: DiningcodeShopReviewType[];
    elapsedMs: number | null;
  } = page === 1
    ? {
        page: 1,
        totalCount: data.reviewsFirstPage.totalCount,
        totalPage: data.reviewsFirstPage.totalPage,
        list: data.reviewsFirstPage.list,
        elapsedMs: null,
      }
    : lazy.data ?? {
        page,
        totalCount: data.reviewsFirstPage.totalCount,
        totalPage: data.reviewsFirstPage.totalPage,
        list: [],
        elapsedMs: null,
      };
  const isLoading = page > 1 && lazy.isFetching;
  const totalPage = current.totalPage || 1;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>리뷰 {current.totalCount.toLocaleString()}</span>
          <span className="text-xs font-normal text-muted-foreground">
            page {page} / {totalPage}
            {current.elapsedMs !== null && (
              <span className="ml-1">· {current.elapsedMs}ms</span>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중…
          </div>
        )}
        {lazy.isError && page > 1 && (
          <p className="text-xs text-destructive">
            리뷰 페이지를 불러오지 못했습니다: {(lazy.error as Error | null)?.message}
          </p>
        )}
        {!isLoading && current.list.length === 0 && (
          <p className="text-xs text-muted-foreground">리뷰 없음</p>
        )}
        {current.list.map((rv) => <ReviewCard key={rv.rvId} rv={rv} />)}
        {totalPage > 1 && (
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="mr-1 size-4" />
              이전
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPage, p + 1))}
              disabled={page >= totalPage || isLoading}
            >
              다음
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Blogs = ({ data }: { data: DiningcodeShopDataType }) => {
  if (data.blogsFirstPage.list.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">관련 블로그</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.blogsFirstPage.list.map((b) => (
          <a
            key={b.pId}
            href={
              /^https?:\/\//i.test(b.url) ? b.url : `https://${b.url}`
            }
            target="_blank"
            rel="noreferrer"
            className="block rounded-md border p-3 transition hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="line-clamp-1 font-medium">{b.title}</div>
              <Badge variant="outline" className="shrink-0 font-normal">
                {b.site ?? 'blog'}
              </Badge>
            </div>
            {b.contents && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {b.contents}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              {b.nickname && <span>{b.nickname}</span>}
              {b.date && <span>· {b.date}</span>}
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
};

const Wordcloud = ({ data }: { data: DiningcodeShopDataType }) => {
  if (!data.wordcloudUrl) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">키워드 워드클라우드</CardTitle>
      </CardHeader>
      <CardContent>
        <img
          src={data.wordcloudUrl}
          alt="키워드 워드클라우드"
          className="mx-auto max-h-72 object-contain"
          referrerPolicy="no-referrer"
        />
      </CardContent>
    </Card>
  );
};

const RawJson = ({ data }: { data: DiningcodeShopDataType }) => {
  const [show, setShow] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="w-full text-left"
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Code2 className="size-4" />
              원본 응답 JSON (정규화 후)
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {show ? '접기' : '펼치기'}
            </span>
          </div>
        </CardHeader>
      </button>
      {show && (
        <CardContent>
          <pre className="max-h-[500px] overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      )}
    </Card>
  );
};

export const AdminDiningcodeShopPage = () => {
  const { vRid } = useParams<{ vRid: string }>();
  const { data, isLoading, isError, error } = useDiningcodeShop(vRid ?? null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/diningcode-test">
            <ArrowLeft className="size-4" />
            검색으로 돌아가기
          </Link>
        </Button>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            가게 정보 불러오는 중…
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4" />
              불러오기 실패
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(error as Error | null)?.message ?? '알 수 없는 오류'}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-5">
          <Header data={data} />
          <ContactRow data={data} />
          <Tags
            tags={data.tags}
            facilities={data.facilities}
            descTags={data.descTags}
          />
          <Photos data={data} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ScoreBreakdown data={data} />
            <BusinessHours data={data} />
          </div>
          <Menus data={data} />
          <Reviews data={data} />
          <Blogs data={data} />
          <Wordcloud data={data} />
          <div className="text-[11px] text-muted-foreground">
            elapsed {data.elapsedMs}ms · source {data.source}
          </div>
          <RawJson data={data} />
        </div>
      )}
    </div>
  );
};
