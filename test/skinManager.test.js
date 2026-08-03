const assert = require('node:assert/strict');
const test = require('node:test');

const { SkinManager } = require('../src/systems/SkinManager');
const { SpriteView } = require('../src/pet/SpriteView');
const { PetRenderer } = require('../src/pet/PetRenderer');

function createFakePet(id = 'yueqi') {
  const baseName = id === 'yueqi' ? 'left' : 'right';
  return {
    id,
    image: `pet-asset://skin/default/${baseName}.webp`,
    sprites: {
      idle: { frames: [`pet-asset://skin/default/${baseName}.webp`], fps: 1 },
    },
    _sv_lastResource: null,
    _sv_frameIndex: 0,
    _sv_frameTimer: 0,
    _sv_lastSpriteKey: null,
    _sv_preloadedImages: [],
    element: null,
    isHungry: () => false,
    updateSkin(skinPaths) {
      if (skinPaths.image) this.image = skinPaths.image;
      this.imageScale = Number.isFinite(skinPaths.imageScale) && skinPaths.imageScale > 0 ? skinPaths.imageScale : 1;
      if (skinPaths.sprites) this.sprites = skinPaths.sprites;
    },
  };
}

function createFakePetElement() {
  const image = {
    className: '',
    alt: '',
    _src: '',
    set src(value) {
      this._src = value;
    },
    get src() {
      return this._src;
    },
    getAttribute(name) {
      return name === 'src' ? this._src : null;
    },
  };
  const body = {
    textContent: 'initial',
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      if (selector === '.pet-image') {
        return this.children.find((child) => child.className === 'pet-image') || null;
      }
      return null;
    },
  };
  return {
    body,
    querySelector(selector) {
      return selector === '.pet-body' ? body : null;
    },
    createImage() {
      return image;
    },
  };
}

test('SkinManager initializes with default skin', () => {
  const sm = new SkinManager();
  assert.equal(sm.getCurrentSkin(), 'default');
  assert.deepEqual(sm.availableSkins, ['default']);
});


test('SkinManager updates available skins', () => {
  const sm = new SkinManager();
  sm.setAvailableSkins(['default', 'qban', 'campus']);

  assert.deepEqual(
    sm.getAvailableSkins().map((skin) => skin.id),
    ['default', 'qban', 'campus']
  );
});

test('SkinManager builds default WebP paths', () => {
  const sm = new SkinManager();
  const paths = sm.buildPaths('default');

  assert.equal(paths.petA.image, 'pet-asset://skin/default/left.webp');
  assert.equal(paths.petB.image, 'pet-asset://skin/default/right.webp');
  assert.equal(paths.overlayPrefix, 'pet-asset://skin/default/');
  assert.deepEqual(paths.petA.sprites.idle.frames, ['pet-asset://skin/default/left.webp']);
  assert.equal(paths.petA.sprites.walkingLeft.frames[0], 'pet-asset://skin/default/yueqi/walk_left01.webp');
  assert.equal(paths.imageMap.shenjiu.meditating, 'pet-asset://skin/default/right_cultivate.webp');
  assert.equal(paths.imageMap.yueqi.eating, 'pet-asset://skin/default/left_eat.webp');
});

test('SkinManager builds custom WebP skin paths', () => {
  const sm = new SkinManager();
  const paths = sm.buildPaths('qban');

  assert.equal(paths.petA.image, 'pet-asset://skin/qban/left.webp');
  assert.equal(paths.petA.imageScale, 1);
  assert.equal(paths.petB.image, 'pet-asset://skin/qban/right.webp');
  assert.equal(paths.petB.imageScale, 1);
  assert.equal(paths.petA.sprites.walkingRight.frames[2], 'pet-asset://skin/qban/yueqi/walk_right03.webp');
  assert.equal(paths.imageMap.shenjiu.hungry, 'pet-asset://skin/qban/right_hungry.webp');
});

test('SkinManager gives animal ears skin a larger image scale', () => {
  const sm = new SkinManager();
  const paths = sm.buildPaths('animal_ears');

  assert.equal(paths.petA.imageScale, 1.08);
  assert.equal(paths.petB.imageScale, 1.08);
});

test('SkinManager.applySkin updates current skin and pets', async () => {
  const sm = new SkinManager();
  const petA = createFakePet('yueqi');
  const petB = createFakePet('shenjiu');

  await sm.applySkin('qban', { petA, petB, spriteView: null, renderer: null });

  assert.equal(sm.getCurrentSkin(), 'qban');
  assert.equal(petA.image, 'pet-asset://skin/qban/left.webp');
  assert.equal(petB.image, 'pet-asset://skin/qban/right.webp');
  assert.equal(petA.imageScale, 1);
  assert.equal(petB.imageScale, 1);
  assert.equal(petA.sprites.idle.frames[0], 'pet-asset://skin/qban/left.webp');
});

test('SkinManager.applySkin updates renderer prefix', async () => {
  const sm = new SkinManager();
  const renderer = new PetRenderer(null);

  await sm.applySkin('qban', { petA: null, petB: null, spriteView: null, renderer });

  assert.equal(renderer.skinPrefix, 'pet-asset://skin/qban/');
});

test('SpriteView.updateImageMap replaces the image map', () => {
  const sv = new SpriteView();

  assert.equal(sv.imageMap.shenjiu.meditating, 'pet-asset://skin/default/right_cultivate.webp');

  sv.updateImageMap({
    shenjiu: { meditating: 'pet-asset://skin/qban/right_cultivate.webp' },
    yueqi: { meditating: 'pet-asset://skin/qban/left_cultivate.webp' },
  });

  assert.equal(sv.imageMap.shenjiu.meditating, 'pet-asset://skin/qban/right_cultivate.webp');
  assert.equal(sv.imageMap.yueqi.meditating, 'pet-asset://skin/qban/left_cultivate.webp');
});

test('SpriteView.attach initializes animation state and preloads resources when Image exists', () => {
  const originalImage = global.Image;
  const loaded = [];
  class FakeImage {
    set src(value) {
      this._src = value;
      loaded.push(value);
    }
    get src() {
      return this._src;
    }
  }
  global.Image = FakeImage;

  try {
    const sv = new SpriteView({
      imageMap: {
        yueqi: { hungry: 'pet-asset://skin/default/left_hungry.webp' },
      },
    });
    const pet = createFakePet('yueqi');
    pet.sprites.walkingLeft = { frames: ['walk-1.webp', 'walk-2.webp'], fps: 4 };
    pet._sv_lastResource = 'old.webp';
    pet._sv_frameIndex = 2;

    sv.attach(pet);

    assert.equal(pet._sv_lastResource, null);
    assert.equal(pet._sv_frameIndex, 0);
    assert.deepEqual(loaded, [
      'pet-asset://skin/default/left.webp',
      'walk-1.webp',
      'walk-2.webp',
      'pet-asset://skin/default/left_hungry.webp',
    ]);
  } finally {
    global.Image = originalImage;
  }
});

test('SpriteView.update safely ignores pets without an element', () => {
  const sv = new SpriteView();
  const pet = createFakePet('yueqi');

  assert.doesNotThrow(() => sv.update(pet, 1000));
  assert.equal(pet._sv_lastResource, null);
});

test('SpriteView.update advances multi-frame sprites using elapsed time', () => {
  const originalDocument = global.document;
  const fakeElement = createFakePetElement();
  global.document = {
    createElement(tag) {
      assert.equal(tag, 'img');
      return fakeElement.createImage();
    },
  };

  try {
    const sv = new SpriteView();
    const pet = createFakePet('yueqi');
    pet.element = fakeElement;
    pet.state = 'walking';
    pet.direction = 'left';
    pet.sprites.walkingLeft = { frames: ['walk-1.webp', 'walk-2.webp'], fps: 4 };

    sv.update(pet, 250);

    assert.equal(pet._sv_frameIndex, 1);
    assert.equal(fakeElement.body.children[0].src, 'walk-2.webp');
    assert.equal(fakeElement.body.children[0].alt, '');
  } finally {
    global.document = originalDocument;
  }
});

test('SpriteView.update renders emoji fallback when no image resource is available', () => {
  const sv = new SpriteView({
    imageMap: {},
    emojiMap: {
      unknown: {
        idle: 'idle-emoji',
        working: 'work-emoji',
      },
    },
  });
  const pet = createFakePet('unknown');
  const fakeElement = createFakePetElement();
  pet.element = fakeElement;
  pet.image = null;
  pet.state = 'working';

  sv.update(pet, 16);

  assert.equal(fakeElement.body.textContent, 'work-emoji');
  assert.equal(pet._sv_lastResource, 'work-emoji');
});

test('SpriteView.update reuses the existing resource without rewriting DOM', () => {
  const sv = new SpriteView();
  const pet = createFakePet('yueqi');
  const fakeElement = createFakePetElement();
  pet.element = fakeElement;
  pet._sv_lastResource = pet.image;

  sv.update(pet, 16);

  assert.equal(fakeElement.body.children.length, 0);
});

test('SpriteView uses direction-specific second walking frames for visible greetings', () => {
  const sv = new SpriteView();
  const yueqi = createFakePet('yueqi');
  const shenjiu = createFakePet('shenjiu');

  yueqi.state = 'interacting';
  yueqi.direction = 'right';
  yueqi.sprites.walkingRight = {
    frames: ['pet-asset://skin/default/yueqi/walk_right01.webp', 'pet-asset://skin/default/yueqi/walk_right02.webp'],
    fps: 4,
  };

  shenjiu.state = 'interacting';
  shenjiu.direction = 'left';
  shenjiu.sprites.walkingLeft = {
    frames: ['pet-asset://skin/default/shenjiu/walk_left01.webp', 'pet-asset://skin/default/shenjiu/walk_left02.webp'],
    fps: 4,
  };

  assert.deepEqual(
    sv._resolveResource(yueqi),
    { src: 'pet-asset://skin/default/yueqi/walk_right02.webp', type: 'image' }
  );
  assert.deepEqual(
    sv._resolveResource(shenjiu),
    { src: 'pet-asset://skin/default/shenjiu/walk_left02.webp', type: 'image' }
  );
});

test('SpriteView.reattach clears render cache', async () => {
  const sv = new SpriteView();
  const pet = createFakePet('yueqi');

  pet._sv_lastResource = 'pet-asset://skin/default/left.webp';
  pet._sv_frameIndex = 3;
  pet._sv_frameTimer = 123;
  pet._sv_lastSpriteKey = 'walkingLeft';

  await sv.reattach(pet);

  assert.equal(pet._sv_lastResource, null);
  assert.equal(pet._sv_frameIndex, 0);
  assert.equal(pet._sv_frameTimer, 0);
  assert.equal(pet._sv_lastSpriteKey, null);
});

test('SpriteView.reattach preloads each unique WebP resource once', async () => {
  const originalImage = global.Image;
  const createdImages = [];

  class FakeImage {
    set src(value) {
      this._src = value;
      createdImages.push(this);
      queueMicrotask(() => this.onload?.());
    }

    get src() {
      return this._src;
    }
  }

  global.Image = FakeImage;

  try {
    const sv = new SpriteView({
      imageMap: {
        yueqi: {
          hungry: 'pet-asset://skin/default/left_hungry.webp',
        },
      },
    });
    const pet = createFakePet('yueqi');
    pet.sprites.walkingLeft = {
      frames: [
        'pet-asset://skin/default/yueqi/walk_left01.webp',
        'pet-asset://skin/default/yueqi/walk_left02.webp',
      ],
      fps: 4,
    };

    await sv.reattach(pet);

    assert.equal(createdImages.length, 4);
    assert.deepEqual(
      pet._sv_preloadedImages.map((image) => image.src),
      [
        'pet-asset://skin/default/left.webp',
        'pet-asset://skin/default/yueqi/walk_left01.webp',
        'pet-asset://skin/default/yueqi/walk_left02.webp',
        'pet-asset://skin/default/left_hungry.webp',
      ]
    );
  } finally {
    global.Image = originalImage;
  }
});

test('SpriteView.reattach cleans up previous preloaded images event handlers', async () => {
  const originalImage = global.Image;
  try {
    const cleanedHandlers = [];
    class FakeImage {
      set onload(handler) {
        this._onload = handler;
        if (handler === null) cleanedHandlers.push('onload');
      }
      get onload() { return this._onload; }
      set onerror(handler) {
        this._onerror = handler;
        if (handler === null) cleanedHandlers.push('onerror');
      }
      get onerror() { return this._onerror; }
      set src(value) {
        this._src = value;
        if (this._onload) setTimeout(() => this._onload(), 0);
      }
      get src() { return this._src; }
    }
    global.Image = FakeImage;

    const sv = new SpriteView({ imageMap: { yueqi: {} } });
    const pet = createFakePet('yueqi');
    await sv.reattach(pet);
    const firstPreloads = pet._sv_preloadedImages;
    assert.ok(firstPreloads.length > 0);

    // Reattach again to verify cleanup of firstPreloads
    await sv.reattach(pet);
    assert.ok(cleanedHandlers.length > 0);
  } finally {
    global.Image = originalImage;
  }
});

test('PetRenderer defaults and updates skin prefix with overlay preloading', () => {
  const originalImage = global.Image;
  try {
    const preloadedSrcs = [];
    global.Image = class FakeImage {
      set src(val) { preloadedSrcs.push(val); }
    };

    const renderer = new PetRenderer(null);
    assert.equal(renderer.skinPrefix, 'pet-asset://skin/default/');

    renderer.setSkinPrefix('pet-asset://skin/qban/');
    assert.equal(renderer.skinPrefix, 'pet-asset://skin/qban/');
    assert.deepEqual(preloadedSrcs, [
      'pet-asset://skin/qban/cultivate.webp',
      'pet-asset://skin/qban/kiss.webp',
    ]);
  } finally {
    global.Image = originalImage;
  }
});
