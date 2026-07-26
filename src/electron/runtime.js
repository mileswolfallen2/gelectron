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
  const ipcRendererPath = path.join(__dirname, 'ipc-renderer.js');

  // Purge any cached 'electron' module from the real npm package so that
  // our _resolveFilename patch takes absolute priority.  The real 'electron'
  // npm package (devDependency in the target app) exports a *path string*
  // to the Electron binary – it does NOT have .autoUpdater, .app, etc.
  for (const key of Object.keys(Module._cache)) {
    const normalized = key.replace(/\\/g, '/');
    if (
      normalized.endsWith('/electron') ||
      normalized.endsWith('/electron/index.js') ||
      normalized.endsWith('/electron/index.cjs')
    ) {
      delete Module._cache[key];
    }
  }

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'electron' || request === 'electron/main' || request === 'electron/common') {
      return electronCompatPath;
    }
    if (request === 'electron/renderer') {
      return ipcRendererPath;
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  // Also monkey-patch Module._resolveRequest for Node ≥ 22 where it may
  // be used internally instead of _resolveFilename.
  if (typeof Module._resolveRequest === 'function') {
    const originalResolveRequest = Module._resolveRequest;
    Module._resolveRequest = function (request, parent, isMain, options) {
      if (request === 'electron' || request === 'electron/main' || request === 'electron/common') {
        return electronCompatPath;
      }
      if (request === 'electron/renderer') {
        return ipcRendererPath;
      }
      return originalResolveRequest.call(this, request, parent, isMain, options);
    };
  }

  // Pre-load the gelectron shim into the module cache so that every
  // subsequent require('electron') hits cache immediately.
  require(electronCompatPath);

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
