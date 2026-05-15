import {
  Routes,
  type CanonicalCandidatesResultType,
  type CanonicalDeleteResultType,
  type CanonicalDismissSuggestionResultType,
  type CanonicalMergeInputType,
  type CanonicalMergeResultType,
  type CanonicalProposalAcceptInputType,
  type CanonicalProposalAcceptResultType,
  type CanonicalProposalListResultType,
  type CanonicalProposalRejectResultType,
  type CanonicalProposalRunResultType,
  type CanonicalSplitInputType,
  type CanonicalSplitResultType,
} from '@repo/api-contract';
import { apiFetch } from './client.js';

export const canonicalApi = {
  candidates: (canonicalId: string) =>
    apiFetch<CanonicalCandidatesResultType>(Routes.Canonical.candidates(canonicalId)),

  merge: (input: CanonicalMergeInputType) =>
    apiFetch<CanonicalMergeResultType>(Routes.Canonical.merge, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  split: (canonicalId: string, input: CanonicalSplitInputType) =>
    apiFetch<CanonicalSplitResultType>(Routes.Canonical.split(canonicalId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  dismissSuggestion: (canonicalId: string) =>
    apiFetch<CanonicalDismissSuggestionResultType>(
      Routes.Canonical.dismissSuggestion(canonicalId),
      { method: 'POST' },
    ),

  listProposals: () =>
    apiFetch<CanonicalProposalListResultType>(Routes.Canonical.proposals),

  runProposals: () =>
    apiFetch<CanonicalProposalRunResultType>(Routes.Canonical.proposalsRun, {
      method: 'POST',
    }),

  acceptProposal: (
    proposalId: string,
    input: CanonicalProposalAcceptInputType,
  ) =>
    apiFetch<CanonicalProposalAcceptResultType>(
      Routes.Canonical.proposalAccept(proposalId),
      { method: 'POST', body: JSON.stringify(input) },
    ),

  rejectProposal: (proposalId: string) =>
    apiFetch<CanonicalProposalRejectResultType>(
      Routes.Canonical.proposalReject(proposalId),
      { method: 'POST' },
    ),

  delete: (canonicalId: string) =>
    apiFetch<CanonicalDeleteResultType>(Routes.Canonical.delete(canonicalId), {
      method: 'DELETE',
    }),
};
