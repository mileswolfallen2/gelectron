use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

static EVENT_BRIDGE: OnceLock<Arc<EventLoopBridge>> = OnceLock::new();

use std::sync::Arc;

pub struct EventLoopBridge {
    pub app_events: Mutex<HashMap<String, Vec<ThreadsafeFunction<String, ErrorStrategy::Fatal>>>>,
}

impl EventLoopBridge {
    pub fn new() -> Self {
        Self {
            app_events: Mutex::new(HashMap::new()),
        }
    }
}

pub fn get_event_bridge() -> Arc<EventLoopBridge> {
    EVENT_BRIDGE
        .get_or_init(|| Arc::new(EventLoopBridge::new()))
        .clone()
}

pub fn register_app_event(event_name: &str, callback: JsFunction) -> Result<()> {
    let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
        .create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            let value = ctx.value.clone();
            Ok(vec![ctx.env.create_string_from_std(value)?])
        })?;

    let bridge = get_event_bridge();
    let mut events = bridge
        .app_events
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    events
        .entry(event_name.to_string())
        .or_insert_with(Vec::new)
        .push(tsfn);
    Ok(())
}

pub fn emit_app_event(event_name: &str, args_json: Option<String>) {
    let bridge = get_event_bridge();
    let events = bridge.app_events.lock().unwrap();
    if let Some(callbacks) = events.get(event_name) {
        let data = args_json.unwrap_or_else(|| "null".to_string());
        for cb in callbacks {
            cb.call(data.clone(), ThreadsafeFunctionCallMode::NonBlocking);
        }
    }
}

#[napi]
pub fn event_loop_pump() {
    // Called from Node.js event loop via setImmediate
    // Pumps Servo's event loop if active
}

#[napi]
pub fn event_loop_wake() {
    // Wake the event loop (called from background threads)
}

#[napi]
pub fn event_loop_set_interval(callback: JsFunction, interval_ms: u32) -> Result<i64> {
    let tsfn: ThreadsafeFunction<String, ErrorStrategy::Fatal> = callback
        .create_threadsafe_function(0, |ctx: napi::threadsafe_function::ThreadSafeCallContext<String>| {
            let value = ctx.value.clone();
            Ok(vec![ctx.env.create_string_from_std(value)?])
        })?;

    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let interval = std::time::Duration::from_millis(interval_ms as u64);

    std::thread::spawn(move || loop {
        std::thread::sleep(interval);
        tsfn.call("tick".to_string(), ThreadsafeFunctionCallMode::NonBlocking);
    });

    Ok(id)
}
