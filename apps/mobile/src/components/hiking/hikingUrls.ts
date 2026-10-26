import { Routes } from '@repo/api-contract';
import { getApiConfig } from '@repo/shared';

// 앱은 같은 출처가 아니라 API 주소를 붙여 절대 URL 로 — 산 사진(Image)·코스 GPX(브라우저로 받기).
const base = (): string => getApiConfig().baseUrl.replace(/\/$/, '');
export const hikingImageUrl = (id: string, no: number): string => `${base()}${Routes.Hiking.image(id, no)}`;
export const hikingGpxUrl = (id: string): string => `${base()}${Routes.Hiking.gpx(id)}`;
