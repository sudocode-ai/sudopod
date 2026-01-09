/**
 * Integration test helpers for codespace primitives
 * 
 * These utilities help manage the lifecycle of real GitHub Codespaces
 * during integration tests, including cleanup on failure.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

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
