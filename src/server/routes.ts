/**
 * Route handlers for the sudopod server.
 *
 * Creates an Express router that exposes Provider methods as HTTP endpoints.
 * All business logic lives in the provider - routes just translate HTTP to provider calls.
 *
 * @see s-2aqt - Sudopod Server Implementation specification
 */

import { Router } from 'express';
import type { Provider, ListWorkspacesFilter, WorkspaceStatus } from '../types/provider.js';
import {
  validateCreateWorkspaceRequest,
  validateEnsureUserRequest,
} from './validation.js';

/**
 * Creates an Express router with all sudopod API endpoints.
 *
 * @param provider - Any Provider implementation (CoderProvider, etc.)
 * @returns Express router ready to mount on app
 */
export function createRoutes(provider: Provider): Router {
  const router = Router();

  // === Health Check ===

  router.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // === Workspace Endpoints ===

  router.post('/workspaces', async (req, res, next) => {
    try {
      const validatedBody = validateCreateWorkspaceRequest(req.body);
      const workspace = await provider.createWorkspace(validatedBody);
      res.status(201).json(workspace);
    } catch (error) {
      next(error);
    }
  });

  router.get('/workspaces', async (req, res, next) => {
    try {
      const filters: ListWorkspacesFilter = {
        owner: req.query.owner as string | undefined,
        status: req.query.status as WorkspaceStatus | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      };
      const workspaces = await provider.listWorkspaces(filters);
      res.json(workspaces);
    } catch (error) {
      next(error);
    }
  });

  router.get('/workspaces/:id', async (req, res, next) => {
    try {
      const workspace = await provider.getWorkspace(req.params.id);
      res.json(workspace);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/workspaces/:id', async (req, res, next) => {
    try {
      await provider.deleteWorkspace(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post('/workspaces/:id/start', async (req, res, next) => {
    try {
      await provider.startWorkspace(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post('/workspaces/:id/stop', async (req, res, next) => {
    try {
      await provider.stopWorkspace(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // === User Endpoints ===

  router.post('/users', async (req, res, next) => {
    try {
      if (!provider.ensureUser) {
        res.status(501).json({
          error: 'User management not supported by this provider',
        });
        return;
      }
      const validatedBody = validateEnsureUserRequest(req.body);
      const user = await provider.ensureUser(validatedBody);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
