import { z } from 'zod';

// 지원 지도 provider — 현재는 vworld 만. 카카오/네이버 추가 시 enum 확장.
export const MapProviderId = z.enum(['vworld']);
export type MapProviderIdType = z.infer<typeof MapProviderId>;

// 목록·기본 GET 응답. apiKey 는 항상 마스킹돼서 내려간다 (LlmProviderConfig
// 와 동일 패턴). vworld JS SDK 호출 시 평문 키가 필요하므로 별도 reveal
// 엔드포인트가 있다.
export const MapProviderConfig = z.object({
  provider: MapProviderId,
  hasApiKey: z.boolean(),
  apiKeyMasked: z.string().nullable(),
  domains: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type MapProviderConfigType = z.infer<typeof MapProviderConfig>;

export const MapProviderListResult = z.object({
  providers: z.array(MapProviderConfig),
});
export type MapProviderListResultType = z.infer<typeof MapProviderListResult>;

// undefined = no change, null = clear, string = set. 빈 apiKey 는 무시 (기존
// 키 보존). LlmProvider 와 같은 규약.
export const UpdateMapProviderInput = z.object({
  apiKey: z.string().min(1).optional(),
  domains: z.string().nullable().optional(),
});
export type UpdateMapProviderInputType = z.infer<typeof UpdateMapProviderInput>;

// 평문 키 노출 — admin only. vworld JS SDK 가 init URL 에 그대로 박아 호출
// 하기 때문에 클라이언트가 평문 키를 알아야만 한다.
export const MapProviderSecret = z.object({
  provider: MapProviderId,
  apiKey: z.string().nullable(),
  domains: z.string().nullable(),
});
export type MapProviderSecretType = z.infer<typeof MapProviderSecret>;
