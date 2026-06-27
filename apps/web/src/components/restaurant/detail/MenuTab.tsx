import type { RestaurantInsightsType, RestaurantPublicDetailType } from '@repo/api-contract';
import { MenuGrid } from './shared';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  onSelectMenu(name: string): void;
}

export const MenuTab = ({ detail, insights, onSelectMenu }: Props) => {
  const menuGroups = (detail.menuGroups ?? []).filter((group) => group.menus.length > 0);
  if (detail.menus.length === 0 && menuGroups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        등록된 메뉴가 없습니다.
      </div>
    );
  }

  if (menuGroups.length > 0) {
    return (
      <div className="space-y-5 p-4">
        <div className="text-xs text-muted-foreground">
          총 {detail.menus.length}개 · {menuGroups.length}개 그룹
        </div>
        {menuGroups.map((group, index) => (
          <section key={`${group.source}-${group.sourceGroupId ?? group.name}-${index}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{group.name}</h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {group.menus.length}개
              </span>
            </div>
            <MenuGrid menus={group.menus} insights={insights} onSelectMenu={onSelectMenu} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="text-xs text-muted-foreground">총 {detail.menus.length}개</div>
      <MenuGrid menus={detail.menus} insights={insights} onSelectMenu={onSelectMenu} />
    </div>
  );
};
