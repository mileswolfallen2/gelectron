'use strict';

/**
 * Gelectron - Electron compatibility layer.
 * Drop-in replacement for require('electron').
 */

const { app } = require('./app');
const { BrowserWindow } = require('./browser-window');
const ipcMain = require('./ipc-main');
const { Menu, MenuItem } = require('./menu');
const { Tray } = require('./tray');
const dialog = require('./dialog');
const shell = require('./shell');
const { Notification } = require('./notification');
const nativeImage = require('./native-image');
const safeStorage = require('./safe-storage');
const contextBridge = require('./context-bridge');
const webContents = require('./web-contents');
const { autoUpdater, AutoUpdater } = require('./auto-updater');

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
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  MenuItem,
  Tray,
  dialog,
  shell,
  Notification,
  nativeImage,
  safeStorage,
  contextBridge,
  webContents,
  autoUpdater,
  AutoUpdater,
  session: sessionStub,

  // Aliases for common imports
  clipboard: {
    readText: () => '',
    writeText: () => {},
    readImage: () => nativeImage.createEmpty(),
    writeImage: () => {},
  },
  screen: {
    getPrimaryDisplay: () => ({
      id: 0,
      label: '',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      size: { width: 1920, height: 1080 },
      workAreaSize: { width: 1920, height: 1040 },
      scaleFactor: 1.0,
      rotation: 0,
      internal: false,
      touchSupport: 'unknown',
    }),
    getAllDisplays: () => [],
    getDisplayMatching: () => null,
  },
  systemPreferences: {
    isDarkMode: () => false,
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
  },
  powerMonitor: {
    on: () => {},
    off: () => {},
    once: () => {},
    getSystemIdleState: () => 'active',
    getSystemIdleTime: () => 0,
    isInLowPowerMode: () => false,
  },
  globalShortcut: {
    register: () => true,
    unregister: () => {},
    unregisterAll: () => {},
    isRegistered: () => false,
  },
  net: {
    fetch: globalThis.fetch || (() => Promise.reject(new Error('fetch not available'))),
  },

  // Constants
  IPCRenderer: {
    invoke: () => Promise.resolve(),
    send: () => {},
    on: () => () => {},
    removeListener: () => {},
  },
};
