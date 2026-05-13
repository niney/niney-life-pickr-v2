import { useEffect, useRef } from 'react';
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

  // index → scrollLeft 동기화. 첫 마운트와 키보드/버튼 변경 둘 다 커버.
  // behavior: 'auto' — 첫 mount 시 jump, 이후엔 smooth. requestAnimationFrame
  // 으로 한 프레임 미뤄 layout 이 확정된 뒤 위치 보정.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = safeIdx * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) < 1) return;
    ignoreScrollRef.current = true;
    el.scrollTo({ left: target, behavior: 'smooth' });
    // smooth scroll 종료 직후 onScroll 들이 정리되도록 짧은 지연. snap 이
    // 안정화될 때까지 200ms 면 충분 (실측 평균 ~120ms).
    const t = window.setTimeout(() => {
      ignoreScrollRef.current = false;
    }, 200);
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

  if (images.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="사진 보기"
      className="fixed inset-0 z-50 bg-black/90 animate-in fade-in duration-150"
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
            className="flex h-full min-w-full shrink-0 snap-center items-center justify-center p-4"
          >
            <ImgWithFallback
              src={u}
              loading={Math.abs(i - safeIdx) <= 1 ? 'eager' : 'lazy'}
              className="max-h-[88vh] max-w-full rounded object-contain"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
          {safeIdx + 1} / {images.length}
        </div>
      )}
    </div>
  );
};
