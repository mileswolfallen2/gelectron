'use strict';

/**
 * Gelectron - app module (Electron compatible)
 */

const { EventEmitter } = require('events');
const path = require('path');

class App extends EventEmitter {
  constructor() {
    super();
    this._ready = false;
    this._paths = {
      home: require('os').homedir(),
      appData: path.join(require('os').homedir(), '.config', 'gelectron'),
      userData: path.join(require('os').homedir(), '.config', 'gelectron'),
      desktop: path.join(require('os').homedir(), 'Desktop'),
      documents: path.join(require('os').homedir(), 'Documents'),
      downloads: path.join(require('os').homedir(), 'Downloads'),
      temp: require('os').tmpdir(),
      exe: process.execPath,
      module: __dirname,
      crashDumps: path.join(require('os').homedir(), '.config', 'gelectron', 'crashDumps'),
      logs: path.join(require('os').homedir(), '.config', 'gelectron', 'logs'),
    };

    this._commandLine = new Map();
    this._dock = process.platform === 'darwin' ? {
      setIcon: (icon) => {
        console.log('[gelectron] dock.setIcon called');
      },
      bounce: () => 0,
      cancelBounce: () => {},
      setBadge: () => {},
      getBadge: () => '',
      hide: () => {},
      show: () => {},
      isVisible: () => true,
      setMenu: () => {},
      setBadgeCount: () => {},
      getBadgeCount: () => 0,
      setThumbnail: () => {},
      setThumbnailClip: () => {},
      setThumbnailToolTip: () => {},
      setMenu: () => {},
    } : null;

    this._argv = process.argv.slice();
  }

  get commandLine() {
    return {
      appendSwitch: (name, value) => {
        this._commandLine.set(name, value || '');
      },
      removeSwitch: (name) => {
        this._commandLine.delete(name);
      },
      getSwitch: (name) => {
        return this._commandLine.get(name) || '';
      },
      hasSwitch: (name) => {
        return this._commandLine.has(name);
      },
    };
  }

  get dock() {
    return this._dock;
  }

  get argv() {
    return this._argv;
  }

  get isPackaged() {
    return !process.argv[0].includes('node') && !process.argv[0].includes('gelectron');
  }

  get name() {
    return 'Gelectron App';
  }

  set name(val) {
    // no-op
  }

  get version() {
    return process.env.GELECTRON_VERSION || '0.1.0';
  }

  getPath(name) {
    return this._paths[name] || this._paths.userData;
  }

  setPath(name, path) {
    this._paths[name] = path;
  }

  getName() {
    return this.name;
  }

  getVersion() {
    return this.version;
  }

  getLocale() {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  }

  getUserAgent() {
    return `Gelectron/${this.version} (${process.platform} ${process.arch}) Node.js/${process.versions.node}`;
  }

  getPathForProtocol(protocol) {
    return null;
  }

  async whenReady() {
    if (this._ready) return;
    return new Promise((resolve) => {
      this.once('ready', resolve);
    });
  }

  async requestSingleInstanceLock() {
    this._ready = true;
    process.nextTick(() => this.emit('ready'));
    return true;
  }

  acquireSingleInstanceLock() {
    return true;
  }

  releaseSingleInstanceLock() {}

  async quit(exitCode = 0) {
    this.emit('before-quit');
    process.exit(exitCode);
  }

  exit(exitCode = 0) {
    process.exit(exitCode);
  }

  relaunch(options = {}) {
    process.exit(0);
  }

  isReady() {
    return this._ready;
  }

  addRecentDocument(path) {}
  clearRecentDocuments() {}
  setAppUserModelId(id) {}
  getAppUserModelId() {
    return '';
  }

  async showCertificateTrustDialog() {}

  on(eventName, listener) {
    super.on(eventName, listener);
    return this;
  }

  once(eventName, listener) {
    super.once(eventName, listener);
    return this;
  }

  getLoginItemSettings() {
    return { openAtLogin: false, openAsHidden: false };
  }

  setLoginItemSettings() {}

  isInApplicationsFolder() {
    return true;
  }

  moveToApplicationsFolder() {}

  getFileIcon(path, options, callback) {
    if (typeof options === 'function') {
      callback = options;
    }
    callback(null, null);
  }

  focus(options) {}
  hide() {}
  show() {}
  isVisible() {
    return true;
  }
  isHidden() {
    return false;
  }
  setAboutPanelOptions() {}
}

const app = new App();

module.exports = { app, App };
