import { memo, useMemo, useState } from 'react';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import { reviewThumbnailUrl } from '@repo/utils';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { Lightbox } from '~/components/Lightbox';

interface Props {
  detail: RestaurantPublicDetailType;
}

// 그리드 칸에 쓰는 썸네일 폭(px). 칸은 상세 패널(440px)에선 100px 안팎이지만 패널이 화면 폭을
// 다 쓰는 태블릿 폭(4열)에선 300px 까지 커진다 — 2배 밀도까지 흐려지지 않는 폭으로 잡는다.
// 리뷰 카드(ReviewCard)와 같은 값이라 리뷰 사진은 이미 받아 둔 썸네일을 그대로 다시 쓴다.
const GRID_THUMB_WIDTH = 480;

interface Section {
  key: string;
  title: string;
  images: string[];
}

// 섹션별 썸네일 그리드. 라이트박스에서 사진을 넘길 때마다(lightboxIndex 변경) 칸 전체가 다시
// 그려지지 않게 따로 떼어 memo 한다 — props 는 detail 이 바뀔 때만 달라진다(onOpen 은 setState).
const PhotoGrid = memo(function PhotoGrid({
  sections,
  offsets,
  onOpen,
}: {
  sections: Section[];
  // 섹션 key → 평탄화 배열(allImages)에서 그 섹션이 시작하는 인덱스.
  offsets: ReadonlyMap<string, number>;
  onOpen(index: number): void;
}) {
  return (
    <>
      {sections.map((s) => {
        const offset = offsets.get(s.key)!;
        return (
          <section key={s.key} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">{s.title}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {s.images.length}
              </span>
            </div>
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {s.images.map((u, i) => (
                <li key={`${s.key}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(offset + i)}
                    className="relative block aspect-square w-full overflow-hidden rounded bg-muted"
                    aria-label={`${s.title} ${i + 1}번 사진 크게 보기`}
                  >
                    {/* 칸에는 프록시 썸네일 — 원본(1,000~3,000px)을 수십 장 그대로 받으면 탭 진입이
                        수 MB 가 된다. 원본은 라이트박스(allImages)에서만. 프록시가 못 받는 주소는
                        reviewThumbnailUrl 이 원본을 그대로 돌려주고, 프록시가 실패하면 원본으로 되돌아간다. */}
                    <ImgWithFallback
                      src={reviewThumbnailUrl(u, GRID_THUMB_WIDTH)}
                      fallbackSrc={u}
                      className="size-full object-cover transition-transform hover:scale-105"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
});

// 카테고리 분리: 대표 / 메뉴 / 방문자 리뷰. 라이트박스는 단일 시퀀스이므로
// 클릭 시 [모든 사진 + 인덱스] 로 전환 — 모달 안에서도 다음 섹션으로 자연
// 스럽게 넘어갈 수 있게.
export const PhotosTab = ({ detail }: Props) => {
  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    if (detail.imageUrls.length > 0) {
      out.push({ key: 'hero', title: '대표 사진', images: detail.imageUrls });
    }
    const menuImages = detail.menus.flatMap((m) => m.imageUrls);
    if (menuImages.length > 0) {
      out.push({ key: 'menu', title: '메뉴 사진', images: menuImages });
    }
    // 첫 페이지 reviews 의 이미지만. 전체 reviews 이미지 모음이 필요하면
    // useRestaurantPublicReviews 로 추가 페이지를 lazy fetch 해야 한다.
    const reviewImages = detail.reviewsFirstPage.flatMap((r) => r.imageUrls);
    if (reviewImages.length > 0) {
      out.push({ key: 'reviews', title: '방문자 리뷰 사진', images: reviewImages });
    }
    return out;
  }, [detail.imageUrls, detail.menus, detail.reviewsFirstPage]);

  // 모든 섹션 사진을 하나의 시퀀스로 평탄화. 라이트박스의 인덱스는 평탄화된
  // 배열 위 인덱스.
  const allImages = useMemo(
    () => sections.flatMap((s) => s.images),
    [sections],
  );

  const sectionOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let acc = 0;
    for (const s of sections) {
      offsets.set(s.key, acc);
      acc += s.images.length;
    }
    return offsets;
  }, [sections]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (sections.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        사진이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <PhotoGrid sections={sections} offsets={sectionOffsets} onOpen={setLightboxIndex} />

      {lightboxIndex !== null && (
        <Lightbox
          images={allImages}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};
