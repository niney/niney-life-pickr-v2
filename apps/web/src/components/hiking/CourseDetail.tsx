import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { HikingCourseDetailType } from '@repo/api-contract';
import {
  HIKING_POI_COLOR,
  HIKING_SIGN_DIR_ARROW,
  HIKING_SIGN_DIR_LABEL,
  formatHikingEle,
  formatHikingLength,
  hikingPoiLabel,
  isHikingMapPoiCategory,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { ElevationProfile } from './ElevationProfile';
import { formatAtM } from './hikingFormat';

// 코스 상세 패널 — 숫자(거리·오르막·내리막·최고 고도·형태)·고도 그래프·험한 노면·코스 지점 목록(지도와 같은 분류,
// 갈림길은 이정표 방향). 지점을 누르면 지도에서 강조된다.

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

export const CourseDetail = ({ course, selectedPoiId, onSelectPoi, onHover, onBack }: Props) => {
  const pois = useMemo(() => course.pois.filter((p) => isHikingMapPoiCategory(p.category)), [course.pois]);
  return (
    <div className="flex flex-col gap-3" data-testid="hiking-course">
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {course.mountain.name} 코스 목록
      </button>
      <h2 className="text-base font-semibold leading-snug">{course.name}</h2>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="거리" value={formatHikingLength(course.lengthM)} />
        <Stat label="오르막" value={course.gainM !== null ? formatHikingEle(course.gainM) : '—'} />
        <Stat label="내리막" value={course.lossM !== null ? formatHikingEle(course.lossM) : '—'} />
        <Stat label="최고 고도" value={course.maxEle !== null ? formatHikingEle(course.maxEle) : '—'} />
        <Stat label="출발 고도" value={course.start.ele !== null ? formatHikingEle(course.start.ele) : '—'} />
        <Stat label="형태" value={course.isLoop ? '원점회귀' : '편도'} />
      </div>
      {course.gapCount > 0 && (
        <p className="text-xs text-muted-foreground">
          원본 기록이 {course.gapCount}곳에서 끊겨(직선 {formatHikingLength(course.gapM)}) 선이 이어지지 않는 곳이 있습니다. 거리에는 끊긴 곳을 넣지
          않았습니다.
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
                  {p.signposts.length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      {p.signposts.map((s, i) => (
                        <span key={i} title={s.dir ? HIKING_SIGN_DIR_LABEL[s.dir] : undefined}>
                          {s.dir && HIKING_SIGN_DIR_ARROW[s.dir] ? `${HIKING_SIGN_DIR_ARROW[s.dir]} ` : ''}
                          {s.dest}
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
    </div>
  );
};
