import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { HikingCourseDetailType, HikingSignGuideType } from '@repo/api-contract';
import {
  HIKING_DIFFICULTY_LABEL,
  HIKING_POI_COLOR,
  HIKING_SHAPE_LABEL,
  formatHikingDuration,
  formatHikingEle,
  formatHikingLength,
  hikingPoiLabel,
  isHikingMapPoiCategory,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { CourseAround } from './CourseAround';
import { CourseConditions } from './CourseConditions';
import { ElevationProfile } from './ElevationProfile';
import { DIFFICULTY_CHIP_CLASS, courseDifficultyReasons, courseTimeBreakdown, formatAtM } from './hikingFormat';

// 코스 상세 패널 — 숫자(거리·예상 시간·난이도·오르막·내리막·최고 고도)·형태와 방향별 시간·난이도 까닭·산행 조건(날짜·출발
// 시각별 날씨·대기·산불·하산)·고도 그래프·험한 노면·코스 지점 목록(지도와 같은 분류, 갈림길은 이 코스로 가는 길·온 길)·가는 법·
// 주변(정류장·주차·화장실·하산 후 맛집). 지점을 누르면 지도에서 강조된다.

interface Props {
  course: HikingCourseDetailType;
  selectedPoiId: string | null;
  onSelectPoi: (id: string) => void;
  onHover: (atM: number | null) => void;
  onBack: () => void;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border px-2 py-1.5">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-sm font-semibold tabular-nums">{value}</div>
  </div>
);

const formatOuting = (c: HikingCourseDetailType): string => {
  const min = c.roundTripMin ?? c.timeMin;
  return min === null ? '—' : formatHikingDuration(min);
};

// 가는 길 → 다른 길 → 온 길.
const WAY_ORDER = { next: 0, other: 1, prev: 2 } as const;
const sortGuide = (g: readonly HikingSignGuideType[]): HikingSignGuideType[] =>
  [...g].sort((a, b) => WAY_ORDER[a.way ?? 'other'] - WAY_ORDER[b.way ?? 'other']);

export const CourseDetail = ({ course, selectedPoiId, onSelectPoi, onHover, onBack }: Props) => {
  const pois = useMemo(() => course.pois.filter((p) => isHikingMapPoiCategory(p.category)), [course.pois]);
  const breakdown = courseTimeBreakdown(course);
  const reasons = courseDifficultyReasons(course);
  return (
    <div className="flex flex-col gap-3" data-testid="hiking-course">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {course.mountain.name} 코스 목록
      </button>
      <h2 className="text-base font-semibold leading-snug">{course.name}</h2>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="거리" value={formatHikingLength(course.lengthM)} />
        <Stat label={course.roundTripMin !== null ? '왕복 예상' : '예상 시간'} value={formatOuting(course)} />
        <Stat label="난이도" value={course.difficulty ? HIKING_DIFFICULTY_LABEL[course.difficulty] : '—'} />
        <Stat label="오르막" value={course.gainM !== null ? formatHikingEle(course.gainM) : '—'} />
        <Stat label="내리막" value={course.lossM !== null ? formatHikingEle(course.lossM) : '—'} />
        <Stat label="최고 고도" value={course.maxEle !== null ? formatHikingEle(course.maxEle) : '—'} />
      </div>
      <div className="flex flex-col gap-0.5 text-xs" data-testid="hiking-course-time">
        <p>
          <span className="font-medium">{HIKING_SHAPE_LABEL[course.shape]}</span>
          {breakdown && <span className="text-muted-foreground"> · {breakdown}</span>}
        </p>
        {course.difficulty && reasons.length > 0 && (
          <p>
            <span className={cn('rounded px-1 font-medium', DIFFICULTY_CHIP_CLASS[course.difficulty])}>{HIKING_DIFFICULTY_LABEL[course.difficulty]}</span>{' '}
            <span className="text-muted-foreground">{reasons.join(' · ')}</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {course.timeMin !== null
            ? '예상 시간은 경사별 걷는 속도로 계산한 추정입니다(짧은 휴식 포함, 점심·긴 휴식 제외).'
            : '고도 기록이 없어 예상 시간·난이도를 계산하지 못했습니다.'}
        </p>
        {course.source === 'peak' && (
          <p className="text-[11px] text-muted-foreground" data-testid="hiking-course-peak-note">
            전국 주요 봉우리 자료라 선과 고도만 있습니다 — 이정표·노면 정보가 없고, 코스 지점은 선 가까이의 봉우리·등산 지점을 붙인 것입니다.
          </p>
        )}
        {course.source === 'network' && (
          <p className="text-[11px] text-muted-foreground" data-testid="hiking-course-peak-note">
            전국 주요 봉우리의 등산로 구간을 갈림길에서 이어 만든 길입니다(들머리에서 정상까지 가장 짧은 길). 실제 안내 코스와 다를 수 있고,
            이정표·노면 정보가 없습니다. 갈림길의 가는 길은 이 코스 기준입니다.
          </p>
        )}
      </div>
      <CourseConditions course={course} />
      {course.gapCount > 0 && (
        <p className="text-xs text-muted-foreground">
          원본 기록이 {course.gapCount}곳에서 끊겨(직선 {formatHikingLength(course.gapM)}) 선이 이어지지 않는 곳이 있습니다. 거리·예상 시간에는 끊긴
          곳을 넣지 않았습니다.
        </p>
      )}
      <ElevationProfile profile={course.profile} lengthM={course.lengthM} surfaces={course.surfaces} pois={course.pois} onHover={onHover} />
      {course.roughSurfaces.length > 0 && (
        <p className="text-xs">
          <span className="font-medium">험한 구간</span> <span className="text-muted-foreground">{course.roughSurfaces.join(' · ')}</span>
        </p>
      )}
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">코스 지점</h3>
        <ol className="flex flex-col divide-y rounded-md border" data-testid="hiking-pois">
          {pois.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelectPoi(p.id)}
                className={cn('flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-accent', p.id === selectedPoiId && 'bg-accent')}
                aria-pressed={p.id === selectedPoiId}
              >
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: isHikingMapPoiCategory(p.category) ? HIKING_POI_COLOR[p.category] : undefined }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="shrink-0 text-[11px] text-muted-foreground">{hikingPoiLabel(p.category)}</span>
                    <span className="truncate text-sm">{p.name ?? hikingPoiLabel(p.category)}</span>
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatAtM(p.atM)}
                      {p.ele !== null && ` · ${formatHikingEle(p.ele)}`}
                    </span>
                  </span>
                  {p.guide.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      {sortGuide(p.guide).map((g, i) => (
                        <span key={i} className={cn(g.way === 'next' && 'font-medium text-foreground', g.way === 'prev' && 'opacity-70')}>
                          {g.way === 'next' ? '가는 길 ' : g.way === 'prev' ? '온 길 ' : ''}
                          {g.dest}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
          {pois.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted-foreground">표시할 지점이 없습니다.</li>}
        </ol>
      </section>
      <CourseAround course={course} />
    </div>
  );
};
