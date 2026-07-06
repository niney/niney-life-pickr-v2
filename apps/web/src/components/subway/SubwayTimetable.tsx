import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type {
  SubwayTimetableDirectionType,
  SubwayTimetableResultType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { SubwayLineBadge } from './SubwayLineBadge';
import {
  formatHHMM,
  isSubwayExpressTag,
  parseTimeMin,
  updnLabel,
  type SubwayDayType,
} from './timetableUtils';

const DAY_TYPES: { value: SubwayDayType; label: string }[] = [
  { value: '1', label: '평일' },
  { value: '2', label: '토' },
  { value: '3', label: '휴일' },
];

export interface SubwayTimetableProps {
  stationName: string;
  lineId: string;
  timetable: SubwayTimetableResultType | null;
  isLoading: boolean;
  isError: boolean;
  dayType: SubwayDayType;
  onDayType(dayType: SubwayDayType): void;
  onBack(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SubwayTimetable — 역 시간표 뷰. 도착 패널 영역이 이 뷰로 전환된다('← 도착정보'
// 복귀). 한 응답에 상·하행 모두라 방향 토글은 로컬 상태(재요청 없음), dayType 만
// 상위(SubwayPage)가 소유해 요일 전환 시 재조회한다.
// ─────────────────────────────────────────────────────────────────────────────

export const SubwayTimetable = ({
  stationName,
  lineId,
  timetable,
  isLoading,
  isError,
  dayType,
  onDayType,
  onBack,
}: SubwayTimetableProps) => {
  const directions = timetable?.coverage ? timetable.directions : [];

  // 방향 토글 — 로컬 상태. 응답에 없는 updn 이 선택돼 있으면 렌더 중 첫 방향으로 보정.
  const [selectedUpdn, setSelectedUpdn] = useState('1');
  const activeDir: SubwayTimetableDirectionType | undefined =
    directions.find((d) => d.updn === selectedUpdn) ?? directions[0];
  if (activeDir && activeDir.updn !== selectedUpdn) {
    // 선택 방향이 없어져(요일/역 변경) 첫 방향으로 어긋난 경우 동기화.
    setSelectedUpdn(activeDir.updn);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-3.5" /> 도착정보
          </button>
          <span className="truncate text-sm font-semibold">{stationName}</span>
          <SubwayLineBadge lineId={lineId} className="ml-auto" />
        </div>

        {/* 평일/토/휴일 토글 — 상위가 dayType 소유(재조회). */}
        <div className="flex items-center gap-1">
          {DAY_TYPES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => onDayType(d.value)}
              aria-pressed={dayType === d.value}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                dayType === d.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {d.label}
            </button>
          ))}
          {timetable?.source === 'stale' && (
            <Badge variant="amber" className="ml-auto" title="서울시 API 오류 — 저장된 시간표">
              저장된 시간표
            </Badge>
          )}
        </div>

        {/* 상/하행 토글 — 응답 방향만 노출(재요청 없음). */}
        {directions.length > 1 && (
          <div className="flex items-center gap-1">
            {directions.map((d) => (
              <button
                key={d.updn}
                type="button"
                onClick={() => setSelectedUpdn(d.updn)}
                aria-pressed={activeDir?.updn === d.updn}
                className={cn(
                  'flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeDir?.updn === d.updn
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {updnLabel(d.updn)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <TimetableBody
          isLoading={isLoading}
          isError={isError}
          coverage={timetable?.coverage ?? true}
          dir={activeDir ?? null}
          fetchedAt={timetable?.fetchedAt ?? null}
          // dir·dayType 이 바뀔 때만 자동 스크롤(effect 1회).
          scrollKey={`${dayType}:${activeDir?.updn ?? ''}:${timetable?.stationId ?? ''}`}
        />
      </div>
    </div>
  );
};

const TimetableBody = ({
  isLoading,
  isError,
  coverage,
  dir,
  fetchedAt,
  scrollKey,
}: {
  isLoading: boolean;
  isError: boolean;
  coverage: boolean;
  dir: SubwayTimetableDirectionType | null;
  fetchedAt: string | null;
  scrollKey: string;
}) => {
  // 현재 시각 이후 첫 열차 — 하이라이트 + 자동 스크롤 기준. 렌더 중 파생(분).
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const trains = dir?.trains ?? [];
  const nextIdx = trains.findIndex((t) => parseTimeMin(t.arriveTime) >= nowMin);

  // 자동 스크롤 — 마운트/토글(scrollKey 변경) 시 1회. 다음 열차 행을 중앙으로.
  const nextRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: 'center' });
  }, [scrollKey]);

  if (isLoading && !dir) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 시간표 불러오는 중…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-destructive">
        시간표를 불러오지 못했습니다.
      </div>
    );
  }
  if (!coverage) {
    return (
      <Hint>이 노선은 시간표를 제공하지 않아요 (광역·경전철 노선).</Hint>
    );
  }
  if (!dir || trains.length === 0) {
    return <Hint>시간표 정보가 없습니다.</Hint>;
  }

  return (
    <div className="space-y-3">
      {/* 첫차/막차 요약 — 상단 고정 카드. */}
      <div className="flex items-center justify-around rounded-md border bg-muted/40 px-3 py-2 text-sm tabular-nums">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">첫차</div>
          <div className="font-semibold">{dir.firstTrain ? formatHHMM(dir.firstTrain) : '—'}</div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="text-center">
          <div className="text-xs text-muted-foreground">막차</div>
          <div className="font-semibold">{dir.lastTrain ? formatHHMM(dir.lastTrain) : '—'}</div>
        </div>
      </div>

      <ul className="flex flex-col gap-0.5" data-testid="subway-timetable-list">
        {trains.map((t, idx) => {
          const isNext = idx === nextIdx;
          const express = isSubwayExpressTag(t.expressTag);
          return (
            <li
              key={`${t.trainNo ?? 'x'}-${idx}`}
              ref={isNext ? nextRef : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
                isNext && 'bg-emerald-50 dark:bg-emerald-950/40',
              )}
            >
              <span
                className={cn(
                  'w-12 shrink-0 tabular-nums',
                  isNext ? 'font-semibold text-emerald-700 dark:text-emerald-400' : '',
                )}
              >
                {formatHHMM(t.arriveTime)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {t.destination ? `${t.destination}행` : ''}
              </span>
              {express && (
                <Badge variant="amber" className="shrink-0">
                  급행
                </Badge>
              )}
            </li>
          );
        })}
      </ul>

      {fetchedAt && (
        <p className="px-1 text-xs text-muted-foreground">
          시간표는 참고용이며 실제 운행과 다를 수 있어요.
        </p>
      )}
    </div>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);
