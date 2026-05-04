import { useMutation } from '@tanstack/react-query';
import { crawlApi } from '../api/crawl.api.js';

export const useCrawlNaverPlace = () =>
  useMutation({
    mutationFn: (url: string) => crawlApi.naverPlace(url),
  });
