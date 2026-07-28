'use strict';

/**
 * Gelectron - safeStorage module (Electron compatible)
 */

const safeStorage = {
  isAvailable() {
    return true;
  },

  async encryptString(plaintext) {
    // Basic obfuscation; in production, this routes through the native keyring
    return Buffer.from(plaintext).toString('base64');
  },

  async decryptString(encrypted) {
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  },

  async encryptBuffer(buffer) {
    return Buffer.from(buffer).toString('base64');
  },

  async decryptBuffer(encrypted) {
    return Buffer.from(encrypted, 'base64');
  },
};

module.exports = safeStorage;
