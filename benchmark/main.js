const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

const isGelectron = !!(process.versions.gelectron || process.env.GELECTRON_NATIVE);

function getMemoryMB() {
  const m = process.memoryUsage();
  return JSON.stringify({
    rss: +(m.rss / 1048576).toFixed(1),
    heapUsed: +(m.heapUsed / 1048576).toFixed(1),
    heapTotal: +(m.heapTotal / 1048576).toFixed(1),
    external: +(m.external / 1048576).toFixed(1),
    platform: os.platform(),
    arch: os.arch(),
    engine: isGelectron ? 'Gelectron' : 'Electron',
    node: process.versions.node,
    totalMem: +(os.totalmem() / 1048576).toFixed(0),
  });
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 680,
    height: 720,
    show: true,
    title: (isGelectron ? 'Gelectron' : 'Electron') + ' Benchmark',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  setInterval(() => {
    if (!win.isDestroyed()) {
      win.webContents.executeJavaScript(
        `window.__mainMem=${getMemoryMB()};window.__updateMem&&window.__updateMem()`
      );
    }
  }, 2000);
});

app.on('window-all-closed', () => app.quit());
