# Testing Guide

This document describes the testing philosophy, how to run tests, and how to write new tests for sudopod.

## Testing Philosophy

Sudopod uses a two-tier testing approach:

### Unit Tests
- **Purpose**: Fast, isolated tests that mock external dependencies
- **Location**: `tests/unit/**/*.test.ts`
- **Duration**: < 5 seconds total
- **Dependencies**: None (all external calls are mocked)
- **When to use**: 
  - Testing business logic and algorithms
  - Testing error handling paths
  - Testing input validation
  - Testing helper functions
  - Rapid development feedback

### Integration Tests
- **Purpose**: Validate real-world behavior with actual external resources
- **Location**: `tests/integration/**/*.test.ts`
- **Duration**: 10-20 minutes per test suite
- **Dependencies**: 
  - GitHub CLI installed and authenticated
  - Codespace creation permissions
  - Network connectivity
  - GitHub quota for creating codespaces
- **When to use**:
  - Validating end-to-end workflows
  - Testing against real GitHub Codespaces
  - Verifying system integration
  - Pre-release validation

**Philosophy**: Unit tests provide fast feedback during development. Integration tests provide confidence that the system works in production. Both are essential and complement each other.

## Running Tests

### Quick Start

```bash
# Run unit tests only (default, fast)
npm test

# Run unit tests in watch mode (for development)
npm run test:watch

# Run integration tests (slow, requires setup)
npm run test:integration

# Run all tests (unit + integration)
npm run test:all
```

### Test Commands Explained

| Command | What It Does | When to Use |
|---------|--------------|-------------|
| `npm test` | Runs unit tests only | Default for CI, local development |
| `npm run test:unit` | Same as `npm test` | Explicit unit test execution |
| `npm run test:integration` | Runs integration tests with external resources | Before releases, scheduled CI |
| `npm run test:all` | Runs both unit and integration tests | Comprehensive validation |
| `npm run test:watch` | Runs unit tests in watch mode | Active development |

### Integration Test Requirements

Integration tests require:

1. **GitHub CLI**: Install from https://cli.github.com/
   ```bash
   # macOS
   brew install gh
   
   # Linux
   curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
   sudo apt update
   sudo apt install gh
   ```

2. **Authentication**: Log in to GitHub
   ```bash
   gh auth login
   ```

3. **Permissions**: Ensure you have:
   - Access to the `sudocode-ai/sudocode` repository (or your test repository)
   - Codespace creation permissions
   - Sufficient GitHub quota for codespace creation

4. **Network**: Stable internet connection (tests create and interact with remote codespaces)

5. **Time**: Integration tests take 10-20 minutes to run

### Environment Variables

- `RUN_INTEGRATION_TESTS=1`: Required to enable integration tests
  ```bash
  RUN_INTEGRATION_TESTS=1 npm run test:integration
  ```

## Writing Tests

### Writing Unit Tests

Unit tests should mock all external dependencies (codespace operations, network calls, etc.).

**Example**: Testing keepalive script generation

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the execution module
vi.mock('../../../../src/utils/codespaces/execution.js', () => ({
  execInCodespace: vi.fn()
}));

describe('My Feature (Unit Tests)', () => {
  let mockExecInCodespace: ReturnType<typeof vi.fn>;
  
  beforeEach(async () => {
    const { execInCodespace } = await import('../../../../src/utils/codespaces/execution.js');
    mockExecInCodespace = execInCodespace as ReturnType<typeof vi.fn>;
    mockExecInCodespace.mockResolvedValue('success');
  });
  
  it('should generate valid script', async () => {
    // Mock behavior
    mockExecInCodespace.mockImplementation(async (name: string, cmd: string) => {
      if (cmd.includes('test -f')) {
        return '1'; // PID file exists
      }
      return 'success';
    });
    
    // Test your code
    const result = await myFunction();
    
    // Assert
    expect(result).toBeDefined();
    expect(mockExecInCodespace).toHaveBeenCalled();
  });
});
```

**Guidelines**:
- Location: `tests/unit/**/*.test.ts`
- Mock all external dependencies
- Test one thing per test
- Use descriptive test names
- Keep tests fast (< 1ms per test)
- Test edge cases and error paths

### Writing Integration Tests

Integration tests use real external resources. They should be comprehensive but not wasteful.

**Example**: Testing real codespace behavior

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCodespace, execInCodespace } from '../../../../src/utils/codespaces/index.js';

// Skip unless explicitly enabled
if (!process.env.RUN_INTEGRATION_TESTS) {
  console.log('\n⚠️  Skipping integration tests: RUN_INTEGRATION_TESTS not set');
  process.exit(0);
}

describe('My Feature (Integration)', () => {
  let codespaceName: string;
  
  beforeAll(async () => {
    // Create real codespace
    const codespace = await createCodespace({
      repository: 'sudocode-ai/sudocode',
      machine: 'basicLinux32gb'
    });
    codespaceName = codespace.name;
  }, 600000); // 10 minute timeout
  
  afterAll(async () => {
    // Clean up resources
    await deleteCodespace(codespaceName);
  });
  
  it('should work in real codespace', async () => {
    const result = await execInCodespace(codespaceName, 'echo "test"');
    expect(result).toContain('test');
  }, 60000); // 1 minute timeout
});
```

**Guidelines**:
- Location: `tests/integration/**/*.test.ts`
- Add environment variable check at the top
- Use realistic timeouts (these tests are slow)
- Clean up resources in `afterAll`
- Group related tests to share setup/teardown
- Document prerequisites in comments
- Handle test failures gracefully (preserve resources for debugging)

### When to Use Unit vs Integration Tests

| Scenario | Test Type | Reason |
|----------|-----------|--------|
| Testing script generation logic | Unit | No external dependencies needed |
| Testing parameter validation | Unit | Fast, isolated |
| Testing error handling paths | Unit | Easy to simulate errors |
| Testing calculations/algorithms | Unit | Pure logic, no I/O |
| Verifying codespace creation | Integration | Requires real GitHub API |
| Testing SSH connectivity | Integration | Requires real network |
| End-to-end workflow validation | Integration | Requires complete system |
| Pre-release smoke tests | Integration | Final validation before shipping |

**Rule of thumb**: If you can test it with mocks, write a unit test. If you need to verify real-world behavior, write an integration test.

## Continuous Integration (CI/CD)

### Recommended CI Strategy

**Pull Request Checks** (runs on every PR):
```yaml
# .github/workflows/test.yml
name: Unit Tests
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test  # Unit tests only - fast!
```

**Nightly Integration Tests** (runs on schedule):
```yaml
# .github/workflows/integration.yml
name: Integration Tests
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:  # Allow manual trigger
jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: gh auth login --with-token <<< "${{ secrets.GH_TOKEN }}"
      - run: npm run test:integration
    env:
      RUN_INTEGRATION_TESTS: 1
```

**Release Validation** (runs before releases):
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:all  # Both unit and integration
    env:
      RUN_INTEGRATION_TESTS: 1
```

### CI/CD Best Practices

1. **Always run unit tests on PRs**: Fast feedback, catches most issues
2. **Run integration tests on schedule**: Daily or nightly, not on every commit
3. **Manual integration test trigger**: Allow developers to run when needed
4. **Run all tests before releases**: Final validation
5. **Cache dependencies**: Speed up CI runs with npm/yarn cache
6. **Fail fast**: Set `bail: 1` in vitest config for integration tests
7. **Resource cleanup**: Ensure codespaces are deleted even on failure

## Test File Organization

```
tests/
├── unit/                          # Unit tests (fast, mocked)
│   └── utils/
│       └── codespaces/
│           └── keepalive-behavior.test.ts
└── integration/                   # Integration tests (slow, real resources)
    └── utils/
        └── codespaces/
            ├── helpers.ts         # Shared test utilities
            ├── keepalive-behavior.test.ts
            └── full-deployment.test.ts
```

## Troubleshooting

### Unit Tests Fail
- Check that mocks are properly configured
- Ensure imports use correct paths
- Verify vitest configuration is correct
- Run `npm run test:watch` for debugging

### Integration Tests Fail
- Verify GitHub CLI is installed: `gh --version`
- Check authentication: `gh auth status`
- Confirm codespace permissions: `gh codespace list`
- Check network connectivity
- Review codespace quota limits
- Check test logs for specific errors

### Tests Don't Run
- Ensure vitest is installed: `npm install`
- Check test file naming: must end in `.test.ts`
- Verify file location matches vitest config patterns
- For integration tests, ensure `RUN_INTEGRATION_TESTS=1` is set

## Coverage

Generate coverage reports:

```bash
# Unit test coverage
npm test -- --coverage

# View HTML report
open coverage/index.html
```

Coverage is collected only for unit tests (integration test coverage is disabled).

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [GitHub Codespaces API](https://docs.github.com/en/rest/codespaces)
