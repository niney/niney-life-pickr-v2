import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CanonicalCandidatesResult,
  CanonicalDeleteResult,
  CanonicalDismissSuggestionResult,
  CanonicalMergeInput,
  CanonicalMergeResult,
  CanonicalProposalAcceptInput,
  CanonicalProposalAcceptResult,
  CanonicalProposalListResult,
  CanonicalProposalRejectResult,
  CanonicalProposalRunResult,
  CanonicalSplitInput,
  CanonicalSplitResult,
  Routes,
} from '@repo/api-contract';
import { CanonicalError, CanonicalService } from './canonical.service.js';
import { ProposalService } from './proposal.service.js';

const canonicalRoutes: FastifyPluginAsync = async (app) => {
  const service = new CanonicalService(app.prisma);
  const proposalService = new ProposalService(app.prisma, service);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const mapError = (e: unknown): never => {
    if (e instanceof CanonicalError) {
      if (e.code === 'NOT_FOUND') throw app.httpErrors.notFound(e.message);
      if (e.code === 'CONFLICT') throw app.httpErrors.conflict(e.message);
      throw app.httpErrors.badRequest(e.message);
    }
    throw e;
  };

  typed.get(Routes.Canonical.candidates(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: CanonicalCandidatesResult },
    },
    handler: async (req) => {
      const result = await service.getCandidates(req.params.id);
      if (!result) throw app.httpErrors.notFound('Canonical not found');
      return result;
    },
  });

  typed.post(Routes.Canonical.merge, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      body: CanonicalMergeInput,
      response: { 200: CanonicalMergeResult },
    },
    handler: async (req) => {
      try {
        return await service.merge(req.body.sourceCanonicalId, req.body.targetCanonicalId);
      } catch (e) {
        return mapError(e);
      }
    },
  });

  typed.post(Routes.Canonical.dismissSuggestion(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: CanonicalDismissSuggestionResult },
    },
    handler: async (req) => {
      try {
        await service.dismissSuggestion(req.params.id);
        return { ok: true as const };
      } catch (e) {
        return mapError(e);
      }
    },
  });

  typed.get(Routes.Canonical.proposals, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: CanonicalProposalListResult },
    },
    handler: async () => proposalService.list(),
  });

  typed.post(Routes.Canonical.proposalsRun, {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      response: { 200: CanonicalProposalRunResult },
    },
    handler: async () => proposalService.generateAll(),
  });

  typed.post(Routes.Canonical.proposalAccept(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      body: CanonicalProposalAcceptInput,
      response: { 200: CanonicalProposalAcceptResult },
    },
    handler: async (req) => {
      try {
        return await proposalService.accept(req.params.id, req.body.keepSide);
      } catch (e) {
        return mapError(e);
      }
    },
  });

  typed.post(Routes.Canonical.proposalReject(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: CanonicalProposalRejectResult },
    },
    handler: async (req) => {
      try {
        return await proposalService.reject(req.params.id);
      } catch (e) {
        return mapError(e);
      }
    },
  });

  typed.delete(Routes.Canonical.delete(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      response: { 200: CanonicalDeleteResult },
    },
    handler: async (req) => {
      try {
        const result = await service.deleteCanonical(req.params.id);
        return { ok: true as const, ...result };
      } catch (e) {
        return mapError(e);
      }
    },
  });

  typed.post(Routes.Canonical.split(':id'), {
    onRequest: [app.authenticate, app.requireAdmin],
    schema: {
      tags: ['admin'],
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string() }),
      body: CanonicalSplitInput,
      response: { 200: CanonicalSplitResult },
    },
    handler: async (req) => {
      try {
        return await service.split(req.params.id, req.body.restaurantId);
      } catch (e) {
        return mapError(e);
      }
    },
  });
};

export default canonicalRoutes;
