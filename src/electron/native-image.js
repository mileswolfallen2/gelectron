'use strict';

/**
 * Gelectron - nativeImage module (Electron compatible)
 */

class NativeImage {
  constructor() {
    this._isEmpty = true;
    this._width = 0;
    this._height = 0;
    this._data = null;
  }

  static createFromPath(path) {
    const img = new NativeImage();
    try {
      const fs = require('fs');
      const data = fs.readFileSync(path);
      img._data = data;
      img._isEmpty = false;
      if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
        img._width = data.readUInt32BE(16);
        img._height = data.readUInt32BE(20);
      } else if (data.length > 22 && data[0] === 0x00 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) {
        img._width = data[6] || 256;
        img._height = data[7] || 256;
      } else if (data.length > 12 && data[0] === 0x69 && data[1] === 0x63 && data[2] === 0x6e && data[3] === 0x73) {
        const type = data.toString('ascii', 8, 12);
        const c = type.charCodeAt(1);
        if (c >= 0x30 && c <= 0x39) {
          img._width = img._height = 1 << (c - 0x30);
        } else if (type[0] === 'p' && c >= 0x34 && c <= 0x38) {
          img._width = img._height = 16 << (c - 0x34);
        }
      }
    } catch (err) {
      console.error(`[gelectron] Failed to load image: ${path}`, err.message);
    }
    return img;
  }

  static createFromBuffer(buffer, options = {}) {
    const img = new NativeImage();
    if (buffer && buffer.length > 0) {
      img._data = buffer;
      img._isEmpty = false;
      img._width = options.width || 0;
      img._height = options.height || 0;

      // Try to detect PNG dimensions
      if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
        img._width = buffer.readUInt32BE(16);
        img._height = buffer.readUInt32BE(20);
      }
    }
    return img;
  }

  static createFromDataURL(dataURL) {
    const matches = dataURL.match(/^data:[^;]+;base64,(.+)$/);
    if (matches) {
      return NativeImage.createFromBuffer(Buffer.from(matches[1], 'base64'));
    }
    return NativeImage.createEmpty();
  }

  static createEmpty() {
    return new NativeImage();
  }

  toPNG(options = {}) {
    return this._data || Buffer.alloc(0);
  }

  toJPEG(quality) {
    return this._data || Buffer.alloc(0);
  }

  toBitmap(options = {}) {
    return this._data || Buffer.alloc(0);
  }

  toDataURL() {
    if (!this._data) return 'data:,';
    const base64 = this._data.toString('base64');
    return `data:image/png;base64,${base64}`;
  }

  resize(options) {
    const resized = new NativeImage();
    resized._width = options.width || this._width;
    resized._height = options.height || this._height;
    resized._data = this._data;
    resized._isEmpty = this._isEmpty;
    return resized;
  }

  crop(rect) {
    return this.resize({ width: rect.width, height: rect.height });
  }

  getBitmap(options = {}) {
    return this._data || Buffer.alloc(0);
  }

  getSize() {
    return { width: this._width, height: this._height };
  }

  isEmpty() {
    return this._isEmpty;
  }

  setTemplateImage(template) {
    this._isTemplate = template;
  }

  isTemplateImage() {
    return this._isTemplate || false;
  }
}

module.exports = NativeImage;
