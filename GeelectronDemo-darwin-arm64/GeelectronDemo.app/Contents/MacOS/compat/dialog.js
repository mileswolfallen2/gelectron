'use strict';

/**
 * Gelectron - dialog module (Electron compatible)
 */

const dialog = {
  showOpenDialog(browserWindowOrOptions, options) {
    let opts = options || browserWindowOrOptions || {};
    if (browserWindowOrOptions && browserWindowOrOptions.webContents) {
      opts = options || {};
    }

    // Route through native if available
    if (typeof globalThis.__gelectron_dialog_open === 'function') {
      return globalThis.__gelectron_dialog_open(opts);
    }

    return Promise.resolve({ canceled: true, filePaths: [] });
  },

  showSaveDialog(browserWindowOrOptions, options) {
    let opts = options || browserWindowOrOptions || {};
    if (browserWindowOrOptions && browserWindowOrOptions.webContents) {
      opts = options || {};
    }

    if (typeof globalThis.__gelectron_dialog_save === 'function') {
      return globalThis.__gelectron_dialog_save(opts);
    }

    return Promise.resolve({ canceled: true, filePath: undefined });
  },

  showMessageBox(browserWindowOrOptions, options) {
    let opts = options || browserWindowOrOptions || {};
    if (browserWindowOrOptions && browserWindowOrOptions.webContents) {
      opts = options || {};
    }

    if (typeof globalThis.__gelectron_dialog_message === 'function') {
      return globalThis.__gelectron_dialog_message(opts);
    }

    return Promise.resolve({ response: 0, checkboxChecked: false });
  },

  showErrorBox(title, content) {
    console.error(`[gelectron] ${title}: ${content}`);
  },

  showMessageBoxSync(browserWindowOrOptions, options) {
    let opts = options || browserWindowOrOptions || {};
    if (browserWindowOrOptions && browserWindowOrOptions.webContents) {
      opts = options || {};
    }

    if (typeof globalThis.__gelectron_dialog_message_sync === 'function') {
      return globalThis.__gelectron_dialog_message_sync(opts);
    }

    return 0;
  },

  showCertificateTrustDialog(browserWindowOrOptions, options) {
    return Promise.resolve();
  },
};

module.exports = dialog;
