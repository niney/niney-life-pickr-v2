import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ListContactsQueryType,
  UpdateContactInputType,
} from '@repo/api-contract';
import { settlementContactApi } from '../api/settlement-contact.api.js';

const KEY = ['settlement-contact'] as const;

// 단골 목록 — 검색어/페이지 키별로 캐시 분리. 정산 입력 자동완성과 /me/contacts
// 관리 페이지가 같은 hook 을 공유.
export const useSettlementContacts = (
  query: ListContactsQueryType = { take: 50 },
) =>
  useQuery({
    queryKey: [...KEY, 'list', query.q ?? null, query.take],
    queryFn: () => settlementContactApi.list(query),
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
