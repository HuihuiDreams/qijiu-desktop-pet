function getVirtualDisplayBounds(displays) {
  if (!Array.isArray(displays) || displays.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const boundsList = displays
    .map((display) => display && display.bounds)
    .filter((bounds) => (
      bounds
      && Number.isFinite(bounds.x)
      && Number.isFinite(bounds.y)
      && Number.isFinite(bounds.width)
      && Number.isFinite(bounds.height)
      && bounds.width > 0
      && bounds.height > 0
    ));

  if (boundsList.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.min(...boundsList.map((bounds) => bounds.x));
  const top = Math.min(...boundsList.map((bounds) => bounds.y));
  const right = Math.max(...boundsList.map((bounds) => bounds.x + bounds.width));
  const bottom = Math.max(...boundsList.map((bounds) => bounds.y + bounds.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function isValidRect(rect) {
  return Boolean(rect)
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function intersectRects(a, b) {
  if (!isValidRect(a) || !isValidRect(b)) return null;

  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) return null;
  return { x: left, y: top, width, height };
}

function getScaleFactor(display, fallback = 1) {
  const scaleFactor = Number(display?.scaleFactor);
  return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : fallback;
}

function getWalkAreasRelativeToBounds(displays, windowBounds, windowScaleFactor = 1) {
  if (!Array.isArray(displays) || !isValidRect(windowBounds)) return [];
  const baseScaleFactor = Number.isFinite(windowScaleFactor) && windowScaleFactor > 0
    ? windowScaleFactor
    : 1;

  return displays
    .map((display) => {
      const bounds = display?.bounds;
      if (!isValidRect(bounds)) return null;

      const rawArea = isValidRect(display?.workArea) ? display.workArea : bounds;
      const area = intersectRects(rawArea, bounds);
      if (!area) return null;

      const scaleRatio = getScaleFactor(display, baseScaleFactor) / baseScaleFactor;

      return {
        x: bounds.x - windowBounds.x + (area.x - bounds.x) * scaleRatio,
        y: bounds.y - windowBounds.y + (area.y - bounds.y) * scaleRatio,
        width: area.width * scaleRatio,
        height: area.height * scaleRatio,
        scaleRatio,
      };
    })
    .filter(Boolean);
}

function rectRelativeToBounds(rect, windowBounds) {
  if (!isValidRect(rect) || !isValidRect(windowBounds)) return null;
  return {
    x: rect.x - windowBounds.x,
    y: rect.y - windowBounds.y,
    width: rect.width,
    height: rect.height,
  };
}

function getTaskbarPlatformsRelativeToBounds(displays, windowBounds, windowScaleFactor = 1, options = {}) {
  if (!Array.isArray(displays) || !isValidRect(windowBounds)) return [];
  const baseScaleFactor = Number.isFinite(windowScaleFactor) && windowScaleFactor > 0
    ? windowScaleFactor
    : 1;
  const platformHeight = Number.isFinite(options.platformHeight) ? options.platformHeight : 48;
  const petFootOffset = Number.isFinite(options.petFootOffset) ? options.petFootOffset : 24;
  const minPlatformWidth = Number.isFinite(options.minPlatformWidth) ? options.minPlatformWidth : 120;
  const minTaskbarThickness = Number.isFinite(options.minTaskbarThickness)
    ? options.minTaskbarThickness
    : 8;

  return displays
    .map((display) => {
      const bounds = display?.bounds;
      if (!isValidRect(bounds) || !isValidRect(display?.workArea)) return null;

      const workArea = intersectRects(display.workArea, bounds);
      if (!workArea) return null;

      const boundsBottom = bounds.y + bounds.height;
      const workAreaBottom = workArea.y + workArea.height;
      const bottomTaskbarHeight = boundsBottom - workAreaBottom;
      if (bottomTaskbarHeight < minTaskbarThickness || workArea.width < minPlatformWidth) {
        return null;
      }

      const scaleRatio = getScaleFactor(display, baseScaleFactor) / baseScaleFactor;
      const x = bounds.x - windowBounds.x + (workArea.x - bounds.x) * scaleRatio;
      const edgeY = bounds.y - windowBounds.y + (workAreaBottom - bounds.y) * scaleRatio;

      return {
        x,
        y: edgeY - petFootOffset,
        width: workArea.width * scaleRatio,
        height: platformHeight,
        scaleRatio,
        source: 'taskbar-edge',
        displayId: display.id,
      };
    })
    .filter(Boolean);
}

function getActiveWindowPlatformRelativeToBounds(activeWindowInfo, windowBounds, displays, options = {}) {
  const windowInfo = activeWindowInfo?.window;
  const activeBounds = windowInfo?.bounds;
  if (!activeWindowInfo?.active || !isValidRect(activeBounds) || !isValidRect(windowBounds)) {
    return null;
  }

  if (windowInfo.isMinimized || windowInfo.isMaximized || windowInfo.isFullScreen) {
    return null;
  }

  const platformHeight = Number.isFinite(options.platformHeight) ? options.platformHeight : 48;
  const petFootOffset = Number.isFinite(options.petFootOffset) ? options.petFootOffset : 24;
  const minPlatformWidth = Number.isFinite(options.minPlatformWidth) ? options.minPlatformWidth : 120;
  const absolutePlatform = {
    x: activeBounds.x,
    y: activeBounds.y - petFootOffset,
    width: activeBounds.width,
    height: platformHeight,
  };

  const displayList = Array.isArray(displays) ? displays : [];
  const clipped = displayList
    .map((display) => {
      const displayBounds = display?.bounds;
      if (!isValidRect(displayBounds)) return null;
      const rawArea = isValidRect(display?.workArea) ? display.workArea : displayBounds;
      const usableDisplay = intersectRects(rawArea, displayBounds);
      return usableDisplay ? intersectRects(absolutePlatform, usableDisplay) : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]
    || intersectRects(absolutePlatform, windowBounds);

  if (!clipped || clipped.width < minPlatformWidth || clipped.height <= 0) return null;

  return {
    ...rectRelativeToBounds(clipped, windowBounds),
    source: 'active-window-top',
  };
}

module.exports = {
  getActiveWindowPlatformRelativeToBounds,
  getTaskbarPlatformsRelativeToBounds,
  getVirtualDisplayBounds,
  getWalkAreasRelativeToBounds,
  intersectRects,
};
