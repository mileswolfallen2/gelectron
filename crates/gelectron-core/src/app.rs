use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::event_loop::EventLoopBridge;
use crate::ipc::IpcManager;
use crate::servo_host::ServoHost;

#[allow(unused_imports)]
use napi::JsFunction;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub main_script: String,
    pub app_path: String,
    pub user_data_dir: Option<String>,
    pub dev_mode: bool,
}

pub struct AppState {
    pub config: AppConfig,
    pub servo: Option<ServoHost>,
    pub ipc: Arc<Mutex<IpcManager>>,
    pub event_loop: Arc<EventLoopBridge>,
    pub ready: bool,
}

static APP_STATE: std::sync::OnceLock<Mutex<Option<AppState>>> = std::sync::OnceLock::new();

fn get_app_state() -> &'static Mutex<Option<AppState>> {
    APP_STATE.get_or_init(|| Mutex::new(None))
}

#[napi(object)]
pub struct AppPaths {
    pub home: String,
    pub app_data: String,
    pub user_data: String,
    pub desktop: String,
    pub documents: String,
    pub downloads: String,
    pub temp: String,
}

#[napi]
pub fn app_init(config_json: String) -> Result<()> {
    let config: AppConfig =
        serde_json::from_str(&config_json).map_err(|e| Error::from_reason(e.to_string()))?;

    let state = AppState {
        servo: None,
        ipc: Arc::new(Mutex::new(IpcManager::new())),
        event_loop: Arc::new(EventLoopBridge::new()),
        ready: false,
        config,
    };

    let mut lock = get_app_state()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    *lock = Some(state);

    log::info!("App initialized: main={}", lock.as_ref().unwrap().config.main_script);
    Ok(())
}

#[napi]
pub fn app_get_paths() -> Result<AppPaths> {
    Ok(AppPaths {
        home: dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        app_data: dirs::data_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        user_data: dirs::data_local_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        desktop: dirs::desktop_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        documents: dirs::document_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        downloads: dirs::download_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        temp: std::env::temp_dir().to_string_lossy().to_string(),
    })
}

#[napi]
pub fn app_get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[napi]
pub fn app_get_name() -> String {
    "gelectron".to_string()
}

#[napi]
pub fn app_get_locale() -> String {
    sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string())
}

#[napi]
pub fn app_get_user_agent() -> String {
    format!(
        "Gelectron/{} (Servo; {} {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

#[napi]
pub fn app_quit() {
    log::info!("App quit requested");
    let lock = get_app_state().lock();
    if let Ok(mut guard) = lock {
        *guard = None;
    }
    std::process::exit(0);
}

#[napi]
pub fn app_is_ready() -> bool {
    get_app_state()
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|s| s.ready))
        .unwrap_or(false)
}

#[napi]
pub fn app_set_ready() {
    if let Ok(mut guard) = get_app_state().lock() {
        if let Some(ref mut state) = *guard {
            state.ready = true;
        }
    }
}

#[napi]
pub fn app_on_event(event_name: String, callback: JsFunction) -> Result<()> {
    crate::event_loop::register_app_event(&event_name, callback)
}

#[napi]
pub fn app_emit_event(event_name: String, args_json: Option<String>) {
    crate::event_loop::emit_app_event(&event_name, args_json);
}

#[napi]
pub fn app_get_command_line_args() -> Vec<String> {
    std::env::args().collect()
}

#[napi]
pub fn app_get_switch(switch_name: String) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    for i in 0..args.len() {
        if args[i] == format!("--{}", switch_name) {
            return args.get(i + 1).cloned();
        }
        if args[i].starts_with(&format!("--{}=", switch_name)) {
            return Some(args[i][switch_name.len() + 3..].to_string());
        }
    }
    None
}
