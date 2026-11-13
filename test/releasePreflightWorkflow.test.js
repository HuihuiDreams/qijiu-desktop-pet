const assert = require('node:assert/strict');
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

test('the macOS preflight job also runs the integration tests', () => {
  assert.match(jobs['preflight-mac'], /run: npm run test:integration/);
});
