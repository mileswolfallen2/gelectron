use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItemDef {
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub label: Option<String>,
    pub accelerator: Option<String>,
    pub enabled: Option<bool>,
    pub visible: Option<bool>,
    pub checked: Option<bool>,
    pub role: Option<String>,
    pub submenu: Option<Vec<MenuItemDef>>,
    pub id: Option<String>,
}

static MENU_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
static MENUS: OnceLock<Mutex<Vec<u32>>> = OnceLock::new();

fn get_menu_ids() -> &'static Mutex<Vec<u32>> {
    MENUS.get_or_init(|| Mutex::new(Vec::new()))
}

#[napi]
pub fn menu_build_from_template(template_json: String) -> Result<u32> {
    let _items: Vec<MenuItemDef> =
        serde_json::from_str(&template_json).map_err(|e| Error::from_reason(e.to_string()))?;

    let id = MENU_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    get_menu_ids()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?
        .push(id);

    log::info!("Menu {} built from template ({} items)", id, _items.len());
    Ok(id)
}

#[napi]
pub fn menu_set_as_app_menu(menu_id: u32) -> Result<()> {
    log::info!("Menu {} set as app menu", menu_id);
    Ok(())
}

#[napi]
pub fn menu_set_as_window_menu(menu_id: u32, window_id: u32) -> Result<()> {
    log::info!("Menu {} set as window menu for window {}", menu_id, window_id);
    Ok(())
}

#[napi]
pub fn menu_get_application_menu() -> Option<u32> {
    get_menu_ids()
        .lock()
        .ok()
        .and_then(|ids| ids.first().copied())
}

#[napi]
pub fn menu_popup(menu_id: u32, window_id: Option<u32>, x: Option<f64>, y: Option<f64>) -> Result<()> {
    log::info!(
        "Menu {} popup at ({}, {}) on window {:?}",
        menu_id,
        x.unwrap_or(0.0),
        y.unwrap_or(0.0),
        window_id
    );
    Ok(())
}

#[napi]
pub fn menu_close_popup(_menu_id: u32) -> Result<()> {
    Ok(())
}

#[napi]
pub fn menu_items(menu_id: u32) -> Result<Vec<String>> {
    log::debug!("Menu {} get items", menu_id);
    Ok(vec!["[]".to_string()])
}

#[napi]
pub fn menu_append(menu_id: u32, item_json: String) -> Result<()> {
    log::debug!("Menu {} append item: {}", menu_id, &item_json[..item_json.len().min(50)]);
    Ok(())
}

#[napi]
pub fn menu_insert(menu_id: u32, position: u32, item_json: String) -> Result<()> {
    log::debug!("Menu {} insert at position {}: {}", menu_id, position, &item_json[..item_json.len().min(50)]);
    Ok(())
}

#[napi]
pub fn menu_remove(menu_id: u32, item_id: String) -> Result<()> {
    log::debug!("Menu {} remove item {}", menu_id, item_id);
    Ok(())
}

#[napi]
pub fn menu_remove_at(menu_id: u32, position: u32) -> Result<()> {
    log::debug!("Menu {} remove at position {}", menu_id, position);
    Ok(())
}

#[napi]
pub fn menu_clear(menu_id: u32) -> Result<()> {
    log::debug!("Menu {} cleared", menu_id);
    Ok(())
}

#[napi]
pub fn menu_get_item_by_id(menu_id: u32, item_id: String) -> Result<Option<String>> {
    log::debug!("Menu {} get item {}", menu_id, item_id);
    Ok(None)
}

#[napi]
pub fn menu_set_item_enabled(menu_id: u32, item_id: String, enabled: bool) -> Result<()> {
    log::debug!("Menu {} item {} enabled={}", menu_id, item_id, enabled);
    Ok(())
}

#[napi]
pub fn menu_set_item_checked(menu_id: u32, item_id: String, checked: bool) -> Result<()> {
    log::debug!("Menu {} item {} checked={}", menu_id, item_id, checked);
    Ok(())
}

#[napi]
pub fn menu_set_item_label(menu_id: u32, item_id: String, label: String) -> Result<()> {
    log::debug!("Menu {} item {} label={}", menu_id, item_id, label);
    Ok(())
}
