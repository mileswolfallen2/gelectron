const { app, BrowserWindow } = require('electron');
const path = require('path');

const isGelectron = !!(process.versions.gelectron || process.env.GELECTRON_NATIVE);

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
});

app.on('window-all-closed', () => app.quit());
