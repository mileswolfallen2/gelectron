'use strict';

/**
 * Gelectron - nativeTheme module (Electron compatible)
 *
 * Reports dark mode / accent colors. When running with the native binary it
 * asks the OS for the current theme; otherwise it falls back to an env hint
 * (or 'light').
 */

const { EventEmitter } = require('events');
const { bridge, isNative } = require('./native-bridge');

function osDarkHint() {
  const env = process.env;
  if (env.COLORFGBG && /^0;/.test(env.COLORFGBG)) return true;
  return false;
}

class NativeTheme extends EventEmitter {
  constructor() {
    super();
    this._dark = osDarkHint();
    this._source = 'system';
    this._accent = '#007AFF';
    this._loaded = false;

    if (isNative) {
      bridge.request('native-theme-query', {}).then((res) => {
        if (res) {
          if (typeof res.shouldUseDarkColors === 'boolean') this._dark = res.shouldUseDarkColors;
          if (res.accentColor) this._accent = res.accentColor;
          if (res.themeSource) this._source = res.themeSource;
          this._loaded = true;
        }
      }).catch(() => {});
    }
  }

  get shouldUseDarkColors() {
    return this._dark;
  }

  get shouldUseInvertedColorScheme() {
    return false;
  }

  get themeSource() {
    return this._source;
  }

  set themeSource(value) {
    if (value === 'system' || value === 'light' || value === 'dark') {
      this._source = value;
      if (value === 'dark') this._dark = true;
      else if (value === 'light') this._dark = false;
    }
  }

  get themes() {
    return {
      initial: this._dark ? ['dark'] : ['light'],
      current: this._dark ? ['dark'] : ['light'],
    };
  }

  on(eventName, listener) { super.on(eventName, listener); return this; }
  once(eventName, listener) { super.once(eventName, listener); return this; }
}

module.exports = new NativeTheme();
module.exports.NativeTheme = NativeTheme;