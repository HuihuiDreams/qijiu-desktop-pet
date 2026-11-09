const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createSanitizedChildEnv,
  runGit,
  filterDiffByFilePredicate,
  parseAddedChangelogSections,
  mergeChangelogEntries,
  classifyCommitHeuristic,
  evaluateCommitWithAi,
  extractPackageIdentity,
  applyPackageIdentity,
  applyPackageLockIdentity,
  formatSyncSummaryMarkdown,
  resolveCommitsToEvaluate,
  isCommitAlreadyOnBranch,
  syncCommitsToCp,
} = require('../scripts/sync-to-cp.js');

const repoRoot = path.resolve(__dirname, '..');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'author@example.com',
      GIT_COMMITTER_NAME: 'Test Committer',
      GIT_COMMITTER_EMAIL: 'committer@example.com',
    },
  }).trim();
}

test('authenticated git keeps credentials out of command failures', () => {
    const token = 'fake-test-token';
    const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
    const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'test.existing', GIT_CONFIG_VALUE_0: 'preserved' };
    assert.equal(runGit(['config', '--get', 'test.existing'], { cwd: repoRoot, env, authToken: token }), 'preserved');
    assert.equal(runGit(['config', '--get', 'http.https://github.com/.extraheader'], { cwd: repoRoot, env, authToken: token }), `AUTHORIZATION: basic ${encoded}`);
    assert.throws(() => runGit(['--invalid-option'], { cwd: repoRoot, env, authToken: token }), (error) => {
      assert.doesNotMatch(String(error), new RegExp(`${token}|${encoded}`));
      if (error.cmd) assert.doesNotMatch(error.cmd, new RegExp(`${token}|${encoded}`));
      return true;
    });
});

test('syncs the resolved merge result relative to the main branch', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-cp-merge-'));
  const repo = path.join(tmpBase, 'local');
  try {
    git(tmpBase, ['init', '--bare', path.join(tmpBase, 'remote.git')]);
    git(tmpBase, ['init', repo]);
    git(repo, ['remote', 'add', 'origin', path.join(tmpBase, 'remote.git')]);
    fs.writeFileSync(path.join(repo, 'shared.js'), 'base\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'base']);
    git(repo, ['branch', '-M', 'main']);
    git(repo, ['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(repo, 'shared.js'), 'feature\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'feature change']);
    git(repo, ['checkout', 'main']);
    fs.writeFileSync(path.join(repo, 'shared.js'), 'main\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'main change']);
    const before = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['push', 'origin', 'main:cp/crowley-aziraphale']);
    assert.throws(() => git(repo, ['merge', '--no-ff', 'feature', '-m', 'merge feature']));
    fs.writeFileSync(path.join(repo, 'shared.js'), 'resolved merge\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'merge feature']);
    const merge = git(repo, ['rev-parse', 'HEAD']);
    git(repo, ['fetch', 'origin']);

    assert.deepEqual(resolveCommitsToEvaluate({ cwd: repo, targetRef: 'origin/cp/crowley-aziraphale', beforeSha: before, afterSha: merge }), [merge]);
    const result = await syncCommitsToCp({
      repoRoot: repo, beforeSha: before, afterSha: merge, dryRun: false,
      installRunner: () => {}, testRunner: () => {},
    });
    assert.equal(result.syncedCount, 1);
    git(repo, ['fetch', 'origin']);
    assert.equal(git(repo, ['show', 'origin/cp/crowley-aziraphale:shared.js']), 'resolved merge');

    git(repo, ['checkout', '-b', 'private-feature']);
    fs.writeFileSync(path.join(repo, 'private.js'), 'private\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'private feature [skip-cp]']);
    git(repo, ['checkout', 'main']);
    git(repo, ['merge', '--no-ff', 'private-feature', '-m', 'merge private feature']);
    const privateMerge = git(repo, ['rev-parse', 'HEAD']);
    const skipped = await syncCommitsToCp({
      repoRoot: repo, beforeSha: merge, afterSha: privateMerge, dryRun: false,
      installRunner: () => {}, testRunner: () => {},
    });
    assert.equal(skipped.syncedCount, 0);
    assert.match(skipped.results[0].verdict, /explicit-skip/);
    assert.throws(() => git(repo, ['show', 'origin/cp/crowley-aziraphale:private.js']));
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('Sync Main to Good Omens workflow and script suite', async (t) => {
  await t.test('.github/workflows/sync-to-cp.yml exists and is properly configured', () => {
    const workflowPath = path.join(repoRoot, '.github', 'workflows', 'sync-to-cp.yml');
    assert.ok(fs.existsSync(workflowPath), '.github/workflows/sync-to-cp.yml must exist');

    const content = fs.readFileSync(workflowPath, 'utf8');
    assert.match(content, /on:\s*[\r\n]+\s*push:\s*[\r\n]+\s*branches:\s*[\r\n]+\s*-\s*main/, 'Must trigger on push to main');
    assert.match(content, /workflow_dispatch:/, 'Must support manual workflow_dispatch');
    assert.match(content, /permissions:\s*[\r\n]+\s*contents:\s*write\s*[\r\n]+\s*models:\s*read/, 'Must declare contents: write and models: read permissions for GitHub Models');
    assert.match(content, /concurrency:\s*[\r\n]+\s*group:\s*sync-to-cp-crowley-aziraphale/, 'Must serialize runs with concurrency group');
    assert.match(content, /timeout-minutes:\s*\d+/, 'Must configure job timeout-minutes');
    assert.match(content, /TARGET_BRANCH:\s*cp\/crowley-aziraphale/, 'Must target cp/crowley-aziraphale');
    assert.match(content, /SYNC_PUSH:\s*\$\{\{\s*!inputs\.dry_run\s*\}\}/, 'Must explicitly enable SYNC_PUSH in CI when not dry_run');
    assert.match(content, /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/, 'Must pass ephemeral GITHUB_TOKEN for GitHub Models');
    assert.match(content, /persist-credentials:\s*false/, 'Must not persist checkout credentials where npm scripts can read them');
    assert.match(content, /node\s+scripts\/sync-to-cp\.js/, 'Must invoke scripts/sync-to-cp.js');
  });

  await t.test('parseAddedChangelogSections extracts bullets even when ## [Unreleased] exceeds 100 lines', () => {
    const fillerLines = Array.from(
      { length: 110 },
      (_, idx) => ` - Existing feature line ${idx + 1}`
    );
    const longDiff = [
      'diff --git a/CHANGELOG.md b/CHANGELOG.md',
      '--- a/CHANGELOG.md',
      '+++ b/CHANGELOG.md',
      '@@ -1,130 +1,135 @@',
      ' # Changelog',
      ' ',
      ' ## [Unreleased]',
      ' ',
      ' ### Added',
      ...fillerLines,
      '+- **新增自动同步流水线 (`CP Auto-Sync Workflow`)**：支持从 main 自动同步通用提交。',
      ' ',
      ' ### Fixed',
      ' - Existing fix B',
      '+- 修复子窗口置顶闪烁问题：',
      '+  - 补充 `skipTransformProcessType: true`',
      '+  - 增加回归测试',
      ' ',
      ' ## [0.11.2] - 2026-10-23',
      ' ### Fixed',
      '+- Old release line that should not be treated as Unreleased',
    ].join('\n');

    const parsed = parseAddedChangelogSections(longDiff);
    assert.deepEqual(Object.keys(parsed), ['Added', 'Fixed']);
    assert.equal(parsed.Added.length, 1);
    assert.match(parsed.Added[0], /CP Auto-Sync Workflow/);
    assert.equal(parsed.Fixed.length, 1);
    assert.match(parsed.Fixed[0], /skipTransformProcessType: true/);
  });

  await t.test('mergeChangelogEntries merges into existing sections without duplicating headings', () => {
    const targetChangelog = [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '- **好兆头经典夜莺羁绊台词接入**：新增夜莺对白。',
      '',
      '### Fixed',
      '- 修复旧书店番茄钟动画。',
      '',
      '## [go-v1.0.0] - 2026-11-04',
      '',
      '### Added',
      '- 初始发布。',
    ].join('\n');

    const addedSections = {
      Fixed: ['- **子窗口置顶守卫协同**：修复 `keepPetWindowOnTop()` 覆盖问题。'],
      Security: ['- 升级 `undici` 至 7.30.2 修复上游安全通告。'],
    };

    const result = mergeChangelogEntries(targetChangelog, addedSections);
    assert.equal(result.modified, true);

    const fixedHeadings = result.content
      .split('\n')
      .filter((line) => line.trim() === '### Fixed');
    assert.equal(fixedHeadings.length, 1, 'Must never create duplicate ### Fixed headings');

    assert.match(result.content, /好兆头经典夜莺羁绊台词接入/);
    assert.match(result.content, /子窗口置顶守卫协同/);
    assert.match(result.content, /### Security[\r\n]+- 升级 `undici` 至 7\.30\.2/);

    const secondRun = mergeChangelogEntries(result.content, addedSections);
    assert.equal(secondRun.modified, false);
  });

  await t.test('classifyCommitHeuristic distinguishes universal fixes, future skins, and workflow self-commit', () => {
    const universalFix = classifyCommitHeuristic({
      subject: 'fix: coordinate sub-window z-order with keepPetWindowOnTop and prevent unpin flicker',
      body: '',
      files: ['src/main/windows/PetWindow.js', 'test/subWindowActivation.test.js', 'CHANGELOG.md'],
      codeDiff: '+  windowManager.getStatusWindow()?.moveTop();\n',
    });
    assert.equal(universalFix.applicable, true);
    assert.equal(universalFix.needsAiReview, false);

    // Regression for Issue 1: Workflow's own commit touches package.json (sensitive file) AND test/syncToCp.test.js
    // containing QiJiu branding fixtures (`com.deskpet.yueqi-shenjiu`, `七九爱宠`). Must NOT be false-positived!
    const multiFileSelfDiff = [
      'diff --git a/package.json b/package.json',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -18,3 +18,4 @@',
      '     "verify:signatures": "powershell -File scripts/verify-signatures.ps1",',
      '+    "sync:cp": "node scripts/sync-to-cp.js"',
      'diff --git a/test/syncToCp.test.js b/test/syncToCp.test.js',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/test/syncToCp.test.js',
      '@@ -0,0 +1,5 @@',
      '+const sample = {',
      '+  appId: "com.deskpet.yueqi-shenjiu",',
      '+  productName: "七九爱宠",',
      '+  description: "岳清源 & 沈清秋 桌面爱宠",',
      '+};',
    ].join('\n');

    const workflowSelfCommit = classifyCommitHeuristic({
      subject: 'feat(ci): add main-to-cp auto-sync workflow and script',
      body: '',
      files: [
        'scripts/sync-to-cp.js',
        'test/syncToCp.test.js',
        'package.json',
        'docs/git-workflow.md',
        'docs/structure.md',
        'CHANGELOG.md',
      ],
      codeDiff: multiFileSelfDiff,
    });
    assert.equal(
      workflowSelfCommit.applicable,
      true,
      'Workflow self-commit with package.json + test fixtures must be classified as applicable'
    );

    const explicitSkip = classifyCommitHeuristic({
      subject: 'docs: update qijiu release notes [skip-cp]',
      body: '',
      files: ['README.md', 'CHANGELOG.md'],
      codeDiff: '+some note',
    });
    assert.equal(explicitSkip.applicable, false);
    assert.equal(explicitSkip.category, 'explicit-skip');

    // Wildcard skin folder detection: both existing and any future skin directory under src/assets/<skinId>/
    const futureSkinAsset = classifyCommitHeuristic({
      subject: 'feat(skin): add new wedding_au skin sprites',
      body: '',
      files: ['src/assets/wedding_au/kiss.webp', 'CHANGELOG.md'],
      codeDiff: '',
    });
    assert.equal(futureSkinAsset.applicable, false);
    assert.equal(futureSkinAsset.category, 'cp-exclusive-files');

    // Shared font assets under src/assets/fonts/ should not be blocked as a skin directory
    const fontAsset = classifyCommitHeuristic({
      subject: 'feat(font): add shared subset font',
      body: '',
      files: ['src/assets/fonts/SharedFont.woff2', 'CHANGELOG.md'],
      codeDiff: '',
    });
    assert.equal(fontAsset.applicable, true);

    const cpBrandingInI18n = classifyCommitHeuristic({
      subject: 'feat(i18n): update tray title for QiJiu',
      body: '',
      files: ['src/data/i18n.js', 'CHANGELOG.md'],
      sensitiveDiff: '+  trayTitle: "七九爱宠 - 苍穹静修"',
    });
    assert.equal(cpBrandingInI18n.applicable, false);
    assert.equal(cpBrandingInI18n.category, 'cp-branding-diff');
    assert.equal(cpBrandingInI18n.needsAiReview, false);

    const workflowChange = classifyCommitHeuristic({
      subject: 'ci: bump actions',
      files: ['.github/workflows/release.yml'],
    });
    assert.equal(workflowChange.applicable, false);
    assert.equal(workflowChange.category, 'workflow-files');
  });

  await t.test('createSanitizedChildEnv strips sensitive tokens from child process environments', () => {
    const dirtyEnv = {
      PATH: '/usr/bin',
      NODE_ENV: 'test',
      GITHUB_TOKEN: 'ghs_secret_ephemeral_token',
      GH_TOKEN: 'ghp_secret',
    };
    const sanitized = createSanitizedChildEnv(dirtyEnv);
    assert.equal(sanitized.PATH, '/usr/bin');
    assert.equal(sanitized.GITHUB_TOKEN, undefined);
    assert.equal(sanitized.GH_TOKEN, undefined);
  });

  await t.test('evaluateCommitWithAi supports GitHub Models via GITHUB_TOKEN only', async () => {
    const noKeyResult = await evaluateCommitWithAi({
      subject: 'fix: window bounds',
      files: ['src/main/DisplayService.js'],
      env: {},
    });
    assert.equal(noKeyResult.evaluated, false);

    let ghUrl = '';
    let ghHeaders = {};
    let ghBody = null;
    const githubModelsResult = await evaluateCommitWithAi({
      subject: 'fix(ui): dialog bubble top flip',
      files: ['src/ui/DialogBubble.js'],
      codeDiff: '+ if (pet.y < 65) flip = true;',
      env: { GITHUB_TOKEN: 'ghs_ephemeral_token' },
      fetchImpl: async (url, opts) => {
        ghUrl = url;
        ghHeaders = opts.headers;
        ghBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    applicable: true,
                    reason: '通用气泡翻转修复\n第二行也会被合成为单行',
                  }),
                },
              },
            ],
          }),
        };
      },
    });
    assert.equal(githubModelsResult.evaluated, true);
    assert.equal(githubModelsResult.applicable, true);
    assert.equal(githubModelsResult.model, 'openai/gpt-4o-mini');
    assert.equal(ghUrl, 'https://models.github.ai/inference/chat/completions');
    assert.equal(ghHeaders.Authorization, 'Bearer ghs_ephemeral_token');
    assert.match(ghBody.messages[1].content, /<untrusted_commit_data>/, 'Must wrap untrusted commit content in isolation tags');
    assert.doesNotMatch(githubModelsResult.reason, /\n/, 'Must sanitize newlines in AI reason');
  });

  await t.test('package.json and package-lock.json identity helpers preserve Good Omens metadata', () => {
    const cpPkgSample = JSON.stringify(
      {
        name: 'good-omens-desktop-pet',
        version: '1.0.0',
        description: 'Good Omens Desktop Pet',
        dependencies: { 'electron-store': '^12.0.0' },
        build: {
          appId: 'com.deskpet.good-omens',
          productName: 'GoodOmensDeskPet',
          artifactName: 'good-omens-pet-setup-${version}.${ext}',
          mac: { artifactName: 'good-omens-pet-setup-${version}-${arch}.${ext}' },
          nsis: { shortcutName: '好兆头桌宠', uninstallDisplayName: '好兆头桌宠' },
          publish: [{ provider: 'github', owner: 'HuihuiDreams', repo: 'good-omens-desktop-pet' }],
        },
      },
      null,
      2
    );

    const mainUpdatedPkgSample = JSON.stringify(
      {
        name: 'desktop-pet',
        version: '0.11.2',
        description: '岳清源 & 沈清秋 桌面爱宠',
        dependencies: { 'electron-store': '^12.0.1' },
        build: {
          appId: 'com.deskpet.yueqi-shenjiu',
          productName: '七九爱宠',
          artifactName: 'desktop-pet-setup-${version}.${ext}',
          mac: { artifactName: 'desktop-pet-setup-${version}-${arch}.${ext}' },
          nsis: { shortcutName: '七九爱宠', uninstallDisplayName: '七九爱宠' },
          publish: [{ provider: 'github', owner: 'HuihuiDreams', repo: 'qijiu-desktop-pet' }],
        },
      },
      null,
      2
    );

    const cpIdentity = extractPackageIdentity(cpPkgSample);
    const restoredPkg = JSON.parse(applyPackageIdentity(mainUpdatedPkgSample, cpIdentity));

    assert.equal(restoredPkg.name, 'good-omens-desktop-pet');
    assert.equal(restoredPkg.version, '1.0.0');
    assert.equal(restoredPkg.dependencies['electron-store'], '^12.0.1');
    assert.equal(restoredPkg.build.appId, 'com.deskpet.good-omens');
    assert.equal(restoredPkg.build.productName, 'GoodOmensDeskPet');
    assert.equal(restoredPkg.build.publish[0].repo, 'good-omens-desktop-pet');

    const lockSample = JSON.stringify(
      {
        name: 'desktop-pet',
        version: '0.11.2',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'desktop-pet',
            version: '0.11.2',
          },
        },
      },
      null,
      2
    );
    const restoredLock = JSON.parse(applyPackageLockIdentity(lockSample, cpIdentity));
    assert.equal(restoredLock.name, 'good-omens-desktop-pet');
    assert.equal(restoredLock.version, '1.0.0');
    assert.equal(restoredLock.packages[''].name, 'good-omens-desktop-pet');
    assert.equal(restoredLock.packages[''].version, '1.0.0');
  });

  await t.test('git orchestration integration: CHANGELOG conflict merge, code conflict rollback, dep identity preservation, and missed-run recovery', async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-to-cp-integ-'));
    const bareRemote = path.join(tmpBase, 'remote.git');
    const localRepo = path.join(tmpBase, 'local');

    try {
      git(tmpBase, ['init', '--bare', bareRemote]);
      git(tmpBase, ['init', localRepo]);
      git(localRepo, ['remote', 'add', 'origin', bareRemote]);

      // Base commit shared by main and cp/crowley-aziraphale
      fs.mkdirSync(path.join(localRepo, 'src'), { recursive: true });
      fs.writeFileSync(path.join(localRepo, 'src', 'app.js'), 'const a = 1;\nconst b = 2;\n');
      fs.writeFileSync(
        path.join(localRepo, 'package.json'),
        `${JSON.stringify(
          {
            name: 'desktop-pet',
            version: '0.11.2',
            description: 'QiJiu Pet',
            dependencies: { 'electron-log': '^5.4.3' },
            build: {
              appId: 'com.deskpet.yueqi-shenjiu',
              productName: '七九爱宠',
              artifactName: 'desktop-pet-${version}.${ext}',
            },
          },
          null,
          2
        )}\n`
      );
      fs.writeFileSync(
        path.join(localRepo, 'package-lock.json'),
        `${JSON.stringify(
          {
            name: 'desktop-pet',
            version: '0.11.2',
            lockfileVersion: 3,
            packages: {
              '': {
                name: 'desktop-pet',
                version: '0.11.2',
                dependencies: { 'electron-log': '^5.4.3' },
              },
            },
          },
          null,
          2
        )}\n`
      );
      fs.writeFileSync(
        path.join(localRepo, 'CHANGELOG.md'),
        [
          '# Changelog',
          '',
          '## [Unreleased]',
          '',
          '### Fixed',
          '- Base fix.',
          '',
          '## [0.11.2] - 2026-10-23',
          '### Added',
          '- Old release.',
          '',
        ].join('\n')
      );
      git(localRepo, ['add', '.']);
      git(localRepo, ['commit', '-m', 'chore: initial base']);
      git(localRepo, ['branch', '-M', 'main']);
      git(localRepo, ['push', '-u', 'origin', 'main']);

      // Create cp/crowley-aziraphale with diverged CHANGELOG.md, package identity, and line 1 of src/app.js
      git(localRepo, ['checkout', '-b', 'cp/crowley-aziraphale']);
      fs.writeFileSync(path.join(localRepo, 'src', 'app.js'), 'const a = 999; // CP custom line 1\nconst b = 2;\n');
      fs.writeFileSync(
        path.join(localRepo, 'package.json'),
        `${JSON.stringify(
          {
            name: 'good-omens-desktop-pet',
            version: '1.0.0',
            description: 'Good Omens Pet',
            dependencies: { 'electron-log': '^5.4.3' },
            build: {
              appId: 'com.deskpet.good-omens',
              productName: 'GoodOmensDeskPet',
              artifactName: 'good-omens-${version}.${ext}',
            },
          },
          null,
          2
        )}\n`
      );
      fs.writeFileSync(
        path.join(localRepo, 'package-lock.json'),
        `${JSON.stringify(
          {
            name: 'good-omens-desktop-pet',
            version: '1.0.0',
            lockfileVersion: 3,
            packages: {
              '': {
                name: 'good-omens-desktop-pet',
                version: '1.0.0',
                dependencies: { 'electron-log': '^5.4.3' },
              },
            },
          },
          null,
          2
        )}\n`
      );
      fs.writeFileSync(
        path.join(localRepo, 'CHANGELOG.md'),
        [
          '# Changelog',
          '',
          '## [Unreleased]',
          '',
          '### Fixed',
          '- Good Omens exclusive feather fix.',
          '',
          '## [go-v1.0.0] - 2026-11-04',
          '### Added',
          '- Good Omens launch.',
          '',
        ].join('\n')
      );
      git(localRepo, ['add', '.']);
      git(localRepo, ['commit', '-m', 'feat: good omens baseline']);
      git(localRepo, ['push', '-u', 'origin', 'cp/crowley-aziraphale']);

      // Switch back to main and create 4 commits:
      // Commit 1: Universal feature adding src/feature.js + CHANGELOG entry (already synced to anchor findLastSyncedMainCommit)
      git(localRepo, ['checkout', 'main']);
      fs.writeFileSync(path.join(localRepo, 'src', 'feature.js'), 'module.exports = "v1";\n');
      fs.writeFileSync(
        path.join(localRepo, 'CHANGELOG.md'),
        [
          '# Changelog',
          '',
          '## [Unreleased]',
          '',
          '### Fixed',
          '- Base fix.',
          '- Synced anchor fix.',
          '',
          '## [0.11.2] - 2026-10-23',
          '### Added',
          '- Old release.',
          '',
        ].join('\n')
      );
      git(localRepo, ['add', '.']);
      git(localRepo, ['commit', '-m', 'fix: anchor commit']);
      const anchorSha = git(localRepo, ['rev-parse', 'HEAD']);

      // Sync Commit 1 first so cp/crowley-aziraphale has a `(cherry picked from commit <anchorSha>)` marker
      const sourceModules = path.join(localRepo, 'node_modules');
      fs.mkdirSync(sourceModules);
      fs.writeFileSync(path.join(sourceModules, 'identity'), 'main');
      let installedFromTarget = false;
      const firstSync = await syncCommitsToCp({
        repoRoot: localRepo,
        targetBranch: 'cp/crowley-aziraphale',
        manualCommitsArg: anchorSha,
        dryRun: false,
        testRunner: (cwd) => {
          assert.equal(fs.readFileSync(path.join(cwd, 'node_modules', 'identity'), 'utf8'), 'good-omens-desktop-pet');
        },
        installRunner: (cwd) => {
          installedFromTarget = true;
          assert.equal(fs.existsSync(path.join(cwd, 'node_modules')), false);
          const name = JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'), 'utf8')).name;
          fs.mkdirSync(path.join(cwd, 'node_modules'));
          fs.writeFileSync(path.join(cwd, 'node_modules', 'identity'), name);
        },
      });
      assert.equal(installedFromTarget, true, 'A code-only commit must install the target lockfile before tests');
      fs.rmSync(sourceModules, { recursive: true, force: true });
      assert.equal(firstSync.syncedCount, 1);
      assert.equal(git(localRepo, ['rev-parse', '--abbrev-ref', 'HEAD']), 'main', 'Main working tree must stay on main');

      // Now create 3 new commits on main:
      // Commit 2 (missed in beforeSha..afterSha window, recovered via findLastSyncedMainCommit):
      // Bumps dependency in package.json & package-lock.json + adds CHANGELOG entry (causes CHANGELOG conflict on CP)
      fs.writeFileSync(
        path.join(localRepo, 'package.json'),
        `${JSON.stringify(
          {
            name: 'desktop-pet',
            version: '0.11.2',
            description: 'QiJiu Pet',
            dependencies: { 'electron-log': '^5.4.4' },
            build: {
              appId: 'com.deskpet.yueqi-shenjiu',
              productName: '七九爱宠',
              artifactName: 'desktop-pet-${version}.${ext}',
            },
          },
          null,
          2
        )}\n`
      );
      fs.writeFileSync(
        path.join(localRepo, 'package-lock.json'),
        `${JSON.stringify(
          {
            name: 'desktop-pet',
            version: '0.11.2',
            lockfileVersion: 3,
            packages: {
              '': {
                name: 'desktop-pet',
                version: '0.11.2',
                dependencies: { 'electron-log': '^5.4.4' },
              },
            },
          },
          null,
          2
        )}\n`
      );
      fs.writeFileSync(
        path.join(localRepo, 'CHANGELOG.md'),
        [
          '# Changelog',
          '',
          '## [Unreleased]',
          '',
          '### Fixed',
          '- Base fix.',
          '- Synced anchor fix.',
          '- Bump electron-log to 5.4.4.',
          '',
          '## [0.11.2] - 2026-10-23',
          '### Added',
          '- Old release.',
          '',
        ].join('\n')
      );
      git(localRepo, ['add', '.']);
      git(localRepo, ['commit', '-m', 'chore(deps): bump electron-log to 5.4.4']);
      const depCommitSha = git(localRepo, ['rev-parse', 'HEAD']);

      // Commit 3: Modifies line 1 of src/app.js -> causes non-CHANGELOG code conflict on cp/crowley-aziraphale
      fs.writeFileSync(path.join(localRepo, 'src', 'app.js'), 'const a = 42; // main conflicting change\nconst b = 2;\n');
      git(localRepo, ['add', 'src/app.js']);
      git(localRepo, ['commit', '-m', 'fix: conflicting change on app.js']);
      const conflictCommitSha = git(localRepo, ['rev-parse', 'HEAD']);

      // Commit 4: Clean universal utility addition
      fs.writeFileSync(path.join(localRepo, 'src', 'util.js'), 'exports.sum = (x, y) => x + y;\n');
      git(localRepo, ['add', 'src/util.js']);
      git(localRepo, ['commit', '-m', 'feat: add math util']);
      const cleanUtilSha = git(localRepo, ['rev-parse', 'HEAD']);
      git(localRepo, ['push', 'origin', 'main']);

      // Pass beforeSha = conflictCommitSha (simulating that depCommitSha's run was cancelled by concurrency),
      // and verify findLastSyncedMainCommit automatically recovers depCommitSha!
      const batchSync = await syncCommitsToCp({
        repoRoot: localRepo,
        targetBranch: 'cp/crowley-aziraphale',
        beforeSha: conflictCommitSha,
        afterSha: cleanUtilSha,
        dryRun: false,
        testRunner: () => {},
        installRunner: () => {},
      });

      assert.equal(batchSync.results.length, 2, 'A conflict must stop the batch before later commits');
      assert.equal(batchSync.results[0].sha, depCommitSha);
      assert.match(batchSync.results[0].status, /✅ 已同步/);
      assert.equal(batchSync.results[1].sha, conflictCommitSha);
      assert.equal(batchSync.results[1].status, '⚠️ 代码冲突跳过');
      const retry = await syncCommitsToCp({
        repoRoot: localRepo,
        targetBranch: 'cp/crowley-aziraphale',
        beforeSha: cleanUtilSha,
        afterSha: cleanUtilSha,
        dryRun: false,
        testRunner: () => {},
        installRunner: () => {},
      });
      assert.equal(retry.results.length, 1);
      assert.equal(retry.results[0].sha, conflictCommitSha, 'The failed commit must be retried on the next run');

      // Verify remote cp/crowley-aziraphale state
      git(localRepo, ['fetch', 'origin', 'cp/crowley-aziraphale']);
      const cpPkgAfter = JSON.parse(git(localRepo, ['show', 'origin/cp/crowley-aziraphale:package.json']));
      assert.equal(cpPkgAfter.name, 'good-omens-desktop-pet', 'Must preserve CP package name');
      assert.equal(cpPkgAfter.version, '1.0.0', 'Must preserve CP version');
      assert.equal(cpPkgAfter.build.appId, 'com.deskpet.good-omens', 'Must preserve CP appId');
      assert.equal(cpPkgAfter.dependencies['electron-log'], '^5.4.4', 'Must sync updated dependency version');

      const cpLockAfter = JSON.parse(git(localRepo, ['show', 'origin/cp/crowley-aziraphale:package-lock.json']));
      assert.equal(cpLockAfter.name, 'good-omens-desktop-pet');
      assert.equal(cpLockAfter.packages[''].name, 'good-omens-desktop-pet');
      assert.equal(cpLockAfter.packages[''].dependencies['electron-log'], '^5.4.4');

      const cpChangelogAfter = git(localRepo, ['show', 'origin/cp/crowley-aziraphale:CHANGELOG.md']);
      assert.match(cpChangelogAfter, /Good Omens exclusive feather fix\./);
      assert.match(cpChangelogAfter, /Synced anchor fix\./);
      assert.match(cpChangelogAfter, /Bump electron-log to 5\.4\.4\./);

      assert.throws(() => git(localRepo, ['show', 'origin/cp/crowley-aziraphale:src/util.js']));
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  await t.test('git orchestration regressions: rewritten bullets, test-failure rollback, branding veto, and 51-commit backlog', async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-to-cp-regress-'));
    const bareRemote = path.join(tmpBase, 'remote.git');
    const repo = path.join(tmpBase, 'local');
    const cpRef = 'origin/cp/crowley-aziraphale';
    const changelog = (bullet) =>
      ['# Changelog', '', '## [Unreleased]', '', '### Fixed', bullet, '', '## [0.1.0] - 2026-01-01', '### Added', '- Old.', ''].join('\n');

    try {
      git(tmpBase, ['init', '--bare', bareRemote]);
      git(tmpBase, ['init', repo]);
      git(repo, ['remote', 'add', 'origin', bareRemote]);
      fs.mkdirSync(path.join(repo, 'src', 'data'), { recursive: true });
      fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), changelog('- Synced bullet text.'));
      fs.writeFileSync(path.join(repo, 'src', 'data', 'i18n.js'), 'module.exports = {};\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'chore: base']);
      git(repo, ['branch', '-M', 'main']);
      git(repo, ['push', '-u', 'origin', 'main']);
      git(repo, ['push', 'origin', 'main:cp/crowley-aziraphale']);
      const baseSha = git(repo, ['rev-parse', 'HEAD']);

      // 1. Rewriting an existing bullet must not duplicate it on CP
      fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), changelog('- Synced bullet text corrected.'));
      fs.writeFileSync(path.join(repo, 'src', 'x.js'), 'exports.x = 1;\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'fix: rewrite bullet and add x']);
      const rewriteSha = git(repo, ['rev-parse', 'HEAD']);
      assert.deepEqual(resolveCommitsToEvaluate({
        cwd: repo, targetRef: cpRef, beforeSha: rewriteSha, afterSha: rewriteSha,
      }), [rewriteSha], 'Without a sync marker, retry from the shared ancestor');
      assert.deepEqual(resolveCommitsToEvaluate({
        cwd: repo, targetRef: cpRef, afterSha: rewriteSha,
      }), [rewriteSha], 'Manual runs without beforeSha must also recover from the shared ancestor');
      const rewriteRun = await syncCommitsToCp({
        repoRoot: repo,
        targetBranch: 'cp/crowley-aziraphale',
        manualCommitsArg: rewriteSha,
        dryRun: false,
        testRunner: () => {},
        installRunner: () => {},
      });
      assert.equal(rewriteRun.syncedCount, 1);
      git(repo, ['fetch', 'origin']);
      const cpChangelog = git(repo, ['show', `${cpRef}:CHANGELOG.md`]);
      assert.equal(cpChangelog.match(/Synced bullet text/g).length, 1, 'Rewritten bullet must not be duplicated');
      assert.doesNotMatch(cpChangelog, /corrected/);
      assert.match(git(repo, ['show', `${cpRef}:src/x.js`]), /exports\.x/);

      // 2. Failing tests roll the commit back and nothing is pushed
      fs.writeFileSync(path.join(repo, 'src', 'y.js'), 'exports.y = 1;\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'feat: add y']);
      const failingRun = await syncCommitsToCp({
        repoRoot: repo,
        targetBranch: 'cp/crowley-aziraphale',
        manualCommitsArg: git(repo, ['rev-parse', 'HEAD']),
        dryRun: false,
        testRunner: () => {
          throw new Error('tests failed');
        },
        installRunner: () => {},
      });
      assert.equal(failingRun.syncedCount, 0);
      assert.equal(failingRun.results[0].status, '❌ 测试未通过已回滚');
      git(repo, ['fetch', 'origin']);
      assert.throws(() => git(repo, ['show', `${cpRef}:src/y.js`]));

      // 3. A heuristic branding rejection cannot be overridden by an approving AI verdict
      fs.writeFileSync(path.join(repo, 'src', 'data', 'i18n.js'), 'module.exports = { title: "七九爱宠" };\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'feat(i18n): qijiu title']);
      let aiCalls = 0;
      const brandingRun = await syncCommitsToCp({
        repoRoot: repo,
        targetBranch: 'cp/crowley-aziraphale',
        manualCommitsArg: git(repo, ['rev-parse', 'HEAD']),
        dryRun: true,
        env: { GITHUB_TOKEN: 'ghs_test' },
        fetchImpl: async () => {
          aiCalls += 1;
          return { ok: true, json: async () => ({ choices: [{ message: { content: '{"applicable":true,"reason":"ok"}' } }] }) };
        },
      });
      assert.match(brandingRun.results[0].verdict, /不适用 \(cp-branding-diff\)/);
      assert.equal(aiCalls, 0, 'AI must not be consulted for heuristic rejections');
      assert.match(brandingRun.summaryMarkdown, /自动同步报告/);

      // 4. A backlog above the cap keeps the OLDEST commits
      for (let i = 0; i < 51; i += 1) {
        git(repo, ['commit', '--allow-empty', '-m', `chore: backlog ${i}`]);
      }
      const backlogHead = git(repo, ['rev-parse', 'HEAD']);
      const warn = console.warn;
      console.warn = () => {};
      let list;
      try {
        list = resolveCommitsToEvaluate({
          cwd: repo,
          targetRef: 'origin/does-not-exist',
          beforeSha: baseSha,
          afterSha: backlogHead,
        });
      } finally {
        console.warn = warn;
      }
      const oldestFirst = git(repo, ['rev-list', '--reverse', '--no-merges', `${baseSha}..${backlogHead}`]).split('\n');
      assert.equal(list.length, 50);
      assert.deepEqual(list, oldestFirst.slice(0, 50));
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  await t.test('sync improvements: no duplicate title swallow, visible AI failure, brand filtered changelog, per-commit push', async () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-sync-improvements-'));
    const bareRemote = path.join(tmpBase, 'remote.git');
    const repo = path.join(tmpBase, 'local');
    const cpRef = 'origin/cp/crowley-aziraphale';

    try {
      git(tmpBase, ['init', '--bare', bareRemote]);
      git(tmpBase, ['init', repo]);
      git(repo, ['remote', 'add', 'origin', bareRemote]);
      fs.mkdirSync(path.join(repo, 'src'), { recursive: true });

      const basePkg = {
        name: 'desktop-pet',
        version: '0.11.2',
        dependencies: {},
      };
      const baseCpPkg = {
        name: 'good-omens-desktop-pet',
        version: '1.0.0',
        dependencies: {},
      };
      const baseChangelog = [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '### Fixed',
        '- Base line.',
        '',
        '## [0.1.0] - 2026-01-01',
        '### Added',
        '- Initial.',
        '',
      ].join('\n');

      fs.writeFileSync(path.join(repo, 'package.json'), `${JSON.stringify(basePkg, null, 2)}\n`);
      fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), baseChangelog);
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'fix: common typo']);
      git(repo, ['branch', '-M', 'main']);
      git(repo, ['push', '-u', 'origin', 'main']);

      // Setup CP branch with good-omens identity
      git(repo, ['checkout', '-b', 'cp/crowley-aziraphale']);
      fs.writeFileSync(path.join(repo, 'package.json'), `${JSON.stringify(baseCpPkg, null, 2)}\n`);
      git(repo, ['add', 'package.json']);
      git(repo, ['commit', '-m', 'chore: cp setup']);
      git(repo, ['push', '-u', 'origin', 'cp/crowley-aziraphale']);

      git(repo, ['checkout', 'main']);

      // 1. Verify isCommitAlreadyOnBranch does NOT treat commits with same subject as already on branch
      const dummySha = 'abcdef0123456789abcdef0123456789abcdef01';
      assert.equal(
        isCommitAlreadyOnBranch(cpRef, dummySha, repo),
        false,
        'Different SHA with duplicate title must not be skipped as already on branch'
      );

      // 2. Verify AI failure transparency in verdictLabel
      fs.writeFileSync(
        path.join(repo, 'package.json'),
        `${JSON.stringify({ ...basePkg, dependencies: { 'new-dep': '1.0.0' } }, null, 2)}\n`
      );
      git(repo, ['add', 'package.json']);
      git(repo, ['commit', '-m', 'feat: update dep requiring AI check']);
      const sensitiveSha = git(repo, ['rev-parse', 'HEAD']);

      const aiFailureDryRun = await syncCommitsToCp({
        repoRoot: repo,
        targetBranch: 'cp/crowley-aziraphale',
        manualCommitsArg: sensitiveSha,
        dryRun: true,
        env: { GITHUB_TOKEN: 'ghs_test' },
        fetchImpl: async () => ({
          ok: false,
          status: 500,
        }),
      });
      assert.equal(aiFailureDryRun.results.length, 1);
      assert.equal(aiFailureDryRun.results[0].status, '🔍 Dry-Run 通过');
      assert.match(
        aiFailureDryRun.results[0].verdict,
        /适用 \(启发式；AI 复核失败: GitHub Models HTTP 500\)/
      );
      assert.match(aiFailureDryRun.summaryMarkdown, /GitHub Models HTTP 500/);

      // 3. Verify CHANGELOG QiJiu branding filtering and per-commit immediate push
      fs.writeFileSync(path.join(repo, 'src', 'tool1.js'), 'module.exports = 1;\n');
      fs.writeFileSync(
        path.join(repo, 'CHANGELOG.md'),
        [
          '# Changelog',
          '',
          '## [Unreleased]',
          '',
          '### Fixed',
          '- Base line.',
          '- 修复岳七在沈九附近时的移动卡顿',
          '- 修复通用窗口几何位置计算错误',
          '',
          '## [0.1.0] - 2026-01-01',
          '### Added',
          '- Initial.',
          '',
        ].join('\n')
      );
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'fix: common typo']); // Same subject as base commit, must NOT be skipped!
      const commit1Sha = git(repo, ['rev-parse', 'HEAD']);

      fs.writeFileSync(path.join(repo, 'src', 'tool2.js'), 'module.exports = 2;\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'feat: tool 2 which fails tests']);
      const commit2Sha = git(repo, ['rev-parse', 'HEAD']);
      fs.writeFileSync(path.join(repo, 'src', 'tool3.js'), 'module.exports = 3;\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-m', 'feat: tool 3']);
      const commit3Sha = git(repo, ['rev-parse', 'HEAD']);

      const multiSyncRun = await syncCommitsToCp({
        repoRoot: repo,
        targetBranch: 'cp/crowley-aziraphale',
        manualCommitsArg: `${commit1Sha},${commit2Sha},${commit3Sha}`,
        dryRun: false,
        testRunner: (cwd) => {
          const hasTool2 = fs.existsSync(path.join(cwd, 'src', 'tool2.js'));
          if (hasTool2) {
            throw new Error('Test failed on tool 2');
          }
        },
        installRunner: () => {},
      });

      assert.equal(multiSyncRun.syncedCount, 1);
      assert.equal(multiSyncRun.results.length, 2);
      assert.match(multiSyncRun.results[0].status, /✅ 已同步/);
      assert.equal(multiSyncRun.results[1].status, '❌ 测试未通过已回滚');

      // Fetch remote and verify commit 1 was pushed immediately despite commit 2 failing!
      git(repo, ['fetch', 'origin']);
      assert.match(
        git(repo, ['show', `${cpRef}:src/tool1.js`]),
        /module\.exports = 1/,
        'Commit 1 must be pushed to remote immediately'
      );
      assert.throws(
        () => git(repo, ['show', `${cpRef}:src/tool2.js`]),
        'Commit 2 must not be present on remote'
      );
      assert.throws(() => git(repo, ['show', `${cpRef}:src/tool3.js`]));

      // Verify remote CP CHANGELOG contains the universal fix and excludes QiJiu brand bullet
      const remoteCpChangelog = git(repo, ['show', `${cpRef}:CHANGELOG.md`]);
      assert.match(
        remoteCpChangelog,
        /修复通用窗口几何位置计算错误/,
        'Universal bullet must be merged'
      );
      assert.doesNotMatch(
        remoteCpChangelog,
        /岳七|沈九/,
        'QiJiu brand names must be filtered out from CP CHANGELOG'
      );
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });
});
