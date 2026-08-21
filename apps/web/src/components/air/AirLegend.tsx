import { ExternalLink } from 'lucide-react';
import { AIR_GRADE_LEVELS, AIR_POLLUTANTS } from '@repo/utils';
import { cn } from '~/lib/utils';
import { AIR_GRADE_STYLE } from './airGrade';

// 등급 기준표(통합대기환경지수 CAI 구간) + 출처/갱신 주기 + 사용한 오퍼레이션 목록.
// 출처표시 의무(공공누리 제3유형)를 여기서 이행한다.

const rangeLabel = (digits: number, lo: number | null, hi: number | null): string => {
  const f = (v: number): string => (digits === 0 ? String(v) : v.toFixed(digits));
  const step = digits === 0 ? 1 : 10 ** -digits;
  if (lo === null && hi !== null) return `0 ~ ${f(hi)}`;
  if (lo !== null && hi !== null) return `${f(lo + step)} ~ ${f(hi)}`;
  if (lo !== null) return `${f(lo + step)} ~`;
  return '-';
};

export const AirLegend = () => (
  <div className="flex flex-col gap-4">
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr className="[&>th]:h-9 [&>th]:px-2 [&>th]:text-left [&>th]:font-medium">
            <th>항목</th>
            <th>단위</th>
            {AIR_GRADE_LEVELS.map((g) => (
              <th key={g}>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className={cn('size-2 rounded-full', AIR_GRADE_STYLE[g].dot)} />
                  {AIR_GRADE_STYLE[g].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AIR_POLLUTANTS.map((p) => {
            const [b1, b2, b3] = p.breakpoints;
            return (
              <tr key={p.key} className="border-t [&>td]:px-2 [&>td]:py-1.5">
                <td>
                  <span className="font-medium">{p.short}</span>{' '}
                  <span className="text-xs text-muted-foreground">{p.label}</span>
                </td>
                <td className="text-xs text-muted-foreground">{p.unit || '지수'}</td>
                <td className="tabular-nums">{rangeLabel(p.digits, null, b1)}</td>
                <td className="tabular-nums">{rangeLabel(p.digits, b1, b2)}</td>
                <td className="tabular-nums">{rangeLabel(p.digits, b2, b3)}</td>
                <td className="tabular-nums">{rangeLabel(p.digits, b3, null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <div className="font-medium text-foreground">갱신 주기</div>
        <ul className="list-inside list-disc space-y-0.5">
          <li>측정값: 매시 정각 측정분이 보통 10~20분 뒤 반영 · 이 페이지는 10분마다 다시 묻습니다.</li>
          <li>PM 24시간 등급은 24시간 이동평균(pm10Value24/pm25Value24) 기준, 1시간 등급은 당시 농도 기준.</li>
          <li>대기질 예보: 하루 4회(05·11·17·23시) 발표 · 주간예보: 매일 오후 발표(D+3~D+6).</li>
          <li>측정 상태(점검및교정·장비점검·자료이상·통신장애)가 있는 항목은 농도가 비어 옵니다.</li>
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <div className="font-medium text-foreground">출처</div>
        <p>
          한국환경공단 에어코리아 · 공공데이터포털{' '}
          <a
            href="https://www.data.go.kr/data/15073861/openapi.do"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline"
          >
            한국환경공단_에어코리아_대기오염정보 (15073861) <ExternalLink className="size-3" />
          </a>
          <br />
          공공누리 제3유형(출처표시·변경금지). 등급 기준은 환경부 통합대기환경지수(CAI) 고시 구간.
        </p>
        <div className="mt-1 font-medium text-foreground">사용한 오퍼레이션</div>
        <ul className="space-y-0.5 font-mono text-[11px]">
          <li>getMsrstnAcctoRltmMesureDnsty <span className="font-sans">— 측정소별 실시간(지금·24시간·30/90일)</span></li>
          <li>getCtprvnRltmMesureDnsty <span className="font-sans">— 시도별 실시간(측정소 현황·전국 비교)</span></li>
          <li>getUnityAirEnvrnIdexSnstiveAboveMsrstnList <span className="font-sans">— 나쁨 이상 측정소</span></li>
          <li>getMinuDustFrcstDspth <span className="font-sans">— 대기질 예보통보</span></li>
          <li>getMinuDustWeekFrcstDspth <span className="font-sans">— 초미세먼지 주간예보</span></li>
        </ul>
      </div>
    </div>
  </div>
);
