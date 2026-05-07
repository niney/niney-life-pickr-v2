import {
  Routes,
  type RestaurantDeleteResultType,
  type RestaurantDetailType,
  type RestaurantListResultType,
  type RestaurantSummaryProgressType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const restaurantApi = {
  list: () => apiFetch<RestaurantListResultType>(Routes.Restaurant.list),

  getByPlaceId: (placeId: string) =>
    apiFetch<RestaurantDetailType>(Routes.Restaurant.byPlaceId(placeId)),

  getSummaryStatus: (placeId: string) =>
    apiFetch<RestaurantSummaryProgressType>(Routes.Restaurant.summaryStatus(placeId)),

  delete: (placeId: string) =>
    apiFetch<RestaurantDeleteResultType>(Routes.Restaurant.delete(placeId), {
      method: 'DELETE',
    }),
};
