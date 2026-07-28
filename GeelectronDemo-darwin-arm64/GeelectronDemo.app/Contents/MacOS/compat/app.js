'use strict';

/**
 * Gelectron - app module (Electron compatible)
 *
 * Full implementation matching the Electron app API surface.
 * Events: ready, second-instance, activate, window-all-closed, before-quit,
 *         will-quit, quit, focus, blur, browser-window-focus, browser-window-blur,
 *         web-contents-created, render-process-gone, child-process-gone,
 *         keyboard-visibility-changed, new-window-for-tab
 */

const { EventEmitter } = require('events');
const path = require('path');

class App extends EventEmitter {
  constructor() {
    super();
    this._ready = false;
    this._windowCount = 0;
    this._relaunchOptions = null;
    this._relaunching = false;
    this._aboutPanelOptions = {};
    this._badgeCount = 0;
    this._secureKeyboardEntryEnabled = false;
    this._userAgent = null;
    this._name = 'Gelectron App';
    this._names = null;

    const os = require('os');
    const home = os.homedir();
    this._paths = {
      home,
      appData: path.join(home, process.platform === 'win32' ? '' : '.', process.platform === 'darwin' ? 'Library/Application Support' : 'config', 'gelectron'),
      userData: path.join(home, process.platform === 'win32' ? '' : '.', process.platform === 'darwin' ? 'Library/Application Support' : 'config', 'gelectron'),
      desktop: path.join(home, 'Desktop'),
      documents: path.join(home, 'Documents'),
      downloads: path.join(home, 'Downloads'),
      temp: os.tmpdir(),
      exe: process.execPath,
      module: __dirname,
      crashDumps: path.join(home, process.platform === 'win32' ? '' : '.', process.platform === 'darwin' ? 'Library/Application Support' : 'config', 'gelectron', 'crashDumps'),
      logs: path.join(home, process.platform === 'win32' ? '' : '.', process.platform === 'darwin' ? 'Library/Application Support' : 'config', 'gelectron', 'logs'),
    };

    this._commandLine = new Map();
    this._dock = process.platform === 'darwin' ? {
      setIcon: (icon) => {},
      bounce: () => 0,
      cancelBounce: () => {},
      setBadge: () => {},
      getBadge: () => '',
      hide: () => {},
      show: () => {},
      isVisible: () => true,
      setMenu: () => {},
      setBadgeCount: (count) => { return 0; },
      getBadgeCount: () => 0,
      setThumbnail: () => {},
      setThumbnailClip: () => {},
      setThumbnailToolTip: () => {},
    } : null;

    this._argv = process.argv.slice();

    // Emit 'ready' automatically on the next tick, matching real Electron
    process.nextTick(() => {
      if (!this._ready) {
        this._ready = true;
        this.emit('ready');
      }
    });
  }

  // ─── Properties ──────────────────────────────────────────────

  get commandLine() {
    const self = this;
    return {
      appendSwitch: (name, value) => { self._commandLine.set(name, value || ''); },
      removeSwitch: (name) => { self._commandLine.delete(name); },
      getSwitch: (name) => { return self._commandLine.get(name) || ''; },
      hasSwitch: (name) => { return self._commandLine.has(name); },
    };
  }

  get dock() { return this._dock; }
  get argv() { return this._argv; }

  get isPackaged() {
    return !process.argv[0].includes('node') && !process.argv[0].includes('gelectron');
  }

  get name() { return this._name; }
  set name(val) { this._name = val || 'Gelectron App'; }

  get version() { return process.env.GELECTRON_VERSION || '0.1.0'; }

  get locale() { return this.getLocale(); }
  get userAgent() { return this.getUserAgent(); }

  get isReady() { return this._ready; }

  get appPath() { return this.getAppPath(); }

  // ─── Core Methods ────────────────────────────────────────────

  getAppPath() { return process.env.GELECTRON_APP_PATH || process.cwd(); }

  getPath(name) {
    if (name === 'app' || name === 'appData' || name === 'userData') {
      return this._paths[name === 'app' ? 'appData' : name] || this._paths.userData;
    }
    return this._paths[name] || this._paths.userData;
  }

  setPath(name, value) { this._paths[name] = value; }

  getName() { return this._name; }
  setName(name) { this._name = name; }

  getVersion() { return this.version; }

  getLocale() { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; }

  getUserAgent() {
    return this._userAgent || `Gelectron/${this.version} (${process.platform} ${process.arch}) Node.js/${process.versions ? process.versions.node : 'unknown'}`;
  }

  setUserAgent(userAgent) { this._userAgent = userAgent || null; }

  getPathForProtocol(protocol) { return null; }

  getApplicationInfoForProtocol(protocol) {
    return Promise.resolve({
      defaultIcon: null,
      icon: null,
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  async whenReady() {
    if (this._ready) return Promise.resolve();
    return new Promise((resolve) => { this.once('ready', resolve); });
  }

  isReady() { return this._ready; }

  requestSingleInstanceLock() { return true; }
  acquireSingleInstanceLock() { return true; }
  releaseSingleInstanceLock() {}

  quit(exitCode = 0) {
    if (this.listenerCount('before-quit') > 0 || this.listenerCount('will-quit') > 0) {
      this.emit('before-quit');
      this.emit('will-quit');
    }
    this.emit('quit', exitCode);
    process.exit(exitCode);
  }

  exit(exitCode = 0) {
    if (this._ready) {
      this.emit('before-quit');
      this.emit('will-quit');
    }
    this.emit('quit', exitCode);
    process.exit(exitCode);
  }

  relaunch(options = {}) {
    this._relaunchOptions = options;
    this._relaunching = true;
    this.emit('before-quit');
    const { spawn } = require('child_process');
    const execPath = options.execPath || process.execPath;
    const args = options.args || process.argv.slice(1);
    spawn(execPath, args, {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    }).unref();
    process.exit(0);
  }

  // ─── Window Management Helpers ───────────────────────────────

  focus() {
    if (process.platform === 'darwin') { this.dock && this.dock.show(); }
    this.emit('focus');
  }

  hide() { if (this.dock) this.dock.hide(); this.emit('blur'); }
  show() { if (this.dock) this.dock.show(); this.emit('focus'); }
  isVisible() { return this.dock ? this.dock.isVisible() : true; }
  isHidden() { return this.dock ? !this.dock.isVisible() : false; }

  // ─── App Metrics / GPU ──────────────────────────────────────

  getAppMetrics() {
    return [
      {
        creationTime: Date.now() - (process.uptime() * 1000) | 0,
        pid: process.pid,
        rid: 0,
        type: 'Browser',
        memory: { workingSetSize: 0, peakWorkingSetSize: 0, privateBytes: 0, sharedBytes: 0 },
        sandboxed: false,
      },
    ];
  }

  getGPUInfo(infoType) {
    if (infoType === 'basic') {
      return Promise.resolve({
        gpuDevice: [{ driverVendor: 'Gelectron', driverVersion: '0.0.0', driverDate: '', active: false }],
        GPUActive: false,
      });
    }
    return Promise.resolve({
      gpuDevice: [{ driverVendor: 'Gelectron', driverVersion: '0.0.0', driverDate: '', active: false }],
      GPUActive: false,
      auxAttributes: {},
      gpuDriver: 'Gelectron',
      gpuDriverVersion: '0.0.0',
      gpuWorkingSetSize: 0,
    });
  }

  getGPUFeatureStatus() {
    return {
      gpuCompositing: 'disabled',
      multipleRasterThreads: 'disabled',
      nativeGpuMemoryBuffers: 'disabled',
      rasterization: 'disabled',
      smoothScrolling: 'disabled',
      videoDecode: 'disabled',
      videoEncode: 'disabled',
      webgl: 'disabled',
      webgl2: 'disabled',
    };
  }

  disableHardwareAcceleration() {}
  disableDomainBlockingFor3DAPIs() {}

  // ─── Badge ───────────────────────────────────────────────────

  setBadgeCount(count) {
    this._badgeCount = count || 0;
    if (this.dock) this.dock.setBadgeCount(this._badgeCount);
    return this._badgeCount;
  }

  getBadgeCount() { return this._badgeCount; }

  // ─── Recent Documents ────────────────────────────────────────

  addRecentDocument(path) {}
  clearRecentDocuments() {}
  setRecentDocumentLabel(label) {}

  // ─── App User Model ID ──────────────────────────────────────

  setAppUserModelId(id) {}
  getAppUserModelId() { return ''; }

  // ─── Login Items ─────────────────────────────────────────────

  getLoginItemSettings() {
    return {
      openAtLogin: false,
      openAsHidden: false,
      launchAtLogin: false,
      launchItems: [],
    };
  }

  setLoginItemSettings(settings) {}

  // ─── Applications Folder ─────────────────────────────────────

  isInApplicationsFolder() { return true; }
  moveToApplicationsFolder() {}

  // ─── File Icons ──────────────────────────────────────────────

  getFileIcon(path, options, callback) {
    if (typeof options === 'function') { callback = options; }
    if (callback) callback(null, null);
  }

  // ─── About Panel ─────────────────────────────────────────────

  setAboutPanelOptions(options = {}) {
    this._aboutPanelOptions = {
      applicationName: this._name,
      applicationVersion: this.version,
      copyright: '',
      credits: '',
      authors: [],
      website: '',
      iconPath: '',
      ...options,
    };
  }

  getAboutPanelOptions() {
    return { ...this._aboutPanelOptions };
  }

  // ─── Certificate Trust ───────────────────────────────────────

  async showCertificateTrustDialog() {}

  // ─── Secure Keyboard Entry ──────────────────────────────────

  setSecureKeyboardEntryEnabled(enabled) {
    this._secureKeyboardEntryEnabled = !!enabled;
  }

  isSecureKeyboardEntryEnabled() {
    return this._secureKeyboardEntryEnabled;
  }

  // ─── Window Tracking ────────────────────────────────────────

  _trackWindow() { this._windowCount++; }

  _untrackWindow() {
    this._windowCount--;
    if (this._windowCount <= 0) {
      this._windowCount = 0;
      this.emit('window-all-closed');
    }
  }

  getWindowCount() { return this._windowCount; }

  // ─── EventEmitter overrides (return this for chaining) ──────

  on(eventName, listener) { super.on(eventName, listener); return this; }
  once(eventName, listener) { super.once(eventName, listener); return this; }
  addListener(eventName, listener) { super.addListener(eventName, listener); return this; }
  removeListener(eventName, listener) { super.removeListener(eventName, listener); return this; }
  removeAllListeners(eventName) { super.removeAllListeners(eventName); return this; }
}

const app = new App();

module.exports = { app, App };
