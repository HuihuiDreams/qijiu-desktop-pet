'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_DIR = path.join(__dirname, '..', '..', '.github', 'workflows');

// 发布相关工作流共用的版本输入用例：Release Preflight 与 Build Installers 必须给出相同结果
const VALID_VERSION_INPUTS = [
  ['1.0.0', '1.0.0'],
  ['v1.0.0', '1.0.0'],
  ['go-v1.0.0', '1.0.0'],
  ['  go-v1.2.3  ', '1.2.3'],
  ['\t v1.2.3\t ', '1.2.3'],
];

const INVALID_VERSION_INPUTS = [
  'go-vv1.0.0',
  'vgo-v1.0.0',
  'go-vgo-v1.0.0',
  'go-v 1.0.0',
  '1. 0.0',
  'v1.0.0-beta.1',
  'go-v1.0.0+build.1',
  'go-1.0.0',
  '   ',
  '',
];

/**
 * Reads a workflow file and splits it into the top-level header and per-job bodies.
 * Comment lines are dropped so assertions only see real configuration.
 * @param {string} fileName
 * @returns {{ header: string, jobs: Record<string, string> }}
 */
function loadWorkflow(fileName) {
  const text = fs.readFileSync(path.join(WORKFLOW_DIR, fileName), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*#.*$/gm, '');
  const jobsIndex = text.indexOf('\njobs:\n');
  assert.ok(jobsIndex >= 0, `${fileName} must define jobs`);
  const header = text.slice(0, jobsIndex);
  const body = text.slice(jobsIndex + '\njobs:\n'.length);
  const jobs = {};
  let current = null;
  for (const line of body.split('\n')) {
    const match = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (match) {
      current = match[1];
      jobs[current] = [];
    } else if (current) {
      jobs[current].push(line);
    }
  }
  return { header, jobs: Object.fromEntries(Object.entries(jobs).map(([name, lines]) => [name, lines.join('\n')])) };
}

/**
 * Returns the dedented multiline `run: |` script of the named step inside a job body.
 * @param {string} jobBody
 * @param {string} stepName
 * @returns {string}
 */
function extractStepRunBlock(jobBody, stepName) {
  const lines = jobBody.split('\n');
  const escapedName = stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stepPattern = new RegExp(`^(\\s*)-\\s+name:\\s*${escapedName}\\s*$`);
  const stepIndex = lines.findIndex((line) => stepPattern.test(line));
  assert.ok(stepIndex >= 0, `Step "${stepName}" must exist`);

  const stepIndent = stepPattern.exec(lines[stepIndex])[1].length;
  let runIndent = -1;
  let runStart = -1;

  for (let i = stepIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= stepIndent) break;
    const runMatch = line.match(/^(\s*)run:\s*\|-?\s*$/);
    if (runMatch) {
      runIndent = runMatch[1].length;
      runStart = i + 1;
      break;
    }
  }

  assert.ok(runStart >= 0, `Step "${stepName}" must define a multiline run block`);

  const blockLines = [];
  for (let i = runStart; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      blockLines.push('');
      continue;
    }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= runIndent) break;
    blockLines.push(line);
  }

  while (blockLines.length > 0 && blockLines[blockLines.length - 1] === '') {
    blockLines.pop();
  }

  const minIndent = blockLines
    .filter((line) => line.trim() !== '')
    .reduce((min, line) => Math.min(min, line.match(/^\s*/)[0].length), Infinity);
  assert.ok(Number.isFinite(minIndent), `Step "${stepName}" run block must not be empty`);

  return blockLines.map((line) => (line === '' ? '' : line.slice(minIndent))).join('\n');
}

/**
 * Builds the child env for running a workflow bash snippet.
 * @param {Record<string, string>} vars
 * @param {string[]} [pathVars] names in `vars` whose values are file paths
 */
function buildBashEnv(vars, pathVars = []) {
  const env = { ...process.env, ...vars };
  if (process.platform === 'win32') {
    // 若 Windows 上的 bash 解析到 WSL，必须经 WSLENV 透传这些变量；
    // 文件路径还要加 p 标记，把 C:\... 转成 /mnt/c/...，否则 WSL 会把它当成相对文件名
    const forwarded = Object.keys(vars)
      .map((name) => `${name}/${pathVars.includes(name) ? 'up' : 'u'}`)
      .join(':');
    env.WSLENV = process.env.WSLENV ? `${process.env.WSLENV}:${forwarded}` : forwarded;
  }
  return env;
}

/** True when `bash` exists and receives env vars from this process (WSL included). */
function bashForwardsEnv() {
  const res = spawnSync('bash', ['-c', 'printf "%s" "${INPUT_VERSION}"'], {
    env: buildBashEnv({ INPUT_VERSION: 'probe' }),
    encoding: 'utf8',
  });
  return !res.error && res.status === 0 && res.stdout === 'probe';
}

module.exports = {
  VALID_VERSION_INPUTS,
  INVALID_VERSION_INPUTS,
  loadWorkflow,
  extractStepRunBlock,
  buildBashEnv,
  bashForwardsEnv,
};
