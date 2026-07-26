use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Mutex, OnceLock};

pub struct ServoHost {
    pub initialized: bool,
    pub url: String,
}

static SERVO_HOST: OnceLock<Mutex<Option<ServoHost>>> = OnceLock::new();

pub fn get_servo_host() -> Option<&'static Mutex<Option<ServoHost>>> {
    Some(SERVO_HOST.get_or_init(|| Mutex::new(None)))
}

#[napi]
pub fn servo_init(config_json: Option<String>) -> Result<()> {
    log::info!("Initializing Servo host...");

    let host = ServoHost {
        initialized: true,
        url: config_json
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .and_then(|v| v.get("url").and_then(|u| u.as_str().map(String::from)))
            .unwrap_or_else(|| "about:blank".to_string()),
    };

    if let Some(mutex) = get_servo_host() {
        *mutex.lock().map_err(|e| Error::from_reason(e.to_string()))? = Some(host);
    }

    log::info!("Servo host initialized");
    Ok(())
}

#[napi]
pub fn servo_is_available() -> bool {
    get_servo_host()
        .and_then(|m| m.lock().ok())
        .and_then(|guard| guard.as_ref().map(|h| h.initialized))
        .unwrap_or(false)
}

#[napi]
pub fn servo_load_url(url: String) -> Result<()> {
    if let Some(mutex) = get_servo_host() {
        let mut guard = mutex
            .lock()
            .map_err(|e| Error::from_reason(e.to_string()))?;
        if let Some(ref mut host) = *guard {
            host.url = url.clone();
            log::info!("Servo loading URL: {}", url);
        }
    }
    Ok(())
}

#[napi]
pub fn servo_get_url() -> String {
    get_servo_host()
        .and_then(|m| m.lock().ok())
        .and_then(|guard| guard.as_ref().map(|h| h.url.clone()))
        .unwrap_or_else(|| "about:blank".to_string())
}

#[napi]
pub fn servo_evaluate_javascript(script: String) -> Result<String> {
    log::debug!(
        "Servo evaluate JS: {}",
        &script[..script.len().min(100)]
    );
    Ok(String::new())
}

#[napi]
pub fn servo_pump() {
    if let Some(mutex) = get_servo_host() {
        if let Ok(guard) = mutex.lock() {
            if let Some(ref _host) = *guard {
                // When Servo is fully integrated, this calls servo.spin_event_loop()
                // For now, this is a no-op placeholder
            }
        }
    }
}

#[napi]
pub fn servo_shutdown() {
    if let Some(mutex) = get_servo_host() {
        if let Ok(mut guard) = mutex.lock() {
            *guard = None;
        }
    }
    log::info!("Servo host shut down");
}

#[napi]
pub fn servo_set_preference(name: String, value: String) {
    log::debug!("Servo preference: {} = {}", name, value);
}

#[napi]
pub fn servo_set_user_agent(user_agent: String) {
    log::debug!("Servo user agent: {}", user_agent);
}
