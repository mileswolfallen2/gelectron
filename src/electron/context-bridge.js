'use strict';

/**
 * Gelectron - contextBridge module (Electron compatible)
 */

const contextBridge = {
  exposeInMainWorld(key, api) {
    if (typeof globalThis.window === 'undefined') {
      return;
    }

    // Create a frozen copy of the API
    const safeApi = deepFreeze(JSON.parse(JSON.stringify(api)));

    globalThis.window[key] = safeApi;

    console.log(`[gelectron] contextBridge: exposed '${key}' to main world`);
  },
};

function deepFreeze(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  Object.freeze(obj);
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Object.isFrozen(obj[key])) {
      deepFreeze(obj[key]);
    }
  });
  return obj;
}

module.exports = contextBridge;
