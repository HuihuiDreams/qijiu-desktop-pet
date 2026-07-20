'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MAIN_DIR = path.join(ROOT, 'src', 'main');

/**
 * Recursively collects every `.js` file under `dir`, sorted by relative path
 * (plain string comparison, not locale-aware) so the resulting file list is
 * deterministic across machines and OS locales.
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Concatenates `main.js` with every `.js` file under `src/main/` (recursive,
 * deterministically sorted) into a single string. Intended for tests that do
 * source-level string/regex assertions against "the main process" without
 * caring which specific file a piece of logic currently lives in — moving
 * code between main-process modules should not require touching these
 * assertions.
 * @returns {string}
 */
function readMainProcessSource() {
  const mainEntry = path.join(ROOT, 'main.js');
  const moduleFiles = collectJsFiles(MAIN_DIR).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files = [mainEntry, ...moduleFiles];
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

/**
 * Reads a single file relative to the repo root.
 * @param {string} relativePath
 * @returns {string}
 */
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

module.exports = { readMainProcessSource, read };
