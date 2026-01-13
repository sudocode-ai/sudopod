# Testing Guide

## Running Tests

```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:all           # All tests
```

Run specific test file:
```bash
npm test -- tests/unit/path/to/test.test.ts
npm run test:integration -- tests/integration/path/to/test.test.ts
```

## Integration Test Setup

Integration tests require GitHub CLI and secrets configuration.

### 1. GitHub CLI

```bash
gh auth login
gh auth status
```

### 2. Secrets Configuration

```bash
cp tests/.env.secrets.example tests/.env.secrets
```

Edit `tests/.env.secrets` and add your secrets:
```
CLAUDE_AUTH_TOKEN=xxxxx
```

Available secrets:
- **CLAUDE_AUTH_TOKEN**: Claude API token from https://console.anthropic.com/

## Troubleshooting

**Missing secrets**: Ensure `tests/.env.secrets` exists with format `KEY=value` (no spaces/quotes)

**GitHub auth errors**: Run `gh auth login`

**Test failures**: Failed integration tests preserve codespaces for debugging:
```bash
gh codespace list
gh codespace delete --codespace <name> --force
```
