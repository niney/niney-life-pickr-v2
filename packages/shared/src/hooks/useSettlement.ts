import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSettlementInputType,
  ListSettlementsQueryType,
  SettlementSessionType,
  ShareOgImageType,
  ShareTtlType,
  UpdateSettlementInputType,
} from '@repo/api-contract';
import { settlementApi } from '../api/settlement.api.js';

const KEY = ['settlement'] as const;

export const useCreateSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSettlementInputType) => settlementApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useListSettlements = (query: ListSettlementsQueryType = { offset: 0, limit: 20 }) =>
  useQuery({
    queryKey: [...KEY, 'list', query.placeId ?? null, query.offset, query.limit],
    queryFn: () => settlementApi.list(query),
  });

export const useSettlement = (id: string | null) =>
  useQuery({
    queryKey: [...KEY, 'one', id],
    queryFn: () => settlementApi.get(id ?? ''),
    enabled: !!id,
  });

// 저장된 정산 전체 replace (차수 추가/삭제·참여자·items 모두). 응답으로 받은
// 갱신된 세션을 detail 캐시에 즉시 반영 — 결과 페이지가 다시 fetch 하지 않아도
// 새 shareAmount/round 구성이 보인다. 목록은 invalidate (요약 값 변경 가능).
export const useUpdateSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSettlementInputType }) =>
      settlementApi.update(id, input),
    onSuccess: (updated: SettlementSessionType) => {
      qc.setQueryData<SettlementSessionType>([...KEY, 'one', updated.id], updated);
      qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    },
  });
};

export const useDeleteSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settlementApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

// 공유 토큰 생성/갱신. 토큰은 멱등(같은 세션 → 같은 토큰)이되 ttl 로 만료가
// 갱신된다. ttl 미지정이면 서버 기본(7일). 반환값 expiresAt 을 UI 가 표시.
export const useCreateSettlementShare = () =>
  useMutation({
    mutationFn: ({
      id,
      ttl,
      ogImage,
      ogImageUrl,
    }: {
      id: string;
      ttl?: ShareTtlType;
      ogImage?: ShareOgImageType;
      ogImageUrl?: string | null;
    }) => settlementApi.createShare(id, ttl, ogImage, ogImageUrl),
  });

export const useRevokeSettlementShare = () =>
  useMutation({
    mutationFn: (id: string) => settlementApi.revokeShare(id),
  });

// 공개 read-only 조회. 비로그인 사용자도 token 만 알면 호출 가능. 별도 KEY 로
// 격리해 소유자가 같은 세션을 보고 있어도 캐시 충돌 없음.
export const useSharedSettlement = (token: string | null) =>
  useQuery({
    queryKey: ['settlement', 'shared', token],
    queryFn: () => settlementApi.getShared(token ?? ''),
    enabled: !!token,
  });
