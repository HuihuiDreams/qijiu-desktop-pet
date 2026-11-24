const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const effectsCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'effects.css'), 'utf8');

function extractRuleBody(css, selectorPattern) {
  const match = css.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(match, `Expected CSS rule matching ${selectorPattern}`);
  return match[1];
}

function extractKeyframesBlock(css, name) {
  const marker = `@keyframes ${name}`;
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, `Expected @keyframes ${name}`);
  const openBrace = css.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(openBrace + 1, i);
    }
  }
  assert.fail(`Unclosed @keyframes ${name}`);
}

test('low-qi layer stays non-interactive, sits behind pet-body, and hides during meditation/overlays', () => {
  const layerRule = extractRuleBody(effectsCss, '\\.pet-qi-depletion');
  assert.match(layerRule, /pointer-events:\s*none;/);
  assert.match(layerRule, /z-index:\s*-1;/);
  assert.match(layerRule, /contain:\s*layout style;/);

  const suppressRule = extractRuleBody(
    effectsCss,
    '\\.pet--meditating \\.pet-qi-depletion,\\s*\\.pet--interacting \\.pet-qi-depletion,\\s*\\.pet:has\\(> \\.pet-body\\[style\\*="hidden"\\]\\) \\.pet-qi-depletion',
  );
  assert.match(suppressRule, /display:\s*none;/);
});

test('low-qi animations use only GPU-composited transform and opacity (no drop-shadow/layout properties)', () => {
  const forbiddenAnimatedProps = /\b(?:filter|box-shadow|width|height|top|left|right|bottom|margin|padding|border|mask-image|clip-path)\s*:/;

  for (const keyframeName of ['qiPoolWane', 'qiWispRise', 'qiSparkDissipate']) {
    const body = extractKeyframesBlock(effectsCss, keyframeName);
    assert.match(body, /\btransform\s*:/, `${keyframeName} should animate transform`);
    assert.match(body, /\bopacity\s*:/, `${keyframeName} should animate opacity`);
    assert.doesNotMatch(
      body,
      forbiddenAnimatedProps,
      `${keyframeName} must not animate non-composited or expensive raster properties`,
    );
  }
});

test('low-qi visuals derive Qi color tokens and scale wisps/sparks with --pet-size', () => {
  assert.match(effectsCss, /rgb\(from\s+var\(--color-qi,\s*#7c3aad\)\s+r\s+g\s+b\s*\//);
  const wispRule = extractRuleBody(effectsCss, '\\.pet-qi-wisp');
  assert.match(wispRule, /var\(--pet-size,\s*96px\)/);
  assert.match(wispRule, /pointer-events:\s*none;/);

  const sparkRule = extractRuleBody(effectsCss, '\\.pet-qi-spark');
  assert.match(sparkRule, /var\(--pet-size,\s*96px\)/);
  assert.match(sparkRule, /pointer-events:\s*none;/);
});
