'use strict';

/**
 * Gelectron - Tray module (Electron compatible)
 */

const { EventEmitter } = require('events');

class Tray extends EventEmitter {
  static _trays = new Map();
  static _nextId = 1;

  constructor(image) {
    super();
    this.id = Tray._nextId++;
    this._image = image;
    this._tooltip = '';
    this._menu = null;
    this._isDestroyed = false;

    Tray._trays.set(this.id, this);
    console.log(`[gelectron] Tray ${this.id} created`);
  }

  setToolTip(tooltip) {
    this._tooltip = tooltip;
  }

  getToolTip() {
    return this._tooltip;
  }

  setImage(image) {
    this._image = image;
  }

  setPressedImage(image) {}

  setContextMenu(menu) {
    this._menu = menu;
  }

  getContextMenu() {
    return this._menu;
  }

  popupContextMenu(options) {
    console.log('[gelectron] Tray.popupContextMenu');
  }

  isDestroyed() {
    return this._isDestroyed;
  }

  destroy() {
    this._isDestroyed = true;
    Tray._trays.delete(this.id);
    this.emit('destroy');
  }

  getBounds() {
    return { x: 0, y: 0, width: 22, height: 22 };
  }

  static fromId(id) {
    return Tray._trays.get(id) || null;
  }

  static getAllTrays() {
    return Array.from(Tray._trays.values());
  }
}

module.exports = { Tray };
