import { ExternalLink, MapPin, Phone } from 'lucide-react';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { Badge } from '~/components/ui/badge';

interface Props {
  detail: RestaurantPublicDetailType;
}

export const InfoTab = ({ detail }: Props) => {
  const dc = detail.diningcode;
  const dcWeekly = dc?.businessHoursWeekly ?? [];
  const dcSummary = dc?.businessHoursSummary ?? [];
  // 영업시간 노출 우선순위: DC 요약 → DC 요일별 펼침 → Naver text(머지된 detail.businessHours).
  // DC 가 없으면 detail.businessHours 가 Naver text 그대로 들어와 있다.
  const hasDcHours = dcSummary.length > 0 || dcWeekly.length > 0;
  return (
    <div className="space-y-5 p-4">
      <section className="space-y-1.5 text-sm">
        <h3 className="text-sm font-semibold">영업 정보</h3>
        {detail.roadAddress && (
          <div className="flex gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0 mt-0.5" />
            <div>
              <div>{detail.roadAddress}</div>
              {detail.address && detail.address !== detail.roadAddress && (
                <div className="text-xs">{detail.address}</div>
              )}
            </div>
          </div>
        )}
        {hasDcHours ? (
          <div className="space-y-1 pl-6 text-xs text-muted-foreground">
            {dcSummary.map((d, i) => (
              <div key={`seo-${i}`}>
                <span className="font-medium text-foreground">{d.duration}</span>
                <span className="ml-2">{d.time}</span>
              </div>
            ))}
            {dcWeekly.length > 0 && (
              <details className="pt-1">
                <summary className="cursor-pointer">주간 영업시간 상세</summary>
                <div className="mt-1 space-y-0.5 border-l pl-3">
                  {dcWeekly.map((d, i) => (
                    <div key={`bh-${i}`} className={d.today ? 'font-semibold text-foreground' : ''}>
                      <span>{d.duration}</span>
                      <span className="ml-2">{d.time}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : (
          detail.businessHours && (
            <div className="text-xs text-muted-foreground whitespace-pre-line pl-6">
              {detail.businessHours}
            </div>
          )
        )}
        {detail.phone && (
          <a
            href={`tel:${detail.phone}`}
            className="flex items-center gap-2 pl-6 text-muted-foreground hover:text-foreground"
          >
            <Phone className="size-3.5" />
            {detail.phone}
          </a>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 pl-6 text-xs">
          {detail.sources.naver && (
            <a
              href={detail.sources.naver.rawSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              네이버 지도에서 보기
            </a>
          )}
          {detail.sources.diningcode && (
            <a
              href={detail.sources.diningcode.rawSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              다이닝코드에서 보기
            </a>
          )}
        </div>
      </section>

      {dc && (dc.facilities.length > 0 || dc.tags.length > 0 || dc.wordcloudUrl) && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">다이닝코드 추가 정보</h3>
          {(dc.tags.length > 0 || dc.facilities.length > 0) && (
            <div className="space-y-2">
              {dc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dc.tags.map((t) => (
                    <Badge key={`tag-${t}`} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              {dc.facilities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dc.facilities.map((t) => (
                    <Badge key={`fac-${t}`} variant="outline" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          {dc.wordcloudUrl && (
            <img
              src={dc.wordcloudUrl}
              alt="키워드 워드클라우드"
              className="mx-auto max-h-60 object-contain"
              referrerPolicy="no-referrer"
            />
          )}
        </section>
      )}

      {detail.blogReviews.length > 0 && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">블로그 리뷰 ({detail.blogReviews.length})</h3>
          <ul className="divide-y divide-border">
            {detail.blogReviews.map((b, idx) => (
              <li key={idx}>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-2 py-2.5 hover:bg-muted/40"
                >
                  {b.thumbnailUrls[0] && (
                    <ImgWithFallback
                      src={b.thumbnailUrls[0]}
                      className="size-14 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{b.title}</div>
                    {b.excerpt && (
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {b.excerpt}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {b.authorName && <span>{b.authorName}</span>}
                      {b.date && <span>· {b.date}</span>}
                      <ExternalLink className="size-3" />
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t pt-4 text-[11px] text-muted-foreground">
        등록일 {new Date(detail.firstCrawledAt).toLocaleDateString('ko-KR')}
      </section>
    </div>
  );
};
