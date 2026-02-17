/**
 * Hub Server Routes
 *
 * Route handlers that delegate to CoderOrchestrator.
 * Each route maps 1:1 to a Provider interface method.
 *
 * @see s-7utm - Mock Hub Server + HubProvider Implementation
 */

import { Router } from 'express';
import type { CoderOrchestrator } from '../coder-sdk/orchestrator.js';
import type { CreateOptions, ListWorkspacesOptions, WorkspaceStatus } from '../provider/types.js';

export function createRoutes(orchestrator: CoderOrchestrator): Router {
  const router = Router();

  // POST /workspaces — create
  router.post('/workspaces', async (req, res, next) => {
    try {
      const options: CreateOptions = req.body;
      const workspace = await orchestrator.create(options);
      res.status(201).json(workspace);
    } catch (error) {
      next(error);
    }
  });

  // POST /workspaces/:id/resume — resume
  router.post('/workspaces/:id/resume', async (req, res, next) => {
    try {
      const workspace = await orchestrator.resume(req.params.id);
      res.json(workspace);
    } catch (error) {
      next(error);
    }
  });

  // POST /workspaces/:id/stop — stop
  router.post('/workspaces/:id/stop', async (req, res, next) => {
    try {
      await orchestrator.stop(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // DELETE /workspaces/:id — delete
  router.delete('/workspaces/:id', async (req, res, next) => {
    try {
      await orchestrator.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // GET /workspaces/:id — get
  router.get('/workspaces/:id', async (req, res, next) => {
    try {
      const workspace = await orchestrator.get(req.params.id);
      res.json(workspace);
    } catch (error) {
      next(error);
    }
  });

  // GET /workspaces — list
  router.get('/workspaces', async (req, res, next) => {
    try {
      const filters: ListWorkspacesOptions = {};
      if (req.query.status) {
        filters.status = (req.query.status as string).split(',') as WorkspaceStatus[];
      }
      if (req.query.owner) filters.owner = req.query.owner as string;
      if (req.query.repo) filters.repo = req.query.repo as string;
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string, 10);
      const workspaces = await orchestrator.list(filters);
      res.json(workspaces);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
