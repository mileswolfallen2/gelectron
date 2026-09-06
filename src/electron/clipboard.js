'use strict';

/**
 * Gelectron - clipboard module (Electron compatible)
 *
 * Implements text / HTML / rich-text clipboard operations using the OS-native
 * tooling so it works both in native Node mode and in the pure-Node fallback.
 */

const { execSync } = require('child_process');
const os = require('os');
const { isNative } = require('./native-bridge');

function platform() {
  return os.platform();
}

// ─── Low-level platform pipes ───────────────────────────────────────────────

function readCommand(cmd) {
  try {
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
    return out == null ? '' : out.toString();
  } catch (e) {
    return '';
  }
}

function writePipe(cmd, text) {
  try {
    execSync(`${cmd} '${String(text).replace(/'/g, "'\\''")}'`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    try {
      const { spawnSync } = require('child_process');
      if (platform() === 'win32') {
        // Powershell stdin pipe is the most reliable on Windows
        const ps = spawnSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard'], {
          input: String(text),
          encoding: 'utf8',
        });
        return ps.status === 0;
      }
      return false;
    } catch (e2) {
      return false;
    }
  }
}

function readTextFromSystem() {
  const p = platform();
  try {
    if (p === 'darwin') return execSync('pbpaste', { encoding: 'utf8' }).toString();
    if (p === 'win32') {
      const out = execSync('powershell -NoProfile -Command "Get-Clipboard -Raw"', { encoding: 'utf8' });
      return out.replace(/\r?\n$/, '');
    }
    for (const tool of ['xclip -selection clipboard -o', 'xsel --clipboard --output', 'wl-paste']) {
      try {
        return execSync(tool, { encoding: 'utf8' }).toString();
      } catch (e) { /* try next */ }
    }
    return '';
  } catch (e) {
    return '';
  }
}

function writeTextToSystem(text) {
  const p = platform();
  const content = String(text);
  try {
    if (p === 'darwin') return writePipe('pbcopy', content);
    if (p === 'win32') {
      const { spawnSync } = require('child_process');
      const ps = spawnSync('powershell', ['-NoProfile', '-Command', 'Set-Clipboard'], {
        input: content,
        encoding: 'utf8',
      });
      return ps.status === 0;
    }
    for (const cmd of [
      `xclip -selection clipboard -in <<'GELECTRON_EOF'\n${content}\nGELECTRON_EOF`,
      `xsel --clipboard --input <<'GELECTRON_EOF'\n${content}\nGELECTRON_EOF`,
      `wl-copy <<'GELECTRON_EOF'\n${content}\nGELECTRON_EOF`,
    ]) {
      try {
        execSync(cmd, { encoding: 'utf8' });
        return true;
      } catch (e) { /* try next */ }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

const clipboard = {
  readText() {
    return readTextFromSystem();
  },

  writeText(text) {
    return writeTextToSystem(text);
  },

  readHTML() {
    // Native bridge request falls back to plain text when unavailable
    if (isNative && typeof globalThis.__gelectron_clipboard_read_html === 'function') {
      return globalThis.__gelectron_clipboard_read_html();
    }
    return readTextFromSystem();
  },

  writeHTML(markup, type = 'text/html') {
    try {
      if (platform() === 'win32') {
        const html = String(markup);
        const { spawnSync } = require('child_process');
        const ps = spawnSync('powershell', ['-NoProfile', '-Command',
          `Set-Clipboard -Value @'${html.replace(/'/g, "''")}'@`], { encoding: 'utf8' });
        return ps.status === 0;
      }
      return writeTextToSystem(markup);
    } catch (e) {
      return false;
    }
  },

  // Best-effort plain text read (Electron returns an image object for rich
  // clipboard types on some platforms; we degrade to text where possible).
  readTextOnly() {
    return readTextFromSystem();
  },

  readImage() {
    return NativeImageStub.empty();
  },

  writeImage(image) {
    return !!image;
  },

  availableFormats() {
    return ['text/plain'];
  },

  read(format = 'text/plain') {
    return readTextFromSystem();
  },

  write(data, type = 'text/plain') {
    return writeTextToSystem(data);
  },

  clear() {},

  readBookmark() {
    return { title: '', url: '' };
  },

  writeBookmark() {},

  readFindText() {
    try {
      return process.env.GELECTRON_FIND_TEXT || '';
    } catch (e) {
      return '';
    }
  },

  writeFindText(text) {
    try {
      process.env.GELECTRON_FIND_TEXT = String(text);
      return true;
    } catch (e) {
      return false;
    }
  },
};

// Avoid a hard dependency on native-image for the stub paths.
const NativeImageStub = {
  empty() {
    return {
      isEmpty: () => true,
      toPNG: () => Buffer.alloc(0),
    };
  },
};

module.exports = clipboard;