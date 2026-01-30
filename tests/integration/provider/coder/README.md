# Coder Integration Tests

This directory contains integration tests for the Coder provider. These tests require a running Coder instance.

## Prerequisites

- Docker and Docker Compose
- jq (`brew install jq`)

## Setup

The Coder instance is managed by the `refs/coder-infra` submodule. You must start and configure it before running tests.

### 1. Start Coder (self-hosted flow)

```bash
cd refs/coder-infra
docker compose -f docker-compose.self-hosted.yml up -d
```

Coder will be available at http://localhost:7080

### 2. Run setup (creates admin user, generates API token)

```bash
cd refs/coder-infra
./scripts/setup-self-hosted.sh
```

This creates:
- Admin user: `ssh.fake1@gmail.com` / `ABC151qwe!@`
- A long-lived API token saved to `refs/coder-infra/.coder-token`

### 3. Export token to your shell

```bash
cd refs/coder-infra
eval $(./scripts/get-token.sh --export)
```

Or create `.env.test` in the project root:

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

Tests skip automatically if `CODER_URL` and `CODER_TOKEN` are not set.

## Teardown

```bash
cd refs/coder-infra
docker compose -f docker-compose.self-hosted.yml down -v
```

## Troubleshooting

### "Token invalid" errors

Tokens expire or the Coder instance was recreated. Re-run setup:
```bash
cd refs/coder-infra
./scripts/setup-self-hosted.sh
eval $(./scripts/get-token.sh --export)
```

### Workspace stuck in "starting"

Check Coder logs:
```bash
cd refs/coder-infra
docker compose -f docker-compose.self-hosted.yml logs -f coder
```

### Test workspace cleanup

Integration tests create workspaces with the pattern `test-{timestamp}` and clean up in `afterAll()`. If interrupted, manually delete via the Coder UI at http://localhost:7080.
