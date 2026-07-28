'use strict';

/**
 * Gelectron - ipcMain module (Electron compatible)
 */

const { EventEmitter } = require('events');

class IpcMain extends EventEmitter {
  constructor() {
    super();
    this._handlers = new Map();
    this._onceHandlers = new Map();
  }

  handle(channel, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Expected function for channel '${channel}'`);
    }
    this._handlers.set(channel, handler);
    return this;
  }

  handleOnce(channel, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Expected function for channel '${channel}'`);
    }
    this._onceHandlers.set(channel, handler);
    return this;
  }

  on(channel, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Expected function for channel '${channel}'`);
    }
    super.on(channel, listener);
    return this;
  }

  once(channel, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Expected function for channel '${channel}'`);
    }
    super.once(channel, listener);
    return this;
  }

  removeHandler(channel) {
    this._handlers.delete(channel);
    return this;
  }

  removeListener(channel, listener) {
    super.removeListener(channel, listener);
    return this;
  }

  removeAllListeners(channel) {
    super.removeAllListeners(channel);
    return this;
  }

  listenerCount(channel) {
    return super.listenerCount(channel);
  }

  rawListeners(channel) {
    return super.rawListeners(channel);
  }

  eventNames() {
    return super.eventNames();
  }

  _invoke(channel, ...args) {
    const handler = this._handlers.get(channel);
    if (!handler) {
      return Promise.reject(new Error(`No handler registered for channel '${channel}'`));
    }
    try {
      const result = handler(...args);
      if (result instanceof Promise) {
        return result;
      }
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  _emit(channel, ...args) {
    return this.emit(channel, ...args);
  }

  _emitOnce(channel, ...args) {
    const handler = this._onceHandlers.get(channel);
    if (handler) {
      this._onceHandlers.delete(channel);
      return handler(...args);
    }
    return this.emit(channel, ...args);
  }
}

const ipcMain = new IpcMain();

module.exports = ipcMain;
