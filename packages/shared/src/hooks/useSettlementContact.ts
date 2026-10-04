import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListContactsQueryType,
  UpdateContactInputType,
} from '@repo/api-contract';
import { settlementContactApi } from '../api/settlement-contact.api.js';

const KEY = ['settlement-contact'] as const;

// 단골 목록 — 검색어/페이지 키별로 캐시 분리. 정산 입력 자동완성과 /me/contacts
// 관리 페이지가 같은 hook 을 공유.
// `enabled` 는 닫힌 다이얼로그·포커스 없는 자동완성처럼 결과를 안 쓰는 동안 조회를
// 막는 옵트아웃(기본 켬). `keepPrevious` 는 검색어가 바뀌는 동안 직전 결과를 그대로
// 보여 주는 옵트인 — 새 키엔 데이터가 없어 목록이 스피너로 바뀌었다 돌아오는
// 깜빡임을 없앤다.
export const useSettlementContacts = (
  query: ListContactsQueryType = { take: 50 },
  options: { enabled?: boolean; keepPrevious?: boolean } = {},
) =>
  useQuery({
    queryKey: [...KEY, 'list', query.q ?? null, query.take],
    queryFn: () => settlementContactApi.list(query),
    enabled: options.enabled ?? true,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });

export const useUpdateSettlementContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInputType }) =>
      settlementContactApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};

export const useDeleteSettlementContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settlementContactApi.remove(id),
    // 단골을 지우면 정산 응답의 participant.contactId 가 null 로 떨어진다 —
    // 결과 페이지가 재요청할 때 자연 반영되도록 settlement 캐시도 무효화.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['settlement'] });
    },
  });
};
