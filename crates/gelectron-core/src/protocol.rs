use napi::bindgen_prelude::*;
use napi_derive::napi;

static PROTOCOL_HANDLERS: once_cell::sync::Lazy<std::sync::Mutex<Vec<String>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(Vec::new()));

#[napi]
pub fn protocol_register_file_protocol(scheme: String, _handler: JsFunction) -> Result<()> {
    let mut handlers = PROTOCOL_HANDLERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    handlers.push(format!("file:{}", scheme));
    log::info!("Registered file protocol handler for scheme: {}", scheme);
    Ok(())
}

#[napi]
pub fn protocol_register_http_protocol(scheme: String, _handler: JsFunction) -> Result<()> {
    let mut handlers = PROTOCOL_HANDLERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    handlers.push(format!("http:{}", scheme));
    log::info!("Registered HTTP protocol handler for scheme: {}", scheme);
    Ok(())
}

#[napi]
pub fn protocol_register_buffer_protocol(scheme: String, _handler: JsFunction) -> Result<()> {
    let mut handlers = PROTOCOL_HANDLERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    handlers.push(format!("buffer:{}", scheme));
    log::info!("Registered buffer protocol handler for scheme: {}", scheme);
    Ok(())
}

#[napi]
pub fn protocol_register_stream_protocol(scheme: String, _handler: JsFunction) -> Result<()> {
    let mut handlers = PROTOCOL_HANDLERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    handlers.push(format!("stream:{}", scheme));
    log::info!("Registered stream protocol handler for scheme: {}", scheme);
    Ok(())
}

#[napi]
pub fn protocol_handle(scheme: String, request_json: String) -> Result<String> {
    log::debug!(
        "Protocol handle: scheme={}, request={}",
        scheme,
        &request_json[..request_json.len().min(100)]
    );
    Ok(serde_json::json!({
        "statusCode": 200,
        "headers": {},
        "data": ""
    })
    .to_string())
}

#[napi]
pub fn protocol_unregister_protocol(scheme: String) -> Result<()> {
    let mut handlers = PROTOCOL_HANDLERS
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    handlers.retain(|h| !h.starts_with(&format!("{}:", scheme)));
    log::info!("Unregistered protocol handler for scheme: {}", scheme);
    Ok(())
}

#[napi]
pub fn protocol_is_protocol_registered(scheme: String) -> bool {
    PROTOCOL_HANDLERS
        .lock()
        .ok()
        .map(|handlers| handlers.iter().any(|h| h.starts_with(&format!("{}:", scheme))))
        .unwrap_or(false)
}
