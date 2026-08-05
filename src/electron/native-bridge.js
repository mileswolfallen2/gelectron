'use strict';

const readline = require('readline');
const { EventEmitter } = require('events');

const isNative = process.env.GELECTRON_NATIVE === '1';

class NativeBridge extends EventEmitter {
  constructor() {
    super();
    this._ready = false;
    this._readyCallbacks = [];
    this._windowListeners = new Map();
    this._pendingRequests = {};

    if (isNative) {
      this._setupStdio();
    }
  }

  _setupStdio() {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) return;
      try {
        const msg = JSON.parse(trimmed);
        this._handleMessage(msg);
      } catch (e) {
        // Not IPC, ignore
      }
    });

    process.stdout.on('error', () => {});
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'ready':
        this._ready = true;
        for (const cb of this._readyCallbacks) cb();
        this._readyCallbacks = [];
        this.emit('ready');
        break;
      case 'window-closed':
        this.emit('window-closed', msg.id);
        break;
      case 'window-focus':
        this.emit('window-focus', msg.id);
        break;
      case 'ipc-message':
        this.emit('ipc-message', msg.id, msg.channel, msg.data);
        break;
      case 'response':
        this._resolveRequest(msg.request_id, msg.result, msg.error || null);
        break;
    }
  }

  _request(msg) {
    return new Promise((resolve, reject) => {
      const id = 'req-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      this._pendingRequests[id] = { resolve, reject };
      msg.request_id = id;
      this._send(msg);
    });
  }

  _resolveRequest(requestId, result, error) {
    const pending = this._pendingRequests[requestId];
    if (pending) {
      delete this._pendingRequests[requestId];
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
    }
  }

  _send(msg) {
    if (!isNative) return;
    try {
      process.stdout.write(JSON.stringify(msg) + '\n');
    } catch (e) {
      // stdout may be closed
    }
  }

  onReady(cb) {
    if (this._ready) {
      cb();
    } else {
      this._readyCallbacks.push(cb);
    }
  }

  createWindow(id, options) {
    this._send({ type: 'create-window', id, options });
  }

  loadUrl(id, url) {
    this._send({ type: 'load-url', id, url });
  }

  loadFile(id, filePath) {
    this._send({ type: 'load-file', id, path: filePath });
  }

  destroyWindow(id) {
    this._send({ type: 'destroy-window', id });
  }

  setTitle(id, title) {
    this._send({ type: 'set-title', id, title });
  }

  setSize(id, width, height) {
    this._send({ type: 'set-size', id, width, height });
  }

  showWindow(id) {
    this._send({ type: 'show', id });
  }

  hideWindow(id) {
    this._send({ type: 'hide', id });
  }

  focusWindow(id) {
    this._send({ type: 'focus', id });
  }

  minimizeWindow(id) {
    this._send({ type: 'minimize', id });
  }

  maximizeWindow(id) {
    this._send({ type: 'maximize', id });
  }

  closeWindow(id) {
    this._send({ type: 'close', id });
  }

  sendToRenderer(id, channel, ...data) {
    this._send({ type: 'ipc-message', id, channel, data: data.length === 1 ? data[0] : data });
  }

  evalJs(id, script) {
    this._send({ type: 'eval-js', id, script });
  }

  quit() {
    this._send({ type: 'quit' });
  }

  relaunch(execPath, args) {
    this._send({ type: 'relaunch', exec_path: execPath, args: args || [] });
  }

  setAppIcon(base64Png) {
    this._send({ type: 'set-app-icon', icon: base64Png });
  }
}

const bridge = new NativeBridge();

module.exports = { bridge, isNative };
