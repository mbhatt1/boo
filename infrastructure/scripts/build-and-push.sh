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

# Determine image tag with proper git validation
if ! command -v git >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: git not found, using 'latest' tag${NC}"
    echo "Install git for proper version tracking"
    IMAGE_TAG="latest"
elif ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: not in a git repository, using 'latest' tag${NC}"
    echo "Initialize git repo for version tracking: git init"
    IMAGE_TAG="latest"
else
    IMAGE_TAG="$(git rev-parse --short HEAD)"
    if [ -z "$IMAGE_TAG" ]; then
        echo -e "${YELLOW}Warning: could not determine git commit, using 'latest' tag${NC}"
        IMAGE_TAG="latest"
    else
        echo "Using git commit tag: $IMAGE_TAG"
        
        # Check for uncommitted changes
        if ! git diff-index --quiet HEAD -- 2>/dev/null; then
            echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
            IMAGE_TAG="${IMAGE_TAG}-dirty"
            echo "Modified image tag: $IMAGE_TAG"
        fi
    fi
fi

echo -e "${GREEN}Building and pushing Docker image...${NC}"
echo -e "Repository: ${YELLOW}$ECR_REPO${NC}"
echo -e "Tag: ${YELLOW}$IMAGE_TAG${NC}"

# Login to ECR
echo -e "\n${GREEN}[1/4] Logging in to ECR...${NC}"

# Store password in temporary file with restricted permissions
PASS_FILE=$(mktemp)
chmod 600 "$PASS_FILE"
trap "rm -f $PASS_FILE" EXIT

if ! aws ecr get-login-password --region "$AWS_REGION" > "$PASS_FILE"; then
    echo -e "${RED}Error: Failed to retrieve ECR password${NC}"
    rm -f "$PASS_FILE"
    exit 1
fi

if ! docker login --username AWS --password-stdin "$AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com" < "$PASS_FILE"; then
    echo -e "${RED}Error: Docker login failed${NC}"
    rm -f "$PASS_FILE"
    exit 1
fi

rm -f "$PASS_FILE"

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