/**
 * Integration test helpers for codespace primitives
 * 
 * These utilities help manage the lifecycle of real GitHub Codespaces
 * during integration tests, including cleanup on failure.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

const execPromise = promisify(exec);

/**
 * Check if GitHub CLI is installed
 * @throws Error if gh CLI is not installed
 */
export async function checkGhCliInstalled(): Promise<void> {
  try {
    await execPromise('gh --version');
  } catch (error) {
    throw new Error(
      'GitHub CLI (gh) is not installed. ' +
      'Install it from https://cli.github.com/ and run "gh auth login"'
    );
  }
}

/**
 * Check if authenticated with GitHub CLI
 * @throws Error if not authenticated
 */
export async function checkGhAuthenticated(): Promise<void> {
  try {
    await execPromise('gh auth status');
  } catch (error) {
    throw new Error(
      'Not authenticated with GitHub. Run "gh auth login" to authenticate.'
    );
  }
}

/**
 * Verify all prerequisites for integration tests
 * Call this in beforeAll() or test setup
 */
export async function verifyTestPrerequisites(): Promise<void> {
  await checkGhCliInstalled();
  await checkGhAuthenticated();
}

/**
 * Tracked codespace names for cleanup
 */
const trackedCodespaces = new Set<string>();

/**
 * Track whether tests have failed (to preserve codespaces for debugging)
 */
let testsFailed = false;

/**
 * Mark that a test has failed (prevents automatic cleanup)
 */
export function markTestFailed(): void {
  testsFailed = true;
}

/**
 * Check if any tests have failed
 */
export function hasTestsFailed(): boolean {
  return testsFailed;
}

/**
 * Reset the test failure flag (useful between test suites)
 */
export function resetTestFailureFlag(): void {
  testsFailed = false;
}

/**
 * Register a codespace for automatic cleanup
 * @param name Codespace name to track
 */
export function trackCodespace(name: string): void {
  trackedCodespaces.add(name);
}

/**
 * Unregister a codespace (after successful manual cleanup)
 * @param name Codespace name to stop tracking
 */
export function untrackCodespace(name: string): void {
  trackedCodespaces.delete(name);
}

/**
 * Delete a codespace (safe version that handles errors)
 * @param name Codespace name to delete
 * @returns true if deleted, false if error
 */
export async function safeDeleteCodespace(name: string): Promise<boolean> {
  try {
    console.log(`Deleting codespace: ${name}`);
    await execPromise(`gh codespace delete --codespace ${name} --force`);
    return true;
  } catch (error) {
    console.error(`Failed to delete codespace ${name}:`, error);
    return false;
  }
}

/**
 * Clean up all tracked codespaces
 * Call this in afterAll() or test teardown
 * 
 * NOTE: If tests have failed, codespaces are preserved for debugging.
 * Set preserveOnFailure=false to force cleanup even on failure.
 * 
 * @param preserveOnFailure If true, skip cleanup when tests fail (default: true)
 */
export async function cleanupTrackedCodespaces(preserveOnFailure: boolean = true): Promise<void> {
  if (trackedCodespaces.size === 0) {
    return;
  }

  // Preserve codespaces for debugging if tests failed
  if (preserveOnFailure && testsFailed) {
    console.log('');
    console.log('⚠️  Tests failed - preserving codespaces for debugging:');
    Array.from(trackedCodespaces).forEach(name => {
      console.log(`   - ${name}`);
    });
    console.log('');
    console.log('To delete these codespaces manually, run:');
    Array.from(trackedCodespaces).forEach(name => {
      console.log(`   gh codespace delete --codespace ${name} --force`);
    });
    console.log('');
    return;
  }

  console.log(`Cleaning up ${trackedCodespaces.size} tracked codespace(s)...`);
  
  const deletePromises = Array.from(trackedCodespaces).map(async (name) => {
    const success = await safeDeleteCodespace(name);
    if (success) {
      trackedCodespaces.delete(name);
    }
    return success;
  });

  await Promise.all(deletePromises);

  if (trackedCodespaces.size > 0) {
    console.warn(
      `Warning: ${trackedCodespaces.size} codespace(s) could not be deleted:`,
      Array.from(trackedCodespaces)
    );
  }
}

/**
 * Create a descriptive codespace name for testing
 * @param testName Optional test name to include
 * @returns Codespace name like "sudopod-test-1234567890"
 */
export function generateTestCodespaceName(testName?: string): string {
  const timestamp = Date.now();
  const sanitizedName = testName
    ? testName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 20)
    : 'test';
  return `sudopod-${sanitizedName}-${timestamp}`;
}

/**
 * Wait for a condition with timeout
 * @param condition Function that returns true when condition is met
 * @param timeoutMs Total timeout in milliseconds
 * @param intervalMs Check interval in milliseconds
 * @param errorMessage Error message if timeout
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs: number = 2000,
  errorMessage: string = 'Condition not met within timeout'
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`${errorMessage} (timeout: ${timeoutMs}ms)`);
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelayMs Initial delay in milliseconds
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * Run a test with automatic cleanup on failure
 * @param testFn Test function that may create resources
 * @param cleanupFn Cleanup function to run on failure or success
 */
export async function withCleanup<T>(
  testFn: () => Promise<T>,
  cleanupFn: () => Promise<void>
): Promise<T> {
  try {
    const result = await testFn();
    await cleanupFn();
    return result;
  } catch (error) {
    try {
      await cleanupFn();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    throw error;
  }
}

/**
 * Load secrets from a .env.secrets file
 * 
 * The file should be in the format:
 * KEY=value
 * ANOTHER_KEY=another_value
 * 
 * @param secretsPath Optional path to secrets file (default: tests/.env.secrets)
 * @returns Object with key-value pairs from the secrets file
 */
export async function loadSecretsFile(
  secretsPath?: string
): Promise<Record<string, string>> {
  const path = secretsPath || resolve(process.cwd(), 'tests', '.env.secrets');
  
  try {
    const content = await readFile(path, 'utf-8');
    const secrets: Record<string, string> = {};
    
    // Parse the file line by line
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Parse KEY=value format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        secrets[key] = value;
      }
    }
    
    return secrets;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist - return empty object
      return {};
    }
    throw error;
  }
}

/**
 * Get a secret value from the secrets file with helpful error message
 * 
 * @param secretName Name of the secret to retrieve
 * @param secretsPath Optional path to secrets file (default: tests/.env.secrets)
 * @returns Secret value or undefined if not found
 */
export async function getSecret(
  secretName: string,
  secretsPath?: string
): Promise<string | undefined> {
  const secrets = await loadSecretsFile(secretsPath);
  return secrets[secretName];
}

/**
 * Print instructions for setting up the secrets file
 * 
 * @param secretName Name of the secret that's missing
 * @param description Description of what the secret is for
 * @param exampleValue Example value (will be shown but not actual secret)
 */
export function printSecretsInstructions(
  secretName: string,
  description: string,
  exampleValue: string
): void {
  const secretsPath = resolve(process.cwd(), 'tests', '.env.secrets');
  
  console.log('\n' + '='.repeat(80));
  console.log('⚠️  Missing Secret: ' + secretName);
  console.log('='.repeat(80));
  console.log('');
  console.log('This test requires a secret that is not currently configured.');
  console.log('');
  console.log('Secret:', secretName);
  console.log('Purpose:', description);
  console.log('');
  console.log('To set up this secret:');
  console.log('');
  console.log('1. Create a secrets file at:');
  console.log('   ' + secretsPath);
  console.log('');
  console.log('2. Add the following line to the file:');
  console.log('   ' + secretName + '=' + exampleValue);
  console.log('');
  console.log('3. Make sure to add this file to .gitignore:');
  console.log('   echo "tests/.env.secrets" >> .gitignore');
  console.log('');
  console.log('Example file content:');
  console.log('   # Integration test secrets - DO NOT COMMIT');
  console.log('   ' + secretName + '=' + exampleValue);
  console.log('');
  console.log('='.repeat(80));
  console.log('');
}
