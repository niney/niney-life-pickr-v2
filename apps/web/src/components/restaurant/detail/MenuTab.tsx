import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { MenuGrid } from './shared';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
}

export const MenuTab = ({ detail, insights }: Props) => {
  if (detail.menus.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        등록된 메뉴가 없습니다.
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      <div className="text-xs text-muted-foreground">총 {detail.menus.length}개</div>
      <MenuGrid menus={detail.menus} insights={insights} />
    </div>
  );
};
