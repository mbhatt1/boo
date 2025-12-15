# CI/CD Setup for Collaboration Module

## Overview

The collaboration module uses GitHub Actions for continuous integration and testing. Tests run automatically on every push and pull request.

## Test Infrastructure

### Services Required

1. **PostgreSQL 14**
   - Used for data persistence and session management
   - Default credentials: `postgres/postgres`
   - Database: `collaboration_test` (created automatically)

2. **Redis 7**
   - Used for real-time presence and caching
   - No authentication required for tests
   - Database: 1 (reserved for tests)

### Test Types

1. **Unit Tests** (`npm run test:unit`)
   - Tests individual services with mocked dependencies
   - Fast execution (< 30 seconds)
   - No external services required when using mocks

2. **Integration Tests** (`npm run test:integration`)
   - Tests service interactions with real databases
   - Requires PostgreSQL and Redis
   - Slower execution (< 2 minutes)

3. **Load Tests** (`npm run test:load`)
   - Performance and stress testing
   - Requires all services
   - Long execution time (2-5 minutes)

## Local Development

### Prerequisites

```bash
# Install Node.js 18+ and npm
node --version  # Should be 18.0.0 or higher
npm --version   # Should be 9.0.0 or higher

# Install PostgreSQL 14
brew install postgresql@14  # macOS
# or
sudo apt-get install postgresql-14  # Ubuntu

# Install Redis
brew install redis  # macOS
# or
sudo apt-get install redis-server  # Ubuntu
```

### Starting Services

```bash
# Start PostgreSQL
brew services start postgresql@14  # macOS
# or
sudo systemctl start postgresql  # Ubuntu

# Start Redis
brew services start redis  # macOS
# or
sudo systemctl start redis-server  # Ubuntu
```

### Running Tests Locally

```bash
cd boo/src/modules/collaboration

# Install dependencies
npm install

# Set environment variables
export DB_USER=your_username
export DB_PASSWORD=your_password

# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:load

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Environment Variables

```bash
# Database Configuration
DB_HOST=localhost          # Database host
DB_PORT=5432              # Database port
DB_USER=postgres          # Database user
DB_PASSWORD=postgres      # Database password

# Redis Configuration
REDIS_HOST=localhost      # Redis host
REDIS_PORT=6379          # Redis port

# Test Configuration
NODE_ENV=test            # Set to 'test' for testing
SKIP_DB_SETUP=true       # Skip database setup (unit tests only)
```

## GitHub Actions Workflow

### Workflow File

Location: `.github/workflows/test.yml`

### Trigger Events

- **Push** to `main` or `develop` branches
- **Pull Request** to `main` or `develop` branches
- Only when files in `boo/src/modules/collaboration/**` are changed

### Jobs

#### 1. Test Job

Runs on: `ubuntu-latest`

**Matrix Strategy:**
- Node.js versions: 18.x, 20.x
- Tests run in parallel for each version

**Steps:**
1. Checkout code
2. Setup Node.js
3. Install dependencies (`npm ci`)
4. Type check (`npm run typecheck`)
5. Lint code (`npm run lint`)
6. Run unit tests with coverage
7. Run integration tests
8. Upload coverage to Codecov
9. Archive test results

**Services:**
- PostgreSQL 14 with health checks
- Redis 7 with health checks

#### 2. Lint Job

Runs on: `ubuntu-latest` with Node.js 20.x

**Steps:**
1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Run linter

### Status Badges

Add these to your README.md:

```markdown
![Tests](https://github.com/your-org/your-repo/workflows/Collaboration%20Module%20Tests/badge.svg)
[![codecov](https://codecov.io/gh/your-org/your-repo/branch/main/graph/badge.svg)](https://codecov.io/gh/your-org/your-repo)
```

## Test Configuration

### Jest Configuration

File: `jest.config.ts`

Key settings:
- **Preset**: `ts-jest/presets/default-esm`
- **Environment**: `node`
- **ES Modules**: Enabled with extensions to treat as ESM
- **Module Name Mapping**: Maps `.js` imports to TypeScript files
- **Global Setup**: `tests/setup/global-setup.ts`
- **Global Teardown**: `tests/setup/global-teardown.ts`

### TypeScript Configuration

File: `tsconfig.json`

Key settings:
- **Target**: ES2022
- **Module**: ES2022
- **ES Module Interop**: Enabled
- **Strict Mode**: Enabled
- **Source Maps**: Enabled for debugging

## Database Schema

### Automatic Schema Management

The test setup automatically:
1. Drops existing `collaboration_test` database
2. Creates fresh `collaboration_test` database
3. Runs `database/schema.sql` to create tables
4. Tears down after all tests complete

### Schema Location

`database/schema.sql` - Contains all table definitions and indexes

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Error**: `error: role "postgres" does not exist`

**Solution**:
```bash
# Set correct database user
export DB_USER=$(whoami)
export DB_PASSWORD=

# Or use postgres user
createuser -s postgres
```

#### 2. Redis Connection Failed

**Error**: `ECONNREFUSED`

**Solution**:
```bash
# Check if Redis is running
redis-cli ping  # Should return "PONG"

# Start Redis if not running
brew services start redis  # macOS
sudo systemctl start redis-server  # Ubuntu
```

#### 3. TypeScript Module Resolution

**Error**: `Cannot find module`

**Solution**:
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild TypeScript
npm run build
```

#### 4. Jest ESM Issues

**Error**: `SyntaxError: Unexpected token 'export'`

**Solution**:
- Ensure `jest.config.ts` has `extensionsToTreatAsEsm: ['.ts']`
- Ensure `tsconfig.json` has `"module": "ES2022"`
- Use `moduleNameMapper` for `.js` import resolution

### Debug Mode

Run tests in debug mode:

```bash
# Enable debug logging
export DEBUG=*

# Run tests with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand

# In Chrome, visit: chrome://inspect
```

### Test Isolation

Each test file runs in isolation with:
- Fresh database tables
- Cleared Redis cache
- Mocked external dependencies

## Coverage Requirements

### Thresholds

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

### Coverage Reports

Generated in: `coverage/`

View HTML report:
```bash
open coverage/lcov-report/index.html
```

## Continuous Improvement

### Adding New Tests

1. Create test file: `tests/services/YourService.test.ts`
2. Follow existing patterns for mocking
3. Ensure tests are isolated and deterministic
4. Run locally before pushing: `npm test`

### Test Factories

Located in: `tests/factories/`

- `UserFactory.ts` - Create test users
- `SessionFactory.ts` - Create test sessions
- `CommentFactory.ts` - Create test comments
- `NotificationFactory.ts` - Create test notifications
- `EventFactory.ts` - Create test events

### Mock Pattern

```typescript
// Mock external service
class MockService {
  private data: Map<string, any> = new Map();
  
  async get(key: string): Promise<any> {
    return this.data.get(key);
  }
  
  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }
  
  reset(): void {
    this.data.clear();
  }
}
```

## Performance Benchmarks

### Target Performance

- Unit tests: < 30 seconds
- Integration tests: < 2 minutes
- Load tests: < 5 minutes
- Total CI time: < 10 minutes

### Optimization Tips

1. Use `--maxWorkers=2` for CI environments
2. Run integration tests in parallel when possible
3. Mock external dependencies in unit tests
4. Use test factories for consistent data
5. Clean up resources in `afterEach` hooks

## Security Considerations

### Secrets Management

- Never commit database passwords
- Use environment variables for credentials
- GitHub Actions secrets for CI/CD
- Rotate credentials regularly

### Database Security

- Use separate test database
- Drop and recreate for each test run
- No production data in tests
- Sanitize test data after runs

## Maintenance

### Regular Tasks

- Update dependencies monthly
- Review and update test coverage
- Monitor CI performance
- Update documentation
- Review and fix flaky tests

### Dependency Updates

```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update major versions
npm install package@latest
```

## Support

### Getting Help

- Check test output logs
- Review this documentation
- Check GitHub Actions logs
- Contact the team

### Contributing

See `CONTRIBUTING.md` for:
- Code style guidelines
- Test requirements
- Pull request process
- Review criteria