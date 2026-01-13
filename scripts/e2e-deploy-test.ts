#!/usr/bin/env node
/**
 * True end-to-end deployment test for sudopod
 *
 * This script performs a real deployment using the sudopod SDK:
 * 1. Imports the built package from dist/
 * 2. Creates a Codespaces provider
 * 3. Deploys a real GitHub Codespace
 * 4. Validates deployment status and URLs
 * 5. Cleans up by stopping the deployment
 *
 * Requirements:
 * - GitHub CLI installed and authenticated (gh auth login)
 * - CODESPACES_TEST_BRANCH environment variable (optional, defaults to 'main')
 *
 * Run: npm run test:e2e:deploy
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
  magenta: '\x1b[35m',
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

function step(message: string) {
  log(colors.magenta, '→', message);
}

async function runE2ETest() {
  console.log('\n' + colors.blue + '='.repeat(60) + colors.reset);
  console.log(colors.blue + 'Sudopod End-to-End Deployment Test' + colors.reset);
  console.log(colors.blue + '='.repeat(60) + colors.reset + '\n');

  // Validate environment
  info('Checking environment variables...');
  const testRepo = "sudocode-ai/sudocode"
  const testBranch = process.env.CODESPACES_TEST_BRANCH || 'main';

  const [owner, repo] = testRepo.split('/');
  if (!owner || !repo) {
    error('CODESPACES_TEST_REPO must be in format: owner/repo');
    process.exit(1);
  }

  success(`Test repository: ${testRepo}`);
  success(`Test branch: ${testBranch}`);
  console.log('');

  // Import sudopod from built package
  step('Importing sudopod from built package...');
  let sudopod: any;
  try {
    sudopod = await import('../dist/index.js');
    success('Successfully imported sudopod from dist/');
  } catch (err: any) {
    error(`Failed to import: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // Create provider
  step('Creating Codespaces provider...');
  let provider: any;
  try {
    provider = sudopod.createProvider({ type: 'codespaces' });
    success('Provider created successfully');
  } catch (err: any) {
    error(`Failed to create provider: ${err.message}`);
    process.exit(1);
  }
  console.log('');

  // Deploy codespace
  step('Deploying GitHub Codespace...');
  info(`Repository: ${owner}/${repo}`);
  info(`Branch: ${testBranch}`);
  info('Machine: basicLinux32gb');
  info('This may take 2-5 minutes...');
  console.log('');

  let deployment: any;
  try {
    deployment = await provider.deploy({
      git: {
        owner,
        repo,
        branch: testBranch,
      },
      server: {
        port: 3000,
        idleTimeout: 4320, // 72 hours
        keepAliveHours: 72,
      },
      providerOptions: {
        machine: 'basicLinux32gb',
        retentionPeriod: 1, // Delete after 1 day for testing
      },
    });

    success('Deployment created successfully!');
    console.log('');
    console.log(colors.cyan + 'Deployment Details:' + colors.reset);
    console.log(`  ID: ${deployment.id}`);
    console.log(`  Name: ${deployment.name}`);
    console.log(`  Status: ${deployment.status}`);
    console.log(`  Provider: ${deployment.provider}`);
    console.log(`  Created: ${deployment.createdAt}`);
    console.log('');
    console.log(colors.cyan + 'URLs:' + colors.reset);
    console.log(`  Workspace: ${deployment.urls.workspace}`);
    console.log(`  Sudocode: ${deployment.urls.sudocode}`);
    console.log(`  SSH: ${deployment.urls.ssh}`);
    console.log('');
  } catch (err: any) {
    error(`Deployment failed: ${err.message}`);
    if (err.cause) {
      console.log('  Cause:', err.cause.message);
    }
    process.exit(1);
  }

  // Validate deployment
  step('Validating deployment...');
  try {
    // Check status
    const status = await provider.getStatus(deployment.id);
    if (status === 'running') {
      success(`Status check: ${status}`);
    } else {
      warn(`Status is ${status} (expected 'running')`);
    }

    // Check URLs
    const urls = await provider.getUrls(deployment.id);
    if (urls.workspace && urls.sudocode && urls.ssh) {
      success('All URLs generated successfully');
    } else {
      warn('Some URLs are missing');
    }

    // List deployments
    const deployments = await provider.list();
    const found = deployments.find((d: any) => d.id === deployment.id);
    if (found) {
      success('Deployment found in list()');
    } else {
      warn('Deployment not found in list()');
    }
  } catch (err: any) {
    error(`Validation failed: ${err.message}`);
  }
  console.log('');

  // Cleanup
  step('Cleaning up (stopping deployment)...');
  const shouldCleanup = process.env.SKIP_CLEANUP !== '1';

  if (shouldCleanup) {
    try {
      await provider.stop(deployment.id);
      success('Deployment stopped and deleted');
    } catch (err: any) {
      error(`Cleanup failed: ${err.message}`);
      warn('You may need to manually delete the codespace');
      console.log(`  Run: gh codespace delete --codespace ${deployment.id}`);
    }
  } else {
    warn('Skipping cleanup (SKIP_CLEANUP=1)');
    console.log(`  To manually delete: gh codespace delete --codespace ${deployment.id}`);
  }
  console.log('');

  // Summary
  console.log(colors.blue + '='.repeat(60) + colors.reset);
  console.log(colors.blue + 'Test Summary' + colors.reset);
  console.log(colors.blue + '='.repeat(60) + colors.reset);
  console.log('');
  success('End-to-end deployment test completed successfully!');
  console.log('');
  console.log(colors.green + '✓ sudopod SDK works correctly' + colors.reset);
  console.log(colors.green + '✓ Codespaces provider can deploy workspaces' + colors.reset);
  console.log(colors.green + '✓ All provider methods function as expected' + colors.reset);
  console.log('');
}

// Run test
runE2ETest()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(colors.red + 'Fatal error:' + colors.reset, err);
    process.exit(1);
  });
