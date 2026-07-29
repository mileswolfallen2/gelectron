'use strict';

const { bridge, isNative } = require('./native-bridge');
const ipcMain = require('./ipc-main');
const nativeImage = require('./native-image');

let _app, _BrowserWindow, _Menu, _MenuItem, _Tray, _dialog, _shell;
let _Notification, _safeStorage, _contextBridge, _webContents;
let _autoUpdater, _AutoUpdater, _clipboard, _Screen, _nativeTheme;

function lazy(loader) {
  let mod;
  return function () {
    if (!mod) mod = loader();
    return mod;
  };
}

const lazyApp = lazy(() => { _app = require('./app').app; return _app; });
const lazyBrowserWindow = lazy(() => { _BrowserWindow = require('./browser-window').BrowserWindow; return _BrowserWindow; });
const lazyMenu = lazy(() => { const m = require('./menu'); _Menu = m.Menu; _MenuItem = m.MenuItem; return { Menu: _Menu, MenuItem: _MenuItem }; });
const lazyTray = lazy(() => { _Tray = require('./tray').Tray; return _Tray; });
const lazyDialog = lazy(() => { _dialog = require('./dialog'); return _dialog; });
const lazyShell = lazy(() => { _shell = require('./shell'); return _shell; });
const lazyNotification = lazy(() => { _Notification = require('./notification').Notification; return _Notification; });
const lazySafeStorage = lazy(() => { _safeStorage = require('./safe-storage'); return _safeStorage; });
const lazyContextBridge = lazy(() => { _contextBridge = require('./context-bridge'); return _contextBridge; });
const lazyWebContents = lazy(() => { _webContents = require('./web-contents'); return _webContents; });
const lazyAutoUpdater = lazy(() => { const a = require('./auto-updater'); _autoUpdater = a.autoUpdater; _AutoUpdater = a.AutoUpdater; return { autoUpdater: _autoUpdater, AutoUpdater: _AutoUpdater }; });
const lazyClipboard = lazy(() => { _clipboard = require('./clipboard'); return _clipboard; });
const lazyScreen = lazy(() => { if (!_Screen) _Screen = require('./screen').Screen; return new _Screen(); });
const lazyNativeTheme = lazy(() => { _nativeTheme = require('./nativeTheme'); return _nativeTheme; });

if (isNative) {
  bridge.on('ipc-message', (windowId, channel, data) => {
    const event = { sender: { id: windowId }, channel };
    ipcMain._emit(channel, event, data);
  });
}

// Session stub (electron-updater calls session.fromPartition)
const sessionStub = {
  defaultSession: {
    cookies: {
      get: async () => [],
      set: async () => {},
      remove: async () => {},
      getSession: () => null,
    },
    protocol: {
      registerFileProtocol: () => {},
      registerHttpProtocol: () => {},
      unregisterProtocol: () => {},
      isProtocolRegistered: () => false,
    },
    setPermissionRequestHandler: () => {},
    setPermissionCheckHandler: () => {},
    webRequest: {
      onBeforeRequest: () => {},
      onHeadersReceived: () => {},
    },
    setUserAgent: () => {},
    getUserAgent: () => '',
  },
  fromPartition: (partition, options) => ({
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
    webRequest: {
      onBeforeRequest: () => {},
      onHeadersReceived: () => {},
      resolveProxy: async () => '',
    },
    setUserAgent: () => {},
    getUserAgent: () => '',
    clearCache: async () => {},
    clearStorageData: async () => {},
    setProxy: async () => {},
    getProxy: async () => ({ mode: 'direct' }),
  }),
};

module.exports = {
  get app() { return lazyApp(); },
  get BrowserWindow() { return lazyBrowserWindow(); },
  get ipcMain() { return ipcMain; },
  get Menu() { return lazyMenu().Menu; },
  get MenuItem() { return lazyMenu().MenuItem; },
  get Tray() { return lazyTray(); },
  get dialog() { return lazyDialog(); },
  get shell() { return lazyShell(); },
  get Notification() { return lazyNotification(); },
  get nativeImage() { return nativeImage; },
  get safeStorage() { return lazySafeStorage(); },
  get contextBridge() { return lazyContextBridge(); },
  get webContents() { return lazyWebContents(); },
  get autoUpdater() { return lazyAutoUpdater().autoUpdater; },
  get AutoUpdater() { return lazyAutoUpdater().AutoUpdater; },
  get session() { return sessionStub; },
  get clipboard() { return lazyClipboard(); },
  get screen() { return lazyScreen(); },
  get nativeTheme() { return lazyNativeTheme(); },

  get systemPreferences() {
    const nt = lazyNativeTheme();
    return {
      isDarkMode: () => nt.shouldUseDarkColors,
      getAccentColor: () => '#007AFF',
      getColor: () => '#ffffff',
      isSwipeTrackingFromScrollEventsEnabled: () => false,
      subscribeNotification: () => () => {},
      unsubscribeNotification: () => {},
      subscribeLocalNotification: () => () => {},
      unsubscribeLocalNotification: () => {},
      getUserDefault: () => null,
      setUserDefault: () => {},
      removeUserDefault: () => {},
    };
  },
  get powerMonitor() {
    return {
      on: () => {},
      off: () => {},
      once: () => {},
      getSystemIdleState: () => 'active',
      getSystemIdleTime: () => 0,
      isInLowPowerMode: () => false,
    };
  },
  get globalShortcut() {
    return {
      register: () => true,
      unregister: () => {},
      unregisterAll: () => {},
      isRegistered: () => false,
    };
  },
  get net() {
    return {
      fetch: globalThis.fetch || (() => Promise.reject(new Error('fetch not available'))),
    };
  },

  // Constants
  get IPCRenderer() {
    return {
      invoke: () => Promise.resolve(),
      send: () => {},
      on: () => () => {},
      removeListener: () => {},
    };
  },
};
