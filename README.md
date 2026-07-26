# Gelectron

A Firefox-engine alternative to Electron, powered by [Servo](https://servo.org). Drop-in replacement for Electron apps — just run `gelectron .` instead of `electron .`.

## Why Gelectron?

Electron bundles Chromium, which means ~150-300MB per app with large memory overhead. Gelectron uses **Servo** (Mozilla's next-generation browser engine) instead, which shares Gecko's CSS engine (Stylo) and GPU compositor (WebRender) while being designed for embedding.

| Feature | Electron | Gelectron |
|---|---|---|
| Rendering Engine | Chromium | Servo (Gecko CSS/GPU) |
| Language | C++ / Node.js | Rust / Node.js |
| API Compatibility | Native | Drop-in replacement |
| Memory Usage | High | Lower |
| Binary Size | ~150MB+ | Smaller (Rust static linking) |
| Node.js Integration | Built-in | N-API addon |
| Auto Updater | Built-in | Custom implementation |

## Architecture

```
┌──────────────────────────────────────────────┐
│           Gelectron App                       │
│  (HTML/CSS/JS + package.json)                │
│  (Same code as Electron apps)               │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│         Gelectron Runtime                     │
│  ┌──────────────────────────────────────────┐ │
│  │  electron compat module (JavaScript)     │ │
│  │  app, BrowserWindow, Menu, Tray          │ │
│  │  ipcMain, ipcRenderer, contextBridge     │ │
│  │  dialog, shell, notification             │ │
│  └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────┐ │
│  │  gelectron-core (Rust N-API addon)       │ │
│  │  Servo rendering engine                  │ │
│  │  Window management (winit)               │ │
│  │  Native UI (muda, tray-icon, rfd)        │ │
│  └──────────────────────────────────────────┘ │
└──────────────────┬───────────────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
      Servo             Node.js APIs
   (Rendering)     (fs, path, os, etc.)
   • Stylo (CSS)       via N-API
   • WebRender (GPU)
```

## Supported Electron APIs

### Main Process

| Module | Status |
|---|---|
| `app` | Full lifecycle, paths, command line, dock (macOS) |
| `BrowserWindow` | Create, show/hide, resize, loadURL, loadFile, events |
| `ipcMain` | `handle()`, `on()`, `removeHandler()`, event emission |
| `Menu` | `buildFromTemplate()`, `popup()`, `setApplicationMenu()` |
| `MenuItem` | All types (normal, checkbox, separator, submenu, role) |
| `Tray` | Create, tooltip, context menu, click events |
| `dialog` | `showOpenDialog()`, `showSaveDialog()`, `showMessageBox()`, `showErrorBox()` |
| `shell` | `openExternal()`, `showItemInFolder()`, `openPath()` |
| `Notification` | Create, show, close, urgency levels |
| `nativeImage` | Create from path/buffer, resize, crop, PNG/JPEG export |
| `safeStorage` | Encrypt/decrypt via system keyring |
| `contextBridge` | `exposeInMainWorld()` for secure preload |
| `webContents` | `send()`, `executeJavaScript()`, `openDevTools()`, navigation |

### Renderer Process

| Module | Status |
|---|---|
| `ipcRenderer` | `invoke()`, `send()`, `on()`, `removeListener()` |

### Compatibility Shims

| Module | Status |
|---|---|
| `screen` | `getPrimaryDisplay()` (stub) |
| `clipboard` | `readText()`, `writeText()` (stub) |
| `systemPreferences` | Basic stubs |
| `powerMonitor` | Event stubs |
| `globalShortcut` | Register/unregister stubs |
| `session` | Cookies, protocol, permissions (stub) |
| `net` | `fetch()` proxy |

## Installation

### From Source (Development)

```bash
# Prerequisites
# - Rust 1.88+ (rustup.rs)
# - Node.js 18+
# - npm or pnpm

git clone https://github.com/mileswolfallen2/gelectron.git
cd gelectron
npm install

# Build the Rust native addon
cargo build --release -p gelectron-core

# Run
node cli/gelectron.js /path/to/electron-app
```

### As npm Package

```bash
npm install gelectron
npx gelectron .
```

## Usage

### Running an Electron App

```bash
# Instead of:
npx electron .

# Use:
npx gelectron .
```

Gelectron will:
1. Read your app's `package.json` to find the main script
2. Patch `require('electron')` to resolve to Gelectron's compatibility layer
3. Run the main process with full Electron API support
4. Render the app using Servo

### CLI Options

```bash
gelectron <path-to-app>       # Run an Electron app
gelectron <file.js>           # Run a main process script directly
gelectron --version           # Print version
gelectron --help              # Show help
```

### Environment Variables

| Variable | Description |
|---|---|
| `GELECTRON_DEV=1` | Enable development mode |
| `GELECTRON_LOG=1` | Enable verbose logging |
| `VITE_DEV_SERVER_URL=<url>` | Connect to a Vite dev server |

### In Your App's Code

```javascript
// main.js - No changes needed!
const { app, BrowserWindow, ipcMain } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.loadFile('index.html');

  ipcMain.handle('my-channel', (event, ...args) => {
    return { success: true, data: args };
  });
});
```

```javascript
// preload.js - No changes needed!
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  doSomething: () => ipcRenderer.invoke('my-channel', 'hello'),
});
```

## Project Structure

```
gelectron/
├── Cargo.toml                      # Rust workspace
├── package.json                    # npm package
├── cli/
│   └── gelectron.js               # CLI entry point
├── src/
│   └── electron/                   # JS Electron compat layer
│       ├── index.js                # Main exports
│       ├── app.js                  # app lifecycle
│       ├── browser-window.js       # BrowserWindow
│       ├── ipc-main.js            # ipcMain
│       ├── ipc-renderer.js        # ipcRenderer
│       ├── context-bridge.js      # contextBridge
│       ├── menu.js                # Menu + MenuItem
│       ├── tray.js                # Tray
│       ├── dialog.js              # File/message dialogs
│       ├── shell.js               # Shell operations
│       ├── notification.js        # Notifications
│       ├── native-image.js        # Image handling
│       ├── safe-storage.js        # Encryption
│       ├── web-contents.js        # webContents utilities
│       ├── preload-loader.js      # Preload injection
│       └── runtime.js             # Node.js fallback runtime
└── crates/
    └── gelectron-core/
        ├── Cargo.toml              # Rust dependencies
        └── src/
            ├── lib.rs              # N-API entry point
            ├── app.rs              # App lifecycle (native)
            ├── browser_window.rs   # Window management (native)
            ├── servo_host.rs       # Servo engine integration
            ├── event_loop.rs       # Event loop bridge
            ├── ipc.rs              # IPC bridge
            ├── protocol.rs         # Custom protocol handler
            ├── menu.rs            # Native menus (muda)
            ├── tray.rs            # System tray (tray-icon)
            ├── dialog.rs          # File dialogs (rfd)
            ├── shell.rs           # Shell operations
            ├── notification.rs    # Notifications (notify-rust)
            ├── native_image.rs    # Image processing (image)
            ├── safe_storage.rs    # Secure storage (keyring)
            ├── context_bridge.rs  # Context bridge (native)
            └── web_contents.rs    # WebContents (native)
```

## Building for Production

### macOS

```bash
cargo build --release -p gelectron-core
npm run package:mac
```

### Windows

```bash
cargo build --release -p gelectron-core --target x86_64-pc-windows-msvc
npm run package:win
```

### Linux

```bash
cargo build --release -p gelectron-core
npm run package:linux
```

## Testing with OmniEmu2.0

```bash
git clone https://github.com/mileswolfallen2/OmniEmu2.0.git
cd OmniEmu2.0
npm install

# Run with Gelectron instead of Electron
npx gelectron .
```

## Known Limitations

- Servo is still in active development (v0.3.0+); some web APIs may be missing
- `electron-updater` requires custom implementation (not yet included)
- Some Electron APIs are stubs (marked as TODO)
- Native menu integration is platform-dependent (muda crate)
- Auto-updater not yet implemented
- Single-window only in initial version

## Roadmap

- [ ] Full Servo integration (currently uses native module stubs)
- [ ] Multi-window support
- [ ] Custom protocol handlers (`gelectron://`)
- [ ] Auto-updater implementation
- [ ] DevTools integration
- [ ] Build/package tools for distribution
- [ ] App sandboxing
- [ ] Performance optimizations

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `cargo test -p gelectron-core` and `cargo clippy -p gelectron-core`
5. Submit a PR

## License

MIT - see [LICENSE](LICENSE)
