import { TOUR_PLAN_FOCUSES, TOUR_PLAN_FOCUS_KEYS, TOUR_PLAN_PACES, TOUR_PLAN_PACE_KEYS, TOUR_PLAN_TRANSPORTS, TOUR_PLAN_TRANSPORT_KEYS } from '@repo/utils';
import { Chip, Group } from './TourFilterBar';
import type { TourPlanOptionsValue } from './tourFormat';

// 코스 일정 옵션(11차) — 속도·취향·이동수단. 비슷한 여행을 고르는 조건(TourFilterBar)과 달리 결과를 "내 사정" 에 맞추는 입력이다.
// 취향은 추천 목록의 순위에도 반영되므로 어느 지역에서나, 속도·이동수단은 일정표를 만드는 지역(itinerary)에서만 보인다.
// 숙소 동네·꼭 갈 곳·뺄 곳은 결과를 본 뒤 고르므로 일정표 쪽에 있다.
// 출발일(12차) — 일정에 날짜를 붙이고 예보가 닿는 날의 비를 반영한다. dateHint 는 호출부가 예보 상태로 만든 한 줄.

interface Props {
  value: TourPlanOptionsValue;
  onChange: (next: TourPlanOptionsValue) => void;
  itinerary: boolean;
  minDate?: string;
  dateHint?: string;
}

export const TourPlanOptions = ({ value, onChange, itinerary, minDate, dateHint }: Props) => (
  <div className="space-y-2 rounded-lg border bg-card p-3" role="group" aria-label="일정 옵션">
    {itinerary && (
      <Group label="속도">
        {TOUR_PLAN_PACE_KEYS.map((k) => (
          <Chip key={k} active={value.pace === k} onClick={() => onChange({ ...value, pace: k })}>
            {TOUR_PLAN_PACES[k].label}
          </Chip>
        ))}
      </Group>
    )}
    <Group label="취향">
      {TOUR_PLAN_FOCUS_KEYS.map((k) => {
        const on = value.focus.includes(k);
        return (
          <Chip key={k} active={on} onClick={() => onChange({ ...value, focus: on ? value.focus.filter((f) => f !== k) : [...value.focus, k] })}>
            {TOUR_PLAN_FOCUSES[k].label}
          </Chip>
        );
      })}
    </Group>
    {itinerary && (
      <Group label="이동">
        {TOUR_PLAN_TRANSPORT_KEYS.map((k) => (
          <Chip key={k} active={value.transport === k} onClick={() => onChange({ ...value, transport: k })}>
            {TOUR_PLAN_TRANSPORTS[k].label}
          </Chip>
        ))}
      </Group>
    )}
    {itinerary && (
      <Group label="출발">
        <input
          type="date"
          aria-label="여행 시작일"
          value={value.startDate ?? ''}
          min={minDate}
          onChange={(e) => onChange({ ...value, startDate: e.target.value || null })}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        />
        {dateHint && <span className="text-[11px] text-muted-foreground">{dateHint}</span>}
      </Group>
    )}
  </div>
);
