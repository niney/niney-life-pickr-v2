import { useState } from 'react';
import { ArrowLeft, Mountain as MountainIcon, Route as RouteIcon } from 'lucide-react';
import { Routes, type HikingCourseSummaryType, type HikingMountainDetailType } from '@repo/api-contract';
import { HIKING_DIFFICULTY_LABEL, HIKING_SHAPE_LABEL, formatHikingEle, formatHikingLength, hikingCourseColor } from '@repo/utils';
import { cn } from '~/lib/utils';
import { DIFFICULTY_CHIP_CLASS, courseOutingLabel, formatHikingDistance, officialCourseLines } from './hikingFormat';

// 산 상세 패널 — 사진·높이·소재지·국립공원·선정 이유·개관(접기)·산림청 공식 코스 문구·이 산의 봉우리·코스 카드(지도 선 색과 같은
// 점, 국립공원 공식 코스가 먼저 — 안내 소요시간·난이도 원문)·이어진 봉우리. 전국 주요 봉우리(kind peak)는 산정보 소개(맞을 때만)와
// "선·고도만 있는 자료" 안내.

interface Props {
  mountain: HikingMountainDetailType;
  onSelectCourse: (id: string) => void;
  onSelectMountain: (id: string) => void;
  onBack: () => void;
}

export const CourseFacts = ({ course, className }: { course: HikingCourseSummaryType; className?: string }) => {
  const outing = courseOutingLabel(course);
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground', className)}>
      {course.difficulty && (
        <span className={cn('rounded px-1 font-medium', DIFFICULTY_CHIP_CLASS[course.difficulty])}>{HIKING_DIFFICULTY_LABEL[course.difficulty]}</span>
      )}
      <span className="tabular-nums">{formatHikingLength(course.lengthM)}</span>
      {outing && <span className="tabular-nums">{outing}</span>}
      {course.gainM !== null && <span className="tabular-nums">오르막 {formatHikingEle(course.gainM)}</span>}
      <span>{HIKING_SHAPE_LABEL[course.shape]}</span>
      {course.roughSurfaces.map((s) => (
        <span key={s} className="rounded bg-red-500/10 px-1 text-red-700 dark:text-red-300">
          {s}
        </span>
      ))}
    </span>
  );
};

export const MountainDetail = ({ mountain, onSelectCourse, onSelectMountain, onBack }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const official = officialCourseLines(mountain.officialCourses);
  const isPeak = mountain.kind === 'peak';
  return (
    <div className="flex flex-col gap-3" data-testid="hiking-mountain">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> 산 목록
      </button>
      {mountain.images.length > 0 && (
        <div className="flex snap-x gap-2 overflow-x-auto">
          {mountain.images.map((no) => (
            <img
              key={no}
              src={Routes.Hiking.image(mountain.id, no)}
              alt={`${mountain.name} 사진 ${no}`}
              loading="lazy"
              className="aspect-[4/3] w-56 shrink-0 snap-start rounded-md bg-muted object-cover"
            />
          ))}
        </div>
      )}
      <div>
        <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
          {mountain.name}
          {mountain.heightM !== null && <span className="text-sm font-normal tabular-nums text-muted-foreground">{formatHikingEle(mountain.heightM)}</span>}
          {mountain.kind === 'top100' && (
            <span className="rounded bg-emerald-500/10 px-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">100대 명산</span>
          )}
          {mountain.park && (
            <span className="rounded bg-sky-500/10 px-1 text-[11px] font-medium text-sky-700 dark:text-sky-300" data-testid="hiking-mountain-park">
              {mountain.park}
            </span>
          )}
        </h2>
        {mountain.subtitle && <p className="text-sm text-muted-foreground">{mountain.subtitle}</p>}
        {mountain.area && <p className="mt-0.5 text-xs text-muted-foreground">{mountain.area}</p>}
      </div>
      {mountain.reason && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground">100대 명산 선정 이유</h3>
          <p className="mt-0.5 text-sm leading-relaxed">{mountain.reason}</p>
        </section>
      )}
      {mountain.overview && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground">{isPeak ? '소개(산림청 산정보)' : '개관'}</h3>
          <p className={cn('mt-0.5 whitespace-pre-line text-sm leading-relaxed', !expanded && 'line-clamp-4')}>{mountain.overview}</p>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-primary hover:underline">
            {expanded ? '접기' : '더 보기'}
          </button>
        </section>
      )}
      {official.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground">산림청 안내 코스</h3>
          <ul className="mt-0.5 flex flex-col gap-0.5 text-xs leading-relaxed">
            {official.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      {mountain.peaks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground">이 산의 봉우리</h3>
          <p className="mt-0.5 text-xs leading-relaxed">{mountain.peaks.join(' · ')}</p>
        </section>
      )}
      <section className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1 text-sm font-semibold">
          <RouteIcon className="size-4" /> 코스 {mountain.courses.length}개
        </h3>
        {isPeak && (
          <p className="text-[11px] text-muted-foreground">전국 주요 봉우리 자료라 선과 고도만 있습니다(이정표·노면 없음). 예상 시간·난이도는 고도로 계산합니다.</p>
        )}
        <ol className="flex flex-col divide-y rounded-md border" data-testid="hiking-courses">
          {mountain.courses.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => onSelectCourse(c.id)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent">
                <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: hikingCourseColor(i) }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {c.name}
                    {c.park ? (
                      <span className="ml-1.5 rounded bg-sky-500/10 px-1 align-middle text-[10px] font-medium text-sky-700 dark:text-sky-300">국립공원 코스</span>
                    ) : (
                      <>
                        {/* 100대 명산에 합친 봉우리 코스 — 이정표·노면이 없는 자료라 표시만 해 둔다. */}
                        {!isPeak && c.source === 'peak' && (
                          <span className="ml-1.5 rounded bg-muted px-1 align-middle text-[10px] font-normal text-muted-foreground">봉우리 자료</span>
                        )}
                        {c.source === 'network' && (
                          <span className="ml-1.5 rounded bg-muted px-1 align-middle text-[10px] font-normal text-muted-foreground">이어 만든 길</span>
                        )}
                      </>
                    )}
                  </span>
                  <CourseFacts course={c} />
                  {/* 국립공원 안내 문구는 원문 그대로(공공누리 변경금지). */}
                  {c.park && (
                    <span className="block text-[11px] text-sky-800 dark:text-sky-300">
                      안내 {c.park.duration} · 난이도 {c.park.difficulty}
                      {c.park.schedule && c.park.schedule !== '당일' && ` · ${c.park.schedule}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      {mountain.neighbors.length > 0 && (
        <section className="flex flex-col gap-1.5" data-testid="hiking-neighbors">
          <h3 className="flex items-center gap-1 text-sm font-semibold">
            <MountainIcon className="size-4" /> 이어진 봉우리
          </h3>
          <p className="text-[11px] text-muted-foreground">이 산 코스가 지나거나, 그 산 코스가 이 산 정상을 지나는 곳입니다.</p>
          <ul className="flex flex-wrap gap-1.5">
            {mountain.neighbors.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelectMountain(n.id)}
                  className="inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
                >
                  <span className="font-medium">{n.name}</span>
                  {n.heightM !== null && <span className="tabular-nums text-muted-foreground">{formatHikingEle(n.heightM)}</span>}
                  <span className="tabular-nums text-muted-foreground">· {formatHikingDistance(n.distM)}</span>
                  {n.kind === 'top100' && <span className="text-[10px] text-emerald-700 dark:text-emerald-300">100대</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
