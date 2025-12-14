#!/bin/bash

# Build Docker image and push to ECR

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default values
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT="${AWS_ACCOUNT:-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
        -r|--region) AWS_REGION="$2"; shift 2 ;;
        -a|--account) AWS_ACCOUNT="$2"; shift 2 ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

# Get AWS account if not provided
if [ -z "$AWS_ACCOUNT" ]; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
fi

ECR_REPO="$AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/${ENVIRONMENT}-boo-collaboration"
IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"

echo -e "${GREEN}Building and pushing Docker image...${NC}"
echo -e "Repository: ${YELLOW}$ECR_REPO${NC}"
echo -e "Tag: ${YELLOW}$IMAGE_TAG${NC}"

# Login to ECR
echo -e "\n${GREEN}[1/4] Logging in to ECR...${NC}"
aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "$AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"

# Build image
echo -e "\n${GREEN}[2/4] Building Docker image...${NC}"
cd "$(dirname "$0")/../../src/modules/collaboration"
docker build -t "$ECR_REPO:$IMAGE_TAG" -t "$ECR_REPO:latest" .

# Push image
echo -e "\n${GREEN}[3/4] Pushing to ECR...${NC}"
docker push "$ECR_REPO:$IMAGE_TAG"
docker push "$ECR_REPO:latest"

# Security scan
echo -e "\n${GREEN}[4/4] Image pushed successfully!${NC}"
echo -e "Image URI: ${YELLOW}$ECR_REPO:$IMAGE_TAG${NC}"