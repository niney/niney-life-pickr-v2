import { AlertTriangle } from 'lucide-react';
import type { AirMeasureItemType } from '@repo/api-contract';
import {
  airPollutantMeta,
  formatAirValue,
  type AirGradeLevel,
  type AirPollutant,
} from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import { airGradeStyle } from './airGrade';
import { AirGradeBadge } from './AirPrimitives';

// 선택 측정소의 지금 — 통합대기환경지수 히어로(≥48px, 본문과 같은 sans, 비례 숫자)
// + 6개 항목 타일(농도·단위·등급). 등급은 업스트림 값을 그대로 쓴다(24시간 등급이
// 대표, PM 은 1시간 등급도 병기). 측정 상태(Flag)가 있으면 해당 타일에 경고.

interface Props {
  latest: AirMeasureItemType;
  // 재조회/측정소 전환 중 이전 데이터 표시 — 디밍.
  dim?: boolean;
}

type TileKey = Exclude<AirPollutant, 'khai'>;
const TILE_KEYS: TileKey[] = ['pm10', 'pm25', 'o3', 'no2', 'co', 'so2'];

const gradeOf = (m: AirMeasureItemType, k: TileKey): AirGradeLevel | null => {
  switch (k) {
    case 'pm10':
      return m.pm10Grade ?? m.pm10Grade1h;
    case 'pm25':
      return m.pm25Grade ?? m.pm25Grade1h;
    case 'o3':
      return m.o3Grade;
    case 'no2':
      return m.no2Grade;
    case 'co':
      return m.coGrade;
    case 'so2':
      return m.so2Grade;
  }
};

export const AirStationHero = ({ latest, dim }: Props) => {
  const khaiStyle = airGradeStyle(latest.khaiGrade);
  const flagged = TILE_KEYS.filter((k) => latest.flags[k]);

  return (
    <div className={cn('grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]', dim && 'opacity-60')}>
      {/* 히어로 — 통합대기환경지수 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xl font-semibold tracking-tight">{latest.stationName}</h3>
          {latest.mangName && <Badge variant="secondary">{latest.mangName}</Badge>}
          {latest.sidoName && <span className="text-xs text-muted-foreground">{latest.sidoName}</span>}
        </div>
        <div className="flex items-end gap-3">
          <div className="text-[56px] font-semibold leading-none tracking-tight">
            {latest.khai === null ? '—' : formatAirValue('khai', latest.khai)}
          </div>
          <div className="pb-1">
            <div className={cn('text-2xl font-semibold leading-none', khaiStyle.ink)}>
              {latest.khaiGrade ? khaiStyle.label : '지수 없음'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">통합대기환경지수(CAI)</div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-1">
            <dt className="shrink-0">측정시각</dt>
            <dd className="text-foreground tabular-nums">{latest.dataTime ?? '-'}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0">측정소코드</dt>
            <dd className="text-foreground tabular-nums">{latest.stationCode ?? '-'}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0">PM10 24h 평균</dt>
            <dd className="text-foreground tabular-nums">
              {formatAirValue('pm10', latest.pm10Avg24)} ㎍/㎥
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="shrink-0">PM2.5 24h 평균</dt>
            <dd className="text-foreground tabular-nums">
              {formatAirValue('pm25', latest.pm25Avg24)} ㎍/㎥
            </dd>
          </div>
        </dl>
        {flagged.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              측정 상태 안내:{' '}
              {flagged
                .map((k) => `${airPollutantMeta(k).short} ${latest.flags[k]}`)
                .join(', ')}{' '}
              — 해당 항목은 농도가 비어 있습니다.
            </span>
          </div>
        )}
      </div>

      {/* 항목 타일 */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="항목별 농도">
        {TILE_KEYS.map((k) => {
          const meta = airPollutantMeta(k);
          const grade = gradeOf(latest, k);
          const style = airGradeStyle(grade);
          const value = latest[k];
          const flag = latest.flags[k];
          const oneHour = k === 'pm10' ? latest.pm10Grade1h : k === 'pm25' ? latest.pm25Grade1h : null;
          return (
            <li
              key={k}
              className={cn('flex flex-col gap-1 rounded-lg border p-3', flag && 'border-amber-500/40')}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{meta.short}</span> {meta.label}
                </span>
                <span aria-hidden className={cn('size-2 rounded-full', style.dot)} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold leading-none">{formatAirValue(k, value)}</span>
                {meta.unit && <span className="text-xs text-muted-foreground">{meta.unit}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <AirGradeBadge grade={grade} />
                {oneHour && oneHour !== grade && (
                  <span className="text-[11px] text-muted-foreground">1시간 {airGradeStyle(oneHour).label}</span>
                )}
                {flag && (
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">{flag}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
