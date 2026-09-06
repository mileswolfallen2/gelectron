'use strict';

/**
 * Gelectron - screen module (Electron compatible)
 *
 * Queries display information from the native process when available and
 * otherwise returns sensible single-display defaults so apps never hang.
 */

const os = require('os');
const { EventEmitter } = require('events');
const { bridge, isNative } = require('./native-bridge');

function defaultDisplay() {
  const width = 1920;
  const height = 1080;
  return {
    id: 1,
    label: 'Display 1',
    bounds: { x: 0, y: 0, width, height },
    workArea: { x: 0, y: 0, width, height },
    size: { width, height },
    workAreaSize: { width, height },
    scaleFactor: 1,
    rotation: 0,
    internal: true,
    touchSupport: 'unknown',
    displayFrequency: 60,
    colorSpace: '',
    colorDepth: 24,
    monitors: [],
  };
}

function normalize(raw) {
  const d = raw || {};
  return {
    id: d.id != null ? d.id : 1,
    label: d.label || 'Display 1',
    bounds: d.bounds || { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: d.workArea || d.bounds || { x: 0, y: 0, width: 1920, height: 1080 },
    size: d.size || { width: 1920, height: 1080 },
    workAreaSize: d.workAreaSize || d.size || { width: 1920, height: 1080 },
    scaleFactor: d.scaleFactor || 1,
    rotation: d.rotation || 0,
    internal: !!d.internal,
    touchSupport: d.touchSupport || 'unknown',
    displayFrequency: d.displayFrequency || 60,
    colorSpace: d.colorSpace || '',
    colorDepth: d.colorDepth || 24,
    monitors: d.monitors || [],
  };
}

function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

class Screen extends EventEmitter {
  constructor() {
    super();
    this._displays = [defaultDisplay()];

    // Parse an optional env-provided display list (packaged apps can inject
    // this to avoid a round-trip).
    try {
      if (process.env.GELECTRON_DISPLAYS) {
        const parsed = JSON.parse(process.env.GELECTRON_DISPLAYS);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this._displays = parsed.map(normalize);
        }
      }
    } catch (e) {
      // Ignore malformed env
    }

    // Refresh from the native process when available.
    if (isNative) {
      bridge.request('screen-get-displays', {}).then((res) => {
        if (res && Array.isArray(res.displays) && res.displays.length > 0) {
          this._displays = res.displays.map(normalize);
          this.emit('display-added', this._displays[this._displays.length - 1]);
        }
      }).catch(() => {});
    }
  }

  getAllDisplays() {
    return this._displays;
  }

  getPrimaryDisplay() {
    return this._displays[0] || defaultDisplay();
  }

  getDisplayNearestPoint(point) {
    const p = point || { x: 0, y: 0 };
    let best = this._displays[0];
    let bestDist = Infinity;
    for (const d of this._displays) {
      const cx = d.bounds.x + d.bounds.width / 2;
      const cy = d.bounds.y + d.bounds.height / 2;
      const dist = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  getDisplayForPoint(point) {
    return this.getDisplayNearestPoint(point);
  }

  getDisplayMatching(rect) {
    const r = rect || { x: 0, y: 0, width: 0, height: 0 };
    let best = this._displays[0];
    let bestArea = 0;
    for (const d of this._displays) {
      if (rectsIntersect(d.bounds, r)) {
        const area = d.bounds.width * d.bounds.height;
        if (area > bestArea) {
          bestArea = area;
          best = d;
        }
      }
    }
    return best;
  }

  getCursorScreenPoint() {
    // No native cursor query is implemented; return the center of the primary
    // display as a harmless default.
    const d = this.getPrimaryDisplay();
    return {
      x: Math.round(d.bounds.x + d.bounds.width / 2),
      y: Math.round(d.bounds.y + d.bounds.height / 2),
    };
  }

  on(eventName, listener) { super.on(eventName, listener); return this; }
  once(eventName, listener) { super.once(eventName, listener); return this; }
}

module.exports = { Screen, defaultDisplay, normalize };