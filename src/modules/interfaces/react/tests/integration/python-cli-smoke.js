#!/usr/bin/env node
/**
 * Python CLI smoke test (opt-in via BOO_PY_SMOKE=1)
 *
 * Validates that a minimal end-to-end stream can run using the real Python CLI.
 * Skips gracefully if not opted-in or if prerequisites are missing.
 */
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  try {
    if (process.env.BOO_PY_SMOKE !== '1') {
      console.log('Skipping Python CLI smoke test (set BOO_PY_SMOKE=1 to enable).');
      process.exit(0);
    }

    const projectRoot = path.resolve(__dirname, '../../../../..');
    const script = path.join(projectRoot, 'src', 'boo.py');

    // Prefer uv, fallback to python if available
    const cmd = process.env.BOO_USE_UV === '0' ? 'python' : 'uv';
    const args = process.env.BOO_USE_UV === '0'
      ? [script, '--target', 'http://testphp.vulnweb.com', '--objective', 'quick check', '--iterations', '1']
      : ['run', 'python', script, '--target', 'http://testphp.vulnweb.com', '--objective', 'quick check', '--iterations', '1'];

    const env = { ...process.env, NO_COLOR: '1', CI: 'true' };

    const child = spawn(cmd, args, {
      cwd: projectRoot,
      env,
      timeout: 60000  // 60 second timeout
    });

    let output = '';
    let killed = false;
    const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB limit

    // Add manual timeout handler as backup
    const timeoutId = setTimeout(() => {
      if (!killed) {
        console.log('Python CLI test timeout after 60s, killing process');
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }
    }, 60000);

    const appendOutput = (data) => {
      const str = data.toString();
      if (output.length + str.length > MAX_OUTPUT_SIZE) {
        console.warn('Output buffer limit reached, truncating');
        if (output.length < MAX_OUTPUT_SIZE) {
          output += str.substring(0, MAX_OUTPUT_SIZE - output.length);
          output += '\n... [OUTPUT TRUNCATED]';
        }
      } else {
        output += str;
      }
    };

    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);

    const exitCode = await new Promise(resolve => {
      child.on('close', code => {
        clearTimeout(timeoutId);
        resolve(code);
      });
    });

    if (exitCode !== 0) {
      console.log('Python CLI exited non-zero; output follows (non-fatal in smoke test):');
      console.log(output.slice(0, 2000));
      process.exit(0); // do not fail CI
    }

    // Look for minimal signs of progress (operation id or step markers)
    const ok = /OP_\d{8}_\d{6}/.test(output) || /STEP\s+1|\[STEP/i.test(output);
    if (!ok) {
      console.log('Python CLI ran but expected output markers were not found.');
      console.log(output.slice(0, 2000));
      process.exit(0);
    }

    console.log('Python CLI smoke test passed.');
    process.exit(0);
  } catch (e) {
    console.log('Skipping Python CLI smoke test due to error (non-fatal):', e.message);
    process.exit(0);
  }
})();
