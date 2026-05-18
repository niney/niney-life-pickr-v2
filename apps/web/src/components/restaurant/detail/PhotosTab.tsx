import { useMemo, useState } from 'react';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { Lightbox } from './Lightbox';

interface Props {
  detail: RestaurantPublicDetailType;
}

interface Section {
  key: string;
  title: string;
  images: string[];
}

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
      {sections.map((s) => {
        const offset = sectionOffsets.get(s.key)!;
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
                    onClick={() => setLightboxIndex(offset + i)}
                    className="relative block aspect-square w-full overflow-hidden rounded bg-muted"
                    aria-label={`${s.title} ${i + 1}번 사진 크게 보기`}
                  >
                    <ImgWithFallback
                      src={u}
                      className="size-full object-cover transition-transform hover:scale-105"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

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
