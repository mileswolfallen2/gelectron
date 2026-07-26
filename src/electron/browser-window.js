'use strict';

/**
 * Gelectron - BrowserWindow module (Electron compatible)
 */

const { EventEmitter } = require('events');
const path = require('path');

class WebContents extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this._url = '';
    this._title = '';
    this._isLoading = false;
    this._zoomFactor = 1.0;
    this._zoomLevel = 0;
    this._userAgent = '';
    this._audioMuted = false;
  }

  get URL() { return this._url; }
  get isLoading() { return this._isLoading; }
  get title() { return this._title; }

  get session() {
    return {
      id: `session-${this.id}`,
      cookies: {
        get: async () => [],
        set: async () => {},
        remove: async () => {},
      },
      protocol: {
        registerFileProtocol: () => {},
        registerHttpProtocol: () => {},
        unregisterProtocol: () => {},
        isProtocolRegistered: () => false,
      },
      setPermissionRequestHandler: () => {},
      setPermissionCheckHandler: () => {},
      webRequest: { onBeforeRequest: () => {}, onHeadersReceived: () => {} },
      setUserAgent: () => {},
      getUserAgent: () => '',
    };
  }

  get processId() { return process.pid; }

  loadURL(targetUrl) {
    this._url = targetUrl;
    this._isLoading = true;
    this.emit('did-start-loading');
    setTimeout(() => {
      this._isLoading = false;
      this.emit('did-stop-loading');
      this.emit('did-finish-load');
      this.emit('dom-ready');
    }, 100);
    return Promise.resolve();
  }

  loadFile(filePath) {
    return this.loadURL(`file://${path.resolve(filePath)}`);
  }

  reload() {
    this._isLoading = true;
    this.emit('did-start-loading');
    setTimeout(() => {
      this._isLoading = false;
      this.emit('did-stop-loading');
      this.emit('did-finish-load');
    }, 50);
    return Promise.resolve();
  }

  canGoBack() { return false; }
  canGoForward() { return false; }
  goBack() {}
  goForward() {}

  executeJavaScript(code, userGesture = true) {
    return Promise.resolve(null);
  }

  insertCSS(css) { return Promise.resolve(0); }
  insertJS(code, hasUserGesture = true) { return this.executeJavaScript(code, hasUserGesture); }

  send(channel, ...args) {
    console.log(`[gelectron] webContents.send('${channel}')`);
  }

  sendInputEvent() {}

  setZoomFactor(factor) { this._zoomFactor = factor; }
  getZoomFactor() { return this._zoomFactor; }
  setZoomLevel(level) { this._zoomLevel = level; }
  getZoomLevel() { return this._zoomLevel; }
  setUserAgent(ua) { this._userAgent = ua; }
  getUserAgent() { return this._userAgent; }
  setAudioMuted(muted) { this._audioMuted = muted; }
  isAudioMuted() { return this._audioMuted; }

  openDevTools() { console.log('[gelectron] openDevTools'); }
  closeDevTools() {}
  isDevToolsOpened() { return false; }
  toggleDevTools() {}
  inspectElement() {}

  setIgnoreMenuShortcuts() {}
  setWindowOpenHandler() { return { action: 'deny' }; }
  setPermissionRequestHandler() {}
  setCertificateVerifyProc() {}
  setBackgroundColor() {}
  isCrashed() { return false; }
  capturePage() { return Promise.resolve(null); }
  getResourceUsage() { return { images: 0, scripts: 0, css: 0, xhr: 0, webgl: 0 }; }
  type() { return 'backgroundPage'; }
  focused() { return false; }
  isFocused() { return false; }
  destroy() {}
}

class BrowserWindow extends EventEmitter {
  static _windows = new Map();
  static _nextId = 1;

  constructor(options = {}) {
    super();

    this.id = BrowserWindow._nextId++;
    this._options = {
      width: options.width || 800,
      height: options.height || 600,
      minWidth: options.minWidth || 0,
      minHeight: options.minHeight || 0,
      maxWidth: options.maxWidth || 0,
      maxHeight: options.maxHeight || 0,
      title: options.title || 'Gelectron',
      backgroundColor: options.backgroundColor || '#ffffff',
      show: options.show !== false,
      frame: options.frame !== false,
      resizable: options.resizable !== false,
      minimizable: options.minimizable !== false,
      maximizable: options.maximizable !== false,
      closable: options.closable !== false,
      fullscreen: options.fullscreen || false,
      alwaysOnTop: options.alwaysOnTop || false,
      transparent: options.transparent || false,
      decorations: options.decorations !== false,
      icon: options.icon || null,
      titleBarStyle: options.titleBarStyle || 'default',
      trafficLightPosition: options.trafficLightPosition || null,
      vibrancy: options.vibrancy || null,
      webPreferences: {
        preload: options.webPreferences?.preload || null,
        contextIsolation: options.webPreferences?.contextIsolation !== false,
        nodeIntegration: options.webPreferences?.nodeIntegration || false,
        sandbox: options.webPreferences?.sandbox || false,
        devTools: options.webPreferences?.devTools !== false,
        webSecurity: options.webPreferences?.webSecurity !== false,
        allowRunningInsecureContent: options.webPreferences?.allowRunningInsecureContent || false,
        experimentalFeatures: options.webPreferences?.experimentalFeatures || false,
        ...options.webPreferences,
      },
    };

    this._url = '';
    this._isDestroyed = false;
    this._isVisible = this._options.show;
    this._isMinimized = false;
    this._isMaximized = false;
    this._isFullScreen = this._options.fullscreen;

    this.webContents = new WebContents(this.id);

    BrowserWindow._windows.set(this.id, this);

    if (this._options.show) {
      process.nextTick(() => {
        if (!this._isDestroyed) {
          this.emit('ready-to-show');
          this.show();
        }
      });
    }
  }

  static fromWebContents(webContents) {
    for (const win of BrowserWindow._windows.values()) {
      if (win.webContents && win.webContents.id === webContents.id) return win;
    }
    return null;
  }

  static getAllWindows() {
    return Array.from(BrowserWindow._windows.values()).filter((w) => !w.isDestroyed());
  }

  static getFocusedWindow() { return null; }

  static fromId(id) { return BrowserWindow._windows.get(id) || null; }

  static addExtension() {}
  static removeExtension() {}
  static getExtensions() { return {}; }

  loadURL(targetUrl) {
    this._url = targetUrl;
    return this.webContents.loadURL(targetUrl);
  }

  loadFile(filePath) {
    return this.loadURL(`file://${path.resolve(filePath)}`);
  }

  show() {
    if (this._isDestroyed) return;
    this._isVisible = true;
    this._isMinimized = false;
    this.emit('show');
  }

  hide() {
    if (this._isDestroyed) return;
    this._isVisible = false;
    this.emit('hide');
  }

  close() {
    if (this._isDestroyed) return;
    this.emit('close');
    this.destroy();
  }

  destroy() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    BrowserWindow._windows.delete(this.id);
    this.emit('closed');
  }

  focus() { if (!this._isDestroyed) this.emit('focus'); }
  blur() {}

  minimize() { if (!this._isDestroyed) { this._isMinimized = true; this.emit('minimize'); } }
  maximize() { if (!this._isDestroyed) { this._isMaximized = true; this.emit('maximize'); } }
  unmaximize() { if (!this._isDestroyed) { this._isMaximized = false; this.emit('unmaximize'); } }
  restore() { if (!this._isDestroyed) { this._isMinimized = false; this._isMaximized = false; this.emit('restore'); } }

  setFullScreen(flag) { this._isFullScreen = flag; this.emit('enter-full-screen'); }
  isFullScreen() { return this._isFullScreen; }
  isMinimized() { return this._isMinimized; }
  isMaximized() { return this._isMaximized; }
  isVisible() { return this._isVisible; }
  isDestroyed() { return this._isDestroyed; }
  isFocused() { return false; }
  isNormal() { return !this._isMinimized && !this._isMaximized && !this._isFullScreen; }

  setAlwaysOnTop(flag) { this._options.alwaysOnTop = flag; }
  isAlwaysOnTop() { return this._options.alwaysOnTop; }

  setPosition(x, y) {}
  getPosition() { return [0, 0]; }
  setSize(w, h) { this._options.width = w; this._options.height = h; }
  getSize() { return [this._options.width, this._options.height]; }
  setMinimumSize(w, h) { this._options.minWidth = w; this._options.minHeight = h; }
  getMinimumSize() { return [this._options.minWidth, this._options.minHeight]; }
  setMaximumSize(w, h) { this._options.maxWidth = w; this._options.maxHeight = h; }
  getMaximumSize() { return [this._options.maxWidth, this._options.maxHeight]; }

  setResizable(v) { this._options.resizable = v; }
  isResizable() { return this._options.resizable; }
  setMovable() {}
  isMovable() { return true; }
  setMinimizable(v) { this._options.minimizable = v; }
  isMinimizable() { return this._options.minimizable; }
  setMaximizable(v) { this._options.maximizable = v; }
  isMaximizable() { return this._options.maximizable; }
  setClosable(v) { this._options.closable = v; }
  isClosable() { return this._options.closable; }

  setTitle(title) { this._options.title = title; this.webContents._title = title; }
  getTitle() { return this._options.title; }

  setSkipTaskbar() {}
  setKiosk() {}
  isKiosk() { return false; }

  center() {}
  setBounds() {}
  getBounds() { return { x: 0, y: 0, width: this._options.width, height: this._options.height }; }
  setSimpleFullScreen() {}
  isSimpleFullScreen() { return false; }
  setAutoHideCursor() {}
  setContentBounds() {}
  getContentBounds() { return this.getBounds(); }
  isEnabled() { return true; }
  setEnabled() {}
  setProgressBar() {}
  setOverlayIcon() {}
  setVisibleOnAllWorkspaces() {}
  isVisibleOnAllWorkspaces() { return false; }
  setVibrancy() {}
  getNativeWindowHandle() { return Buffer.alloc(0); }
  setHasShadow() {}
  hasShadow() { return true; }
  setOpacity() {}
  getOpacity() { return 1.0; }
  setThumbarButtons() {}
  setThumbnailClip() {}
  setThumbnailToolTip() {}
  setAppDetails() {}
  setForeground() {}
  flashFrame() {}
  setIcon() {}
  setBackgroundColor(c) { this._options.backgroundColor = c; }
  getBackgroundColor() { return this._options.backgroundColor; }

  capturePage() { return this.webContents.capturePage(); }
  print() { console.log('[gelectron] print called'); }
  printToPDF() { return Promise.resolve(Buffer.alloc(0)); }
  setParentWindow() {}
  getParentWindow() { return null; }
  getChildWindows() { return []; }
  selectPreviousTab() {}
  selectNextTab() {}
  mergeAllWindows() {}
  moveTabToNewWindow() {}
  toggleTabBar() {}
  addTabbedWindow() {}
}

module.exports = { BrowserWindow, WebContents };
