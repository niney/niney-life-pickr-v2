import { useId, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMealDraftStore, useRestaurantsPublic } from '@repo/shared';
import { formatDistanceM } from '@repo/utils';
import { useDebounced } from '~/lib/useDebounced';
import { linkRecognizedToPlaceMenus, type MealMenuLinkResult } from './mealPlaceLink';
import type { MealNearbyPlaces } from './useMealNearbyPlaces';

// 어디서 먹었나요(웹) — 등록된 식당을 찾아 고르거나, 없으면 이름만 적는다. 식당을 먼저 알아야 그 집 메뉴에서 고를 수
// 있어 입력 화면 맨 위에 둔다(예전엔 저장된 값을 보여 주고 지우기만 했다). 고르면 '먹은 음식'에 그 집 메뉴가 뜬다
// (MealPlaceMenus). 검색칸은 음식 이름 자동완성과 같은 콤보박스 — 화면 맨 위라 휴대폰 키보드에도 목록이 가리지 않는다.
// 검색칸 아래에는 근처 식당 후보(useMealNearbyPlaces — 사진 찍은 곳이나 지금 위치)가 칩으로 뜬다. 누르면 그 식당이다.
// 식당을 고르면 사진에서 이미 찾아 둔 음식을 그 집 메뉴에 잇는다(mealPlaceLink) — 하나도 안 맞으면 그 집 메뉴를 힌트로
// 사진을 다시 인식할 수 있게 한다(이때만 인식 한도를 쓴다).

const SEARCH_DEBOUNCE_MS = 250;
// 끝에 붙은 낱자모는 한글 조합 중간 상태("숯ㅌ")라 뗀다(음식 이름 자동완성과 같은 이유).
const TRAILING_JAMO = /[ㄱ-ㆎ]+$/;
const MAX_RESULTS = 8;
const PLACE_NAME_MAX = 120;

type Option =
  | { kind: 'place'; placeId: string; name: string; sub: string }
  | { kind: 'name'; name: string };

export const MealPlaceSection = ({
  heading: Heading = 'h2',
  nearby,
  recognizeAgain,
}: {
  heading?: 'h2' | 'h3';
  nearby: MealNearbyPlaces;
  /** 사진이 있고 지금 다시 인식할 수 있으면 넘긴다 — 찾아 둔 음식이 이 집 메뉴와 하나도 안 맞을 때 쓴다. */
  recognizeAgain?: () => void;
}) => {
  const queryClient = useQueryClient();
  const placeName = useMealDraftStore((s) => s.placeName);
  const setPlace = useMealDraftStore((s) => s.setPlace);
  // 고른 식당을 바꾸는 중 — 검색칸을 다시 연다(고르지 않고 닫으면 원래 식당 그대로).
  const [changing, setChanging] = useState(false);
  // 방금 고른 식당의 메뉴에 사진 속 음식을 이은 결과(알림용).
  const [link, setLink] = useState<MealMenuLinkResult | null>(null);

  const pick = (place: { placeId: string | null; placeName: string }) => {
    setPlace(place);
    setChanging(false);
    setLink(null);
    if (place.placeId) void linkRecognizedToPlaceMenus(queryClient).then(setLink);
  };

  return (
    <section className="meal-sec" aria-labelledby="meal-form-where">
      <Heading id="meal-form-where" className="meal-sec-title mb-3">
        어디서 먹었나요
      </Heading>
      {placeName && !changing ? (
        <div className="flex items-center gap-2">
          <span className="meal-input min-w-0 flex-1 truncate">{placeName}</span>
          <button type="button" className="meal-btn-quiet" onClick={() => setChanging(true)}>
            바꾸기
          </button>
          <button
            type="button"
            className="meal-btn-quiet"
            onClick={() => {
              setPlace(null);
              setLink(null);
            }}
          >
            지우기
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <PlaceSearch
            autoFocus={changing}
            onPick={pick}
            onCancel={changing ? () => setChanging(false) : undefined}
          />
          <NearbyPlaces nearby={nearby} onPick={pick} />
        </div>
      )}
      {placeName && !changing && link && link.linked > 0 ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          사진에서 찾은 음식 {link.linked}개를 이 집 메뉴에 이었어요.
        </p>
      ) : null}
      {placeName && !changing && link && link.linked === 0 && link.unmatched > 0 && recognizeAgain ? (
        <p className="meal-note mt-2">
          사진에서 찾은 음식이 이 집 메뉴와 맞지 않아요.
          <button
            type="button"
            className="meal-note-action"
            onClick={() => {
              setLink(null);
              recognizeAgain();
            }}
          >
            이 집 메뉴로 다시 인식
          </button>
        </p>
      ) : null}
    </section>
  );
};

// 근처 식당 후보 — 사진에 찍은 곳이 있으면 묻지 않고 바로, 없으면 [근처 식당]을 눌러 지금 위치로. 후보는 고르라고
// 내놓는 것이지 정해 주는 것이 아니다.
const NearbyPlaces = ({
  nearby,
  onPick,
}: {
  nearby: MealNearbyPlaces;
  onPick: (place: { placeId: string; placeName: string }) => void;
}) => {
  const { status, source, places, loading } = nearby;
  const locating = status === 'locating';
  const message =
    status === 'denied'
      ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용하거나 이름으로 찾아 주세요.'
      : status === 'unavailable'
        ? '지금 위치를 확인하지 못했어요. 이름으로 찾아 주세요.'
        : status === 'coarse'
          ? `지금 위치가 정확하지 않아(오차 약 ${formatDistanceM(nearby.accuracyM ?? 0)}) 근처 식당을 고르지 못했어요. 이름으로 찾아 주세요.`
          : status === 'ready' && !loading && places.length === 0
            ? source === 'photo'
              ? '사진 찍은 곳 근처에 등록된 식당이 없어요.'
              : '지금 위치 근처에 등록된 식당이 없어요.'
            : null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 사진이 먹은 곳을 알려 주면 지금 위치는 묻지 않는다. */}
        {source === 'photo' ? null : (
          <button
            type="button"
            className="meal-opt meal-opt-sm meal-opt-action"
            onClick={nearby.locate}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
            ) : (
              <MapPin className="mr-1 size-3.5" aria-hidden />
            )}
            {locating ? '위치 확인 중…' : '근처 식당'}
          </button>
        )}
        {places.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {source === 'photo' ? '사진 찍은 곳 근처' : '지금 위치 근처'}
          </span>
        ) : null}
        {places.map((place) => (
          <button
            key={place.placeId}
            type="button"
            className="meal-opt meal-opt-sm"
            title={place.category ?? undefined}
            onClick={() => onPick({ placeId: place.placeId, placeName: place.name })}
          >
            {place.name}
            <span className="ml-1.5 font-normal text-muted-foreground">{formatDistanceM(place.distanceM)}</span>
          </button>
        ))}
        {loading ? <span className="text-xs text-muted-foreground">근처 식당을 찾는 중…</span> : null}
      </div>
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
};

const PlaceSearch = ({
  autoFocus,
  onPick,
  onCancel,
}: {
  autoFocus: boolean;
  onPick: (place: { placeId: string | null; placeName: string }) => void;
  onCancel?: () => void;
}) => {
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = q.trim();
  const term = useDebounced(q, SEARCH_DEBOUNCE_MS).replace(TRAILING_JAMO, '').trim();
  // 입력을 지우면 디바운스를 기다리지 않고 바로 닫히게 지금 입력도 함께 본다.
  const searchable = term.length > 0 && typed.length > 0;
  const list = useRestaurantsPublic(
    { q: term || undefined, limit: MAX_RESULTS },
    { enabled: open && searchable },
  );
  const places = open && searchable ? (list.data?.items ?? []) : [];
  const options: Option[] =
    open && typed
      ? [
          ...places.map(
            (p): Option => ({
              kind: 'place',
              placeId: p.placeId,
              name: p.name,
              sub: [p.category, p.roadAddress || p.address].filter(Boolean).join(' · '),
            }),
          ),
          { kind: 'name', name: typed },
        ]
      : [];

  const pick = (option: Option) => {
    onPick({ placeId: option.kind === 'place' ? option.placeId : null, placeName: option.name });
    setQ('');
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative flex items-center gap-2">
        <label className="meal-place-search">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                return;
              }
              if (options.length === 0 || event.nativeEvent.isComposing) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((i) => (i + 1) % options.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                // 엔터는 고른 줄, 고른 줄이 없으면 찾은 식당이 하나일 때만 그 식당 — 이름만 적기는 그 줄을 눌러야 한다
                // (찾으려고 누른 엔터가 등록 안 된 이름으로 굳지 않게).
                const chosen = options[active] ?? (places.length === 1 ? options[0] : undefined);
                if (chosen) pick(chosen);
              }
            }}
            autoFocus={autoFocus}
            maxLength={PLACE_NAME_MAX}
            placeholder="식당 이름·주소로 찾기"
            aria-label="식당 찾기"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
            enterKeyHint="search"
          />
        </label>
        {onCancel ? (
          <button type="button" className="meal-btn-quiet" onClick={onCancel}>
            그대로 두기
          </button>
        ) : null}
        {options.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="식당 목록"
            className="meal-listbox meal-place-list absolute left-0 right-0 top-full z-20 mt-1"
          >
            {options.map((option, i) => (
              <li
                key={option.kind === 'place' ? option.placeId : 'name-only'}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // 입력칸 blur 가 먼저 목록을 닫아 클릭이 사라지지 않게 포커스를 옮기지 않는다.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                className="meal-option meal-place-option"
              >
                {option.kind === 'place' ? (
                  <>
                    <span className="truncate font-bold">{option.name}</span>
                    {option.sub ? <span className="meal-place-sub">{option.sub}</span> : null}
                  </>
                ) : (
                  <>
                    <span className="truncate">‘{option.name}’ 이름만 적기</span>
                    <span className="meal-place-sub">
                      {places.length === 0 && !list.isFetching && searchable
                        ? '등록된 식당에서 찾지 못했어요 — 이름만 남겨요'
                        : '목록에 없는 곳이면 이름만 남겨요'}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        선택 — 등록된 식당을 고르면 그 집 메뉴에서 바로 넣을 수 있어요.
      </p>
    </div>
  );
};
