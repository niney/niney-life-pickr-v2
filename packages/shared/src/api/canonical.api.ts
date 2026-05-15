import {
  Routes,
  type CanonicalCandidatesResultType,
  type CanonicalMergeInputType,
  type CanonicalMergeResultType,
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
};
