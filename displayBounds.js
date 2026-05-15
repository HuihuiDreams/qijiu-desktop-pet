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

module.exports = {
  getVirtualDisplayBounds,
  getWalkAreasRelativeToBounds,
  intersectRects,
};
