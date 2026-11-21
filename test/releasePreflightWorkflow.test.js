const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'release-preflight.yml'),
  'utf8',
).replace(/\r\n/g, '\n').replace(/^\s*#.*$/gm, ''); // 注释里会提到 contents: write，断言只看实际配置

function splitTopLevelAndJobs(text) {
  const jobsIndex = text.indexOf('\njobs:\n');
  assert.ok(jobsIndex >= 0, 'workflow must define jobs');
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

const { header, jobs } = splitTopLevelAndJobs(source);

test('release preflight defaults to a read-only token so pull_request jobs cannot write', () => {
  assert.match(header, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(header, /contents:\s*write/);
});

test('only the workflow_dispatch version sync job can write repository contents', () => {
  const writers = Object.entries(jobs).filter(([, body]) => /contents:\s*write/.test(body)).map(([name]) => name);
  assert.deepEqual(writers, ['sync-version']);
  assert.match(jobs['sync-version'], /if: github\.event_name == 'workflow_dispatch'/);
});

test('git push happens only in the sync-version job', () => {
  for (const [name, body] of Object.entries(jobs)) {
    if (name === 'sync-version') {
      assert.match(body, /^\s+git push$/m);
    } else {
      assert.doesNotMatch(body, /git push/, `${name} must not push`);
      assert.doesNotMatch(body, /git commit/, `${name} must not commit`);
    }
  }
});

test('the Windows preflight job waits for sync-version but still runs for pull requests', () => {
  assert.match(jobs.preflight, /needs: sync-version/);
  assert.match(
    jobs.preflight,
    /if: always\(\) && \(needs\.sync-version\.result == 'success' \|\| needs\.sync-version\.result == 'skipped'\)/,
  );
  assert.match(jobs.preflight, /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.ref \|\| '' \}\}/);
});

test('the macOS preflight job waits for sync-version and checks out the synced commit like Windows', () => {
  assert.match(jobs['preflight-mac'], /needs: sync-version/);
  assert.match(
    jobs['preflight-mac'],
    /if: always\(\) && \(needs\.sync-version\.result == 'success' \|\| needs\.sync-version\.result == 'skipped'\)/,
  );
  assert.match(jobs['preflight-mac'], /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.ref \|\| '' \}\}/);
});

test('the Windows and macOS preflight jobs both run the integration tests', () => {
  assert.match(jobs.preflight, /run: npm run test:integration/);
  assert.match(jobs['preflight-mac'], /run: npm run test:integration/);
});

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

function buildBashEnv(inputVersion) {
  const env = { ...process.env, INPUT_VERSION: inputVersion };
  if (process.platform === 'win32') {
    // 若 Windows 上的 bash 解析到 WSL，必须经 WSLENV 透传 INPUT_VERSION
    env.WSLENV = process.env.WSLENV ? `${process.env.WSLENV}:INPUT_VERSION/u` : 'INPUT_VERSION/u';
  }
  return env;
}

function encodePowerShellCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function findPowerShellExecutable() {
  const candidates = process.platform === 'win32' ? ['pwsh', 'powershell.exe'] : ['pwsh'];
  const probe = encodePowerShellCommand('[Console]::Write($env:INPUT_VERSION)');
  for (const exe of candidates) {
    const res = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', probe], {
      env: { ...process.env, INPUT_VERSION: 'probe' },
      encoding: 'utf8',
    });
    if (!res.error && res.status === 0 && res.stdout === 'probe') {
      return exe;
    }
  }
  return null;
}

test('sync-version bash snippet normalizes valid versions and rejects invalid or spaced ones', (t) => {
  const syncScript = extractStepRunBlock(jobs['sync-version'], 'Sync package versions with the requested release');
  const cutoff = syncScript.indexOf('\nPACKAGE_VERSION=');
  assert.ok(cutoff > 0, 'sync-version script must validate the input before reading package.json');
  const snippet = `${syncScript.slice(0, cutoff)}\nprintf '%s' "\${VERSION}"`;

  const bashCheck = spawnSync('bash', ['-c', 'printf "%s" "${INPUT_VERSION}"'], {
    env: buildBashEnv('probe'),
    encoding: 'utf8',
  });
  if (bashCheck.error || bashCheck.status !== 0 || bashCheck.stdout !== 'probe') {
    t.skip('bash with INPUT_VERSION env forwarding is not available on this host');
    return;
  }

  for (const [input, expected] of VALID_VERSION_INPUTS) {
    const res = spawnSync('bash', ['-c', snippet], {
      env: buildBashEnv(input),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `Expected '${input}' to succeed, got stderr: ${res.stderr}`);
    assert.equal(res.stdout, expected);
  }

  for (const invalidInput of INVALID_VERSION_INPUTS) {
    const res = spawnSync('bash', ['-c', snippet], {
      env: buildBashEnv(invalidInput),
      encoding: 'utf8',
    });
    assert.notEqual(res.status, 0, `Expected '${invalidInput}' to be rejected`);
  }
});

test('Validate release metadata PowerShell snippet matches sync-version normalization rules', (t) => {
  const metaScript = extractStepRunBlock(jobs.preflight, 'Validate release metadata');
  const cutoff = metaScript.indexOf('\n$packageVersion =');
  assert.ok(cutoff > 0, 'Validate release metadata script must validate the input before reading package.json');
  const snippet = `${metaScript.slice(0, cutoff)}\n[Console]::Write($version)`;
  const encoded = encodePowerShellCommand(snippet);

  const psExe = findPowerShellExecutable();
  if (!psExe) {
    t.skip('PowerShell (pwsh / powershell.exe) is not available on this host');
    return;
  }

  for (const [input, expected] of VALID_VERSION_INPUTS) {
    const res = spawnSync(psExe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      env: { ...process.env, INPUT_VERSION: input },
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `Expected '${input}' to succeed, got stderr: ${res.stderr}`);
    assert.equal(res.stdout, expected);
  }

  for (const invalidInput of INVALID_VERSION_INPUTS) {
    const res = spawnSync(psExe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      env: { ...process.env, INPUT_VERSION: invalidInput },
      encoding: 'utf8',
    });
    assert.notEqual(res.status, 0, `Expected '${invalidInput}' to be rejected`);
  }
});
