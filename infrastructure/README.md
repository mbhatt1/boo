# Boo Collaboration System - AWS Infrastructure

Production-ready AWS CDK infrastructure for the Boo real-time collaboration system. Deploys a secure, scalable architecture using **ECS Fargate** (NO Lambda) with PostgreSQL RDS, Redis ElastiCache, and comprehensive monitoring.

## 🏗️ Architecture Overview

### Infrastructure Components

- **VPC**: Multi-AZ VPC with public, private, and isolated subnets
- **ECS Fargate**: Container orchestration for collaboration server (NO Lambda)
- **Application Load Balancer**: HTTPS/WebSocket support with WAF protection
- **RDS PostgreSQL**: Multi-AZ database with automated backups and RDS Proxy
- **ElastiCache Redis**: Cluster mode with automatic failover
- **Security**: KMS encryption, Secrets Manager, WAF, IAM roles
- **Monitoring**: CloudWatch dashboards, alarms, and logs
- **Backup**: AWS Backup with cross-region replication

### Security Features

✅ **NO Lambda** - Using ECS Fargate exclusively  
✅ Encryption at rest (KMS)  
✅ Encryption in transit (TLS)  
✅ Network isolation (private subnets)  
✅ WAF protection  
✅ DDoS protection (AWS Shield)  
✅ Security groups (defense in depth)  
✅ Secrets rotation  
✅ Audit logging (CloudTrail)  
✅ VPC flow logs  
✅ No public RDS/Redis access  

## 📋 Prerequisites

- **Node.js**: 20.x or later
- **AWS CLI**: Configured with appropriate credentials
- **AWS CDK**: 2.x (installed via npm)
- **Docker**: For building container images
- **Git**: For version control
- **AWS Account**: With appropriate permissions

### Required AWS Permissions

- CloudFormation
- EC2, VPC, Security Groups
- ECS, ECR
- RDS, ElastiCache
- IAM, KMS, Secrets Manager
- CloudWatch, SNS
- Route 53, ACM (for custom domains)
- AWS Backup

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd boo/infrastructure
npm install
```

### 2. Configure Environment

Set your AWS credentials:

```bash
export AWS_PROFILE=your-profile  # or
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
export AWS_DEFAULT_REGION=us-east-1
```

### 3. Bootstrap CDK (First Time Only)

```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 4. Deploy

```bash
# Development environment
./scripts/deploy.sh -e dev -a ACCOUNT-ID

# Staging environment
./scripts/deploy.sh -e staging -a ACCOUNT-ID

# Production environment
./scripts/deploy.sh -e prod -a ACCOUNT-ID
```

## 📦 Project Structure

```
infrastructure/
├── bin/
│   └── app.ts                 # CDK app entry point
├── lib/
│   ├── config.ts             # Environment configuration
│   ├── network-stack.ts      # VPC, subnets, security groups
│   ├── security-stack.ts     # KMS, Secrets Manager, WAF, IAM
│   ├── database-stack.ts     # RDS PostgreSQL
│   ├── cache-stack.ts        # ElastiCache Redis
│   ├── load-balancer-stack.ts # ALB with WebSocket support
│   ├── compute-stack.ts      # ECS Fargate (NO Lambda)
│   ├── monitoring-stack.ts   # CloudWatch dashboards & alarms
│   ├── dns-stack.ts          # Route 53, ACM certificates
│   └── backup-stack.ts       # AWS Backup plans
├── scripts/
│   ├── deploy.sh            # Main deployment script
│   ├── build-and-push.sh    # Build & push Docker image
│   ├── destroy.sh           # Destroy infrastructure
│   └── logs.sh              # View container logs
├── cdk.json                 # CDK configuration
├── package.json             # Node dependencies
└── tsconfig.json            # TypeScript configuration
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required
export CDK_DEFAULT_ACCOUNT="123456789012"
export CDK_DEFAULT_REGION="us-east-1"

# Optional
export ALARM_EMAIL="alerts@example.com"
export PROD_DOMAIN_NAME="collab.example.com"
export PROD_CERTIFICATE_ARN="arn:aws:acm:..."
```

### Environment-Specific Settings

Configurations are defined in `lib/config.ts`:

- **dev**: Minimal resources, single-AZ, smaller instances
- **staging**: Production-like, Multi-AZ, automated backups
- **prod**: Full production, Multi-AZ, enhanced monitoring

## 🔧 Management Scripts

### Deployment

```bash
# Deploy all stacks
./scripts/deploy.sh -e dev -a ACCOUNT-ID

# Skip Docker image build
./scripts/deploy.sh -e dev -a ACCOUNT-ID --skip-image
```

### Build & Push Docker Image

```bash
./scripts/build-and-push.sh -e dev -a ACCOUNT-ID
```

### View Logs

```bash
./scripts/logs.sh dev  # Tail logs in real-time
```

### Destroy Infrastructure

```bash
./scripts/destroy.sh dev  # With confirmation prompt
```

## 📊 Monitoring

### CloudWatch Dashboard

Access via AWS Console:
```
CloudWatch → Dashboards → {env}-BooCollaboration
```

Monitors:
- ALB metrics (requests, latency, errors)
- ECS metrics (CPU, memory, task count)
- RDS metrics (connections, CPU, storage)
- Redis metrics (connections, memory, evictions)

### Alarms

Critical alarms send notifications to SNS topic:
- High CPU/Memory utilization
- High error rates
- Unhealthy targets
- Low storage space
- High connection counts

## 🔒 Security

### Encryption

- **At Rest**: KMS encryption for RDS, ElastiCache, S3, Secrets Manager
- **In Transit**: TLS for all communications

### Network Security

- Private subnets for ECS tasks
- Isolated subnets for databases (no internet)
- Security groups with least privilege
- Network ACLs for additional protection
- VPC Flow Logs enabled

### Access Control

- IAM roles with least privilege
- Secrets Manager for credentials
- No hardcoded secrets
- Bastion host for emergency database access
- ECS Exec for container debugging (dev/staging only)

## 💰 Cost Optimization

### Recommendations

- Use Reserved Instances for RDS in production
- Consider Fargate Spot for non-critical workloads
- Enable S3 lifecycle policies
- Configure CloudWatch log retention
- Set up auto-scaling thresholds
- Use cost allocation tags
- Set up AWS Budgets alerts

### Estimated Monthly Costs (us-east-1)

**Development (~$200-300/month)**
- ECS Fargate: ~$30
- RDS t3.medium: ~$60
- ElastiCache t3.medium: ~$40
- ALB: ~$20
- Data transfer: ~$20
- Other services: ~$30-80

**Production (~$800-1500/month)**
- ECS Fargate (2-10 tasks): ~$150-750
- RDS r5.xlarge Multi-AZ: ~$400
- ElastiCache r5.large Cluster: ~$200
- ALB: ~$30
- Data transfer: ~$50-100
- Backups, logs, monitoring: ~$50

## 🔄 CI/CD Integration

GitHub Actions workflow provided in `.github/workflows/deploy-collaboration.yml`.

Triggers:
- Push to `main` branch
- Manual workflow dispatch

Steps:
1. Build Docker image
2. Security scan
3. Push to ECR
4. Deploy CDK stacks
5. Run smoke tests
6. Notify team

## 📚 Additional Documentation

- **ARCHITECTURE.md**: Detailed architecture diagrams and design decisions
- **SECURITY.md**: Security measures and compliance information
- **RUNBOOK.md**: Operational procedures and troubleshooting
- **COST.md**: Cost breakdown and optimization strategies
- **DISASTER_RECOVERY.md**: DR procedures and RTO/RPO targets

## 🐛 Troubleshooting

### Common Issues

**CDK Bootstrap Error**
```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

**Docker Build Fails**
- Ensure Docker daemon is running
- Check Dockerfile syntax
- Verify dependencies in package.json

**Deployment Fails**
- Check AWS credentials and permissions
- Verify account limits (VPC, EIPs, etc.)
- Review CloudFormation events

**ECS Tasks Not Starting**
- Check CloudWatch logs
- Verify security group rules
- Confirm secrets are accessible
- Check resource limits (CPU, memory)

## 📞 Support

For issues or questions:
1. Check troubleshooting section
2. Review CloudWatch logs
3. Check AWS service health dashboard
4. Contact DevOps team

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Built with AWS CDK 2.x | TypeScript | Node.js 20**