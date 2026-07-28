const assert = require('node:assert/strict');
const test = require('node:test');

const { ScreensaverParticleLayer } = require('../src/ui/ScreensaverParticleLayer');
const { ScreensaverSystem } = require('../src/systems/ScreensaverSystem');

function createFakeDom() {
  const elements = [];
  const body = {
    children: [],
    appendChild(child) {
      child.parentElement = body;
      elements.push(child);
      this.children.push(child);
      return child;
    },
    querySelectorAll(selector) {
      return querySelectorAllImpl(elements, selector);
    },
    querySelector(selector) {
      const all = querySelectorAllImpl(elements, selector);
      return all[0] || null;
    },
  };

  function querySelectorAllImpl(list, selector) {
    if (selector.startsWith('.')) {
      const cls = selector.substring(1);
      return list.filter((el) => el.classList && el.classList.contains(cls));
    }
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      return list.filter((el) => el.id === id);
    }
    if (selector.startsWith('[')) {
      const matchAttr = selector.match(/\[([a-zA-Z0-9_-]+)="?([^"\]]*)"?\]/);
      if (matchAttr) {
        const [, attrName, attrVal] = matchAttr;
        return list.filter((el) => el.attributes && el.attributes[attrName] === attrVal);
      }
    }
    return [];
  }

  const documentMock = {
    body,
    createElement(tag) {
      const attrs = {};
      const classListSet = new Set();
      const styleObj = {
        _props: {},
        setProperty(k, v) {
          this[k] = String(v);
          this._props[k] = String(v);
        },
        getPropertyValue(k) {
          return this._props[k] || this[k] || '';
        },
      };
      const children = [];
      const el = {
        tagName: tag.toUpperCase(),
        attributes: attrs,
        style: styleObj,
        children,
        _className: '',
        set className(v) {
          this._className = String(v);
          classListSet.clear();
          this._className.split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
        },
        get className() {
          return this._className;
        },
        classList: {
          add(c) {
            classListSet.add(c);
            el._className = Array.from(classListSet).join(' ');
          },
          contains(c) {
            return classListSet.has(c);
          },
          remove(c) {
            classListSet.delete(c);
            el._className = Array.from(classListSet).join(' ');
          },
        },
        id: '',
        textContent: '',
        setAttribute(k, v) {
          attrs[k] = String(v);
        },
        getAttribute(k) {
          return attrs[k] || null;
        },
        appendChild(child) {
          child.parentElement = el;
          elements.push(child);
          children.push(child);
          return child;
        },
        querySelector(selector) {
          if (selector === '.pet-body') {
            return el.bodyChild || null;
          }
          return null;
        },
        remove() {
          const idx = elements.indexOf(el);
          if (idx !== -1) elements.splice(idx, 1);
          const bIdx = body.children.indexOf(el);
          if (bIdx !== -1) body.children.splice(bIdx, 1);
          if (el.parentElement && el.parentElement.children) {
            const pIdx = el.parentElement.children.indexOf(el);
            if (pIdx !== -1) el.parentElement.children.splice(pIdx, 1);
          }
        },
      };
      return el;
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
    },
    querySelector(selector) {
      return body.querySelector(selector);
    },
    getElementById(id) {
      return elements.find((el) => el.id === id) || null;
    },
  };

  body.ownerDocument = documentMock;
  return { documentMock, elements, body };
}

function createFakePet(documentMock, id, x = 100, y = 100) {
  const elem = documentMock.createElement('div');
  elem.bodyChild = documentMock.createElement('div');
  elem.bodyChild.className = 'pet-body';

  return {
    id,
    x,
    y,
    size: 100,
    state: 'idle',
    queuedAction: null,
    element: elem,
    setState(st) {
      this.state = st;
    },
  };
}

function createFakeElectronApi() {
  const listeners = new Map();
  const sentMessages = [];

  return {
    onScreensaverStart: (fn) => {
      listeners.set('start', fn);
      return () => listeners.delete('start');
    },
    onScreensaverStop: (fn) => {
      listeners.set('stop', fn);
      return () => listeners.delete('stop');
    },
    onScreensaverCancel: (fn) => {
      listeners.set('cancel', fn);
      return () => listeners.delete('cancel');
    },
    notifyScreensaverReady: () => {
      sentMessages.push({ channel: 'ready' });
    },
    notifyScreensaverFinished: (sessionId) => {
      sentMessages.push({ channel: 'finished', sessionId });
    },
    emitStart: (payload) => listeners.get('start')?.(payload),
    emitStop: (payload) => listeners.get('stop')?.(payload),
    emitCancel: (payload) => listeners.get('cancel')?.(payload),
    sentMessages,
  };
}

test('ScreensaverParticleLayer - container structure & zero ID collision', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const layer = new ScreensaverParticleLayer(documentMock.body);

  const sceneBounds = {
    scaleRatio: 1.0,
    midpoint: { x: 200, y: 150 },
    baseWidth: 320,
    baseHeight: 200,
  };

  layer.mount(sceneBounds);

  assert.ok(layer.root);
  assert.equal(layer.root.className, 'screensaver-particle-root');
  assert.equal(layer.root.id, '', 'Must NOT assign an id to particle root container');
  assert.equal(layer.root.style.pointerEvents, 'none', 'Must set pointer-events: none');

  // Verify zero ID collision
  assert.equal(documentMock.getElementById('weather-particle-layer'), null);
  assert.equal(documentMock.getElementById('interaction-overlay'), null);

  layer.destroy();
  delete global.document;
});

test('ScreensaverParticleLayer - node budget <= 20 enforcement', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const layer = new ScreensaverParticleLayer(documentMock.body);

  const sceneBounds = {
    scaleRatio: 1.0,
    midpoint: { x: 200, y: 150 },
    baseWidth: 320,
    baseHeight: 200,
  };

  layer.mount(sceneBounds);

  const glowCount = layer.glowNode ? 1 : 0;
  const heartsCount = layer.particleNodes.length;
  const totalNodesInRoot = 1 + glowCount + heartsCount;

  assert.equal(glowCount, 1, 'Warm glow background node must be created');
  assert.equal(heartsCount, 12, 'Default 12 heart particles must be created');
  assert.equal(totalNodesInRoot, 14, 'Total DOM nodes created must equal 14');
  assert.ok(totalNodesInRoot <= 20, 'Total DOM nodes must strictly adhere to <= 20 budget');

  layer.destroy();
  delete global.document;
});

test('ScreensaverParticleLayer - expands the pink atmosphere around the shared pair layout', () => {
  const { documentMock } = createFakeDom();
  const layer = new ScreensaverParticleLayer(documentMock.body);

  layer.mount({
    scaleRatio: 1,
    visualScale: 1,
    midpoint: { x: 500, y: 350 },
    baseWidth: 320,
    baseHeight: 200,
    particleBaseWidth: 500,
    particleBaseHeight: 300,
  });

  assert.equal(layer.root.style.width, '700px');
  assert.equal(layer.root.style.height, '420px');
  assert.equal(layer.root.style.left, '150px');
  assert.equal(layer.root.style.top, '140px');
});

test('ScreensaverParticleLayer - reducedMotion disables floating hearts', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const layer = new ScreensaverParticleLayer(documentMock.body);

  const sceneBounds = {
    scaleRatio: 1.0,
    midpoint: { x: 200, y: 150 },
    baseWidth: 320,
    baseHeight: 200,
  };

  layer.mount(sceneBounds, { reducedMotion: true });

  assert.ok(layer.root);
  assert.ok(layer.glowNode, 'Warm glow node should still be created under reduced motion');
  assert.equal(layer.particleNodes.length, 0, 'Heart particles count must be 0 when reducedMotion is true');

  layer.destroy();
  delete global.document;
});

test('ScreensaverParticleLayer - complete destruction clear() / destroy()', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const layer = new ScreensaverParticleLayer(documentMock.body);

  const sceneBounds = {
    scaleRatio: 1.0,
    midpoint: { x: 200, y: 150 },
    baseWidth: 320,
    baseHeight: 200,
  };

  layer.mount(sceneBounds);
  assert.ok(documentMock.body.children.length > 0);

  layer.destroy();

  assert.equal(layer.root, null);
  assert.equal(layer.glowNode, null);
  assert.equal(layer.particleNodes.length, 0);
  assert.equal(documentMock.body.children.length, 0, 'Root element must be removed from stage on destroy()');

  delete global.document;
});

test('ScreensaverParticleLayer - strict separation from WeatherParticleLayer', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const layer = new ScreensaverParticleLayer(documentMock.body);

  const sceneBounds = {
    scaleRatio: 1.0,
    midpoint: { x: 200, y: 150 },
    baseWidth: 320,
    baseHeight: 200,
  };

  layer.mount(sceneBounds);

  const weatherRoot = documentMock.getElementById('weather-particle-layer');
  assert.equal(weatherRoot, null, 'Must NOT query or touch weather-particle-layer');

  const weatherNodes = documentMock.querySelectorAll('.weather-particle-layer');
  assert.equal(weatherNodes.length, 0, 'Must NOT introduce weather-particle-layer CSS classes');

  layer.destroy();
  delete global.document;
});

test('ScreensaverSystem integration with ScreensaverParticleLayer', () => {
  const { documentMock } = createFakeDom();
  global.document = documentMock;

  const electronAPI = createFakeElectronApi();
  const petA = createFakePet(documentMock, 'yueqi', 100, 100);
  const petB = createFakePet(documentMock, 'shenjiu', 300, 100);

  const particleLayer = new ScreensaverParticleLayer(documentMock.body);

  const system = new ScreensaverSystem({
    electronAPI,
    getPets: () => [petA, petB],
    renderer: { stage: documentMock.body },
    particleLayer,
  });
  system.init();

  electronAPI.emitStart({ sessionId: 999, startedAt: Date.now() });

  assert.equal(system.state, 'entering');
  assert.ok(particleLayer.root, 'Particle layer must be mounted on screensaver start');
  assert.equal(documentMock.querySelector('.screensaver-particle-root') !== null, true);

  system.reset();

  assert.equal(particleLayer.root, null, 'Particle layer must be cleared on screensaver reset');
  assert.equal(documentMock.querySelector('.screensaver-particle-root'), null);

  delete global.document;
});
