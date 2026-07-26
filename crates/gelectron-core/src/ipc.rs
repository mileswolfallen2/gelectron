use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Mutex;

static REGISTERED_CHANNELS: once_cell::sync::Lazy<Mutex<HashMap<String, bool>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

static IPC_LISTENERS: once_cell::sync::Lazy<Mutex<HashMap<String, Vec<IpcListener>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, Debug)]
struct IpcListener {
    id: u32,
    channel: String,
}

static LISTENER_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);

pub struct IpcManager {
    pub handlers: HashMap<String, bool>,
}

impl IpcManager {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }
}

// --- ipcMain API ---

#[napi]
pub fn ipc_main_handle(channel: String, _callback: JsFunction) -> Result<()> {
    let mut channels = REGISTERED_CHANNELS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    channels.insert(channel.clone(), true);
    log::debug!("ipcMain.handle registered for channel: {}", channel);
    Ok(())
}

#[napi]
pub fn ipc_main_on(channel: String, _callback: JsFunction) -> Result<i64> {
    let id = LISTENER_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let mut listeners = IPC_LISTENERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    log::debug!("ipcMain.on registered for channel: {}", &channel);
    listeners
        .entry(channel.clone())
        .or_insert_with(Vec::new)
        .push(IpcListener { id, channel });
    Ok(id as i64)
}

#[napi]
pub fn ipc_main_remove_listener(channel: String, listener_id: i64) -> Result<()> {
    let mut listeners = IPC_LISTENERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(channel_listeners) = listeners.get_mut(&channel) {
        channel_listeners.retain(|l| l.id as i64 != listener_id);
    }
    Ok(())
}

#[napi]
pub fn ipc_main_remove_all_listeners(channel: Option<String>) -> Result<()> {
    let mut listeners = IPC_LISTENERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    match channel {
        Some(ch) => {
            listeners.remove(&ch);
        }
        None => {
            listeners.clear();
        }
    }
    Ok(())
}

#[napi]
pub fn ipc_main_handle_sync(channel: String, _callback: JsFunction) -> Result<()> {
    let mut channels = REGISTERED_CHANNELS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    channels.insert(channel.clone(), true);
    log::debug!("ipcMain.handleSync registered for channel: {}", channel);
    Ok(())
}

// --- ipcRenderer API ---

#[napi]
pub fn ipc_renderer_invoke(
    window_id: u32,
    channel: String,
    args_json: Option<String>,
) -> Result<String> {
    let request_id = uuid::Uuid::new_v4().to_string();

    let invoke_msg = serde_json::json!({
        "type": "invoke",
        "requestId": request_id,
        "channel": channel,
        "args": args_json.and_then(|a| serde_json::from_str::<serde_json::Value>(&a).ok()).unwrap_or(serde_json::Value::Null),
    })
    .to_string();

    crate::browser_window::window_web_contents_send(
        window_id,
        "__gelectron_ipc_invoke".to_string(),
        Some(invoke_msg),
    )?;

    Ok(request_id)
}

#[napi]
pub fn ipc_renderer_send(window_id: u32, channel: String, args_json: Option<String>) -> Result<()> {
    let send_msg = serde_json::json!({
        "type": "send",
        "channel": channel,
        "args": args_json.and_then(|a| serde_json::from_str::<serde_json::Value>(&a).ok()).unwrap_or(serde_json::Value::Null),
    })
    .to_string();

    crate::browser_window::window_web_contents_send(
        window_id,
        "__gelectron_ipc_send".to_string(),
        Some(send_msg),
    )?;

    Ok(())
}

#[napi]
pub fn ipc_renderer_on(channel: String, _callback: JsFunction) -> Result<i64> {
    let id = LISTENER_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let mut listeners = IPC_LISTENERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    listeners
        .entry(format!("renderer:{}", channel))
        .or_insert_with(Vec::new)
        .push(IpcListener {
            id,
            channel: channel.clone(),
        });
    log::debug!("ipcRenderer.on registered for channel: {}", &channel);
    Ok(id as i64)
}

#[napi]
pub fn ipc_renderer_remove_listener(channel: String, listener_id: i64) -> Result<()> {
    let mut listeners = IPC_LISTENERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let key = format!("renderer:{}", channel);
    if let Some(channel_listeners) = listeners.get_mut(&key) {
        channel_listeners.retain(|l| l.id as i64 != listener_id);
    }
    Ok(())
}

#[napi]
pub fn ipc_renderer_remove_all_listeners(channel: Option<String>) -> Result<()> {
    let mut listeners = IPC_LISTENERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    match channel {
        Some(ch) => {
            listeners.remove(&format!("renderer:{}", ch));
        }
        None => {
            listeners.retain(|k, _| !k.starts_with("renderer:"));
        }
    }
    Ok(())
}

#[napi]
pub fn ipc_send_to_renderers(channel: String, data_json: Option<String>) -> Result<()> {
    let windows = crate::browser_window::window_get_all_windows()
        .map_err(|e| Error::from_reason(e.to_string()))?;

    for win in windows {
        crate::browser_window::window_web_contents_send(
            win.id,
            channel.clone(),
            data_json.clone(),
        )?;
    }
    Ok(())
}
