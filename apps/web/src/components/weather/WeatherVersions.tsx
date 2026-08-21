import type {
  WeatherForecastResultType,
  WeatherMidResultType,
  WeatherNowcastResultType,
  WeatherVersionsResultType,
} from '@repo/api-contract';
import { formatRelativeMin } from '@repo/utils';
import { formatBaseLabel, formatTmFcLabel } from './weatherFormat';

// 발표 정보 — 이 화면이 어떤 발표분(base)을 쓰고 있는지 + getFcstVersion 이 말하는 파일
// 생성 시각. 폴백/저장본 여부도 여기서 한눈에.

interface Props {
  versions: WeatherVersionsResultType | null;
  nowcast: WeatherNowcastResultType | null;
  forecast: WeatherForecastResultType | null;
  mid: WeatherMidResultType | null;
}

const fmtIso = (iso: string | null): string => {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}:${m[6]}` : iso;
};

export const WeatherVersions = ({ versions, nowcast, forecast, mid }: Props) => {
  const rows: Array<{ key: string; label: string; op: string; base: string; extra: string; version: string }> = [
    {
      key: 'ncst',
      label: '초단기실황',
      op: 'getUltraSrtNcst',
      base: formatBaseLabel(nowcast?.ncstBase) ?? '-',
      extra: [nowcast?.ncstFallback ? '직전 발표분' : null, nowcast?.stale ? '저장본' : null].filter(Boolean).join(' · '),
      version: fmtIso(versions?.items.find((i) => i.ftype === 'ODAM')?.versionAt ?? null),
    },
    {
      key: 'ultra',
      label: '초단기예보',
      op: 'getUltraSrtFcst',
      base: formatBaseLabel(nowcast?.ultraBase) ?? '-',
      extra: [nowcast?.ultraFallback ? '직전 발표분' : null, nowcast?.stale ? '저장본' : null].filter(Boolean).join(' · '),
      version: fmtIso(versions?.items.find((i) => i.ftype === 'VSRT')?.versionAt ?? null),
    },
    {
      key: 'vilage',
      label: '단기예보',
      op: 'getVilageFcst',
      base: formatBaseLabel(forecast?.base) ?? '-',
      extra: [forecast?.fallback ? '직전 발표분' : null, forecast?.stale ? '저장본' : null].filter(Boolean).join(' · '),
      version: fmtIso(versions?.items.find((i) => i.ftype === 'SHRT')?.versionAt ?? null),
    },
    {
      key: 'mid',
      label: '중기예보(육상·기온·전망)',
      op: 'getMidLandFcst · getMidTa · getMidFcst',
      base: formatTmFcLabel(mid?.tmFc) ?? '-',
      extra: [mid?.fallback ? '직전 발표분' : null, mid?.stale ? '저장본' : null].filter(Boolean).join(' · '),
      version: '-',
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="[&>th]:h-9 [&>th]:px-2 [&>th]:text-left [&>th]:font-medium">
              <th>자료</th>
              <th>오퍼레이션</th>
              <th>사용 중인 발표 기준</th>
              <th>파일 생성(getFcstVersion)</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t [&>td]:px-2 [&>td]:py-1.5">
                <td className="font-medium">{r.label}</td>
                <td className="font-mono text-[11px] text-muted-foreground">{r.op}</td>
                <td className="tabular-nums">{r.base}</td>
                <td className="tabular-nums">{r.version}</td>
                <td className="text-xs text-muted-foreground">{r.extra || '정상'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {versions ? `버전 조회 ${formatRelativeMin(versions.fetchedAt)}` : '버전 조회 전'} · 초단기실황 매시 10분, 초단기예보 매시 45분,
        단기예보 02·05·08·11·14·17·20·23시 +10분, 중기예보 06·18시 발표. 서버는 다음 발표 시각까지 캐시해 같은 지점을 여러
        명이 봐도 발표당 1회만 기상청에 묻습니다.
      </p>
    </div>
  );
};
