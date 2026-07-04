import { Star } from 'lucide-react';
import { cn } from '~/lib/utils';

// 즐겨찾기 토글 별 버튼. 정류장 행/도착 패널 헤더/노선 행에서 공용으로 쓴다.
// 행 자체가 <button>(선택/추적) 인 경우가 있어 이 별은 그 옆의 형제 요소로
// 배치한다(버튼 중첩 회피). stopPropagation 은 혹시 모를 상위 클릭 핸들러에
// 대한 방어 — 형제 배치라 보통은 무의미하지만 안전하게 유지.
export const BusFavoriteStar = ({
  active,
  onToggle,
  label,
  className,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    aria-pressed={active}
    aria-label={label}
    title={label}
    className={cn(
      'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
      active && 'text-amber-500 hover:text-amber-500',
      className,
    )}
  >
    <Star className={cn('size-4', active && 'fill-current')} />
  </button>
);
