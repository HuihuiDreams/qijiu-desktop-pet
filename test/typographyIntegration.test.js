const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'src', 'assets', 'fonts');

test('Multi-language typography bundles all required fonts and licenses for EN, ZH, and JA', () => {
  const stylesheet = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8');

  const expectedFonts = [
    { name: 'Cinzel', file: 'Cinzel-Subset.woff2', license: 'Cinzel-OFL.txt' },
    { name: 'Cormorant Garamond', file: 'CormorantGaramond-Subset.woff2', license: 'CormorantGaramond-OFL.txt' },
    { name: 'EB Garamond', file: 'EBGaramond-Subset.woff2', license: 'EBGaramond-OFL.txt' },
    { name: 'Ma Shan Zheng', file: 'MaShanZheng-Subset.woff2', license: 'MaShanZheng-OFL.txt' },
    { name: 'Shippori Mincho', file: 'ShipporiMincho-Subset.woff2', license: null },
    { name: 'Yuji Syuku', file: 'YujiSyuku-Subset.woff2', license: 'YujiSyuku-OFL.txt' },
  ];

  for (const font of expectedFonts) {
    // 1. @font-face is declared in index.css
    assert.match(
      stylesheet,
      new RegExp(`font-family:\\s*'${font.name}';`),
      `@font-face for ${font.name} should be declared in index.css`
    );
    assert.match(
      stylesheet,
      new RegExp(`url\\('\\./assets/fonts/${font.file}'\\)`),
      `src url for ${font.file} should be referenced in index.css`
    );

    // 2. Font file exists and is non-empty
    const fontFilePath = path.join(FONT_DIR, font.file);
    assert.ok(fs.existsSync(fontFilePath), `Font file ${font.file} must exist`);
    assert.ok(fs.statSync(fontFilePath).size > 1000, `Font file ${font.file} must be non-empty`);

    // 3. License file exists if applicable
    if (font.license) {
      const licenseFilePath = path.join(FONT_DIR, font.license);
      assert.ok(fs.existsSync(licenseFilePath), `License file ${font.license} must exist`);
      assert.match(
        fs.readFileSync(licenseFilePath, 'utf8'),
        /SIL Open Font License, Version 1\.1/,
        `${font.license} must contain SIL Open Font License 1.1`
      );
    }
  }

  // 4. Verify language-specific typography rules
  // English: Inscriptional Roman / Antiquarian display (Cinzel) + literary book body (EB Garamond)
  assert.match(stylesheet, /html\[lang="en"\],\s*html\[data-locale="en"\]\s*\{[\s\S]*?--font-display:\s*'Cinzel'/);
  assert.match(stylesheet, /html\[lang="en"\],\s*html\[data-locale="en"\]\s*\{[\s\S]*?--font-body:\s*'EB Garamond'/);

  // Chinese: Calligraphic brush display (Ma Shan Zheng) + literary Songti body
  assert.match(stylesheet, /html\[lang="zh"\],\s*html\[data-locale="zh"\]\s*\{[\s\S]*?--font-display:\s*'Ma Shan Zheng'/);
  assert.match(stylesheet, /html\[lang="zh"\],\s*html\[data-locale="zh"\]\s*\{[\s\S]*?--font-body:\s*'EB Garamond',\s*'Songti SC'/);

  // Japanese: Calligraphic brush display (Yuji Syuku) + vintage Mincho body (Shippori Mincho)
  assert.match(stylesheet, /html\[lang="ja"\],\s*html\[data-locale="ja"\]\s*\{[\s\S]*?--font-display:\s*'Yuji Syuku'/);
  assert.match(stylesheet, /html\[lang="ja"\],\s*html\[data-locale="ja"\]\s*\{[\s\S]*?--font-body:\s*'Shippori Mincho'/);
});
