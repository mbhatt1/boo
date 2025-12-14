/**
 * Ink Testing Helper
 * 
 * Provides a minimal compatibility layer for testing ink components with ink v4+
 * This is a simplified mock that provides the interface expected by tests
 */

import React from 'react';
import { Box, Text } from 'ink';

interface TestInstance {
  lastFrame: () => string | undefined;
  frames: string[];
  unmount: () => void;
  rerender: (tree: React.ReactElement) => void;
  stdin: {
    write: (data: string) => void;
  };
  stdout: { frames: string[] };
  stderr: NodeJS.WriteStream;
}

/**
 * Simple mock render function for testing Ink components
 * Compatible with ink v4+ without requiring ink-testing-library
 * 
 * Note: This is a minimal mock that extracts basic component structure
 * for testing purposes. It doesn't actually render the full Ink output.
 */
export function render(tree: React.ReactElement): TestInstance {
  const frames: string[] = [];
  
  // Extract component info for basic testing
  const componentName = tree.type?.toString() || 'Component';
  const props = tree.props as any || {};
  
  // Create a simple text representation for testing
  let output = `<${componentName}`;
  Object.keys(props).forEach(key => {
    if (key !== 'children' && props[key] !== undefined) {
      output += ` ${key}="${JSON.stringify(props[key])}"`;
    }
  });
  output += '>';
  
  // Add children if present
  if (props.children) {
    if (typeof props.children === 'string') {
      output += props.children;
    } else if (Array.isArray(props.children)) {
      output += props.children.join('');
    }
  }
  
  output += `</${componentName}>`;
  frames.push(output);

  const instance: TestInstance = {
    lastFrame: () => frames[frames.length - 1],
    frames,
    unmount: () => {
      // No-op for mock
    },
    rerender: (newTree: React.ReactElement) => {
      // Simplified rerender
      const newComponentName = newTree.type?.toString() || 'Component';
      frames.push(`<${newComponentName}>`);
    },
    stdin: {
      write: (data: string) => {
        // No-op for mock
      },
    },
    stdout: { frames },
    stderr: process.stderr,
  };

  return instance;
}

// Re-export common Ink components for convenience
export { Box, Text };