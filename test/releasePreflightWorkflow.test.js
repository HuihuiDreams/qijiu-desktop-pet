const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  VALID_VERSION_INPUTS,
  INVALID_VERSION_INPUTS,
  loadWorkflow,
  extractStepRunBlock,
  buildBashEnv,
  bashForwardsEnv,
} = require('./helpers/workflowScripts');

const { header, jobs } = loadWorkflow('release-preflight.yml');

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

  if (!bashForwardsEnv()) {
    t.skip('bash with INPUT_VERSION env forwarding is not available on this host');
    return;
  }

  for (const [input, expected] of VALID_VERSION_INPUTS) {
    const res = spawnSync('bash', ['-c', snippet], {
      env: buildBashEnv({ INPUT_VERSION: input }),
      encoding: 'utf8',
    });
    assert.equal(res.status, 0, `Expected '${input}' to succeed, got stderr: ${res.stderr}`);
    assert.equal(res.stdout, expected);
  }

  for (const invalidInput of INVALID_VERSION_INPUTS) {
    const res = spawnSync('bash', ['-c', snippet], {
      env: buildBashEnv({ INPUT_VERSION: invalidInput }),
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
