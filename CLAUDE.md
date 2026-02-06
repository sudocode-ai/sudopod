# CLAUDE.md

## Project

sudopod — CLI tool for provisioning and managing cloud development workspaces (GitHub Codespaces, self-hosted Coder).

## Sudocode Workflow

**Actively maintain sudocode specs and issues during implementation.** This is critical for keeping the project's knowledge base accurate:

- **Update issues as you work**: When starting an issue, set it to `in_progress`. When done, close it with feedback on the spec documenting what was built and any deviations from the spec.
- **Add feedback when closing issues**: Always use `add_feedback` on the parent spec when closing an implementing issue. Document what was built, what deviated from the spec, and why.
- **Create new issues for emergent work**: If implementation reveals new work (refactors, bugs, follow-up features, tech debt), create sudocode issues immediately rather than leaving TODOs in code.
- **Check issue status before starting work**: Run `list_issues` or `ready` to see what's actually open vs what's already been done in code. The tracker can fall behind — verify against the codebase.
- **Keep specs updated**: If implementation significantly deviates from a spec, add feedback or update the spec so future work builds on accurate information.

## Tech Stack

- TypeScript, Node.js (ESM)
- Vitest for testing (unit + integration)
- GitHub CLI (`gh`) for Codespaces operations
- Coder SDK for self-hosted Coder operations

## Key Directories

- `src/provider/` — Provider implementations (codespaces, coder)
- `src/services/` — Service registry and workspace manifest
- `src/coder-sdk/` — Coder API client
- `tests/unit/` — Unit tests
- `tests/integration/` — Integration tests (require real infrastructure)
- `specs/` — Sudocode spec markdown files

## Testing

- Unit tests: `npm test`
- Integration/E2E tests: `npm run test:integration`, `npm run test:e2e:codespaces`, etc.
- **See [TESTING.md](./TESTING.md) for full details** — includes all test commands, infrastructure auto-provisioning (Coder Docker stacks, Tailscale/Headscale, Codespaces), setup scripts, and troubleshooting.
