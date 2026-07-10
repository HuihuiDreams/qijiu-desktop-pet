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
