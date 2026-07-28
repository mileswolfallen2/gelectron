'use strict';

/**
 * Gelectron - ipcRenderer module (Electron compatible)
 */

const { EventEmitter } = require('events');

class IpcRendererEvent {
  constructor(sender, channel) {
    this.sender = sender;
    this.channel = channel;
    this._returnValue = undefined;
    this._defaultPrevented = false;
  }

  preventDefault() {
    this._defaultPrevented = true;
  }

  get defaultPrevented() {
    return this._defaultPrevented;
  }
}

class IpcRenderer extends EventEmitter {
  constructor() {
    super();
    this._requestId = 0;
    this._pending = new Map();
    this._listeners = new Map();
  }

  async invoke(channel, ...args) {
    const requestId = `ipc-${++this._requestId}-${Date.now()}`;
    const argsJson = JSON.stringify(args);

    // In full integration, this calls the native ipc_renderer_invoke
    // For now, route through the global IPC bridge if available
    if (typeof globalThis.__gelectron_ipc === 'function') {
      return globalThis.__gelectron_ipc(channel, ...args);
    }

    // Fallback: emit event for main process handling
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });

      // Emit for any registered handlers
      this.emit(`invoke:${channel}`, ...args);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this._pending.has(requestId)) {
          this._pending.delete(requestId);
          reject(new Error(`IPC invoke timed out for channel '${channel}'`));
        }
      }, 30000);
    });
  }

  send(channel, ...args) {
    const argsJson = JSON.stringify(args);

    if (typeof globalThis.__gelectron_send === 'function') {
      globalThis.__gelectron_send(channel, ...args);
    }

    this.emit(`send:${channel}`, ...args);
  }

  sendSync(channel, ...args) {
    // Synchronous IPC is deprecated in Electron; return undefined
    return undefined;
  }

  postMessage(channel, message, transfer) {
    this.send(channel, message);
  }

  on(channel, listener) {
    const wrappedListener = (event, ...args) => {
      listener(event, ...args);
    };

    // Store wrapped reference for removeListener
    if (!this._listeners.has(channel)) {
      this._listeners.set(channel, new Map());
    }
    this._listeners.get(channel).set(listener, wrappedListener);

    return super.on(channel, wrappedListener);
  }

  once(channel, listener) {
    const wrappedListener = (event, ...args) => {
      listener(event, ...args);
    };
    return super.once(channel, wrappedListener);
  }

  removeListener(channel, listener) {
    const channelListeners = this._listeners.get(channel);
    if (channelListeners) {
      const wrapped = channelListeners.get(listener);
      if (wrapped) {
        channelListeners.delete(listener);
        return super.removeListener(channel, wrapped);
      }
    }
    return super.removeListener(channel, listener);
  }

  removeAllListeners(channel) {
    this._listeners.delete(channel);
    return super.removeAllListeners(channel);
  }

  // Internal method to receive messages from main process
  _receiveMessage(channel, data) {
    const event = new IpcRendererEvent(this, channel);
    this.emit(channel, event, data);
  }

  // Internal method to resolve a pending invoke
  _resolveInvoke(requestId, result) {
    const pending = this._pending.get(requestId);
    if (pending) {
      this._pending.delete(requestId);
      pending.resolve(result);
    }
  }

  // Internal method to reject a pending invoke
  _rejectInvoke(requestId, error) {
    const pending = this._pending.get(requestId);
    if (pending) {
      this._pending.delete(requestId);
      pending.reject(new Error(error));
    }
  }
}

const ipcRenderer = new IpcRenderer();

module.exports = { ipcRenderer, IpcRendererEvent };
