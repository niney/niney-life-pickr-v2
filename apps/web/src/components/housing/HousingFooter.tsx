import { ExternalLink } from 'lucide-react';
import type { HousingStatusResultType } from '@repo/api-contract';
import {
  HOUSING_DEAL_COLOR,
  HOUSING_DEAL_TYPES,
  HOUSING_DEAL_TYPE_LABEL,
  HOUSING_EMPTY_COLOR,
  HOUSING_FALLBACK_COLOR,
  formatHousingYm,
} from '@repo/utils';

// 범례 + 적재 상태 + 출처 표시 — 패널 하단. 색은 항상 글자와 함께(색만으로 뜻을 전하지 않는다).
// 출처: 국토교통부 실거래가 공개시스템(아파트 매매 상세 15126468·전월세 15126474) + 한국부동산원
// 공동주택 단지 식별정보(15106861) + 국토교통부 주택 공시가격 정보(3073746) + K-apt 공동주택관리정보
// 시스템(관리비 공개 의무단지) + 건축HUB 건축물대장(15134735) — 공공저작물 출처표시. 단지 좌표는 주소를
// VWorld 지오코더로 변환한 값.

interface Props {
  status: HousingStatusResultType | undefined;
}

const ymRange = (from: string | null, to: string | null): string => {
  const a = formatHousingYm(from);
  const b = formatHousingYm(to);
  if (a && b) return `${a}~${b}`;
  return a ?? b ?? '-';
};

const n = (v: number): string => v.toLocaleString('ko-KR');

export const HousingFooter = ({ status }: Props) => {
  const c = status?.complexes;
  const t = status?.trades;
  const r = status?.rents;
  const o = status?.officialPrices;
  const k = status?.kapt;
  const b = status?.buildings;
  const geocodedPct = c && c.count > 0 ? Math.round((c.geocoded / c.count) * 100) : null;
  // 보강 상태 — 적재된 것만 이어 붙인다.
  const extras: string[] = [];
  if (o?.loaded && o.year !== null) extras.push(`공시가격 ${o.year}(${n(o.complexes)}단지)`);
  if (k?.loaded && k.matched > 0) extras.push(`단지정보 K-apt ${n(k.matched)}`);
  if (b && b.fetched > 0) extras.push(`건축물대장 ${n(b.fetched)}/${n(b.total)}`);
  return (
    <div className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="housing-footer">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {HOUSING_DEAL_TYPES.map((d) => (
          <span key={d} className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: HOUSING_DEAL_COLOR[d] }} />
            {HOUSING_DEAL_TYPE_LABEL[d]} 최근 실거래가
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-2 w-3 rounded-sm" style={{ backgroundColor: HOUSING_FALLBACK_COLOR }} />
          다른 조건의 마지막 거래
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-2 w-3 rounded-sm border border-dashed" style={{ borderColor: HOUSING_FALLBACK_COLOR }} />
          공시가격(중위)
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: HOUSING_EMPTY_COLOR }} />
          거래 없음
        </span>
        <span>임대 = K-apt 분양형태 임대(실거래 없음이 정상)</span>
        <span>알약 = 그 칸 단지들의 평균 평당가(확대하면 단지별)</span>
      </div>
      <div className="mt-1">
        {c?.loaded ? `단지 ${n(c.count)}개${geocodedPct !== null ? `(좌표 ${geocodedPct}%)` : ''}` : '단지 데이터 미적재'}
        {' · '}
        {t?.loaded ? `매매 ${n(t.count)}건(${ymRange(t.fromYm, t.toYm)})` : '매매 미적재'}
        {' · '}
        {r?.loaded ? `전월세 ${n(r.count)}건` : '전월세 미적재'}
        {extras.map((e) => (
          <span key={e}>{` · ${e}`}</span>
        ))}
      </div>
      <div className="mt-0.5">
        출처{' '}
        <a
          href="https://rt.molit.go.kr"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          국토교통부 실거래가 공개시스템 <ExternalLink className="size-3" />
        </a>
        (
        <a href="https://www.data.go.kr/data/15126468/openapi.do" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          매매
        </a>
        ·
        <a href="https://www.data.go.kr/data/15126474/openapi.do" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          전월세
        </a>
        ) ·{' '}
        <a
          href="https://www.data.go.kr/data/15106861/fileData.do"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          한국부동산원 공동주택 단지 식별정보 <ExternalLink className="size-3" />
        </a>{' '}
        ·{' '}
        <a
          href="https://www.data.go.kr/data/3073746/fileData.do"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          국토교통부 주택 공시가격 정보 <ExternalLink className="size-3" />
        </a>{' '}
        ·{' '}
        <a
          href="https://www.k-apt.go.kr"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          K-apt 공동주택관리정보시스템 <ExternalLink className="size-3" />
        </a>{' '}
        ·{' '}
        <a
          href="https://www.data.go.kr/data/15134735/openapi.do"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          건축HUB 건축물대장 <ExternalLink className="size-3" />
        </a>{' '}
        · 단지 좌표는 VWorld 지오코더로 주소를 변환한 값
      </div>
    </div>
  );
};
