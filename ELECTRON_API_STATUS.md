# Gelectron — Electron API Compatibility Status

> Every Electron module tracked. Status: **full** / **partial** / **stub** / **missing**
>
> **full** = API surface complete, behavior matches Electron for common use cases
> **partial** = Core methods work, some methods are no-ops or return defaults
> **stub** = API surface exists but does nothing real
> **missing** = Not implemented at all

---

## Browser (Main Process) Modules

| # | Module | File | webview-bundle | index.js | Status | Notes |
|---|--------|------|----------------|----------|--------|-------|
| 1 | app | YES | YES | YES | **full** | All methods, properties, events, quit lifecycle, dock, badge, GPU, about panel, secure keyboard, window tracking |
| 2 | autoUpdater | YES | YES | YES | **stub** | API surface for electron-updater compat, no actual updates |
| 3 | BaseWindow | NO | NO | NO | **missing** | Parent class for BrowserWindow, not implemented |
| 4 | BrowserView | NO | NO | NO | **missing** | Deprecated in favor of WebContentsView |
| 5 | BrowserWindow | YES | YES | YES | **partial** | create/show/hide/focus/min/max/close/destroy/setTitle/setSize/loadURL/loadFile. Missing: DevTools, navigation, capturePage, print, printToPDF |
| 6 | clipboard | YES | inline | YES | **partial** | readText/writeText/readImage/writeImage/readHTML/writeHTML/readBookmark/writeBookmark/clear/has/readFindText, talks to Rust via bridge |
| 7 | contentTracing | NO | NO | NO | **missing** | Tracing/recording profiling data |
| 8 | crashReporter | NO | NO | NO | **missing** | Crash upload to server |
| 9 | desktopCapturer | NO | NO | NO | **missing** | Screen/window capture source enumeration |
| 10 | dialog | YES | YES | YES | **partial** | showOpenDialog/showSaveDialog/showMessageBox/showErrorBox. Native dialogs wired via rfd (Rust) |
| 11 | globalShortcut | NO | inline | YES | **stub** | register() always returns true, does nothing |
| 12 | ipcMain | YES | YES | YES | **full** | handle/handleOnce/on/once/removeHandler, full EventEmitter |
| 13 | ImageView | NO | NO | NO | **missing** | New in Electron 33+, image display view |
| 14 | inAppPurchase | NO | NO | NO | **missing** | macOS App Store in-app purchases |
| 15 | Menu | YES | YES | YES | **partial** | buildFromTemplate/append/insert/getMenuItemById, native setApplicationMenu via muda, _serialize. Missing: click events from native menu, role-based predefined items |
| 16 | MenuItem | YES | YES | YES | **partial** | All properties present (id/label/type/role/accelerator/enabled/visible/checked/submenu/click). Missing: role auto-behavior |
| 17 | MessageChannelMain | NO | NO | NO | **missing** | MessagePort-based IPC between main/renderer |
| 18 | nativeImage | YES | YES | YES | **partial** | createFromPath/Buffer/DataURL, toDataURL, getSize. Missing: resize/crop pixel transform, proper toPNG/toJPEG |
| 19 | nativeTheme | YES | inline | YES | **partial** | NativeTheme class: shouldUseDarkColors (getter + method), themeSource (getter/setter), shouldSystemUseDarkColors, queries Rust for system theme. systemPreferences.isDarkMode() linked |
| 20 | net | NO | inline | YES | **partial** | fetch delegates to globalThis.fetch. Missing: net.request(), ClientRequest API |
| 21 | netLog | NO | NO | NO | **missing** | Network log capture |
| 22 | Notification | YES | YES | YES | **partial** | API surface complete, show via browser Notification API if available. No native OS integration |
| 23 | powerMonitor | NO | inline | YES | **stub** | getSystemIdleState returns 'active', no real monitoring |
| 24 | powerSaveBlocker | NO | NO | NO | **missing** | Prevent system sleep |
| 25 | protocol | NO | inline (session) | NO | **missing** | Custom protocol registration (standalone module). Session stubs exist |
| 26 | pushNotifications | NO | NO | NO | **missing** | macOS push notification registration |
| 27 | safeStorage | YES | YES | YES | **stub** | Base64 encoding, not real encryption |
| 28 | screen | YES | inline | YES | **partial** | Screen class: getPrimaryDisplay/getAllDisplays/getDisplayMatching/getCursorScreenPoint/getMenuBarHeight, fetches real monitor info from Rust via bridge |
| 29 | ServiceWorkerMain | NO | NO | NO | **missing** | Service worker management in main process |
| 30 | session | NO | inline | YES | **stub** | defaultSession + fromPartition stubs, all no-ops |
| 31 | sharedTexture | NO | NO | NO | **missing** | Shared texture between processes |
| 32 | ShareMenu | NO | NO | NO | **missing** | macOS share sheet |
| 33 | shell | YES | YES | YES | **partial** | openExternal/openPath (open crate), showItemInFolder (platform commands), moveItemToTrash (trash/fallback), beep. Shortcut stubs |
| 34 | systemPreferences | NO | inline | YES | **stub** | isDarkMode() linked to nativeTheme. Most other methods are no-ops |
| 35 | TouchBar | NO | NO | NO | **missing** | macOS Touch Bar. Sub-classes: TouchBarButton, TouchBarColorPicker, TouchBarGroup, TouchBarLabel, TouchBarOtherItemsProxy, TouchBarPopover, TouchBarScrubber, TouchBarSegmentedControl, TouchBarSlider, TouchBarSpacer |
| 36 | Tray | YES | YES | YES | **stub** | API surface present, no native system tray |
| 37 | utilityProcess | NO | NO | NO | **missing** | Fork utility child processes |
| 38 | View | NO | NO | NO | **missing** | Base View class for embedding |
| 39 | webContents | YES | YES | YES | **partial** | loadURL/loadFile/send/executeJavaScript/reload, session stub. Missing: navigation history, DevTools CDP, zoom, print, capturePage |
| 40 | WebContentsView | NO | NO | NO | **missing** | View-based content embedding |
| 41 | webFrameMain | NO | NO | NO | **missing** | Main-process webFrame for frame control |

## Renderer Process Modules

| # | Module | File | webview-bundle | index.js | Status | Notes |
|---|--------|------|----------------|----------|--------|-------|
| 42 | clipboard (renderer) | NO | inline | YES | **partial** | Same as main process: readText/writeText/readImage/writeImage/clear/has via bridge |
| 43 | contextBridge | YES | YES | YES | **partial** | exposeInMainWorld with deep freeze. No real world isolation |
| 44 | crashReporter (renderer) | NO | NO | NO | **missing** | Renderer-side crash reporter |
| 45 | ipcRenderer | YES | NO (inline) | NO (via require hook) | **partial** | invoke/send/sendSync/on/once/removeListener. Bridge not always wired |
| 46 | sharedTexture (renderer) | NO | NO | NO | **missing** | Renderer-side shared texture |
| 47 | webFrame | NO | NO | NO | **missing** | setZoomFactor/setZoomLevel/insertCSS/executeJavaScript in frame context |
| 48 | webUtils | NO | NO | NO | **missing** | Renderer-side utilities (process |

## Common Modules (Both Processes)

| # | Module | File | webview-bundle | index.js | Status | Notes |
|---|--------|------|----------------|----------|--------|-------|
| 49 | nativeImage | YES | YES | YES | **partial** | createFromPath/Buffer/DataURL, toDataURL, getSize. Missing: resize/crop transform |
| 50 | shell | YES | YES | YES | **partial** | openExternal/openPath/showItemInFolder/moveItemToTrash/beep via bridge (open crate + platform commands) |

## Deprecated / Internal

| # | Module | Status | Notes |
|---|--------|--------|-------|
| 51 | BrowserView | **missing** | Deprecated, replaced by WebContentsView |
| 52 | remote | **missing** | Removed in Electron 14+ |
| 53 | webviewTag | **missing** | Deprecated, replaced by BrowserView/WebContentsView |
| 54 | process (polyfill) | **partial** | WebView mode polyfill: pid/argv/env/platform/versions/cwd/nextTick. Missing: memoryUsage/cpuUsage/uptime/kill |
| 55 | contextIsolation | **stub** | webPreferences.contextIsolation stored but no actual V8 isolate separation |

## Additional APIs from Electron Docs

| # | API | Status | Notes |
|---|-----|--------|-------|
| 56 | navigation-history | **missing** | Navigation history API |
| 57 | parent-port | **missing** | UtilityProcess communication port |
| 58 | web-request | **missing** | Intercept/modify HTTP requests |
| 59 | web-socket | **missing** | WebSocket server |
| 60 | window-open | **missing** | window.open() handling |
| 61 | local-ai-handler | **missing** | Local AI model handler (new) |

---

## Summary

| Status | Count | Modules |
|--------|-------|---------|
| **full** | 2 | app, ipcMain |
| **partial** | 15 | BrowserWindow, Menu, MenuItem, dialog, shell, Notification, nativeImage, contextBridge, webContents, ipcRenderer, net, process, clipboard, screen, nativeTheme |
| **stub** | 7 | Tray, safeStorage, autoUpdater, session, systemPreferences, powerMonitor, globalShortcut |
| **missing** | 36 | BaseWindow, BrowserView, contentTracing, crashReporter, desktopCapturer, ImageView, inAppPurchase, MessageChannelMain, netLog, powerSaveBlocker, protocol, pushNotifications, ServiceWorkerMain, sharedTexture, ShareMenu, TouchBar (+10 sub-classes), utilityProcess, View, WebContentsView, webFrameMain, webFrame, webUtils, crashReporter (renderer), sharedTexture (renderer), remote, webviewTag, navigation-history, parent-port, web-request, web-socket, window-open, local-ai-handler |
| **Total** | **60** | BrowserView counted once (listed in both Main and Deprecated tables) |

## Rust Bridge (main.rs ToRust commands)

These commands are implemented on the Rust side and can be triggered from the WebView:

| Command | Status | Notes |
|---------|--------|-------|
| create-window | YES | Creates a new tao+wry window |
| destroy-window | YES | Removes window from state |
| load-url | YES | Navigates webview to URL |
| load-file | YES | Rebuilds WebView with file:// URL |
| set-title | YES | Updates window title |
| set-size | YES | Updates window inner size |
| show / hide / focus | YES | Window visibility |
| minimize / maximize | YES | Window state |
| close | YES | Closes window |
| eval-js | YES | Execute JavaScript in webview |
| ipc-message | YES | Forward IPC to renderer |
| quit | YES | Exit event loop |
| relaunch | YES | Spawn new process, exit |
| set-application-menu | YES | Set native menu via muda (macOS: init_for_nsapp) |
| popup-menu | YES | Show context menu via muda |
| close-popup-menu | YES | Close context menu |
| clipboard-read-text | YES | Read clipboard text via arboard |
| clipboard-write-text | YES | Write text to clipboard via arboard |
| clipboard-read-image | YES | Read clipboard image (base64 PNG) via arboard |
| clipboard-write-image | YES | Write image to clipboard via arboard |
| screen-get-displays | YES | Query monitor info via tao |
| native-theme-query | YES | Detect dark mode via platform API |
| dialog-open | YES | Show native open file dialog via rfd |
| dialog-save | YES | Show native save file dialog via rfd |
| dialog-message | YES | Show native message box via rfd |
| dialog-error | YES | Show native error box via rfd |
| shell-open-external | YES | Open URL in default browser via open crate |
| shell-open-path | YES | Open file in default app via open crate |
| shell-show-in-folder | YES | Reveal file in Finder/Explorer via platform command |
| shell-move-to-trash | YES | Move file to trash via platform API |
| shell-beep | YES | Play system beep |
