const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('push.ps1 parses in Windows PowerShell', { skip: process.platform !== 'win32' }, () => {
  const parserScript = [
    '$errors = $null',
    "$null = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'push.ps1'), [ref]$null, [ref]$errors)",
    'if ($errors.Count -gt 0) { $errors | Format-List | Out-String | Write-Error; exit 1 }',
  ].join('; ');
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', parserScript,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

const fs = require('node:fs');
const os = require('node:os');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function createScratchRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-push-script-'));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Push Script Test']);
  git(repo, ['config', 'user.email', 'push-script@example.invalid']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n');
  git(repo, ['add', 'CHANGELOG.md']);
  git(repo, ['commit', '-q', '-m', 'chore: initial']);
  fs.appendFileSync(path.join(repo, 'CHANGELOG.md'), '\n## [Unreleased]\n- change\n');
  return repo;
}

function runPushScript(repo) {
  return spawnSync('bash', [path.join(ROOT, 'push.sh'), 'test: push script'], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, SKIP_SYNC_CHECK: '1' },
  });
}

test('push.sh exits non-zero when git commit fails', { skip: process.platform === 'win32' }, () => {
  const repo = createScratchRepo();
  try {
    const hookPath = path.join(repo, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hookPath, '#!/bin/sh\necho "rejected by test hook" >&2\nexit 1\n', { mode: 0o755 });

    const result = runPushScript(repo);

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Commit 失败/);
    assert.equal(git(repo, ['rev-list', '--count', 'HEAD']).trim(), '1', 'no commit may be created');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('push.sh exits non-zero when the push fails', { skip: process.platform === 'win32' }, () => {
  const repo = createScratchRepo();
  try {
    // 没有配置 origin，推送必然失败
    const result = runPushScript(repo);

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Push 失败/);
    assert.equal(git(repo, ['rev-list', '--count', 'HEAD']).trim(), '2', 'the local commit is kept');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('push.ps1 reports a failed push through its exit code', () => {
  const source = fs.readFileSync(path.join(ROOT, 'push.ps1'), 'utf8');
  assert.match(
    source,
    /Write-Host "Push failed\. Check network connectivity or Git conflicts\." -ForegroundColor Red\s*\n\s*exit 1/,
  );
});
