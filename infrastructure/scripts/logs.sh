#!/bin/bash
# View ECS service logs

set -e
ENVIRONMENT="${1:-dev}"
aws logs tail "/ecs/${ENVIRONMENT}-boo-collaboration" --follow --region "${AWS_REGION:-us-east-1}"