# Testing

## Quick Reference

```bash
npm test                              # Unit tests
npm run test:e2e                      # E2E tests (Coder: workspace + sudocode server health)
npm run test:e2e:coder                # E2E tests (Coder: setup + Tailscale + connectivity + resume)
npm run test:e2e:codespaces           # E2E tests (Codespaces: setup + Tailscale + connectivity + resume)
npm run test:integration              # All integration tests (provisions both Coder stacks)
npm run test:integration:coder        # Self-hosted Coder tests (provisions :7080 only)
npm run test:integration:coder-hub    # Hub Coder tests (provisions :7081 only)
npm run test:integration:tailscale    # Tailscale infrastructure tests (local tailnet, connectivity)
npm run test:integration:codespaces   # Codespaces provider tests
npm run test:integration:client       # Client tests (no infra needed)
```

Run a specific file:

```bash
npx vitest run tests/integration/coder-sdk/hub-user.test.ts --config vitest.integration.coder-hub.config.ts
```

## How Infrastructure Auto-Provisioning Works

**You don't need to set env vars or start Docker containers manually for Coder tests.** Each npm integration script uses a vitest config with a global setup file that:

1. Checks if the required Docker containers are already running
2. If not, runs the full provisioning script (Docker Compose up, admin user creation, template push, API token generation)
3. Injects `CODER_URL` and `CODER_TOKEN` (or `CODER_HUB_URL`/`CODER_HUB_TOKEN`) as env vars into the vitest process
4. Runs the tests

So the typical workflow is just:

```bash
npm run test:integration:coder     # Spins up :7080 if needed, runs tests
npm run test:integration:coder-hub # Spins up :7081 if needed, runs tests
```

First run takes ~60s for provisioning. Subsequent runs reuse the existing containers and are much faster.

**Prerequisites:** Docker must be running and the `refs/coder-infra` submodule must be initialized:

```bash
git submodule update --init refs/coder-infra
```

## Integration Test Suites

Each suite has its own vitest config so it only provisions the infrastructure it needs.

| Suite | Config | Auto-Provisions | Prerequisites |
|-------|--------|-----------------|---------------|
| **Coder (self-hosted)** | `vitest.integration.coder.config.ts` | Docker stack on `:7080`, injects `CODER_URL`/`CODER_TOKEN` | Docker, `refs/coder-infra` submodule |
| **Coder (hub)** | `vitest.integration.coder-hub.config.ts` | Docker stack on `:7081`, injects `CODER_HUB_URL`/`CODER_HUB_TOKEN` | Docker, `refs/coder-infra` submodule |
| **Tailscale** | `vitest.integration.tailscale.config.ts` | Per-test `beforeAll`/`afterAll` | Docker, ngrok, `RUN_INTEGRATION_TESTS=1` |
| **Codespaces** | `vitest.integration.codespaces.config.ts` | Per-test `beforeAll`/`afterAll` | Docker, ngrok, `gh` CLI, `RUN_INTEGRATION_TESTS=1` |
| **Client** | `vitest.integration.client.config.ts` | None | Nothing |

The aggregate `vitest.integration.config.ts` runs all suites and provisions both Coder stacks.

## Coder Infrastructure (Manual)

Normally auto-provisioned (see above). Use these commands only if you need to manually reset or tear down the infrastructure.

| Flow | Port | Env Vars (auto-injected) | Compose File |
|------|------|--------------------------|--------------|
| Self-hosted | 7080 | `CODER_URL`, `CODER_TOKEN` | `docker-compose.self-hosted.yml` |
| Hub | 7081 | `CODER_HUB_URL`, `CODER_HUB_TOKEN` | `docker-compose.hub.yml` |

Manual reset (full teardown + reprovision):

```bash
refs/coder-infra/scripts/self-hosted-testing-setup.sh   # Full reset + provision
refs/coder-infra/scripts/hub-testing-setup.sh            # Full reset + provision
```

Teardown only:

```bash
cd refs/coder-infra
docker compose -f docker-compose.self-hosted.yml down -v
docker compose -f docker-compose.hub.yml down -v
```

## Tailscale / Codespaces Infrastructure

The Coder E2E test (`tests/integration/provider/coder/e2e.test.ts`), codespaces E2E test (`tests/integration/provider/codespaces/e2e.test.ts`), and the tailscale integration tests use a local Headscale control server, ngrok tunnel, and Docker Tailscale client. Each test provisions this infrastructure in `beforeAll()` and tears it down in `afterAll()`.

For faster iteration, use the setup script to bring up the infrastructure once and run the test repeatedly:

```bash
./scripts/tailscale-infra-setup.sh up      # Start Headscale + ngrok + Docker Tailscale
./scripts/tailscale-infra-setup.sh down    # Tear everything down
```

After `up`, the script writes `.env.tailscale-test` with the generated env vars (API keys, ngrok URL, preauthkeys). Note that the E2E test currently provisions its own infra in `beforeAll()` — the script is for manual convenience when iterating.

## Troubleshooting

- **Tests skip with "CODER_URL not set"**: Docker isn't running or `refs/coder-infra` submodule is missing. Run `git submodule update --init refs/coder-infra`.
- **Token errors**: Coder was recreated. Re-run the setup script for that flow.
- **Leftover codespaces**: `gh codespace list` then `gh codespace delete --codespace <name> --force`
- **Leftover test workspaces**: Check Coder UI at `localhost:7080` or `localhost:7081`.
