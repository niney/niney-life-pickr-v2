import { ExternalLink, MapPin, Phone } from 'lucide-react';
import type {
  RestaurantPublicDetailType,
  TablingBusinessDayType,
} from '@repo/api-contract';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { Badge } from '~/components/ui/badge';
import { TablingServiceBadges } from './shared';

interface Props {
  detail: RestaurantPublicDetailType;
}

// 테이블링 요일별 영업시간 한 줄 포맷. dayOfWeek 1=월 … 7=일, "HH:MM:SS" 꼬리
// 초는 잘라낸다 — 백엔드 mergeBusinessHours 직렬화와 같은 표기.
const TB_DAY_LABELS = ['', '월', '화', '수', '목', '금', '토', '일'];
const fmtTbTime = (t: string | null): string | null =>
  t ? (/^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : t) : null;
const formatTablingDay = (d: TablingBusinessDayType): string | null => {
  const label = TB_DAY_LABELS[d.dayOfWeek] ?? String(d.dayOfWeek);
  if (d.dayStatus === 'DAY_OFF') return `${label} 휴무`;
  const open = d.openTimeList
    .map((t) => {
      const s = fmtTbTime(t.startTime);
      const e = fmtTbTime(t.endTime);
      return s && e ? `${s}-${e}` : null;
    })
    .filter((v): v is string => v !== null)
    .join(', ');
  if (!open) return null;
  const brk = d.breakTimeList
    .map((t) => {
      const s = fmtTbTime(t.startTime);
      const e = fmtTbTime(t.endTime);
      return s && e ? `${s}-${e}` : null;
    })
    .filter((v): v is string => v !== null)
    .join(', ');
  return brk ? `${label} ${open} (브레이크 ${brk})` : `${label} ${open}`;
};

export const InfoTab = ({ detail }: Props) => {
  const dc = detail.diningcode;
  const tb = detail.tabling;
  const dcWeekly = dc?.businessHoursWeekly ?? [];
  // 주간 상세 펼침 — 테이블링 요일별(가게 직접 관리 데이터)이 있으면 우선,
  // 없으면 DC weekly. 메인 텍스트는 머지된 detail.businessHours (Naver 1순위).
  const tbWeeklyLines = (tb?.businessDays ?? [])
    .map(formatTablingDay)
    .filter((v): v is string => v !== null);
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
        {(detail.businessHours || tbWeeklyLines.length > 0 || dcWeekly.length > 0) && (
          <div className="space-y-1 pl-6 text-xs text-muted-foreground">
            {detail.businessHours && (
              <div className="whitespace-pre-line">{detail.businessHours}</div>
            )}
            {(tbWeeklyLines.length > 0 || dcWeekly.length > 0) && (
              <details className="pt-1">
                <summary className="cursor-pointer">주간 영업시간 상세</summary>
                <div className="mt-1 space-y-0.5 border-l pl-3">
                  {tbWeeklyLines.length > 0
                    ? tbWeeklyLines.map((line, i) => <div key={`tbh-${i}`}>{line}</div>)
                    : dcWeekly.map((d, i) => (
                        <div
                          key={`bh-${i}`}
                          className={d.today ? 'font-semibold text-foreground' : ''}
                        >
                          <span>{d.duration}</span>
                          <span className="ml-2">{d.time}</span>
                        </div>
                      ))}
                </div>
              </details>
            )}
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
          {detail.sources.tabling && (
            <a
              href={detail.sources.tabling.rawSourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              테이블링에서 보기
            </a>
          )}
        </div>
      </section>

      {tb && (
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">테이블링 이용 정보</h3>
          <TablingServiceBadges flags={tb.flags} />
          {tb.favoriteCount !== null && tb.favoriteCount > 0 && (
            <div className="text-xs text-muted-foreground tabular-nums">
              테이블링 즐겨찾기 {tb.favoriteCount.toLocaleString()}
            </div>
          )}
        </section>
      )}

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
