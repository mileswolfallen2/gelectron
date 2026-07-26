use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub min_width: Option<u32>,
    pub min_height: Option<u32>,
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub title: Option<String>,
    pub url: Option<String>,
    pub frame: Option<bool>,
    pub show: Option<bool>,
    pub resizable: Option<bool>,
    pub minimizable: Option<bool>,
    pub maximizable: Option<bool>,
    pub closable: Option<bool>,
    pub fullscreen: Option<bool>,
    pub always_on_top: Option<bool>,
    pub transparent: Option<bool>,
    pub decorations: Option<bool>,
    pub background_color: Option<String>,
    pub icon: Option<String>,
    pub preload: Option<String>,
    pub context_isolation: Option<bool>,
    pub node_integration: Option<bool>,
    pub sandbox: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebPreferences {
    pub preload: Option<String>,
    pub context_isolation: Option<bool>,
    pub node_integration: Option<bool>,
    pub sandbox: Option<bool>,
    pub dev_tools: Option<bool>,
    pub web_security: Option<bool>,
    pub allow_running_insecure_content: Option<bool>,
    pub experimental_features: Option<bool>,
}

pub struct BrowserWindowState {
    pub id: u32,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub url: String,
    pub is_visible: bool,
    pub is_minimized: bool,
    pub is_maximized: bool,
    pub is_fullscreen: bool,
    pub is_closed: bool,
    pub web_preferences: WebPreferences,
    pub event_callback: Option<ThreadsafeFunction<String, ErrorStrategy::Fatal>>,
}

static WINDOW_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
static WINDOWS: once_cell::sync::Lazy<Mutex<Vec<BrowserWindowState>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(Vec::new()));

fn next_window_id() -> u32 {
    WINDOW_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
}

#[napi(object)]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub url: String,
    pub is_visible: bool,
    pub is_minimized: bool,
    pub is_maximized: bool,
    pub is_fullscreen: bool,
}

#[napi]
pub fn window_create(options_json: String) -> Result<u32> {
    let opts: WindowOptions =
        serde_json::from_str(&options_json).map_err(|e| Error::from_reason(e.to_string()))?;

    let id = next_window_id();
    let state = BrowserWindowState {
        id,
        title: opts.title.unwrap_or_else(|| "Gelectron".to_string()),
        width: opts.width.unwrap_or(800),
        height: opts.height.unwrap_or(600),
        url: opts.url.unwrap_or_else(|| "about:blank".to_string()),
        is_visible: opts.show.unwrap_or(true),
        is_minimized: false,
        is_maximized: false,
        is_fullscreen: opts.fullscreen.unwrap_or(false),
        is_closed: false,
        web_preferences: WebPreferences {
            preload: opts.preload,
            context_isolation: opts.context_isolation.or(Some(true)),
            node_integration: opts.node_integration.or(Some(false)),
            sandbox: opts.sandbox.or(Some(false)),
            dev_tools: Some(true),
            web_security: Some(true),
            allow_running_insecure_content: Some(false),
            experimental_features: Some(false),
        },
        event_callback: None,
    };

    WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .push(state);

    log::info!("Window {} created", id);
    Ok(id)
}

#[napi]
pub fn window_destroy(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_closed = true;
        log::info!("Window {} destroyed", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_show(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_visible = true;
        win.is_minimized = false;
    }
    Ok(())
}

#[napi]
pub fn window_hide(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_visible = false;
    }
    Ok(())
}

#[napi]
pub fn window_focus(window_id: u32) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id) {
        log::info!("Window {} focused", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_minimize(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_minimized = true;
    }
    Ok(())
}

#[napi]
pub fn window_maximize(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_maximized = !win.is_maximized;
    }
    Ok(())
}

#[napi]
pub fn window_unmaximize(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_maximized = false;
    }
    Ok(())
}

#[napi]
pub fn window_restore(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_minimized = false;
        win.is_maximized = false;
    }
    Ok(())
}

#[napi]
pub fn window_set_fullscreen(window_id: u32, fullscreen: bool) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_fullscreen = fullscreen;
    }
    Ok(())
}

#[napi]
pub fn window_is_minimized(window_id: u32) -> Result<bool> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| w.is_minimized)
        .unwrap_or(false))
}

#[napi]
pub fn window_is_maximized(window_id: u32) -> Result<bool> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| w.is_maximized)
        .unwrap_or(false))
}

#[napi]
pub fn window_is_fullscreen(window_id: u32) -> Result<bool> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| w.is_fullscreen)
        .unwrap_or(false))
}

#[napi]
pub fn window_set_title(window_id: u32, title: String) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.title = title;
    }
    Ok(())
}

#[napi]
pub fn window_get_title(window_id: u32) -> Result<String> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| w.title.clone())
        .unwrap_or_default())
}

#[napi]
pub fn window_set_size(window_id: u32, width: u32, height: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.width = width;
        win.height = height;
    }
    Ok(())
}

#[napi]
pub fn window_get_size(window_id: u32) -> Result<Vec<u32>> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| vec![w.width, w.height])
        .unwrap_or_else(|| vec![0, 0]))
}

#[napi]
pub fn window_load_url(window_id: u32, url: String) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.url = url.clone();
        log::info!("Window {} navigating to {}", window_id, url);
    }
    Ok(())
}

#[napi]
pub fn window_get_url(window_id: u32) -> Result<String> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| w.url.clone())
        .unwrap_or_default())
}

#[napi]
pub fn window_reload(window_id: u32) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id) {
        log::info!("Window {} reloading", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_close(window_id: u32) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.is_closed = true;
        win.is_visible = false;
        log::info!("Window {} closed", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_get_all_windows() -> Result<Vec<WindowInfo>> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .filter(|w| !w.is_closed)
        .map(|w| WindowInfo {
            id: w.id,
            title: w.title.clone(),
            width: w.width,
            height: w.height,
            url: w.url.clone(),
            is_visible: w.is_visible,
            is_minimized: w.is_minimized,
            is_maximized: w.is_maximized,
            is_fullscreen: w.is_fullscreen,
        })
        .collect())
}

#[napi]
pub fn window_is_closed(window_id: u32) -> Result<bool> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(windows
        .iter()
        .find(|w| w.id == window_id)
        .map(|w| w.is_closed)
        .unwrap_or(true))
}

#[napi]
pub fn window_set_always_on_top(window_id: u32, always_on_top: bool) -> Result<()> {
    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter_mut().find(|w| w.id == window_id) {
        log::info!("Window {} always_on_top={}", window_id, always_on_top);
    }
    Ok(())
}

#[napi]
pub fn window_center(window_id: u32) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id) {
        log::info!("Window {} centered", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_set_resizable(window_id: u32, resizable: bool) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id) {
        log::debug!("Window {} resizable={}", window_id, resizable);
    }
    Ok(())
}

#[napi]
pub fn window_web_contents_send(window_id: u32, channel: String, data_json: Option<String>) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter().find(|w| w.id == window_id && !w.is_closed) {
        let message = serde_json::json!({
            "channel": channel,
            "data": data_json.and_then(|d| serde_json::from_str::<serde_json::Value>(&d).ok()),
        })
        .to_string();

        if let Some(ref callback) = win.event_callback {
            callback.call(message, ThreadsafeFunctionCallMode::NonBlocking);
        } else {
            log::warn!("No event callback set for window {}, cannot send to renderer", window_id);
        }
    }
    Ok(())
}

#[napi]
pub fn window_set_event_callback(
    window_id: u32,
    callback: JsFunction,
) -> Result<()> {
    let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
        .create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            let value = ctx.value.clone();
            Ok(vec![ctx.env.create_string_from_std(value)?])
        })?;

    let mut windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(win) = windows.iter_mut().find(|w| w.id == window_id) {
        win.event_callback = Some(tsfn);
    }
    Ok(())
}

#[napi]
pub fn window_open_devtools(window_id: u32) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id) {
        log::info!("Window {} devtools opened", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_close_devtools(window_id: u32) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id) {
        log::info!("Window {} devtools closed", window_id);
    }
    Ok(())
}

#[napi]
pub fn window_is_devtools_open(_window_id: u32) -> Result<bool> {
    let _windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(false)
}

#[napi]
pub fn window_execute_javascript(window_id: u32, script: String) -> Result<String> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id && !w.is_closed) {
        log::debug!("Window {} executing JS: {}", window_id, &script[..script.len().min(100)]);
    }
    Ok(String::new())
}

#[napi]
pub fn window_insert_css(window_id: u32, _css: String) -> Result<()> {
    let windows = WINDOWS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    if let Some(_win) = windows.iter().find(|w| w.id == window_id && !w.is_closed) {
        log::debug!("Window {} inserting CSS", window_id);
    }
    Ok(())
}
