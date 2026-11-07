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

  await t.test('groups playwright and @playwright/* together with matching package.json semver ranges', () => {
    const dependabotContent = fs.readFileSync(dependabotPath, 'utf8');
    assert.match(
      dependabotContent,
      /groups:\s*[\r\n]+\s*playwright:\s*[\r\n]+\s*patterns:\s*[\r\n]+\s*-\s*["']?playwright["']?\s*[\r\n]+\s*-\s*["']?@playwright\/\*["']?/,
      '.github/dependabot.yml must define playwright group covering playwright and @playwright/*'
    );

    const packageJsonPath = path.join(repoRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.ok(packageJson.devDependencies?.playwright, 'package.json must declare devDependencies.playwright');
    assert.ok(packageJson.devDependencies?.['@playwright/test'], 'package.json must declare devDependencies["@playwright/test"]');
    assert.equal(
      packageJson.devDependencies.playwright,
      packageJson.devDependencies['@playwright/test'],
      'devDependencies.playwright and devDependencies["@playwright/test"] must declare matching semver ranges'
    );
  });

  // 注意：此测试是针对代码仓库内 GitHub Actions 工作流定义的低成本静态防回归哨兵，
  // 仅能验证工作流文本中未引入针对 Dependabot 的自动合并（auto-merge）或自动批准步骤。
  // 它无法校验 GitHub 平台仓库级的 "Allow auto-merge" 设置、Branch Rulesets 或环境审批保护；
  // 因此该测试作为工作流防回归检查保留，不能视作平台级自动合并禁用的全量安全证明。
  await t.test('no automatic merge or auto-approval workflow steps exist in repository workflows', () => {
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
