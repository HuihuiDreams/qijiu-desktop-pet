const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  VALID_VERSION_INPUTS,
  INVALID_VERSION_INPUTS,
  loadWorkflow,
  extractStepRunBlock,
  buildBashEnv,
  bashForwardsEnv,
} = require('./helpers/workflowScripts');

const { jobs } = loadWorkflow('build-installer.yml');
const resolveScript = extractStepRunBlock(jobs['create-release-tag'], 'Resolve release tag');

test('build installers parses the version input in exactly one step and shares the tag as a job output', () => {
  const parsers = Object.entries(jobs).filter(([, body]) => body.includes('inputs.version')).map(([name]) => name);
  assert.deepEqual(parsers, ['create-release-tag']);
  assert.equal(jobs['create-release-tag'].split('inputs.version').length - 1, 1, 'only the resolve step may read inputs.version');
  assert.match(jobs['create-release-tag'], /outputs:\n {6}tag: \$\{\{ steps\.resolve-tag\.outputs\.tag \}\}/);
  // tag 推送时也要运行 create-release-tag，否则构建 job 拿不到解析后的 tag
  assert.doesNotMatch(jobs['create-release-tag'], /^ {4}if:/m);
  for (const name of ['build-windows-installer', 'build-macos-installer']) {
    assert.match(jobs[name], /needs: create-release-tag/);
    assert.match(jobs[name], /if: needs\.create-release-tag\.result == 'success'/);
    assert.match(jobs[name], /RELEASE_TAG: \$\{\{ needs\.create-release-tag\.outputs\.tag \}\}/, `${name} must use the resolved tag`);
  }
});

test('on Windows the bash env forwards GITHUB_OUTPUT to WSL as a translated path', (t) => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalWslEnv = process.env.WSLENV;
  t.after(() => {
    Object.defineProperty(process, 'platform', platform);
    if (originalWslEnv === undefined) delete process.env.WSLENV;
    else process.env.WSLENV = originalWslEnv;
  });
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
  delete process.env.WSLENV;

  const env = buildBashEnv({ INPUT_VERSION: '1.0.0', GITHUB_OUTPUT: 'C:\\Temp\\github_output' }, ['GITHUB_OUTPUT']);
  assert.equal(env.WSLENV, 'INPUT_VERSION/u:GITHUB_OUTPUT/up');

  process.env.WSLENV = 'EXISTING/u';
  assert.equal(buildBashEnv({ REF_NAME: 'go-v1.0.0' }).WSLENV, 'EXISTING/u:REF_NAME/u');
});

function runResolve(t, vars) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-installer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outputFile = path.join(dir, 'github_output');
  fs.writeFileSync(outputFile, '');
  const res = spawnSync('bash', ['-c', resolveScript], {
    env: buildBashEnv({ ...vars, GITHUB_OUTPUT: outputFile }, ['GITHUB_OUTPUT']),
    encoding: 'utf8',
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, output: fs.readFileSync(outputFile, 'utf8') };
}

test('Resolve release tag accepts the same manual inputs as Release Preflight', (t) => {
  if (!bashForwardsEnv()) {
    t.skip('bash with env forwarding is not available on this host');
    return;
  }

  // 手动触发时 github.ref_name 是分支名，不能被当作版本回退
  const REF_NAME = 'cp/crowley-aziraphale';
  for (const [input, expected] of VALID_VERSION_INPUTS) {
    const res = runResolve(t, { EVENT_NAME: 'workflow_dispatch', INPUT_VERSION: input, REF_NAME });
    assert.equal(res.status, 0, `Expected '${input}' to succeed, got stderr: ${res.stderr}`);
    assert.equal(res.output, `tag=go-v${expected}\n`);
  }

  for (const invalidInput of INVALID_VERSION_INPUTS) {
    const res = runResolve(t, { EVENT_NAME: 'workflow_dispatch', INPUT_VERSION: invalidInput, REF_NAME });
    assert.notEqual(res.status, 0, `Expected '${invalidInput}' to be rejected`);
    assert.equal(res.output, '', `Rejected '${invalidInput}' must not write a tag output`);
  }
});

test('Resolve release tag rejects an empty manual input even when run on a go-v tag ref', (t) => {
  if (!bashForwardsEnv()) {
    t.skip('bash with env forwarding is not available on this host');
    return;
  }

  // gh workflow run --ref go-v1.2.3 -f version= 时 ref_name 恰好是合法 tag，也不能被当作输入版本
  for (const refName of ['cp/crowley-aziraphale', 'go-v1.2.3']) {
    const res = runResolve(t, { EVENT_NAME: 'workflow_dispatch', INPUT_VERSION: '', REF_NAME: refName });
    assert.notEqual(res.status, 0, `Expected empty input on '${refName}' to be rejected`);
    assert.equal(res.output, '');
    assert.match(res.stdout, /got ''\./, 'the error must report the empty input, not the ref name');
  }
});

test('Resolve release tag uses the pushed go-v tag on a tag push', (t) => {
  if (!bashForwardsEnv()) {
    t.skip('bash with env forwarding is not available on this host');
    return;
  }

  const pushed = runResolve(t, { EVENT_NAME: 'push', INPUT_VERSION: '', REF_NAME: 'go-v1.2.3' });
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.equal(pushed.output, 'tag=go-v1.2.3\n');

  for (const refName of ['go-v1.2.3-rc.1', 'go-vfoo']) {
    const res = runResolve(t, { EVENT_NAME: 'push', INPUT_VERSION: '', REF_NAME: refName });
    assert.notEqual(res.status, 0, `Expected pushed tag '${refName}' to be rejected`);
    assert.equal(res.output, '');
  }
});
