'use strict';

/**
 * Gelectron Runtime - Node.js fallback when native binary is not available.
 * Loads and runs an Electron app's main process using the JS compatibility layer.
 */

const path = require('path');
const Module = require('module');

function run(mainScript, env) {
  // Set up the environment
  Object.assign(process.env, env);

  // Patch require so that 'electron' resolves to gelectron's compat layer
  const electronCompatPath = path.join(__dirname, 'index.js');

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'electron') {
      return electronCompatPath;
    }
    if (request === 'electron/main') {
      return electronCompatPath;
    }
    if (request === 'electron/renderer') {
      return path.join(__dirname, 'ipc-renderer.js');
    }
    if (request === 'electron/common') {
      return electronCompatPath;
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  // Require the app's main script
  try {
    require(mainScript);
  } catch (err) {
    console.error(`[gelectron] Error loading main script: ${mainScript}`);
    console.error(err);
    process.exit(1);
  }
}

module.exports = { run };
