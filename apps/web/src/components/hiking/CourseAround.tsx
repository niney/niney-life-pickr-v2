import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bus, Car, ChevronRight, Toilet, UtensilsCrossed } from 'lucide-react';
import type { HikingAroundPlaceType, HikingAroundType, HikingCourseDetailType } from '@repo/api-contract';
import { useHikingAround } from '@repo/shared';
import { formatDistanceM, roundCoord } from '@repo/utils';

// 코스 상세의 "가는 법·주변"(4차) — 들머리(편도면 날머리도) 정류장·주차·화장실과 하산 후 맛집. 등산 지점(GPX·등산트레킹)을
// 먼저 두고 버스·지하철(수도권)·주차장·공중화장실·맛집(크롤, 없으면 상가정보 음식점)을 더한 서버 목록을 그대로 그린다. 버스·
// 지하철·주차장·맛집은 각 화면으로 잇는다(맛집 가는 법 탭과 같은 링크). docs/PLAN-hiking.md §4차

const linkOf = (p: HikingAroundPlaceType): string | null => {
  if (!p.refId) return null;
  const near = `${roundCoord(p.lat)},${roundCoord(p.lng)}`;
  if (p.kind === 'bus') return `/bus?near=${near}&stId=${encodeURIComponent(p.refId)}`;
  if (p.kind === 'subway') return `/subway?near=${near}&stn=${encodeURIComponent(p.refId)}`;
  if (p.kind === 'lot') return `/parking?ll=${near}&z=17&sel=${encodeURIComponent(p.refId)}`;
  if (p.kind === 'restaurant') return `/r/${encodeURIComponent(p.refId)}`;
  return null;
};

const KIND_TAG: Partial<Record<HikingAroundPlaceType['kind'], string>> = {
  trail: '등산 지점',
  bus: '버스',
  subway: '지하철',
  lot: '주차장',
  public: '공중화장실',
};

const PlaceRow = ({ p, showEnd }: { p: HikingAroundPlaceType; showEnd: boolean }) => {
  const href = linkOf(p);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-sm">{p.name}</span>
          {showEnd && p.at === 'end' && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">날머리</span>}
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatDistanceM(p.distM)}</span>
        </span>
        {(p.detail || KIND_TAG[p.kind]) && (
          <span className="block truncate text-[11px] text-muted-foreground">{[KIND_TAG[p.kind], p.detail].filter(Boolean).join(' · ')}</span>
        )}
      </span>
      {href && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link to={href} className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5">{body}</div>
      )}
    </li>
  );
};

const Group = ({
  icon,
  title,
  places,
  empty,
  showEnd,
  testId,
}: {
  icon: ReactNode;
  title: string;
  places: readonly HikingAroundPlaceType[];
  empty: string;
  showEnd: boolean;
  testId: string;
}) => (
  <div className="flex flex-col gap-1">
    <h4 className="flex items-center gap-1.5 text-xs font-medium">
      {icon}
      {title}
    </h4>
    {places.length > 0 ? (
      <ul className="flex flex-col divide-y rounded-md border" data-testid={testId}>
        {places.map((p) => (
          <PlaceRow key={`${p.kind}:${p.at}:${p.name}:${p.distM}`} p={p} showEnd={showEnd} />
        ))}
      </ul>
    ) : (
      <p className="text-[11px] text-muted-foreground">{empty}</p>
    )}
  </div>
);

const AroundBody = ({ data }: { data: HikingAroundType }) => {
  const showEnd = data.end !== null;
  const foodTitle = data.food.source === 'stores' ? '하산 후 음식점(상가정보)' : '하산 후 맛집';
  return (
    <>
      <Group icon={<Bus className="size-3.5" />} title="정류장·역" places={data.transit} empty="근처 정류장 정보가 없습니다." showEnd={showEnd} testId="hiking-around-transit" />
      <Group icon={<Car className="size-3.5" />} title="들머리 주차" places={data.parking} empty="들머리 근처 주차장 정보가 없습니다." showEnd={false} testId="hiking-around-parking" />
      <Group icon={<Toilet className="size-3.5" />} title="화장실" places={data.toilets} empty="근처 화장실 정보가 없습니다." showEnd={showEnd} testId="hiking-around-toilets" />
      <Group
        icon={<UtensilsCrossed className="size-3.5" />}
        title={foodTitle}
        places={data.food.items}
        empty="근처 음식점 정보가 없습니다."
        showEnd={false}
        testId="hiking-around-food"
      />
      <p className="text-[11px] text-muted-foreground">
        거리는 {showEnd ? '들머리·날머리' : '들머리'}에서 직선거리입니다. 정류장·주차·화장실은 등산 조사 지점에 버스·지하철(수도권)·주차장·
        공중화장실 자료를 더했고, 운행·운영 여부는 바뀌었을 수 있습니다.
      </p>
    </>
  );
};

export const CourseAround = ({ course }: { course: HikingCourseDetailType }) => {
  const q = useHikingAround(course.id);
  return (
    <section className="flex flex-col gap-2.5" data-testid="hiking-around" aria-label="가는 법·주변">
      <h3 className="text-sm font-semibold">가는 법·주변</h3>
      {q.data ? (
        <AroundBody data={q.data} />
      ) : q.isError ? (
        <p className="text-xs text-muted-foreground">주변 정보를 불러오지 못했습니다.</p>
      ) : (
        <p className="text-xs text-muted-foreground">정류장·주차·화장실을 찾는 중…</p>
      )}
    </section>
  );
};
