#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { SecurityStack } from '../lib/security-stack';
import { DatabaseStack } from '../lib/database-stack';
import { CacheStack } from '../lib/cache-stack';
import { LoadBalancerStack } from '../lib/load-balancer-stack';
import { ComputeStack } from '../lib/compute-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { DnsStack } from '../lib/dns-stack';
import { BackupStack } from '../lib/backup-stack';
import { getConfig, validateConfig } from '../lib/config';

/**
 * Main CDK application for Boo Collaboration System
 * Deploys a production-ready, secure AWS infrastructure using ECS Fargate (NO Lambda)
 */

const app = new cdk.App();

// Get environment from context or default to 'dev'
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getConfig(environment);

// Validate configuration
validateConfig(config);

console.log(`🚀 Deploying Boo Collaboration System - Environment: ${config.environment}`);
console.log(`📍 Region: ${config.region}`);
console.log(`🏢 Account: ${config.account}`);

// Stack naming convention
const stackPrefix = `BooCollaboration-${config.environment}`;

// Environment for all stacks
const env = {
  account: config.account,
  region: config.region,
};

// Apply common tags to all resources
const tags = config.tags;

/**
 * Network Stack - VPC, Subnets, Security Groups, NAT Gateways
 * Foundation for all other stacks
 */
const networkStack = new NetworkStack(app, `${stackPrefix}-Network`, {
  env,
  config,
  description: `Network infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * Security Stack - KMS, Secrets Manager, WAF, IAM Roles
 * Security foundation before creating resources
 */
const securityStack = new SecurityStack(app, `${stackPrefix}-Security`, {
  env,
  config,
  vpc: networkStack.vpc,
  description: `Security infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * Database Stack - RDS PostgreSQL with Multi-AZ
 * Requires network and security stacks
 */
const databaseStack = new DatabaseStack(app, `${stackPrefix}-Database`, {
  env,
  config,
  vpc: networkStack.vpc,
  databaseSecurityGroup: networkStack.databaseSecurityGroup,
  databaseSecret: securityStack.databaseSecret,
  kmsKey: securityStack.kmsKey,
  description: `Database infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * Cache Stack - ElastiCache Redis with Multi-AZ
 * Requires network and security stacks
 */
const cacheStack = new CacheStack(app, `${stackPrefix}-Cache`, {
  env,
  config,
  vpc: networkStack.vpc,
  cacheSecurityGroup: networkStack.cacheSecurityGroup,
  cacheAuthToken: securityStack.cacheAuthToken,
  kmsKey: securityStack.kmsKey,
  description: `Cache infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * Load Balancer Stack - Application Load Balancer with WebSocket support
 * Requires network stack
 */
const loadBalancerStack = new LoadBalancerStack(app, `${stackPrefix}-LoadBalancer`, {
  env,
  config,
  vpc: networkStack.vpc,
  albSecurityGroup: networkStack.albSecurityGroup,
  certificateArn: config.certificateArn,
  wafWebAcl: securityStack.wafWebAcl,
  description: `Load balancer infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * Compute Stack - ECS Fargate service (NO Lambda)
 * Requires network, security, database, cache, and load balancer stacks
 */
const computeStack = new ComputeStack(app, `${stackPrefix}-Compute`, {
  env,
  config,
  vpc: networkStack.vpc,
  ecsSecurityGroup: networkStack.ecsSecurityGroup,
  taskExecutionRole: securityStack.ecsTaskExecutionRole,
  taskRole: securityStack.ecsTaskRole,
  databaseSecret: securityStack.databaseSecret,
  cacheAuthToken: securityStack.cacheAuthToken,
  jwtSecret: securityStack.jwtSecret,
  databaseProxy: databaseStack.databaseProxy,
  cacheCluster: cacheStack.cacheCluster,
  targetGroup: loadBalancerStack.targetGroup,
  description: `Compute infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * Monitoring Stack - CloudWatch dashboards, alarms, and logs
 * Monitors all infrastructure components
 */
const monitoringStack = new MonitoringStack(app, `${stackPrefix}-Monitoring`, {
  env,
  config,
  loadBalancer: loadBalancerStack.loadBalancer,
  ecsService: computeStack.ecsService,
  ecsCluster: computeStack.ecsCluster,
  database: databaseStack.database,
  _cacheCluster: cacheStack.cacheCluster,
  snsTopicArn: config.monitoring.alarmSnsTopicArn,
  alarmEmail: config.monitoring.alarmEmail,
  description: `Monitoring infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

/**
 * DNS Stack - Route 53 and ACM certificates (optional)
 * Only deployed if domain name is provided
 */
if (config.domainName) {
  const _dnsStack = new DnsStack(app, `${stackPrefix}-DNS`, {
    env,
    config,
    loadBalancer: loadBalancerStack.loadBalancer,
    domainName: config.domainName,
    certificateArn: config.certificateArn,
    description: `DNS infrastructure for Boo Collaboration System (${config.environment})`,
    tags,
  });
}

/**
 * Backup Stack - AWS Backup plans and disaster recovery
 * Backs up RDS and ElastiCache
 */
const backupStack = new BackupStack(app, `${stackPrefix}-Backup`, {
  env,
  config,
  database: databaseStack.database,
  cacheCluster: cacheStack.cacheCluster,
  kmsKey: securityStack.kmsKey,
  description: `Backup infrastructure for Boo Collaboration System (${config.environment})`,
  tags,
});

// Add stack dependencies
securityStack.addDependency(networkStack);
databaseStack.addDependency(securityStack);
cacheStack.addDependency(securityStack);
loadBalancerStack.addDependency(networkStack);
computeStack.addDependency(databaseStack);
computeStack.addDependency(cacheStack);
computeStack.addDependency(loadBalancerStack);
monitoringStack.addDependency(computeStack);
backupStack.addDependency(databaseStack);
backupStack.addDependency(cacheStack);

console.log('✅ CDK app configured successfully');
console.log(`📦 Total stacks: ${app.node.children.length}`);

app.synth();