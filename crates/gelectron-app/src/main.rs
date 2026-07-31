#![windows_subsystem = "windows"]

use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::rc::Rc;
use std::sync::mpsc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::sync::Arc;
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::{Fullscreen, WindowBuilder, WindowId};
use wry::{WebView, WebViewBuilder};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ToRust {
    #[serde(rename = "create-window")]
    CreateWindow { id: u32, options: WindowOpts },
    #[serde(rename = "load-url")]
    LoadUrl { id: u32, url: String },
    #[serde(rename = "load-file")]
    LoadFile { id: u32, path: String },
    #[serde(rename = "destroy-window")]
    DestroyWindow { id: u32 },
    #[serde(rename = "set-title")]
    SetTitle { id: u32, title: String },
    #[serde(rename = "set-size")]
    SetSize { id: u32, width: u32, height: u32 },
    #[serde(rename = "set-app-icon")]
    SetAppIcon { icon: String },
    #[serde(rename = "show")]
    Show { id: u32 },
    #[serde(rename = "hide")]
    Hide { id: u32 },
    #[serde(rename = "focus")]
    Focus { id: u32 },
    #[serde(rename = "minimize")]
    Minimize { id: u32 },
    #[serde(rename = "maximize")]
    Maximize { id: u32 },
    #[serde(rename = "close")]
    Close { id: u32 },
    #[serde(rename = "ipc-message")]
    IpcMessage {
        id: u32,
        channel: String,
        data: serde_json::Value,
    },
    #[serde(rename = "eval-js")]
    EvalJs { id: u32, script: String },
    #[serde(rename = "quit")]
    Quit,
    #[serde(rename = "relaunch")]
    Relaunch {
        #[serde(default)]
        exec_path: Option<String>,
        #[serde(default)]
        args: Option<Vec<String>>,
    },
    #[serde(rename = "set-application-menu")]
    SetApplicationMenu {
        menu: serde_json::Value,
    },
    #[serde(rename = "popup-menu")]
    PopupMenu {
        menu: serde_json::Value,
        #[serde(default)]
        x: Option<f64>,
        #[serde(default)]
        y: Option<f64>,
    },
    #[serde(rename = "close-popup-menu")]
    ClosePopupMenu,
    #[serde(rename = "clipboard-read-text")]
    ClipboardReadText { request_id: String },
    #[serde(rename = "clipboard-write-text")]
    ClipboardWriteText { text: String },
    #[serde(rename = "clipboard-read-image")]
    ClipboardReadImage { request_id: String },
    #[serde(rename = "clipboard-write-image")]
    ClipboardWriteImage { data: String },
    #[serde(rename = "screen-get-displays")]
    ScreenGetDisplays { request_id: String },
    #[serde(rename = "native-theme-query")]
    NativeThemeQuery { request_id: String },
    #[serde(rename = "dialog-open")]
    DialogOpen { request_id: String, options: serde_json::Value },
    #[serde(rename = "dialog-save")]
    DialogSave { request_id: String, options: serde_json::Value },
    #[serde(rename = "dialog-message")]
    DialogMessage { request_id: String, options: serde_json::Value },
    #[serde(rename = "dialog-error")]
    DialogError { title: String, content: String },
    #[serde(rename = "shell-open-external")]
    ShellOpenExternal { url: String },
    #[serde(rename = "shell-open-path")]
    ShellOpenPath { path: String },
    #[serde(rename = "shell-show-in-folder")]
    ShellShowInFolder { path: String },
    #[serde(rename = "shell-move-to-trash")]
    ShellMoveToTrash { path: String, request_id: Option<String> },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum ToNode {
    #[serde(rename = "window-closed")]
    WindowClosed { id: u32 },
    #[serde(rename = "window-focus")]
    WindowFocus { id: u32 },
    #[serde(rename = "ipc-message")]
    IpcMessage {
        id: u32,
        channel: String,
        data: serde_json::Value,
    },
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "response")]
    Response {
        request_id: String,
        result: serde_json::Value,
        #[serde(default)]
        error: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
struct WindowOpts {
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    show: Option<bool>,
    #[serde(default)]
    resizable: Option<bool>,
    #[serde(default)]
    always_on_top: Option<bool>,
    #[serde(default)]
    fullscreen: Option<bool>,
    #[serde(default)]
    icon: Option<String>,
}

struct WindowPair {
    #[allow(dead_code)]
    window: tao::window::Window,
    webview: WebView,
}

struct AppState {
    windows: HashMap<u32, WindowPair>,
    window_wids: HashMap<WindowId, u32>,
    node_stdin: Option<std::process::ChildStdin>,
    node_exited: Arc<AtomicBool>,
    bundle_js: Option<String>,
    response_tx: Option<mpsc::Sender<(String, serde_json::Value)>>,
    app_icon: Option<DecodedIcon>,
}

#[derive(Clone)]
struct DecodedIcon {
    raw: Vec<u8>,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

impl AppState {
    fn new(node_exited: Arc<AtomicBool>) -> Self {
        Self {
            windows: HashMap::new(),
            window_wids: HashMap::new(),
            node_stdin: None,
            node_exited,
            bundle_js: None,
            response_tx: None,
            app_icon: None,
        }
    }

    fn send_to_node(&mut self, msg: &ToNode) {
        let json = serde_json::to_string(msg).unwrap();
        if let Some(ref mut stdin) = self.node_stdin {
            if writeln!(stdin, "{}", json).is_err() || stdin.flush().is_err() {
                // Node.js process has likely exited; mark it so the event loop can shut down
                self.node_exited.store(true, Ordering::SeqCst);
            }
        }
    }
}

fn preload_script() -> String {
    r#"
(function() {
    if (window.__gelectron_loaded) return;
    window.__gelectron_loaded = true;
    window.gelectron = {
        send: function(channel, ...args) {
            var payload = JSON.stringify({type:'ipc-send', channel: channel, args: args});
            if (window.ipc && window.ipc.postMessage) {
                window.ipc.postMessage(payload);
            } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
                window.webkit.messageHandlers.ipc.postMessage(payload);
            }
        },
        receive: function(channel, callback) {
            window.addEventListener('message', function(e) {
                if (e.source === window && typeof e.data === 'string') {
                    try {
                        var msg = JSON.parse(e.data);
                        if (msg.__from_node && msg.channel === channel) {
                            callback(msg.data);
                        }
                    } catch(err) {}
                }
            });
        }
    };
})();
"#
    .to_string()
}

fn main() {
    env_logger::init();

    let gelectron_dir = std::env::current_exe()
        .ok()
        .and_then(|p| std::fs::canonicalize(p).ok())
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let args: Vec<String> = std::env::args().collect();
    let no_node = args.iter().any(|a| a == "--no-node");

    // If no args, try to auto-detect app path for packaged apps
    let raw_app_path = if args.iter().skip(1).find(|a| !a.starts_with('-')).is_some() {
        args.iter().skip(1).find(|a| !a.starts_with('-')).unwrap().clone()
    } else {
        // Packaged macOS .app bundle: app is at ../Resources/app relative to binary
        let resources_app = gelectron_dir.join("../Resources/app");
        let sibling_app = gelectron_dir.join("app");
        if resources_app.exists() {
            resources_app.display().to_string()
        } else if sibling_app.exists() {
            sibling_app.display().to_string()
        } else {
            eprintln!("Usage: gelectron <path-to-app>");
            std::process::exit(1);
        }
    };

    let app_path = std::path::PathBuf::from(&raw_app_path);
    if !app_path.exists() {
        eprintln!("Error: path not found: {}", app_path.display());
        std::process::exit(1);
    }

    // Canonicalize so relative paths (e.g. "demo/") become absolute.
    let app_path = std::fs::canonicalize(&app_path).unwrap_or(app_path);

    let main_script = if app_path.is_dir() {
        let pkg_path = app_path.join("package.json");
        if pkg_path.exists() {
            let pkg: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&pkg_path).unwrap_or_default())
                    .unwrap_or_default();
            let main = pkg
                .get("main")
                .and_then(|v| v.as_str())
                .unwrap_or("index.js");
            app_path.join(main)
        } else {
            app_path.join("index.js")
        }
    } else {
        app_path.clone()
    };

    if !main_script.exists() {
        eprintln!("Error: main script not found: {}", main_script.display());
        std::process::exit(1);
    }

    // From target/release/ or target/debug/, go up to project root
    let project_root = if gelectron_dir.ends_with("release") || gelectron_dir.ends_with("debug") {
        gelectron_dir.parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| gelectron_dir.clone())
    } else {
        gelectron_dir.clone()
    };

    let compat_dir = if project_root.join("src/electron/index.js").exists() {
        project_root.join("src/electron")
    } else if project_root.join("crates/gelectron-app/src/main.rs").exists() {
        project_root.join("src/electron")
    } else if gelectron_dir.join("compat/index.js").exists() {
        // Packaged app: compat layer is alongside the binary
        gelectron_dir.join("compat")
    } else {
        // npm installed: try to find in node_modules
        project_root.join("node_modules/gelectron/src/electron")
    };

    log::info!("App: {}", app_path.display());
    log::info!("Script: {}", main_script.display());
    log::info!("Compat: {}", compat_dir.display());

    if no_node || which_node().is_none() {
        log::info!("Mode: WebView-only (no Node.js child process)");
        run_webview_only(app_path, main_script, compat_dir);
    } else {
        log::info!("Mode: Node.js child process");
        run_with_node(app_path, main_script, compat_dir);
    }
}

fn run_with_node(app_path: PathBuf, main_script: PathBuf, compat_dir: PathBuf) {
    let node_path = which_node().unwrap_or_else(|| {
        eprintln!("Error: node not found in PATH");
        std::process::exit(1);
    });

    let setup_script = format!(
        r#"
process.env.GELECTRON_NATIVE = '1';
process.env.GELECTRON_MAIN_SCRIPT = '{}';
process.env.GELECTRON_APP_PATH = '{}';

const Module = require('module');
const path = require('path');
const compatPath = '{}';

Object.keys(Module._cache).forEach(function(key) {{
    var normalized = key.replace(/\\/g, '/');
    if (normalized.endsWith('/electron') || normalized.endsWith('/electron/index.js') || normalized.endsWith('/electron/index.cjs')) {{
        delete Module._cache[key];
    }}
}});

const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {{
    if (request === 'electron' || request === 'electron/main' || request === 'electron/common') return path.join(compatPath, 'index.js');
    if (request === 'electron/renderer') return path.join(compatPath, 'ipc-renderer.js');
    return origResolve.call(this, request, parent, isMain, options);
}};

if (typeof Module._resolveRequest === 'function') {{
    var origResolveRequest = Module._resolveRequest;
    Module._resolveRequest = function(request, parent, isMain, options) {{
        if (request === 'electron' || request === 'electron/main' || request === 'electron/common') return path.join(compatPath, 'index.js');
        if (request === 'electron/renderer') return path.join(compatPath, 'ipc-renderer.js');
        return origResolveRequest.call(this, request, parent, isMain, options);
    }};
}}

require(path.join(compatPath, 'index.js'));
setInterval(function() {{ if (global.gc) global.gc(); }}, 5000);

require('{}');
"#,
        main_script.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
        app_path.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
        compat_dir.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
        main_script.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
    );

    let mut child: Child = Command::new(&node_path)
        .arg("--max-old-space-size=32")
        .arg("--optimize-for-size")
        .arg("--v8-pool-size=1")
        .arg("-e")
        .arg(&setup_script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("Failed to spawn Node.js");

    let child_stdin = child.stdin.take().unwrap();
    let child_stdout = child.stdout.take().unwrap();

    let (tx, rx) = mpsc::channel::<ToRust>();
    let node_exited = Arc::new(AtomicBool::new(false));
    let node_exited_clone = node_exited.clone();

    thread::spawn(move || {
        let reader = BufReader::new(child_stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let trimmed = line.trim().to_string();
                    if trimmed.is_empty() || !trimmed.starts_with('{') { continue; }
                    if let Ok(msg) = serde_json::from_str::<ToRust>(&trimmed) {
                        if tx.send(msg).is_err() { break; }
                    }
                }
                Err(_) => break,
            }
        }
        node_exited_clone.store(true, Ordering::SeqCst);
    });

    let event_loop = EventLoopBuilder::new().build();
    let (ipc_tx, ipc_rx) = mpsc::channel::<ToNode>();
    let (response_tx, response_rx) = mpsc::channel::<(String, serde_json::Value)>();
    let mut state = AppState::new(node_exited.clone());
    state.node_stdin = Some(child_stdin);
    state.response_tx = Some(response_tx);
    detect_and_apply_icon(&app_path, &mut state);
    let state = Rc::new(RefCell::new(state));
    state.borrow_mut().send_to_node(&ToNode::Ready);

    event_loop.run(move |event, event_loop_target, control_flow| {
        *control_flow = ControlFlow::Poll;
        let mut st = state.borrow_mut();

        if st.node_exited.load(Ordering::SeqCst) {
            st.windows.clear();
            st.window_wids.clear();
            *control_flow = ControlFlow::Exit;
            return;
        }

        match event {
            Event::NewEvents(StartCause::Poll) => {
                // Drain async responses from background threads (dialogs, clipboard, etc.)
                while let Ok((request_id, result)) = response_rx.try_recv() {
                    st.send_to_node(&ToNode::Response {
                        request_id,
                        result,
                        error: None,
                    });
                }
                while let Ok(msg) = ipc_rx.try_recv() { st.send_to_node(&msg); }
                while let Ok(msg) = rx.try_recv() {
                    handle_to_rust(msg, &mut st, event_loop_target, &ipc_tx, None, control_flow);
                }
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, window_id, .. } => {
                if let Some(&id) = st.window_wids.get(&window_id) {
                    st.send_to_node(&ToNode::WindowClosed { id });
                    st.windows.remove(&id);
                    st.window_wids.remove(&window_id);
                    log::info!("Window {} closed", id);
                    if st.windows.is_empty() { *control_flow = ControlFlow::Exit; }
                }
            }
            Event::WindowEvent { event: WindowEvent::Focused(true), window_id, .. } => {
                if let Some(&id) = st.window_wids.get(&window_id) {
                    st.send_to_node(&ToNode::WindowFocus { id });
                }
            }
            _ => {}
        }
    });
}

fn run_webview_only(app_path: PathBuf, main_script: PathBuf, compat_dir: PathBuf) {
    // Load the self-contained WebView bundle (no Node.js needed)
    let bundle_path = compat_dir.join("webview-bundle.js");
    if !bundle_path.exists() {
        eprintln!("Error: webview-bundle.js not found at {}", bundle_path.display());
        std::process::exit(1);
    }
    let bundle_js = std::fs::read_to_string(&bundle_path)
        .expect("Failed to read webview-bundle.js");

    // Read the user's main script
    let main_js = std::fs::read_to_string(&main_script)
        .unwrap_or_else(|e| {
            eprintln!("Error reading main script: {}", e);
            std::process::exit(1);
        });

    let main_js_escaped = main_js.replace('\\', "\\\\").replace('`', "\\`").replace("${", "\\${");

    let init_script = format!(
        r#"
{}
window.__dirname = '{}';
window.__filename = '{}';
window.process.env.GELECTRON_APP_PATH = '{}';
window.process.env.GELECTRON_MAIN_SCRIPT = '{}';
window.process.env.GELECTRON_NATIVE = '1';
window.process.argv = ['gelectron', '{}'];
window.__gelectron_run_main(`{}`);
"#,
        bundle_js,
        app_path.display(),
        main_script.display(),
        app_path.display(),
        main_script.display(),
        main_script.display(),
        main_js_escaped,
    );

    let event_loop = EventLoopBuilder::new().build();
    let (ipc_tx, ipc_rx) = mpsc::channel::<ToNode>();
    let (response_tx, response_rx) = mpsc::channel::<(String, serde_json::Value)>();
    // Channel for ToRust messages coming from the WebView IPC handler
    let (to_rust_tx, to_rust_rx) = mpsc::channel::<ToRust>();
    let to_rust_tx = Arc::new(to_rust_tx);
    let node_exited = Arc::new(AtomicBool::new(false));
    let mut app_state = AppState::new(node_exited.clone());
    app_state.bundle_js = Some(bundle_js.clone());
    app_state.response_tx = Some(response_tx);
    detect_and_apply_icon(&app_path, &mut app_state);
    let state = Rc::new(RefCell::new(app_state));

    event_loop.run(move |event, event_loop_target, control_flow| {
        *control_flow = ControlFlow::Poll;
        let mut st = state.borrow_mut();

        match event {
            Event::NewEvents(StartCause::Poll) => {
                // Drain async responses from background threads (dialogs, clipboard, etc.)
                while let Ok((request_id, result)) = response_rx.try_recv() {
                    if let Some(pair) = st.windows.get(&1u32) {
                        let js = format!(
                            "window.__gelectron_response('{}', {});",
                            request_id,
                            serde_json::to_string(&result).unwrap_or_default()
                        );
                        let _ = pair.webview.evaluate_script(&js);
                    }
                }

                // Drain IPC messages from webview → forward back into the same webview
                while let Ok(msg) = ipc_rx.try_recv() {
                    if let Some(pair) = st.windows.get(&1u32) {
                        let js_msg = match &msg {
                            ToNode::IpcMessage { channel, data, .. } => {
                                serde_json::json!({"__from_node":true,"channel":channel,"data":data})
                            }
                            ToNode::WindowClosed { id } => {
                                serde_json::json!({"__from_node":true,"type":"window-closed","id":id})
                            }
                            ToNode::WindowFocus { id } => {
                                serde_json::json!({"__from_node":true,"type":"window-focus","id":id})
                            }
                            ToNode::Ready => {
                                serde_json::json!({"__from_node":true,"type":"ready"})
                            }
                            ToNode::Response { request_id, result, error } => {
                                serde_json::json!({"__from_node":true,"type":"response","request_id":request_id,"result":result,"error":error})
                            }
                        };
                        let _ = pair.webview.evaluate_script(
                            &format!("window.postMessage({},'*');", serde_json::to_string(&js_msg).unwrap())
                        );
                    }
                }

                // Handle ToRust messages from WebView compat layer
                while let Ok(msg) = to_rust_rx.try_recv() {
                    handle_to_rust(msg, &mut st, event_loop_target, &ipc_tx, Some(&to_rust_tx), control_flow);
                }

                // Auto-create initial window if none exist
                if st.windows.is_empty() {
                    drop(st);
                    create_initial_webview_window(
                        event_loop_target,
                        &state,
                        &to_rust_tx,
                        &init_script,
                        control_flow,
                    );
                }
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, window_id, .. } => {
                if let Some(&id) = st.window_wids.get(&window_id) {
                    for pair in st.windows.values() {
                        let js = serde_json::to_string(&serde_json::json!({
                            "__from_node": true, "type": "window-closed", "id": id,
                        })).unwrap();
                        let _ = pair.webview.evaluate_script(&format!("window.postMessage({},'*');", js));
                    }
                    st.windows.remove(&id);
                    st.window_wids.remove(&window_id);
                    log::info!("Window {} closed", id);
                    if st.windows.is_empty() { *control_flow = ControlFlow::Exit; }
                }
            }
            Event::WindowEvent { event: WindowEvent::Focused(true), window_id, .. } => {
                if let Some(&id) = st.window_wids.get(&window_id) {
                    for pair in st.windows.values() {
                        let js = serde_json::to_string(&serde_json::json!({
                            "__from_node": true, "type": "window-focus", "id": id,
                        })).unwrap();
                        let _ = pair.webview.evaluate_script(&format!("window.postMessage({},'*');", js));
                    }
                }
            }
            _ => {}
        }
    });
}

fn create_initial_webview_window(
    event_loop_target: &tao::event_loop::EventLoopWindowTarget<()>,
    state: &Rc<RefCell<AppState>>,
    to_rust_tx: &Arc<mpsc::Sender<ToRust>>,
    init_script: &str,
    _control_flow: &mut ControlFlow,
) {
    let window_id = 1u32;
    let wb = WindowBuilder::new()
        .with_title("Gelectron")
        .with_inner_size(tao::dpi::LogicalSize::new(800.0, 600.0))
        .with_visible(false);

    if let Ok(window) = wb.build(event_loop_target) {
        let to_rust_tx_clone = to_rust_tx.clone();

        match WebViewBuilder::new()
            .with_url("about:blank")
            .with_initialization_script(&init_script)
            .with_devtools(false)
            .with_ipc_handler(move |req| {
                let body = req.body().to_string();
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                    if let Ok(cmd) = serde_json::from_value::<ToRust>(val.clone()) {
                        let _ = to_rust_tx_clone.send(cmd);
                    } else if let Some(msg_type) = val.get("type").and_then(|v| v.as_str()) {
                        if msg_type == "ipc-send" {
                            let channel = val.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                            let args = val.get("args").cloned().unwrap_or(serde_json::Value::Null);
                            let _ = to_rust_tx_clone.send(ToRust::IpcMessage { id: window_id, channel: channel.to_string(), data: args });
                        } else if msg_type == "quit" {
                            let _ = to_rust_tx_clone.send(ToRust::Quit);
                        }
                    }
                }
            })
            .build(&window)
        {
            Ok(webview) => {
                let wid = window.id();
                let mut st = state.borrow_mut();
                st.windows.insert(window_id, WindowPair { window, webview });
                st.window_wids.insert(wid, window_id);
                log::info!("Initial WebView window created (running compat layer)");
            }
            Err(e) => log::error!("WebView error: {}", e),
        }
    }
}

fn build_muda_menu(
    menu_json: &serde_json::Value,
) -> Option<muda::Menu> {
    let items = menu_json.get("items");

    let menu = muda::Menu::new();
    if let Some(items_val) = items {
        build_menu_items_inner(&menu, items_val);
    }
    Some(menu)
}

fn build_menu_items_inner(parent: &muda::Menu, items: &serde_json::Value) {
    let items_arr = match items.as_array() {
        Some(a) => a,
        None => return,
    };

    for item in items_arr {
        let label = item.get("label").and_then(|v| v.as_str()).unwrap_or("");
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("normal");
        let enabled = item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);

        if item_type == "separator" {
            let _ = parent.append(&muda::PredefinedMenuItem::separator());
            continue;
        }

        if item_type == "submenu" {
            let submenu = muda::Submenu::new(label, true);
            if let Some(sub_items) = item.get("submenu") {
                if let Some(sub_arr) = sub_items.as_array() {
                    for sub_item in sub_arr {
                        let sub_label = sub_item.get("label").and_then(|v| v.as_str()).unwrap_or("");
                        let sub_type = sub_item.get("type").and_then(|v| v.as_str()).unwrap_or("normal");
                        let sub_enabled = sub_item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                        if sub_type == "separator" {
                            let _ = submenu.append(&muda::PredefinedMenuItem::separator());
                        } else {
                            let mi = muda::MenuItem::new(sub_label, true, None);
                            if !sub_enabled { mi.set_enabled(false); }
                            let _ = submenu.append(&mi);
                        }
                    }
                }
            }
            let _ = parent.append(&submenu);
            continue;
        }

        let menu_item = muda::MenuItem::new(label, true, None);
        if !enabled {
            menu_item.set_enabled(false);
        }
        let _ = parent.append(&menu_item);
    }
}

fn detect_dark_mode() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Check NSAppearance via objc (works without extra crates since tao re-exports cocoa)
        std::env::var("APPLE_INTERFACE_STYLE")
            .map(|v| v == "Dark")
            .unwrap_or(false)
    }
    #[cfg(target_os = "windows")]
    {
        // Check registry for AppsUseLightTheme (0 = dark)
        std::process::Command::new("reg")
            .args(["query", r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize", "/v", "AppsUseLightTheme"])
            .output()
            .map(|o| {
                let s = String::from_utf8_lossy(&o.stdout);
                s.contains("0x0")
            })
            .unwrap_or(false)
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var("GTK_THEME")
            .map(|v| v.to_lowercase().contains("dark"))
            .unwrap_or(false)
    }
}

fn decode_png_icon(png_bytes: &[u8]) -> Option<DecodedIcon> {
    use std::io::Cursor;
    let cursor = Cursor::new(png_bytes);
    let decoder = png::Decoder::new(cursor);
    let mut reader = decoder.read_info().ok()?;
    let info = reader.info().clone();
    let width = info.width;
    let height = info.height;
    if width == 0 || height == 0 || width * height > 4096 * 4096 {
        return None;
    }
    let mut buf = vec![0; reader.output_buffer_size().unwrap_or(0)];
    let info = reader.next_frame(&mut buf).ok()?;
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..(width as usize * height as usize * 4)].to_vec(),
        png::ColorType::Rgb => {
            let mut out = Vec::with_capacity(width as usize * height as usize * 4);
            for px in buf[..(width as usize * height as usize * 3)].chunks_exact(3) {
                out.extend_from_slice(&[px[0], px[1], px[2], 255]);
            }
            out
        }
        png::ColorType::Grayscale => {
            let mut out = Vec::with_capacity(width as usize * height as usize * 4);
            for &g in buf.iter().take(width as usize * height as usize) {
                out.extend_from_slice(&[g, g, g, 255]);
            }
            out
        }
        png::ColorType::GrayscaleAlpha => {
            let mut out = Vec::with_capacity(width as usize * height as usize * 4);
            for px in buf[..(width as usize * height as usize * 2)].chunks_exact(2) {
                out.extend_from_slice(&[px[0], px[0], px[0], px[1]]);
            }
            out
        }
        _ => return None,
    };
    Some(DecodedIcon {
        raw: png_bytes.to_vec(),
        rgba,
        width,
        height,
    })
}

fn decode_ico_bmp(data: &[u8], raw: Vec<u8>) -> Option<DecodedIcon> {
    if data.len() < 40 {
        return None;
    }
    let width = i32::from_le_bytes([data[4], data[5], data[6], data[7]]);
    let height = i32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let bit_count = u16::from_le_bytes([data[14], data[15]]);
    let compression = u32::from_le_bytes([data[16], data[17], data[18], data[19]]);
    if width <= 0 || height == 0 || compression != 0 || (bit_count != 32 && bit_count != 24) {
        return None;
    }
    let mut height = height.unsigned_abs();
    if bit_count == 24 && height >= 2 && height % 2 == 0 {
        height /= 2;
    }
    let width = width as usize;
    let height = height as usize;
    if width == 0 || height == 0 || width * height > 4096 * 4096 {
        return None;
    }
    let bpp = bit_count as usize / 8;
    let stride = (width * bpp + 3) & !3;
    let px_start = 40usize;
    let mut rgba = vec![0u8; width * height * 4];
    for y in 0..height {
        let src_row = px_start + (height - 1 - y) * stride;
        if src_row + width * bpp > data.len() {
            return None;
        }
        for x in 0..width {
            let si = src_row + x * bpp;
            let di = (y * width + x) * 4;
            rgba[di] = data[si + 2];
            rgba[di + 1] = data[si + 1];
            rgba[di + 2] = data[si];
            rgba[di + 3] = if bit_count == 32 { data[si + 3] } else { 255 };
        }
    }
    Some(DecodedIcon {
        raw,
        rgba,
        width: width as u32,
        height: height as u32,
    })
}

fn decode_ico_icon(bytes: &[u8]) -> Option<DecodedIcon> {
    if bytes.len() < 6 {
        return None;
    }
    let count = u16::from_le_bytes([bytes[2], bytes[3]]) as usize;
    if count == 0 || 6 + 16 * count > bytes.len() {
        return None;
    }
    let mut best: Option<(u64, usize, usize)> = None;
    for i in 0..count {
        let e = 6 + 16 * i;
        let w = if bytes[e] == 0 { 256 } else { bytes[e] as usize };
        let h = if bytes[e + 1] == 0 { 256 } else { bytes[e + 1] as usize };
        let size = u32::from_le_bytes([bytes[e + 8], bytes[e + 9], bytes[e + 10], bytes[e + 11]]) as usize;
        let offset =
            u32::from_le_bytes([bytes[e + 12], bytes[e + 13], bytes[e + 14], bytes[e + 15]]) as usize;
        let area = (w * h) as u64;
        if best.map_or(true, |(a, _, _)| area > a) {
            best = Some((area, size, offset));
        }
    }
    let (_, size, offset) = best?;
    if offset + size > bytes.len() {
        return None;
    }
    let data = &bytes[offset..offset + size];
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return decode_png_icon(data).map(|mut ic| {
            ic.raw = bytes.to_vec();
            ic
        });
    }
    decode_ico_bmp(data, bytes.to_vec())
}

fn decode_icon_bytes(bytes: &[u8]) -> Option<DecodedIcon> {
    if let Some(icon) = decode_png_icon(bytes) {
        return Some(icon);
    }
    if let Some(icon) = decode_ico_icon(bytes) {
        return Some(icon);
    }
    #[cfg(target_os = "macos")]
    if bytes.starts_with(b"icns") {
        return Some(DecodedIcon {
            raw: bytes.to_vec(),
            rgba: Vec::new(),
            width: 0,
            height: 0,
        });
    }
    None
}

fn decode_base64_icon(base64_str: &str) -> Option<DecodedIcon> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_str.trim())
        .ok()?;
    decode_icon_bytes(&bytes)
}

fn find_app_icon_file(app_path: &std::path::Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![];
    for name in [
        "icon.png",
        "app.png",
        "icon.icns",
        "icon.ico",
        "app.ico",
        "assets/icon.png",
        "assets/app.png",
        "build/icon.png",
        "build/icon.icns",
        "build/icon.ico",
        "resources/icon.png",
        "resources/icon.icns",
        "resources/icon.ico",
        "public/icon.png",
        "public/icons/icon.png",
        "static/icon.png",
    ] {
        candidates.push(app_path.join(name));
    }
    if let Ok(pkg) = std::fs::read_to_string(app_path.join("package.json")) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&pkg) {
            if let Some(s) = value.get("icon").and_then(|v| v.as_str()) {
                candidates.push(app_path.join(s));
            }
            if let Some(build) = value.get("build").and_then(|v| v.get("icon")) {
                if let Some(s) = build.as_str() {
                    candidates.push(app_path.join(s));
                }
            }
        }
    }
    candidates
        .into_iter()
        .find(|p| p.exists() && p.is_file())
}

fn apply_dock_icon(icon: &DecodedIcon) {
    #[cfg(target_os = "macos")]
    {
        use cocoa::appkit::{NSApplication, NSImage};
        use cocoa::base::{id, nil};
        use cocoa::foundation::NSData;
        let img_bytes = if !icon.rgba.is_empty() {
            rgba_to_png(&icon.rgba, icon.width, icon.height).unwrap_or_else(|| icon.raw.clone())
        } else {
            icon.raw.clone()
        };
        unsafe {
            let data = NSData::dataWithBytes_length_(
                nil,
                img_bytes.as_ptr() as *const std::ffi::c_void,
                img_bytes.len() as u64,
            );
            let image: id = NSImage::initWithData_(NSImage::alloc(nil), data);
            if image != nil {
                let app = NSApplication::sharedApplication(nil);
                let _: () = app.setApplicationIconImage_(image);
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = icon;
    }
}

fn rgba_to_png(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    use std::io::Cursor;
    let mut out = Cursor::new(Vec::new());
    let mut encoder = png::Encoder::new(&mut out, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba).ok()?;
    drop(writer);
    Some(out.into_inner())
}

fn apply_window_icon(window: &tao::window::Window, icon: &DecodedIcon) {
    #[cfg(target_os = "macos")]
    {
        let _ = window;
        let _ = icon;
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Ok(tao_icon) = tao::window::Icon::from_rgba(icon.rgba.clone(), icon.width, icon.height) {
            window.set_window_icon(Some(tao_icon));
        }
    }
}

fn detect_and_apply_icon(app_path: &std::path::Path, st: &mut AppState) {
    if st.app_icon.is_some() {
        return;
    }
    let Some(icon_path) = find_app_icon_file(app_path) else {
        return;
    };
    let is_icns = icon_path.extension().map(|e| e == "icns").unwrap_or(false);
    if is_icns {
        #[cfg(target_os = "macos")]
        {
            apply_dock_icon_from_path(&icon_path);
            log::info!("Loaded app icon from {}", icon_path.display());
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = icon_path;
        }
        return;
    }
    if let Ok(bytes) = std::fs::read(&icon_path) {
        if let Some(icon) = decode_icon_bytes(&bytes) {
            st.app_icon = Some(icon.clone());
            apply_dock_icon(&icon);
            log::info!("Loaded app icon from {}", icon_path.display());
        }
    }
}

#[cfg(target_os = "macos")]
fn apply_dock_icon_from_path(path: &std::path::Path) {
    use cocoa::appkit::{NSApplication, NSImage};
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    unsafe {
        let ns_path = NSString::alloc(nil).init_str(&path.display().to_string());
        let image: id = NSImage::initWithContentsOfFile_(NSImage::alloc(nil), ns_path);
        if image != nil {
            let app = NSApplication::sharedApplication(nil);
            let _: () = app.setApplicationIconImage_(image);
        }
    }
}

fn handle_to_rust(
    msg: ToRust,
    st: &mut AppState,
    event_loop_target: &tao::event_loop::EventLoopWindowTarget<()>,
    ipc_tx: &mpsc::Sender<ToNode>,
    to_rust_tx: Option<&Arc<mpsc::Sender<ToRust>>>,
    control_flow: &mut ControlFlow,
) {
    match msg {
        ToRust::CreateWindow { id, options } => {
            let mut wb = WindowBuilder::new()
                .with_title(options.title.clone().unwrap_or_else(|| "Gelectron".into()))
                .with_inner_size(tao::dpi::LogicalSize::new(
                    options.width.unwrap_or(800) as f64,
                    options.height.unwrap_or(600) as f64,
                ));
            if let Some(r) = options.resizable { wb = wb.with_resizable(r); }
            if let Some(a) = options.always_on_top { wb = wb.with_always_on_top(a); }
            if let Some(true) = options.fullscreen {
                wb = wb.with_fullscreen(Some(Fullscreen::Borderless(None)));
            }
            wb = wb.with_visible(options.show.unwrap_or(true));

            match wb.build(event_loop_target) {
                Ok(window) => {
                    let url = options.url.unwrap_or_else(|| "about:blank".into());
                    log::info!("Creating window {} - '{}'", id, url);
                    let ipc_tx_clone = ipc_tx.clone();
                    let to_rust_tx_clone = to_rust_tx.cloned();
                    let wid_for_ipc = id;
                    let init = st.bundle_js.clone().unwrap_or_else(|| preload_script());
                    match WebViewBuilder::new()
                        .with_url(&url)
                        .with_initialization_script(&init)
                        .with_devtools(false)
                        .with_ipc_handler(move |req| {
                            let body = req.body().to_string();
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                                // Try parsing as a ToRust command (load-file, load-url, etc.)
                                if let Some(ref tx) = to_rust_tx_clone {
                                    if let Ok(cmd) = serde_json::from_value::<ToRust>(val.clone()) {
                                        let _ = tx.send(cmd);
                                        return;
                                    }
                                }
                                // Fall back to ipc-send handling
                                let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                if msg_type == "ipc-send" {
                                    let channel = val.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                                    let args = val.get("args").cloned().unwrap_or(serde_json::Value::Null);
                                    let _ = ipc_tx_clone.send(ToNode::IpcMessage { id: wid_for_ipc, channel: channel.to_string(), data: args });
                                } else if msg_type == "quit" {
                                    if let Some(ref tx) = to_rust_tx_clone {
                                        let _ = tx.send(ToRust::Quit);
                                    }
                                }
                            }
                        })
                        .build(&window)
                    {
                        Ok(webview) => {
                            let wid = window.id();
                            if let Some(icon) = options
                                .icon
                                .as_deref()
                                .and_then(decode_base64_icon)
                            {
                                st.app_icon = Some(icon.clone());
                                apply_dock_icon(&icon);
                                apply_window_icon(&window, &icon);
                            } else if let Some(icon) = st.app_icon.clone() {
                                apply_window_icon(&window, &icon);
                            }
                            st.windows.insert(id, WindowPair { window, webview });
                            st.window_wids.insert(wid, id);
                            log::info!("Window {} ready", id);
                        }
                        Err(e) => log::error!("WebView error: {}", e),
                    }
                }
                Err(e) => log::error!("Window error: {}", e),
            }
        }
        ToRust::LoadUrl { id, url } => {
            log::info!("Loading url in window {}: {}", id, url);
            if let Some(pair) = st.windows.get(&id) {
                let _ = pair.webview.evaluate_script(&format!(
                    "window.location.replace({});",
                    serde_json::to_string(&url).unwrap()
                ));
            }
        }
        ToRust::LoadFile { id, path } => {
            let url = url::Url::from_file_path(std::fs::canonicalize(&path).unwrap_or_default())
                .map(|u| u.to_string())
                .unwrap_or_else(|_| "about:blank".into());
            log::info!("Loading file in window {}: {}", id, url);
            let init = st.bundle_js.clone().unwrap_or_else(|| preload_script());
            if let Some(pair) = st.windows.get_mut(&id) {
                let window = &pair.window;
                let ipc_tx_clone = ipc_tx.clone();
                let to_rust_tx_clone = to_rust_tx.cloned();
                let wid_for_ipc = id;
                match WebViewBuilder::new()
                    .with_url(&url)
                    .with_initialization_script(&init)
                    .with_devtools(false)
                    .with_ipc_handler(move |req| {
                        let body = req.body().to_string();
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(ref tx) = to_rust_tx_clone {
                                if let Ok(cmd) = serde_json::from_value::<ToRust>(val.clone()) {
                                    let _ = tx.send(cmd);
                                    return;
                                }
                            }
                            let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            if msg_type == "ipc-send" {
                                let channel = val.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                                let args = val.get("args").cloned().unwrap_or(serde_json::Value::Null);
                                let _ = ipc_tx_clone.send(ToNode::IpcMessage { id: wid_for_ipc, channel: channel.to_string(), data: args });
                            } else if msg_type == "quit" {
                                if let Some(ref tx) = to_rust_tx_clone {
                                    let _ = tx.send(ToRust::Quit);
                                }
                            }
                        }
                    })
                    .build(window)
                {
                    Ok(webview) => {
                        pair.webview = webview;
                        log::info!("WebView rebuilt for window {}", id);
                    }
                    Err(e) => log::error!("WebView rebuild error: {}", e),
                }
            }
        }
        ToRust::DestroyWindow { id } => {
            st.windows.remove(&id);
            st.window_wids.retain(|_, v| *v != id);
            if st.windows.is_empty() { *control_flow = ControlFlow::Exit; }
        }
        ToRust::Close { id } => {
            st.windows.remove(&id);
            st.window_wids.retain(|_, v| *v != id);
            if st.windows.is_empty() { *control_flow = ControlFlow::Exit; }
        }
        ToRust::IpcMessage { id, channel, data } => {
            if let Some(pair) = st.windows.get(&id) {
                let msg = serde_json::json!({"__from_node":true,"channel":channel,"data":data});
                let js = format!("window.postMessage({},'*');", serde_json::to_string(&msg).unwrap());
                let _ = pair.webview.evaluate_script(&js);
            }
        }
        ToRust::EvalJs { id, script } => {
            if let Some(pair) = st.windows.get(&id) {
                let _ = pair.webview.evaluate_script(&script);
            }
        }
        ToRust::Quit => {
            st.windows.clear();
            *control_flow = ControlFlow::Exit;
        }
        ToRust::Relaunch { exec_path, args } => {
            let exe = exec_path.unwrap_or_else(|| std::env::current_exe()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "gelectron".to_string()));
            let mut cmd = Command::new(&exe);
            if let Some(a) = args { cmd.args(&a); }
            let _ = cmd.spawn();
            st.windows.clear();
            *control_flow = ControlFlow::Exit;
        }
        ToRust::SetApplicationMenu { menu } => {
            log::info!("Setting application menu");
            if let Some(muda_menu) = build_muda_menu(&menu) {
                #[cfg(target_os = "macos")]
                {
                    muda_menu.init_for_nsapp();
                }
                log::info!("Application menu set");
            }
        }
        ToRust::PopupMenu { menu, x: _x, y: _y } => {
            log::info!("Popup menu requested");
            if let Some(muda_menu) = build_muda_menu(&menu) {
                #[cfg(target_os = "macos")]
                {
                    muda_menu.init_for_nsapp();
                }
            }
        }
        ToRust::ClosePopupMenu => {
            log::info!("Close popup menu requested");
        }
        ToRust::ClipboardReadText { request_id } => {
            let text = arboard::Clipboard::new()
                .and_then(|mut c| c.get_text().map(|s| s.to_string()))
                .unwrap_or_default();
            if let Some(ref tx) = st.response_tx {
                let _ = tx.send((request_id, serde_json::json!(text)));
            }
        }
        ToRust::ClipboardWriteText { text } => {
            if let Ok(mut c) = arboard::Clipboard::new() {
                let _ = c.set_text(&text);
            }
        }
        ToRust::ClipboardReadImage { request_id } => {
            let data_b64 = arboard::Clipboard::new()
                .and_then(|mut c| c.get_image())
                .ok()
                .and_then(|img| {
                    let w = img.width;
                    let h = img.height;
                    let bytes = &img.bytes;
                    let mut rgba = Vec::with_capacity(w * h * 4);
                    for chunk in bytes.chunks_exact(4) {
                        if chunk.len() >= 4 {
                            rgba.extend_from_slice(&[chunk[1], chunk[2], chunk[3], chunk[0]]);
                        }
                    }
                    let mut buf = std::io::Cursor::new(Vec::new());
                    {
                        let mut encoder = png::Encoder::new(&mut buf, w as u32, h as u32);
                        encoder.set_color(png::ColorType::Rgba);
                        encoder.set_depth(png::BitDepth::Eight);
                        let mut writer = encoder.write_header().ok()?;
                        writer.write_image_data(&rgba).ok()?;
                    }
                    use base64::Engine;
                    Some(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
                })
                .unwrap_or_default();
            if let Some(ref tx) = st.response_tx {
                let _ = tx.send((request_id, serde_json::json!(data_b64)));
            }
        }
        ToRust::ClipboardWriteImage { data } => {
            if let Ok(mut c) = arboard::Clipboard::new() {
                use base64::Engine;
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(&data) {
                    use std::io::Read;
                    let cursor = std::io::Cursor::new(&bytes[..]);
                    let decoder = png::Decoder::new(cursor);
                    if let Ok(mut reader) = decoder.read_info() {
                        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
                        if let Ok(info) = reader.next_frame(&mut buf) {
                            let (w, h) = (info.width, info.height);
                            let raw = &buf[..(w as usize * h as usize * 4)];
                            let mut argb = Vec::with_capacity(raw.len());
                            for chunk in raw.chunks_exact(4) {
                                argb.extend_from_slice(&[chunk[3], chunk[0], chunk[1], chunk[2]]);
                            }
                            let _ = c.set_image(arboard::ImageData {
                                width: w as usize,
                                height: h as usize,
                                bytes: argb.into(),
                            });
                        }
                    }
                }
            }
        }
        ToRust::ScreenGetDisplays { request_id } => {
            let monitors: Vec<serde_json::Value> = event_loop_target.available_monitors().map(|m| {
                let pos = m.position();
                let size = m.size();
                let work_height = if size.height > 40 { size.height - 40 } else { size.height };
                serde_json::json!({
                    "id": (pos.x as i64).abs() as u32 * 1000 + (pos.y as i64).abs() as u32,
                    "label": m.name().unwrap_or_else(|| "Display".to_string()),
                    "bounds": { "x": pos.x, "y": pos.y, "width": size.width, "height": size.height },
                    "workArea": { "x": pos.x, "y": pos.y, "width": size.width, "height": work_height },
                    "size": { "width": size.width, "height": size.height },
                    "workAreaSize": { "width": size.width, "height": work_height },
                    "scaleFactor": m.scale_factor(),
                    "rotation": 0,
                    "internal": false,
                    "touchSupport": "unknown"
                })
            }).collect();
            if let Some(ref tx) = st.response_tx {
                let _ = tx.send((request_id, serde_json::json!({"displays": monitors})));
            }
        }
        ToRust::NativeThemeQuery { request_id } => {
            let dark = detect_dark_mode();
            if let Some(ref tx) = st.response_tx {
                let _ = tx.send((request_id, serde_json::json!({
                    "shouldUseDarkColors": dark,
                    "themeSource": "system"
                })));
            }
        }
        ToRust::DialogOpen { request_id, options } => {
            let tx = st.response_tx.clone();
            thread::spawn(move || {
                let mut fd = rfd::FileDialog::new();
                if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
                    fd = fd.set_title(title);
                }
                if let Some(dir) = options.get("defaultPath").and_then(|v| v.as_str()) {
                    fd = fd.set_directory(dir);
                }
                // Parse filters
                if let Some(filters) = options.get("filters").and_then(|v| v.as_array()) {
                    for filter in filters {
                        if let Some(name) = filter.get("name").and_then(|v| v.as_str()) {
                            if let Some(exts) = filter.get("extensions").and_then(|v| v.as_array()) {
                                let ext_strs: Vec<&str> = exts.iter().filter_map(|e| e.as_str()).collect();
                                fd = fd.add_filter(name, &ext_strs);
                            }
                        }
                    }
                }
                let result = fd.pick_files();
                let response = serde_json::json!({
                    "canceled": result.is_none(),
                    "filePaths": result.map(|v| v.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()).unwrap_or_default()
                });
                if let Some(ref tx) = tx {
                    let _ = tx.send((request_id, response));
                }
            });
        }
        ToRust::DialogSave { request_id, options } => {
            let tx = st.response_tx.clone();
            thread::spawn(move || {
                let mut fd = rfd::FileDialog::new();
                if let Some(title) = options.get("title").and_then(|v| v.as_str()) {
                    fd = fd.set_title(title);
                }
                if let Some(dir) = options.get("defaultPath").and_then(|v| v.as_str()) {
                    fd = fd.set_directory(dir);
                }
                if let Some(name) = options.get("defaultPath").and_then(|v| v.as_str()) {
                    fd = fd.set_file_name(name);
                }
                let result = fd.save_file();
                let response = serde_json::json!({
                    "canceled": result.is_none(),
                    "filePath": result.map(|p| p.display().to_string())
                });
                if let Some(ref tx) = tx {
                    let _ = tx.send((request_id, response));
                }
            });
        }
        ToRust::DialogMessage { request_id, options } => {
            let tx = st.response_tx.clone();
            let title = options.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let message = options.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let detail = options.get("detail").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let buttons: Vec<String> = options.get("buttons")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|b| b.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_else(|| vec!["OK".to_string()]);
            thread::spawn(move || {
                let desc = if detail.is_empty() { message } else { format!("{}\n{}", message, detail) };
                let mut dialog = rfd::MessageDialog::new()
                    .set_title(&title)
                    .set_description(&desc);
                // Set buttons based on count
                let btn_count = buttons.len();
                if btn_count == 2 {
                    dialog = dialog.set_buttons(rfd::MessageButtons::OkCancel);
                } else if btn_count >= 3 {
                    dialog = dialog.set_buttons(rfd::MessageButtons::OkCancel);
                } else {
                    dialog = dialog.set_buttons(rfd::MessageButtons::Ok);
                }
                let result = dialog.show();
                let response_idx = match result {
                    rfd::MessageDialogResult::Ok => 0,
                    rfd::MessageDialogResult::Cancel => 1,
                    rfd::MessageDialogResult::Yes => 0,
                    rfd::MessageDialogResult::No => 1,
                    _ => 0,
                };
                let response = serde_json::json!({
                    "response": response_idx,
                    "checkboxChecked": false
                });
                if let Some(ref tx) = tx {
                    let _ = tx.send((request_id, response));
                }
            });
        }
        ToRust::DialogError { title, content } => {
            let tx = st.response_tx.clone();
            let rid = String::new();
            thread::spawn(move || {
                rfd::MessageDialog::new()
                    .set_title(&title)
                    .set_description(&content)
                    .set_level(rfd::MessageLevel::Error)
                    .set_buttons(rfd::MessageButtons::Ok)
                    .show();
                if let Some(ref tx) = tx {
                    let _ = tx.send((rid, serde_json::json!({})));
                }
            });
        }
        ToRust::ShellOpenExternal { url } => {
            #[cfg(target_os = "macos")]
            { let _ = std::process::Command::new("open").arg(&url).spawn(); }
            #[cfg(target_os = "windows")]
            { let _ = std::process::Command::new("cmd").args(["/c", "start", "", &url]).spawn(); }
            #[cfg(target_os = "linux")]
            { let _ = std::process::Command::new("xdg-open").arg(&url).spawn(); }
        }
        ToRust::ShellOpenPath { path } => {
            #[cfg(target_os = "macos")]
            { let _ = std::process::Command::new("open").arg(&path).spawn(); }
            #[cfg(target_os = "windows")]
            { let _ = std::process::Command::new("explorer").arg(&path).spawn(); }
            #[cfg(target_os = "linux")]
            { let _ = std::process::Command::new("xdg-open").arg(&path).spawn(); }
        }
        ToRust::ShellShowInFolder { path } => {
            #[cfg(target_os = "macos")]
            { let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn(); }
            #[cfg(target_os = "windows")]
            { let _ = std::process::Command::new("explorer").arg(format!("/select,{}", path)).spawn(); }
            #[cfg(target_os = "linux")]
            {
                if let Some(parent) = std::path::Path::new(&path).parent() {
                    let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
                }
            }
        }
        ToRust::ShellMoveToTrash { path, request_id } => {
            let result = if std::path::Path::new(&path).exists() {
                #[cfg(target_os = "macos")]
                {
                    std::process::Command::new("trash").arg(&path).status()
                        .map(|s| s.success())
                        .unwrap_or_else(|_| {
                            // Fallback: move to ~/.Trash
                            if let Some(name) = std::path::Path::new(&path).file_name() {
                                let trash = std::env::var("HOME")
                                    .map(|h| std::path::PathBuf::from(h).join(".Trash").join(name))
                                    .unwrap_or_default();
                                std::fs::rename(&path, &trash).is_ok()
                            } else {
                                false
                            }
                        })
                }
                #[cfg(target_os = "linux")]
                {
                    std::process::Command::new("gio").args(["trash", &path]).status()
                        .map(|s| s.success())
                        .unwrap_or_else(|_| {
                            let trash_dir = std::env::var("HOME")
                                .map(|h| std::path::PathBuf::from(h).join(".local/share/Trash/files"))
                                .unwrap_or_default();
                            if let Some(name) = std::path::Path::new(&path).file_name() {
                                std::fs::create_dir_all(&trash_dir).ok();
                                let dest = trash_dir.join(name);
                                std::fs::rename(&path, &dest).is_ok()
                            } else {
                                false
                            }
                        })
                }
                #[cfg(target_os = "windows")]
                {
                    std::process::Command::new("powershell")
                        .args(["-Command", &format!("Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::MoveToBasket('{}')", path.replace('\'', "''"))])
                        .status()
                        .is_ok()
                }
                #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
                {
                    std::fs::remove_file(&path).is_ok()
                }
            } else {
                false
            };
            if let Some(rid) = request_id {
                if let Some(ref tx) = st.response_tx {
                    let _ = tx.send((rid, serde_json::json!({
                        "success": result,
                        "error": if result { serde_json::Value::Null } else { serde_json::json!("Failed to move to trash") }
                    })));
                }
            }
        }
        ToRust::SetTitle { id, title } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_title(&title);
            }
        }
        ToRust::SetSize { id, width, height } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_inner_size(tao::dpi::LogicalSize::new(
                    width as f64,
                    height as f64,
                ));
            }
        }
        ToRust::SetAppIcon { icon } => {
            if let Some(decoded) = decode_base64_icon(&icon) {
                st.app_icon = Some(decoded.clone());
                apply_dock_icon(&decoded);
                for pair in st.windows.values() {
                    apply_window_icon(&pair.window, &decoded);
                }
                log::info!("Set app icon");
            } else {
                log::warn!("SetAppIcon: could not decode icon");
            }
        }
        ToRust::Show { id } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_visible(true);
            }
        }
        ToRust::Hide { id } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_visible(false);
            }
        }
        ToRust::Focus { id } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_focus();
            }
        }
        ToRust::Minimize { id } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_minimized(true);
            }
        }
        ToRust::Maximize { id } => {
            if let Some(pair) = st.windows.get(&id) {
                pair.window.set_maximized(true);
            }
        }
        _ => {}
    }
}

fn which_node() -> Option<String> {
    Command::new("which")
        .arg("node")
        .output()
        .ok()
        .and_then(|o| if o.status.success() { String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string()) } else { None })
        .or_else(|| {
            for p in &["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"] {
                if std::path::Path::new(p).exists() { return Some(p.to_string()); }
            }
            None
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ico_32bpp_bmp_decode() {
        let w = 4usize;
        let pixels: [[u8; 4]; 4] = [
            [255, 0, 0, 255],
            [0, 255, 0, 128],
            [0, 0, 255, 64],
            [255, 255, 255, 0],
        ];
        let mut bmp = vec![0u8; 40];
        bmp[4..8].copy_from_slice(&(w as i32).to_le_bytes());
        bmp[8..12].copy_from_slice(&(w as i32).to_le_bytes());
        bmp[14..16].copy_from_slice(&32u16.to_le_bytes());
        for y in (0..w).rev() {
            for x in 0..w {
                let p = pixels[y];
                bmp.extend_from_slice(&[p[2], p[1], p[0], p[3]]);
            }
        }
        let mut ico = vec![0u8; 6];
        ico[2..4].copy_from_slice(&1u16.to_le_bytes());
        ico.extend_from_slice(&[w as u8, w as u8, 0, 0]);
        ico.extend_from_slice(&1u16.to_le_bytes());
        ico.extend_from_slice(&32u16.to_le_bytes());
        ico.extend_from_slice(&(bmp.len() as u32).to_le_bytes());
        ico.extend_from_slice(&22u32.to_le_bytes());
        ico.extend_from_slice(&bmp);

        let icon = decode_ico_icon(&ico).expect("should decode 32bpp BMP-in-ICO");
        assert_eq!(icon.width, w as u32);
        assert_eq!(icon.height, w as u32);
        for y in 0..w {
            for x in 0..w {
                let i = (y * w + x) * 4;
                assert_eq!(&icon.rgba[i..i + 4], &pixels[y]);
            }
        }
    }

    #[test]
    fn png_in_ico_decode() {
        let mut png = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut png, 2, 2);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut w = enc.write_header().unwrap();
            w.write_image_data(&[10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255])
                .unwrap();
        }
        let mut ico = vec![0u8; 6];
        ico[2..4].copy_from_slice(&1u16.to_le_bytes());
        ico.extend_from_slice(&[0, 0, 0, 0]);
        ico.extend_from_slice(&1u16.to_le_bytes());
        ico.extend_from_slice(&32u16.to_le_bytes());
        ico.extend_from_slice(&(png.len() as u32).to_le_bytes());
        ico.extend_from_slice(&22u32.to_le_bytes());
        ico.extend_from_slice(&png);

        let icon = decode_ico_icon(&ico).expect("should decode PNG-in-ICO");
        assert_eq!(icon.width, 2);
        assert_eq!(icon.height, 2);
        assert_eq!(&icon.rgba[..4], &[10, 20, 30, 255]);
    }
}
