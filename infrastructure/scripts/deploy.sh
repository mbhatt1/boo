#!/bin/bash

# Boo Collaboration System - Complete Deployment Script
# Deploys AWS infrastructure using CDK and builds/pushes Docker image

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT="${AWS_ACCOUNT:-}"

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment to deploy (dev|staging|prod). Default: dev"
    echo "  -r, --region REGION      AWS region. Default: us-east-1"
    echo "  -a, --account ACCOUNT    AWS account ID (required)"
    echo "  -s, --skip-image         Skip Docker image build and push"
    echo "  -h, --help               Show this help message"
    echo ""
    exit 1
}

# Parse arguments
SKIP_IMAGE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -a|--account)
            AWS_ACCOUNT="$2"
            shift 2
            ;;
        -s|--skip-image)
            SKIP_IMAGE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'. Must be dev, staging, or prod.${NC}"
    exit 1
fi

# Validate AWS account
if [ -z "$AWS_ACCOUNT" ]; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
    if [ -z "$AWS_ACCOUNT" ]; then
        echo -e "${RED}Error: Could not determine AWS account. Please specify with -a option.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Boo Collaboration System Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Region:      ${YELLOW}$AWS_REGION${NC}"
echo -e "Account:     ${YELLOW}$AWS_ACCOUNT${NC}"
echo ""

# Confirmation for production
if [ "$ENVIRONMENT" == "prod" ]; then
    echo -e "${YELLOW}WARNING: You are about to deploy to PRODUCTION!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

# Set environment variables
export CDK_DEFAULT_ACCOUNT="$AWS_ACCOUNT"
export CDK_DEFAULT_REGION="$AWS_REGION"

# Step 1: Install CDK dependencies
echo -e "${GREEN}[1/6] Installing CDK dependencies...${NC}"
cd "$(dirname "$0")/.."
npm install

# Step 2: Bootstrap CDK (if needed)
echo -e "${GREEN}[2/6] Checking CDK bootstrap...${NC}"
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$AWS_REGION" >/dev/null 2>&1; then
    echo "Bootstrapping CDK..."
    npx cdk bootstrap aws://$AWS_ACCOUNT/$AWS_REGION
else
    echo "CDK already bootstrapped."
fi

# Step 3: Build and push Docker image
if [ "$SKIP_IMAGE" = false ]; then
    echo -e "${GREEN}[3/6] Building and pushing Docker image...${NC}"
    ./scripts/build-and-push.sh -e "$ENVIRONMENT" -r "$AWS_REGION" -a "$AWS_ACCOUNT"
else
    echo -e "${YELLOW}[3/6] Skipping Docker image build (--skip-image flag)${NC}"
fi

# Step 4: Synthesize CDK app
echo -e "${GREEN}[4/6] Synthesizing CDK app...${NC}"
npx cdk synth --context environment="$ENVIRONMENT"

# Step 5: Deploy CDK stacks
echo -e "${GREEN}[5/6] Deploying CDK stacks...${NC}"
npx cdk deploy --all \
    --context environment="$ENVIRONMENT" \
    --require-approval never

# Step 6: Get outputs
echo -e "${GREEN}[6/6] Retrieving deployment outputs...${NC}"
STACK_PREFIX="BooCollaboration-${ENVIRONMENT}"

# Get ALB URL
ALB_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_PREFIX}-LoadBalancer" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerUrl'].OutputValue" \
    --output text 2>/dev/null || echo "N/A")

# Get ECR repository
ECR_REPO=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_PREFIX}-Compute" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryUri'].OutputValue" \
    --output text 2>/dev/null || echo "N/A")

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Load Balancer URL: ${YELLOW}$ALB_URL${NC}"
echo -e "ECR Repository:    ${YELLOW}$ECR_REPO${NC}"
echo ""
echo -e "To view logs:"
echo -e "  ${YELLOW}./scripts/logs.sh -e $ENVIRONMENT${NC}"
echo ""
echo -e "To access container:"
echo -e "  ${YELLOW}./scripts/shell.sh -e $ENVIRONMENT${NC}"
echo ""
echo -e "To update service:"
echo -e "  ${YELLOW}./scripts/update-service.sh -e $ENVIRONMENT${NC}"
echo ""