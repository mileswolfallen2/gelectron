'use strict';

/**
 * Gelectron - webContents utilities (Electron compatible)
 */

const { BrowserWindow } = require('./browser-window');

const webContents = {
  getAllWebContents() {
    return BrowserWindow.getAllWindows().map((win) => win.webContents);
  },

  getFocusedWebContents() {
    const focused = BrowserWindow.getFocusedWindow();
    return focused ? focused.webContents : null;
  },

  fromId(id) {
    const win = BrowserWindow.fromId(id);
    return win ? win.webContents : null;
  },
};

module.exports = webContents;
