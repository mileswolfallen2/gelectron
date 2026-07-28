# Gelectron — Electron API Compatibility Status

## FULL (2)
| Module        | Notes |
|---------------|-------|
| app           | All methods/properties/events, quit lifecycle, dock, badge, GPU, about panel, secure keyboard entry, window tracking |
| ipcMain       | handle/handleOnce/on/once/removeHandler, full EventEmitter |

## PARTIAL (14)
| Module              | What works                                | What's missing                                    |
|---------------------|-------------------------------------------|---------------------------------------------------|
| Menu / MenuItem     | buildFromTemplate/append/insert/getMenuItemById, native setApplicationMenu via muda, popup via bridge, _serialize, submenu nesting | Click events from native menu, role-based predefined items |
| BrowserWindow       | create/show/hide/focus/min/max/close/destroy/setTitle/setSize/loadURL/loadFile | DevTools actually opening, navigation (back/forward), capturePage, print, printToPDF, setPosition, setBounds |
| WebContents         | loadURL/loadFile/send/executeJavaScript/reload, session stub | Real session, navigation history, DevTools CDP, zoom actually applied |
| ipcRenderer         | invoke/send/sendSync/on/once/removeListener | Bridge not always wired, sendSync returns undefined |
| dialog              | showOpenDialog/showSaveDialog/showMessageBox/showErrorBox | Native dialogs not wired (Rust has no dialog commands) |
| shell               | openExternal/openPath (Node mode)         | moveItemToTrash deletes permanently, shortcut stubs |
| Notification        | show via browser Notification API          | No native OS notification integration |
| nativeImage         | createFromPath/Buffer/DataURL, toDataURL, getSize | resize/crop don't transform pixels, toPNG/toJPEG bugs |
| contextBridge       | exposeInMainWorld with deep freeze          | No real world isolation, no proxy serialization |
| webContents (utils) | getAllWebContents/getFocusedWebContents    | Minimal                                           |
| net                 | fetch delegates to globalThis.fetch        | No net.request(), no ClientRequest API             |
| process (polyfill)  | pid/argv/env/platform/versions/cwd/nextTick | memoryUsage/cpuUsage/uptime/kill missing          |
| contextIsolation    | webPreferences.contextIsolation stored      | No actual V8 isolate separation                   |

## STUB (12)
| Module           | Implementation                                              |
|------------------|-------------------------------------------------------------|
| Tray             | API surface present, no native system tray                  |
| safeStorage      | base64 encoding, not real encryption                        |
| autoUpdater      | API surface for electron-updater compat, no actual updates  |
| session          | defaultSession + fromPartition stubs, all no-ops            |
| clipboard        | readText/writeText no-ops                                   |
| screen           | Hardcoded 1920x1080 primary display                         |
| systemPreferences| Hardcoded dark mode / accent color                          |
| powerMonitor     | getSystemIdleState returns 'active', no real monitoring     |
| globalShortcut   | register always returns true, does nothing                  |
| updater          | Covered by autoUpdater stub                                 |

## MISSING (9)
| Module           | Notes                                    |
|------------------|------------------------------------------|
| nativeTheme      | No theme detection                       |
| netLog           | No network log capture                   |
| protocol         | No custom protocol registration          |
| crashReporter    | No crash reporting                       |
| desktopCapturer  | No screen/window capture sources         |
| pushNotifications| No push notification handling            |
| utilityProcess   | No utility/forked process                |
| ShareMenu        | No share menu (macOS)                    |
| TouchBar         | No Touch Bar (macOS)                     |

## Missing from existing modules
- BrowserWindow: webContents.debugger, setOpacity/getOpacity, setProgressBar actual display
- app: render-process-gone, child-process-gone events (require real process monitoring)
- Menu: native menu click events not wired back to JS, no role-based predefined items (copy/paste/undo etc.)
