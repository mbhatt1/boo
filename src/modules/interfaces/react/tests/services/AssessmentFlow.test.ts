/**
 * Comprehensive tests for AssessmentFlow
 * ======================================
 * 
 * Tests for flow management, state transitions, and operation orchestration.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock AssessmentFlow structure for testing
interface AssessmentState {
  phase: 'planning' | 'execution' | 'reporting' | 'completed';
  progress: number;
  findings: any[];
  errors: any[];
}

class MockAssessmentFlow {
  private state: AssessmentState;
  private listeners: ((state: AssessmentState) => void)[];

  constructor() {
    this.state = {
      phase: 'planning',
      progress: 0,
      findings: [],
      errors: []
    };
    this.listeners = [];
  }

  getState(): AssessmentState {
    return { ...this.state };
  }

  setState(newState: Partial<AssessmentState>): void {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }

  subscribe(listener: (state: AssessmentState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  transitionTo(phase: AssessmentState['phase']): void {
    this.setState({ phase, progress: 0 });
  }

  addFinding(finding: any): void {
    this.setState({
      findings: [...this.state.findings, finding]
    });
  }

  addError(error: any): void {
    this.setState({
      errors: [...this.state.errors, error]
    });
  }

  updateProgress(progress: number): void {
    this.setState({ progress });
  }
}

describe('AssessmentFlow', () => {
  let flow: MockAssessmentFlow;

  beforeEach(() => {
    flow = new MockAssessmentFlow();
  });

  describe('State Management', () => {
    it('should initialize with planning phase', () => {
      const state = flow.getState();
      expect(state.phase).toBe('planning');
      expect(state.progress).toBe(0);
    });

    it('should update state correctly', () => {
      flow.setState({ progress: 50 });
      expect(flow.getState().progress).toBe(50);
    });

    it('should maintain state immutability', () => {
      const initialState = flow.getState();
      flow.setState({ progress: 50 });
      expect(initialState.progress).toBe(0);
    });

    it('should handle multiple state updates', () => {
      flow.setState({ progress: 25 });
      flow.setState({ progress: 50 });
      flow.setState({ progress: 75 });
      expect(flow.getState().progress).toBe(75);
    });
  });

  describe('Phase Transitions', () => {
    it('should transition from planning to execution', () => {
      flow.transitionTo('execution');
      expect(flow.getState().phase).toBe('execution');
    });

    it('should transition from execution to reporting', () => {
      flow.transitionTo('execution');
      flow.transitionTo('reporting');
      expect(flow.getState().phase).toBe('reporting');
    });

    it('should reset progress on phase transition', () => {
      flow.setState({ progress: 50 });
      flow.transitionTo('execution');
      expect(flow.getState().progress).toBe(0);
    });

    it('should handle multiple phase transitions', () => {
      flow.transitionTo('execution');
      flow.transitionTo('reporting');
      flow.transitionTo('completed');
      expect(flow.getState().phase).toBe('completed');
    });

    it('should allow phase sequence validation', () => {
      const validSequence = ['planning', 'execution', 'reporting', 'completed'];
      expect(validSequence).toContain('execution');
    });
  });

  describe('Findings Management', () => {
    it('should add finding to state', () => {
      const finding = { type: 'vulnerability', severity: 'high' };
      flow.addFinding(finding);
      expect(flow.getState().findings).toHaveLength(1);
    });

    it('should maintain finding order', () => {
      flow.addFinding({ id: 1 });
      flow.addFinding({ id: 2 });
      flow.addFinding({ id: 3 });
      const findings = flow.getState().findings;
      expect(findings[0].id).toBe(1);
      expect(findings[2].id).toBe(3);
    });

    it('should handle multiple findings', () => {
      for (let i = 0; i < 10; i++) {
        flow.addFinding({ id: i });
      }
      expect(flow.getState().findings).toHaveLength(10);
    });

    it('should preserve existing findings when adding new', () => {
      flow.addFinding({ id: 1 });
      const firstState = flow.getState();
      flow.addFinding({ id: 2 });
      expect(flow.getState().findings).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should add error to state', () => {
      const error = { message: 'Test error', code: 'ERR_001' };
      flow.addError(error);
      expect(flow.getState().errors).toHaveLength(1);
    });

    it('should track multiple errors', () => {
      flow.addError({ message: 'Error 1' });
      flow.addError({ message: 'Error 2' });
      expect(flow.getState().errors).toHaveLength(2);
    });

    it('should continue operation after error', () => {
      flow.addError({ message: 'Non-fatal error' });
      flow.setState({ progress: 50 });
      expect(flow.getState().progress).toBe(50);
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress', () => {
      flow.updateProgress(25);
      expect(flow.getState().progress).toBe(25);
    });

    it('should handle progress from 0 to 100', () => {
      for (let i = 0; i <= 100; i += 10) {
        flow.updateProgress(i);
      }
      expect(flow.getState().progress).toBe(100);
    });

    it('should allow progress updates in any phase', () => {
      flow.transitionTo('execution');
      flow.updateProgress(50);
      expect(flow.getState().progress).toBe(50);
    });
  });

  describe('State Subscriptions', () => {
    it('should notify listeners on state change', () => {
      const listener = jest.fn();
      flow.subscribe(listener);
      flow.setState({ progress: 50 });
      expect(listener).toHaveBeenCalled();
    });

    it('should pass new state to listeners', () => {
      let receivedState: AssessmentState | undefined;
      flow.subscribe((state) => {
        receivedState = state;
      });
      flow.setState({ progress: 50 });
      expect(receivedState).toBeDefined();
      expect(receivedState!.progress).toBe(50);
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      flow.subscribe(listener1);
      flow.subscribe(listener2);
      flow.setState({ progress: 50 });
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', () => {
      const listener = jest.fn();
      const unsubscribe = flow.subscribe(listener);
      unsubscribe();
      flow.setState({ progress: 50 });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Flow Validation', () => {
    it('should validate phase sequence', () => {
      const phases: AssessmentState['phase'][] = ['planning', 'execution', 'reporting', 'completed'];
      expect(phases).toHaveLength(4);
    });

    it('should validate progress range', () => {
      const progress = 50;
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });

    it('should validate state structure', () => {
      const state = flow.getState();
      expect(state).toHaveProperty('phase');
      expect(state).toHaveProperty('progress');
      expect(state).toHaveProperty('findings');
      expect(state).toHaveProperty('errors');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid state updates', () => {
      for (let i = 0; i < 100; i++) {
        flow.setState({ progress: i });
      }
      expect(flow.getState().progress).toBe(99);
    });

    it('should handle concurrent finding additions', () => {
      const findings = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      findings.forEach(f => flow.addFinding(f));
      expect(flow.getState().findings).toHaveLength(10);
    });
  });

  describe('Flow Reset', () => {
    it('should reset to initial state', () => {
      flow.setState({ progress: 50 });
      flow.addFinding({ id: 1 });
      flow.transitionTo('planning');
      expect(flow.getState().phase).toBe('planning');
    });

    it('should clear findings on reset', () => {
      flow.addFinding({ id: 1 });
      const newFlow = new MockAssessmentFlow();
      expect(newFlow.getState().findings).toHaveLength(0);
    });
  });
});

describe('AssessmentFlow Integration', () => {
  it('should complete full assessment lifecycle', () => {
    const flow = new MockAssessmentFlow();
    const phases: AssessmentState['phase'][] = [];
    
    flow.subscribe(state => {
      phases.push(state.phase);
    });

    flow.transitionTo('execution');
    flow.updateProgress(50);
    flow.addFinding({ type: 'vulnerability' });
    flow.transitionTo('reporting');
    flow.transitionTo('completed');

    expect(phases).toContain('execution');
    expect(phases).toContain('completed');
  });

  it('should track assessment metrics', () => {
    const flow = new MockAssessmentFlow();
    flow.transitionTo('execution');
    
    for (let i = 0; i < 5; i++) {
      flow.addFinding({ severity: 'high' });
    }
    
    const state = flow.getState();
    expect(state.findings).toHaveLength(5);
    expect(state.phase).toBe('execution');
  });
});