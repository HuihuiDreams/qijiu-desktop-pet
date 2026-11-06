const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('Dependabot configuration for npm dependencies', async (t) => {
  const dependabotPath = path.join(repoRoot, '.github', 'dependabot.yml');

  await t.test('.github/dependabot.yml exists and has valid configuration', () => {
    assert.ok(fs.existsSync(dependabotPath), '.github/dependabot.yml must exist');
    const content = fs.readFileSync(dependabotPath, 'utf8');

    assert.match(content, /^version:\s*2/m, 'Dependabot configuration must use version 2');
    assert.match(content, /package-ecosystem:\s*["']?npm["']?/, 'Must configure npm package ecosystem');
    assert.match(content, /directory:\s*["']?\/["']?/, 'Must monitor root directory for npm updates');
    assert.match(content, /interval:\s*["']?weekly["']?/, 'Must run on a weekly schedule to avoid PR fatigue');
    assert.match(content, /open-pull-requests-limit:\s*\d+/, 'Must declare open-pull-requests-limit');
  });

  await t.test('no automatic merge or auto-approval workflows exist for Dependabot', () => {
    const workflowsDir = path.join(repoRoot, '.github', 'workflows');
    if (!fs.existsSync(workflowsDir)) return;

    const workflowFiles = fs.readdirSync(workflowsDir).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));
    for (const file of workflowFiles) {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      assert.doesNotMatch(
        content,
        /dependabot\s+merge|gh\s+pr\s+merge\s+--auto|enable-pull-request-automerge/i,
        `Workflow ${file} must not contain automatic merge steps for Dependabot`
      );
    }
  });
});
