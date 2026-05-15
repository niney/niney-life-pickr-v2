import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CanonicalMergeInputType,
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
