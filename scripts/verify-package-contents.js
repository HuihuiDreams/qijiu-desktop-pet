const path = require('node:path');
const asar = require('@electron/asar');
const { globSync } = require('glob');

const FORBIDDEN_TOP_LEVEL_PATHS = [
  '.codex',
  '.agents',
  '.claude',
  '.geminirules',
  '.kiro',
  '.skillopt-sleep',
  '.vscode',
  'agents.md',
  'claude.md',
  'backups',
  'dist-update-test',
  'output',
  'security-scans',
  'test-results',
];

// 皮肤目录下的明文 WebP 只能以 protected-assets/ 密文形式发布（ADR-040）；
// src/assets/ 根目录下的书法水印等共享 WebP 不受此限制。
const PLAINTEXT_SKIN_WEBP_PATTERN = /^src\/assets\/[^/]+\/.+\.webp$/i;

// 本机环境变量文件、代码签名证书/私钥与 Python 字节码缓存同样不得进入安装包。
const FORBIDDEN_SECRET_OR_TEMP_PATTERNS = [
  /(?:^|\/)\.env(?:\.[^/]+)?$/i,
  /\.(?:pfx|p12|key|pem|cer|crt|der)$/i,
  /(?:^|\/)__pycache__(?:\/|$)/i,
];

function normalizeAsarEntry(entry) {
  return String(entry).replace(/\\/g, '/').replace(/^\/+/, '');
}

function findForbiddenEntries(entries) {
  return entries
    .map(normalizeAsarEntry)
    .filter((entry) => {
      const [topLevel] = entry.toLowerCase().split('/');
      return FORBIDDEN_TOP_LEVEL_PATHS.includes(topLevel)
        || PLAINTEXT_SKIN_WEBP_PATTERN.test(entry)
        || FORBIDDEN_SECRET_OR_TEMP_PATTERNS.some((pattern) => pattern.test(entry));
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
    throw new Error(`Forbidden files or plaintext skin WebP found in packaged app:\n${violations.join('\n')}`);
  }

  return asarFiles;
}

if (require.main === module) {
  try {
    const verifiedFiles = verifyPackageContents();
    console.log(`Verified ${verifiedFiles.length} app.asar file(s): no forbidden files or plaintext skin WebP found.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  findForbiddenEntries,
  verifyPackageContents,
};
