import type {
  RestaurantInsightsType,
  RestaurantMenuKcalItemType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { useRestaurantPublicMenuNutrition } from '@repo/shared';
import { MenuGrid } from './shared';

interface Props {
  placeId: string;
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  onSelectMenu(name: string): void;
}

export const MenuTab = ({ placeId, detail, insights, onSelectMenu }: Props) => {
  const menuGroups = (detail.menuGroups ?? []).filter((group) => group.menus.length > 0);
  const hasMenus = detail.menus.length > 0 || menuGroups.length > 0;
  // 칼로리는 메뉴 탭에서만 지연 조회. 실패해도 메뉴는 그대로 그린다.
  const nutrition = useRestaurantPublicMenuNutrition(placeId, hasMenus);
  const kcalByName = new Map<string, RestaurantMenuKcalItemType>(
    (nutrition.data?.items ?? []).map((item) => [item.name, item]),
  );

  if (!hasMenus) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        등록된 메뉴가 없습니다.
      </div>
    );
  }

  const notice =
    kcalByName.size > 0 && nutrition.data ? (
      <p className="text-[11px] leading-snug text-muted-foreground">
        칼로리는 {nutrition.data.notice} 1인분 값이 없는 메뉴는 100g당으로, 나열형 세트는 구성별로
        표시하며 애매한 메뉴는 표시하지 않습니다.
      </p>
    ) : null;

  if (menuGroups.length > 0) {
    return (
      <div className="space-y-5 p-4">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            총 {detail.menus.length}개 · {menuGroups.length}개 그룹
          </div>
          {notice}
        </div>
        {menuGroups.map((group, index) => (
          <section key={`${group.source}-${group.sourceGroupId ?? group.name}-${index}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{group.name}</h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {group.menus.length}개
              </span>
            </div>
            <MenuGrid
              menus={group.menus}
              insights={insights}
              kcalByName={kcalByName}
              onSelectMenu={onSelectMenu}
            />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">총 {detail.menus.length}개</div>
        {notice}
      </div>
      <MenuGrid
        menus={detail.menus}
        insights={insights}
        kcalByName={kcalByName}
        onSelectMenu={onSelectMenu}
      />
    </div>
  );
};
