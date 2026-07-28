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
const { bridge, isNative } = require('./native-bridge');
const clipboard = require('./clipboard');
const { Screen } = require('./screen');
const nativeTheme = require('./nativeTheme');

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
  clipboard,
  screen: new Screen(),
  nativeTheme,

  systemPreferences: {
    isDarkMode: () => nativeTheme.shouldUseDarkColors,
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
