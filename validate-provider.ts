/**
 * Validation script for Connector interface
 * This file ensures TypeScript strict mode validation passes
 */

import type {
  Connector,
  DeployOptions,
  Deployment,
  DeploymentStatus,
  DeploymentUrls,
  ListFilters,
} from './src/index.js';

// Test that Connector interface has all required methods and properties
const validateConnector = (connector: Connector): void => {
  // Validate readonly type property
  const connectorType: 'codespaces' | 'coder' = connector.type;
  
  // Validate deploy method signature
  const deployTest: (options: DeployOptions) => Promise<Deployment> = connector.deploy;
  
  // Validate stop method signature
  const stopTest: (name: string) => Promise<void> = connector.stop;
  
  // Validate getStatus method signature
  const getStatusTest: (name: string) => Promise<DeploymentStatus> = connector.getStatus;
  
  // Validate list method signature
  const listTest: (filters?: ListFilters) => Promise<Deployment[]> = connector.list;
  
  // Validate getUrls method signature
  const getUrlsTest: (name: string) => Promise<DeploymentUrls> = connector.getUrls;
  
  console.log('✅ Connector interface validation passed');
  console.log(`   - Connector type: ${connectorType}`);
  console.log('   - deploy() method: Present');
  console.log('   - stop() method: Present');
  console.log('   - getStatus() method: Present');
  console.log('   - list() method: Present');
  console.log('   - getUrls() method: Present');
};

console.log('TypeScript validation successful - all types compile correctly');
