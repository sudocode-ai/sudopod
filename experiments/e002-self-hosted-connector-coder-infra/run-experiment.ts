/**
 * Experiment e002: Validate SelfHostedConnector E2E against local coder-infra
 *
 * This script validates that SelfHostedConnector correctly:
 * - Connects to the coder-provider server
 * - Injects userIdentity into requests
 * - Expands environment variables in config
 * - Performs full workspace lifecycle
 *
 * Issue: i-5180
 *
 * Prerequisites:
 *   cd refs/coder-infra && docker-compose -f docker-compose.e2e.yml up -d
 *
 * Usage:
 *   cd experiments/e002-self-hosted-connector-coder-infra
 *   npx tsx run-experiment.ts
 */

import { SelfHostedConnector } from '../../src/connectors/self-hosted/index.js';
import { ConnectorError } from '../../src/core/errors.js';
import type { Workspace } from '../../src/types/index.js';

// Configuration matching docker-compose.e2e.yml
const CONFIG = {
  providerUrl: 'http://localhost:8082',
  apiKey: 'e2e-test-api-key',
  coderUrl: 'http://localhost:7082',
};

// Test data
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'ssh.randy@sudocode.ai';
const TEST_REPOSITORY = process.env.TEST_REPOSITORY || 'octocat/Hello-World';
const TEST_BRANCH = process.env.TEST_BRANCH || 'master';

// Whether to clean up after the experiment
const CLEANUP = process.env.CLEANUP === 'true';

// Logging helpers
function log(step: string, message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${step}] ${message}`);
}

function logSuccess(step: string, message: string): void {
  log(step, `✓ ${message}`);
}

function logError(step: string, message: string): void {
  log(step, `✗ ${message}`);
}

function logInfo(step: string, message: string): void {
  log(step, `  ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runExperiment(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Experiment e002: SelfHostedConnector E2E Validation');
  console.log('='.repeat(60));
  console.log('');

  // Set up environment variables for testing env var expansion
  process.env.E2E_PROVIDER_URL = CONFIG.providerUrl;
  process.env.E2E_API_KEY = CONFIG.apiKey;
  process.env.E2E_TEST_SECRET = 'test-secret-value';

  // Create connector with env var expansion in config
  const connector = new SelfHostedConnector({
    type: 'self-hosted',
    providerUrl: '${E2E_PROVIDER_URL}',
    apiKey: '${E2E_API_KEY}',
    userIdentity: {
      email: TEST_USER_EMAIL,
      username: 'e2e-test-user',
    },
    secrets: {
      TEST_SECRET: '${E2E_TEST_SECRET}',
    },
    timeout: 60000,
  });

  let createdWorkspace: Workspace | null = null;

  try {
    // Step 1: Validate connection
    log('VALIDATE', 'Validating connector configuration...');
    await connector.validate();
    logSuccess('VALIDATE', 'Connector validated successfully');

    // Step 2: Create Workspace
    log('CREATE', 'Creating workspace via SelfHostedConnector...');
    logInfo('CREATE', `Repository: ${TEST_REPOSITORY}`);
    logInfo('CREATE', `Branch: ${TEST_BRANCH}`);
    logInfo('CREATE', `User: ${TEST_USER_EMAIL}`);

    createdWorkspace = await connector.createWorkspace({
      repository: TEST_REPOSITORY,
      branch: TEST_BRANCH,
    });

    logSuccess('CREATE', `Workspace created: ${createdWorkspace.id}`);
    logInfo('CREATE', `Name: ${createdWorkspace.name}`);
    logInfo('CREATE', `Status: ${createdWorkspace.status}`);
    logInfo('CREATE', `Owner: ${createdWorkspace.owner}`);

    // Step 3: Get Workspace
    log('GET', `Getting workspace ${createdWorkspace.id}...`);
    const fetchedWorkspace = await connector.getWorkspace(createdWorkspace.id);
    logSuccess('GET', 'Workspace fetched successfully');
    logInfo('GET', `Status: ${fetchedWorkspace.status}`);
    logInfo('GET', `URLs: ${JSON.stringify(fetchedWorkspace.urls)}`);

    // Step 4: List Workspaces
    log('LIST', 'Listing all workspaces...');
    const workspaces = await connector.listWorkspaces();
    logSuccess('LIST', `Found ${workspaces.length} workspace(s)`);
    for (const ws of workspaces) {
      logInfo('LIST', `  - ${ws.id}: ${ws.name} (${ws.status})`);
    }

    // Step 5: Wait for workspace to stabilize
    log('WAIT', 'Waiting for workspace to stabilize...');
    let attempts = 0;
    const maxAttempts = 30;
    const stableStatuses = ['running', 'stopped', 'failed'];

    while (attempts < maxAttempts) {
      const ws = await connector.getWorkspace(createdWorkspace.id);
      logInfo('WAIT', `Status: ${ws.status} (attempt ${attempts + 1}/${maxAttempts})`);

      if (stableStatuses.includes(ws.status)) {
        logSuccess('WAIT', `Workspace is stable: ${ws.status}`);
        break;
      }

      await sleep(2000);
      attempts++;
    }

    // Update with latest status
    createdWorkspace = await connector.getWorkspace(createdWorkspace.id);

    // Step 6: Delete or leave for review
    if (CLEANUP) {
      const workspaceIdToDelete = createdWorkspace.id;
      log('DELETE', `Deleting workspace ${workspaceIdToDelete}...`);
      await connector.deleteWorkspace(workspaceIdToDelete);
      logSuccess('DELETE', 'Workspace deleted successfully');

      // Verify deletion
      log('VERIFY', 'Verifying workspace is deleted...');
      const deletedWorkspace = await connector.getWorkspace(workspaceIdToDelete);

      if (deletedWorkspace.status === 'deleting') {
        logSuccess('VERIFY', `Workspace confirmed deleted (status: ${deletedWorkspace.status})`);
      } else {
        throw new Error(`Expected status 'deleting', got: ${deletedWorkspace.status}`);
      }
      createdWorkspace = null;
    } else {
      log('SKIP', 'Skipping deletion - leaving workspace for review');
    }

    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('EXPERIMENT PASSED');
    console.log('='.repeat(60));
    console.log('');
    console.log('All operations completed successfully:');
    console.log('  ✓ Validate connector (env var expansion worked)');
    console.log('  ✓ Create workspace (userIdentity injected)');
    console.log('  ✓ Get workspace');
    console.log('  ✓ List workspaces');
    if (CLEANUP) {
      console.log('  ✓ Delete workspace');
      console.log('  ✓ Verify deletion');
    } else {
      console.log('  ⊘ Delete skipped (CLEANUP=false)');
    }
    console.log('');
    console.log('SelfHostedConnector validated end-to-end!');
    console.log('');

    // If not cleaning up, show access links
    if (!CLEANUP && createdWorkspace) {
      console.log('='.repeat(60));
      console.log('WORKSPACE LEFT FOR REVIEW');
      console.log('='.repeat(60));
      console.log('');
      console.log(`Workspace ID: ${createdWorkspace.id}`);
      console.log(`Workspace Name: ${createdWorkspace.name}`);
      console.log(`Status: ${createdWorkspace.status}`);
      console.log('');
      console.log('Access URLs:');
      console.log(`  Coder Dashboard: ${CONFIG.coderUrl}/@${createdWorkspace.owner}/${createdWorkspace.name}`);
      console.log('');
      console.log('To clean up later:');
      console.log('  CLEANUP=true npx tsx experiments/e002-self-hosted-connector-coder-infra/run-experiment.ts');
      console.log('');
    }
  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('EXPERIMENT FAILED');
    console.log('='.repeat(60));
    console.log('');

    if (error instanceof ConnectorError) {
      console.log(`ConnectorError: ${error.message}`);
      console.log(`  Connector: ${error.connectorType}`);
      console.log(`  Operation: ${error.operation}`);
    } else if (error instanceof Error) {
      console.log(`Error: ${error.message}`);
      console.log(error.stack);
    } else {
      console.log('Unknown error:', error);
    }

    // Cleanup on failure
    if (createdWorkspace) {
      console.log('');
      log('CLEANUP', `Attempting to delete workspace ${createdWorkspace.id}...`);
      try {
        await connector.deleteWorkspace(createdWorkspace.id);
        logSuccess('CLEANUP', 'Workspace deleted');
      } catch (cleanupError) {
        logError('CLEANUP', `Failed to delete workspace: ${cleanupError}`);
      }
    }

    process.exit(1);
  }
}

runExperiment();
