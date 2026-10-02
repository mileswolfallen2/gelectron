<div align="center">
  <img src="logo.png" alt="Gelectron" width="180">
  <h1>Gelectron</h1>
  <p>A drop-in replacement for Electron using native web views (WKWebView / WebView2 / WebKitGTK) instead of Chromium</p>
</div>

Gelectron is an Electron alternative focused on using platform-native web views through [`wry`](https://github.com/tauri-apps/wry) and `tao`, plus a Node-compatible API shim.

## Project status

- Early-stage project under active development
- Compatibility is partial and evolving
- Some Electron APIs are implemented, others are stubs or no-ops

If you are evaluating migration from Electron, test your app against Gelectron directly before committing to it.

## Install

The npm package exposes:

- `gelectron`
- `gelectron-core`
- `gelectron-packager`

```bash
npm install -g gelectron-core
```

## Quick start

Run an app directory (uses `package.json` -> `main`):

```bash
gelectron /path/to/electron-app
gelectron .
```

Run a main-process script directly:

```bash
gelectron main.js
```

Show CLI version/help:

```bash
gelectron --version
gelectron --help
```

If the native runtime binary is unavailable, the CLI falls back to the Node.js compatibility runtime (`src/electron/runtime.js`), which is API-only and does not provide a native desktop window.

## Build from source

### Prerequisites

- Rust (stable)
- Node.js 18+
- npm

### Build and run

```bash
git clone https://github.com/mileswolfallen2/gelectron.git
cd gelectron
npm install

# Build native runtime binary
cargo build --release -p gelectron

# Run demo app
cargo run --release -p gelectron -- demo/
```

## Architecture (high level)

Gelectron is composed of:

1. **Rust runtime (`crates/gelectron-app`)**
   - Native app process
   - Window/event loop via `tao`
   - Native web view via `wry`

2. **JS compatibility layer (`src/electron/`)**
   - `require('electron')`-style API surface
   - Main-process and renderer shims
   - IPC bridge to the native runtime

3. **CLI launcher (`cli/gelectron.js`)**
   - Resolves app entry point
   - Locates and launches the native runtime when present
   - Falls back to JS runtime when native binary is not found

## API compatibility

Gelectron exposes Electron-like modules from `src/electron/index.js`, including:

- `app`
- `BrowserWindow`
- `ipcMain`
- `Menu` / `MenuItem`
- `Tray`
- `dialog`
- `shell`
- `Notification`
- `nativeImage`
- `safeStorage`
- `contextBridge`
- `webContents`
- `autoUpdater`
- `clipboard`
- `screen`
- `nativeTheme`
- `session` (stubbed behavior)
- plus additional stubs such as `systemPreferences`, `powerMonitor`, and `globalShortcut`

Because behavior is still maturing, treat compatibility as best-effort rather than complete parity.

## Packaging

`gelectron-packager` is included as a CLI tool:

```bash
gelectron-packager --dir ./demo --name MyApp
```

You can also specify target platform/arch:

```bash
gelectron-packager --dir ./my-app --name MyApp --platform darwin --arch arm64
gelectron-packager --dir ./my-app --name MyApp --platform win32 --arch x64
gelectron-packager --dir ./my-app --name MyApp --platform linux --arch x64
```

## Repository layout

```text
gelectron/
├── cli/                      # CLI entrypoint
├── src/electron/             # Electron compatibility layer
├── crates/gelectron-app/     # Rust native runtime binary
├── crates/gelectron-core/    # Rust native core (N-API related)
├── packager/                 # gelectron-packager
├── demo/                     # Example app
└── npm/                      # Platform npm package assets
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).
