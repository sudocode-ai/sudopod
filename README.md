# sudopod

A stateless TypeScript library for deploying and managing remote development environments. Currently supports GitHub Codespaces with Coder support planned.

## Features

- **Connector-based architecture**: Unified interface for multiple remote development platforms
- **Stateless design**: No local state management required, all operations are idempotent
- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Flexible configuration**: Support for custom deployment options per connector
- **Authentication tokens**: Built-in support for Claude LTT and other authentication methods

## Installation

```bash
npm install sudopod
```

## Quick Start

### Deploy a Codespace

```typescript
import { createConnector } from 'sudopod';

// Create a Codespaces connector
const connector = createConnector({ type: 'codespaces' });

// Deploy a new development environment
const deployment = await connector.deploy({
  git: {
    owner: 'myorg',
    repo: 'myrepo',
    branch: 'main'
  },
  server: {
    port: 3000,
    idleTimeout: 4320, // 72 hours in minutes
    keepAliveHours: 72
  },
  connectorOptions: {
    machine: 'basicLinux32gb',
    retentionPeriod: 14
  }
});

console.log('Deployment created:', deployment.id);
console.log('Access URLs:', deployment.urls);
```

### List Deployments

```typescript
// List all codespaces
const deployments = await connector.list();

// List with filters
const filtered = await connector.list({
  status: ['running'],
  owner: 'myorg',
  repo: 'myrepo'
});

console.log(`Found ${filtered.length} running deployments`);
```

### Check Status

```typescript
const status = await connector.getStatus('my-codespace-name');
console.log('Status:', status); // 'running', 'stopped', 'starting', etc.
```

### Stop a Deployment

```typescript
await connector.stop('my-codespace-name');
console.log('Deployment stopped');
```

## Authentication

### GitHub Codespaces

The Codespaces connector uses the GitHub CLI (`gh`) for authentication. Before using sudopod with Codespaces, ensure:

1. Install the GitHub CLI: https://cli.github.com
2. Authenticate with GitHub:
   ```bash
   gh auth login
   ```

The connector will automatically validate authentication and throw helpful errors if not configured.

### Claude LTT (Long-Term Token)

To enable Claude Code authentication in your deployments:

```typescript
const deployment = await connector.deploy({
  git: { owner: 'myorg', repo: 'myrepo', branch: 'main' },
  server: { port: 3000 },
  models: {
    claudeLtt: 'your-claude-ltt-token-here'
  }
});
```

The token will be set as the `CLAUDE_LTT` environment variable in the deployed environment.

## API Reference

### `createConnector(config: ConnectorConfig): Connector`

Factory function to create a connector instance.

```typescript
// Codespaces connector
const codespaces = createConnector({ type: 'codespaces' });

// Coder connector (not yet implemented)
const coder = createConnector({
  type: 'coder',
  url: 'https://coder.example.com',
  apiKey: 'your-api-key'
});
```

### `Connector` Interface

All connectors implement the following interface:

#### `deploy(options: DeployOptions): Promise<Deployment>`

Deploy a new remote development environment.

**Options:**
- `git.owner` (string): GitHub organization or user
- `git.repo` (string): Repository name
- `git.branch` (string): Git branch to checkout
- `server.port` (number, optional): Server port (default: 3000)
- `server.idleTimeout` (number, optional): Idle timeout in minutes
- `server.keepAliveHours` (number, optional): Hours to keep alive (default: 72)
- `workspaceDir` (string, optional): Custom workspace directory
- `dev` (boolean, optional): Use local sudocode installation
- `models.claudeLtt` (string, optional): Claude authentication token
- `connectorOptions` (object, optional): Connector-specific options

**Codespaces Connector Options:**
- `machine` (string): Machine size (default: 'basicLinux32gb')
  - Options: 'basicLinux32gb', 'standardLinux32gb', 'premiumLinux', etc.
- `retentionPeriod` (number): Days to retain stopped codespace (default: 14)

**Returns:** `Deployment` object with deployment details and URLs

#### `stop(name: string): Promise<void>`

Stop and delete a deployment.

#### `getStatus(name: string): Promise<DeploymentStatus>`

Get the current status of a deployment.

**Returns:** One of:
- `'provisioning'` - Being created
- `'starting'` - Starting up
- `'running'` - Active and available
- `'stopping'` - Shutting down
- `'stopped'` - Stopped/paused
- `'failed'` - Deployment failed

#### `list(filters?: ListFilters): Promise<Deployment[]>`

List all deployments, optionally filtered.

**Filters:**
- `status` (DeploymentStatus[]): Filter by status
- `owner` (string): Filter by repository owner
- `repo` (string): Filter by repository name
- `createdAfter` (string): Filter by creation date (ISO 8601)
- `createdBefore` (string): Filter by creation date (ISO 8601)

#### `getUrls(name: string, port?: number): Promise<DeploymentUrls>`

Get access URLs for a deployment.

**Returns:**
- `workspace` (string): Web IDE URL
- `sudocode` (string): Sudocode server URL
- `ssh` (string): SSH command or URL

### Type Definitions

#### `Deployment`

```typescript
interface Deployment {
  id: string;
  name: string;
  connector: 'codespaces' | 'coder';
  git: {
    owner: string;
    repo: string;
    branch: string;
  };
  status: DeploymentStatus;
  createdAt: string;
  urls: DeploymentUrls;
  keepAliveHours: number;
  idleTimeout?: number;
  metadata?: Record<string, any>;
}
```

## Error Handling

Sudopod provides specialized error classes for different failure scenarios:

```typescript
import {
  SudopodError,
  AuthenticationError,
  DeploymentFailedError,
  ConnectorError,
  ConnectorNotFoundError
} from 'sudopod';

try {
  await connector.deploy(options);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed:', error.message);
    // Guide user to authenticate with gh CLI
  } else if (error instanceof DeploymentFailedError) {
    console.error('Deployment failed:', error.message);
    // Handle deployment failure
  } else if (error instanceof ConnectorError) {
    console.error('Connector error:', error.operation, error.message);
    // Handle connector-specific error
  }
}
```

## Idle Timeout Mechanism

The Codespaces connector implements a sophisticated idle timeout system:

### How It Works

1. **GitHub's 5-minute auto-stop**: GitHub Codespaces have a hardcoded 5-minute idle timeout that automatically stops codespaces when inactive.

2. **Idle timeout daemon**: Sudopod starts a background daemon that:
   - Monitors the sudocode server log file for activity
   - Sends SSH keepalive commands every 30 seconds to prevent GitHub's auto-stop
   - Stops sending keepalive after the configured `idleTimeout` expires
   - Automatically resumes keepalive if activity is detected again

3. **Graceful pause**: When the idle timeout expires, the daemon stops sending SSH commands, allowing GitHub's 5-minute auto-stop to trigger, pausing the codespace.

### Configuration

```typescript
const deployment = await connector.deploy({
  // ... other options
  server: {
    port: 3000,
    idleTimeout: 4320, // 72 hours in minutes (default: 72 hours)
    keepAliveHours: 72  // Hours to preserve VM after pause
  }
});
```

- `idleTimeout`: Controls when the daemon stops preventing auto-pause
- `keepAliveHours`: Controls VM retention after the codespace pauses (prevents deletion)

## Advanced Usage

### Custom Workspace Directory

```typescript
const deployment = await connector.deploy({
  git: { owner: 'myorg', repo: 'myrepo', branch: 'main' },
  workspaceDir: '/workspaces/custom-path',
  server: { port: 3000 }
});
```

### Development Mode (Local Sudocode)

```typescript
const deployment = await connector.deploy({
  git: { owner: 'myorg', repo: 'myrepo', branch: 'main' },
  dev: true, // Install sudocode from local source
  server: { port: 3000 }
});
```

### Large Machine Deployment

```typescript
const deployment = await connector.deploy({
  git: { owner: 'myorg', repo: 'myrepo', branch: 'main' },
  server: { port: 3000 },
  connectorOptions: {
    machine: 'premiumLinux',
    retentionPeriod: 30 // Keep for 30 days after stopping
  }
});
```

## Development

### Setup

```bash
git clone https://github.com/sudocodeai/sudopod.git
cd sudopod
npm install
```

### Build

```bash
npm run build
```

### Testing

```bash
# Run unit tests
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests (requires GitHub authentication)
npm run test:integration

# Validate built package structure and exports
npm run test:package

# Run end-to-end deployment test (requires GitHub auth + test repo)
npm run test:e2e:deploy

# Run all tests
npm run test:all

# Watch mode
npm run test:watch
```

#### End-to-End Deployment Test

The e2e deployment test performs a real deployment using the sudopod SDK:

```bash
# Set test repository
export CODESPACES_TEST_BRANCH=main  # Optional, defaults to 'main'

# Run the test (deploys, validates, and cleans up)
npm run test:e2e:deploy

# Skip cleanup to keep the codespace running
SKIP_CLEANUP=1 npm run test:e2e:deploy
```

This test:
1. Imports the built package from `dist/`
2. Creates a Codespaces connector
3. Deploys a real GitHub Codespace
4. Validates deployment status and URLs
5. Tests all connector methods (getStatus, list, getUrls)
6. Cleans up by stopping the deployment (unless `SKIP_CLEANUP=1`)

### Project Structure

```
sudopod/
├── src/
│   ├── core/           # Core connector interface and factory
│   ├── connectors/     # Connector implementations
│   │   ├── codespaces.ts
│   │   └── coder.ts
│   ├── utils/          # Utility functions
│   │   └── codespaces/ # Codespaces-specific utilities
│   ├── types.ts        # TypeScript type definitions
│   └── index.ts        # Package exports
├── tests/
│   ├── unit/           # Unit tests
│   └── integration/    # Integration tests
├── dist/               # Compiled output
└── package.json
```

## Roadmap

- [x] GitHub Codespaces connector
- [x] Idle timeout daemon
- [x] Claude LTT authentication support
- [ ] Coder connector implementation
- [ ] Deployment lifecycle hooks
- [ ] Custom connector plugins

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/sudocodeai/sudopod/issues
- Documentation: https://github.com/sudocodeai/sudopod
