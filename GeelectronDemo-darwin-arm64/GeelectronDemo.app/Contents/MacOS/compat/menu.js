'use strict';

/**
 * Gelectron - menu module (Electron compatible)
 *
 * Supports native menu rendering through the Rust/tao bridge.
 * When running in native mode, setApplicationMenu and popup route
 * through the bridge for native OS menu rendering.
 */

const { EventEmitter } = require('events');

class MenuItem extends EventEmitter {
  constructor(options = {}) {
    super();
    this.id = options.id || '';
    this.label = options.label || '';
    this.type = options.type || 'normal';
    this.role = options.role || '';
    this.accelerator = options.accelerator || '';
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.checked = options.checked || false;
    this.submenu = options.submenu || null;
    this.toolTip = options.toolTip || '';
    this.icon = options.icon || null;
    this._click = options.click || null;

    // Recursively build submenu
    if (this.submenu && !(this.submenu instanceof Menu)) {
      if (Array.isArray(this.submenu)) {
        this.submenu = Menu.buildFromTemplate(this.submenu);
      } else {
        this.submenu = Menu.buildFromTemplate(this.submenu.items || []);
      }
    }
  }

  click() {
    if (this._click) {
      this._click(this, null);
    }
    this.emit('click');
  }
}

class Menu extends EventEmitter {
  constructor() {
    super();
    this.items = [];
    this._id = Menu._nextId++;
  }

  static _nextId = 1;
  static _applicationMenu = null;

  static buildFromTemplate(template) {
    const menu = new Menu();
    if (Array.isArray(template)) {
      menu.items = template.map((item) => {
        if (item instanceof MenuItem) return item;
        if (item.type === 'separator') {
          return new MenuItem({ type: 'separator' });
        }
        return new MenuItem(item);
      });
    }
    return menu;
  }

  static getApplicationMenu() {
    return Menu._applicationMenu || null;
  }

  static setApplicationMenu(menu) {
    Menu._applicationMenu = menu;
    if (menu) {
      // Route through bridge if available
      try {
        const { bridge, isNative } = require('./native-bridge');
        if (isNative && bridge) {
          bridge._send({ type: 'set-application-menu', menu: menu._serialize() });
        }
      } catch (e) {
        // Not available in all contexts
      }
    }
  }

  append(menuItem) {
    if (menuItem instanceof MenuItem) {
      this.items.push(menuItem);
    } else {
      this.items.push(new MenuItem(menuItem));
    }
    return this;
  }

  insert(menuItem, position) {
    if (menuItem instanceof MenuItem) {
      this.items.splice(position, 0, menuItem);
    } else {
      this.items.splice(position, 0, new MenuItem(menuItem));
    }
    return this;
  }

  popup(options = {}) {
    try {
      const { bridge, isNative } = require('./native-bridge');
      if (isNative && bridge) {
        bridge._send({ type: 'popup-menu', menu: this._serialize(), x: options.x, y: options.y });
        return;
      }
    } catch (e) {}
    console.log('[gelectron] Menu.popup called');
  }

  closePopup() {
    try {
      const { bridge, isNative } = require('./native-bridge');
      if (isNative && bridge) {
        bridge._send({ type: 'close-popup-menu' });
        return;
      }
    } catch (e) {}
    console.log('[gelectron] Menu.closePopup called');
  }

  getMenuItemById(id) {
    return this._findMenuItemById(this.items, id);
  }

  _findMenuItemById(items, id) {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.submenu) {
        const submenu = item.submenu instanceof Menu ? item.submenu.items : (item.submenu.items || item.submenu);
        const found = this._findMenuItemById(submenu, id);
        if (found) return found;
      }
    }
    return null;
  }

  _serialize() {
    return {
      items: this.items.map((item) => {
        const obj = {
          id: item.id,
          label: item.label,
          type: item.type,
          role: item.role,
          accelerator: item.accelerator,
          enabled: item.enabled,
          visible: item.visible,
          checked: item.checked,
          toolTip: item.toolTip,
        };
        if (item.submenu instanceof Menu) {
          obj.submenu = item.submenu._serialize();
        } else if (item.submenu && Array.isArray(item.submenu)) {
          obj.submenu = Menu.buildFromTemplate(item.submenu)._serialize();
        }
        return obj;
      }),
    };
  }

  items() {
    return this.items;
  }

  getApplicationMenu() {
    return Menu._applicationMenu;
  }

  setApplicationMenu(menu) {
    Menu._applicationMenu = menu;
  }
}

module.exports = { Menu, MenuItem };
