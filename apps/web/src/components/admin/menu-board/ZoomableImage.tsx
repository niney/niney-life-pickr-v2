import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Maximize2, X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

// 메뉴판 사진 크게 보기 — 사진 칸 안에서 배율(맞춤·100%·200%)을 바꾸고, 사진을 누르면 그 지점을 가운데로 확대·다시
// 누르면 맞춤, 확대 중에는 끌어서 이동한다. 전체 화면은 같은 보기를 화면 가득(맞춤 = 사진 전체가 보이게).
// 화면의 사진은 원본 해상도라(최대 3661×7205) 확대하면 모델에 넘긴 것(긴 변 2,000px)보다 선명하다.

type Zoom = 'fit' | 1 | 2;

const ZOOMS: { id: Zoom; label: string }[] = [
  { id: 'fit', label: '맞춤' },
  { id: 1, label: '100%' },
  { id: 2, label: '200%' },
];

// 끌기와 누르기를 가르는 이동 거리(px).
const DRAG_THRESHOLD = 4;

interface ZoomViewProps {
  src: string;
  alt: string;
  // 맞춤의 뜻 — width: 칸 폭에 맞춤(세로로 긴 사진은 스크롤), contain: 사진 전체가 칸 안에.
  fit: 'width' | 'contain';
  boxClassName: string;
  extra?: ReactNode;
}

const ZoomView = ({ src, alt, fit, boxClassName, extra }: ZoomViewProps) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  const zoomed = zoom !== 'fit' && naturalWidth !== null;

  // 배율을 바꾸며 사진의 (rx, ry) 비율 지점을 칸 가운데로 둔다. 없으면 지금 가운데 지점을 유지.
  // 바뀐 크기가 그려진 뒤에 스크롤해야 해서 flushSync.
  const zoomTo = (next: Zoom, at?: { rx: number; ry: number }) => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img || img.offsetWidth === 0) {
      setZoom(next);
      return;
    }
    const rx = at?.rx ?? (box.scrollLeft + box.clientWidth / 2 - img.offsetLeft) / img.offsetWidth;
    const ry = at?.ry ?? (box.scrollTop + box.clientHeight / 2 - img.offsetTop) / img.offsetHeight;
    flushSync(() => setZoom(next));
    box.scrollLeft = img.offsetLeft + rx * img.offsetWidth - box.clientWidth / 2;
    box.scrollTop = img.offsetTop + ry * img.offsetHeight - box.clientHeight / 2;
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (drag.current?.moved) {
      drag.current = null;
      return;
    }
    drag.current = null;
    const img = imgRef.current;
    if (!img || naturalWidth === null) return;
    if (zoomed) {
      zoomTo('fit');
      return;
    }
    const rect = img.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return; // 사진 바깥(전체 화면의 여백)
    // 원본이 지금 보이는 것보다 크면 100%, 이미 원본 크기 이하로 보이면 200%.
    zoomTo(naturalWidth > rect.width ? 1 : 2, { rx, ry });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!zoomed || !box || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    const d = drag.current;
    if (!box || !d || e.buttons !== 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    box.scrollLeft = d.left - dx;
    box.scrollTop = d.top - dy;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <div role="radiogroup" aria-label="배율" className="inline-flex rounded-md border p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z.label}
              type="button"
              role="radio"
              aria-checked={zoom === z.id}
              onClick={() => zoomTo(z.id)}
              className={cn(
                'rounded px-2 py-0.5 text-xs',
                zoom === z.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {zoomed ? '끌어서 이동 · 누르면 맞춤' : '사진을 누르면 그 자리를 확대'}
        </span>
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      <div
        ref={boxRef}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          if (drag.current && !drag.current.moved) drag.current = null;
        }}
        className={cn(
          'relative overflow-auto rounded-md bg-muted/30',
          fit === 'contain' && !zoomed && 'flex items-center justify-center',
          zoomed ? 'cursor-grab select-none active:cursor-grabbing' : 'cursor-zoom-in',
          boxClassName,
        )}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
          style={zoomed ? { width: naturalWidth * (zoom as number), maxWidth: 'none' } : undefined}
          className={cn(!zoomed && (fit === 'width' ? 'w-full' : 'max-h-full max-w-full object-contain'))}
        />
      </div>
    </div>
  );
};

// 사진 칸(폭 맞춤) + 전체 화면 버튼. 다른 사진을 고르면 key 를 바꿔 배율을 처음으로 되돌린다.
export const ZoomableImage = ({ src, alt }: { src: string; alt: string }) => {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <ZoomView
        key={src}
        src={src}
        alt={alt}
        fit="width"
        boxClassName="max-h-[75vh]"
        extra={
          <Button type="button" variant="ghost" size="sm" onClick={() => setFullscreen(true)}>
            <Maximize2 />
            전체 화면
          </Button>
        }
      />
      <Dialog.Root open={fullscreen} onOpenChange={setFullscreen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col gap-2 bg-background p-3 outline-none sm:p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="truncate text-sm font-semibold">{alt}</Dialog.Title>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="sm" aria-label="닫기">
                  <X />
                </Button>
              </Dialog.Close>
            </div>
            {fullscreen && <ZoomView key={src} src={src} alt={alt} fit="contain" boxClassName="min-h-0 flex-1" />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
