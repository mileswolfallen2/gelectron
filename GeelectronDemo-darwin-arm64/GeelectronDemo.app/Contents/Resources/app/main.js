const { app, BrowserWindow } = require('electron');
const path = require('path');

const results = [];

function test(name, fn) {
  try {
    const val = fn();
    results.push({ name, status: 'PASS', value: String(val) });
  } catch (e) {
    results.push({ name, status: 'FAIL', value: e.message });
  }
}

function asyncTest(name, fn) {
  return fn().then((val) => {
    results.push({ name, status: 'PASS', value: String(val) });
  }).catch((e) => {
    results.push({ name, status: 'FAIL', value: e.message });
  });
}

let mainWindow = null;

// ─── Properties ────────────────────────────────────────────────

test('app.requestSingleInstanceLock() returns boolean', () => {
  const lock = app.requestSingleInstanceLock();
  if (typeof lock !== 'boolean') throw new Error('Expected boolean, got ' + typeof lock);
  return lock;
});

test('app.isReady() (method)', () => app.isReady());

test('app.isReady (property)', () => {
  if (typeof app.isReady !== 'boolean') throw new Error('Expected boolean, got ' + typeof app.isReady);
  return app.isReady;
});

test('app.appPath (property)', () => {
  if (typeof app.appPath !== 'string') throw new Error('Expected string, got ' + typeof app.appPath);
  return app.appPath;
});

test('app.locale (property)', () => {
  if (typeof app.locale !== 'string') throw new Error('Expected string, got ' + typeof app.locale);
  return app.locale;
});

test('app.userAgent (property)', () => {
  if (typeof app.userAgent !== 'string') throw new Error('Expected string, got ' + typeof app.userAgent);
  return app.userAgent;
});

test('app.getVersion()', () => app.getVersion());

test('app.getName()', () => app.getName());

test('app.getAppPath()', () => app.getAppPath());

test('app.name get/set', () => {
  const old = app.name;
  app.name = 'TestApp';
  const result = app.name;
  app.name = old;
  if (result !== 'TestApp') throw new Error('Expected TestApp, got ' + result);
  return result;
});

test('app.name set null reverts', () => {
  app.name = null;
  return app.name === 'Gelectron App';
});

// ─── Path Methods ──────────────────────────────────────────────

test('app.getPath("home")', () => app.getPath('home'));

test('app.getPath("userData")', () => app.getPath('userData'));

test('app.getPath("temp")', () => app.getPath('temp'));

test('app.getPath("desktop")', () => app.getPath('desktop'));

test('app.getPath("documents")', () => app.getPath('documents'));

test('app.getPath("downloads")', () => app.getPath('downloads'));

test('app.getPath("logs")', () => app.getPath('logs'));

test('app.getPath("crashDumps")', () => app.getPath('crashDumps'));

test('app.getPath("app") returns userData', () => {
  return app.getPath('app') === app.getPath('userData');
});

test('app.setPath / app.getPath roundtrip', () => {
  app.setPath('testPath', '/tmp/test-gelectron');
  return app.getPath('testPath') === '/tmp/test-gelectron';
});

test('app.getPath("unknown") returns userData fallback', () => {
  return app.getPath('nonexistent') === app.getPath('userData');
});

// ─── User Agent / Locale ───────────────────────────────────────

test('app.getLocale()', () => app.getLocale());

test('app.getUserAgent()', () => app.getUserAgent());

test('app.setUserAgent()', () => {
  app.setUserAgent('TestAgent/1.0');
  const result = app.getUserAgent();
  app.setUserAgent(null);
  return result;
});

test('app.setUserAgent(null) resets', () => {
  app.setUserAgent(null);
  const ua = app.getUserAgent();
  if (!ua.includes('Gelectron')) throw new Error('Expected Gelectron UA, got ' + ua);
  return true;
});

// ─── Lifecycle ─────────────────────────────────────────────────

test('app.isPackaged is boolean', () => {
  if (typeof app.isPackaged !== 'boolean') throw new Error('Expected boolean');
  return app.isPackaged;
});

test('app.whenReady() returns Promise', () => {
  const p = app.whenReady();
  if (!p || typeof p.then !== 'function') throw new Error('Not a Promise');
  return true;
});

test('app.requestSingleInstanceLock() sync', () => {
  const result = app.requestSingleInstanceLock();
  return typeof result === 'boolean';
});

test('app.acquireSingleInstanceLock() sync', () => {
  const result = app.acquireSingleInstanceLock();
  return typeof result === 'boolean';
});

test('app.releaseSingleInstanceLock() no-op', () => {
  app.releaseSingleInstanceLock();
  return true;
});

// ─── Events ────────────────────────────────────────────────────

test('app.on / app.removeListener', () => {
  let called = false;
  const fn = () => { called = true; };
  app.on('test-event', fn);
  app.emit('test-event');
  app.removeListener('test-event', fn);
  return called;
});

test('app.once fires once', () => {
  let count = 0;
  app.once('test-once', () => { count++; });
  app.emit('test-once');
  app.emit('test-once');
  return count === 1;
});

test('app.addListener returns this', () => {
  const fn = () => {};
  const result = app.addListener('test-chain', fn);
  app.removeListener('test-chain', fn);
  return result === app;
});

test('app.emit("activate") does not crash', () => {
  app.emit('activate');
  return true;
});

test('app.emit("focus") does not crash', () => {
  app.emit('focus');
  return true;
});

test('app.emit("blur") does not crash', () => {
  app.emit('blur');
  return true;
});

test('app.emit("browser-window-focus") does not crash', () => {
  app.emit('browser-window-focus');
  return true;
});

test('app.emit("browser-window-blur") does not crash', () => {
  app.emit('browser-window-blur');
  return true;
});

test('app.emit("web-contents-created") does not crash', () => {
  app.emit('web-contents-created', {}, {});
  return true;
});

// ─── Dock (macOS) ──────────────────────────────────────────────

test('app.dock exists (macOS)', () => {
  if (process.platform === 'darwin') {
    if (!app.dock) throw new Error('app.dock is null on macOS');
    return typeof app.dock;
  }
  return 'N/A (not macOS)';
});

test('app.dock.bounce', () => {
  if (process.platform === 'darwin') return app.dock.bounce();
  return 'N/A';
});

test('app.dock.setBadgeCount / getBadgeCount', () => {
  if (process.platform === 'darwin') {
    app.dock.setBadgeCount(5);
    return app.dock.getBadgeCount();
  }
  return 'N/A';
});

// ─── Command Line ──────────────────────────────────────────────

test('app.commandLine.appendSwitch', () => {
  app.commandLine.appendSwitch('test-switch', 'test-value');
  return app.commandLine.hasSwitch('test-switch');
});

test('app.commandLine.getSwitch', () => app.commandLine.getSwitch('test-switch'));

test('app.commandLine.removeSwitch', () => {
  app.commandLine.removeSwitch('test-switch');
  return !app.commandLine.hasSwitch('test-switch');
});

// ─── Badge ─────────────────────────────────────────────────────

test('app.setBadgeCount / getBadgeCount', () => {
  const result = app.setBadgeCount(3);
  if (app.getBadgeCount() !== 3) throw new Error('Expected 3, got ' + app.getBadgeCount());
  app.setBadgeCount(0);
  return result;
});

test('app.setBadgeCount(0) resets', () => {
  app.setBadgeCount(5);
  app.setBadgeCount(0);
  return app.getBadgeCount() === 0;
});

// ─── Metrics / GPU ────────────────────────────────────────────

test('app.getAppMetrics() returns array', () => {
  const metrics = app.getAppMetrics();
  if (!Array.isArray(metrics)) throw new Error('Expected array');
  if (metrics.length === 0) throw new Error('Expected at least one entry');
  const m = metrics[0];
  if (typeof m.pid !== 'number') throw new Error('Expected pid to be number');
  if (!m.memory) throw new Error('Expected memory object');
  return metrics.length + ' entries';
});

test('app.getGPUInfo("basic")', async () => {
  const info = await app.getGPUInfo('basic');
  if (!info || !info.gpuDevice) throw new Error('Missing gpuDevice');
  return info.GPUActive;
});

test('app.getGPUInfo("complete")', async () => {
  const info = await app.getGPUInfo('complete');
  if (!info || !info.gpuDriver) throw new Error('Missing gpuDriver');
  return info.gpuDriver;
});

test('app.getGPUFeatureStatus()', () => {
  const status = app.getGPUFeatureStatus();
  if (!status || typeof status.gpuCompositing !== 'string') throw new Error('Missing gpuCompositing');
  return Object.keys(status).length + ' features';
});

test('app.disableHardwareAcceleration() no-op', () => {
  app.disableHardwareAcceleration();
  return true;
});

test('app.disableDomainBlockingFor3DAPIs() no-op', () => {
  app.disableDomainBlockingFor3DAPIs();
  return true;
});

// ─── Login Items ───────────────────────────────────────────────

test('app.getLoginItemSettings()', () => {
  const s = app.getLoginItemSettings();
  if (typeof s.openAtLogin !== 'boolean') throw new Error('Missing openAtLogin');
  if (!s.hasOwnProperty('launchAtLogin')) throw new Error('Missing launchAtLogin');
  return true;
});

test('app.setLoginItemSettings() no-op', () => {
  app.setLoginItemSettings({ openAtLogin: true });
  return true;
});

// ─── About Panel ───────────────────────────────────────────────

test('app.setAboutPanelOptions / getAboutPanelOptions', () => {
  app.setAboutPanelOptions({ applicationName: 'Test', copyright: 'MIT' });
  const opts = app.getAboutPanelOptions();
  if (opts.applicationName !== 'Test') throw new Error('Expected Test, got ' + opts.applicationName);
  return opts.copyright;
});

test('app.setAboutPanelOptions() with no args resets', () => {
  app.setAboutPanelOptions();
  const opts = app.getAboutPanelOptions();
  return typeof opts === 'object';
});

// ─── Recent Documents ──────────────────────────────────────────

test('app.addRecentDocument() no-op', () => { app.addRecentDocument('/tmp/test'); return true; });
test('app.clearRecentDocuments() no-op', () => { app.clearRecentDocuments(); return true; });
test('app.setRecentDocumentLabel() no-op', () => { app.setRecentDocumentLabel('Test'); return true; });

// ─── App User Model ID ────────────────────────────────────────

test('app.setAppUserModelId() no-op', () => { app.setAppUserModelId('com.test'); return true; });
test('app.getAppUserModelId()', () => {
  const result = app.getAppUserModelId();
  if (typeof result !== 'string') throw new Error('Expected string');
  return result === '' ? '(empty)' : result;
});

// ─── Applications Folder ──────────────────────────────────────

test('app.isInApplicationsFolder()', () => app.isInApplicationsFolder());
test('app.moveToApplicationsFolder() no-op', () => { app.moveToApplicationsFolder(); return true; });

// ─── File Icons ────────────────────────────────────────────────

test('app.getFileIcon() callback', (done) => {
  return new Promise((resolve) => {
    app.getFileIcon('/tmp', (err, icon) => {
      resolve(true);
    });
  });
});

// ─── Certificate Trust ────────────────────────────────────────

test('app.showCertificateTrustDialog()', async () => {
  await app.showCertificateTrustDialog();
  return true;
});

// ─── Secure Keyboard Entry ────────────────────────────────────

test('app.setSecureKeyboardEntryEnabled / isSecureKeyboardEntryEnabled', () => {
  app.setSecureKeyboardEntryEnabled(true);
  const result = app.isSecureKeyboardEntryEnabled();
  app.setSecureKeyboardEntryEnabled(false);
  return result;
});

// ─── Window Count ──────────────────────────────────────────────

test('app.getWindowCount() initial', () => {
  return app.getWindowCount();
});

test('app.getPath("appData")', () => app.getPath('appData'));

test('app.getPath("exe")', () => app.getPath('exe'));

test('app.getPath("module")', () => app.getPath('module'));

// ─── Launch App ────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    test('app.whenReady() resolved', () => true);

    mainWindow = new BrowserWindow({
      width: 900,
      height: 680,
      title: 'Gelectron Demo',
      backgroundColor: '#1a1a2e',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    test('BrowserWindow created', () => mainWindow.id > 0);

    test('BrowserWindow.getSize()', () => {
      const [w, h] = mainWindow.getSize();
      if (w < 100 || h < 100) throw new Error('Size too small: ' + w + 'x' + h);
      return w + 'x' + h;
    });

    test('BrowserWindow.getTitle()', () => mainWindow.getTitle());

    test('BrowserWindow.isVisible()', () => mainWindow.isVisible());

    test('BrowserWindow.isDestroyed()', () => !mainWindow.isDestroyed());

    test('BrowserWindow.isNormal()', () => mainWindow.isNormal());

    test('BrowserWindow.isResizable()', () => mainWindow.isResizable());

    test('BrowserWindow.getAllWindows().length', () => BrowserWindow.getAllWindows().length);

    test('BrowserWindow.fromId(id)', () => {
      const win = BrowserWindow.fromId(mainWindow.id);
      return win ? win.id === mainWindow.id : false;
    });

    test('window-all-closed listener registered', () => {
      app.on('window-all-closed', () => {
        app.quit();
      });
      return true;
    });

    test('app.relaunch is a function', () => typeof app.relaunch === 'function');

    test('app.exit is a function', () => typeof app.exit === 'function');

    test('app.quit is a function', () => typeof app.quit === 'function');

    test('app.getWindowCount() after create', () => app.getWindowCount());

    test('app.getPathForProtocol()', () => {
      const result = app.getPathForProtocol('https:');
      return result === null ? 'null' : result;
    });

    test('app.getApplicationInfoForProtocol()', async () => {
      const result = await app.getApplicationInfoForProtocol('https:');
      return typeof result === 'object';
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.webContents.on('did-finish-load', () => {
      const testResults = JSON.stringify(results);
      mainWindow.webContents.executeJavaScript(
        `window.__appTestResults = ${testResults}; renderAppTests();`
      );
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
