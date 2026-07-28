'use strict';

/**
 * Gelectron - Preload script injection
 *
 * This script is injected into the renderer process before the page loads.
 * It provides the ipcRenderer and contextBridge APIs to preload scripts.
 */

function getPreloadScript() {
  return `
(function() {
  'use strict';

  // Expose gelectron preload APIs
  window.__gelectron = window.__gelectron || {};

  // IPC Renderer stub
  window.__gelectron.ipcRenderer = {
    _requestId: 0,
    _pending: {},

    invoke: function(channel) {
      var args = Array.prototype.slice.call(arguments, 1);
      var requestId = 'ipc-' + (++this._requestId) + '-' + Date.now();
      var message = {
        type: 'invoke',
        requestId: requestId,
        channel: channel,
        args: args
      };

      if (typeof window.__gelectron_send === 'function') {
        window.__gelectron_send(JSON.stringify(message));
      }

      return new Promise(function(resolve, reject) {
        window.__gelectron.ipcRenderer._pending[requestId] = { resolve: resolve, reject: reject };
        setTimeout(function() {
          if (window.__gelectron.ipcRenderer._pending[requestId]) {
            delete window.__gelectron.ipcRenderer._pending[requestId];
            reject(new Error('IPC invoke timed out for channel: ' + channel));
          }
        }, 30000);
      });
    },

    send: function(channel) {
      var args = Array.prototype.slice.call(arguments, 1);
      var message = {
        type: 'send',
        channel: channel,
        args: args
      };
      if (typeof window.__gelectron_send === 'function') {
        window.__gelectron_send(JSON.stringify(message));
      }
    },

    sendSync: function() { return undefined; },
    postMessage: function(channel, message) { this.send(channel, message); },

    on: function(channel, listener) {
      var wrappedListener = function(event) {
        listener(event, Array.prototype.slice.call(arguments, 1));
      };
      window.addEventListener('message', function(event) {
        if (event.data && event.data.__gelectron_channel === channel) {
          wrappedListener(event, event.data.args);
        }
      });
      return this;
    },

    once: function(channel, listener) {
      var self = this;
      var wrappedListener = function(event) {
        listener(event, Array.prototype.slice.call(arguments, 1));
        self.removeListener(channel, listener);
      };
      return this.on(channel, wrappedListener);
    },

    removeListener: function(channel, listener) {
      return this;
    },

    removeAllListeners: function(channel) {
      return this;
    },

    _resolveInvoke: function(requestId, result) {
      var pending = this._pending[requestId];
      if (pending) {
        delete this._pending[requestId];
        pending.resolve(result);
      }
    },

    _rejectInvoke: function(requestId, error) {
      var pending = this._pending[requestId];
      if (pending) {
        delete this._pending[requestId];
        pending.reject(new Error(error));
      }
    }
  };

  // Context Bridge API
  window.__gelectron.contextBridge = {
    exposeInMainWorld: function(key, api) {
      if (typeof window[key] !== 'undefined') {
        console.warn('[gelectron] contextBridge: window.' + key + ' already exists, skipping');
        return;
      }
      Object.defineProperty(window, key, {
        value: Object.freeze(JSON.parse(JSON.stringify(api))),
        writable: false,
        configurable: false,
        enumerable: true
      });
    }
  };

  // Receive messages from main process
  window.addEventListener('message', function(event) {
    if (event.data && event.data.__gelectron_channel) {
      var channel = event.data.__gelectron_channel;
      var args = event.data.args;

      // Resolve pending invoke
      if (channel === '__gelectron_ipc_resolve') {
        var requestId = args[0];
        var result = args[1];
        window.__gelectron.ipcRenderer._resolveInvoke(requestId, result);
      } else if (channel === '__gelectron_ipc_reject') {
        var requestId = args[0];
        var error = args[1];
        window.__gelectron.ipcRenderer._rejectInvoke(requestId, error);
      } else {
        // Regular IPC message from main process
        window.__gelectron.ipcRenderer._receiveMessage(channel, args);
      }
    }
  });

  // Expose as global for preload scripts
  window.electron = window.electron || {};
  window.electron.ipcRenderer = window.__gelectron.ipcRenderer;
  window.electron.contextBridge = window.__gelectron.contextBridge;

})();
`;
}

module.exports = { getPreloadScript };
