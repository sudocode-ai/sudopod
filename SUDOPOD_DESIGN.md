# Sudopod Library Interface Design

## Overview

**Sudopod** is a stateless library that provides a unified interface for deploying and managing remote development environments across multiple providers (GitHub Codespaces, Coder, etc.).

### Key Principles

1. **Stateless**: Sudopod does not track deployments. Consumers (sudocode CLI, sudocode-hub) handle persistence.
2. **Connector-agnostic**: Common interface abstracts connector differences.
3. **Library-only**: No CLI binary - meant to be consumed as a library.
4. **Extensible**: Easy to add new connectors via connector interface.

### Package Name

- NPM package: `sudopod` (available on npm)
- Import: `import { createConnector } from 'sudopod'`

---

## Architecture

### Consumers

1. **sudocode CLI** (standalone)
   - Uses codespaces connector directly
   - Tracks deployments in `~/.config/sudocode/deployments.json`
   - Uses GitHub CLI for authentication

2. **sudocode-hub** (hosted)
   - Uses coder connector for multi-tenant deployments
   - Tracks deployments in hub database
   - Handles user authentication (Google OAuth, enterprise SSO)
   - Provides Coder API keys to sudopod

### Flow

```
┌─────────────────┐         ┌──────────┐         ┌─────────────┐
│  sudocode CLI   │────────▶│  sudopod │────────▶│ Codespaces  │
└─────────────────┘         └──────────┘         └─────────────┘


┌─────────────────┐         ┌──────────┐         ┌─────────────┐
│ sudocode-hub    │────────▶│  sudopod │────────▶│   Coder     │
└─────────────────┘         └──────────┘         └─────────────┘
```

---

## Core Interface

### Connector Factory

```typescript
/**
 * Factory function to create a connector instance
 * Connector handles all authentication and state internally
 */
export function createConnector(config: ConnectorConfig): Connector;

/**
 * Connector configuration (union type for extensibility)
 */
export type ConnectorConfig = CodespacesConfig | CoderConfig;

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

### Connector Interface

```typescript
/**
 * Connector interface - stateless operations
 */
export interface Connector {
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
  
  // Development mode flag
  dev?: boolean;                // When true, install from local repo build (typically with mode: 'local')

  // Installation options
  sudocode: {
    mode: 'npm' | 'local';      // Install from npm or local build
    version?: string;            // Specific version (npm mode)
    localPath?: string;          // Path to local build (local mode)
  };

  // Server options
  server: {
    port?: number;              // Default: 3000
    keepAliveHours?: number;    // How long to keep VM alive before shutdown (hours)
    idleTimeout?: number;       // Idle timeout before pausing VM (minutes)
  };

  // Provider-specific options
  providerOptions: CodespacesDeployOptions | CoderDeployOptions;
}

/**
 * Codespaces-specific options
 *
 * Note: idleTimeout from DeployOptions is IGNORED for Codespaces
 * GitHub Codespaces doesn't reliably auto-resume processes or auto-forward
 * ports after pausing, so we cannot use pause/resume. Instead, we rely on
 * keepAliveHours and implement a keepalive mechanism to bypass the codespace's
 * own idle timeout, keeping the VM running continuously until shutdown.
 *
 * TODO: Implement keepalive mechanism to bypass codespace idle timeout
 */
export interface CodespacesDeployOptions {
  machine?: string;             // Default: 'basicLinux32gb'
}

/**
 * Coder-specific options
 *
 * Note: Both keepAliveHours and idleTimeout from DeployOptions ARE HONORED
 * Coder supports fully configurable TTL and idle timeout values
 */
export interface CoderDeployOptions {
  template?: string;            // Coder template name
  parameters?: Record<string, string>; // Template parameters
  autoStart?: boolean;          // Auto-start workspace (default: true)
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

  // VM lifecycle configuration (NOT in provider metadata)
  keepAliveHours: number;       // How long VM stays alive before shutdown
  idleTimeout?: number;         // Idle timeout before pausing VM (ignored by Codespaces)

  // Provider-specific metadata (opaque to sudopod consumers)
  metadata: {
    codespaces?: {
      machine: string;
    };
    coder?: {
      template: string;
      workspaceId: string;
      ownerId: string;
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

import { createConnector, type Deployment } from 'sudopod';
import { addDeployment } from './config/deployments.js';

export async function deployRemote(options: DeployOptions) {
  // Create codespaces connector (uses gh CLI auth)
  const connector = createConnector({ type: 'codespaces' });

  // Deploy
  const deployment = await connector.deploy({
    repository: await getCurrentRepo(),
    branch: options.branch,
    dev: options.dev,        // Enable dev mode for local builds
    sudocode: {
      mode: options.dev ? 'local' : 'npm',
      localPath: options.dev ? process.cwd() : undefined
    },
    server: {
      port: 3000,
      keepAliveHours: 72,    // Keep VM alive for 3 days before shutdown
      idleTimeout: 240       // Ignored - codespaces can't reliably pause/resume
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

### 2. sudocode-hub (using coder connector)

```typescript
// sudocode-hub/src/api/deploy.ts

import { createConnector } from 'sudopod';
import { getUserCoderCredentials } from './auth.js';

export async function handleDeploy(req: Request, userId: string) {
  // Get user's Coder credentials from hub database
  const coderCreds = await getUserCoderCredentials(userId);

  // Create coder connector
  const connector = createConnector({
    type: 'coder',
    url: process.env.CODER_URL!,
    apiKey: coderCreds.apiKey
  });

  // Deploy
  const deployment = await connector.deploy({
    repository: req.body.repository,
    branch: req.body.branch,
    sudocode: {
      mode: 'npm',
      version: 'latest'
    },
    server: {
      port: 3000,
      keepAliveHours: 168,  // Keep VM alive for 1 week before shutdown
      idleTimeout: 60       // Pause VM after 1 hour idle
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

import { createConnector } from 'sudopod';
import { listDeployments } from './config/deployments.js';

export async function listDeploymentsCommand() {
  // Get locally tracked deployments
  const tracked = await listDeployments();

  // Query GitHub for current status
  const connector = createConnector({ type: 'codespaces' });
  const live = await connector.list();

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
│   │   ├── connector.ts              # Connector interface
│   │   └── errors.ts                 # Error types
│   ├── connectors/
│   │   ├── codespaces.ts             # CodespacesConnector class
│   │   └── coder.ts                  # CoderConnector class
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
   - Create `sudopod/src/core/connector.ts` with Connector interface
   - Create `sudopod/src/index.ts` with main exports

### Phase 2: Extract codespaces connector

3. **Move existing code**
   - Move `cli/src/deploy/utils/gh-cli.ts` → `sudopod/src/utils/codespaces/gh-cli.ts`
   - Move `cli/src/deploy/utils/codespace-ssh.ts` → `sudopod/src/utils/codespaces/ssh.ts`
   - Move `cli/src/deploy/utils/codespace-setup.ts` → `sudopod/src/utils/codespaces/setup.ts`

4. **Implement CodespacesConnector**
   - Create `sudopod/src/connectors/codespaces.ts`
   - Refactor `cli/src/deploy/codespaces.ts` logic into Connector interface
   - Implement `deploy()`, `stop()`, `getStatus()`, `list()`, `getUrls()`

5. **Implement factory**
   - Create `createConnector()` in `sudopod/src/index.ts`
   - Register codespaces connector

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

### Phase 4: Add coder connector (future)

9. **Implement CoderConnector**
   - Create `sudopod/src/connectors/coder.ts`
   - Create Coder API client
   - Implement Connector interface

10. **Register connector**
    - Add coder to factory in `createConnector()`

---

## Authentication Models

### Codespaces Connector
- **Authentication**: Uses GitHub CLI (`gh`) which manages its own auth
- **Prerequisites**: User must run `gh auth login` before using
- **No API keys**: All auth handled by gh CLI

### Coder Connector
- **Authentication**: API key-based
- **sudocode CLI**: User stores Coder API key in `~/.config/sudocode/user_credentials.json`
- **sudocode-hub**: Hub database stores user-specific Coder API keys
- **Provisioning**: Hub handles Google OAuth/SSO → generates Coder API key → stores in DB

---

## Configuration Philosophy

### Top-Level Parameters (Connector-Agnostic)
These parameters are part of the core `Deployment` interface, NOT connector-specific metadata:
- `server.keepAliveHours`: How long to keep VM alive before complete shutdown
- `server.idleTimeout`: Idle timeout before pausing VM (cost savings)
- `server.port`: Server port

### Connector Behavior
- **Codespaces**:
  - `keepAliveHours`: HONORED - controls when VM shuts down completely
  - `idleTimeout`: IGNORED - GitHub doesn't reliably auto-resume processes/ports, so we bypass pause with keepalive mechanism
- **Coder**:
  - Both `keepAliveHours` and `idleTimeout`: HONORED and fully configurable (can reliably pause/resume)

### Rationale
- Users shouldn't need to know connector-specific constraints upfront
- Interface stays clean and connector-agnostic
- Connectors internally map/ignore parameters as needed
- Deployment object exposes actual values used for transparency

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

export class ConnectorNotFoundError extends SudopodError {
  constructor(type: string) {
    super(`Connector not found: ${type}`, 'CONNECTOR_NOT_FOUND');
  }
}

export class DeploymentFailedError extends SudopodError {
  constructor(reason: string, public details?: any) {
    super(`Deployment failed: ${reason}`, 'DEPLOYMENT_FAILED');
  }
}

export class AuthenticationError extends SudopodError {
  constructor(connector: string, reason: string) {
    super(`Authentication failed for ${connector}: ${reason}`, 'AUTH_FAILED');
  }
}
```

---

## Next Steps

1. Review and approve this design
2. Create GitHub issue or spec for implementation
3. Begin Phase 1: Create sudopod package structure
4. Implement codespaces connector extraction
5. Update CLI to consume sudopod
6. Document connector interface for future Coder implementation
