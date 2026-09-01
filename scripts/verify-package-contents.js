const path = require('node:path');
const asar = require('@electron/asar');
const { globSync } = require('glob');

const FORBIDDEN_TOP_LEVEL_PATHS = [
  '.codex',
  '.agents',
  '.geminirules',
  'agents.md',
  'claude.md',
];

function normalizeAsarEntry(entry) {
  return String(entry).replace(/\\/g, '/').replace(/^\/+/, '');
}

function findForbiddenEntries(entries) {
  return entries
    .map(normalizeAsarEntry)
    .filter((entry) => {
      const [topLevel] = entry.toLowerCase().split('/');
      return FORBIDDEN_TOP_LEVEL_PATHS.includes(topLevel);
    });
}

function verifyPackageContents(distRoot = path.join(__dirname, '..', 'dist')) {
  const asarFiles = globSync('**/app.asar', {
    absolute: true,
    cwd: distRoot,
    nodir: true,
  });

  if (asarFiles.length === 0) {
    throw new Error(`No app.asar files found under ${distRoot}`);
  }

  const violations = [];
  for (const asarFile of asarFiles) {
    const forbiddenEntries = findForbiddenEntries(asar.listPackage(asarFile));
    for (const entry of forbiddenEntries) {
      violations.push(`${asarFile}: ${entry}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`Forbidden internal files found in packaged app:\n${violations.join('\n')}`);
  }

  return asarFiles;
}

if (require.main === module) {
  try {
    const verifiedFiles = verifyPackageContents();
    console.log(`Verified ${verifiedFiles.length} app.asar file(s): no internal agent files found.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  findForbiddenEntries,
  verifyPackageContents,
};
