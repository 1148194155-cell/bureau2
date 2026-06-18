/**
 * Docker Sandbox Manager
 *
 * Runs user code in an isolated Docker container.
 * - No network access
 * - Memory/CPU limits
 * - Read-only root filesystem (except /workspace and /tmp)
 * - Automatic cleanup on timeout
 * - Windows path translation for Docker bind mounts
 */
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCKER_IMAGE = config.sandbox.image;
const DEFAULT_TIMEOUT = config.sandbox.defaultTimeout;
const DEFAULT_MEMORY = config.sandbox.defaultMemory;
const DEFAULT_CPU = config.sandbox.defaultCpu;

/**
 * Translate a host path to Docker-compatible format for bind mounts.
 * On Windows, Docker requires paths like /c/Users/... instead of C:\Users\...
 */
function toDockerPath(hostPath) {
  const resolved = path.resolve(hostPath);
  if (process.platform === 'win32') {
    // C:\path\to\file -> /c/path/to/file
    return '/' + resolved.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, (_, letter) => letter.toLowerCase() + '/');
  }
  return resolved;
}

/**
 * Check if Docker is available on the host.
 * @returns {Promise<boolean>}
 */
export async function isDockerAvailable() {
  try {
    await execDocker(['info'], 3000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the sandbox Docker image.
 * @returns {Promise<void>}
 */
export async function buildSandboxImage() {
  const dockerDir = path.join(__dirname, '..', '..', 'docker');
  await execDocker(['build', '-t', DOCKER_IMAGE, dockerDir], 120_000);
}

/**
 * Run user code in a Docker sandbox.
 *
 * @param {object} params
 * @param {string} params.code - Code to execute
 * @param {string} [params.language] - Language of the code (default 'javascript')
 * @param {object} [params.input] - Input data passed to the code
 * @param {number} [params.timeout] - Max execution time in ms
 * @param {string} [params.memory] - Memory limit e.g. '256m'
 * @param {string} [params.cpu] - CPU limit e.g. '1.0'
 * @returns {Promise<object>} The execution result
 */
export async function runInSandbox(params = {}) {
  const { code, language, input, timeout, memory, cpu } = params;
  const effectiveTimeout = timeout || DEFAULT_TIMEOUT;
  const effectiveMemory = memory || DEFAULT_MEMORY;
  const effectiveCpu = cpu || DEFAULT_CPU;

  // Only JavaScript execution is supported in the sandbox container
  const lang = (language || 'javascript').toLowerCase();
  if (lang !== 'javascript' && lang !== 'js') {
    throw new Error(`Docker sandbox only supports JavaScript (detected: ${language}). For Python, use the built-in Python runner which does not require Docker.`);
  }

  // Create a temporary workspace
  const workspace = path.join(os.tmpdir(), `lc-sandbox-${randomUUID()}`);
  await fs.ensureDir(workspace);

  const codePath = path.join(workspace, 'code.js');
  const inputPath = path.join(workspace, 'input.json');
  const outputPath = path.join(workspace, 'output.json');

  try {
    // Write code — wrap in module.exports if it's an expression
    const wrappedCode = wrapUserCode(code, lang);
    await fs.writeFile(codePath, wrappedCode, 'utf8');
    await fs.writeFile(inputPath, JSON.stringify(input), 'utf8');

    // Build docker run arguments
    const timeoutSeconds = Math.ceil(effectiveTimeout / 1000);
    const args = [
      'run',
      '--rm',
      '--network', 'none',                    // No network access
      '--memory', effectiveMemory,
      '--cpus', effectiveCpu,
      '--read-only',                           // Read-only root FS
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '--mount', `type=bind,source=${toDockerPath(workspace)},target=/workspace,readonly=false`,
      `--stop-timeout=${Math.max(timeoutSeconds, 2)}`,
      DOCKER_IMAGE,
    ];

    // We use a timeout wrapper for the Docker process itself
    const dockerTimeout = effectiveTimeout + 10_000; // give Docker extra time to pull/start

    await execDocker(args, dockerTimeout);

    // Read output
    if (!(await fs.pathExists(outputPath))) {
      throw new Error('Sandbox did not produce output.json — the container may have crashed');
    }

    const outputRaw = await fs.readFile(outputPath, 'utf8');
    let output;
    try {
      output = JSON.parse(outputRaw);
    } catch {
      output = { output: outputRaw };
    }

    if (output.__error) {
      throw new Error(output.__error);
    }

    return output;
  } finally {
    // Clean up workspace
    try { await fs.remove(workspace); } catch {}
  }
}

/**
 * Wrap user code so it can be required by the sandbox runner.
 * If the code looks like a function/statement block, wrap it as a function body.
 * Otherwise, treat it as a value expression.
 */
function wrapUserCode(code) {
  const trimmed = code.trim();

  // Already a complete module.exports or function
  if (trimmed.startsWith('module.exports') || trimmed.startsWith('async function') || trimmed.startsWith('function ')) {
    return trimmed;
  }

  // Try to detect if it's a statement block with return
  if (trimmed.includes('return ')) {
    return `module.exports = async function(input) {\n${trimmed}\n};`;
  }

  // Expression like "input.a + input.b" or "{ sum: input.a + input.b }"
  return `module.exports = async function(input) {\n  return ${trimmed};\n};`;
}

/**
 * Execute a docker CLI command and return stdout.
 * @param {string[]} args
 * @param {number} timeout
 * @returns {Promise<string>}
 */
function execDocker(args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Docker command timed out after ${timeout}ms`));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Docker exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn docker: ${err.message}`));
    });
  });
}

export default { isDockerAvailable, buildSandboxImage, runInSandbox };
