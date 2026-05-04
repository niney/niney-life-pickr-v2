import { z } from 'zod';

export const CrawlNaverPlaceInput = z.object({
  url: z.string().url(),
});
export type CrawlNaverPlaceInputType = z.infer<typeof CrawlNaverPlaceInput>;

export const MenuItem = z.object({
  name: z.string(),
  price: z.string().nullable(),
  description: z.string().nullable(),
  recommend: z.boolean().nullable(),
  imageUrls: z.array(z.string().url()),
});
export type MenuItemType = z.infer<typeof MenuItem>;

export const NaverPlaceData = z.object({
  placeId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  address: z.string().nullable(),
  roadAddress: z.string().nullable(),
  phone: z.string().nullable(),
  businessHours: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  imageUrls: z.array(z.string().url()),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  menus: z.array(MenuItem),
  rawSourceUrl: z.string().url(),
});
export type NaverPlaceDataType = z.infer<typeof NaverPlaceData>;

export const CrawlErrorCode = z.enum([
  'invalid_url',
  'unsupported_format',
  'redirect_failed',
  'fetch_failed',
  'parse_failed',
  'place_not_found',
  'rate_limited',
]);
export type CrawlErrorCodeType = z.infer<typeof CrawlErrorCode>;

export const CrawlNaverPlaceResult = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: NaverPlaceData,
    fetchedAt: z.string(),
    durationMs: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    error: CrawlErrorCode,
    message: z.string(),
    triedUrl: z.string().optional(),
  }),
]);
export type CrawlNaverPlaceResultType = z.infer<typeof CrawlNaverPlaceResult>;
