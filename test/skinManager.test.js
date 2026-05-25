const assert = require('node:assert/strict');
const test = require('node:test');

const { SkinManager } = require('../src/systems/SkinManager');
const { SpriteView } = require('../src/pet/SpriteView');
const { PetRenderer } = require('../src/pet/PetRenderer');

function createFakePet(id = 'yueqi') {
  const baseName = id === 'yueqi' ? 'left' : 'right';
  return {
    id,
    image: `assets/default/${baseName}.webp`,
    sprites: {
      idle: { frames: [`assets/default/${baseName}.webp`], fps: 1 },
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
      if (skinPaths.sprites) this.sprites = skinPaths.sprites;
    },
  };
}

test('SkinManager initializes with default skin', () => {
  const sm = new SkinManager();
  assert.equal(sm.getCurrentSkin(), 'default');
  assert.deepEqual(sm.availableSkins, ['default']);
});

test('SkinManager resolves display names', () => {
  const sm = new SkinManager();
  assert.equal(sm.getDisplayName('default'), SkinManager.SKIN_NAMES.default);
  assert.equal(sm.getDisplayName('qban'), 'qban');
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

  assert.equal(paths.petA.image, 'assets/default/left.webp');
  assert.equal(paths.petB.image, 'assets/default/right.webp');
  assert.equal(paths.overlayPrefix, 'assets/default/');
  assert.deepEqual(paths.petA.sprites.idle.frames, ['assets/default/left.webp']);
  assert.equal(paths.petA.sprites.walkingLeft.frames[0], 'assets/default/yueqi/walk_left01.webp');
  assert.equal(paths.imageMap.shenjiu.meditating, 'assets/default/right_cultivate.webp');
  assert.equal(paths.imageMap.yueqi.eating, 'assets/default/left_eat.webp');
});

test('SkinManager builds custom WebP skin paths', () => {
  const sm = new SkinManager();
  const paths = sm.buildPaths('qban');

  assert.equal(paths.petA.image, 'assets/qban/left.webp');
  assert.equal(paths.petB.image, 'assets/qban/right.webp');
  assert.equal(paths.petA.sprites.walkingRight.frames[2], 'assets/qban/yueqi/walk_right03.webp');
  assert.equal(paths.imageMap.shenjiu.hungry, 'assets/qban/right_hungry.webp');
});

test('SkinManager.applySkin updates current skin and pets', async () => {
  const sm = new SkinManager();
  const petA = createFakePet('yueqi');
  const petB = createFakePet('shenjiu');

  await sm.applySkin('qban', { petA, petB, spriteView: null, renderer: null });

  assert.equal(sm.getCurrentSkin(), 'qban');
  assert.equal(petA.image, 'assets/qban/left.webp');
  assert.equal(petB.image, 'assets/qban/right.webp');
  assert.equal(petA.sprites.idle.frames[0], 'assets/qban/left.webp');
});

test('SkinManager.applySkin updates renderer prefix', async () => {
  const sm = new SkinManager();
  const renderer = new PetRenderer(null);

  await sm.applySkin('qban', { petA: null, petB: null, spriteView: null, renderer });

  assert.equal(renderer.skinPrefix, 'assets/qban/');
});

test('SpriteView.updateImageMap replaces the image map', () => {
  const sv = new SpriteView();

  assert.equal(sv.imageMap.shenjiu.meditating, 'assets/default/right_cultivate.webp');

  sv.updateImageMap({
    shenjiu: { meditating: 'assets/qban/right_cultivate.webp' },
    yueqi: { meditating: 'assets/qban/left_cultivate.webp' },
  });

  assert.equal(sv.imageMap.shenjiu.meditating, 'assets/qban/right_cultivate.webp');
  assert.equal(sv.imageMap.yueqi.meditating, 'assets/qban/left_cultivate.webp');
});

test('SpriteView uses direction-specific second walking frames for visible greetings', () => {
  const sv = new SpriteView();
  const yueqi = createFakePet('yueqi');
  const shenjiu = createFakePet('shenjiu');

  yueqi.state = 'interacting';
  yueqi.direction = 'right';
  yueqi.sprites.walkingRight = {
    frames: ['assets/default/yueqi/walk_right01.webp', 'assets/default/yueqi/walk_right02.webp'],
    fps: 4,
  };

  shenjiu.state = 'interacting';
  shenjiu.direction = 'left';
  shenjiu.sprites.walkingLeft = {
    frames: ['assets/default/shenjiu/walk_left01.webp', 'assets/default/shenjiu/walk_left02.webp'],
    fps: 4,
  };

  assert.deepEqual(
    sv._resolveResource(yueqi),
    { src: 'assets/default/yueqi/walk_right02.webp', type: 'image' }
  );
  assert.deepEqual(
    sv._resolveResource(shenjiu),
    { src: 'assets/default/shenjiu/walk_left02.webp', type: 'image' }
  );
});

test('SpriteView.reattach clears render cache', async () => {
  const sv = new SpriteView();
  const pet = createFakePet('yueqi');

  pet._sv_lastResource = 'assets/default/left.webp';
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
          hungry: 'assets/default/left_hungry.webp',
        },
      },
    });
    const pet = createFakePet('yueqi');
    pet.sprites.walkingLeft = {
      frames: [
        'assets/default/yueqi/walk_left01.webp',
        'assets/default/yueqi/walk_left02.webp',
      ],
      fps: 4,
    };

    await sv.reattach(pet);

    assert.equal(createdImages.length, 4);
    assert.deepEqual(
      pet._sv_preloadedImages.map((image) => image.src),
      [
        'assets/default/left.webp',
        'assets/default/yueqi/walk_left01.webp',
        'assets/default/yueqi/walk_left02.webp',
        'assets/default/left_hungry.webp',
      ]
    );
  } finally {
    global.Image = originalImage;
  }
});

test('PetRenderer defaults and updates skin prefix', () => {
  const renderer = new PetRenderer(null);
  assert.equal(renderer.skinPrefix, 'assets/default/');

  renderer.setSkinPrefix('assets/qban/');
  assert.equal(renderer.skinPrefix, 'assets/qban/');
});
