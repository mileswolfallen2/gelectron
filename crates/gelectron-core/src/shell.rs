use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn shell_open_external(url: String) -> Result<bool> {
    match open::that(&url) {
        Ok(_) => {
            log::info!("Shell opened external URL: {}", url);
            Ok(true)
        }
        Err(e) => {
            log::error!("Shell failed to open URL {}: {}", url, e);
            Ok(false)
        }
    }
}

#[napi]
pub fn shell_open_path(path: String) -> Result<String> {
    match open::that(&path) {
        Ok(_) => {
            log::info!("Shell opened path: {}", path);
            Ok(String::new())
        }
        Err(e) => {
            log::error!("Shell failed to open path {}: {}", path, e);
            Ok(e.to_string())
        }
    }
}

#[napi]
pub fn shell_show_item_in_folder(path: String) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .args(["-R", &path])
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = open::that(parent);
        }
    }
    Ok(())
}

#[napi]
pub fn shell_move_item_to_trash(path: String) -> Result<()> {
    let _ = std::fs::remove_file(&path);
    log::info!("Shell moved to trash: {}", path);
    Ok(())
}

#[napi]
pub fn shell_get_app_path(app_name: String) -> Result<String> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("mdfind")
            .args([
                "kMDItemKind == 'Application'",
                "-onlyin",
                "/Applications",
                &app_name,
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if let Some(first_line) = stdout.lines().next() {
                return Ok(first_line.to_string());
            }
        }
    }
    Ok(String::new())
}

#[napi]
pub fn shell_create_desktop_shortcut() -> Result<()> {
    log::debug!("Shell create desktop shortcut");
    Ok(())
}

#[napi]
pub fn shell_browse_for_directory(options_json: Option<String>) -> Result<Option<String>> {
    let mut builder = rfd::FileDialog::new();
    if let Some(opts) = options_json {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&opts) {
            if let Some(title) = v.get("title").and_then(|t| t.as_str()) {
                builder = builder.set_title(title);
            }
            if let Some(dir) = v.get("defaultPath").and_then(|d| d.as_str()) {
                builder = builder.set_directory(dir);
            }
        }
    }
    Ok(builder.pick_folder().map(|p| p.to_string_lossy().to_string()))
}
