'use strict';

/**
 * Gelectron - Notification module (Electron compatible)
 *
 * In native mode notifications are rendered by the Rust engine (notify-rust →
 * macOS Notification Center / Windows Toasts / Linux D-Bus) and the
 * 'click' / 'action' / 'reply' / 'close' / 'failed' events are delivered
 * back over the bridge. In plain Node mode we fall back to the browser
 * Notification API when the page grants permission.
 */

const { EventEmitter } = require('events');
const { bridge, isNative } = require('./native-bridge');

let _nativeSupported = null;
let _wired = false;

function _iconToPath(id, icon) {
  if (!icon) return null;
  if (typeof icon === 'string') return icon;
  if (icon && typeof icon.toPNG === 'function' && !icon.isEmpty()) {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const tmp = path.join(os.tmpdir(), `gelectron-notif-${id}-${Date.now()}.png`);
    try {
      fs.writeFileSync(tmp, icon.toPNG());
      return tmp;
    } catch (e) {
      return null;
    }
  }
  return null;
}

function _wireEvents() {
  if (_wired) return;
  _wired = true;
  bridge.on('notification-event', (msg) => {
    const notif = Notification._notifications.get(Number(msg.id));
    if (!notif) return;
    switch (msg.event) {
      case 'click':
        notif.emit('click');
        break;
      case 'close':
        Notification._notifications.delete(notif.id);
        notif.emit('close');
        break;
      case 'action': {
        const index = Number.isInteger(msg.action_index) ? msg.action_index : 0;
        notif.emit('action', index);
        break;
      }
      case 'reply':
        notif.emit('reply', String(msg.reply || ''));
        break;
      case 'failed':
        notif.emit('failed', new Error(String(msg.reply || 'Notification failed')));
        break;
    }
  });
}

class Notification extends EventEmitter {
  static _notifications = new Map();
  static _nextId = 1;

  constructor(options = {}) {
    super();
    this.id = Notification._nextId++;
    this.title = options.title || '';
    this.subtitle = options.subtitle || '';
    this.body = options.body || '';
    this.silent = !!options.silent;
    this.icon = options.icon || null;
    this.urgency = options.urgency || 'normal';
    this.timeoutType = options.timeoutType || 'default';
    this.closeButtonText = options.closeButtonText || '';
    this.toastXml = options.toastXml || '';
    this.actions = options.actions || [];
    this.hasReply = !!options.hasReply;
    this.replyPlaceholder = options.replyPlaceholder || '';
    this.sound = options.sound || '';

    Notification._notifications.set(this.id, this);
  }

  static isSupported() {
    if (isNative) {
      if (_nativeSupported === null) {
        _nativeSupported = true;
        if (typeof bridge._request === 'function') {
          bridge._request({ type: 'notification-is-supported' })
            .then((r) => { _nativeSupported = !!(r && r.supported); })
            .catch(() => {});
        }
      }
      return _nativeSupported;
    }
    return typeof globalThis.Notification !== 'undefined' &&
      globalThis.Notification.permission === 'granted';
  }

  show() {
    if (isNative) {
      _wireEvents();
      const payload = {
        type: 'notification-show',
        id: String(this.id),
        options: {
          title: this.title,
          subtitle: this.subtitle,
          body: this.body,
          silent: this.silent,
          icon: _iconToPath(this.id, this.icon),
          urgency: this.urgency,
          timeoutType: this.timeoutType,
          closeButtonText: this.closeButtonText,
          toastXml: this.toastXml,
          actions: this.actions.map((a) => ({ text: a && a.text })),
          hasReply: this.hasReply,
          replyPlaceholder: this.replyPlaceholder,
          sound: this.sound,
        },
      };
      const self = this;
      if (typeof bridge._request === 'function') {
        bridge._request(payload).then((result) => {
          if (result && result.success) {
            self.emit('show');
          } else {
            self.emit('failed', new Error((result && result.error) || 'Failed to show notification'));
          }
        }).catch(() => {
          self.emit('failed', new Error('Failed to show notification'));
        });
      } else {
        bridge._send(payload);
        this.emit('show');
      }
      return true;
    }

    if (typeof globalThis.Notification !== 'undefined' &&
        globalThis.Notification.permission === 'granted') {
      new globalThis.Notification(this.title, {
        body: this.body,
        icon: this.icon,
        silent: this.silent,
      });
    }

    console.log(`[gelectron] Notification shown: ${this.title}`);
    this.emit('show');
    return true;
  }

  close() {
    Notification._notifications.delete(this.id);
    if (isNative && typeof bridge._send === 'function') {
      bridge._send({ type: 'notification-close', id: String(this.id) });
    }
    this.emit('close');
  }

  static fromNotification(notification) {
    return notification;
  }
}

module.exports = { Notification };
