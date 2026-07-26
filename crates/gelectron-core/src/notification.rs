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

    if let Some(true) = opts.silent {
        notification.sound_name("");
    }

    match notification.show() {
        Ok(_) => {
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
    true
}
