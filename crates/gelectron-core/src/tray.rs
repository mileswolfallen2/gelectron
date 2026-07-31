use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction};
use napi_derive::napi;
use std::sync::{Mutex, OnceLock};

static TRAY_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
static TRAY_IDS: OnceLock<Mutex<Vec<u32>>> = OnceLock::new();

fn get_tray_ids() -> &'static Mutex<Vec<u32>> {
    TRAY_IDS.get_or_init(|| Mutex::new(Vec::new()))
}

#[napi(object)]
pub struct TrayInfo {
    pub id: u32,
    pub tooltip: Option<String>,
}

#[napi]
pub fn tray_create(options_json: Option<String>) -> Result<u32> {
    let id = TRAY_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    let tooltip = options_json
        .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok())
        .and_then(|v| v.get("tooltip").and_then(|t| t.as_str()).map(String::from))
        .unwrap_or_else(|| "Gelectron".to_string());

    get_tray_ids()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .push(id);

    log::info!("Tray {} created with tooltip '{}'", id, tooltip);
    Ok(id)
}

#[napi]
pub fn tray_destroy(tray_id: u32) -> Result<()> {
    let mut ids = get_tray_ids()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    ids.retain(|&id| id != tray_id);
    log::info!("Tray {} destroyed", tray_id);
    Ok(())
}

#[napi]
pub fn tray_set_tooltip(tray_id: u32, tooltip: String) -> Result<()> {
    log::debug!("Tray {} tooltip set to '{}'", tray_id, tooltip);
    Ok(())
}

#[napi]
pub fn tray_set_image(tray_id: u32, _image_json: Option<String>) -> Result<()> {
    log::debug!("Tray {} image updated", tray_id);
    Ok(())
}

#[napi]
pub fn tray_set_pressed_image(_tray_id: u32, _image_json: Option<String>) -> Result<()> {
    Ok(())
}

#[napi]
#[allow(non_snake_case)]
pub fn tray_setContextMenu(tray_id: u32, menu_id: Option<u32>) -> Result<()> {
    log::info!("Tray {} context menu set to {:?}", tray_id, menu_id);
    Ok(())
}

#[napi]
pub fn tray_popup_context_menu(tray_id: u32, _options_json: Option<String>) -> Result<()> {
    log::info!("Tray {} context menu popped up", tray_id);
    Ok(())
}

#[napi]
pub fn tray_is_destroyed(tray_id: u32) -> Result<bool> {
    let ids = get_tray_ids()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    Ok(!ids.contains(&tray_id))
}

#[napi]
pub fn tray_on_event(tray_id: u32, callback: JsFunction) -> Result<()> {
    let _tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
        .create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            let value = ctx.value.clone();
            Ok(vec![ctx.env.create_string_from_std(value)?])
        })?;

    log::debug!("Tray {} event listener registered", tray_id);
    Ok(())
}

#[napi]
pub fn tray_get_bounds(_tray_id: u32) -> Result<Vec<f64>> {
    Ok(vec![0.0, 0.0, 22.0, 22.0])
}
