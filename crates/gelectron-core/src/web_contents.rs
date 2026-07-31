use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn web_contents_get_id(window_id: u32) -> Result<u32> {
    Ok(window_id)
}

#[napi]
pub fn web_contents_send(window_id: u32, channel: String, data_json: Option<String>) -> Result<()> {
    crate::browser_window::window_web_contents_send(window_id, channel, data_json)
}

#[napi]
pub fn web_contents_execute_javascript(window_id: u32, code: String) -> Result<String> {
    crate::browser_window::window_execute_javascript(window_id, code)
}

#[napi]
pub fn web_contents_insert_css(window_id: u32, css: String) -> Result<()> {
    crate::browser_window::window_insert_css(window_id, css)
}

#[napi]
pub fn web_contents_open_devtools(window_id: u32) -> Result<()> {
    crate::browser_window::window_open_devtools(window_id)
}

#[napi]
pub fn web_contents_close_devtools(window_id: u32) -> Result<()> {
    crate::browser_window::window_close_devtools(window_id)
}

#[napi]
pub fn web_contents_is_devtools_open(window_id: u32) -> Result<bool> {
    crate::browser_window::window_is_devtools_open(window_id)
}

#[napi]
pub fn web_contents_get_url(window_id: u32) -> Result<String> {
    crate::browser_window::window_get_url(window_id)
}

#[napi]
pub fn web_contents_get_title(window_id: u32) -> Result<String> {
    crate::browser_window::window_get_title(window_id)
}

#[napi]
pub fn web_contents_is_loading(_window_id: u32) -> Result<bool> {
    Ok(false)
}

#[napi]
pub fn web_contents_is_crashed(_window_id: u32) -> Result<bool> {
    Ok(false)
}

#[napi]
pub fn web_contents_go_back(window_id: u32) -> Result<()> {
    log::info!("Window {} go back", window_id);
    Ok(())
}

#[napi]
pub fn web_contents_go_forward(window_id: u32) -> Result<()> {
    log::info!("Window {} go forward", window_id);
    Ok(())
}

#[napi]
pub fn web_contents_can_go_back(_window_id: u32) -> Result<bool> {
    Ok(false)
}

#[napi]
pub fn web_contents_can_go_forward(_window_id: u32) -> Result<bool> {
    Ok(false)
}

#[napi]
pub fn web_contents_reload(window_id: u32) -> Result<()> {
    crate::browser_window::window_reload(window_id)
}

#[napi]
pub fn web_contents_set_zoom_factor(window_id: u32, factor: f64) -> Result<()> {
    log::debug!("Window {} zoom factor set to {}", window_id, factor);
    Ok(())
}

#[napi]
pub fn web_contents_get_zoom_factor(_window_id: u32) -> Result<f64> {
    Ok(1.0)
}

#[napi]
pub fn web_contents_set_background_color(window_id: u32, color: String) -> Result<()> {
    log::debug!("Window {} background color set to {}", window_id, color);
    Ok(())
}

#[napi]
pub fn web_contents_get_process_id(_window_id: u32) -> Result<i32> {
    Ok(std::process::id() as i32)
}

#[napi]
pub fn web_contents_get_session_id(window_id: u32) -> Result<String> {
    Ok(format!("session-{}", window_id))
}

#[napi]
#[allow(non_snake_case)]
pub fn web_contents_set_windowOpenHandler(window_id: u32) -> Result<()> {
    log::debug!("Window {} set window open handler", window_id);
    Ok(())
}

#[napi]
#[allow(non_snake_case)]
pub fn web_contents_set_permissionRequestHandler(window_id: u32) -> Result<()> {
    log::debug!("Window {} set permission request handler", window_id);
    Ok(())
}

#[napi]
pub fn web_contents_set_certificate_verify_proc(window_id: u32) -> Result<()> {
    log::debug!("Window {} set certificate verify proc", window_id);
    Ok(())
}

#[napi]
pub fn web_contents_set_user_agent(window_id: u32, user_agent: String) -> Result<()> {
    log::debug!("Window {} user agent set to {}", window_id, user_agent);
    Ok(())
}

#[napi]
pub fn web_contents_get_user_agent(_window_id: u32) -> Result<String> {
    Ok(crate::app::app_get_user_agent())
}

#[napi]
pub fn web_contents_set_ignore_menu_shortcuts(window_id: u32, ignore: bool) -> Result<()> {
    log::debug!("Window {} ignore menu shortcuts={}", window_id, ignore);
    Ok(())
}

#[napi]
#[allow(non_snake_case)]
pub fn web_contents_setAudioMuted(window_id: u32, muted: bool) -> Result<()> {
    log::debug!("Window {} audio muted={}", window_id, muted);
    Ok(())
}

#[napi]
pub fn web_contents_is_audio_muted(_window_id: u32) -> Result<bool> {
    Ok(false)
}

#[napi]
pub fn web_contents_set_zoom_level(window_id: u32, level: f64) -> Result<()> {
    log::debug!("Window {} zoom level set to {}", window_id, level);
    Ok(())
}

#[napi]
pub fn web_contents_get_zoom_level(_window_id: u32) -> Result<f64> {
    Ok(0.0)
}
