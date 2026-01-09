# Sudopod Library Interface Design

## Overview

**Sudopod** is a stateless library that provides a unified interface for deploying and managing remote development environments across multiple providers (GitHub Codespaces, Coder, etc.).

### Key Principles

1. **Stateless**: Sudopod does not track deployments. Consumers (sudocode CLI, sudocode-hub) handle persistence.
2. **Provider-agnostic**: Common interface abstracts provider differences.
3. **Library-only**: No CLI binary - meant to be consumed as a library.
4. **Extensible**: Easy to add new providers via provider interface.

### Package Name

- NPM package: `sudopod` (available on npm)
- Import: `import { createProvider } from 'sudopod'`

---

## Architecture

### Consumers

1. **sudocode CLI** (standalone)
   - Uses codespaces provider directly
   - Tracks deployments in `~/.config/sudocode/deployments.json`
   - Uses GitHub CLI for authentication

2. **sudocode-hub** (hosted)
   - Uses coder provider for multi-tenant deployments
   - Tracks deployments in hub database
   - Handles user authentication (Google OAuth, enterprise SSO)
   - Provides Coder API keys to sudopod

### Flow

```
┌─────────────────┐
│  sudocode CLI   │──────────┐
└─────────────────┘          │
                             ▼
                        ┌──────────┐         ┌─────────────┐
                        │  sudopod │────────▶│ Codespaces  │
                        └──────────┘         └─────────────┘
                             ▲
┌─────────────────┐          │               ┌─────────────┐
│ sudocode-hub    │──────────┘──────────────▶│   Coder     │
└─────────────────┘                          └─────────────┘
```

---

## Core Interface

### Provider Factory

```typescript
/**
 * Factory function to create a provider instance
 * Provider handles all authentication and state internally
 */
export function createProvider(config: ProviderConfig): Provider;

/**
 * Provider configuration (union type for extensibility)
 */
export type ProviderConfig = CodespacesConfig | CoderConfig;

export interface CodespacesConfig {
  type: 'codespaces';
  // No auth needed - uses gh CLI which handles auth
}

export interface CoderConfig {
  type: 'coder';
  url: string;      // Coder instance URL
  apiKey: string;   // API key for authentication
}
```

### Provider Interface

```typescript
/**
 * Provider interface - stateless operations
 */
export interface Provider {
  readonly type: 'codespaces' | 'coder';

  /**
   * Deploy a new environment
   * Returns deployment info immediately (may still be provisioning)
   */
  deploy(options: DeployOptions): Promise<Deployment>;

  /**
   * Stop and delete an environment
   */
  stop(name: string): Promise<void>;

  /**
   * Get current status of an environment
   * Queries provider API in real-time
   */
  getStatus(name: string): Promise<DeploymentStatus>;

  /**
   * List all environments from provider
   * Queries provider API in real-time (not local tracking)
   */
  list(filters?: ListFilters): Promise<Deployment[]>;

  /**
   * Get URLs for accessing environment
   * Can be called during/after deployment
   */
  getUrls(name: string): Promise<DeploymentUrls>;
}
```

### Deploy Options

```typescript
/**
 * Deploy options - provider-agnostic base + provider-specific
 */
export interface DeployOptions {
  repository: string;           // e.g., "username/repo"
  branch?: string;              // Git branch to checkout
  workspaceDir?: string;        // Override workspace directory

  // Installation options
  sudocode: {
    mode: 'npm' | 'local';      // Install from npm or local build
    version?: string;            // Specific version (npm mode)
    localPath?: string;          // Path to local build (local mode)
  };

  // Server options
  server: {
    port?: number;              // Default: 3000
    keepAliveHours?: number;    // How long to keep alive (provider-specific)
    idleTimeout?: number;       // Idle timeout in minutes (provider-specific)
  };

  // Provider-specific options
  providerOptions: CodespacesDeployOptions | CoderDeployOptions;
}

/**
 * Codespaces-specific options
 *
 * Note: keepAliveHours and idleTimeout from DeployOptions are IGNORED
 * GitHub enforces fixed values:
 * - idleTimeout: 240 minutes (4 hours, non-configurable)
 * - retentionPeriod: 14 days (non-configurable)
 */
export interface CodespacesDeployOptions {
  machine?: string;             // Default: 'basicLinux32gb'
  // Note: GitHub limits are not configurable via API
}

/**
 * Coder-specific options
 *
 * Note: keepAliveHours and idleTimeout from DeployOptions ARE HONORED
 * Coder supports configurable TTL and idle timeout
 */
export interface CoderDeployOptions {
  template?: string;            // Coder template name
  parameters?: Record<string, string>; // Template parameters
  autoStart?: boolean;          // Auto-start workspace (default: true)
  // ttl and idle timeout controlled by server.keepAliveHours/idleTimeout
}
```

### Deployment Info

```typescript
/**
 * Deployment info - provider-agnostic
 */
export interface Deployment {
  id: string;                   // Provider-specific ID
  name: string;                 // Human-readable name
  provider: 'codespaces' | 'coder';
  repository: string;
  branch?: string;
  status: DeploymentStatus;
  createdAt: string;            // ISO 8601
  urls: DeploymentUrls;

  // Provider-specific metadata (opaque to sudopod consumers)
  metadata: {
    codespaces?: {
      machine: string;
      idleTimeout: number;      // Always 240 for GitHub
      retentionPeriod: number;  // Always 14 for GitHub
    };
    coder?: {
      template: string;
      workspaceId: string;
      ownerId: string;
      actualKeepAliveHours?: number;
      actualIdleTimeout?: number;
    };
  };
}

export type DeploymentStatus =
  | 'provisioning'    // Creating infrastructure
  | 'starting'        // Starting environment
  | 'running'         // Fully operational
  | 'stopping'        // Shutting down
  | 'stopped'         // Stopped (can be restarted)
  | 'failed'          // Deployment failed
  | 'deleted';        // Permanently deleted

export interface DeploymentUrls {
  workspace: string;           // Main workspace URL (Codespace or Coder)
  sudocode: string;            // Sudocode UI URL
  ssh?: string;                // SSH connection string (optional)
  [key: string]: string | undefined; // Additional provider-specific URLs
}

export interface ListFilters {
  status?: DeploymentStatus[];
  repository?: string;
  createdAfter?: string;       // ISO 8601
  createdBefore?: string;      // ISO 8601
}
```

---

## Usage Examples

### 1. sudocode CLI (standalone with codespaces)

```typescript
// cli/src/deploy/remote.ts

import { createProvider, type Deployment } from 'sudopod';
import { addDeployment } from './config/deployments.js';

export async function deployRemote(options: DeployOptions) {
  // Create codespaces provider (uses gh CLI auth)
  const provider = createProvider({ type: 'codespaces' });

  // Deploy (keepAliveHours ignored by codespaces)
  const deployment = await provider.deploy({
    repository: await getCurrentRepo(),
    branch: options.branch,
    sudocode: {
      mode: options.dev ? 'local' : 'npm',
      localPath: options.dev ? process.cwd() : undefined
    },
    server: {
      port: 3000,
      keepAliveHours: 72,  // Ignored by codespaces
      idleTimeout: 240     // Ignored by codespaces
    },
    providerOptions: {
      machine: options.machine || 'basicLinux32gb'
    }
  });

  // Save to local tracking
  await addDeployment({
    ...deployment,
    projectPath: process.cwd()
  });

  // Open browsers
  await openBrowsers(deployment.urls);

  return deployment;
}
```

### 2. sudocode-hub (using coder provider)

```typescript
// sudocode-hub/src/api/deploy.ts

import { createProvider } from 'sudopod';
import { getUserCoderCredentials } from './auth.js';

export async function handleDeploy(req: Request, userId: string) {
  // Get user's Coder credentials from hub database
  const coderCreds = await getUserCoderCredentials(userId);

  // Create coder provider
  const provider = createProvider({
    type: 'coder',
    url: process.env.CODER_URL!,
    apiKey: coderCreds.apiKey
  });

  // Deploy (keepAliveHours HONORED by coder)
  const deployment = await provider.deploy({
    repository: req.body.repository,
    branch: req.body.branch,
    sudocode: {
      mode: 'npm',
      version: 'latest'
    },
    server: {
      port: 3000,
      keepAliveHours: 168,  // 1 week for hosted - USED by coder
      idleTimeout: 60       // 1 hour idle - USED by coder
    },
    providerOptions: {
      template: 'sudocode-workspace',
      autoStart: true
    }
  });

  // Save to hub database
  await db.deployments.create({
    userId,
    ...deployment
  });

  return deployment;
}
```

### 3. Listing deployments (local CLI)

```typescript
// cli/src/deploy/list.ts

import { createProvider } from 'sudopod';
import { listDeployments } from './config/deployments.js';

export async function listDeploymentsCommand() {
  // Get locally tracked deployments
  const tracked = await listDeployments();

  // Query GitHub for current status
  const provider = createProvider({ type: 'codespaces' });
  const live = await provider.list();

  // Merge tracked with live status
  const merged = tracked.map(local => {
    const current = live.find(d => d.name === local.name);
    return {
      ...local,
      status: current?.status || 'unknown'
    };
  });

  console.table(merged);
}
```

---

## Package Structure

```
sudopod/
├── src/
│   ├── index.ts                      # Main exports
│   ├── types.ts                      # Core types
│   ├── core/
│   │   ├── provider.ts               # Provider interface
│   │   └── errors.ts                 # Error types
│   ├── providers/
│   │   ├── codespaces/
│   │   │   ├── index.ts              # CodespacesProvider class
│   │   │   ├── gh-cli.ts             # GitHub CLI wrapper
│   │   │   ├── setup.ts              # Installation logic
│   │   │   └── ssh.ts                # SSH operations
│   │   └── coder/
│   │       ├── index.ts              # CoderProvider class
│   │       ├── api.ts                # Coder API client
│   │       └── setup.ts              # Installation logic
│   └── utils/
│       ├── retry.ts                  # Retry logic
│       └── validation.ts             # Input validation
├── package.json
├── tsconfig.json
└── README.md
```

---

## Migration Steps

### Phase 1: Create sudopod package

1. **Add workspace**
   - Add `sudopod/` to monorepo workspaces in root `package.json`
   - Create `sudopod/package.json` with package name `sudopod`
   - Set up TypeScript config

2. **Define interfaces**
   - Create `sudopod/src/types.ts` with all interface definitions
   - Create `sudopod/src/core/provider.ts` with Provider interface
   - Create `sudopod/src/index.ts` with main exports

### Phase 2: Extract codespaces provider

3. **Move existing code**
   - Move `cli/src/deploy/utils/gh-cli.ts` → `sudopod/src/providers/codespaces/gh-cli.ts`
   - Move `cli/src/deploy/utils/codespace-ssh.ts` → `sudopod/src/providers/codespaces/ssh.ts`
   - Move `cli/src/deploy/utils/codespace-setup.ts` → `sudopod/src/providers/codespaces/setup.ts`

4. **Implement CodespacesProvider**
   - Create `sudopod/src/providers/codespaces/index.ts`
   - Refactor `cli/src/deploy/codespaces.ts` logic into Provider interface
   - Implement `deploy()`, `stop()`, `getStatus()`, `list()`, `getUrls()`

5. **Implement factory**
   - Create `createProvider()` in `sudopod/src/index.ts`
   - Register codespaces provider

### Phase 3: Update CLI to use sudopod

6. **Add dependency**
   - Add `sudopod` to `cli/package.json` dependencies
   - Update imports in `cli/src/deploy/`

7. **Refactor CLI commands**
   - Update `cli/src/deploy/codespaces.ts` to call sudopod
   - Keep tracking logic (`deployments.json`) in CLI
   - Keep CLI commands as thin wrappers

8. **Remove duplicated code**
   - Delete moved files from `cli/src/deploy/utils/`
   - Update exports in `cli/src/deploy/index.ts`

### Phase 4: Add coder provider (future)

9. **Implement CoderProvider**
   - Create `sudopod/src/providers/coder/index.ts`
   - Create Coder API client
   - Implement Provider interface

10. **Register provider**
    - Add coder to factory in `createProvider()`

---

## Authentication Models

### Codespaces Provider
- **Authentication**: Uses GitHub CLI (`gh`) which manages its own auth
- **Prerequisites**: User must run `gh auth login` before using
- **No API keys**: All auth handled by gh CLI

### Coder Provider
- **Authentication**: API key-based
- **sudocode CLI**: User stores Coder API key in `~/.config/sudocode/user_credentials.json`
- **sudocode-hub**: Hub database stores user-specific Coder API keys
- **Provisioning**: Hub handles Google OAuth/SSO → generates Coder API key → stores in DB

---

## Configuration Philosophy

### Top-Level Parameters (Provider-Agnostic)
- `server.keepAliveHours`: How long to keep environment alive
- `server.idleTimeout`: Idle timeout before shutdown
- `server.port`: Server port

### Provider Behavior
- **Codespaces**: Ignores these parameters (GitHub has fixed limits)
- **Coder**: Honors these parameters (configurable via Coder API)

### Rationale
- Users shouldn't need to know provider-specific constraints
- Interface stays clean and provider-agnostic
- Providers internally map/ignore as needed
- Metadata in `Deployment` exposes actual values used

---

## Error Handling

```typescript
// sudopod/src/core/errors.ts

export class SudopodError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SudopodError';
  }
}

export class ProviderNotFoundError extends SudopodError {
  constructor(type: string) {
    super(`Provider not found: ${type}`, 'PROVIDER_NOT_FOUND');
  }
}

export class DeploymentFailedError extends SudopodError {
  constructor(reason: string, public details?: any) {
    super(`Deployment failed: ${reason}`, 'DEPLOYMENT_FAILED');
  }
}

export class AuthenticationError extends SudopodError {
  constructor(provider: string, reason: string) {
    super(`Authentication failed for ${provider}: ${reason}`, 'AUTH_FAILED');
  }
}
```

---

## Next Steps

1. Review and approve this design
2. Create GitHub issue or spec for implementation
3. Begin Phase 1: Create sudopod package structure
4. Implement codespaces provider extraction
5. Update CLI to consume sudopod
6. Document provider interface for future Coder implementation
