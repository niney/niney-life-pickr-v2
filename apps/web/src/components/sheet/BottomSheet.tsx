import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { cn } from '~/lib/utils';

// 모바일 바텀시트 (dual-mode).
//
// 핵심 요구: "패널이 맵을 다 가리는 순간에만 모바일 브라우저 주소창이
// 최소화된다." → 주소창 minify 는 body(window) 스크롤로만 트리거되므로,
// 시트가 full 스냅일 땐 시트가 normal flow 의 일부(=body 가 스크롤하는
// 컨텐츠)여야 하고, peek/half 일 땐 fixed 로 떠 있어 body 가 스크롤되지
// 않아야 한다.
//
//                 mode='fixed'                  mode='scroll'
// snap=peek/half  ✅ transform 드래그            (사용 안 함)
// snap=full(drag) ✅ (마지막 프레임)             ✗
// snap=full(rest) (transition 직후)             ✅ body 스크롤 → 주소창 minify
//
// 전이:
//   peek/half → full : 드래그 종료 후 transition (220ms) 완료 시 fixed→scroll
//                     swap. 두 모드 모두 viewport 를 정확히 덮으므로 시각 점프 X.
//   full → peek/half : 드래그 시작 시 scroll→fixed swap (즉시). scrollY 를
//                     scrollPosRef 에 저장해 fixed 모드 inner 컨테이너에 미러.
//
// 추가 동작:
//   - snap 외부 변화에 mode 자동 동기화 (예: 카드 클릭 → setSnap('half') 만 해도
//     mode 가 scroll→fixed 로 따라감).
//   - disableScrollLock=true 면 html overflow 토글/body 스크롤 복원에 개입하지
//     않음 — list/detail 두 sheet 가 공존할 때 비활성 sheet 가 활성 sheet 의
//     overflow 락을 풀지 않도록.

export type Snap = 'peek' | 'half' | 'full';

interface Props {
  // 시트가 표시할 컨텐츠. 두 모드에서 동일하게 렌더.
  children: React.ReactNode;
  // 외부 제어가 필요하면 주입 (예: 카드 클릭 시 half 로 올리기).
  snap?: Snap;
  onSnapChange?(next: Snap): void;
  // peek 일 때 보일 최소 픽셀 높이.
  peekHeight?: number;
  // half 비율 (사용 가능 영역 = vh - topOffset 대비).
  halfRatio?: number;
  // 상단에 고정되어 시트가 덮으면 안 되는 영역 (예: PublicTopBar + SearchRow).
  // 시트의 full 높이 = vh - topOffset. scroll 모드 핸들 sticky top 도 이만큼.
  topOffset?: number;
  // 스크롤 잠금 차단 여부. 상세 시트 마운트 시 목록 시트의 차단 로직 개입을 방지.
  disableScrollLock?: boolean;
  // 커스텀 zIndex (기본값 20).
  zIndex?: number;
  // 화면에서 숨김 여부 (visibility: hidden 적용)
  hidden?: boolean;
}

const DEFAULTS = {
  peekHeight: 140,
  halfRatio: 0.55,
};

const TRANSITION_MS = 220;

export const BottomSheet = ({
  children,
  snap: snapProp,
  onSnapChange,
  peekHeight = DEFAULTS.peekHeight,
  halfRatio = DEFAULTS.halfRatio,
  topOffset = 0,
  disableScrollLock = false,
  zIndex = 20,
  hidden = false,
}: Props) => {
  const [vh, setVh] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  const [internalSnap, setInternalSnap] = useState<Snap>('peek');
  const snap = snapProp ?? internalSnap;

  const [dragDy, setDragDy] = useState(0); // px, 양수=아래(시트 축소), 음수=위(확장)
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'fixed' | 'scroll'>('fixed');

  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  // fixed 모드 동안 inner overflow 컨테이너에 scroll 위치 동기화하기 위한 ref.
  const innerContentRef = useRef<HTMLDivElement>(null);
  // 현재 뷰의 적용 대상 scroll 위치. mode 전환 시 inner/body 에 적용된다.
  const scrollPosRef = useRef(0);
  // mode 의 최신값을 드래그 핸들러에서 동기 참조하기 위한 ref
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const setSnap = useCallback(
    (next: Snap) => {
      if (onSnapChange) onSnapChange(next);
      if (snapProp === undefined) setInternalSnap(next);
    },
    [onSnapChange, snapProp],
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (modeRef.current === 'fixed') {
      scrollPosRef.current = e.currentTarget.scrollTop;
    }
  }, []);

  // dvh 추적 — 주소창 토글로 innerHeight 가 바뀔 때 즉시 반영.
  useLayoutEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  // 시트가 차지할 수 있는 최대 영역 — topOffset 아래.
  const availableH = Math.max(peekHeight, vh - topOffset);

  const snapHeight = useCallback(
    (s: Snap): number => {
      if (s === 'peek') return peekHeight;
      if (s === 'half') return Math.round(availableH * halfRatio);
      return availableH;
    },
    [availableH, peekHeight, halfRatio],
  );

  // 드래그 중 현재 시각적 시트 높이 (px). peek~full 범위 clamp.
  const baseH = snapHeight(snap);
  const currentH = Math.max(
    snapHeight('peek'),
    Math.min(snapHeight('full'), baseH - dragDy),
  );
  const translatePx = availableH - currentH;

  // 가장 가까운 스냅 선택 — velocity 로 다음 스냅을 가속.
  const pickSnap = useCallback(
    (finalH: number, vy: number, dyDir: number): Snap => {
      const vSigned = vy * (dyDir > 0 ? -1 : 1);
      const projected = finalH + vSigned * 200;
      const candidates: Array<[Snap, number]> = [
        ['peek', snapHeight('peek')],
        ['half', snapHeight('half')],
        ['full', snapHeight('full')],
      ];
      return candidates.reduce((best, cur) =>
        Math.abs(cur[1] - projected) < Math.abs(best[1] - projected) ? cur : best,
      )[0];
    },
    [snapHeight],
  );

  // 스냅 확정 — mode 전환은 아래 reconciliation effect 가 처리하므로 여기서는
  // 상태 갱신만.
  const commitSnap = useCallback(
    (next: Snap) => {
      setSnap(next);
      setDragDy(0);
    },
    [setSnap],
  );

  // 드래그 시작 시점에 scroll → fixed swap (full 에서 끌어내림).
  // 드래그 핸들은 sticky 로 항상 노출되므로 scrollY 와 무관하게 항상 받아준다.
  // 현재 body scrollY 를 저장해서 (a) inner 컨테이너 scroll 위치로 미러링하고
  // (b) 추후 full → scroll 복귀 시 body 스크롤 복원.
  const beginDragFromScroll = useCallback(() => {
    scrollPosRef.current = window.scrollY;
    setMode('fixed');
  }, []);

  const bind = useDrag(
    ({ first, last, down, movement: [, my], velocity: [, vy], direction: [, dyDir] }) => {
      if (first && modeRef.current === 'scroll') {
        beginDragFromScroll();
      }
      setIsDragging(down);
      // 위로(my<0) 인데 이미 full 이면 무시 (저항감)
      const effectiveDy = snapRef.current === 'full' && my < 0 ? 0 : my;
      setDragDy(effectiveDy);

      if (last) {
        const finalH = snapHeight(snapRef.current) - effectiveDy;
        const next = pickSnap(finalH, vy, dyDir);
        commitSnap(next);
      }
    },
    {
      axis: 'y',
      filterTaps: true,
    },
  );

  // unmount 시 body overflow 정리. useLayoutEffect 로 둬서 cleanup 이 다음 커밋의
  // useLayoutEffect setup 보다 먼저 발화 — 동일 커밋에서 형제 sheet(list) 가
  // overflow='hidden' 을 다시 잠그면 그 값이 최종으로 남음. useEffect 로 두면
  // cleanup 이 paint 이후에 늦게 발화해 list 의 락을 풀어버린다.
  useLayoutEffect(() => {
    return () => {
      document.documentElement.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);

  // mode 변화에 따라 (a) html overflow 잠금/해제 (b) 스크롤 위치 적용.
  // disableScrollLock=true 면 overflow 조작과 body 스크롤 복원은 건너뛰고,
  // fixed 모드일 때 inner 컨테이너에 scrollPosRef 만 적용한다.
  useLayoutEffect(() => {
    if (disableScrollLock) {
      if (mode === 'fixed' && innerContentRef.current) {
        innerContentRef.current.scrollTop = scrollPosRef.current;
      }
      return;
    }

    if (mode === 'fixed') {
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';
      if (innerContentRef.current) {
        innerContentRef.current.scrollTop = scrollPosRef.current;
      }
    } else {
      document.documentElement.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
      window.scrollTo(0, scrollPosRef.current);
    }
  }, [mode, disableScrollLock]);

  // snap 외부 변화에 mode 자동 동기화. 드래그 중엔 commitSnap 결과를 거쳐
  // 자연히 정리되므로 skip.
  useLayoutEffect(() => {
    if (isDragging) return;
    if (snap === 'full' && mode === 'fixed') {
      const t = window.setTimeout(() => {
        if (snapRef.current === 'full') {
          // scroll 모드로 전환하기 직전(innerContentRef가 언마운트되기 전) 스크롤 상태 저장
          if (innerContentRef.current) {
            scrollPosRef.current = innerContentRef.current.scrollTop;
          }
          setMode('scroll');
        }
      }, TRANSITION_MS);
      return () => window.clearTimeout(t);
    }
    if (snap !== 'full' && mode === 'scroll') {
      // fixed 모드로 전환하기 직전 body 스크롤 상태 저장
      scrollPosRef.current = window.scrollY;
      setMode('fixed');
    }
  }, [snap, mode, isDragging]);

  const dragHandle = (
    <div
      ref={handleRef}
      {...bind()}
      className="flex h-12 cursor-grab touch-none items-center justify-center select-none active:cursor-grabbing"
      data-sheet-handle="true"
    >
      <div className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
    </div>
  );

  if (mode === 'fixed') {
    return (
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0',
          hidden && 'invisible pointer-events-none',
        )}
        style={{ top: `${topOffset}px`, zIndex }}
      >
        <div
          ref={sheetRef}
          className={cn(
            'pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl',
            !isDragging && 'transition-transform duration-200 ease-out',
          )}
          style={{
            height: `${availableH}px`,
            transform: `translateY(${translatePx}px)`,
          }}
        >
          {dragHandle}
          <div
            ref={innerContentRef}
            className="flex-1 overflow-y-auto overscroll-contain"
            // 시트 DOM 높이는 항상 availableH 라 half/peek 에선 하단이 viewport
            // 아래로 흘러나간다. maxHeight 를 가시 영역(currentH - handle)에
            // 묶어두면 content 가 그 안에 안 들어갈 때 overflow-y-auto 가 발화해
            // 사용자가 스크롤로 끝까지 도달 가능. full snap 일 땐 currentH ===
            // availableH 라 maxHeight = availableH - 48 = flex-1 자연크기와 동일.
            style={{ maxHeight: `${currentH - 48}px` }}
            onScroll={handleScroll}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }

  // mode === 'scroll' : 시트가 normal flow 의 일부 → body 스크롤 → 주소창 minify.
  return (
    <div
      className={cn(
        'relative bg-background',
        hidden && 'invisible',
      )}
      style={{ minHeight: `calc(100dvh - ${topOffset}px)`, zIndex }}
    >
      <div
        className="sticky z-10 bg-background"
        style={{ top: `${topOffset}px` }}
      >
        {dragHandle}
      </div>
      {children}
    </div>
  );
};
