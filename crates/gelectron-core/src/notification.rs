use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct NotificationOptions {
    pub title: Option<String>,
    pub body: Option<String>,
    pub subtitle: Option<String>,
    pub silent: Option<bool>,
    pub icon: Option<String>,
    pub urgency: Option<String>,
    pub timeout_type: Option<String>,
    pub close_button_text: Option<String>,
    pub toast_xml: Option<String>,
    #[serde(default)]
    pub actions: Vec<serde_json::Value>,
    #[serde(default)]
    pub sound: Option<String>,
}

#[napi(object)]
pub struct NotificationInfo {
    pub id: String,
    pub title: String,
    pub body: String,
}

static NOTIFICATION_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);

#[napi]
pub fn notification_create(options_json: String) -> Result<String> {
    let opts: NotificationOptions =
        serde_json::from_str(&options_json).map_err(|e| Error::from_reason(e.to_string()))?;

    let id = format!(
        "notification-{}",
        NOTIFICATION_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    );
    let title = opts.title.unwrap_or_default();
    let body = opts.body.unwrap_or_default();

    let mut notification = notify_rust::Notification::new();
    notification.summary(&title).body(&body);

    if let Some(sub) = &opts.subtitle {
        notification.subtitle(sub);
    }
    if let Some(sound) = &opts.sound {
        notification.sound_name(sound);
    }
    if opts.silent.unwrap_or(false) {
        notification.sound_name("");
    }
    if let Some(path) = &opts.icon {
        if std::path::Path::new(path).exists() {
            notification.image_path(path);
        }
    }
    if let Some(timeout) = &opts.timeout_type {
        match timeout.as_str() {
            "never" => {
                notification.timeout(notify_rust::Timeout::Never);
            }
            other => {
                if let Ok(ms) = other.parse::<i32>() {
                    notification.timeout(ms);
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(urgency) = &opts.urgency {
        let u = match urgency.as_str() {
            "low" => notify_rust::Urgency::Low,
            "critical" => notify_rust::Urgency::Critical,
            _ => notify_rust::Urgency::Normal,
        };
        notification.urgency(u);
    }
    for (i, action) in opts.actions.iter().enumerate() {
        if let Some(text) = action.get("text").and_then(|v| v.as_str()) {
            notification.action(&i.to_string(), text);
        }
    }

    match notification.show() {
        Ok(handle) => {
            let nid = id.clone();
            std::thread::spawn(move || {
                let _ = handle.wait_for_response(|_response: &notify_rust::NotificationResponse| {
                    log::info!("Notification {} responded", nid);
                });
            });
            log::info!("Notification '{}' shown", title);
        }
        Err(e) => {
            log::error!("Failed to show notification: {}", e);
        }
    }

    Ok(id)
}

#[napi]
pub fn notification_close(notification_id: String) -> Result<()> {
    log::info!("Notification {} closed", notification_id);
    Ok(())
}

#[napi]
pub fn notification_is_supported() -> bool {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Linux requires a notification daemon on D-Bus; probe for one.
        return notify_rust::get_capabilities().is_ok();
    }
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        true
    }
}
