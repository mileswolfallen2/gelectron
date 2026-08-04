# Contributing to Gelectron

Thanks for your interest in Gelectron! This guide covers how the project is put
together and how to contribute changes that build, pass tests, and don't regress
the app you might be targeting (e.g. `vanilla-sh`, the reference consumer).

## What Gelectron is

Gelectron is a drop-in replacement for Electron that uses the OS-native web view
(WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux) instead of
bundling Chromium. It has two halves that talk to each other:

- **`gelectron-app`** — a standalone Rust binary built on **tao** (windowing) and
  **wry** (WebView). It owns windows, the native menu bar, dialogs, clipboard,
  and the dock/taskbar icon.
- **`src/electron/`** — a JavaScript compatibility layer that implements the
  Electron API surface (`app`, `BrowserWindow`, `Menu`, `ipcMain`, …). Your
  Electron app's `main.js` imports `electron`, which resolves to this layer.

The two halves communicate over **JSON-line IPC**. The Rust side spawns Node.js
as a child process (or runs the JS layer inside the WebView in `--no-node` mode)
and both sides exchange messages like `create-window`, `load-url`,
`ipc-message`, and `set-application-menu`.

Read `README.md` for the full architecture diagram and supported-API table.

## Repository layout

```
gelectron/
├── Cargo.toml                      # Rust workspace (patches wry → vendor/wry)
├── crates/
│   ├── gelectron-app/              # ★ The main native binary (tao + wry)
│   │   └── src/main.rs             #    event loop, IPC, menus, icons, dialogs
│   └── gelectron-core/             # Legacy N-API addon (not the primary path)
├── src/electron/                   # JS Electron compatibility layer
├── vendor/wry/                     # Vendored wry (patched via [patch.crates-io])
├── packager/bin/gelectron-packager.js  # Bundles apps into distributables
├── cli/gelectron.js                # Pure-Node.js fallback runner
├── demo/                           # Minimal reference app
├── benchmark/                      # Memory/perf comparison vs Electron
└── scripts/install.sh              # Installs binary + compat layer
```

Most day-to-day work happens in **`crates/gelectron-app/src/main.rs`** (native
behavior) and **`src/electron/`** (JS API behavior). `main.rs` is ~1900 lines;
it's the file where menu, icon, window, and IPC logic lives.

## Prerequisites

- **Rust 1.75+** — `rustup.rs`
- **Node.js 18+** and npm
- macOS builds also want Xcode command-line tools (`xcode-select --install`)

## First-time setup

```bash
git clone https://github.com/mileswolfallen2/gelectron.git
cd gelectron
npm install
```

## Development loop

The most common workflow is to build the binary, then run an app against it:

```bash
# Build the native binary
cargo build --release -p gelectron

# Run the bundled demo
cargo run --release -p gelectron -- demo/

# Run a real Electron app against your build
cargo run --release -p gelectron -- /path/to/your-app
```

If you're iterating on the JS compat layer only, `scripts/install.sh` installs
both the binary and `src/electron/` so `gelectron <app>` works from anywhere:

```bash
./scripts/install.sh
```

### Environment variables

| Variable | Use |
|---|---|
| `RUST_LOG=info` | Rust-side logging (`gelectron` crate) |
| `GELECTRON_LOG=1` | Verbose JS-side logging |
| `GELECTRON_DEV=1` | Development mode |
| `VITE_DEV_SERVER_URL=<url>` | Point the app at a Vite dev server |

## Testing

Run the Rust unit tests:

```bash
cargo test -p gelectron
```

The suite covers image/icon decoders (BMP-in-ICO, PNG-in-ICO, PNG round-trip).
Keep these green — they're fast and catch byte-layout regressions in icon
handling.

There is no end-to-end test harness yet. Manual verification looks like:

```bash
# 1. Build
cargo build --release -p gelectron

# 2. Package the reference app and launch it
#    (from the vanilla-sh checkout)
npm run build
open dist/VanillaChat.app

# 3. Sanity-check the pieces you touched, e.g.:
#    - Menu bar: Apple, AppName, File, Edit, View, Window, Help
#    - Edit menu: Undo/Redo/Cut/Copy/Paste/Select All with Cmd key equivalents
#    - Dock icon renders without distortion
#    - Cmd+C / Cmd+V work inside the webview
```

To verify menu behavior programmatically (macOS), you can query System Events:

```bash
osascript -e 'tell application "System Events" to tell process "<AppName>" \
  to get name of every menu bar item of menu bar 1'
```

## Rules of the road

These rules exist because each one corresponds to a bug that has actually
happened. Please respect them.

### 1. Native menus must stay alive after `init_for_nsapp()`

On macOS, AppKit stores **raw pointers** into the `muda` menu structures as
instance variables on the native `NSMenuItem`s. If you drop the `muda::Menu`
after `init_for_nsapp()`, clicking any menu item dereferences freed memory →
random, non-deterministic crashes.

- Keep the built menu in `AppState.app_menu` for the app's lifetime.
- The default menu (`install_default_app_menu`) must be stored too, not just the
  one from `SetApplicationMenu`.

### 2. Menu submenus come in two shapes

The compat layer serializes a submenu either as a bare array **or** as an object
with an `items` array (`{"items": [...]}`). Always normalize with
`submenu_items()` before iterating, and treat an item as a submenu when
`type == "submenu"` **or** a `submenu` field is present. The vanilla-sh menu
template relies on the second form, and the app's own menu builder relies on the
first.

### 3. Icons: normalize 16-bit PNGs

`logo.png`-style source icons are often 16-bit RGBA. Two code paths must handle
this:

- Rust: `decode_png_icon` must set
  `Transformations::EXPAND | STRIP_16` on the decoder so downstream code can
  assume 8-bit RGBA bytes. Treating a 16-bit buffer as 8-bit mangles the icon.
- Packager: `generateIcns` downconverts the source to 8-bit (via `sips` or PIL)
  before building the `.icns`, since `sips` preserves 16-bit at 1024px and macOS
  renders that poorly.

### 4. macOS APIs require the main thread

Menu construction, `setApplicationIconImage`, and window operations all need the
main/event-loop thread. Don't call them from background threads.

### 5. Don't add comments unless they earn their place

The codebase is deliberately comment-light. A comment should explain *why*
something is non-obvious (e.g. "AppKit stores raw pointers here") rather than
restating what the code does.

### 6. Keep the wry patch minimal

`wry` is vendored and patched via `[patch.crates-io]` in `Cargo.toml`. Only
change `vendor/wry/` when you genuinely need a WebView-level behavior change
(e.g. media permissions). Prefer fixing things in `gelectron-app` or the JS
layer.

## Code style

- **Rust:** follow `rustfmt` defaults. Run `cargo fmt` before committing.
- **JS:** CommonJS, 2-space indent, `'use strict'` in CLI scripts.
- Match the surrounding code's conventions — this project has no linter config,
  so consistency is on you.

## Packaging changes

If your change touches distribution, rebuild and package a real app to verify:

```bash
# From packager/ (or via npm link)
gelectron-packager --dir ./my-app --name MyApp

# macOS: verify the bundle's icon and signature
file dist/MyApp.app/Contents/Resources/AppIcon.icns
codesign --verify --deep --strict dist/MyApp.app
```

The packager: copies `node_modules` into `Resources/app/`, generates `AppIcon.icns`
from `icon.png`, writes `Info.plist` with the icon + mic/camera usage strings, and
re-signs the bundle with the entitlements. If any of that seems off, check
`packager/bin/gelectron-packager.js` and `vanilla-sh/scripts/build-desktop.sh`.

## Cross-platform notes

- **macOS** is the primary dev platform and the most battle-tested path.
- **Windows** builds target GNU (`x86_64-pc-windows-gnu`). MSVC cross-compiles
  from macOS are blocked by a missing `link.exe` — use the GNU toolchain.
- **Linux** needs WebKitGTK dev packages; cross-compiling from macOS is
  unconfigured.
- Platform-specific behavior should be `#[cfg(target_os = "...")]` in Rust and
  `process.platform` checks in JS (the compat layer already exposes
  `isMac`/`isWin` style helpers in places).

## Opening a PR

1. Fork and create a feature branch.
2. Make your changes, keeping the "Rules of the road" in mind.
3. Run `cargo fmt`, `cargo build --release -p gelectron`, and `cargo test -p gelectron`.
4. Verify against a real app (`cargo run --release -p gelectron -- /path/to/app`).
5. Open the PR with a short description of what changed and why, and note how you
   verified it.

## Getting help

- Open an issue at https://github.com/mileswolfallen2/gelectron/issues
- The `vanilla-sh` checkout (`/Users/milesallen/Documents/GitHub/vanilla-sh`)
  is the reference consumer — changes that regress it are treated as bugs.
