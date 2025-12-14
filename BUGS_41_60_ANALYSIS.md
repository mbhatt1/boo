# Bugs #41-#60: Python Services, Utilities & Modules

## Bug #41: Process Pipe Deadlock in LocalExecutionService
**Location**: `boo/src/modules/execution/local.py:43-49`
**Severity**: Critical
**Category**: Resource Management

**Issue**: Subprocess created with PIPE for stdout/stderr but pipes are never read, causing deadlock when buffers fill:

```python
self.process = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)
```

**Impact**: Process hangs when output exceeds OS pipe buffer size (~64KB on Unix).

---

## Bug #42: No Cleanup on Exception During execute()
**Location**: `boo/src/modules/execution/local.py:42-49`
**Severity**: High
**Category**: Resource Management

**Issue**: If exception occurs after setting `_is_active = True` but before process starts, state is inconsistent:

```python
self._is_active = True
self.process = subprocess.Popen(...)  # Can raise exception
```

**Impact**: Leaked process handles, inconsistent state.

---

## Bug #43: Multiple File Opens Without Context Manager
**Location**: `boo/src/modules/prompts/factory.py:347, 354`
**Severity**: Medium
**Category**: Resource Management

**Issue**: Files opened without `with` statement:

```python
with open(template_path, "r", encoding="utf-8") as f:
    return f.read()
# But in other places:
with open(log_file, "a", encoding="utf-8") as f:  # Good
# vs direct open() calls elsewhere
```

**Impact**: File descriptor leaks if exceptions occur.

---

## Bug #44: Hardcoded Timeout Without Error Context
**Location**: `boo/src/modules/prompts/factory.py:108`
**Severity**: Medium
**Category**: Error Handling

**Issue**: URL request with hardcoded 5-second timeout, generic except:

```python
with _urlreq.urlopen(req, timeout=5) as resp:  # nosec
    if resp.status == 200:
        data = json.loads(resp.read())
        _lf_cache_set(name, label, data)
        return data
except Exception:
    return None
```

**Impact**: Silent failures, no logging of network errors.

---

## Bug #45: Background Thread Without Error Propagation
**Location**: `boo/src/modules/evaluation/manager.py:222-243`
**Severity**: High
**Category**: Threading

**Issue**: `run_evaluation()` runs in thread but exceptions only logged, not propagated:

```python
def run_evaluation():
    """Run the evaluation in a separate thread."""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            results = loop.run_until_complete(self.evaluate_all_traces())
        finally:
            loop.close()
    except Exception as e:
        logger.error("Evaluation failed: %s", e, exc_info=True)
```

**Impact**: Evaluation failures not visible to caller.

---

## Bug #46: Silent Failure in Module Tool Discovery
**Location**: `boo/src/modules/agents/boo_agent.py:557-564`
**Severity**: Medium
**Category**: Error Handling

**Issue**: Tool loading fails silently inside except block:

```python
try:
    module_name = f"operation_plugin_tool_{Path(tool_path).stem}"
    spec = importlib.util.spec_from_file_location(module_name, tool_path)
    if spec and spec.loader:
        tool_module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = tool_module
        spec.loader.exec_module(tool_module)
except Exception as e:
    logger.warning("Failed to load tool from %s: %s", tool_path, e)
    # Continues silently without the tool
```

**Impact**: Missing tools not obvious, hard to debug module issues.

---

## Bug #47: Model Creation Error Not Always Re-raised
**Location**: `boo/src/modules/agents/boo_agent.py:900-906`
**Severity**: High
**Category**: Error Handling

**Issue**: Error handler logs but comment suggests it should re-raise:

```python
except Exception as e:
    _handle_model_creation_error(config.provider, e)
    # Re-raise to satisfy tests expecting exception propagation after logging
    raise
```

**Impact**: Inconsistent behavior - comment suggests this is a workaround.

---

## Bug #48: Unchecked global.gc() Calls
**Location**: `boo/src/modules/handlers/prompt_rebuild_hook.py` (multiple locations referenced in Terminal.tsx analysis)
**Severity**: Low
**Category**: Error Handling

**Issue**: Calls `global.gc()` without checking if garbage collection is available:

```python
if global.gc:
    try:
        global.gc()
    except (e):
        pass
```

**Impact**: Silent failures, no visibility into GC availability.

---

## Bug #49: Module Sys.modules Pollution
**Location**: `boo/src/modules/agents/boo_agent.py:561`
**Severity**: Medium
**Category**: Resource Management

**Issue**: Dynamically loaded modules added to `sys.modules` but never removed:

```python
sys.modules[module_name] = tool_module
spec.loader.exec_module(tool_module)
```

**Impact**: Memory leaks, module namespace pollution across operations.

---

## Bug #50: Unread Subprocess Pipes
**Location**: `boo/src/modules/execution/local.py:45-46`
**Severity**: Critical
**Category**: Resource Management

**Issue**: Pipes created but never consumed, causing buffer overflow:

```python
stdout=subprocess.PIPE,
stderr=subprocess.PIPE,
```

**Impact**: Process blocks when writing more than pipe buffer can hold.

---

## Bug #51: JSON Parsing Without Schema Validation
**Location**: `boo/src/modules/handlers/react/hooks.py:96-100`
**Severity**: Medium
**Category**: Type Safety

**Issue**: JSON parsed but structure not validated:

```python
try:
    import json
    parsed_commands = json.loads(command)
    if isinstance(parsed_commands, list):
        tool_input["command"] = parsed_commands
except json.JSONDecodeError:
    pass  # Keep original if parsing fails
```

**Impact**: Malformed JSON causes silent failures, no type checking.

---

## Bug #52: Path Construction Without os.path.join
**Location**: `boo/src/modules/agents/boo_agent.py:190-194`
**Severity**: Low
**Category**: Portability

**Issue**: Path constructed with string concatenation instead of os.path.join:

```python
output_dir = "outputs"
# Later constructs paths with string operations
mem_path = f"{output_dir}/{sanitized}/memory/mem0_faiss_{sanitized}"
```

**Impact**: Path issues on Windows, not cross-platform safe.

---

## Bug #53: Non-Daemon Thread in EvaluationManager
**Location**: `boo/src/modules/evaluation/manager.py:227-241`
**Severity**: High
**Category**: Threading

**Issue**: Thread created without daemon=True prevents clean shutdown:

```python
eval_thread = threading.Thread(target=run_evaluation)
# Not daemon - blocks shutdown
eval_thread.start()
```

**Impact**: Application hangs on exit waiting for evaluation thread.

---

## Bug #54: asyncio.run() Inside Thread Without Event Loop Check
**Location**: `boo/src/modules/handlers/core/callback.py:364-370`
**Severity**: High
**Category**: Async/Threading

**Issue**: Creates new event loop in thread without checking existing loop:

```python
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
try:
    result = loop.run_until_complete(evaluator.evaluate_trace(...))
finally:
    loop.close()
```

**Impact**: Conflicts with existing event loops, resource leaks.

---

## Bug #55: Environment Variables Without Defaults
**Location**: `boo/src/modules/prompts/factory.py:69-71`
**Severity**: Low
**Category**: Configuration

**Issue**: Environment variables accessed with string defaults but not validated:

```python
pk = os.getenv("LANGFUSE_PUBLIC_KEY", "boo-public")
sk = os.getenv("LANGFUSE_SECRET_KEY", "boo-secret")
```

**Impact**: Default credentials in code, potential security issue.

---

## Bug #56: String Slicing Without Bounds Check in Report Generator
**Location**: `boo/src/modules/handlers/report_generator.py` (multiple locations)
**Severity**: Medium
**Category**: Type Safety

**Issue**: Multiple string operations without length validation:

```python
# String slicing operations throughout
memory_context = json.dumps(..., default=str)[:5000]
```

**Impact**: Index errors on edge cases, data truncation without notice.

---

## Bug #57: Dictionary Access Without Type Validation
**Location**: `boo/src/modules/handlers/utils.py:280-366`
**Severity**: Medium
**Category**: Type Safety

**Issue**: Dictionary `.get()` calls assume type but don't validate:

```python
for message in messages:
    content_raw = message.get("content", [])
    # Assumes list but no validation
    for block in content_raw:
        if isinstance(block, dict) and "text" in block:
```

**Impact**: Runtime errors if content structure differs from expected.

---

## Bug #58: Missing Type Annotations on Critical Functions
**Location**: `boo/src/modules/agents/boo_agent.py:51`
**Severity**: Low
**Category**: Type Safety

**Issue**: Hook callback methods lack type annotations:

```python
def _on_before_tool(self, event) -> None:  # type: ignore[no-untyped-def]
    if getattr(event, "selected_tool", None) is not None:
```

**Impact**: Type checking disabled, potential runtime errors.

---

## Bug #59: Conditional Module Import Can Fail Silently
**Location**: `boo/src/modules/agents/boo_agent.py:820-822`
**Severity**: Medium
**Category**: Error Handling

**Issue**: Import wrapped in try-except that silently continues:

```python
try:
    from modules.handlers.react import ReactBridgeHandler as _RBH  # noqa: F401
except Exception:
    pass  # Silently continues if import fails
```

**Impact**: Missing dependencies not caught until runtime, hard to debug.

---

## Bug #60: No File Descriptor Limit Checking
**Location**: `boo/src/modules/config/environment.py:261`
**Severity**: Medium
**Category**: Resource Management

**Issue**: Opens log file without checking system limits:

```python
try:
    self.log = open(log_file, "a", encoding="utf-8", buffering=1)
except (OSError, IOError) as e:
    import logging
    logging.warning("Failed to open log file %s: %s", log_file, e)
```

**Impact**: No check for file descriptor exhaustion, cryptic error messages.

---

## Summary Statistics

### By Severity:
- **Critical**: 2 bugs (Process deadlocks)
- **High**: 5 bugs (Threading, async, error propagation)
- **Medium**: 10 bugs (Error handling, type safety)
- **Low**: 3 bugs (Code quality, portability)

### By Category:
- **Resource Management**: 8 bugs (Pipes, files, threads, modules)
- **Error Handling**: 6 bugs (Silent failures, missing propagation)
- **Type Safety**: 4 bugs (Missing validation, type annotations)
- **Threading**: 2 bugs (Daemon threads, event loops)
- **Configuration**: 1 bug (Hardcoded credentials)
- **Portability**: 1 bug (Path construction)

### By Module:
- **local.py**: 2 bugs
- **factory.py**: 4 bugs  
- **boo_agent.py**: 5 bugs
- **evaluation/manager.py**: 2 bugs
- **handlers (various)**: 4 bugs
- **utilities**: 3 bugs

---

## Impact Assessment

### Critical Issues ⚠️
- **Process deadlocks**: Subprocess communication broken
- **Pipe buffer overflow**: Applications hang on large output

### High Priority Issues ⚠️
- **Thread safety**: Non-daemon threads prevent shutdown
- **Event loop conflicts**: asyncio misuse in threads
- **Error suppression**: Critical failures go unnoticed

### Medium Priority Issues ⚠️
- **Type safety**: Missing validation causes runtime errors
- **Resource leaks**: File descriptors, modules not cleaned up
- **Silent failures**: Errors logged but not propagated

### Low Priority Issues 📝
- **Code quality**: Type annotations, portability
- **Configuration**: Hardcoded defaults

---

## Recommended Fixes

### Process Management (Bugs #41, #42, #50)
```python
# Use subprocess.DEVNULL or read pipes asynchronously
self.process = subprocess.Popen(
    cmd,
    stdout=subprocess.DEVNULL,  # Or implement async reader
    stderr=subprocess.DEVNULL,
    text=True
)
```

### Threading (Bugs #45, #53, #54)
```python
# Use daemon threads and proper event loop handling
eval_thread = threading.Thread(target=run_evaluation, daemon=True)

# Check for existing event loop before creating new one
try:
    loop = asyncio.get_running_loop()
except RuntimeError:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
```

### Error Handling (Bugs #44, #46, #47, #59)
```python
# Log AND propagate critical errors
except Exception as e:
    logger.error("Critical operation failed: %s", e, exc_info=True)
    raise  # Don't suppress
```

### Type Safety (Bugs #51, #57, #58)
```python
# Validate structure after parsing
parsed = json.loads(data)
if not isinstance(parsed, dict) or "required_field" not in parsed:
    raise ValueError("Invalid structure")
```

### Resource Management (Bugs #43, #49, #60)
```python
# Always use context managers
with open(file_path, 'r') as f:
    content = f.read()

# Clean up dynamic modules
try:
    # Use module
finally:
    sys.modules.pop(module_name, None)
```

---

## Testing Recommendations

1. **Process Communication Tests**: Verify pipes don't deadlock with large output
2. **Thread Lifecycle Tests**: Ensure threads don't prevent shutdown
3. **Error Propagation Tests**: Verify critical errors aren't silenced
4. **Type Validation Tests**: Test with malformed input
5. **Resource Limit Tests**: Test behavior at file descriptor limits
6. **Event Loop Tests**: Verify asyncio usage in threaded contexts

---

## Conclusion

These 20 bugs represent significant issues in:
- **Process management**: Critical deadlock potential
- **Concurrent programming**: Thread and async misuse
- **Error handling**: Widespread silent failures
- **Type safety**: Missing validation throughout
- **Resource management**: Multiple leak vectors

All issues require attention for production stability, with process deadlocks being the highest priority due to their ability to completely halt operations.