import {
  Routes,
  type CrawlNaverPlaceInputType,
  type CrawlNaverPlaceResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const crawlApi = {
  naverPlace: (url: string) =>
    apiFetch<CrawlNaverPlaceResultType>(Routes.Crawl.naverPlace, {
      method: 'POST',
      body: JSON.stringify({ url } satisfies CrawlNaverPlaceInputType),
    }),
};
