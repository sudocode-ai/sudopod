#!/usr/bin/env node
/**
 * End-to-end testing script for sudopod
 * 
 * This script validates that the built package works correctly by:
 * 1. Importing from the built dist/ directory
 * 2. Creating provider instances
 * 3. Validating type safety and exports
 * 4. Testing error handling
 * 
 * Run: npm run test:e2e
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color: string, prefix: string, message: string) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

function success(message: string) {
  log(colors.green, '✓', message);
}

function error(message: string) {
  log(colors.red, '✗', message);
}

function info(message: string) {
  log(colors.cyan, 'ℹ', message);
}

function warn(message: string) {
  log(colors.yellow, '⚠', message);
}

// Test suite
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    success(message);
    testsPassed++;
  } else {
    error(message);
    testsFailed++;
  }
}

async function runTests() {
  console.log('\n' + colors.blue + '='.repeat(60) + colors.reset);
  console.log(colors.blue + 'Sudopod End-to-End Tests' + colors.reset);
  console.log(colors.blue + '='.repeat(60) + colors.reset + '\n');

  // Check that dist/ exists
  info('Checking build output...');
  const distPath = join(__dirname, '..', 'dist');
  assert(existsSync(distPath), 'dist/ directory exists');
  assert(existsSync(join(distPath, 'index.js')), 'dist/index.js exists');
  assert(existsSync(join(distPath, 'index.d.ts')), 'dist/index.d.ts exists');
  assert(existsSync(join(distPath, 'types.js')), 'dist/types.js exists');
  assert(existsSync(join(distPath, 'types.d.ts')), 'dist/types.d.ts exists');
  console.log('');

  // Import from built package
  info('Importing from built package...');
  let sudopod: any;
  try {
    sudopod = await import('../dist/index.js');
    success('Successfully imported from dist/index.js');
  } catch (err: any) {
    error(`Failed to import: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // Test exports
  info('Validating exports...');
  assert(typeof sudopod.createProvider === 'function', 'createProvider is exported as function');
  assert(typeof sudopod.SudopodError === 'function', 'SudopodError is exported');
  assert(typeof sudopod.AuthenticationError === 'function', 'AuthenticationError is exported');
  assert(typeof sudopod.DeploymentFailedError === 'function', 'DeploymentFailedError is exported');
  assert(typeof sudopod.ProviderError === 'function', 'ProviderError is exported');
  assert(typeof sudopod.ProviderNotFoundError === 'function', 'ProviderNotFoundError is exported');
  console.log('');

  // Test factory function
  info('Testing factory function...');
  try {
    const codespacesProvider = sudopod.createProvider({ type: 'codespaces' });
    assert(codespacesProvider !== null, 'createProvider returns provider instance');
    assert(codespacesProvider.type === 'codespaces', 'Provider has correct type');
    assert(typeof codespacesProvider.deploy === 'function', 'Provider has deploy method');
    assert(typeof codespacesProvider.stop === 'function', 'Provider has stop method');
    assert(typeof codespacesProvider.getStatus === 'function', 'Provider has getStatus method');
    assert(typeof codespacesProvider.list === 'function', 'Provider has list method');
    assert(typeof codespacesProvider.getUrls === 'function', 'Provider has getUrls method');
  } catch (err: any) {
    error(`Failed to create provider: ${err.message}`);
  }
  console.log('');

  // Test error handling
  info('Testing error handling...');
  try {
    sudopod.createProvider({ type: 'invalid' } as any);
    error('Should throw error for invalid provider type');
  } catch (err: any) {
    if (err instanceof sudopod.ProviderNotFoundError) {
      success('Throws ProviderNotFoundError for invalid provider type');
    } else {
      error(`Wrong error type thrown: ${err.constructor.name}`);
    }
  }

  try {
    const coderProvider = sudopod.createProvider({ type: 'coder', url: 'https://coder.example.com', apiKey: 'test' });
    // Coder provider is implemented but not functional yet - this is expected
    assert(coderProvider.type === 'coder', 'Can create Coder provider instance (implementation pending)');
  } catch (err: any) {
    error(`Failed to create Coder provider: ${err.message}`);
  }
  console.log('');

  // Test error classes
  info('Testing error classes...');
  const sudopodError = new sudopod.SudopodError('test message', 'TEST_CODE');
  assert(sudopodError.message === 'test message', 'SudopodError sets message');
  assert(sudopodError.code === 'TEST_CODE', 'SudopodError sets code');
  assert(sudopodError instanceof Error, 'SudopodError extends Error');

  const authError = new sudopod.AuthenticationError('codespaces', 'auth failed');
  assert(authError.provider === 'codespaces', 'AuthenticationError sets provider');
  assert(authError.message.includes('auth failed'), 'AuthenticationError includes message');
  assert(authError instanceof sudopod.SudopodError, 'AuthenticationError extends SudopodError');

  const deployError = new sudopod.DeploymentFailedError('deploy failed', new Error('cause'));
  assert(deployError.message.includes('deploy failed'), 'DeploymentFailedError includes message');
  assert(deployError.cause instanceof Error, 'DeploymentFailedError sets cause');

  const providerError = new sudopod.ProviderError('codespaces', 'deploy', 'operation failed');
  assert(providerError.provider === 'codespaces', 'ProviderError sets provider');
  assert(providerError.operation === 'deploy', 'ProviderError sets operation');
  assert(providerError.message.includes('operation failed'), 'ProviderError includes message');
  console.log('');

  // Test type definitions
  info('Testing type definitions...');
  const typesPath = join(distPath, 'types.d.ts');
  assert(existsSync(typesPath), 'types.d.ts exists');
  const indexTypesPath = join(distPath, 'index.d.ts');
  assert(existsSync(indexTypesPath), 'index.d.ts exists');
  console.log('');

  // Test provider structure validation
  info('Testing provider structure...');
  const provider = sudopod.createProvider({ type: 'codespaces' });
  
  // Validate method signatures
  assert(provider.deploy.length === 1, 'deploy() accepts 1 parameter');
  assert(provider.stop.length === 1, 'stop() accepts 1 parameter');
  assert(provider.getStatus.length === 1, 'getStatus() accepts 1 parameter');
  assert(provider.list.length <= 1, 'list() accepts 0-1 parameters');
  assert(provider.getUrls.length <= 2, 'getUrls() accepts 1-2 parameters');
  console.log('');

  // Summary
  console.log(colors.blue + '='.repeat(60) + colors.reset);
  console.log(colors.blue + 'Test Summary' + colors.reset);
  console.log(colors.blue + '='.repeat(60) + colors.reset);
  console.log('');
  
  if (testsFailed === 0) {
    success(`All ${testsPassed} tests passed!`);
    console.log('');
    console.log(colors.green + '✓ Package is ready for publishing' + colors.reset);
    console.log('');
    return 0;
  } else {
    error(`${testsFailed} test(s) failed, ${testsPassed} passed`);
    console.log('');
    console.log(colors.red + '✗ Package has issues that need to be fixed' + colors.reset);
    console.log('');
    return 1;
  }
}

// Run tests
runTests()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error(colors.red + 'Fatal error:' + colors.reset, err);
    process.exit(1);
  });
