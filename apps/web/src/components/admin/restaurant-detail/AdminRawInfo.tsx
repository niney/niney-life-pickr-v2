import type { RestaurantDetailType } from '@repo/api-contract';
import { safeExternalHref } from '~/lib/utils';

// "정보" 탭 아래 운영 정보 — 공개 정보 탭은 세 출처를 머지한 값을 보여 주므로, 어드민이 확인해야
// 하는 원시 값(예전 상세의 정보·영업시간 섹션: 네이버 스냅샷 그대로)과 식별자·출처 행을 따로 둔다.

const SOURCE_LABEL: Record<string, string> = {
  naver: '네이버',
  diningcode: '다이닝코드',
  tabling: '테이블링',
};

const fmt = (iso: string): string => new Date(iso).toLocaleString('ko-KR');

export const AdminRawInfo = ({ detail }: { detail: RestaurantDetailType }) => {
  const s = detail.snapshot;
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'placeId', value: detail.placeId },
    { label: 'canonicalId', value: detail.canonicalId },
    { label: '주소', value: detail.address },
    { label: '도로명', value: s.roadAddress },
    { label: '전화', value: detail.phone },
    {
      label: '좌표',
      value: s.latitude !== null && s.longitude !== null ? `${s.latitude}, ${s.longitude}` : null,
    },
    { label: '최초 등록', value: fmt(detail.firstCrawledAt) },
    { label: '마지막 크롤', value: fmt(detail.lastCrawledAt) },
  ];
  return (
    <section className="space-y-4 border-t p-4">
      <div>
        <h3 className="text-sm font-semibold">운영 정보</h3>
        <p className="text-[11px] text-muted-foreground">
          네이버 스냅샷 원시 값 — 위 영업 정보는 세 출처를 합친 결과라 다를 수 있습니다.
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        {rows.map((it) => (
          <div key={it.label} className="contents">
            <dt className="text-muted-foreground">{it.label}</dt>
            <dd className="min-w-0 break-all">{it.value ?? '—'}</dd>
          </div>
        ))}
        {s.businessHours && s.businessHours.trim().length > 0 && (
          <div className="contents">
            <dt className="text-muted-foreground">영업시간 원문</dt>
            <dd>
              <pre className="whitespace-pre-wrap font-sans text-muted-foreground">
                {s.businessHours}
              </pre>
            </dd>
          </div>
        )}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="py-1.5 pr-3 font-medium">출처</th>
              <th className="py-1.5 pr-3 font-medium">sourceId</th>
              <th className="py-1.5 pr-3 font-medium">등록</th>
              <th className="py-1.5 pr-3 font-medium">마지막 수집</th>
              <th className="py-1.5 pr-3 text-right font-medium">DB 리뷰</th>
              <th className="py-1.5 pr-3 text-right font-medium">요약 완료/실패</th>
              <th className="py-1.5 font-medium">원본</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {detail.sources.map((src) => (
              <tr key={src.restaurantId}>
                <td className="py-1.5 pr-3">{SOURCE_LABEL[src.source] ?? src.source}</td>
                <td className="max-w-[12rem] truncate py-1.5 pr-3 font-mono" title={src.sourceId}>
                  {src.sourceId}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">{fmt(src.firstCrawledAt)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{fmt(src.lastCrawledAt)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {src.totalReviews.toLocaleString()}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {src.summaryDone.toLocaleString()}/{src.summaryFailed.toLocaleString()}
                </td>
                <td className="py-1.5">
                  <a
                    href={safeExternalHref(src.rawSourceUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    열기
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
