
# GitHub Issues for Unfixed Bugs (#21-#80)

This document contains GitHub issue templates for the 60 unfixed bugs in the boo codebase. Create these issues in your repository to track remediation progress.

---

## Issue Templates by Priority

### 🔴 P0: Critical Priority (7 issues)

---

#### Issue #1: [CRITICAL] Process Pipe Deadlock in LocalExecutionService

**Labels**: `bug`, `critical`, `P0`, `backend`

**Title**: Process pipe deadlock causes complete application hang

**Description**:
The [`LocalExecutionService._execute_command()`](boo/src/modules/execution/local.py:45) method can deadlock when subprocess output exceeds pipe buffer size.

**Bug ID**: #41

**Impact**: 
- Complete application hang
- Users must force-kill the process
- Lost work and corrupted state

**Root Cause**:
```python
# subprocess.py line 45-60
process = subprocess.Popen(
    command,
    stdout=subprocess.PIPE,  # ⚠️ Can deadlock if output > 64KB
    stderr=subprocess.PIPE,
    shell=True
)
result = process.wait()  # ⚠️ Hangs waiting for process that's waiting for buffer read
stdout = process.stdout.read()
```

**Solution**:
Use `subprocess.DEVNULL` for unused streams or implement async readers:
```python
# Option 1: DEVNULL for unused streams
process = subprocess.Popen(
    command,
    stdout=subprocess.PIPE if capture_output else subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    shell=False,  # Safer
    timeout=timeout
)

# Option 2: Async readers with threading
import threading
def read_output(pipe, buffer):
    for line in iter(pipe.readline, b''):
        buffer.append(line)
    pipe.close()

stdout_lines = []
thread = threading.Thread(target=read_output, args=(process.stdout, stdout_lines))
thread.daemon = True
thread.start()
```

**Test Case**:
```python
def test_large_output_no_deadlock():
    # Generate command that outputs > 64KB
    result = service.execute_command("yes | head -n 100000")
    assert result is not None
    assert not service.is_hung()
```

**References**:
- Python subprocess docs: https://docs.python.org/3/library/subprocess.html#subprocess.Popen.communicate
- Related: Bug #50 (unread pipes)

---

#### Issue #2: [HIGH] XSS Vulnerability in Report Generation

**Labels**: `bug`, `security`, `P0`, `backend`

**Title**: Cross-site scripting vulnerability in generated reports

**Description**:
Finding IDs are inserted directly into HTML anchors without sanitization in [`report_builder.py`](boo/src/modules/tools/report_builder.py:429).

**Bug ID**: #75

**Impact**:
- XSS attacks through malicious finding IDs
- Compromised report HTML
- Potential credential theft

**Root Cause**:
```python
# report_builder.py line 429
anchor_link = f"#finding-{top['id']}"  # ⚠️ No sanitization
```

**Solution**:
```python
import re
import html

def _sanitize_anchor_id(id_str: str) -> str:
    """Sanitize ID for use in HTML anchor."""
    if not id_str:
        return ""
    # HTML escape first
    safe = html.escape(str(id_str))
    # Keep only alphanumeric, hyphens, underscores
    safe = re.sub(r'[^a-zA-Z0-9_-]', '', safe)
    # Ensure starts with letter
    if safe and not safe[0].isalpha():
        safe = 'f' + safe
    return safe[:100]

# Usage
safe_id = _sanitize_anchor_id(top['id'])
anchor_link = f"#finding-{safe_id}"
```

**Test Case**:
```python
def test_xss_prevention():
    malicious_id = "<script>alert('XSS')</script>"
    safe_id = _sanitize_anchor_id(malicious_id)
    assert '<' not in safe_id
    assert '>' not in safe_id
    assert safe_id.isalnum() or all(c in '-_' for c in safe_id if not c.isalnum())
```

**References**:
- OWASP XSS Guide: https://owasp.org/www-community/attacks/xss/

---

#### Issue #3: [HIGH] Hardcoded Credentials in Test Configuration

**Labels**: `bug`, `security`, `P0`, `frontend`

**Title**: Test config contains hardcoded credentials with insecure fallback

**Description**:
[`mock-config.js`](boo/src/modules/interfaces/react/tests/mock-config.js:16) provides hardcoded credential fallback.

**Bug ID**: #63

**Impact**:
- Security vulnerability if test config used in production
- Credentials in source control
- False sense of security

**Root Cause**:
```javascript
// mock-config.js line 16
awsBearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK || 'test-token',  // ⚠️ Insecure
```

**Solution**:
```javascript
// Option 1: Fail fast
awsBearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK || 
  (() => { throw new Error('AWS_BEARER_TOKEN_BEDROCK required for tests'); })(),

// Option 2: Use test-specific validation
awsBearerToken: (() => {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!token && process.env.NODE_ENV !== 'test') {
    throw new Error('AWS_BEARER_TOKEN_BEDROCK required');
  }
  return token || 'MOCK_TOKEN_FOR_UNIT_TESTS_ONLY';
})(),
```

**Test Case**:
```javascript
test('should fail without credentials in non-test env', () => {
  delete process.env.AWS_BEARER_TOKEN_BEDROCK;
  process.env.NODE_ENV = 'development';
  expect(() => require('./mock-config')).toThrow();
});
```

---

#### Issue #4: [HIGH] Unbounded Output Buffer in Test Subprocess

**Labels**: `bug`, `resource-leak`, `P0`, `testing`

**Title**: Test subprocess accumulates unbounded output causing memory exhaustion

**Description**:
[`python-cli-smoke.js`](boo/src/modules/interfaces/react/tests/integration/python-cli-smoke.js:31) accumulates subprocess output without limits.

**Bug ID**: #65

**Impact**:
- Memory exhaustion with verbose output
- Test process crash
- CI/CD failures

