#!/usr/bin/env node

/**
 * Gelectron CLI - Run Electron apps with the Servo rendering engine.
 *
 * Usage:
 *   gelectron <path-to-app>       Run an Electron app
 *   gelectron --version           Print version
 *   gelectron --help              Show help
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const VERSION = require('../package.json').version;

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(`gelectron v${VERSION}`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  gelectron v${VERSION} - Firefox-engine Electron alternative

  Usage:
    gelectron <path-to-app>       Run an Electron app
    gelectron <file.js>           Run a main process script directly
    gelectron --version           Print version
    gelectron --help              Show this help

  Examples:
    gelectron .                   Run the app in the current directory
    gelectron ./my-app            Run a specific app
    gelectron main.js             Run a main process script directly

  Environment Variables:
    GELECTRON_DEV=1               Enable development mode
    GELECTRON_LOG=1               Enable verbose logging
    VITE_DEV_SERVER_URL=<url>     Connect to a Vite dev server
  `.trim());
  process.exit(0);
}

const appPath = path.resolve(args[0]);

if (!fs.existsSync(appPath)) {
  console.error(`gelectron: error: path not found: ${appPath}`);
  process.exit(1);
}

let mainScript;
let isPackaged = false;

if (fs.statSync(appPath).isDirectory()) {
  const pkgPath = path.join(appPath, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`gelectron: error: no package.json found in ${appPath}`);
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  mainScript = path.join(appPath, pkg.main || 'index.js');
  isPackaged = true;
} else {
  mainScript = appPath;
}

if (!fs.existsSync(mainScript)) {
  console.error(`gelectron: error: main script not found: ${mainScript}`);
  process.exit(1);
}

const nativeDir = path.join(__dirname, '..', 'crates', 'gelectron-core');
const platformSuffix = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
const archSuffix = process.arch === 'arm64' ? 'arm64' : 'x64';
const ext = process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so';
const napiPlatform = process.platform === 'win32' ? `${platformSuffix}-${archSuffix}-msvc` : process.platform === 'darwin' ? `${platformSuffix}-${archSuffix}` : `${platformSuffix}-${archSuffix}-gnu`;
const candidates = [
  path.join(nativeDir, `gelectron_core.${napiPlatform}.node`),
  path.join(__dirname, '..', `gelectron_core.${napiPlatform}.node`),
  path.join(__dirname, '..', 'npm', napiPlatform, `gelectron_core.${napiPlatform}.node`),
  path.join(nativeDir, 'release', `gelectron_core.${ext}`),
  path.join(nativeDir, 'debug', `gelectron_core.${ext}`),
  path.join(__dirname, '..', `gelectron_core.${ext}`),
  path.join(__dirname, '..', 'napi-dist', process.platform, process.arch, `gelectron_core.${ext}`),
];

let nativeAddonPath = null;
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    nativeAddonPath = candidate;
    break;
  }
}

const env = {
  ...process.env,
  GELECTRON_MAIN_SCRIPT: mainScript,
  GELECTRON_APP_PATH: isPackaged ? appPath : path.dirname(mainScript),
  GELECTRON_NATIVE_ADDON: nativeAddonPath || '',
  GELECTRON_VERSION: VERSION,
  GELECTRON_DEV: process.env.GELECTRON_DEV || '',
};

if (process.env.GELECTRON_LOG) {
  console.log(`[gelectron] main script: ${mainScript}`);
  console.log(`[gelectron] app path: ${env.GELECTRON_APP_PATH}`);
  console.log(`[gelectron] native addon: ${nativeAddonPath || 'not found (using build target)'}`);
}

const rustBin = path.join(__dirname, '..', 'target', 'release', 'gelectron');
const rustBinDebug = path.join(__dirname, '..', 'target', 'debug', 'gelectron');

let executable;
if (fs.existsSync(rustBin)) {
  executable = rustBin;
} else if (fs.existsSync(rustBinDebug)) {
  executable = rustBinDebug;
}

if (executable) {
  console.log(`[gelectron] Using native binary: ${executable}`);
  const child = spawn(executable, args, {
    env,
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  console.log(`[gelectron] Native binary not found. Run: cargo build --release -p gelectron`);
  console.log(`[gelectron] Falling back to Node.js runtime...\n`);

  require('../src/electron/runtime.js').run(mainScript, env);
}
