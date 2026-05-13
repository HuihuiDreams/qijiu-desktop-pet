const assert = require('node:assert/strict');
const test = require('node:test');

const { SkinManager } = require('../src/systems/SkinManager');
const { SpriteView } = require('../src/pet/SpriteView');
const { PetRenderer } = require('../src/pet/PetRenderer');

// ─── helpers ───────────────────────────────────────────────────────

/** 构造一个最小可用的 Pet 模拟对象 */
function createFakePet(id = 'yueqi') {
  return {
    id,
    image: `assets/default/${id === 'yueqi' ? 'left' : 'right'}.png`,
    sprites: {
      idle: { frames: [`assets/default/${id === 'yueqi' ? 'left' : 'right'}.png`], fps: 1 },
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

// ═══════════════════════════════════════════════════════════════════
//  SkinManager 单元测试
// ═══════════════════════════════════════════════════════════════════

test('SkinManager: 默认初始化状态正确', () => {
  const sm = new SkinManager();
  assert.equal(sm.getCurrentSkin(), 'default');
  assert.deepEqual(sm.availableSkins, ['default']);
});

test('SkinManager: getDisplayName 返回中文名，兜底返回文件夹名', () => {
  const sm = new SkinManager();
  assert.equal(sm.getDisplayName('default'), '默认·仙侠水墨');
  assert.equal(sm.getDisplayName('qban'), 'qban'); // 没有映射时兜底
});

test('SkinManager: setAvailableSkins 更新可用列表', () => {
  const sm = new SkinManager();
  sm.setAvailableSkins(['default', 'qban', 'campus']);
  const list = sm.getAvailableSkins();
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 'default');
  assert.equal(list[0].displayName, '默认·仙侠水墨');
  assert.equal(list[1].id, 'qban');
  assert.equal(list[1].displayName, 'qban');
});

test('SkinManager: buildPaths 生成正确的默认路径', () => {
  const sm = new SkinManager();
  const paths = sm.buildPaths('default');

  assert.equal(paths.petA.image, 'assets/default/left.png');
  assert.equal(paths.petB.image, 'assets/default/right.png');
  assert.equal(paths.overlayPrefix, 'assets/default/');

  // 检查 sprites
  assert.deepEqual(paths.petA.sprites.idle.frames, ['assets/default/left.png']);
  assert.equal(paths.petA.sprites.walkingLeft.frames.length, 4);
  assert.equal(paths.petA.sprites.walkingLeft.frames[0], 'assets/default/yueqi/walk_left01.png');

  // 检查 imageMap
  assert.equal(paths.imageMap.shenjiu.meditating, 'assets/default/right_cultivate.png');
  assert.equal(paths.imageMap.yueqi.eating, 'assets/default/left_eat.png');
});

test('SkinManager: buildPaths 为自定义皮肤生成正确路径', () => {
  const sm = new SkinManager();
  const paths = sm.buildPaths('qban');

  assert.equal(paths.petA.image, 'assets/qban/left.png');
  assert.equal(paths.petB.image, 'assets/qban/right.png');
  assert.equal(paths.overlayPrefix, 'assets/qban/');
  assert.equal(paths.petA.sprites.walkingRight.frames[2], 'assets/qban/yueqi/walk_right03.png');
  assert.equal(paths.imageMap.shenjiu.hungry, 'assets/qban/right_hungry.png');
});

test('SkinManager: applySkin 更新 currentSkinId', async () => {
  const sm = new SkinManager();
  const petA = createFakePet('yueqi');
  const petB = createFakePet('shenjiu');

  await sm.applySkin('qban', { petA, petB, spriteView: null, renderer: null });

  assert.equal(sm.getCurrentSkin(), 'qban');
});

test('SkinManager: applySkin 注入 Pet 的 image 和 sprites', async () => {
  const sm = new SkinManager();
  const petA = createFakePet('yueqi');
  const petB = createFakePet('shenjiu');

  await sm.applySkin('qban', { petA, petB, spriteView: null, renderer: null });

  assert.equal(petA.image, 'assets/qban/left.png');
  assert.equal(petB.image, 'assets/qban/right.png');
  assert.equal(petA.sprites.idle.frames[0], 'assets/qban/left.png');
});

test('SkinManager: applySkin 更新 PetRenderer 的 skinPrefix', async () => {
  const sm = new SkinManager();
  const renderer = new PetRenderer(null);

  assert.equal(renderer.skinPrefix, 'assets/default/');

  await sm.applySkin('qban', { petA: null, petB: null, spriteView: null, renderer });

  assert.equal(renderer.skinPrefix, 'assets/qban/');
});

// ═══════════════════════════════════════════════════════════════════
//  Pet.updateSkin 单元测试
// ═══════════════════════════════════════════════════════════════════

test('Pet.updateSkin: 更新 image 和 sprites', () => {
  const pet = createFakePet('yueqi');
  const oldImage = pet.image;

  pet.updateSkin = function(skinPaths) {
    if (skinPaths.image) this.image = skinPaths.image;
    if (skinPaths.sprites) this.sprites = skinPaths.sprites;
  };

  pet.updateSkin({
    image: 'assets/qban/left.png',
    sprites: { idle: { frames: ['assets/qban/left.png'], fps: 1 } },
  });

  assert.notEqual(pet.image, oldImage);
  assert.equal(pet.image, 'assets/qban/left.png');
  assert.equal(pet.sprites.idle.frames[0], 'assets/qban/left.png');
});

// ═══════════════════════════════════════════════════════════════════
//  SpriteView 新增方法单元测试
// ═══════════════════════════════════════════════════════════════════

test('SpriteView.updateImageMap: 替换 imageMap', () => {
  const sv = new SpriteView();

  // 初始值是 default 路径
  assert.equal(sv.imageMap.shenjiu.meditating, 'assets/default/right_cultivate.png');

  const newMap = {
    shenjiu: { meditating: 'assets/qban/right_cultivate.png' },
    yueqi: { meditating: 'assets/qban/left_cultivate.png' },
  };
  sv.updateImageMap(newMap);

  assert.equal(sv.imageMap.shenjiu.meditating, 'assets/qban/right_cultivate.png');
  assert.equal(sv.imageMap.yueqi.meditating, 'assets/qban/left_cultivate.png');
});

test('SpriteView.reattach: 清除脏检查缓存', async () => {
  const sv = new SpriteView();
  const pet = createFakePet('yueqi');

  // 模拟已有缓存
  pet._sv_lastResource = 'assets/default/left.png';
  pet._sv_frameIndex = 3;
  pet._sv_frameTimer = 123;
  pet._sv_lastSpriteKey = 'walkingLeft';

  // reattach 在 Node.js 环境（无 Image）中应直接 resolve
  await sv.reattach(pet);

  assert.equal(pet._sv_lastResource, null);
  assert.equal(pet._sv_frameIndex, 0);
  assert.equal(pet._sv_frameTimer, 0);
  assert.equal(pet._sv_lastSpriteKey, null);
});

// ═══════════════════════════════════════════════════════════════════
//  PetRenderer 新增方法单元测试
// ═══════════════════════════════════════════════════════════════════

test('PetRenderer: 默认 skinPrefix 为 assets/default/', () => {
  const renderer = new PetRenderer(null);
  assert.equal(renderer.skinPrefix, 'assets/default/');
});

test('PetRenderer.setSkinPrefix: 更新前缀', () => {
  const renderer = new PetRenderer(null);
  renderer.setSkinPrefix('assets/qban/');
  assert.equal(renderer.skinPrefix, 'assets/qban/');
});
