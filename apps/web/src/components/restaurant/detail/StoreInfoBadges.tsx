import { AlertTriangle, Store } from 'lucide-react';
import type { RestaurantStoreInfoType } from '@repo/api-contract';
import { lifeStoreDisplayName } from '@repo/utils';

// 상가업소 매칭 배지 — 공개 상세(HomeTab 헤더)와 어드민 상세 헤더가 같이 쓴다. 업종(상권업종 소분류명)은
// 항상, 폐업 의심(최근 분기 상가정보에서 업소가 사라짐)은 경고 톤으로 — 매칭 실패일 수도 있어 "의심"
// 이라 쓰고 근거(기준 월)를 같이 적는다. 색만으로 뜻을 전하지 않도록 아이콘 + 글자, 상세는 title.

interface Props {
  store: RestaurantStoreInfoType | null;
}

const ym = (date: string | null): string | null => (date ? date.slice(0, 7) : null);

export const StoreInfoBadges = ({ store }: Props) => {
  if (!store) return null;
  const base = ym(store.baseDate);
  const industryTitle = [
    `소상공인시장진흥공단 상가정보 매칭: ${lifeStoreDisplayName(store.name, store.branch)}`,
    store.ksicName ? `표준산업분류 ${store.ksicName}` : null,
    `거리 ${store.distM}m · 상호 유사도 ${Math.round(store.nameScore * 100)}%`,
    base ? `${base} 분기 기준` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <span
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground"
        title={industryTitle}
        data-testid="store-industry-badge"
      >
        <Store className="size-3" aria-hidden />
        {store.industry} · 상가정보
      </span>
      {store.closedSuspect && (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
          title={`최근 상가정보${base ? `(${base} 분기)` : ''}에서 이 업소가 사라졌습니다${store.missingSince ? ` — ${store.missingSince.slice(0, 10)}부터` : ''}. 매칭 오류일 수 있어 목록에는 그대로 둡니다.`}
          data-testid="store-closed-badge"
        >
          <AlertTriangle className="size-3" aria-hidden />
          폐업 의심{base ? ` · 상가정보 ${base} 기준 미확인` : ''}
        </span>
      )}
    </>
  );
};
