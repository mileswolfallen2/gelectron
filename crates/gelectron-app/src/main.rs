#![windows_subsystem = "windows"]

use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
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
}

impl AppState {
    fn new(node_exited: Arc<AtomicBool>) -> Self {
        Self {
            windows: HashMap::new(),
            window_wids: HashMap::new(),
            node_stdin: None,
            node_exited,
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

    // If no args, try to auto-detect app path for packaged apps
    let raw_app_path = if args.len() >= 2 {
        args[1].clone()
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
    // Node.js -e resolves require() relative to [eval], not cwd.
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

// Purge any cached 'electron' module from the real npm package
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

// Also patch _resolveRequest for Node >= 22
if (typeof Module._resolveRequest === 'function') {{
    var origResolveRequest = Module._resolveRequest;
    Module._resolveRequest = function(request, parent, isMain, options) {{
        if (request === 'electron' || request === 'electron/main' || request === 'electron/common') return path.join(compatPath, 'index.js');
        if (request === 'electron/renderer') return path.join(compatPath, 'ipc-renderer.js');
        return origResolveRequest.call(this, request, parent, isMain, options);
    }};
}}

// Pre-load the gelectron shim so require('electron') hits cache
require(path.join(compatPath, 'index.js'));

// Periodic GC to keep memory low
setInterval(function() {{ if (global.gc) global.gc(); }}, 5000);

require('{}');
"#,
        main_script.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
        app_path.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
        compat_dir.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
        main_script.display().to_string().replace('\\', "\\\\").replace('\'', "\\'"),
    );

    let mut child: Child = Command::new(&node_path)
        .arg("--max-old-space-size=64")
        .arg("--expose-gc")
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
                    if trimmed.is_empty() || !trimmed.starts_with('{') {
                        continue;
                    }
                    if let Ok(msg) = serde_json::from_str::<ToRust>(&trimmed) {
                        if tx.send(msg).is_err() {
                            break;
                        }
                    }
                }
                Err(_) => break,
            }
        }
        // Node.js process stdout closed – the child has exited
        node_exited_clone.store(true, Ordering::SeqCst);
    });

    let event_loop = EventLoopBuilder::new().build();
    let (ipc_tx, ipc_rx) = mpsc::channel::<ToNode>();
    let mut state = AppState::new(node_exited.clone());
    state.node_stdin = Some(child_stdin);
    let state = Rc::new(RefCell::new(state));

    state.borrow_mut().send_to_node(&ToNode::Ready);

    event_loop.run(move |event, event_loop_target, control_flow| {
        *control_flow = ControlFlow::Poll;
        let mut st = state.borrow_mut();

        // If the Node.js child process has exited, shut down
        if st.node_exited.load(Ordering::SeqCst) {
            st.windows.clear();
            st.window_wids.clear();
            *control_flow = ControlFlow::Exit;
            return;
        }

        match event {
            Event::NewEvents(StartCause::Poll) => {
                // Drain IPC messages from webview → Node
                while let Ok(msg) = ipc_rx.try_recv() {
                    st.send_to_node(&msg);
                }
                while let Ok(msg) = rx.try_recv() {
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
                                let wid_for_ipc = id;
                                match WebViewBuilder::new()
                                    .with_url(&url)
                                    .with_initialization_script(&preload_script())
                                    .with_devtools(true)
                                    .with_ipc_handler(move |req| {
                                        let body = req.body().to_string();
                                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&body) {
                                            let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                            if msg_type == "ipc-send" {
                                                let channel = msg.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                                                let args = msg.get("args").cloned().unwrap_or(serde_json::Value::Null);
                                                let _ = ipc_tx_clone.send(ToNode::IpcMessage { id: wid_for_ipc, channel: channel.to_string(), data: args });
                                            }
                                        }
                                    })
                                    .build(&window)
                                {
                                    Ok(webview) => {
                                        let wid = window.id();
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
                                let wv = &pair.webview;
                                let _ = wv.evaluate_script(&format!(
                                    "window.location.replace({});",
                                    serde_json::to_string(&url).unwrap()
                                ));
                            }
                        }
                        ToRust::LoadFile { id, path } => {
                            let url = format!("file://{}", std::fs::canonicalize(&path).unwrap_or_default().display());
                            log::info!("Loading file in window {}: {}", id, url);
                            if let Some(pair) = st.windows.get_mut(&id) {
                                let window = &pair.window;
                                let ipc_tx_clone = ipc_tx.clone();
                                let wid_for_ipc = id;
                                match WebViewBuilder::new()
                                    .with_url(&url)
                                    .with_initialization_script(&preload_script())
                                    .with_devtools(true)
                                    .with_ipc_handler(move |req| {
                                        let body = req.body().to_string();
                                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&body) {
                                            let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                            if msg_type == "ipc-send" {
                                                let channel = msg.get("channel").and_then(|v| v.as_str()).unwrap_or("");
                                                let args = msg.get("args").cloned().unwrap_or(serde_json::Value::Null);
                                                let _ = ipc_tx_clone.send(ToNode::IpcMessage { id: wid_for_ipc, channel: channel.to_string(), data: args });
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
                        _ => {}
                    }
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
