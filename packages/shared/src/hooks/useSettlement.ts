import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// 새 정산 저장. 응답은 결과 페이지가 읽는 것과 같은 세션 전체라 detail 캐시에 바로
// 심는다 — 저장 직후 결과 페이지가 같은 세션을 다시 요청하며 스피너를 띄우지 않는다
// (useUpdateSettlement 과 같은 계약). 새 세션은 다른 세션의 detail 을 바꾸지 않으므로
// 무효화는 목록만.
export const useCreateSettlement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSettlementInputType) => settlementApi.create(input),
    onSuccess: (saved: SettlementSessionType) => {
      qc.setQueryData<SettlementSessionType>([...KEY, 'one', saved.id], saved);
      qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
    },
  });
};

// `keepPrevious` 는 페이지·페이지 크기를 넘길 때 직전 페이지를 그대로 보여 주는 옵트인
// — 새 키엔 데이터가 없어 목록이 통째로 사라졌다 다시 그려지는 것을 막는다. 식당별
// 목록처럼 키가 바뀌면 다른 대상이 되는 호출처는 켜지 않는다(남의 목록이 잠깐 보임).
export const useListSettlements = (
  query: ListSettlementsQueryType = { offset: 0, limit: 20 },
  options: { keepPrevious?: boolean } = {},
) =>
  useQuery({
    queryKey: [...KEY, 'list', query.placeId ?? null, query.offset, query.limit],
    queryFn: () => settlementApi.list(query),
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
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

// 여러 건 한꺼번에 삭제. useDeleteSettlement 를 건마다 부르면 삭제가 끝날 때마다
// 무효화가 걸리고, invalidate 는 진행 중인 재조회를 버리고 새로 시작하므로 삭제
// N건에 목록 조회도 최대 N번 나간다. 여기선 전부 끝난 뒤 한 번만 무효화한다.
// 일부가 실패해도 나머지는 지워졌으므로 allSettled 결과를 그대로 돌려주고(reject
// 하지 않는다) 호출처가 실패 건수를 센다.
export const useDeleteSettlements = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.allSettled(ids.map((id) => settlementApi.remove(id))),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
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
