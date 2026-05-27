function areWindowBoundsEqual(a, b) {
  return Boolean(a && b)
    && Number(a.x) === Number(b.x)
    && Number(a.y) === Number(b.y)
    && Number(a.width) === Number(b.width)
    && Number(a.height) === Number(b.height);
}

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function getResizeBridgeConstraints(currentBounds, targetBounds) {
  const currentWidth = Number(currentBounds?.width);
  const currentHeight = Number(currentBounds?.height);
  const targetWidth = Number(targetBounds?.width);
  const targetHeight = Number(targetBounds?.height);

  if (!isPositiveFiniteNumber(currentWidth)
    || !isPositiveFiniteNumber(currentHeight)
    || !isPositiveFiniteNumber(targetWidth)
    || !isPositiveFiniteNumber(targetHeight)) {
    return null;
  }

  return {
    minWidth: Math.max(1, Math.floor(Math.min(currentWidth, targetWidth))),
    minHeight: Math.max(1, Math.floor(Math.min(currentHeight, targetHeight))),
    maxWidth: Math.max(1, Math.ceil(Math.max(currentWidth, targetWidth))),
    maxHeight: Math.max(1, Math.ceil(Math.max(currentHeight, targetHeight))),
  };
}

function createDisplayFitScheduler(options) {
  const fitNow = options?.fitNow;
  if (typeof fitNow !== 'function') {
    throw new TypeError('createDisplayFitScheduler requires fitNow');
  }

  const delayMs = Number.isFinite(options?.delayMs) ? options.delayMs : 250;
  const setTimeoutFn = options?.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options?.clearTimeoutFn || clearTimeout;
  let timer = null;

  const clear = () => {
    if (timer === null) return;
    clearTimeoutFn(timer);
    timer = null;
  };

  const schedule = () => {
    clear();
    timer = setTimeoutFn(() => {
      timer = null;
      fitNow();
    }, delayMs);
  };

  return {
    schedule,
    clear,
    isPending: () => timer !== null,
  };
}

module.exports = {
  areWindowBoundsEqual,
  getResizeBridgeConstraints,
  createDisplayFitScheduler,
};
