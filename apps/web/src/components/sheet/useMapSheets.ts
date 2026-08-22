import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Snap } from './BottomSheet';

// 지도 페이지 모바일 시트 한 쌍(목록 + 상세)의 스냅 조율 — 맛집 v2 에서 쓰던 규칙을 공용으로.
//   - 상세가 열리면(detailOpen false→true): 목록 시트의 스냅을 기억해 두고 peek 으로(숨김 상태로
//     대기), 상세 시트는 half 로 들어온다(상세가 보이면서 지도도 절반은 남게).
//   - 상세가 닫히면(true→false): 목록 시트를 기억해 둔 스냅으로 되돌린다.
// 전이는 렌더 중 파생(setState-during-render)으로 처리해 상세 시트가 첫 프레임부터 half 로
// 마운트된다(effect 로 미루면 직전 스냅(full 등)으로 한 프레임 튄다).
//
// 페이지는 돌려받은 스냅/세터를 BottomSheet 두 개에 그대로 연결하고, 목록 시트에는
// hidden/disableScrollLock = detailOpen 을 준다(상세 시트가 스크롤 락을 갖는다).

export const SHEET_PEEK_HEIGHT = 120;
export const SHEET_HALF_RATIO = 0.55;

interface Options {
  // 목록 시트 초기 스냅(기본 peek — 지도 먼저).
  initialListSnap?: Snap;
  // 상세 진입 스냅(기본 half).
  detailEnterSnap?: Snap;
}

export interface MapSheets {
  listSnap: Snap;
  setListSnap: Dispatch<SetStateAction<Snap>>;
  detailSnap: Snap;
  setDetailSnap: Dispatch<SetStateAction<Snap>>;
  // 상세가 열린 동안 목록 시트는 숨기고 스크롤 락도 상세 쪽에 맡긴다.
  listHidden: boolean;
}

export const useMapSheets = (
  detailOpen: boolean,
  { initialListSnap = 'peek', detailEnterSnap = 'half' }: Options = {},
): MapSheets => {
  const [listSnap, setListSnap] = useState<Snap>(initialListSnap);
  const [detailSnap, setDetailSnap] = useState<Snap>(detailEnterSnap);
  const [savedListSnap, setSavedListSnap] = useState<Snap>(initialListSnap);
  const [prevOpen, setPrevOpen] = useState(detailOpen);

  if (prevOpen !== detailOpen) {
    setPrevOpen(detailOpen);
    if (detailOpen) {
      setSavedListSnap(listSnap);
      setListSnap('peek');
      setDetailSnap(detailEnterSnap);
    } else {
      setListSnap(savedListSnap);
    }
  }

  return { listSnap, setListSnap, detailSnap, setDetailSnap, listHidden: detailOpen };
};

// 상세 시트가 half 일 때 지도에서 가려지는 아래쪽 높이(px) — 목록에서 항목을 골라 날아갈 때
// 지점이 시트 아래로 숨지 않게 flyTo 의 bottomInset 으로 넘긴다.
export const sheetHalfInset = (headerHeight: number): number =>
  Math.round(Math.max(0, window.innerHeight - headerHeight) * SHEET_HALF_RATIO);
