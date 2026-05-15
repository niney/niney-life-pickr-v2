import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CanonicalMergeInputType,
  CanonicalProposalAcceptInputType,
  CanonicalSplitInputType,
} from '@repo/api-contract';
import { canonicalApi } from '../api/canonical.api.js';

// 어드민이 "병합" 버튼을 눌렀을 때만 fetch — 행마다 자동 prefetch 안 함.
// enabled=null 이면 비활성 (모달 닫힘 상태).
export const useCanonicalCandidates = (canonicalId: string | null) =>
  useQuery({
    queryKey: ['canonical', 'candidates', canonicalId],
    queryFn: () => canonicalApi.candidates(canonicalId!),
    enabled: !!canonicalId,
    staleTime: 30_000,
  });

// 두 canonical 통합. 성공 시 list 와 candidates 캐시 모두 무효화 — list 행이
// 합쳐졌고 같은 후보가 더 이상 매칭 안 될 수 있음.
export const useMergeCanonical = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CanonicalMergeInputType) => canonicalApi.merge(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'candidates'] });
    },
  });
};

// suggestion(행 위 알림) 영구 닫기. dismiss 후 list 응답에서 그 canonical 의
// suggestion 이 null 로 떨어지므로 list 캐시만 무효화.
export const useDismissCanonicalSuggestion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (canonicalId: string) => canonicalApi.dismissSuggestion(canonicalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
    },
  });
};

// 자동 매칭 검토 큐. 어드민 페이지가 30초 마다 폴링 — 새 등록 후크가 큐를 채우는
// 효과를 그리 자주 보지 않아도 되지만, 사용자가 페이지를 켜둔 채로 다른 탭에서
// 가게를 추가했을 수도 있으니 적당한 간격으로 갱신.
export const useCanonicalProposals = (enabled = true) =>
  useQuery({
    queryKey: ['canonical', 'proposals'],
    queryFn: () => canonicalApi.listProposals(),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

// 전체 다시 돌리기 (수동 트리거). 성공 시 큐 캐시 무효화.
export const useRunCanonicalProposals = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => canonicalApi.runProposals(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
    },
  });
};

// 수락 — 두 canonical 머지. list/candidates/proposals 모두 갱신.
export const useAcceptCanonicalProposal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      proposalId,
      input,
    }: {
      proposalId: string;
      input: CanonicalProposalAcceptInputType;
    }) => canonicalApi.acceptProposal(proposalId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'candidates'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
    },
  });
};

// 거절 — 같은 쌍이 다시 큐에 들어오지 않도록 'rejected' 표시.
export const useRejectCanonicalProposal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => canonicalApi.rejectProposal(proposalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
    },
  });
};

// canonical 행 통째로 삭제. 매달린 모든 Restaurant + review/summary cascade.
// list/proposals/candidates 캐시 모두 무효화.
export const useDeleteCanonical = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (canonicalId: string) => canonicalApi.delete(canonicalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'candidates'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'proposals'] });
    },
  });
};

// canonical 분리. 잘못 묶었을 때 한 source 만 떼어내 새 canonical 로.
export const useSplitCanonical = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      canonicalId,
      input,
    }: {
      canonicalId: string;
      input: CanonicalSplitInputType;
    }) => canonicalApi.split(canonicalId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant', 'list'] });
      qc.invalidateQueries({ queryKey: ['canonical', 'candidates'] });
    },
  });
};
