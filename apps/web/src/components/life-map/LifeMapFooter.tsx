import { ExternalLink } from 'lucide-react';
import type { LifeMapStatusResultType } from '@repo/api-contract';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_CCTV_PURPOSE_GROUPS,
  LIFE_CCTV_PURPOSE_GROUP_LABEL,
  LIFE_TOILET_COLOR,
} from '@repo/utils';

// 범례 + 적재 상태 + 출처 표시 — 패널 하단. 색은 항상 글자와 함께(색만으로 뜻을 전하지 않는다).
// 출처: 지방행정인허가데이터개방(localdata.go.kr) 전국 CCTV 설치 현황·공중화장실. 화장실 좌표는
// 주소를 VWorld 지오코더로 변환한 값.

interface Props {
  status: LifeMapStatusResultType | undefined;
}

export const LifeMapFooter = ({ status }: Props) => {
  const cctv = status?.layers.find((l) => l.layer === 'cctv');
  const toilet = status?.layers.find((l) => l.layer === 'toilet');
  const geocodedPct =
    toilet && toilet.count > 0 && toilet.geocoded !== null ? Math.round((toilet.geocoded / toilet.count) * 100) : null;
  return (
    <div className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="life-map-footer">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {LIFE_CCTV_PURPOSE_GROUPS.map((g) => (
          <span key={g} className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: LIFE_CCTV_GROUP_COLOR[g] }} />
            CCTV {LIFE_CCTV_PURPOSE_GROUP_LABEL[g]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: LIFE_TOILET_COLOR }} />
          공중화장실
        </span>
        <span>숫자 버블 = 그 칸의 건수(확대하면 개별 지점)</span>
      </div>
      <div className="mt-1">
        {cctv?.loaded ? `CCTV ${cctv.count.toLocaleString('ko-KR')}개(기준 ${cctv.baseDate ?? '-'})` : 'CCTV 데이터 미적재'}
        {' · '}
        {toilet?.loaded
          ? `화장실 ${toilet.count.toLocaleString('ko-KR')}개(기준 ${toilet.baseDate ?? '-'}${geocodedPct !== null ? `, 좌표 ${geocodedPct}%` : ''})`
          : '화장실 데이터 미적재'}
      </div>
      <div className="mt-0.5">
        출처{' '}
        <a
          href="https://www.localdata.go.kr"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          지방행정인허가데이터개방 <ExternalLink className="size-3" />
        </a>{' '}
        전국 CCTV 설치 현황·공중화장실 · 화장실 좌표는 VWorld 지오코더로 주소를 변환한 값
      </div>
    </div>
  );
};
