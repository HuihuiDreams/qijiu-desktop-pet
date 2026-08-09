'use strict';
const Module = require('node:module');

/**
 * Temporarily patches Module.prototype.require to intercept 'electron' imports.
 * Returns a restore function — call it immediately after requiring the target module.
 *
 * @param {object} mockObj - The mock electron object to return.
 * @returns {() => void} restore - Call this to unpatch require.
 */
function setupElectronMock(mockObj) {
  const original = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === 'electron') return mockObj;
    return original.apply(this, arguments);
  };
  return () => { Module.prototype.require = original; };
}

module.exports = { setupElectronMock };
