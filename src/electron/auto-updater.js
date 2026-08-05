'use strict';

/**
 * Gelectron - autoUpdater module (Electron compatible)
 *
 * Real implementation for packaged apps. Checks a feed (GitHub release or any
 * static host) for a `latest.yml` manifest, downloads the update archive, and
 * stages it for atomic application on next launch.
 *
 * The update archive produced by the packager is a full bundle (`payload/`
 * containing the app source, compat layer, bundled Node, and the engine
 * binary), so a single release ships both app and engine updates.
 *
 * How the swap works:
 *   1. `checkForUpdates()` fetches the manifest and compares versions.
 *   2. `downloadUpdate()` downloads the archive, verifies its sha512, extracts
 *      it next to the engine (`<engineDir>/.update/`), and writes a generated
 *      `apply.sh`/`apply.cmd` plus a `pending.json` marker.
 *   3. `quitAndInstall()` relaunches the app's launcher. The launcher runs the
 *      apply script (which atomically renames each payload item into place) and
 *      only then execs the new engine. Nothing is ever overwritten while a
 *      process is using it.
 *
 * API surface (Electron autoUpdater):
 *   events: error, checking-for-update, update-available, update-not-available,
 *           download-progress, update-downloaded, before-quit-for-update
 *   methods: setFeedURL(), getFeedURL(), checkForUpdates(), downloadUpdate(),
 *            quitAndInstall(), checkForAndNotifyIfAvailable()
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { bridge, isNative } = require('./native-bridge');

const IS_WINDOWS = process.platform === 'win32';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sha512File(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('hex');
}

// Minimal semver compare (ignores prerelease ordering nuances).
function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// Tolerantly parse the `latest.yml` manifest the packager writes.
function parseManifest(text) {
  const m = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const idx = raw.indexOf(':');
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key === 'version') m.version = value;
    else if (key === 'path') m.path = value;
    else if (key === 'sha512') m.sha512 = value.toLowerCase();
    else if (key === 'url') m.url = value;
  }
  return m;
}

function manifestUrl(feedUrl) {
  const url = String(feedUrl || '').trim();
  if (!url) return '';
  return /\.ya?ml$/i.test(url) ? url : url.replace(/\/?$/, '/') + 'latest.yml';
}

// Path to the engine binary (the file the launcher execs).
function engineFile() {
  const fromEnv = process.env.GELECTRON_ENGINE;
  if (fromEnv) return fromEnv;
  if (!IS_WINDOWS) return 'gelectron-bin';
  try {
    const exe = fs
      .readdirSync(path.dirname(process.execPath))
      .find((f) => f.toLowerCase().endsWith('.exe') && f.toLowerCase() !== 'node.exe');
    return exe || 'app.exe';
  } catch (e) {
    return 'app.exe';
  }
}

function binDir() {
  return path.dirname(process.execPath);
}

function updateDir() {
  return path.join(binDir(), '.update');
}

function applyScriptName() {
  return IS_WINDOWS ? 'apply.cmd' : 'apply.sh';
}

function hasPendingUpdate() {
  return fs.existsSync(path.join(updateDir(), applyScriptName()));
}

// Current app version — same source of truth as app.getVersion().
function currentVersion() {
  const appPath = process.env.GELECTRON_APP_PATH;
  if (appPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf8'));
      if (pkg && typeof pkg.version === 'string' && pkg.version) return pkg.version;
    } catch (e) {
      // Fall through to the engine version
    }
  }
  return process.env.GELECTRON_VERSION || '0.1.0';
}

function shQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// Generate a bash script that atomically swaps each payload item into place,
// restoring the previous file on failure so a partial update never sticks.
function generateBashApply(items) {
  const lines = ['#!/usr/bin/env bash', 'fail=0'];
  for (const it of items) {
    lines.push(`rm -rf ${shQuote(it.dest + '.bak')}`);
    lines.push(`if [ -e ${shQuote(it.dest)} ]; then mv ${shQuote(it.dest)} ${shQuote(it.dest + '.bak')}; fi`);
    lines.push(`if ! mv ${shQuote(it.src)} ${shQuote(it.dest)}; then`);
    lines.push(`  if [ -e ${shQuote(it.dest + '.bak')} ]; then mv ${shQuote(it.dest + '.bak')} ${shQuote(it.dest)}; fi`);
    lines.push('  fail=1');
    lines.push('else');
    lines.push(`  rm -rf ${shQuote(it.dest + '.bak')}`);
    lines.push('fi');
    if (it.type === 'file') lines.push(`chmod +x ${shQuote(it.dest)}`);
  }
  lines.push('if [ "$fail" -ne 0 ]; then exit 1; fi', 'exit 0');
  return lines.join('\n') + '\n';
}

// Windows counterpart using cmd built-ins.
function generateCmdApply(items) {
  const lines = ['@echo off', 'setlocal', 'set FAIL=0'];
  for (const it of items) {
    const bak = it.dest + '.bak';
    const delBak = it.type === 'dir' ? `rmdir /s /q "${bak}"` : `del /q "${bak}"`;
    lines.push(`if exist "${bak}" ${delBak}`);
    lines.push(`if exist "${it.dest}" move /y "${it.dest}" "${bak}" >nul`);
    lines.push(`if exist "${it.src}" move /y "${it.src}" "${it.dest}" >nul`);
    lines.push(`if not exist "${it.dest}" (`);
    lines.push(`  if exist "${bak}" move /y "${bak}" "${it.dest}" >nul`);
    lines.push('  set FAIL=1');
    lines.push(') else (');
    lines.push(`  if exist "${bak}" ${delBak}`);
    lines.push(')');
  }
  lines.push('if not "%FAIL%"=="0" exit /b 1');
  lines.push('exit /b 0');
  return lines.join('\r\n') + '\r\n';
}

// ─── AutoUpdater ────────────────────────────────────────────────────────────

class AutoUpdater extends EventEmitter {
  constructor() {
    super();
    this._updateInfo = null;
    this._feedURL = null;
    this.autoDownload = true;
    this.autoInstallOnAppQuit = false;
    this.autoRunAppAfterInstall = true;
    this._logger = console;
  }

  getFeedURL() {
    return this._feedURL;
  }

  setFeedURL(options) {
    if (typeof options === 'string') {
      this._feedURL = options;
    } else if (options && typeof options === 'object') {
      this._feedURL = options.url || this._feedURL;
    }
  }

  _log(level, ...args) {
    try {
      const logger = this._logger || console;
      if (logger && typeof logger[level] === 'function') logger[level]('[gelectron-auto-updater]', ...args);
    } catch (e) {
      // Never let logging break the updater
    }
  }

  async checkForUpdates() {
    if (!isNative) {
      return { updateInfo: null, isUpdateAvailable: false };
    }

    this.emit('checking-for-update');
    const feed = manifestUrl(this.getFeedURL());

    if (!feed) {
      const err = new Error('autoUpdater: feed URL is not set (call setFeedURL first)');
      this.emit('error', err);
      return { updateInfo: null, isUpdateAvailable: false, error: err };
    }

    try {
      const res = await fetch(feed, {
        redirect: 'follow',
        headers: { 'User-Agent': 'gelectron-auto-updater' },
      });
      if (!res.ok) throw new Error(`update manifest request failed: HTTP ${res.status}`);
      const manifest = parseManifest(await res.text());
      if (!manifest.version) throw new Error('update manifest is missing a version');

      const current = currentVersion();
      const updateInfo = {
        version: manifest.version,
        path: manifest.path,
        sha512: manifest.sha512,
        url: manifest.url || feed,
        releaseDate: new Date().toISOString(),
      };
      this._log('info', 'current=' + current + ' remote=' + manifest.version);

      if (compareVersions(manifest.version, current) > 0) {
        this._updateInfo = updateInfo;
        this.emit('update-available', updateInfo);

        let downloadPromise = null;
        if (this.autoDownload !== false) {
          downloadPromise = this.downloadUpdate().catch((e) => {
            this.emit('error', e);
          });
        }
        return { updateInfo, isUpdateAvailable: true, downloadPromise };
      }

      this.emit('update-not-available', { version: current });
      return { updateInfo: null, isUpdateAvailable: false };
    } catch (e) {
      this._log('error', e && e.message);
      this.emit('error', e);
      return { updateInfo: null, isUpdateAvailable: false, error: e };
    }
  }

  async downloadUpdate() {
    // Dedupe concurrent calls (autoDownload + an explicit app call) so the
    // archive is only ever downloaded once per update.
    if (this._downloadPromise) return this._downloadPromise;
    this._downloadPromise = this._doDownload().finally(() => {
      this._downloadPromise = null;
    });
    return this._downloadPromise;
  }

  async _doDownload() {
    const manifest = this._updateInfo;
    if (!manifest) throw new Error('no update available to download (run checkForUpdates first)');

    const feed = manifestUrl(this.getFeedURL());
    if (!feed) throw new Error('autoUpdater: feed URL is not set');

    const dir = updateDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, 'stage'), { recursive: true, force: true });

    const archiveUrl = manifest.path ? new URL(manifest.path, feed).toString() : manifest.url;
    const archivePath = path.join(dir, `${manifest.version}.tar.gz`);

    this._log('info', 'downloading ' + archiveUrl);
    this.emit('download-progress', { percent: 0, transferred: 0, total: 0 });

    const res = await fetch(archiveUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'gelectron-auto-updater' },
    });
    if (!res.ok) throw new Error(`update download failed: HTTP ${res.status}`);

    const total = parseInt(res.headers.get('content-length') || '0', 10);
    let received = 0;
    const writer = fs.createWriteStream(archivePath);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      writer.write(value);
      if (total > 0) {
        this.emit('download-progress', {
          percent: Math.round((received / total) * 100),
          transferred: received,
          total,
        });
      }
    }
    writer.end();
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    if (manifest.sha512) {
      const actual = sha512File(archivePath);
      if (actual !== manifest.sha512) {
        throw new Error(`update integrity check failed: sha512 mismatch`);
      }
      this._log('info', 'sha512 verified');
    }

    const stage = path.join(dir, 'stage');
    fs.mkdirSync(stage, { recursive: true });
    const extract = spawnSync('tar', ['-xzf', archivePath, '-C', stage], { encoding: 'utf8' });
    if (extract.error || extract.status !== 0) {
      throw new Error(`failed to extract update: ${(extract.error && extract.error.message) || (extract.stderr || '').trim()}`);
    }

    const payloadDir = path.join(stage, 'payload');
    if (!fs.existsSync(payloadDir)) throw new Error('update archive is missing payload/');

    this._writeApplyScript(payloadDir, manifest.version);
    const result = { ...manifest, version: manifest.version, downloadedFile: archivePath };
    this.emit('update-downloaded', result);
    this._log('info', 'update staged; relaunch to apply');
    return result;
  }

  _writeApplyScript(payloadDir, version) {
    const appDir = process.env.GELECTRON_APP_PATH;
    const bdir = binDir();
    const items = [];

    const maybe = (name, type, dest) => {
      if (fs.existsSync(path.join(payloadDir, name))) {
        items.push({ name, type, src: path.join(payloadDir, name), dest });
      }
    };

    if (appDir) maybe('app', 'dir', appDir);
    maybe('compat', 'dir', path.join(bdir, 'compat'));
    maybe('node', 'file', path.join(bdir, path.basename(process.execPath)));
    maybe('engine', 'file', path.join(bdir, engineFile()));
    maybe('lib', 'dir', path.join(bdir, 'lib'));

    if (items.length === 0) throw new Error('update archive contains nothing to install');

    const script = IS_WINDOWS ? generateCmdApply(items) : generateBashApply(items);
    const scriptPath = path.join(updateDir(), applyScriptName());
    fs.writeFileSync(scriptPath, script, { mode: 0o755 });
    fs.writeFileSync(
      path.join(updateDir(), 'pending.json'),
      JSON.stringify({ version, applied: false }, null, 2),
    );
  }

  quitAndInstall(isSilent = false, isForceRunAfter = false) {
    this.emit('before-quit-for-update');
    this._log('info', 'quitAndInstall called');

    // Break the relaunch loop: the first call relaunches the launcher (so it
    // applies the staged update before the app starts again). The relaunched
    // process inherits GELECTRON_RELAUNCHED=1, so its own quitAndInstall call
    // (or one from an app that auto-installs on startup) exits instead of
    // relaunching a second time.
    if (this._relaunched || process.env.GELECTRON_RELAUNCHED === '1') {
      this._log('info', 'already relaunched; skipping relaunch');
      setTimeout(() => process.exit(0), 300);
      return;
    }

    const launcher = process.env.GELECTRON_LAUNCHER;
    const pending = hasPendingUpdate();

    if (pending && launcher) {
      this._relaunched = true;
      process.env.GELECTRON_RELAUNCHED = '1';
      if (IS_WINDOWS) {
        // The launcher is a .vbs file — spawn wscript directly so the swap
        // runs before the engine starts, then let Rust quit.
        const child = spawn('wscript.exe', [launcher], { detached: true, stdio: 'ignore' });
        child.unref();
        bridge.quit();
      } else {
        bridge.relaunch(launcher, []);
      }
    } else {
      bridge.quit();
    }

    // Force the Node child process to exit so it never blocks the swap of the
    // bundled node/engine (the Rust side exits its event loop around the same
    // time; the timer guarantees node is gone before the relaunched launcher
    // runs the apply script).
    setTimeout(() => process.exit(0), 300);
  }

  async checkForAndNotifyIfAvailable() {
    return this.checkForUpdates();
  }

  quitAndInstallAgain(isSilent = false, isForceRunAfter = false) {
    this.quitAndInstall(isSilent, isForceRunAfter);
  }

  disableDifferentialDownload() {}

  async updateDownloaded() {
    return hasPendingUpdate();
  }

  get isUpdateActive() {
    return false;
  }

  get updateInfo() {
    return this._updateInfo;
  }

  get logger() {
    return this._logger;
  }

  set logger(val) {
    this._logger = val;
  }
}

const autoUpdater = new AutoUpdater();

module.exports = { autoUpdater, AutoUpdater };
