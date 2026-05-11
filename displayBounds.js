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

module.exports = {
  getVirtualDisplayBounds,
};
