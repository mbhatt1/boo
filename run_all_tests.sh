#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Running All Tests for Boo Project${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Navigate to project root
cd "$(dirname "$0")"

# Run Python tests
echo -e "${BLUE}[1/4] Running Python tests...${NC}"
echo ""
if python3.11 -m pytest tests/ -v; then
    echo -e "${GREEN}✓ Python tests passed${NC}"
else
    echo -e "${RED}✗ Python tests failed${NC}"
    echo -e "${RED}Exiting due to test failure${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo ""

# Lint and Run React Interface npm tests
echo -e "${BLUE}[2/4] Linting and Testing React Interface...${NC}"
echo ""
cd src/modules/interfaces/react
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing React Interface dependencies...${NC}"
    npm install
fi
echo -e "${BLUE}Running typecheck...${NC}"
if npm run typecheck; then
    echo -e "${GREEN}✓ React Interface typecheck passed${NC}"
else
    echo -e "${RED}✗ React Interface typecheck failed${NC}"
    echo -e "${RED}Exiting due to linting failure${NC}"
    exit 1
fi
echo -e "${BLUE}Running tests...${NC}"
if npm test; then
    echo -e "${GREEN}✓ React Interface tests passed${NC}"
else
    echo -e "${RED}✗ React Interface tests failed${NC}"
    echo -e "${RED}Exiting due to test failure${NC}"
    exit 1
fi

# Return to project root
cd ../../../..

echo ""
echo -e "${BLUE}========================================${NC}"
echo ""

# Run Collaboration Module npm tests
echo -e "${BLUE}[3/4] Running Collaboration Module npm tests...${NC}"
echo ""
cd src/modules/collaboration
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Collaboration dependencies...${NC}"
    npm install
fi
if npm test; then
    echo -e "${GREEN}✓ Collaboration Module tests passed${NC}"
else
    echo -e "${RED}✗ Collaboration Module tests failed${NC}"
    echo -e "${RED}Exiting due to test failure${NC}"
    exit 1
fi

# Return to project root
cd ../../..

echo ""
echo -e "${BLUE}========================================${NC}"
echo ""

# Lint and Run Infrastructure npm tests
echo -e "${BLUE}[4/4] Linting and Testing Infrastructure...${NC}"
echo ""
cd infrastructure
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Infrastructure dependencies...${NC}"
    npm install
fi
echo -e "${BLUE}Running lint...${NC}"
if npm run lint; then
    echo -e "${GREEN}✓ Infrastructure lint passed${NC}"
else
    echo -e "${RED}✗ Infrastructure lint failed${NC}"
    echo -e "${RED}Exiting due to linting failure${NC}"
    exit 1
fi
echo -e "${BLUE}Running typecheck...${NC}"
if npm run typecheck; then
    echo -e "${GREEN}✓ Infrastructure typecheck passed${NC}"
else
    echo -e "${RED}✗ Infrastructure typecheck failed${NC}"
    echo -e "${RED}Exiting due to typecheck failure${NC}"
    exit 1
fi
echo -e "${BLUE}Running tests...${NC}"
if npm test; then
    echo -e "${GREEN}✓ Infrastructure tests passed${NC}"
else
    echo -e "${RED}✗ Infrastructure tests failed${NC}"
    echo -e "${RED}Exiting due to test failure${NC}"
    exit 1
fi

# Return to project root
cd ..

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ All tests passed!${NC}"
exit 0