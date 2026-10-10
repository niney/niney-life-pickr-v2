import { useState } from 'react';
import { ScanText } from 'lucide-react';
import type { RestaurantPublicMenuBoardType } from '@repo/api-contract';
import { reviewThumbnailUrl } from '@repo/utils';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { Lightbox } from '~/components/Lightbox';
import { Button } from '~/components/ui/button';
import { MenuGrid } from './shared';

// 메뉴 탭의 메뉴판 사진 — 가게가 네이버에 올린 메뉴판 사진과, AI 가 그 사진을 읽어 찾은 '등록 메뉴에 없는 메뉴'.
// 등록 메뉴와 섞지 않고 출처·사진 날짜를 밝혀 따로 보인다(사진을 눌러 원본으로 확인할 수 있게).

const FIRST_SHOWN = 8;

export const MenuBoardSection = ({ menuBoard }: { menuBoard: RestaurantPublicMenuBoardType }) => {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const { images, addedMenus } = menuBoard;
  const dates = images.flatMap((image) => (image.uploadedOn ? [image.uploadedOn] : [])).sort();
  const dateText =
    dates.length === 0 ? null : dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ~ ${dates.at(-1)}`;
  const shown = expanded ? addedMenus : addedMenus.slice(0, FIRST_SHOWN);

  return (
    <section aria-label="메뉴판 사진" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanText className="size-4" /> 메뉴판 사진
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {images.length}장{dateText && ` · ${dateText}`}
        </span>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {images.map((image, index) => (
          <li key={image.url} className="shrink-0">
            <button
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="block overflow-hidden rounded border"
              aria-label={`메뉴판 사진 ${index + 1} 크게 보기`}
            >
              <ImgWithFallback
                src={reviewThumbnailUrl(image.url, 240)}
                fallbackSrc={image.url}
                width={96}
                height={72}
                className="h-[72px] w-24 object-cover transition-opacity hover:opacity-90"
              />
            </button>
          </li>
        ))}
      </ul>

      {addedMenus.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">메뉴판 사진에서 찾은 메뉴</h4>
            <span className="text-[11px] tabular-nums text-muted-foreground">{addedMenus.length}개</span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            등록 메뉴에 없는 것만 모았어요. 가게가 올린 메뉴판 사진을 AI 가 읽은 결과라 실제와 다를 수 있으니 사진으로
            확인해 주세요.
          </p>
          <MenuGrid
            menus={shown.map((m) => ({
              name: m.name,
              price: m.price,
              description: m.description,
              recommend: null,
              imageUrls: [],
            }))}
            insights={undefined}
          />
          {addedMenus.length > FIRST_SHOWN && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '접기' : `${addedMenus.length - FIRST_SHOWN}개 더 보기`}
            </Button>
          )}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={images.map((image) => image.url)}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </section>
  );
};
