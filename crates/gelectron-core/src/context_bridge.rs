use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Mutex, OnceLock};

struct ExposedWorld {
    key: String,
    api_json: String,
}

static EXPOSED_WORLDS: OnceLock<Mutex<Vec<ExposedWorld>>> = OnceLock::new();

fn get_exposed_worlds() -> &'static Mutex<Vec<ExposedWorld>> {
    EXPOSED_WORLDS.get_or_init(|| Mutex::new(Vec::new()))
}

#[napi]
pub fn context_bridge_expose_in_main_world(key: String, api_json: String) -> Result<()> {
    let mut worlds = get_exposed_worlds()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;

    // Remove existing entry for this key
    worlds.retain(|w| w.key != key);

    worlds.push(ExposedWorld {
        key: key.clone(),
        api_json: api_json.clone(),
    });

    log::info!("contextBridge exposed '{}' to main world", key);

    // Generate the injection script
    let script = format!(
        r#"
        if (typeof window.{key} === 'undefined') {{
            window.__gelectron_api = window.__gelectron_api || {{}};
            window.__gelectron_api['{key}'] = {api_json};
        }}
        "#,
        key = key,
        api_json = api_json,
    );

    log::debug!("Context bridge injection script generated ({} bytes)", script.len());
    Ok(())
}

#[napi]
pub fn context_bridge_get_exposed_apis() -> Result<String> {
    let worlds = get_exposed_worlds()
        .lock()
        .map_err(|e| Error::from_reason(e.to_string()))?;
    let apis: Vec<serde_json::Value> = worlds
        .iter()
        .map(|w| {
            serde_json::json!({
                "key": w.key,
                "api": serde_json::from_str::<serde_json::Value>(&w.api_json).unwrap_or(serde_json::Value::Null),
            })
        })
        .collect();
    serde_json::to_string(&apis).map_err(|e| Error::from_reason(e.to_string()))
}

#[napi]
pub fn context_bridge_generate_injection_script() -> String {
    let worlds = get_exposed_worlds().lock().unwrap();

    let mut script = String::from("(function() {\n");
    script.push_str("  if (typeof window.__gelectron_api === 'undefined') {\n");
    script.push_str("    window.__gelectron_api = {};\n");
    script.push_str("  }\n");

    for world in worlds.iter() {
        script.push_str(&format!(
            "  window.__gelectron_api['{}'] = {};\n",
            world.key, world.api_json
        ));
    }

    script.push_str("})();\n");
    script
}
