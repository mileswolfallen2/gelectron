'use strict';

/**
 * Gelectron - Notification module (Electron compatible)
 */

const { EventEmitter } = require('events');

class Notification extends EventEmitter {
  static _notifications = new Map();
  static _nextId = 1;

  constructor(options = {}) {
    super();
    this.id = Notification._nextId++;
    this.title = options.title || '';
    this.body = options.body || '';
    this.subtitle = options.subtitle || '';
    this.silent = options.silent || false;
    this.icon = options.icon || null;
    this.urgency = options.urgency || 'normal';
    this.timeoutType = options.timeoutType || 'default';
    this.closeButtonText = options.closeButtonText || '';
    this.toastXml = options.toastXml || '';
    this.actions = options.actions || [];
    this.replyPlaceholder = options.replyPlaceholder || '';

    Notification._notifications.set(this.id, this);
  }

  static isSupported() {
    return true;
  }

  show() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new globalThis.Notification(this.title, {
        body: this.body,
        icon: this.icon,
      });
    }

    console.log(`[gelectron] Notification shown: ${this.title}`);
    this.emit('show');
    return true;
  }

  close() {
    Notification._notifications.delete(this.id);
    console.log(`[gelectron] Notification ${this.id} closed`);
    this.emit('close');
  }

  static fromNotification(notification) {
    return notification;
  }
}

module.exports = { Notification };
