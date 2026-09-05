import { UtensilsCrossed } from 'lucide-react';
import type { TarotMenuVerdictType } from '@repo/api-contract';
import { cn } from '~/lib/utils';

// 메뉴 타로 결과 — 카드가 고른 오늘의 한 끼(첫 후보) + 대안 두 개, 입맛·피할 것 한 줄.
// 해석 패널(3D 위 오버레이)·공유 페이지·기록 상세가 같이 쓴다. pending 이면 후보는 이미 확정(카드로
// 결정적)이라 보여 주되 이유는 비워 두고 "AI 이유가 오면 채워져요" 를 단다.

interface Props {
  menu: TarotMenuVerdictType;
  pending?: boolean;
  className?: string;
}

const Meta = ({ pick }: { pick: TarotMenuVerdictType['picks'][number] }) => (
  <div className="flex flex-wrap items-center gap-1 text-[10px] text-[#ece6d6]/60">
    <span className="rounded bg-white/5 px-1.5 py-px">{pick.cuisine}</span>
    <span className="rounded bg-white/5 px-1.5 py-px">{pick.dishType}</span>
    {pick.kcal !== null && <span className="rounded bg-white/5 px-1.5 py-px">약 {pick.kcal} kcal</span>}
  </div>
);

export const TarotMenuBox = ({ menu, pending = false, className }: Props) => {
  const [first, ...rest] = menu.picks;
  if (!first) return null;
  return (
    <div
      className={cn('rounded-xl border border-[#d9b65b]/40 bg-[#d9b65b]/10 p-3 text-sm', className)}
      data-testid="tarot-menu-box"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-[#d9b65b]">
        <UtensilsCrossed className="size-3.5" /> 카드가 고른 오늘의 한 끼
      </div>
      <div className="mt-1 font-serif-kr text-2xl font-bold text-[#f3e9c6]">{first.name}</div>
      <Meta pick={first} />
      {first.reason ? (
        <p className="mt-1.5 leading-relaxed text-[#ece6d6]/90">{first.reason}</p>
      ) : (
        pending && <p className="mt-1.5 text-[11px] text-[#ece6d6]/50">카드 근거 이유는 AI 해석이 오면 채워져요.</p>
      )}

      {rest.length > 0 && (
        <div className="mt-3 border-t border-[#d9b65b]/25 pt-2.5">
          <div className="text-[11px] text-[#d9b65b]">이것도 괜찮아요</div>
          <ul className="mt-1 flex flex-col gap-2">
            {rest.map((p) => (
              <li key={p.menuId}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-[#f3e9c6]">{p.name}</span>
                  <Meta pick={p} />
                </div>
                {p.reason && <p className="mt-0.5 text-xs leading-relaxed text-[#ece6d6]/80">{p.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 border-t border-[#d9b65b]/25 pt-2.5 text-[11px]">
        <dt className="text-[#d9b65b]">오늘의 입맛</dt>
        <dd className="text-[#ece6d6]/80">{menu.profile}</dd>
        <dt className="text-[#ffb4a2]">피할 것</dt>
        <dd className="text-[#ece6d6]/80">{menu.avoid}</dd>
      </dl>
    </div>
  );
};
