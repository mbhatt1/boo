# Quick Start Guide

Get started with Boo in 5 minutes.

## Prerequisites

- **Python 3.10+**
- **Node.js 16+** (for React terminal interface)
- **uv** (recommended) or pip

Install uv:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Installation

### 1. Clone and Setup

```bash
git clone https://github.com/your-repo/boo.git
cd boo
```

### 2. Install Dependencies

```bash
# Using uv (recommended)
uv venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -r uv.lock

# Or using pip
pip install -e .
```

### 3. Configure

```bash
# Copy example configuration
cp .env.example .env

# Edit .env with your settings
# For local development, the defaults work fine
```

### 4. Run

#### Option A: React Terminal (Recommended)

```bash
cd src/modules/interfaces/react
npm install
npm run build
npm start
```

The React terminal will guide you through setup and automatically start the Python agent.

#### Option B: Direct Python

```bash
python src/boo.py --help

# Example: Run an assessment
python src/boo.py \
  --target "http://testphp.vulnweb.com" \
  --objective "Identify SQL injection vulnerabilities" \
  --module security
```

## Next Steps

- **Read the** [User Guide](user-instructions.md)
- **Explore** [Examples](../examples/)
- **Learn about** [Architecture](architecture.md)
- **Configure** [Model Providers](model-providers.md)

## Common Issues

### "No module named 'modules'"

Make sure you're in the `boo` directory and have installed the package:
```bash
pip install -e .
```

### Service Connection Errors

Ensure services are running:
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Check Langfuse (optional)
curl http://localhost:3000
```

### Need Docker Instead?

See [Docker Deployment Guide](deployment.md#docker-deployment)