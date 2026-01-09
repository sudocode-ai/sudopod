/**
 * Validation script for Provider interface
 * This file ensures TypeScript strict mode validation passes
 */

import type {
  Provider,
  DeployOptions,
  Deployment,
  DeploymentStatus,
  DeploymentUrls,
  ListFilters,
} from './src/index.js';

// Test that Provider interface has all required methods and properties
const validateProvider = (provider: Provider): void => {
  // Validate readonly type property
  const providerType: 'codespaces' | 'coder' = provider.type;
  
  // Validate deploy method signature
  const deployTest: (options: DeployOptions) => Promise<Deployment> = provider.deploy;
  
  // Validate stop method signature
  const stopTest: (name: string) => Promise<void> = provider.stop;
  
  // Validate getStatus method signature
  const getStatusTest: (name: string) => Promise<DeploymentStatus> = provider.getStatus;
  
  // Validate list method signature
  const listTest: (filters?: ListFilters) => Promise<Deployment[]> = provider.list;
  
  // Validate getUrls method signature
  const getUrlsTest: (name: string) => Promise<DeploymentUrls> = provider.getUrls;
  
  console.log('✅ Provider interface validation passed');
  console.log(`   - Provider type: ${providerType}`);
  console.log('   - deploy() method: Present');
  console.log('   - stop() method: Present');
  console.log('   - getStatus() method: Present');
  console.log('   - list() method: Present');
  console.log('   - getUrls() method: Present');
};

console.log('TypeScript validation successful - all types compile correctly');
