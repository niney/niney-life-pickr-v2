import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ImgWithFallback } from '~/components/ImgWithFallback';

interface Props {
  images: string[];
  index: number;
  onChangeIndex(next: number): void;
  onClose(): void;
}

// 풀스크린 캐러셀. scroll-snap 으로 재구성 — 컨테이너 가로 스크롤 + 각 슬라이드
// `min-w-full snap-center`. 모바일은 손가락 좌우 스와이프 → 브라우저가 momentum
// + snap 자동 처리, JS swipe 핸들러 불필요. 데스크톱은 chevron 버튼/키보드.
//
// 외부 `index` ↔ 내부 `scrollLeft` 양방향 sync:
// - index prop 변경 시 scrollLeft 를 인덱스 위치로 jump (open / 키보드 / 버튼).
// - 사용자 스와이프 → onScroll 에서 현재 페이지 계산 → onChangeIndex.
// - 이중 트리거 방지 위해 programmatic scroll 중에는 onScroll 무시(플래그).
export const Lightbox = ({ images, index, onChangeIndex, onClose }: Props) => {
  const safeIdx = ((index % images.length) + images.length) % images.length;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // programmatic scroll 중 onScroll 무시 — 외부 index 변경으로 scrollLeft 를
  // 잡아 옮길 때 onScroll 이 발사돼 같은 인덱스를 다시 set 하면 안정적이지만
  // 무의미한 렌더 + scroll-end 흔들림이 생긴다.
  const ignoreScrollRef = useRef(false);
  // 첫 effect 실행 여부. 첫 mount 는 instant jump, 이후는 smooth.
  const firstRunRef = useRef(true);
  // 빈 영역 '클릭'으로 닫기 위해 pointerdown 좌표를 기록 — click 시점에 이동
  // 거리를 비교해 스와이프/드래그와 진짜 클릭을 구분한다.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  // index → scrollLeft 동기화. 첫 마운트와 키보드/버튼 변경 둘 다 커버.
  //
  // 첫 mount 는 'instant' — smooth 로 2+ 페이지를 건너뛰면 모바일에서 smooth
  // scroll 이 가드(setTimeout) 보다 늦게 끝나, 도중의 onScroll 이 가드를
  // 빠져나와 인덱스를 잘못 보정하던 버그가 있었다 (사용자가 3번째 이미지를
  // 눌렀는데 2번째가 떴던 원인). 첫 진입은 도착 위치가 곧 보일 화면이므로
  // 애니메이션 불필요.
  //
  // 이후 키보드/버튼은 'smooth' — 한 페이지씩 짧은 거리라 자연스럽다.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = safeIdx * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) < 1) return;
    const isFirst = firstRunRef.current;
    firstRunRef.current = false;
    ignoreScrollRef.current = true;
    el.scrollTo({ left: target, behavior: isFirst ? 'instant' : 'smooth' });
    // instant 는 onScroll 한 번이면 충분, smooth 는 모바일에서 종종 300ms+
    // 걸리므로 600ms 가드로 안전 마진 확보.
    const guardMs = isFirst ? 80 : 600;
    const t = window.setTimeout(() => {
      ignoreScrollRef.current = false;
    }, guardMs);
    return () => window.clearTimeout(t);
  }, [safeIdx]);

  // 키보드 네비 — 화살표 ←/→ 도 동일한 외부 onChangeIndex 호출.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft')
        onChangeIndex((safeIdx - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight')
        onChangeIndex((safeIdx + 1) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [safeIdx, images.length, onChangeIndex, onClose]);

  const handleScroll = () => {
    if (ignoreScrollRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== safeIdx) onChangeIndex(next);
  };

  // 이미지 바깥 어두운 영역을 '클릭'하면 닫는다 (X 버튼 외 보조 닫기).
  // (1) 이미지·컨트롤 버튼 클릭은 제외하고, (2) 이동 거리 10px 초과는
  // 스와이프/드래그로 보고 제외해, 캐러셀 스와이프 끝에 발생하는 click 으로
  // 의도치 않게 닫히는 걸 막는다.
  const handleBackdropPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };
  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' || target.closest('button')) return;
    const down = pointerDownRef.current;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) return;
    onClose();
  };

  if (images.length === 0) return null;

  // document.body 로 portal — 데스크톱 상세는 [리스트|상세|지도] 3-컬럼이고
  // 각 컬럼이 `position: sticky` 라 저마다 stacking context 를 만든다. 라이트박스를
  // 상세 컬럼 안에서 그대로 렌더하면 `z-50` 이 상세 컬럼의 context 안에서만
  // 유효해, DOM 상 뒤에 오는 지도 컬럼(같은 z:auto)이 그 위에 덮여 이미지
  // 오른쪽이 지도에 가려 잘렸다. body 로 빼면 컬럼들의 context 밖이라 전체
  // 화면을 정상적으로 덮는다.
  return createPortal(
    <div
      role="dialog"
      aria-label="사진 보기"
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
      // height 를 dvh 로 — vh 는 layout viewport 기준이라 모바일 주소창 영역이
      // 차이만큼 dialog 가 시야 밖으로 넘어가 이미지/인디케이터가 잘렸다.
      // dvh 는 주소창 토글 시 즉시 따라간다.
      className="fixed inset-x-0 top-0 z-50 h-[100dvh] bg-black/90 animate-in fade-in duration-150"
    >
      {/* 닫기 버튼 — overlay 클릭 닫기는 scroll-snap 컨테이너 위에 두면 swipe
          중 의도치 않게 닫힐 수 있어 명시 버튼 한 곳으로 한정. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 z-10 inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {images.length > 1 && (
        <>
          {/* chevron 은 sm+ 데스크톱 보조 — 모바일은 스와이프가 주. 모바일에서
              가운데에 떠 있으면 swipe 시작 영역을 가려 답답하다. */}
          <button
            type="button"
            onClick={() =>
              onChangeIndex((safeIdx - 1 + images.length) % images.length)
            }
            aria-label="이전 사진"
            className="absolute left-4 top-1/2 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:inline-flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeIndex((safeIdx + 1) % images.length)}
            aria-label="다음 사진"
            className="absolute right-4 top-1/2 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:inline-flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {/* 가로 스크롤-스냅 캐러셀. 각 슬라이드 min-w-full snap-center 라 한 번에
          한 장만 화면에 안착. 스크롤바 숨김 + iOS bounce 무력화. */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((u, i) => (
          <div
            key={`${i}-${u}`}
            // w-full (not min-w-full) — min-w-full 은 flex item 이 콘텐츠에 맞춰
            // 더 커질 수 있어, 세로 긴/정방형 이미지가 max-h 기준으로 부풀면
            // slide 가 scroller 보다 넓어지고 max-w-full 이 무력화돼 가로로
            // 화면을 넘쳐 잘렸다. w-full + shrink-0 으로 정확히 scroller 폭에
            // 고정해 max-w-full 이 실효력을 갖도록.
            className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4"
          >
            <ImgWithFallback
              src={u}
              loading={Math.abs(i - safeIdx) <= 1 ? 'eager' : 'lazy'}
              // max-h 는 dvh — dialog 와 동일 기준이라 모바일 주소창 상태가
              // 바뀌어도 잘리지 않는다.
              className="max-h-[88dvh] max-w-full rounded object-contain"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
          {safeIdx + 1} / {images.length}
        </div>
      )}
    </div>,
    document.body,
  );
};
