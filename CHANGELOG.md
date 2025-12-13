# Changelog

All notable changes to Boo will be documented in this file.

## [0.2.0] - 2025-01-XX

### 🎉 Major Changes

**Local-First Architecture** - Boo now runs natively without Docker by default!

### Added

- **Centralized Configuration System** ([#PR]())
  - New `RuntimeConfig` class for deployment-mode-aware configuration
  - Environment-based service URL resolution
  - Support for `local`, `docker`, and `production` modes

- **Unified Execution Services** ([#PR]())
  - Abstract `ExecutionService` interface
  - `LocalExecutionService` for native subprocess execution
  - Simplified service layer architecture

- **Comprehensive Test Suite** ([#PR]())
  - Unit tests for configuration system
  - Integration tests for local execution
  - Test fixtures for different deployment modes

- **Migration Documentation** ([#PR]())
  - Complete migration guide (docs/MIGRATION.md)
  - Example configurations for all deployment modes
  - Quick start guide (docs/QUICKSTART.md)

### Changed

- **Default Execution Mode**: Local (was Docker)
- **Service URL Resolution**: Configuration-based (was runtime detection)
- **React Initialization**: Mode-aware checks (was always checking Docker)
- **Health Monitoring**: Optional Docker checks (was required)

### Removed

- **Scattered `is_docker()` Functions**: Replaced with centralized configuration
- **Runtime Docker Detection**: Replaced with explicit `BOO_DEPLOYMENT_MODE`
- **Hardcoded Service URLs**: Replaced with environment variables

### Breaking Changes

1. **Environment Variables**:
   - New required: `BOO_DEPLOYMENT_MODE`
   - Renamed: `LANGFUSE_HOST` → `LANGFUSE_URL`
   - New optional: `OLLAMA_URL`, `BOO_OUTPUT_PATH`

2. **Configuration Loading**:
   - Must use `get_config()` instead of runtime detection
   - Service URLs now from configuration, not detection

### Migration

See [Migration Guide](docs/MIGRATION.md) for detailed upgrade instructions.

**Docker users**: Add `BOO_DEPLOYMENT_MODE=docker` to `.env` - everything else works as before!

### Upgrade Notes

```bash
# For existing Docker deployments
echo "BOO_DEPLOYMENT_MODE=docker" >> .env

# For new local development
cp .env.example .env
uv pip install -r uv.lock
python src/boo.py --help
```

## [0.1.3] - 2024-XX-XX

### Added
- Initial release with Docker-first architecture
- React terminal interface
- Multi-provider LLM support

[0.2.0]: https://github.com/your-repo/boo/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/your-repo/boo/releases/tag/v0.1.3