# Testing

## Quick Reference

```bash
npm test                              # Unit tests
npm run test:e2e                      # E2E tests (Coder: workspace + sudocode server health)
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

## Integration Test Suites

Each suite has its own vitest config so it only provisions the infrastructure it needs.

| Suite | Config | Provisions | Prerequisites |
|-------|--------|------------|---------------|
| **Coder (self-hosted)** | `vitest.integration.coder.config.ts` | Self-hosted stack (`:7080`) | Docker, `refs/coder-infra` submodule |
| **Coder (hub)** | `vitest.integration.coder-hub.config.ts` | Hub stack (`:7081`) | Docker, `refs/coder-infra` submodule |
| **Tailscale** | `vitest.integration.tailscale.config.ts` | Per-test `beforeAll`/`afterAll` | Docker, ngrok, `RUN_INTEGRATION_TESTS=1` |
| **Codespaces** | `vitest.integration.codespaces.config.ts` | Per-test `beforeAll`/`afterAll` | Docker, ngrok, `gh` CLI, `RUN_INTEGRATION_TESTS=1` |
| **Client** | `vitest.integration.client.config.ts` | None | Nothing |

The aggregate `vitest.integration.config.ts` runs all suites and provisions both Coder stacks.

## Coder Infrastructure

Managed by the `refs/coder-infra` submodule. Setup files auto-provision if containers aren't running.

| Flow | Port | Env Vars | Compose File |
|------|------|----------|--------------|
| Self-hosted | 7080 | `CODER_URL`, `CODER_TOKEN` | `docker-compose.self-hosted.yml` |
| Hub | 7081 | `CODER_HUB_URL`, `CODER_HUB_TOKEN` | `docker-compose.hub.yml` |

Manual setup if needed:

```bash
git submodule update --init refs/coder-infra
refs/coder-infra/scripts/self-hosted-testing-setup.sh   # Full reset + provision
refs/coder-infra/scripts/hub-testing-setup.sh            # Full reset + provision
```

Teardown:

```bash
cd refs/coder-infra
docker compose -f docker-compose.self-hosted.yml down -v
docker compose -f docker-compose.hub.yml down -v
```

## Tailscale / Codespaces Infrastructure

The codespaces E2E test (`tests/integration/provider/codespaces/e2e.test.ts`) and the tailscale integration tests use a local Headscale control server, ngrok tunnel, and Docker Tailscale client. The test provisions this infrastructure in `beforeAll()` and tears it down in `afterAll()`.

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
