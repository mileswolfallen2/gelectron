'use strict';

/**
 * Gelectron - `process` polyfill for WebView-only (no Node.js) mode.
 *
 * When an Electron app runs inside a WebView without a Node.js runtime the
 * compat layer has to provide its own `process` object. This module builds
 * one that mirrors the parts of the Node.js `process` global that apps and
 * libraries commonly rely on:
 *
 *   - Identity/state:  pid, title, argv, execPath, execArgv, arch, platform
 *   - Environment:     env, cwd()
 *   - Runtime info:    version, versions, uptime()
 *   - Resources:       memoryUsage(), cpuUsage()
 *   - Scheduling:      nextTick(), hrtime()
 *   - Control:         exit(), kill(), abort(), crash()
 *   - Events:          on()/once()/removeListener()/emit() (EventEmitter-like)
 *
 * All the values come from real measurements where possible
 * (performance.now(), navigator.hardwareConcurrency, performance.memory).
 *
 * The polyfill lives in a single function (`buildProcessPolyfill`) whose
 * source can be embedded as a string - `processPolyfillScript()` - so both
 * the Node-compatible module (`createProcess`) and the WebView preload
 * injection share exactly one implementation.
 */

function buildProcessPolyfill(g, opts) {
  'use strict';
  opts = opts || {};
  const startTime = Date.now();
  const listeners = new Map();
  const win = (g && g.window) || (typeof window !== 'undefined' ? window : null);
  const hasPerf = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function');

  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const resolvedPlatform = /Windows/i.test(ua) ? 'win32'
    : (/Mac|iOS/.test(ua) ? 'darwin'
      : (/Android|Linux/.test(ua) ? 'linux' : 'linux'));
  const resolvedArch = /aarch64|arm64|ARM64/i.test(ua) ? 'arm64'
    : (/\bx64\b|amd64|x86_64/i.test(ua) ? 'x64' : 'x64');

  const process = {
    title: opts.title || 'gelectron',
    arch: opts.arch || resolvedArch,
    platform: opts.platform || resolvedPlatform,
    version: 'v18.20.0',
    versions: {
      gelectron: opts.version || '0.1.1',
      node: '18.20.0',
      v8: '10.2.154.26',
      uv: '1.44.2',
      zlib: '1.2.13',
      modules: '108',
      openssl: '3.0.10',
    },
    pid: opts.pid != null ? opts.pid : (Math.floor(Math.random() * 1e5) + 1000),
    ppid: opts.ppid || 0,
    execPath: opts.execPath || (typeof location !== 'undefined' ? String(location.href || '') : ''),
    execArgv: opts.execArgv || [],
    argv: opts.argv ? opts.argv.slice() : [],
    env: opts.env ? Object.assign({}, opts.env) : {},
    config: {},
    release: { name: 'node', lts: 'Hydrogen' },
    cwd() {
      return opts.cwd || (typeof location !== 'undefined' ? String(location.pathname).replace(/\/[^/]*$/, '/') : '/');
    },

    // --- scheduling ----------------------------------------------------
    nextTick(callback, ...args) {
      if (typeof callback !== 'function') {
        throw new TypeError('callback must be a function');
      }
      if (typeof Promise !== 'undefined') {
        Promise.resolve().then(() => callback(...args));
      } else {
        setTimeout(() => callback(...args), 0);
      }
    },

    hrtime(previous) {
      const ms = hasPerf ? performance.now() : Date.now() - startTime;
      let seconds = Math.floor(ms / 1000);
      let nanos = Math.floor((ms - seconds * 1000) * 1e6);
      if (previous) {
        seconds -= previous[0];
        nanos -= previous[1];
        if (nanos < 0) {
          seconds -= 1;
          nanos += 1e9;
        }
      }
      return [seconds, nanos];
    },

    uptime() {
      return (Date.now() - startTime) / 1000;
    },

    // --- resources -----------------------------------------------------
    memoryUsage() {
      let total = 16 * 1024 * 1024;
      let used = 8 * 1024 * 1024;
      if (hasPerf && performance.memory && performance.memory.usedJSHeapSize) {
        used = performance.memory.usedJSHeapSize;
        total = performance.memory.totalJSHeapSize || Math.max(total, used);
      }
      const external = estimateHeapBytes();
      return {
        rss: used + external,
        heapTotal: total,
        heapUsed: used,
        external: external,
        arrayBuffers: 0,
      };
    },

    cpuUsage(previousValue) {
      // Best-effort: measure wall-clock since launch with a synthetic user
      // share so {user}/{system} deltas behave monotonically like Node's.
      const now = hasPerf ? performance.now() : Date.now() - startTime;
      const current = {
        user: Math.round(now * 1000),
        system: Math.round(now * 120),
      };
      if (previousValue) {
        current.user = Math.max(0, current.user - (previousValue.user || 0));
        current.system = Math.max(0, current.system - (previousValue.system || 0));
      }
      return current;
    },

    // --- control -------------------------------------------------------
    kill(pid, signal) {
      if (typeof pid !== 'number') {
        throw new TypeError('pid must be a number');
      }
      const sig = String(signal || 'SIGTERM');
      if (win && typeof win.close === 'function' && (pid === process.pid || pid <= 0)) {
        try {
          if (sig === 'SIGKILL' || sig === 'SIGTERM' || sig === 'SIGINT') {
            win.close();
          }
        } catch (e) {
          // Ignore - window may not be closable from script
        }
      }
      // No real process table exists in a WebView; report success so
      // signal-sending logic in apps does not crash.
      return true;
    },

    abort() {
      throw new Error('Aborted');
    },

    crash() {
      throw new Error('Gelectron process.crash()');
    },

    exit(code) {
      if (win && typeof win.close === 'function') {
        win.close();
      } else {
        throw new Error('Process exit requested with code ' + code);
      }
    },

    // --- permissions ---------------------------------------------------
    getuid() { return 0; },
    setuid() {},
    getgid() { return 0; },
    setgid() {},
    geteuid() { return 0; },
    getgroups() { return [0]; },

    // --- event emitter -------------------------------------------------
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
      return process;
    },
    once(type, listener) {
      const wrapped = (...args) => {
        process.removeListener(type, wrapped);
        listener(...args);
      };
      return process.on(type, wrapped);
    },
    addListener(type, listener) {
      return process.on(type, listener);
    },
    removeListener(type, listener) {
      const arr = listeners.get(type);
      if (arr) {
        const i = arr.indexOf(listener);
        if (i !== -1) arr.splice(i, 1);
      }
      return process;
    },
    removeAllListeners(type) {
      if (type) listeners.delete(type);
      else listeners.clear();
      return process;
    },
    emit(type, ...args) {
      const arr = (listeners.get(type) || []).slice();
      for (const fn of arr) {
        try {
          fn(...args);
        } catch (e) {
          if (typeof console !== 'undefined') console.error(e);
        }
      }
      return arr.length > 0;
    },

    _getActiveRequests: () => [],
    _getActiveHandles: () => [],
  };

  if (!process.env.GELECTRON_NATIVE) {
    process.env.GELECTRON_NATIVE = '1';
    process.env.GELECTRON_POLYFILL = '1';
  }

  function estimateHeapBytes() {
    if (!win) return 0;
    let live = 0;
    let refs = [win];
    const seen = new Set();
    const MAX_WALK = 150000;
    while (refs.length && live < MAX_WALK) {
      const next = [];
      for (const obj of refs) {
        if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) continue;
        if (seen.has(obj)) continue;
        seen.add(obj);
        live += 48;
        let keys;
        try {
          keys = Object.keys(obj);
        } catch (e) {
          continue;
        }
        for (let i = 0; i < keys.length && next.length < 5000; i++) {
          const v = obj[keys[i]];
          if (v && (typeof v === 'object' || typeof v === 'function') && !seen.has(v)) {
            next.push(v);
          }
        }
      }
      refs = next;
    }
    return live;
  }

  return process;
}

// Node-compatible entry point: build a fresh `process`-like object.
function createProcess(opts = {}) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return buildProcessPolyfill(g, opts);
}

// Self-contained script that installs `window.process` if it does not exist.
// Used by the preload layer / webview bundle so WebView-only apps get the
// same `process` API without needing a Node.js runtime.
function processPolyfillScript(opts = {}) {
  const optsJson = JSON.stringify(opts);
  const src = buildProcessPolyfill.toString();
  return `(function () {
  var g = typeof window !== 'undefined' ? window
        : (typeof globalThis !== 'undefined' ? globalThis : {});
  if (g.process) return;
  var build = (${src});
  var proc = build(g, ${optsJson});
  try {
    Object.defineProperty(g, 'process', { value: proc, writable: true, configurable: true });
  } catch (e) {
    g.process = proc;
  }
})();`;
}

module.exports = { createProcess, processPolyfillScript, buildProcessPolyfill };