'use strict';

/**
 * Gelectron - menu module (Electron compatible)
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
    console.log('[gelectron] Menu.popup called');
  }

  closePopup() {
    console.log('[gelectron] Menu.closePopup called');
  }

  getMenuItemById(id) {
    return this._findMenuItemById(this.items, id);
  }

  _findMenuItemById(items, id) {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.submenu) {
        const found = this._findMenuItemById(item.submenu.items || item.submenu, id);
        if (found) return found;
      }
    }
    return null;
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
