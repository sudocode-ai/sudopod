/**
 * Experiment e001: Validate SudopodClient E2E against local coder-infra
 *
 * This script validates that SudopodClient correctly communicates with
 * the coder-provider server running locally via docker-compose.
 *
 * Issue: i-419i
 *
 * Usage:
 *   cd experiments/e001-sudopod-client-coder-infra
 *   npx tsx run-experiment.ts
 */

import { SudopodClient, SudopodClientError } from '../../src/client/index.js';
import type { Workspace } from '../../src/types/index.js';

// Configuration matching docker-compose.e2e.yml
const CONFIG = {
  providerUrl: 'http://localhost:8082',
  apiKey: 'e2e-test-api-key',
  coderUrl: 'http://localhost:7082',
};

// Test data - can be overridden via environment variables
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'ssh.randy@sudocode.ai';
const TEST_REPOSITORY = process.env.TEST_REPOSITORY || 'octocat/Hello-World';
const TEST_BRANCH = process.env.TEST_BRANCH || 'master';

// Whether to clean up after the experiment (default: false to leave workspace for review)
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

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main experiment
async function runExperiment(): Promise<void> {
  console.log('');
  console.log('='.repeat(60));
  console.log('Experiment e001: SudopodClient E2E Validation');
  console.log('='.repeat(60));
  console.log('');

  const client = new SudopodClient({
    providerUrl: CONFIG.providerUrl,
    apiKey: CONFIG.apiKey,
    timeout: 60000, // 60s timeout for workspace operations
  });

  let createdWorkspace: Workspace | null = null;

  try {
    // Step 1: Health Check
    log('HEALTH', 'Checking provider health...');
    const health = await client.health();
    if (health.ok) {
      logSuccess('HEALTH', `Provider is healthy (timestamp: ${health.timestamp})`);
    } else {
      throw new Error('Health check returned ok: false');
    }

    // Step 2: Create Workspace
    log('CREATE', 'Creating workspace...');
    logInfo('CREATE', `Repository: ${TEST_REPOSITORY}`);
    logInfo('CREATE', `Branch: ${TEST_BRANCH}`);
    logInfo('CREATE', `User: ${TEST_USER_EMAIL}`);

    createdWorkspace = await client.createWorkspace({
      repository: TEST_REPOSITORY,
      branch: TEST_BRANCH,
      userIdentity: {
        email: TEST_USER_EMAIL,
      },
    });

    logSuccess('CREATE', `Workspace created: ${createdWorkspace.id}`);
    logInfo('CREATE', `Name: ${createdWorkspace.name}`);
    logInfo('CREATE', `Status: ${createdWorkspace.status}`);
    logInfo('CREATE', `Owner: ${createdWorkspace.owner}`);

    // Step 3: Get Workspace
    log('GET', `Getting workspace ${createdWorkspace.id}...`);
    const fetchedWorkspace = await client.getWorkspace(createdWorkspace.id);
    logSuccess('GET', `Workspace fetched successfully`);
    logInfo('GET', `Status: ${fetchedWorkspace.status}`);
    logInfo('GET', `URLs: ${JSON.stringify(fetchedWorkspace.urls)}`);

    // Step 4: List Workspaces
    log('LIST', 'Listing all workspaces...');
    const workspaces = await client.listWorkspaces();
    logSuccess('LIST', `Found ${workspaces.length} workspace(s)`);
    for (const ws of workspaces) {
      logInfo('LIST', `  - ${ws.id}: ${ws.name} (${ws.status})`);
    }

    // Step 5: List with filter
    log('LIST', `Listing workspaces for owner: ${TEST_USER_EMAIL}...`);
    const filteredWorkspaces = await client.listWorkspaces({
      owner: TEST_USER_EMAIL,
    });
    logSuccess('LIST', `Found ${filteredWorkspaces.length} workspace(s) for owner`);

    // Step 6: Wait for workspace to be in a stable state before deleting
    log('WAIT', 'Waiting for workspace to stabilize before deletion...');
    let attempts = 0;
    const maxAttempts = 30;
    const stableStatuses = ['running', 'stopped', 'failed'];

    while (attempts < maxAttempts) {
      const ws = await client.getWorkspace(createdWorkspace.id);
      logInfo('WAIT', `Status: ${ws.status} (attempt ${attempts + 1}/${maxAttempts})`);

      if (stableStatuses.includes(ws.status)) {
        logSuccess('WAIT', `Workspace is stable: ${ws.status}`);
        break;
      }

      await sleep(2000);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      log('WAIT', 'Workspace did not stabilize within timeout');
    }

    // Update createdWorkspace with latest status
    createdWorkspace = await client.getWorkspace(createdWorkspace.id);

    // Step 7: Delete or leave for review
    if (CLEANUP) {
      const workspaceIdToDelete = createdWorkspace.id;
      log('DELETE', `Deleting workspace ${workspaceIdToDelete}...`);
      await client.deleteWorkspace(workspaceIdToDelete);
      logSuccess('DELETE', 'Workspace deleted successfully');

      // Verify deletion
      log('VERIFY', 'Verifying workspace is deleted...');
      const deletedWorkspace = await client.getWorkspace(workspaceIdToDelete);
      
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
    console.log('  ✓ Health check');
    console.log('  ✓ Create workspace');
    console.log('  ✓ Get workspace');
    console.log('  ✓ List workspaces');
    console.log('  ✓ List workspaces (filtered)');
    if (CLEANUP) {
      console.log('  ✓ Delete workspace');
      console.log('  ✓ Verify deletion');
    } else {
      console.log('  ⊘ Delete skipped (CLEANUP=false)');
    }
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
      console.log(`  IDE: ${CONFIG.coderUrl}/@${createdWorkspace.owner}/${createdWorkspace.name}/apps/code-server`);
      console.log(`  Terminal: ${CONFIG.coderUrl}/@${createdWorkspace.owner}/${createdWorkspace.name}/terminal`);
      console.log('');
      console.log('To clean up later:');
      console.log(`  CLEANUP=true npx tsx experiments/e001-sudopod-client-coder-infra/run-experiment.ts`);
      console.log('');
      console.log('Or stop the entire stack:');
      console.log('  cd refs/coder-infra && docker-compose -f docker-compose.e2e.yml down -v');
      console.log('');
    }
  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('EXPERIMENT FAILED');
    console.log('='.repeat(60));
    console.log('');

    if (error instanceof SudopodClientError) {
      console.log(`SudopodClientError: ${error.message}`);
      console.log(`  Code: ${error.code}`);
      console.log(`  Status: ${error.statusCode}`);
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
        await client.deleteWorkspace(createdWorkspace.id);
        logSuccess('CLEANUP', 'Workspace deleted');
      } catch (cleanupError) {
        logError('CLEANUP', `Failed to delete workspace: ${cleanupError}`);
      }
    }

    process.exit(1);
  }
}

// Run
runExperiment();
