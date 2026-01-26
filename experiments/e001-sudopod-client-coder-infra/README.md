# Experiment e001: Validate SudopodClient E2E against local coder-infra

**Issue:** [[i-419i]]  
**Date:** 2026-01-26  
**Status:** Complete

## Objective

Validate that `SudopodClient` from sudopod correctly communicates with the coder-provider server running locally via docker-compose.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+
- sudopod built (`npm run build` in project root)
- Google OAuth credentials in `refs/coder-infra/.env.oidc`

## Setup

### 1. Start the coder-infra E2E stack

```bash
cd refs/coder-infra

# Start the full stack with OIDC (postgres, coder, coder-init, coder-provider)
docker-compose -f docker-compose.e2e.yml --env-file .env.oidc up -d

# Wait for the provider to be ready (check health endpoint)
curl http://localhost:8082/health
# Should return: {"ok":true,"timestamp":"..."}
```

The stack includes:
- **postgres**: Database on internal network
- **coder**: Coder server on port 7082 (with Google OIDC)
- **coder-init**: Bootstraps admin user and pushes template
- **coder-provider**: HTTP API server on port 8082

### 2. Run the experiment

```bash
# From the sudopod root directory
npx tsx experiments/e001-sudopod-client-coder-infra/run-experiment.ts

# Or with a custom test user email
TEST_USER_EMAIL=your@email.com npx tsx experiments/e001-sudopod-client-coder-infra/run-experiment.ts

# Run with cleanup (deletes workspace after test)
CLEANUP=true npx tsx experiments/e001-sudopod-client-coder-infra/run-experiment.ts
```

### 3. Access the workspace via browser

After running the experiment (without CLEANUP), you can access the workspace:
1. Visit http://localhost:7082
2. Click "Sign in with Google"
3. Use your Google account (must be in `gmail.com` or `sudocode.ai` domain)
4. Access your workspace from the dashboard

### 4. Cleanup

```bash
cd refs/coder-infra
docker-compose -f docker-compose.e2e.yml down -v
```

## What's Being Tested

| Operation | Endpoint | Expected |
|-----------|----------|----------|
| Health check | GET /health | 200, `{ok: true}` |
| Create workspace | POST /workspaces | 201, workspace object |
| Get workspace | GET /workspaces/:id | 200, workspace object |
| List workspaces | GET /workspaces | 200, array |
| Delete workspace | DELETE /workspaces/:id | 204 |

## Configuration

The experiment uses:
- **Provider URL:** http://localhost:8082
- **API Key:** e2e-test-api-key (from docker-compose.e2e.yml)
- **Test repository:** octocat/Hello-World (public, no auth needed)

## Results

See [results.md](./results.md) for captured output and observations.

## Known Issues & Fixes

### Docker Networking on Local MacBook

When running locally with Docker Desktop, workspace containers cannot reach `localhost:7082` because `localhost` inside the container refers to the container itself, not the host machine.

**Solution**: The `e2e-test-workspace` template rewrites the Coder agent init script to use the internal Docker hostname:

```hcl
# In templates/e2e-test-workspace/main.tf
command = ["sh", "-c", replace(replace(
  coder_agent.main.init_script,
  "localhost:7081", "coder:7080"),  # run-e2e-test.sh uses port 7081
  "localhost:7082", "coder:7080")]  # docker-compose.e2e.yml uses port 7082
```

**Key points**:
- The Coder server's Docker network alias is `coder` (not `coder-e2e`)
- External port 7082 maps to internal port 7080
- All containers must be on the same Docker network (`coder-e2e-network`)

### OIDC Email Domain

The E2E stack restricts Google OIDC sign-in to specific email domains. By default, only `gmail.com` and `sudocode.ai` domains are allowed.

To modify allowed domains, edit `refs/coder-infra/.env.oidc`:
```bash
CODER_OIDC_EMAIL_DOMAIN="gmail.com,sudocode.ai,yourdomain.com"
```

Then restart the stack:
```bash
docker-compose -f docker-compose.e2e.yml --env-file .env.oidc up -d --force-recreate coder
```
