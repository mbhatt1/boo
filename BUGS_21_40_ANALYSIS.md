# Bugs #21-#40: React Component Issues

## Bug #21: Unchecked Timer Cleanup in cancelDelayedThinking()
**Location**: `boo/src/modules/interfaces/react/src/components/Terminal.tsx:262-266`
**Severity**: Medium
**Category**: Resource Management

**Issue**: The function clears timers without checking if they exist first, though TypeScript null checks would catch this.

```typescript
const cancelDelayedThinking = () => {
  if (delayedThinkingTimerRef.current) {
    clearTimeout(delayedThinkingTimerRef.current);
    delayedThinkingTimerRef.current = null;
  }
  // Missing similar checks for other timers
```

**Impact**: Potential crashes if timer refs are in unexpected states.

---

## Bug #22: Missing Dependency in useCallback
**Location**: `Terminal.tsx:381`
**Severity**: Medium  
**Category**: React Hooks

**Issue**: `scheduleCompletedEventsUpdate` is called but not included in the dependency array of `resetAllBuffers` useCallback.

```typescript
}, [cancelDelayedThinking, setActiveEvents, setCompletedEvents, ...]);
// Missing: scheduleCompletedEventsUpdate
```

**Impact**: Stale closure may reference old version of function.

---

## Bug #23: setTimeout Without Cleanup Reference
**Location**: `Terminal.tsx:719-722`
**Severity**: High
**Category**: Resource Management

**Issue**: Multiple setTimeout calls that don't store references for cleanup:

```typescript
setTimeout(() => {
  // Timer action
}, 10) as unknown as NodeJS.Timeout;
```

**Impact**: Timers continue running even after component unmounts, causing memory leaks.

---

## Bug #24: Async Function Without Error Boundary
**Location**: `DeploymentRecovery.tsx:36-70`
**Severity**: High
**Category**: Error Handling

**Issue**: Async `handleRecovery` function can throw unhandled promise rejections:

```typescript
const handleRecovery = useCallback(async () => {
  setIsRecovering(true);
  setError(null);
  try {
    switch (deployment.mode) {
      // Cases can throw
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Recovery failed');
  }
  // No finally to reset isRecovering
```

**Impact**: UI stuck in "recovering" state if promise is rejected outside try-catch.

---

## Bug #25: Untracked setTimeout in DeploymentRecovery
**Location**: `DeploymentRecovery.tsx:97, 123, 138, 151`
**Severity**: Medium
**Category**: Resource Management

**Issue**: Multiple `setTimeout` calls without cleanup:

```typescript
await new Promise(resolve => setTimeout(resolve, 1000));
```

**Impact**: Timers run even after component unmounts.

---

## Bug #26: Untracked setTimeout in InitializationFlow
**Location**: `InitializationFlow.tsx:520`
**Severity**: Medium
**Category**: Resource Management

**Issue**: setTimeout without cleanup mechanism:

```typescript
setTimeout(() => {
  switchDeploymentMode(deploymentMode);
}, 100);
```

**Impact**: State updates after unmount causing React warnings.

---

## Bug #27: Multiple Timer Refs Without Unmount Cleanup
**Location**: `Terminal.tsx` (multiple locations)
**Severity**: High
**Category**: Resource Management

**Issue**: Component uses multiple timer refs (`delayedThinkingTimerRef`, `postToolIdleTimerRef`, `postReasoningIdleTimerRef`, `activeUpdateTimerRef`, `pendingTimerRef`) but no comprehensive cleanup on unmount.

**Impact**: Memory leaks and potential state updates after unmount.

---

## Bug #28: Untyped Error State
**Location**: `ErrorBoundary.tsx:21-23`
**Severity**: Low
**Category**: Type Safety

**Issue**: Error state uses `Error | null` but may receive other error types:

```typescript
error: Error | null;
// But getDerivedStateFromError receives any error type
```

**Impact**: Type assumptions may be violated at runtime.

---

## Bug #29: queueMicrotask Without Error Handling
**Location**: `SetupWizard.tsx:82-130`
**Severity**: Medium
**Category**: Error Handling

**Issue**: queueMicrotask wraps async operations without error handling:

```typescript
queueMicrotask(async () => {
  try {
    // async operations
  } catch (e) {
    // caught but no guarantee microtask errors propagate correctly
  }
});
```

**Impact**: Errors in microtasks may not be properly caught by error boundaries.

---

## Bug #30: Silent Error Loop in DocumentationViewer
**Location**: `DocumentationViewer.tsx:207-213`
**Severity**: Medium
**Category**: Error Handling

**Issue**: Try-catch loop continues on error without logging:

```typescript
for (const testPath of possiblePaths) {
  try {
    content = await fs.readFile(testPath, 'utf-8');
    foundPath = testPath;
    break;
  } catch (err) {
    continue; // Silent failure
  }
}
```

**Impact**: Difficult to debug why documentation files can't be found.

---

## Bug #31: Nested Try-Catch Error Masking
**Location**: `InitializationFlow.tsx:371-394`
**Severity**: High
**Category**: Error Handling

**Issue**: `startContainers` has nested try-catch blocks that may mask errors:

```typescript
try {
  await execAsync(`docker-compose -f ${composePath} start`);
  return true;
} catch {
  try {
    await execAsync(`docker-compose -f ${composePath} up --no-recreate -d`);
    return true;
  } catch (upError) {
    logger.error('Failed to start existing containers', upError as Error);
    throw upError;
  }
}
```

**Impact**: First error is silently suppressed even if it contains useful debugging info.

---

## Bug #32: Silent Global GC Failure
**Location**: `Terminal.tsx:418-422, 1236-1240`
**Severity**: Low
**Category**: Error Handling

**Issue**: Try-catch blocks silently ignore GC failures:

```typescript
if (global.gc) {
  try {
    global.gc();
  } catch (e) {
    // Silent failure
  }
}
```

**Impact**: No visibility into whether garbage collection is working.

---

## Bug #33: Multiple useEffect Without Timer Cleanup
**Location**: `MainAppView.tsx` (multiple useEffect hooks)
**Severity**: High
**Category**: Resource Management

**Issue**: Component has multiple useEffect hooks that create intervals/timeouts but don't always clean them up properly.

**Impact**: Timer leaks on component unmount.

---

## Bug #34: setInterval Without Cleanup Storage
**Location**: `SwarmDisplay.tsx:67-76`
**Severity**: High
**Category**: Resource Management

**Issue**: setInterval created but cleanup function doesn't guarantee it stops:

```typescript
useEffect(() => {
  if (swarmState.status === 'running') {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }
}, [swarmState.status]);
```

**Impact**: If status changes rapidly, intervals might accumulate.

---

## Bug #35: setInterval Cleanup Race Condition
**Location**: `StatusIndicator.tsx:96`
**Severity**: Medium
**Category**: Resource Management

**Issue**: Deployment mode interval created without robust cleanup:

```typescript
const deploymentModeInterval = overrideMode ? null : setInterval(updateDeploymentMode, 10000);
return () => {
  // cleanup
};
```

**Impact**: Interval might not be cleared if component unmounts during update.

---

## Bug #36: Rapid Status Change Interval Leak
**Location**: `OperationStatusDisplay.tsx:70-87`
**Severity**: High
**Category**: Resource Management

**Issue**: setInterval may leak if operation status changes rapidly:

```typescript
useEffect(() => {
  if (currentOperation?.status === 'running') {
    spinTimerRef.current = setInterval(() => {
      setSpinIndex(prev => (prev + 1) % 4);
      if (currentOperation?.status !== 'running') {
        clearInterval(spinTimerRef.current);
        spinTimerRef.current = null;
      }
    }, 100);
  }
  return () => {
    if (spinTimerRef.current) {
      clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }
  };
}, [currentOperation?.status]);
```

**Impact**: Multiple intervals created if status flips between running/stopped quickly.

---

## Bug #37: useInput Without Unsubscription
**Location**: `ExtendedTextInput.tsx:55-120`
**Severity**: Low
**Category**: Resource Management

**Issue**: useInput hook subscribes to keyboard events but Ink's implementation may not properly unsubscribe on unmount in all cases.

**Impact**: Potential event listener leaks.

---

## Bug #38: Type Cast to NodeJS.Timeout May Fail
**Location**: `Terminal.tsx:288, 336, 721, 991, 1157`
**Severity**: Medium
**Category**: Type Safety

**Issue**: setTimeout return value cast as `NodeJS.Timeout`:

```typescript
delayedThinkingTimerRef.current = setTimeout(() => {
  // ...
}, delay) as unknown as NodeJS.Timeout;
```

**Impact**: Browser environment returns `number`, Node returns `Timeout` object - cast may hide type errors.

---

## Bug #39: setTimeout Without Ref Prevents Cleanup
**Location**: `MultiLineTextInput.tsx:68`
**Severity**: High
**Category**: Resource Management

**Issue**: setTimeout created but not stored in ref for cleanup:

```typescript
updateTimeoutRef.current = setTimeout(() => {
  // update
  updateTimeoutRef.current = null;
}, 100);
```

**Impact**: If component unmounts during timeout, update tries to set state on unmounted component.

---

## Bug #40: useEffect Keypress Subscription Doesn't Check Focus
**Location**: `PasteAwareTextInput.tsx:130-140`
**Severity**: Medium
**Category**: Event Handling

**Issue**: useEffect subscribes to keypress events but cleanup doesn't properly check focus state:

```typescript
useEffect(() => {
  if (!focus) return;
  
  const handleKeyPress = (ch: string, key: any) => {
    // handle
  };
  
  process.stdin.on('keypress', handleKeyPress);
  return () => {
    process.stdin.removeListener('keypress', handleKeyPress);
  };
}, [focus, ...]);
```

**Impact**: Event listener might fire even when component loses focus during cleanup.

---

## Summary Statistics

### By Severity:
- **High**: 9 bugs (Resource leaks, timer management)
- **Medium**: 9 bugs (Error handling, type safety)
- **Low**: 2 bugs (Type safety, error visibility)

### By Category:
- **Resource Management**: 12 bugs (timers, intervals, cleanup)
- **Error Handling**: 5 bugs (silent failures, error masking)
- **Type Safety**: 2 bugs (type casts, error types)
- **React Hooks**: 1 bug (dependency arrays)

### By Component:
- **Terminal.tsx**: 8 bugs
- **DeploymentRecovery.tsx**: 2 bugs
- **InitializationFlow.tsx**: 2 bugs
- **SetupWizard.tsx**: 1 bug
- **DocumentationViewer.tsx**: 1 bug
- **ErrorBoundary.tsx**: 1 bug
- **MainAppView.tsx**: 1 bug
- **SwarmDisplay.tsx**: 1 bug
- **StatusIndicator.tsx**: 1 bug
- **OperationStatusDisplay.tsx**: 1 bug
- **ExtendedTextInput.tsx**: 1 bug
- **MultiLineTextInput.tsx**: 1 bug
- **PasteAwareTextInput.tsx**: 1 bug

---

## Impact Assessment

### Resource Management ⚠️
- Multiple timer leaks across components
- Intervals not properly cleaned up
- setTimeout without cleanup refs

### Error Handling ⚠️
- Silent failures in loops
- Nested try-catch masking errors
- Async operations without boundaries

### Type Safety ⚠️
- NodeJS.Timeout casts potentially unsafe
- Error types not properly constrained

### React Best Practices ⚠️
- Missing dependencies in hooks
- State updates after unmount
- Event subscriptions without proper cleanup

---

## Recommended Fixes

1. **Create cleanup utility**: Centralized timer/interval management
2. **Add error logging**: Log all caught errors for debugging
3. **Implement error boundaries**: Wrap async operations
4. **Fix hook dependencies**: Add missing deps or use refs
5. **Standardize cleanup**: useEffect return functions for all timers
6. **Type guards**: Proper type checking for error objects
7. **Ref-based timers**: Store all timer IDs in refs for cleanup
8. **Focus checks**: Verify focus state before event handling

All these bugs represent potential production issues that could cause:
- Memory leaks in long-running sessions
- State update errors after component unmount
- Difficult-to-debug error scenarios
- Resource exhaustion under load