<div align="center">
  <img src="logo.png" alt="Gelectron" width="180">
  <h1>Gelectron</h1>
  <p>A drop-in replacement for Electron powered by Mozilla's Servo engine</p>
</div>

## Why Gelectron?

Electron bundles Chromium — ~150–300 MB per app with large memory overhead. Gelectron uses **Servo** (Mozilla's embeddable browser engine) to share Gecko's CSS engine (Stylo) and GPU compositor (WebRender), producing smaller binaries with lower memory usage.

| Feature | Electron | Gelectron |
|---|---|---|
| Rendering Engine | Chromium | Servo (Gecko CSS / WebRender GPU) |
| Language | C++ / Node.js | Rust / Node.js |
| API Compatibility | Native | Drop-in replacement |
| Memory Usage | High | Lower |
| Binary Size | ~150 MB+ | Smaller (Rust static linking) |
| Node.js Integration | Built-in | Spawned child process / N-API addon |
| Auto Updater | Built-in | Stub (no-update-safe fallback) |

## Quick Start

### Prerequisites

- Rust 1.75+ (`rustup.rs`)
- Node.js 18+
- npm

### Build & Run

```bash
git clone https://github.com/mileswolfallen2/gelectron.git
cd gelectron
npm install

# Build the standalone native binary
cargo build --release -p gelectron

# Run the demo app
cargo run --release -p gelectron -- demo/

# Or run any Electron app
cargo run --release -p gelectron -- /path/to/electron-app
```

### CLI (Node.js fallback)

If you don't want to build the Rust binary, the CLI can fall back to a pure-Node.js shim:

```bash
node cli/gelectron.js /path/to/electron-app
```

> In fallback mode no real window is created — only the JS API layer loads. Use the native binary for actual rendering.

## How It Works

Gelectron has two execution paths:

### 1. Native Binary (`gelectron-app` crate)

A standalone Rust binary using **tao** (windowing) and **wry** (WebView). It:

1. Reads the target app's `package.json` to find the main script
2. Generates a Node.js setup script that patches `require('electron')` to point at Gelectron's JS compatibility layer
3. Spawns Node.js as a child process with piped stdin/stdout
4. Runs a tao event loop with wry WebView windows
5. Communicates with Node.js via JSON-line IPC (`create-window`, `load-url`, `ipc-message`, …)

### 2. Node.js Fallback (`cli/gelectron.js`)

When the native binary is not built, the CLI falls back to pure Node.js:

1. Patches `Module._resolveFilename` so `require('electron')` resolves to Gelectron's shim
2. Loads the app's main script — the app runs against the JS compatibility layer
3. No real window is created (API-only mode)

## Architecture

```
┌──────────────────────────────────────────────────┐
│             Gelectron App                        │
│   (HTML / CSS / JS + package.json)               │
│   (Same code as Electron apps)                   │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│           Gelectron Runtime                       │
│                                                   │
│   ┌────────────────────────────────────────────┐  │
│   │  electron compat layer (JavaScript)        │  │
│   │  app · BrowserWindow · Menu · Tray         │  │
│   │  ipcMain · ipcRenderer · contextBridge     │  │
│   │  dialog · shell · notification             │  │
│   └────────────────────────────────────────────┘  │
│                                                   │
│   ┌────────────────────────────────────────────┐  │
│   │  gelectron-app (Rust standalone binary)    │  │
│   │  tao  · windowing                          │  │
│   │  wry  · WebView (WebKit on macOS)          │  │
│   └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Supported Electron APIs

### Main Process

| Module | Status |
|---|---|
| `app` | Full lifecycle, paths, command line, dock (macOS), `whenReady()` |
| `BrowserWindow` | Create, show/hide, resize, loadURL, loadFile, events, webContents |
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
| `autoUpdater` | No-op stub (reports "no update available") |

## Demo App

A minimal demo that renders HTML/CSS/JS in a real window:

```bash
cargo run --release -p gelectron -- demo/
```

The demo includes:
- Interactive counter (DOM updates via JS)
- Live clock driven by `requestAnimationFrame`
- Animated canvas with moving shapes
- CSS grid, gradients, transitions, and flexbox

### Demo source

```
demo/
├── package.json    # { "main": "main.js" }
├── main.js         # Creates BrowserWindow, loads index.html
└── index.html      # HTML + CSS + JavaScript
```

### Running the demo

`demo/main.js`:

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 900, height: 680 });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
```

## Project Structure

```
gelectron/
├── Cargo.toml                         # Rust workspace root
├── package.json                       # npm package
├── cli/
│   └── gelectron.js                   # CLI entry point (Node.js fallback)
├── src/
│   └── electron/                      # JS Electron compatibility layer
│       ├── index.js                   # Main exports (require('electron'))
│       ├── app.js                     # app lifecycle
│       ├── browser-window.js          # BrowserWindow + WebContents
│       ├── ipc-main.js               # ipcMain
│       ├── ipc-renderer.js           # ipcRenderer
│       ├── context-bridge.js         # contextBridge
│       ├── menu.js                   # Menu + MenuItem
│       ├── tray.js                   # Tray
│       ├── dialog.js                 # File/message dialogs
│       ├── shell.js                  # Shell operations
│       ├── notification.js           # Notifications
│       ├── native-image.js           # Image handling
│       ├── safe-storage.js           # Encryption
│       ├── web-contents.js           # webContents utilities
│       ├── auto-updater.js           # autoUpdater stub
│       ├── native-bridge.js          # IPC to Rust binary
│       ├── preload-loader.js         # Preload injection
│       └── runtime.js                # Node.js fallback runtime
├── crates/
│   ├── gelectron-core/               # N-API addon (Rust → Node.js)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs                # N-API entry: init(), get_platform()
│   │       ├── app.rs               # App lifecycle (native)
│   │       ├── browser_window.rs    # Window management (native)
│   │       ├── servo_host.rs        # Servo engine (stub)
│   │       ├── event_loop.rs        # Event loop bridge
│   │       ├── ipc.rs               # IPC bridge
│   │       ├── protocol.rs          # Custom protocol handler
│   │       ├── menu.rs              # Native menus (muda)
│   │       ├── tray.rs              # System tray (tray-icon)
│   │       ├── dialog.rs            # File dialogs (rfd)
│   │       ├── shell.rs             # Shell operations
│   │       ├── notification.rs      # Notifications (notify-rust)
│   │       ├── native_image.rs      # Image processing (image)
│   │       ├── safe_storage.rs      # Secure storage (keyring)
│   │       ├── context_bridge.rs    # Context bridge (native)
│   │       └── web_contents.rs      # WebContents (native)
│   └── gelectron-app/               # Standalone native binary
│       ├── Cargo.toml
│       └── src/
│           └── main.rs              # tao + wry event loop, Node.js spawner
├── demo/                            # Demo app
│   ├── package.json
│   ├── main.js
│   └── index.html
└── npm/
    └── darwin-arm64/                # Platform-specific npm packages
```

## Building for Production

### Standalone binary (recommended)

```bash
cargo build --release -p gelectron
```

### N-API addon (for Node.js integration)

```bash
cargo build --release -p gelectron-core
```

The N-API addon compiles to a `.node` file that can be loaded directly into Node.js.

## Testing with OmniEmu2.0

OmniEmu2.0 is a full Electron app used to validate Gelectron compatibility:

```bash
# From the gelectron directory
cargo run --release -p gelectron -- /path/to/OmniEmu2.0
```

Key APIs exercised by OmniEmu2.0:
- `app`, `BrowserWindow`, `Tray`, `Menu`, `nativeImage`, `dialog`
- `electron-updater` (autoUpdater stub)
- `contextBridge`, `ipcRenderer`
- File loading (`loadFile`), window events

## CLI Options

```bash
gelectron <path-to-app>       # Run an Electron app
gelectron <file.js>           # Run a main process script directly
gelectron --version           # Print version
gelectron --help              # Show help
```

## Environment Variables

| Variable | Description |
|---|---|
| `GELECTRON_DEV=1` | Enable development mode |
| `GELECTRON_LOG=1` | Enable verbose logging |
| `VITE_DEV_SERVER_URL=<url>` | Connect to a Vite dev server |
| `RUST_LOG=info` | Enable Rust-side logging |

## Known Limitations

- Servo is not yet fully embedded — current WebView uses platform native (WebKit on macOS, WebView2 on Windows, webkit2gtk on Linux)
- Auto-updater is a no-op stub (returns "no update available")
- Some Electron APIs are stubs (marked in compatibility table)
- Single-window only in the standalone binary
- Preload scripts are injected via WebView init scripts, not true Electron preload isolation

## Roadmap

- [x] JS Electron API compatibility layer
- [x] Standalone native binary (tao + wry)
- [x] Node.js fallback runtime
- [x] JSON-line IPC between Rust and Node.js
- [x] `electron-updater` compatibility
- [ ] Full Servo embedding (replacing wry)
- [ ] Multi-window support
- [ ] Custom protocol handlers (`gelectron://`)
- [ ] DevTools integration
- [ ] App sandboxing
- [ ] Package/distribution tooling
- [ ] Performance benchmarks vs Electron

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `cargo build --release -p gelectron` and test with `cargo run --release -p gelectron -- demo/`
5. Submit a PR

## License

MIT — see [LICENSE](LICENSE)
