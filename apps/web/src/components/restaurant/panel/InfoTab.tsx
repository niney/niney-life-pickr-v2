import { ExternalLink, MapPin, Phone } from 'lucide-react';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import { ImgWithFallback } from '~/components/ImgWithFallback';

interface Props {
  detail: RestaurantPublicDetailType;
}

export const InfoTab = ({ detail }: Props) => {
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
        {detail.businessHours && (
          <div className="text-xs text-muted-foreground whitespace-pre-line pl-6">
            {detail.businessHours}
          </div>
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
        <a
          href={detail.rawSourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 pl-6 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          네이버 지도에서 보기
        </a>
      </section>

      {detail.blogReviews.length > 0 && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">블로그 리뷰 ({detail.blogReviews.length})</h3>
          <ul className="space-y-2">
            {detail.blogReviews.map((b, idx) => (
              <li key={idx}>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-2 rounded-md border p-2 hover:bg-muted/40"
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
