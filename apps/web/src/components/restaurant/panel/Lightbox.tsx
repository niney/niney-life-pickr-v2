import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ImgWithFallback } from '~/components/ImgWithFallback';

interface Props {
  images: string[];
  index: number;
  onChangeIndex(next: number): void;
  onClose(): void;
}

// 사진 그리드에서 한 장 클릭 시 띄우는 풀스크린 캐러셀. ESC 닫기 + 좌우 화살표
// 키보드 네비. Radix Dialog 안 쓰는 이유 — 패널 자체가 이미 dialog role 안에
// 있을 수 있고, 라이브러리 가벼운 fixed overlay 로 충분.
export const Lightbox = ({ images, index, onChangeIndex, onClose }: Props) => {
  const safeIdx = index % images.length;
  const current = images[safeIdx];

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

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-label="사진 보기"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex((safeIdx - 1 + images.length) % images.length);
            }}
            aria-label="이전 사진"
            className="absolute left-4 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChangeIndex((safeIdx + 1) % images.length);
            }}
            aria-label="다음 사진"
            className="absolute right-4 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      <div
        className="relative max-h-[90vh] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <ImgWithFallback
          src={current}
          loading="eager"
          className="max-h-[90vh] max-w-[92vw] rounded object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white">
          {safeIdx + 1} / {images.length}
        </div>
      )}
    </div>
  );
};
