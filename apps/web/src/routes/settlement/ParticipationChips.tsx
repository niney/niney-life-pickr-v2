import { Beer, CupSoda, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import {
  PARTICIPATION_AXES,
  type ExcludeKey,
  type ParticipationAxis,
  type ParticipationFlags,
} from '@repo/shared';
import { cn } from '~/lib/utils';

// 참여 축(술·음료·안주) 칩·배지 — 라벨·축 규칙은 @repo/shared participation,
// 여기는 웹 표현(아이콘·스타일)만.

const AXIS_ICON: Record<ExcludeKey, LucideIcon> = {
  excludeAlcohol: Beer,
  excludeNonAlcohol: CupSoda,
  excludeSide: UtensilsCrossed,
};

// 참여자 한 명의 술·음료·안주 토글 묶음. 켜짐(기본)=분담, 누르면 빠짐.
// 켜짐은 연하게, 빠짐은 점선·취소선 — 기본 상태가 요란하지 않고 "누가 빠졌나" 가
// 한눈에 튄다. 빠짐을 반투명으로까지 흐리면 다크 모드에서 칩이 사라져 보여
// 흐린 글자색만 쓴다.
export const ParticipationToggles = ({
  value,
  onChange,
  size = 'md',
}: {
  value: ParticipationFlags;
  onChange(key: ExcludeKey, exclude: boolean): void;
  size?: 'md' | 'sm';
}) => (
  <div className="flex flex-wrap gap-1.5">
    {PARTICIPATION_AXES.map((axis) => {
      const joined = !value[axis.key];
      const Icon = AXIS_ICON[axis.key];
      return (
        <button
          key={axis.key}
          type="button"
          aria-pressed={joined}
          title={joined ? `${axis.label} 분담 — 누르면 빠짐` : `${axis.label} 빠짐 — 누르면 분담`}
          onClick={() => onChange(axis.key, joined)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border transition-colors',
            size === 'md' ? 'h-7 px-2.5 text-sm' : 'h-6 px-2 text-xs',
            joined
              ? 'border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15'
              : 'border-dashed border-muted-foreground/50 text-muted-foreground line-through hover:text-foreground',
          )}
        >
          <Icon className={size === 'md' ? 'size-3.5' : 'size-3'} />
          {axis.label}
        </button>
      );
    })}
  </div>
);

// 결과·미리보기용 참여 배지 — 축 계산은 shared (draft|session)ParticipationBadgeAxes
// (차수 특이사항·불참 반영). 한 명만 술을 안 마시면 마시는 사람들에 '술' 이 붙고
// 안 마시는 사람은 빈칸.
export const ParticipationBadges = ({ axes }: { axes: readonly ParticipationAxis[] }) => {
  if (axes.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
      {axes.map((axis) => {
        const Icon = AXIS_ICON[axis.key];
        return (
          <span
            key={axis.key}
            className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"
          >
            <Icon className="size-3" />
            {axis.label}
          </span>
        );
      })}
    </div>
  );
};
