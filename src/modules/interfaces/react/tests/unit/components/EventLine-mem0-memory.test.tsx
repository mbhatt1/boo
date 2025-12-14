/**
 * Render mem0_memory store/retrieve headers to verify formatting and content previews
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import React from 'react';
import { render } from '../../helpers/inkTestHelper.js';

async function importEventLine() {
  jest.resetModules();
  const mod: any = await import('../../../src/components/StreamDisplay.tsx');
  return mod.EventLine as React.FC<any>;
}

/**
 * These tests require ink-testing-library compatibility with ink v4+. Currently ink v4.4.1 is not
 * compatible with ink-testing-library v4.0.0. These tests validate component rendering but are
 * skipped until the dependency compatibility is resolved.
 */
describe.skip('EventLine mem0_memory formatting', () => {
  afterEach(() => jest.resetModules());

  it('shows store action with content preview', async () => {
    const EventLine = await importEventLine();
    const event = {
      type: 'tool_start',
      tool_name: 'mem0_memory',
      tool_input: { action: 'store', content: 'note: sql injection vector at /search' }
    };
    const { lastFrame } = render(React.createElement(EventLine, { event, animationsEnabled: false }));
    const out = lastFrame();
    expect(out).toMatch(/tool:\s+mem0_memory/i);
    expect(out).toMatch(/action:\s+storing/i);
    expect(out).toMatch(/content|query/i);
    expect(out).toMatch(/sql injection/i);
  });

  it('shows retrieve action with query preview', async () => {
    const EventLine = await importEventLine();
    const event = {
      type: 'tool_start',
      tool_name: 'mem0_memory',
      tool_input: { action: 'retrieve', query: 'find: injection' }
    };
    const { lastFrame } = render(React.createElement(EventLine, { event, animationsEnabled: false }));
    const out = lastFrame();
    expect(out).toMatch(/tool:\s+mem0_memory/i);
    expect(out).toMatch(/action:\s+retrieving/i);
    expect(out).toMatch(/find: injection/i);
  });
});
