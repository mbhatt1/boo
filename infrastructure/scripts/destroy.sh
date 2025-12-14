#!/bin/bash
# Destroy CDK infrastructure

set -e
ENVIRONMENT="${1:-dev}"

echo "WARNING: This will destroy all infrastructure for $ENVIRONMENT environment!"
read -p "Type 'yes' to confirm: " confirm

if [ "$confirm" = "yes" ]; then
    cd "$(dirname "$0")/.."
    npx cdk destroy --all --context environment="$ENVIRONMENT" --force
    echo "Infrastructure destroyed."
else
    echo "Cancelled."
fi