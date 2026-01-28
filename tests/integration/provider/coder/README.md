# Coder Integration Tests

This directory contains integration tests for the Coder provider. These tests require a running Coder instance.

## Prerequisites

- Docker and Docker Compose
- Coder CLI (`brew install coder/coder/coder` or download from https://coder.com/docs/install)

## Local Coder Setup

The `refs/coder-infra` directory contains a Docker-based Coder setup for local development.

### 1. Start Coder Server

```bash
cd refs/coder-infra

# Copy the example env file
cp .env.oidc.example .env

# Edit .env with your OAuth credentials (Google OAuth required for OIDC)
# Or use basic auth by removing OIDC config

# Start Coder
docker-compose -f docker-compose.oidc.yml up -d
```

Coder will be available at http://localhost:7080

### 2. Create Admin User & Get Token

```bash
# First login creates admin user
# Via browser: http://localhost:7080

# Or via CLI:
coder login http://localhost:7080

# Create a token for tests
coder tokens create sudopod-test
```

### 3. Push the Test Template

```bash
cd refs/coder-infra

# Push the local-docker template
coder templates push local-docker \
  --directory ./templates/minimal \
  --yes
```

### 4. Configure Test Environment

Create `.env.test` in the project root:

```bash
CODER_URL=http://localhost:7080
CODER_TOKEN=<your-token-from-step-2>
```

## Running Tests

```bash
# Run all Coder integration tests
npm run test:integration -- tests/integration/provider/coder

# Run specific test file
npm run test:integration -- tests/integration/provider/coder/api.test.ts

# Run with verbose output
npm run test:integration -- tests/integration/provider/coder --reporter=verbose
```

## Test Workspace Naming

Integration tests create workspaces with the naming pattern `test-{timestamp}` and clean them up in `afterAll()`. If tests are interrupted, you may need to manually delete leftover workspaces:

```bash
coder list
coder delete test-1234567890 --yes
```

## Troubleshooting

### "Token invalid" errors

Tokens expire. Create a new one:
```bash
coder tokens create sudopod-test-new
```

### Container networking issues

Ensure the `coder-network` Docker network exists:
```bash
docker network ls | grep coder-network
# If missing:
docker network create coder-network
```

### Workspace stuck in "starting"

Check the Coder logs:
```bash
docker-compose -f docker-compose.oidc.yml logs -f coder
```

Check the workspace agent logs:
```bash
coder ssh <workspace-name> -- cat /tmp/coder-agent.log
```
