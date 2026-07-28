(function() {
'use strict';

/* ─── process polyfill ────────────────────────────────────────────── */
if (typeof process === 'undefined') {
  var _ua = navigator.userAgent || '';
  var _isMac = /Mac/.test(navigator.platform || _ua);
  var _isWin = /Win/.test(navigator.platform || _ua);
  window.process = {
    pid: Math.floor(Math.random() * 90000 + 10000),
    ppid: 0,
    argv: ['gelectron', ''],
    env: { GELECTRON_NATIVE: '0', HOME: '/tmp', PATH: '' },
    platform: _isMac ? 'darwin' : _isWin ? 'win32' : 'linux',
    arch: (navigator.userAgentData && navigator.userAgentData.arch) || 'x64',
    version: 'v18.0.0',
    versions: { node: '18.0.0', v8: '10.0.0', electron: '0.1.0', gelectron: '0.1.0' },
    execPath: 'gelectron',
    cwd: function() { return '/'; },
    nextTick: function(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      setTimeout(function() { fn.apply(null, args); }, 0);
    },
    exit: function() { /* no-op in WebView */ },
    on: function() { return process; },
    once: function() { return process; },
    removeListener: function() { return process; },
    removeAllListeners: function() { return process; },
    emit: function() { return false; },
    stdout: { write: function() {}, on: function() {} },
    stderr: { write: function() {}, on: function() {} },
    stdin: { on: function() {}, setEncoding: function() {} },
    stdout_columns: 80,
  };
}
var process = window.process;

/* ─── __dirname / __filename ─────────────────────────────────────── */
if (typeof __dirname === 'undefined') window.__dirname = '/gelectron';
if (typeof __filename === 'undefined') window.__filename = '/gelectron/webview-bundle.js';
var __dirname = window.__dirname;

/* ─── Buffer polyfill ────────────────────────────────────────────── */
if (typeof Buffer === 'undefined') {
  window.Buffer = {
    alloc: function(size, fill) {
      var arr = new Uint8Array(size);
      if (fill !== undefined) arr.fill(typeof fill === 'number' ? fill : 0);
      return arr;
    },
    from: function(data, enc) {
      if (typeof data === 'string') {
        if (enc === 'base64') return Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
        if (enc === 'hex') {
          var bytes = new Uint8Array(data.length / 2);
          for (var i = 0; i < data.length; i += 2) bytes[i / 2] = parseInt(data.substr(i, 2), 16);
          return bytes;
        }
        return new TextEncoder().encode(data);
      }
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (Array.isArray(data)) return new Uint8Array(data);
      return new Uint8Array(0);
    },
    isBuffer: function(obj) { return obj instanceof Uint8Array; },
    concat: function(list) {
      var total = 0;
      for (var i = 0; i < list.length; i++) total += list[i].length;
      var result = new Uint8Array(total);
      var offset = 0;
      for (var i = 0; i < list.length; i++) { result.set(list[i], offset); offset += list[i].length; }
      return result;
    },
  };
  Uint8Array.prototype.toString = function(enc) {
    if (enc === 'base64') {
      var binary = ''; for (var i = 0; i < this.length; i++) binary += String.fromCharCode(this[i]);
      return btoa(binary);
    }
    if (enc === 'hex') {
      var hex = ''; for (var i = 0; i < this.length; i++) hex += this[i].toString(16).padStart(2, '0');
      return hex;
    }
    return new TextDecoder().decode(this);
  };
  Uint8Array.prototype.toJSON = function() { return { type: 'Buffer', data: Array.prototype.slice.call(this) }; };
  Uint8Array.prototype.slice = function(start, end) { var s = start || 0; var e = end !== undefined ? end : this.length; return new Uint8Array(this.buffer, this.byteOffset + s, e - s); };
  Uint8Array.prototype.readUInt32BE = function(offset) {
    return (this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]) >>> 0;
  };
}
var Buffer = window.Buffer;

/* ─── Module system ──────────────────────────────────────────────── */
var _modules = {};
function _define(id, factory) { _modules[id] = { factory: factory, exports: null }; }
function require(id) {
  if (id === 'electron') return _modules['index'].exports;
  var mod = _modules[id];
  if (!mod) throw new Error("Cannot find module '" + id + "'");
  if (mod.exports !== null) return mod.exports;
  var m = { exports: {} };
  mod.exports = m.exports;
  mod.factory(require, m, m.exports);
  mod.exports = m.exports;
  return mod.exports;
}

/* ─── events (EventEmitter) ──────────────────────────────────────── */
_define('events', function(req, module) {
  function EventEmitter() { this._events = {}; this._eventsCount = 0; }
  EventEmitter.prototype.on = function(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('Listener must be a function');
    if (!this._events[type]) { this._events[type] = []; this._eventsCount++; }
    this._events[type].push(fn);
    return this;
  };
  EventEmitter.prototype.once = function(type, fn) {
    var self = this;
    function onceWrapper() { self.removeListener(type, onceWrapper); fn.apply(this, arguments); }
    onceWrapper._original = fn;
    return this.on(type, onceWrapper);
  };
  EventEmitter.prototype.removeListener = function(type, fn) {
    var list = this._events[type];
    if (!list) return this;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] === fn || list[i]._original === fn) { list.splice(i, 1); break; }
    }
    if (list.length === 0) { delete this._events[type]; this._eventsCount--; }
    return this;
  };
  EventEmitter.prototype.removeAllListeners = function(type) {
    if (type) { delete this._events[type]; this._eventsCount--; }
    else { this._events = {}; this._eventsCount = 0; }
    return this;
  };
  EventEmitter.prototype.emit = function(type) {
    var list = this._events[type];
    if (!list) return false;
    var args = Array.prototype.slice.call(arguments, 1);
    var copy = list.slice();
    for (var i = 0; i < copy.length; i++) copy[i].apply(this, args);
    return true;
  };
  EventEmitter.prototype.listenerCount = function(type) { return (this._events[type] || []).length; };
  EventEmitter.prototype.eventNames = function() { return Object.keys(this._events); };
  EventEmitter.prototype.rawListeners = function(type) { return (this._events[type] || []).slice(); };
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
  EventEmitter.prototype.addListener = EventEmitter.prototype.on;
  module.exports = { EventEmitter: EventEmitter };
});

/* ─── path ───────────────────────────────────────────────────────── */
_define('path', function(req, module) {
  function normalize(p) {
    if (!p) return '';
    p = p.replace(/\\/g, '/');
    if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1);
    return p;
  }
  function join() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) parts.push(arguments[i]);
    }
    return normalize(parts.join('/'));
  }
  function resolve() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(arguments[i]);
    var result = join.apply(null, parts);
    if (!result.startsWith('/')) result = '/' + result;
    return result;
  }
  function basename(p, ext) {
    if (!p) return '';
    p = normalize(p);
    var name = p.split('/').pop() || '';
    if (ext && name.endsWith(ext)) name = name.slice(0, -ext.length);
    return name;
  }
  function dirname(p) {
    if (!p) return '.';
    p = normalize(p);
    var idx = p.lastIndexOf('/');
    return idx <= 0 ? '/' : p.slice(0, idx);
  }
  function extname(p) {
    if (!p) return '';
    var base = basename(p);
    var idx = base.lastIndexOf('.');
    return idx <= 0 ? '' : base.slice(idx);
  }
  function isAbsolute(p) { return typeof p === 'string' && (p.startsWith('/') || /^[A-Za-z]:/.test(p)); }
  module.exports = { join: join, resolve: resolve, basename: basename, dirname: dirname, extname: extname, normalize: normalize, isAbsolute: isAbsolute, sep: '/', delimiter: ':' };
});

/* ─── os ─────────────────────────────────────────────────────────── */
_define('os', function(req, module) {
  var _h = '/tmp';
  try { _h = process.env.HOME || process.env.USERPROFILE || '/tmp'; } catch(e) {}
  module.exports = {
    homedir: function() { return _h; },
    tmpdir: function() { return '/tmp'; },
    platform: function() { return process.platform; },
    arch: function() { return process.arch; },
    type: function() { return process.platform === 'darwin' ? 'Darwin' : process.platform === 'win32' ? 'Windows_NT' : 'Linux'; },
    release: function() { return '0.0.0'; },
    hostname: function() { return 'gelectron'; },
    endianness: function() { return 'LE'; },
    cpus: function() { return []; },
    totalmem: function() { return 0; },
    freemem: function() { return 0; },
    uptime: function() { return 0; },
    networkInterfaces: function() { return {}; },
  };
});

/* ─── readline stub ──────────────────────────────────────────────── */
_define('readline', function(req, module) {
  module.exports = { createInterface: function() { return { on: function() { return this; }, close: function() {} }; } };
});

/* ─── child_process stub ─────────────────────────────────────────── */
_define('child_process', function(req, module) {
  module.exports = {
    exec: function(cmd, cb) { if (cb) cb(null, '', ''); return { on: function() { return this; } }; },
    execSync: function() { return Buffer.alloc(0); },
    spawn: function() { return { on: function() { return this; }, stdout: { on: function() {} }, stderr: { on: function() {} } }; },
  };
});

/* ─── fs stub ────────────────────────────────────────────────────── */
_define('fs', function(req, module) {
  module.exports = {
    readFileSync: function() { return Buffer.alloc(0); },
    existsSync: function() { return false; },
    readlinkSync: function() { return ''; },
  };
});

/* ─── WebView IPC bridge (replaces native-bridge stdin/stdout) ───── */
_define('native-bridge', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  var _ready = false;
  var _readyCbs = [];

  function _send(msg) {
    try {
      var str = JSON.stringify(msg);
      if (window.ipc && window.ipc.postMessage) {
        window.ipc.postMessage(str);
      } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
        window.webkit.messageHandlers.ipc.postMessage(str);
      }
    } catch(e) {
      console.error('[gelectron] _send error:', e);
    }
  }

  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    try {
      if (typeof data === 'string') data = JSON.parse(data);
    } catch(e) { return; }
    if (!data.type) return;
    switch (data.type) {
      case 'ready':
        _ready = true;
        for (var i = 0; i < _readyCbs.length; i++) _readyCbs[i]();
        _readyCbs = [];
        bridge.emit('ready');
        break;
      case 'window-closed':
        bridge.emit('window-closed', data.id);
        break;
      case 'window-focus':
        bridge.emit('window-focus', data.id);
        break;
      case 'ipc-message':
        bridge.emit('ipc-message', data.id, data.channel, data.data);
        break;
      case 'ipc-invoke-response':
        bridge.emit('ipc-invoke-response', data.requestId, data.result, data.error);
        break;
    }
  });

  var bridge = new EventEmitter();
  bridge._ready = false;
  bridge.onReady = function(cb) { if (_ready) cb(); else _readyCbs.push(cb); };
  bridge.createWindow = function(id, opts) { _send({ type: 'create-window', id: id, options: opts }); };
  bridge.loadUrl = function(id, url) { _send({ type: 'load-url', id: id, url: url }); };
  bridge.loadFile = function(id, path) { _send({ type: 'load-file', id: id, path: path }); };
  bridge.destroyWindow = function(id) { _send({ type: 'destroy-window', id: id }); };
  bridge.setTitle = function(id, title) { _send({ type: 'set-title', id: id, title: title }); };
  bridge.setSize = function(id, w, h) { _send({ type: 'set-size', id: id, width: w, height: h }); };
  bridge.showWindow = function(id) { _send({ type: 'show', id: id }); };
  bridge.hideWindow = function(id) { _send({ type: 'hide', id: id }); };
  bridge.focusWindow = function(id) { _send({ type: 'focus', id: id }); };
  bridge.minimizeWindow = function(id) { _send({ type: 'minimize', id: id }); };
  bridge.maximizeWindow = function(id) { _send({ type: 'maximize', id: id }); };
  bridge.closeWindow = function(id) { _send({ type: 'close', id: id }); };
  bridge.sendToRenderer = function(id, channel) {
    var data = Array.prototype.slice.call(arguments, 2);
    _send({ type: 'ipc-message', id: id, channel: channel, data: data.length === 1 ? data[0] : data });
  };
  bridge.evalJs = function(id, script) { _send({ type: 'eval-js', id: id, script: script }); };
  bridge.quit = function() { _send({ type: 'quit' }); };
  bridge._send = _send;
  bridge.invoke = function(id, channel) {
    var args = Array.prototype.slice.call(arguments, 2);
    var requestId = 'ipc-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    _send({ type: 'ipc-invoke', id: id, requestId: requestId, channel: channel, args: args });
    return requestId;
  };

  var isNative = !!(window.ipc) || !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc);
  module.exports = { bridge: bridge, isNative: isNative };
});

/* ─── app ────────────────────────────────────────────────────────── */
_define('app', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  var path = req('path');
  var os = req('os');

  function App() {
    EventEmitter.call(this);
    this._ready = false;
    this._windowCount = 0;
    this._relaunching = false;
    this._aboutPanelOptions = {};
    this._badgeCount = 0;
    this._secureKeyboardEntryEnabled = false;
    this._userAgent = null;
    this._name = 'Gelectron App';
    var home = os.homedir();
    this._paths = {
      home: home,
      appData: path.join(home, '.config', 'gelectron'),
      userData: path.join(home, '.config', 'gelectron'),
      desktop: path.join(home, 'Desktop'), documents: path.join(home, 'Documents'),
      downloads: path.join(home, 'Downloads'), temp: os.tmpdir(),
      exe: process.execPath, module: __dirname,
      crashDumps: path.join(home, '.config', 'gelectron', 'crashDumps'),
      logs: path.join(home, '.config', 'gelectron', 'logs'),
    };
    this._commandLine = new Map();
    this._dock = process.platform === 'darwin' ? {
      setIcon: function() {}, bounce: function() { return 0; }, cancelBounce: function() {},
      setBadge: function() {}, getBadge: function() { return ''; }, hide: function() {},
      show: function() {}, isVisible: function() { return true; }, setMenu: function() {},
      setBadgeCount: function() { return 0; }, getBadgeCount: function() { return 0; },
      setThumbnail: function() {}, setThumbnailClip: function() {}, setThumbnailToolTip: function() {},
    } : null;
    this._argv = process.argv.slice();
    var self = this;
    process.nextTick(function() { if (!self._ready) { self._ready = true; self.emit('ready'); } });
  }
  App.prototype = Object.create(EventEmitter.prototype);
  App.prototype.constructor = App;

  Object.defineProperty(App.prototype, 'commandLine', { get: function() {
    var self = this;
    return {
      appendSwitch: function(n, v) { self._commandLine.set(n, v || ''); },
      removeSwitch: function(n) { self._commandLine.delete(n); },
      getSwitch: function(n) { return self._commandLine.get(n) || ''; },
      hasSwitch: function(n) { return self._commandLine.has(n); },
    };
  }});
  Object.defineProperty(App.prototype, 'dock', { get: function() { return this._dock; } });
  Object.defineProperty(App.prototype, 'argv', { get: function() { return this._argv; } });
  Object.defineProperty(App.prototype, 'isPackaged', { get: function() { return false; } });
  Object.defineProperty(App.prototype, 'name', {
    get: function() { return this._name; },
    set: function(v) { this._name = v || 'Gelectron App'; }
  });
  Object.defineProperty(App.prototype, 'version', { get: function() { return process.env.GELECTRON_VERSION || '0.1.0'; } });
  Object.defineProperty(App.prototype, 'locale', { get: function() { return this.getLocale(); } });
  Object.defineProperty(App.prototype, 'userAgent', { get: function() { return this.getUserAgent(); } });
  Object.defineProperty(App.prototype, 'appPath', { get: function() { return this.getAppPath(); } });

  App.prototype.getAppPath = function() { return process.env.GELECTRON_APP_PATH || process.cwd(); };
  App.prototype.getPath = function(n) {
    if (n === 'app') return this._paths.appData || this._paths.userData;
    return this._paths[n] || this._paths.userData;
  };
  App.prototype.setPath = function(n, p) { this._paths[n] = p; };
  App.prototype.getName = function() { return this._name; };
  App.prototype.setName = function(n) { this._name = n; };
  App.prototype.getVersion = function() { return this.version; };
  App.prototype.getLocale = function() { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; };
  App.prototype.getUserAgent = function() { return this._userAgent || ('Gelectron/' + this.version + ' (' + process.platform + ' ' + process.arch + ')'); };
  App.prototype.setUserAgent = function(ua) { this._userAgent = ua || null; };
  App.prototype.getPathForProtocol = function() { return null; };
  App.prototype.getApplicationInfoForProtocol = function() { return Promise.resolve({ defaultIcon: null, icon: null }); };

  App.prototype.whenReady = function() { var self = this; if (self._ready) return Promise.resolve(); return new Promise(function(r) { self.once('ready', r); }); };
  App.prototype.requestSingleInstanceLock = function() { return true; };
  App.prototype.acquireSingleInstanceLock = function() { return true; };
  App.prototype.releaseSingleInstanceLock = function() {};

  App.prototype.quit = function() {
    if (this.listenerCount('before-quit') > 0 || this.listenerCount('will-quit') > 0) {
      this.emit('before-quit');
      this.emit('will-quit');
    }
    this.emit('quit');
    var bridgeObj = req('native-bridge');
    if (bridgeObj.isNative) { bridgeObj.bridge.quit(); }
  };
  App.prototype.exit = function() {
    if (this._ready) { this.emit('before-quit'); this.emit('will-quit'); }
    this.emit('quit');
    var bridgeObj = req('native-bridge');
    if (bridgeObj.isNative) { bridgeObj.bridge.quit(); }
  };
  App.prototype.relaunch = function(options) {
    this._relaunching = true;
    this.emit('before-quit');
    var bridgeObj = req('native-bridge');
    if (bridgeObj.isNative) {
      var msg = { type: 'relaunch' };
      if (options && options.execPath) msg.execPath = options.execPath;
      if (options && options.args) msg.args = options.args;
      bridgeObj.bridge._send(msg);
    }
  };
  App.prototype.isReady = function() { return this._ready; };

  App.prototype.focus = function() {};
  App.prototype.hide = function() {};
  App.prototype.show = function() {};
  App.prototype.isVisible = function() { return true; };
  App.prototype.isHidden = function() { return false; };

  App.prototype.getAppMetrics = function() {
    return [{ creationTime: Date.now(), pid: process.pid, rid: 0, type: 'Browser', memory: { workingSetSize: 0 }, sandboxed: false }];
  };
  App.prototype.getGPUInfo = function(type) {
    return Promise.resolve({ gpuDevice: [{ driverVendor: 'Gelectron', active: false }], GPUActive: false });
  };
  App.prototype.getGPUFeatureStatus = function() {
    return { gpuCompositing: 'disabled', multipleRasterThreads: 'disabled', nativeGpuMemoryBuffers: 'disabled', rasterization: 'disabled', smoothScrolling: 'disabled', videoDecode: 'disabled', videoEncode: 'disabled', webgl: 'disabled', webgl2: 'disabled' };
  };
  App.prototype.disableHardwareAcceleration = function() {};
  App.prototype.disableDomainBlockingFor3DAPIs = function() {};

  App.prototype.setBadgeCount = function(count) { this._badgeCount = count || 0; return this._badgeCount; };
  App.prototype.getBadgeCount = function() { return this._badgeCount; };

  App.prototype.addRecentDocument = function() {};
  App.prototype.clearRecentDocuments = function() {};
  App.prototype.setRecentDocumentLabel = function() {};
  App.prototype.setAppUserModelId = function() {};
  App.prototype.getAppUserModelId = function() { return ''; };

  App.prototype.getLoginItemSettings = function() { return { openAtLogin: false, openAsHidden: false, launchAtLogin: false, launchItems: [] }; };
  App.prototype.setLoginItemSettings = function() {};
  App.prototype.isInApplicationsFolder = function() { return true; };
  App.prototype.moveToApplicationsFolder = function() {};
  App.prototype.getFileIcon = function(p, opts, cb) { if (typeof opts === 'function') { cb = opts; } cb(null, null); };

  App.prototype.setAboutPanelOptions = function(opts) { this._aboutPanelOptions = opts || {}; };
  App.prototype.getAboutPanelOptions = function() { return this._aboutPanelOptions; };
  App.prototype.showCertificateTrustDialog = function() { return Promise.resolve(); };
  App.prototype.setSecureKeyboardEntryEnabled = function(e) { this._secureKeyboardEntryEnabled = !!e; };
  App.prototype.isSecureKeyboardEntryEnabled = function() { return this._secureKeyboardEntryEnabled; };

  App.prototype._trackWindow = function() { this._windowCount++; };
  App.prototype._untrackWindow = function() {
    this._windowCount--;
    if (this._windowCount <= 0) { this._windowCount = 0; this.emit('window-all-closed'); }
  };
  App.prototype.getWindowCount = function() { return this._windowCount; };

  App.prototype.on = function(e, l) { EventEmitter.prototype.on.call(this, e, l); return this; };
  App.prototype.once = function(e, l) { EventEmitter.prototype.once.call(this, e, l); return this; };
  App.prototype.addListener = function(e, l) { EventEmitter.prototype.addListener.call(this, e, l); return this; };
  App.prototype.removeListener = function(e, l) { EventEmitter.prototype.removeListener.call(this, e, l); return this; };

  var app = new App();
  module.exports = { app: app, App: App };
});

/* ─── browser-window ─────────────────────────────────────────────── */
_define('browser-window', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  var path = req('path');
  var bridgeObj = req('native-bridge');
  var bridge = bridgeObj.bridge;
  var isNative = bridgeObj.isNative;

  function WebContents(id) {
    EventEmitter.call(this);
    this.id = id; this._url = ''; this._title = ''; this._isLoading = false;
    this._zoomFactor = 1.0; this._zoomLevel = 0; this._userAgent = ''; this._audioMuted = false;
  }
  WebContents.prototype = Object.create(EventEmitter.prototype);
  WebContents.prototype.constructor = WebContents;
  Object.defineProperty(WebContents.prototype, 'URL', { get: function() { return this._url; } });
  Object.defineProperty(WebContents.prototype, 'isLoading', { get: function() { return this._isLoading; } });
  Object.defineProperty(WebContents.prototype, 'title', { get: function() { return this._title; } });
  Object.defineProperty(WebContents.prototype, 'session', { get: function() {
    var self = this;
    return {
      id: 'session-' + self.id,
      cookies: { get: function() { return Promise.resolve([]); }, set: function() {}, remove: function() {} },
      protocol: { registerFileProtocol: function() {}, registerHttpProtocol: function() {}, unregisterProtocol: function() {}, isProtocolRegistered: function() { return false; } },
      setPermissionRequestHandler: function() {}, setPermissionCheckHandler: function() {},
      webRequest: { onBeforeRequest: function() {}, onHeadersReceived: function() {} },
      setUserAgent: function() {}, getUserAgent: function() { return ''; },
    };
  }});
  Object.defineProperty(WebContents.prototype, 'processId', { get: function() { return process.pid; } });
  WebContents.prototype.loadURL = function(url) {
    this._url = url; this._isLoading = true; this.emit('did-start-loading');
    if (isNative) bridge.loadUrl(this.id, url);
    var self = this;
    setTimeout(function() { self._isLoading = false; self.emit('did-stop-loading'); self.emit('did-finish-load'); self.emit('dom-ready'); }, isNative ? 500 : 100);
    return Promise.resolve();
  };
  WebContents.prototype.loadFile = function(fp) {
    var url = 'file://' + path.resolve(fp);
    this._url = url; this._isLoading = true; this.emit('did-start-loading');
    if (isNative) bridge.loadFile(this.id, fp);
    var self = this;
    setTimeout(function() { self._isLoading = false; self.emit('did-stop-loading'); self.emit('did-finish-load'); self.emit('dom-ready'); }, isNative ? 500 : 100);
    return Promise.resolve();
  };
  WebContents.prototype.reload = function() {
    this._isLoading = true; this.emit('did-start-loading');
    if (isNative && this._url) bridge.loadUrl(this.id, this._url);
    var self = this;
    setTimeout(function() { self._isLoading = false; self.emit('did-stop-loading'); self.emit('did-finish-load'); }, 50);
    return Promise.resolve();
  };
  WebContents.prototype.canGoBack = function() { return false; };
  WebContents.prototype.canGoForward = function() { return false; };
  WebContents.prototype.goBack = function() {};
  WebContents.prototype.goForward = function() {};
  WebContents.prototype.executeJavaScript = function(code) { if (isNative) bridge.evalJs(this.id, code); return Promise.resolve(null); };
  WebContents.prototype.insertCSS = function() { return Promise.resolve(0); };
  WebContents.prototype.insertJS = function(code) { return this.executeJavaScript(code); };
  WebContents.prototype.send = function(channel) {
    var args = [this.id, channel].concat(Array.prototype.slice.call(arguments, 1));
    if (isNative) bridge.sendToRenderer.apply(bridge, args);
  };
  WebContents.prototype.sendInputEvent = function() {};
  WebContents.prototype.setZoomFactor = function(f) { this._zoomFactor = f; };
  WebContents.prototype.getZoomFactor = function() { return this._zoomFactor; };
  WebContents.prototype.setZoomLevel = function(l) { this._zoomLevel = l; };
  WebContents.prototype.getZoomLevel = function() { return this._zoomLevel; };
  WebContents.prototype.setUserAgent = function(ua) { this._userAgent = ua; };
  WebContents.prototype.getUserAgent = function() { return this._userAgent; };
  WebContents.prototype.setAudioMuted = function(m) { this._audioMuted = m; };
  WebContents.prototype.isAudioMuted = function() { return this._audioMuted; };
  WebContents.prototype.openDevTools = function() {};
  WebContents.prototype.closeDevTools = function() {};
  WebContents.prototype.isDevToolsOpened = function() { return false; };
  WebContents.prototype.toggleDevTools = function() {};
  WebContents.prototype.inspectElement = function() {};
  WebContents.prototype.setIgnoreMenuShortcuts = function() {};
  WebContents.prototype.setWindowOpenHandler = function() { return { action: 'deny' }; };
  WebContents.prototype.setPermissionRequestHandler = function() {};
  WebContents.prototype.setCertificateVerifyProc = function() {};
  WebContents.prototype.setBackgroundColor = function() {};
  WebContents.prototype.isCrashed = function() { return false; };
  WebContents.prototype.capturePage = function() { return Promise.resolve(null); };
  WebContents.prototype.getResourceUsage = function() { return { images: 0, scripts: 0, css: 0, xhr: 0, webgl: 0 }; };
  WebContents.prototype.type = function() { return 'backgroundPage'; };
  WebContents.prototype.focused = function() { return false; };
  WebContents.prototype.isFocused = function() { return false; };
  WebContents.prototype.destroy = function() {};

  function BrowserWindow(opts) {
    EventEmitter.call(this);
    opts = opts || {};
    this.id = BrowserWindow._nextId++;
    this._options = {
      width: opts.width || 800, height: opts.height || 600,
      minWidth: opts.minWidth || 0, minHeight: opts.minHeight || 0,
      maxWidth: opts.maxWidth || 0, maxHeight: opts.maxHeight || 0,
      title: opts.title || 'Gelectron', backgroundColor: opts.backgroundColor || '#ffffff',
      show: opts.show !== false, frame: opts.frame !== false,
      resizable: opts.resizable !== false, minimizable: opts.minimizable !== false,
      maximizable: opts.maximizable !== false, closable: opts.closable !== false,
      fullscreen: opts.fullscreen || false, alwaysOnTop: opts.alwaysOnTop || false,
      transparent: opts.transparent || false, decorations: opts.decorations !== false,
      icon: opts.icon || null, titleBarStyle: opts.titleBarStyle || 'default',
      trafficLightPosition: opts.trafficLightPosition || null, vibrancy: opts.vibrancy || null,
      webPreferences: Object.assign({
        preload: null, contextIsolation: true, nodeIntegration: false, sandbox: false,
        devTools: true, webSecurity: true, allowRunningInsecureContent: false, experimentalFeatures: false,
      }, opts.webPreferences || {}),
    };
    this._url = ''; this._isDestroyed = false; this._isVisible = this._options.show;
    this._isMinimized = false; this._isMaximized = false; this._isFullScreen = this._options.fullscreen;
    this.webContents = new WebContents(this.id);
    BrowserWindow._windows.set(this.id, this);
    var appMod = req('app');
    if (appMod && appMod.app && typeof appMod.app._trackWindow === 'function') {
      appMod.app._trackWindow();
    }
    if (isNative) {
      bridge.createWindow(this.id, { width: this._options.width, height: this._options.height, title: this._options.title, show: this._options.show, resizable: this._options.resizable, alwaysOnTop: this._options.alwaysOnTop, fullscreen: this._options.fullscreen });
    }
    if (this._options.show) {
      var self = this;
      process.nextTick(function() { if (!self._isDestroyed) { self.emit('ready-to-show'); self.show(); } });
    }
  }
  BrowserWindow.prototype = Object.create(EventEmitter.prototype);
  BrowserWindow.prototype.constructor = BrowserWindow;
  BrowserWindow._windows = new Map();
  BrowserWindow._nextId = 2;
  BrowserWindow.fromWebContents = function(wc) {
    var wins = BrowserWindow._windows.values();
    var w; while (!(w = wins.next()).done) { if (w.value.webContents && w.value.webContents.id === wc.id) return w.value; }
    return null;
  };
  BrowserWindow.getAllWindows = function() {
    var out = [], wins = BrowserWindow._windows.values(), w;
    while (!(w = wins.next()).done) { if (!w.value.isDestroyed()) out.push(w.value); }
    return out;
  };
  BrowserWindow.getFocusedWindow = function() { return null; };
  BrowserWindow.fromId = function(id) { return BrowserWindow._windows.get(id) || null; };
  BrowserWindow.addExtension = function() {};
  BrowserWindow.removeExtension = function() {};
  BrowserWindow.getExtensions = function() { return {}; };
  BrowserWindow.prototype.loadURL = function(url) { this._url = url; if (isNative) bridge.loadUrl(this.id, url); return this.webContents.loadURL(url); };
  BrowserWindow.prototype.loadFile = function(fp) { return this.webContents.loadFile(fp); };
  BrowserWindow.prototype.show = function() { if (this._isDestroyed) return; this._isVisible = true; this._isMinimized = false; if (isNative) bridge.showWindow(this.id); this.emit('show'); };
  BrowserWindow.prototype.hide = function() { if (this._isDestroyed) return; this._isVisible = false; if (isNative) bridge.hideWindow(this.id); this.emit('hide'); };
  BrowserWindow.prototype.close = function() { if (this._isDestroyed) return; this.emit('close'); this.destroy(); };
  BrowserWindow.prototype.destroy = function() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    if (isNative) bridge.destroyWindow(this.id);
    BrowserWindow._windows.delete(this.id);
    var appMod = req('app');
    if (appMod && appMod.app && typeof appMod.app._untrackWindow === 'function') {
      appMod.app._untrackWindow();
    }
    this.emit('closed');
  };
  BrowserWindow.prototype.focus = function() { if (!this._isDestroyed) { if (isNative) bridge.focusWindow(this.id); this.emit('focus'); } };
  BrowserWindow.prototype.blur = function() {};
  BrowserWindow.prototype.minimize = function() { if (!this._isDestroyed) { this._isMinimized = true; if (isNative) bridge.minimizeWindow(this.id); this.emit('minimize'); } };
  BrowserWindow.prototype.maximize = function() { if (!this._isDestroyed) { this._isMaximized = true; if (isNative) bridge.maximizeWindow(this.id); this.emit('maximize'); } };
  BrowserWindow.prototype.unmaximize = function() { if (!this._isDestroyed) { this._isMaximized = false; this.emit('unmaximize'); } };
  BrowserWindow.prototype.restore = function() { if (!this._isDestroyed) { this._isMinimized = false; this._isMaximized = false; this.emit('restore'); } };
  BrowserWindow.prototype.setFullScreen = function(f) { this._isFullScreen = f; this.emit('enter-full-screen'); };
  BrowserWindow.prototype.isFullScreen = function() { return this._isFullScreen; };
  BrowserWindow.prototype.isMinimized = function() { return this._isMinimized; };
  BrowserWindow.prototype.isMaximized = function() { return this._isMaximized; };
  BrowserWindow.prototype.isVisible = function() { return this._isVisible; };
  BrowserWindow.prototype.isDestroyed = function() { return this._isDestroyed; };
  BrowserWindow.prototype.isFocused = function() { return false; };
  BrowserWindow.prototype.isNormal = function() { return !this._isMinimized && !this._isMaximized && !this._isFullScreen; };
  BrowserWindow.prototype.setAlwaysOnTop = function(f) { this._options.alwaysOnTop = f; };
  BrowserWindow.prototype.isAlwaysOnTop = function() { return this._options.alwaysOnTop; };
  BrowserWindow.prototype.setPosition = function() {};
  BrowserWindow.prototype.getPosition = function() { return [0, 0]; };
  BrowserWindow.prototype.setSize = function(w, h) { this._options.width = w; this._options.height = h; };
  BrowserWindow.prototype.getSize = function() { return [this._options.width, this._options.height]; };
  BrowserWindow.prototype.setMinimumSize = function(w, h) { this._options.minWidth = w; this._options.minHeight = h; };
  BrowserWindow.prototype.getMinimumSize = function() { return [this._options.minWidth, this._options.minHeight]; };
  BrowserWindow.prototype.setMaximumSize = function(w, h) { this._options.maxWidth = w; this._options.maxHeight = h; };
  BrowserWindow.prototype.getMaximumSize = function() { return [this._options.maxWidth, this._options.maxHeight]; };
  BrowserWindow.prototype.setResizable = function(v) { this._options.resizable = v; };
  BrowserWindow.prototype.isResizable = function() { return this._options.resizable; };
  BrowserWindow.prototype.setMovable = function() {};
  BrowserWindow.prototype.isMovable = function() { return true; };
  BrowserWindow.prototype.setMinimizable = function(v) { this._options.minimizable = v; };
  BrowserWindow.prototype.isMinimizable = function() { return this._options.minimizable; };
  BrowserWindow.prototype.setMaximizable = function(v) { this._options.maximizable = v; };
  BrowserWindow.prototype.isMaximizable = function() { return this._options.maximizable; };
  BrowserWindow.prototype.setClosable = function(v) { this._options.closable = v; };
  BrowserWindow.prototype.isClosable = function() { return this._options.closable; };
  BrowserWindow.prototype.setTitle = function(t) { this._options.title = t; this.webContents._title = t; if (isNative) bridge.setTitle(this.id, t); };
  BrowserWindow.prototype.getTitle = function() { return this._options.title; };
  BrowserWindow.prototype.setSkipTaskbar = function() {};
  BrowserWindow.prototype.setKiosk = function() {};
  BrowserWindow.prototype.isKiosk = function() { return false; };
  BrowserWindow.prototype.center = function() {};
  BrowserWindow.prototype.setBounds = function() {};
  BrowserWindow.prototype.getBounds = function() { return { x: 0, y: 0, width: this._options.width, height: this._options.height }; };
  BrowserWindow.prototype.setSimpleFullScreen = function() {};
  BrowserWindow.prototype.isSimpleFullScreen = function() { return false; };
  BrowserWindow.prototype.setAutoHideCursor = function() {};
  BrowserWindow.prototype.setContentBounds = function() {};
  BrowserWindow.prototype.getContentBounds = function() { return this.getBounds(); };
  BrowserWindow.prototype.isEnabled = function() { return true; };
  BrowserWindow.prototype.setEnabled = function() {};
  BrowserWindow.prototype.setProgressBar = function() {};
  BrowserWindow.prototype.setOverlayIcon = function() {};
  BrowserWindow.prototype.setVisibleOnAllWorkspaces = function() {};
  BrowserWindow.prototype.isVisibleOnAllWorkspaces = function() { return false; };
  BrowserWindow.prototype.setVibrancy = function() {};
  BrowserWindow.prototype.getNativeWindowHandle = function() { return Buffer.alloc(0); };
  BrowserWindow.prototype.setHasShadow = function() {};
  BrowserWindow.prototype.hasShadow = function() { return true; };
  BrowserWindow.prototype.setOpacity = function() {};
  BrowserWindow.prototype.getOpacity = function() { return 1.0; };
  BrowserWindow.prototype.setThumbarButtons = function() {};
  BrowserWindow.prototype.setThumbnailClip = function() {};
  BrowserWindow.prototype.setThumbnailToolTip = function() {};
  BrowserWindow.prototype.setAppDetails = function() {};
  BrowserWindow.prototype.setForeground = function() {};
  BrowserWindow.prototype.flashFrame = function() {};
  BrowserWindow.prototype.setIcon = function() {};
  BrowserWindow.prototype.setBackgroundColor = function(c) { this._options.backgroundColor = c; };
  BrowserWindow.prototype.getBackgroundColor = function() { return this._options.backgroundColor; };
  BrowserWindow.prototype.capturePage = function() { return this.webContents.capturePage(); };
  BrowserWindow.prototype.print = function() {};
  BrowserWindow.prototype.printToPDF = function() { return Promise.resolve(Buffer.alloc(0)); };
  BrowserWindow.prototype.setParentWindow = function() {};
  BrowserWindow.prototype.getParentWindow = function() { return null; };
  BrowserWindow.prototype.getChildWindows = function() { return []; };
  BrowserWindow.prototype.selectPreviousTab = function() {};
  BrowserWindow.prototype.selectNextTab = function() {};
  BrowserWindow.prototype.mergeAllWindows = function() {};
  BrowserWindow.prototype.moveTabToNewWindow = function() {};
  BrowserWindow.prototype.toggleTabBar = function() {};
  BrowserWindow.prototype.addTabbedWindow = function() {};

  module.exports = { BrowserWindow: BrowserWindow, WebContents: WebContents };
});

/* ─── ipc-main ───────────────────────────────────────────────────── */
_define('ipc-main', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  function IpcMain() {
    EventEmitter.call(this);
    this._handlers = new Map();
    this._onceHandlers = new Map();
  }
  IpcMain.prototype = Object.create(EventEmitter.prototype);
  IpcMain.prototype.constructor = IpcMain;
  IpcMain.prototype.handle = function(ch, fn) { if (typeof fn !== 'function') throw new TypeError('Expected function'); this._handlers.set(ch, fn); return this; };
  IpcMain.prototype.handleOnce = function(ch, fn) { if (typeof fn !== 'function') throw new TypeError('Expected function'); this._onceHandlers.set(ch, fn); return this; };
  IpcMain.prototype.on = function(ch, fn) { if (typeof fn !== 'function') throw new TypeError('Expected function'); EventEmitter.prototype.on.call(this, ch, fn); return this; };
  IpcMain.prototype.once = function(ch, fn) { if (typeof fn !== 'function') throw new TypeError('Expected function'); EventEmitter.prototype.once.call(this, ch, fn); return this; };
  IpcMain.prototype.removeHandler = function(ch) { this._handlers.delete(ch); return this; };
  IpcMain.prototype.removeListener = function(ch, fn) { EventEmitter.prototype.removeListener.call(this, ch, fn); return this; };
  IpcMain.prototype.removeAllListeners = function(ch) { EventEmitter.prototype.removeAllListeners.call(this, ch); return this; };
  IpcMain.prototype.listenerCount = function(ch) { return EventEmitter.prototype.listenerCount.call(this, ch); };
  IpcMain.prototype.rawListeners = function(ch) { return EventEmitter.prototype.rawListeners.call(this, ch); };
  IpcMain.prototype.eventNames = function() { return EventEmitter.prototype.eventNames.call(this); };
  IpcMain.prototype._invoke = function(ch) {
    var handler = this._handlers.get(ch);
    if (!handler) return Promise.reject(new Error("No handler for '" + ch + "'"));
    try { var r = handler.apply(null, Array.prototype.slice.call(arguments, 1)); return r instanceof Promise ? r : Promise.resolve(r); } catch(e) { return Promise.reject(e); }
  };
  IpcMain.prototype._emit = function(ch) { return this.emit.apply(this, arguments); };
  IpcMain.prototype._emitOnce = function(ch) {
    var handler = this._onceHandlers.get(ch);
    if (handler) { this._onceHandlers.delete(ch); return handler.apply(null, Array.prototype.slice.call(arguments, 1)); }
    return this.emit.apply(this, arguments);
  };
  module.exports = new IpcMain();
});

/* ─── menu ───────────────────────────────────────────────────────── */
_define('menu', function(req, module) {
  var EventEmitter = req('events').EventEmitter;

  function MenuItem(opts) {
    EventEmitter.call(this);
    opts = opts || {};
    this.id = opts.id || ''; this.label = opts.label || ''; this.type = opts.type || 'normal';
    this.role = opts.role || ''; this.accelerator = opts.accelerator || '';
    this.enabled = opts.enabled !== false; this.visible = opts.visible !== false;
    this.checked = opts.checked || false; this.submenu = opts.submenu || null;
    this.toolTip = opts.toolTip || ''; this.icon = opts.icon || null;
    this._click = opts.click || null;
    if (this.submenu && !(this.submenu instanceof Menu)) {
      if (Array.isArray(this.submenu)) {
        this.submenu = Menu.buildFromTemplate(this.submenu);
      } else if (this.submenu.items) {
        this.submenu = Menu.buildFromTemplate(this.submenu.items);
      }
    }
  }
  MenuItem.prototype = Object.create(EventEmitter.prototype);
  MenuItem.prototype.constructor = MenuItem;
  MenuItem.prototype.click = function() { if (this._click) this._click(this, null); this.emit('click'); };

  function Menu() { EventEmitter.call(this); this.items = []; this._id = Menu._nextId++; }
  Menu.prototype = Object.create(EventEmitter.prototype);
  Menu.prototype.constructor = Menu;
  Menu._nextId = 1;
  Menu._applicationMenu = null;
  Menu.buildFromTemplate = function(template) {
    var menu = new Menu();
    if (Array.isArray(template)) {
      menu.items = template.map(function(item) {
        if (item instanceof MenuItem) return item;
        if (item.type === 'separator') return new MenuItem({ type: 'separator' });
        return new MenuItem(item);
      });
    }
    return menu;
  };
  Menu.getApplicationMenu = function() { return Menu._applicationMenu || null; };
  Menu.setApplicationMenu = function(m) {
    Menu._applicationMenu = m;
    if (m) {
      var bridgeObj = req('native-bridge');
      if (bridgeObj.isNative) {
        bridgeObj.bridge._send({ type: 'set-application-menu', menu: m._serialize() });
      }
    }
  };
  Menu.prototype.append = function(mi) { this.items.push(mi instanceof MenuItem ? mi : new MenuItem(mi)); return this; };
  Menu.prototype.insert = function(mi, pos) { this.items.splice(pos, 0, mi instanceof MenuItem ? mi : new MenuItem(mi)); return this; };
  Menu.prototype.popup = function(opts) {
    var bridgeObj = req('native-bridge');
    if (bridgeObj.isNative) {
      bridgeObj.bridge._send({ type: 'popup-menu', menu: this._serialize(), x: opts && opts.x, y: opts && opts.y });
    }
  };
  Menu.prototype.closePopup = function() {
    var bridgeObj = req('native-bridge');
    if (bridgeObj.isNative) { bridgeObj.bridge._send({ type: 'close-popup-menu' }); }
  };
  Menu.prototype.getMenuItemById = function(id) { return _find(this.items, id); };
  Menu.prototype._serialize = function() {
    return { items: this.items.map(function(item) {
      var obj = { id: item.id, label: item.label, type: item.type, role: item.role, accelerator: item.accelerator, enabled: item.enabled, visible: item.visible, checked: item.checked, toolTip: item.toolTip };
      if (item.submenu instanceof Menu) obj.submenu = item.submenu._serialize();
      else if (item.submenu && Array.isArray(item.submenu)) obj.submenu = Menu.buildFromTemplate(item.submenu)._serialize();
      return obj;
    }) };
  };
  function _find(items, id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
      if (items[i].submenu) {
        var sub = items[i].submenu instanceof Menu ? items[i].submenu.items : (items[i].submenu.items || items[i].submenu);
        var f = _find(sub, id); if (f) return f;
      }
    }
    return null;
  }
  module.exports = { Menu: Menu, MenuItem: MenuItem };
});

/* ─── tray ───────────────────────────────────────────────────────── */
_define('tray', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  function Tray(image) {
    EventEmitter.call(this);
    this.id = Tray._nextId++; this._image = image; this._tooltip = '';
    this._menu = null; this._isDestroyed = false;
    Tray._trays.set(this.id, this);
  }
  Tray.prototype = Object.create(EventEmitter.prototype);
  Tray.prototype.constructor = Tray;
  Tray._trays = new Map(); Tray._nextId = 1;
  Tray.prototype.setToolTip = function(t) { this._tooltip = t; };
  Tray.prototype.getToolTip = function() { return this._tooltip; };
  Tray.prototype.setImage = function(i) { this._image = i; };
  Tray.prototype.setPressedImage = function() {};
  Tray.prototype.setContextMenu = function(m) { this._menu = m; };
  Tray.prototype.getContextMenu = function() { return this._menu; };
  Tray.prototype.popupContextMenu = function() {};
  Tray.prototype.isDestroyed = function() { return this._isDestroyed; };
  Tray.prototype.destroy = function() { this._isDestroyed = true; Tray._trays.delete(this.id); this.emit('destroy'); };
  Tray.prototype.getBounds = function() { return { x: 0, y: 0, width: 22, height: 22 }; };
  Tray.fromId = function(id) { return Tray._trays.get(id) || null; };
  Tray.getAllTrays = function() { return Array.from(Tray._trays.values()); };
  module.exports = { Tray: Tray };
});

/* ─── dialog ─────────────────────────────────────────────────────── */
_define('dialog', function(req, module) {
  function _opts(a, b) {
    var o = b || a || {};
    if (a && a.webContents) o = b || {};
    return o;
  }
  module.exports = {
    showOpenDialog: function(a, b) {
      var o = _opts(a, b);
      if (typeof globalThis.__gelectron_dialog_open === 'function') return globalThis.__gelectron_dialog_open(o);
      return Promise.resolve({ canceled: true, filePaths: [] });
    },
    showSaveDialog: function(a, b) {
      var o = _opts(a, b);
      if (typeof globalThis.__gelectron_dialog_save === 'function') return globalThis.__gelectron_dialog_save(o);
      return Promise.resolve({ canceled: true, filePath: undefined });
    },
    showMessageBox: function(a, b) {
      var o = _opts(a, b);
      if (typeof globalThis.__gelectron_dialog_message === 'function') return globalThis.__gelectron_dialog_message(o);
      return Promise.resolve({ response: 0, checkboxChecked: false });
    },
    showErrorBox: function(title, content) { console.error('[gelectron] ' + title + ': ' + content); },
    showMessageBoxSync: function(a, b) {
      var o = _opts(a, b);
      if (typeof globalThis.__gelectron_dialog_message_sync === 'function') return globalThis.__gelectron_dialog_message_sync(o);
      return 0;
    },
    showCertificateTrustDialog: function() { return Promise.resolve(); },
  };
});

/* ─── shell ──────────────────────────────────────────────────────── */
_define('shell', function(req, module) {
  module.exports = {
    openExternal: function(url) {
      try { window.open(url, '_blank'); } catch(e) {}
      return Promise.resolve();
    },
    openPath: function(p) {
      try { window.open('file://' + p, '_blank'); } catch(e) {}
      return Promise.resolve('');
    },
    showItemInFolder: function() {},
    moveItemToTrash: function() { return Promise.resolve(''); },
    beep: function() {},
    writeShortcutLink: function() { return true; },
    readShortcutLink: function() { return { target: '', cwd: '', args: '', description: '', icon: '', iconIndex: 0 }; },
  };
});

/* ─── notification ───────────────────────────────────────────────── */
_define('notification', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  function Notification(opts) {
    EventEmitter.call(this);
    opts = opts || {};
    this.id = Notification._nextId++; this.title = opts.title || ''; this.body = opts.body || '';
    this.subtitle = opts.subtitle || ''; this.silent = opts.silent || false;
    this.icon = opts.icon || null; this.urgency = opts.urgency || 'normal';
    this.timeoutType = opts.timeoutType || 'default'; this.closeButtonText = opts.closeButtonText || '';
    this.toastXml = opts.toastXml || ''; this.actions = opts.actions || [];
    this.replyPlaceholder = opts.replyPlaceholder || '';
    Notification._notifications.set(this.id, this);
  }
  Notification.prototype = Object.create(EventEmitter.prototype);
  Notification.prototype.constructor = Notification;
  Notification._notifications = new Map(); Notification._nextId = 1;
  Notification.isSupported = function() { return true; };
  Notification.prototype.show = function() {
    if (typeof globalThis.Notification !== 'undefined' && globalThis.Notification.permission === 'granted') {
      new globalThis.Notification(this.title, { body: this.body, icon: this.icon });
    }
    this.emit('show'); return true;
  };
  Notification.prototype.close = function() { Notification._notifications.delete(this.id); this.emit('close'); };
  Notification.fromNotification = function(n) { return n; };
  module.exports = { Notification: Notification };
});

/* ─── native-image ───────────────────────────────────────────────── */
_define('native-image', function(req, module) {
  function NativeImage() { this._isEmpty = true; this._width = 0; this._height = 0; this._data = null; }
  NativeImage.createFromPath = function(p) {
    var img = new NativeImage();
    try {
      var data = req('fs').readFileSync(p);
      if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
        img._width = data.readUInt32BE(16); img._height = data.readUInt32BE(20);
        img._data = data; img._isEmpty = false;
      }
    } catch(e) {}
    return img;
  };
  NativeImage.createFromBuffer = function(buf, opts) {
    opts = opts || {}; var img = new NativeImage();
    if (buf && buf.length > 0) {
      img._data = buf; img._isEmpty = false; img._width = opts.width || 0; img._height = opts.height || 0;
      if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) { img._width = buf.readUInt32BE(16); img._height = buf.readUInt32BE(20); }
    }
    return img;
  };
  NativeImage.createFromDataURL = function(d) {
    var m = d.match(/^data:[^;]+;base64,(.+)$/);
    if (m) return NativeImage.createFromBuffer(Buffer.from(m[1], 'base64'));
    return NativeImage.createEmpty();
  };
  NativeImage.createEmpty = function() { return new NativeImage(); };
  NativeImage.prototype.toPNG = function() { return this._data || Buffer.alloc(0); };
  NativeImage.prototype.toJPEG = function() { return this._data || Buffer.alloc(0); };
  NativeImage.prototype.toBitmap = function() { return this._data || Buffer.alloc(0); };
  NativeImage.prototype.toDataURL = function() { if (!this._data) return 'data:,'; return 'data:image/png;base64,' + Buffer.from(this._data).toString('base64'); };
  NativeImage.prototype.resize = function(opts) {
    var r = new NativeImage(); r._width = opts.width || this._width; r._height = opts.height || this._height;
    r._data = this._data; r._isEmpty = this._isEmpty; return r;
  };
  NativeImage.prototype.crop = function(rect) { return this.resize({ width: rect.width, height: rect.height }); };
  NativeImage.prototype.getBitmap = function() { return this._data || Buffer.alloc(0); };
  NativeImage.prototype.getSize = function() { return { width: this._width, height: this._height }; };
  NativeImage.prototype.isEmpty = function() { return this._isEmpty; };
  NativeImage.prototype.setTemplateImage = function(t) { this._isTemplate = t; };
  NativeImage.prototype.isTemplateImage = function() { return this._isTemplate || false; };
  module.exports = NativeImage;
});

/* ─── safe-storage ───────────────────────────────────────────────── */
_define('safe-storage', function(req, module) {
  module.exports = {
    isAvailable: function() { return true; },
    encryptString: function(s) { return Promise.resolve(Buffer.from(s).toString('base64')); },
    decryptString: function(s) { return Promise.resolve(Buffer.from(s, 'base64').toString('utf-8')); },
    encryptBuffer: function(b) { return Promise.resolve(Buffer.from(b).toString('base64')); },
    decryptBuffer: function(s) { return Promise.resolve(Buffer.from(s, 'base64')); },
  };
});

/* ─── context-bridge ─────────────────────────────────────────────── */
_define('context-bridge', function(req, module) {
  function deepFreeze(o) {
    if (typeof o !== 'object' || o === null) return o;
    Object.freeze(o);
    Object.keys(o).forEach(function(k) { if (typeof o[k] === 'object' && o[k] !== null && !Object.isFrozen(o[k])) deepFreeze(o[k]); });
    return o;
  }
  module.exports = {
    exposeInMainWorld: function(key, api) {
      if (typeof window === 'undefined') return;
      window[key] = deepFreeze(JSON.parse(JSON.stringify(api)));
    },
  };
});

/* ─── web-contents ───────────────────────────────────────────────── */
_define('web-contents', function(req, module) {
  var BrowserWindow = req('browser-window').BrowserWindow;
  module.exports = {
    getAllWebContents: function() { return BrowserWindow.getAllWindows().map(function(w) { return w.webContents; }); },
    getFocusedWebContents: function() { var f = BrowserWindow.getFocusedWindow(); return f ? f.webContents : null; },
    fromId: function(id) { var w = BrowserWindow.fromId(id); return w ? w.webContents : null; },
  };
});

/* ─── auto-updater ───────────────────────────────────────────────── */
_define('auto-updater', function(req, module) {
  var EventEmitter = req('events').EventEmitter;
  function AutoUpdater() {
    EventEmitter.call(this);
    this._isUpdateAvailable = false; this._updateInfo = null; this._feedURL = null;
    this.autoDownload = true; this.autoInstallOnAppQuit = false; this.autoRunAppAfterInstall = true;
    this._logger = console;
  }
  AutoUpdater.prototype = Object.create(EventEmitter.prototype);
  AutoUpdater.prototype.constructor = AutoUpdater;
  AutoUpdater.prototype.getFeedURL = function() { return this._feedURL; };
  AutoUpdater.prototype.setFeedURL = function(o) { this._feedURL = o; };
  AutoUpdater.prototype.checkForUpdates = function() { return Promise.resolve({ updateInfo: null, isUpdateAvailable: false }); };
  AutoUpdater.prototype.checkForAndNotifyIfAvailable = function() { return this.checkForUpdates(); };
  AutoUpdater.prototype.downloadUpdate = function() { return Promise.resolve(); };
  AutoUpdater.prototype.quitAndInstall = function() { this.emit('before-quit-for-update'); process.exit(0); };
  AutoUpdater.prototype.quitAndInstallAgain = function() { this.quitAndInstall(); };
  AutoUpdater.prototype.updateDownloaded = function() { return Promise.resolve(false); };
  Object.defineProperty(AutoUpdater.prototype, 'isUpdateActive', { get: function() { return false; } });
  Object.defineProperty(AutoUpdater.prototype, 'updateInfo', { get: function() { return this._updateInfo; } });
  Object.defineProperty(AutoUpdater.prototype, 'logger', { get: function() { return this._logger; }, set: function(v) { this._logger = v; } });
  var autoUpdater = new AutoUpdater();
  module.exports = { autoUpdater: autoUpdater, AutoUpdater: AutoUpdater };
});

/* ─── index (main electron module) ───────────────────────────────── */
_define('index', function(req, module) {
  var app = req('app').app;
  var BrowserWindow = req('browser-window').BrowserWindow;
  var ipcMain = req('ipc-main');
  var Menu = req('menu').Menu;
  var MenuItem = req('menu').MenuItem;
  var Tray = req('tray').Tray;
  var dialog = req('dialog');
  var shell = req('shell');
  var Notification = req('notification').Notification;
  var nativeImage = req('native-image');
  var safeStorage = req('safe-storage');
  var contextBridge = req('context-bridge');
  var webContents = req('web-contents');
  var autoUpdater = req('auto-updater').autoUpdater;
  var AutoUpdater = req('auto-updater').AutoUpdater;
  var bridgeObj = req('native-bridge');
  var bridge = bridgeObj.bridge;
  var isNative = bridgeObj.isNative;

  if (isNative) {
    bridge.on('ipc-message', function(windowId, channel, data) {
      var event = { sender: { id: windowId }, channel: channel };
      ipcMain._emit(channel, event, data);
    });
  }

  var sessionStub = {
    defaultSession: {
      cookies: { get: function() { return Promise.resolve([]); }, set: function() {}, remove: function() {}, getSession: function() { return null; } },
      protocol: { registerFileProtocol: function() {}, registerHttpProtocol: function() {}, unregisterProtocol: function() {}, isProtocolRegistered: function() { return false; } },
      setPermissionRequestHandler: function() {}, setPermissionCheckHandler: function() {},
      webRequest: { onBeforeRequest: function() {}, onHeadersReceived: function() {} },
      setUserAgent: function() {}, getUserAgent: function() { return ''; },
    },
    fromPartition: function() {
      return {
        cookies: { get: function() { return Promise.resolve([]); }, set: function() {}, remove: function() {} },
        protocol: { registerFileProtocol: function() {}, registerHttpProtocol: function() {}, unregisterProtocol: function() {}, isProtocolRegistered: function() { return false; } },
        webRequest: { onBeforeRequest: function() {}, onHeadersReceived: function() {}, resolveProxy: function() { return Promise.resolve(''); } },
        setUserAgent: function() {}, getUserAgent: function() { return ''; },
        clearCache: function() { return Promise.resolve(); }, clearStorageData: function() { return Promise.resolve(); },
        setProxy: function() { return Promise.resolve(); }, getProxy: function() { return Promise.resolve({ mode: 'direct' }); },
      };
    },
  };

  module.exports = {
    app: app,
    BrowserWindow: BrowserWindow,
    ipcMain: ipcMain,
    Menu: Menu,
    MenuItem: MenuItem,
    Tray: Tray,
    dialog: dialog,
    shell: shell,
    Notification: Notification,
    nativeImage: nativeImage,
    safeStorage: safeStorage,
    contextBridge: contextBridge,
    webContents: webContents,
    autoUpdater: autoUpdater,
    AutoUpdater: AutoUpdater,
    session: sessionStub,
    clipboard: { readText: function() { return ''; }, writeText: function() {}, readImage: function() { return nativeImage.createEmpty(); }, writeImage: function() {} },
    screen: {
      getPrimaryDisplay: function() { return { id: 0, label: '', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, size: { width: 1920, height: 1080 }, workAreaSize: { width: 1920, height: 1040 }, scaleFactor: 1.0, rotation: 0, internal: false, touchSupport: 'unknown' }; },
      getAllDisplays: function() { return []; },
      getDisplayMatching: function() { return null; },
    },
    systemPreferences: {
      isDarkMode: function() { return false; }, getAccentColor: function() { return '#007AFF'; }, getColor: function() { return '#ffffff'; },
      isSwipeTrackingFromScrollEventsEnabled: function() { return false; },
      subscribeNotification: function() { return function() {}; }, unsubscribeNotification: function() {},
      subscribeLocalNotification: function() { return function() {}; }, unsubscribeLocalNotification: function() {},
      getUserDefault: function() { return null; }, setUserDefault: function() {}, removeUserDefault: function() {},
    },
    powerMonitor: { on: function() {}, off: function() {}, once: function() {}, getSystemIdleState: function() { return 'active'; }, getSystemIdleTime: function() { return 0; }, isInLowPowerMode: function() { return false; } },
    globalShortcut: { register: function() { return true; }, unregister: function() {}, unregisterAll: function() {}, isRegistered: function() { return false; } },
    net: { fetch: (typeof globalThis.fetch === 'function' ? globalThis.fetch : function() { return Promise.reject(new Error('fetch not available')); }) },
    IPCRenderer: { invoke: function() { return Promise.resolve(); }, send: function() {}, on: function() { return function() {}; }, removeListener: function() {} },
  };
});

/* ─── IPC adapter: send to Rust via webkit messageHandlers ──────── */
function _ipcSend(msg) {
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
      window.webkit.messageHandlers.ipc.postMessage(JSON.stringify(msg));
    }
  } catch(e) {}
}

/* ─── Wire up IPC listener to dispatch incoming Rust messages ───── */
window.addEventListener('message', function(event) {
  var data = event.data;
  if (!data || typeof data !== 'object') return;
  try { if (typeof data === 'string') data = JSON.parse(data); } catch(e) { return; }
  if (!data.type) return;
  var ipcMain = require('ipc-main');
  switch (data.type) {
    case 'ipc-message':
      var ev = { sender: { id: data.id || 0 }, channel: data.channel };
      ipcMain._emit(data.channel, ev, data.data);
      break;
    case 'ipc-invoke-response':
      break;
  }
});

/* ─── Public API ─────────────────────────────────────────────────── */
window.electron = require('index');
window.require = require;
window.__gelectron_ready = true;

window.__gelectron_run_main = function(script) {
  try {
    var fn = new Function('require', 'module', 'exports', '__dirname', '__filename', 'process', 'Buffer', 'global', 'window', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'URL', 'URLSearchParams', 'fetch', 'navigator', script);
    var m = { exports: {} };
    fn(require, m, m.exports, window.__dirname || __dirname, window.__filename || __filename, process, Buffer, globalThis, window, console, setTimeout, setInterval, clearTimeout, clearInterval, typeof URL !== 'undefined' ? URL : null, typeof URLSearchParams !== 'undefined' ? URLSearchParams : null, typeof fetch === 'function' ? fetch : function() { return Promise.reject(new Error('fetch not available')); }, navigator);
    return m.exports;
  } catch(e) {
    console.error('[gelectron] Error running main script:', e);
    throw e;
  }
};

})();
