/**
 * Sandbox runner — executed INSIDE the Docker container.
 *
 * 1. Reads /workspace/input.json   → the input data object
 * 2. Requires /workspace/code.js   → user's code (should export a function)
 * 3. Calls the exported function with (input)
 * 4. Writes result to /workspace/output.json
 *
 * On any error, writes { __error: message } to output.json and exits 0
 * (so Docker doesn't treat it as a crash — the caller checks output.json).
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = '/workspace/input.json';
const CODE_PATH = '/workspace/code.js';
const OUTPUT_PATH = '/workspace/output.json';

function fail(message) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ __error: message }), 'utf8');
  process.exit(0);
}

(async () => {
  // 1. Read input
  let input;
  try {
    const raw = fs.readFileSync(INPUT_PATH, 'utf8');
    input = JSON.parse(raw);
  } catch (err) {
    fail('Failed to read/parse input.json: ' + err.message);
    return;
  }

  // 2. Load user code
  let fn;
  try {
    fn = require(CODE_PATH);
  } catch (err) {
    fail('Failed to load code.js: ' + err.message);
    return;
  }

  // 3. Execute
  let result;
  try {
    if (typeof fn === 'function') {
      result = await fn(input);
    } else if (typeof fn === 'object' && fn !== null && typeof fn.default === 'function') {
      result = await fn.default(input);
    } else {
      // Treat as plain value (e.g. the user just wrote `42` or `{x:1}`)
      result = fn;
    }
  } catch (err) {
    fail('Code execution error: ' + err.message);
    return;
  }

  // 4. Write output
  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result ?? null), 'utf8');
  } catch (err) {
    fail('Failed to write output.json: ' + err.message);
    return;
  }
})();
