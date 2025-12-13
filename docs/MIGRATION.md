# Migration Guide: Docker-First → Local-First Architecture

## Overview

Version 0.2.0 introduces a **local-first architecture** for Boo. This is a significant architectural improvement that makes local development the default while maintaining full Docker support for deployment scenarios.

## What Changed?

### Before (v0.1.x): Docker-First
- Required Docker for all operations
- Runtime detection of Docker environment
- Complex dual-mode service architecture
- Docker checks during initialization even for local use

### After (v0.2.0): Local-First
- Local execution is the default
- Docker is optional for deployment
- Configuration-based deployment modes
- Simplified service layer

## Breaking Changes

### 1. Environment Variables

**New Required Variables:**
```bash
# Deployment mode (local is default)
BOO_DEPLOYMENT_MODE=local  # or 'docker' or 'production'
```

**Renamed Variables:**
```bash
# Before
LANGFUSE_HOST=http://localhost:3000

# After
LANGFUSE_URL=http://localhost:3000
```

**New Optional Variables:**
```bash
OLLAMA_URL=http://localhost:11434
BOO_OUTPUT_PATH=./outputs
```

### 2. Configuration System

The new centralized configuration system replaces scattered `is_docker()` checks:

```python
# Before
if is_docker():
    url = "http://langfuse-web:3000"
else:
    url = "http://localhost:3000"

# After
from modules.config.runtime import get_config

config = get_config()
url = config.services.langfuse_url
```

## Migration Steps

### For Docker Users (No Changes Required)

If you're currently using Docker and want to continue:

1. **Update `.env` file:**
   ```bash
   # Add this line to your existing .env
   BOO_DEPLOYMENT_MODE=docker
   
   # Optional: rename LANGFUSE_HOST to LANGFUSE_URL
   LANGFUSE_URL=http://langfuse-web:3000
   ```

2. **Continue using Docker Compose:**
   ```bash
   docker-compose up -d
   ```

Everything else works exactly as before!

### For New Local Users

To run Boo locally without Docker:

1. **Install dependencies:**
   ```bash
   cd boo
   uv venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   uv pip install -r uv.lock
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   # Edit .env - defaults work for local development
   ```

3. **Run the agent:**
   ```bash
   # Via React terminal (recommended)
   cd src/modules/interfaces/react
   npm install
   npm run build
   npm start
   
   # Or directly via Python
   python src/boo.py --help
   ```

### Migrating from Docker to Local

To switch from Docker to local execution:

1. **Stop Docker containers:**
   ```bash
   docker-compose down
   ```

2. **Update `.env`:**
   ```bash
   # Change deployment mode
   BOO_DEPLOYMENT_MODE=local
   
   # Update service URLs to localhost
   LANGFUSE_URL=http://localhost:3000
   OLLAMA_URL=http://localhost:11434
   BOO_OUTPUT_PATH=./outputs
   ```

3. **Install dependencies locally:**
   ```bash
   uv venv .venv
   source .venv/bin/activate
   uv pip install -r uv.lock
   ```

4. **Start services manually (if needed):**
   ```bash
   # Start Langfuse (optional, for observability)
   # Follow Langfuse installation docs
   
   # Start Ollama (if using local LLM)
   ollama serve
   ```

5. **Run Boo:**
   ```bash
   python src/boo.py --target "http://example.com" --objective "Security assessment"
   ```

## Configuration Reference

### Deployment Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `local` | Run directly on machine (default) | Development, debugging |
| `docker` | Run in Docker container | Deployment, reproducibility |
| `production` | Production deployment | Production environments |

### Service URLs

| Service | Local Default | Docker Default |
|---------|---------------|----------------|
| Langfuse | `http://localhost:3000` | `http://langfuse-web:3000` |
| Ollama | `http://localhost:11434` | `http://host.docker.internal:11434` |

## Troubleshooting

### "ModuleNotFoundError: No module named 'modules.config.runtime'"

**Solution:** Ensure you've installed the package:
```bash
pip install -e .
# or
uv pip install -e .
```

### "Configuration not found" errors

**Solution:** Make sure `.env` file exists and contains `BOO_DEPLOYMENT_MODE`:
```bash
cp .env.example .env
```

### Docker containers won't start in local mode

**Expected behavior:** In local mode (`BOO_DEPLOYMENT_MODE=local`), Docker is not used. This is intentional!

To use Docker:
```bash
# In .env
BOO_DEPLOYMENT_MODE=docker
```

### Service connection errors in local mode

**Solution:** Ensure services are running locally:
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Check Langfuse (if using)
curl http://localhost:3000
```

## Rollback

To rollback to v0.1.x behavior:

1. **Checkout previous version:**
   ```bash
   git checkout v0.1.x
   ```

2. **Or, use Docker mode in v0.2.0:**
   ```bash
   # In .env
   BOO_DEPLOYMENT_MODE=docker
   ```

## Benefits of Local-First

✅ **Faster Development** - No Docker overhead  
✅ **Easier Debugging** - Direct access to Python debugger  
✅ **Lower Resource Usage** - No container overhead  
✅ **Simpler Setup** - Fewer dependencies  
✅ **Better IDE Integration** - Native code completion  

Docker remains fully supported for deployment scenarios!

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/your-repo/boo/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-repo/boo/discussions)
- **Documentation:** [Full Documentation](docs/README.md)