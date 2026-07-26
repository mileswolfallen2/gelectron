'use strict';

/**
 * Gelectron - autoUpdater module (Electron compatible)
 * Stub implementation for electron-updater compatibility.
 *
 * electron-updater's MacUpdater / NsisUpdater / AppImageUpdater all
 * access `require("electron").autoUpdater` and expect it to be an
 * EventEmitter with the native Electron autoUpdater API surface:
 *   .on("error", …), .on("update-downloaded", …)
 *   .setFeedURL(), .getFeedURL()
 *   .checkForUpdates()
 *   .quitAndInstall()
 *   .removeListener()
 */

const { EventEmitter } = require('events');

class AutoUpdater extends EventEmitter {
  constructor() {
    super();
    this._isUpdateAvailable = false;
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
    this._feedURL = options;
  }

  async checkForUpdates() {
    return {
      updateInfo: null,
      isUpdateAvailable: false,
    };
  }

  async checkForAndNotifyIfAvailable() {
    return this.checkForUpdates();
  }

  async downloadUpdate() {}

  quitAndInstall(isSilent = false, isForceRunAfter = false) {
    this.emit('before-quit-for-update');
    process.exit(0);
  }

  quitAndInstallAgain(isSilent = false, isForceRunAfter = false) {
    this.quitAndInstall(isSilent, isForceRunAfter);
  }

  async updateDownloaded() {
    return false;
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
