'use strict';

/**
 * Gelectron - shell module (Electron compatible)
 */

const { exec } = require('child_process');
const path = require('path');
const os = require('os');

const shell = {
  openExternal(url, options = {}) {
    const platform = os.platform();
    let cmd;

    if (platform === 'darwin') {
      cmd = `open "${url}"`;
    } else if (platform === 'win32') {
      cmd = `start "" "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }

    return new Promise((resolve, reject) => {
      exec(cmd, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  },

  openPath(path) {
    return new Promise((resolve, reject) => {
      const platform = os.platform();
      let cmd;

      if (platform === 'darwin') {
        cmd = `open "${path}"`;
      } else if (platform === 'win32') {
        cmd = `start "" "${path}"`;
      } else {
        cmd = `xdg-open "${path}"`;
      }

      exec(cmd, (error) => {
        if (error) reject(error.message);
        else resolve('');
      });
    });
  },

  showItemInFolder(fullPath) {
    const platform = os.platform();
    let cmd;

    if (platform === 'darwin') {
      cmd = `open -R "${fullPath}"`;
    } else if (platform === 'win32') {
      cmd = `explorer /select,"${fullPath}"`;
    } else {
      const dir = path.dirname(fullPath);
      cmd = `xdg-open "${dir}"`;
    }

    exec(cmd);
  },

  moveItemToTrash(fullPath) {
    // Use fs.rm or platform-specific trash command
    const fs = require('fs');
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      return Promise.resolve('');
    } catch (err) {
      return Promise.reject(err.message);
    }
  },

  beep() {
    process.stdout.write('\x07');
  },

  writeShortcutLink(shortcutPath, options = {}) {
    console.log('[gelectron] writeShortcutLink called');
    return true;
  },

  readShortcutLink(shortcutPath) {
    return {
      target: '',
      cwd: '',
      args: '',
      description: '',
      icon: '',
      iconIndex: 0,
    };
  },
};

module.exports = shell;
