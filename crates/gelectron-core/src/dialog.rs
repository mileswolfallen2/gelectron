use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct OpenDialogResult {
    pub canceled: bool,
    pub file_paths: Vec<String>,
}

#[napi(object)]
pub struct SaveDialogResult {
    pub canceled: bool,
    pub file_path: Option<String>,
}

#[napi(object)]
pub struct MessageBoxResult {
    pub response: i32,
    pub checkbox_checked: bool,
}

#[napi]
pub fn dialog_show_open_dialog(
    _window_id: Option<u32>,
    options_json: Option<String>,
) -> Result<OpenDialogResult> {
    let mut builder = rfd::FileDialog::new();

    if let Some(opts_json) = options_json {
        if let Ok(opts) = serde_json::from_str::<serde_json::Value>(&opts_json) {
            if let Some(title) = opts.get("title").and_then(|v| v.as_str()) {
                builder = builder.set_title(title);
            }
            if let Some(dir) = opts.get("defaultPath").and_then(|v| v.as_str()) {
                builder = builder.set_directory(dir);
            }
            if let Some(filters) = opts.get("filters").and_then(|v| v.as_array()) {
                for filter in filters {
                    let name = filter
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Files");
                    let exts: Vec<&str> = filter
                        .get("extensions")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|e| e.as_str()).collect())
                        .unwrap_or_default();
                    builder = builder.add_filter(name, &exts);
                }
            }
        }
    }

    let result = builder.pick_files();

    match result {
        Some(paths) => Ok(OpenDialogResult {
            canceled: false,
            file_paths: paths
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
        }),
        None => Ok(OpenDialogResult {
            canceled: true,
            file_paths: vec![],
        }),
    }
}

#[napi]
pub fn dialog_show_save_dialog(
    _window_id: Option<u32>,
    options_json: Option<String>,
) -> Result<SaveDialogResult> {
    let mut builder = rfd::FileDialog::new();

    if let Some(opts_json) = options_json {
        if let Ok(opts) = serde_json::from_str::<serde_json::Value>(&opts_json) {
            if let Some(title) = opts.get("title").and_then(|v| v.as_str()) {
                builder = builder.set_title(title);
            }
            if let Some(name) = opts.get("defaultPath").and_then(|v| v.as_str()) {
                if let Some(parent) = std::path::Path::new(name).parent() {
                    builder = builder.set_directory(parent);
                }
                if let Some(file_name) = std::path::Path::new(name).file_name() {
                    builder =
                        builder.set_file_name(file_name.to_string_lossy().to_string().as_str());
                }
            }
            if let Some(filters) = opts.get("filters").and_then(|v| v.as_array()) {
                for filter in filters {
                    let name = filter
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Files");
                    let exts: Vec<&str> = filter
                        .get("extensions")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|e| e.as_str()).collect())
                        .unwrap_or_default();
                    builder = builder.add_filter(name, &exts);
                }
            }
        }
    }

    let result = builder.save_file();

    match result {
        Some(path) => Ok(SaveDialogResult {
            canceled: false,
            file_path: Some(path.to_string_lossy().to_string()),
        }),
        None => Ok(SaveDialogResult {
            canceled: true,
            file_path: None,
        }),
    }
}

#[napi]
pub fn dialog_show_message_box(
    _window_id: Option<u32>,
    options_json: Option<String>,
) -> Result<MessageBoxResult> {
    let opts: serde_json::Value = options_json
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or(serde_json::Value::Null);

    let title = opts
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Gelectron");
    let message = opts
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let detail = opts.get("detail").and_then(|v| v.as_str()).unwrap_or("");

    let kind = match opts
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("info")
    {
        "error" => rfd::MessageLevel::Error,
        "warning" => rfd::MessageLevel::Warning,
        _ => rfd::MessageLevel::Info,
    };

    let description = if detail.is_empty() {
        message.to_string()
    } else {
        format!("{}\n{}", message, detail)
    };

    let builder = rfd::MessageDialog::new()
        .set_title(title)
        .set_description(&description)
        .set_level(kind)
        .set_buttons(rfd::MessageButtons::Ok);

    let result = builder.show();

    let response = match result {
        rfd::MessageDialogResult::Ok => 0,
        rfd::MessageDialogResult::Cancel => 1,
        rfd::MessageDialogResult::Yes => 0,
        rfd::MessageDialogResult::No => 1,
        rfd::MessageDialogResult::Custom(_) => 2,
    };

    Ok(MessageBoxResult {
        response,
        checkbox_checked: false,
    })
}

#[napi]
pub fn dialog_show_error_box(title: String, content: String) {
    rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&content)
        .set_level(rfd::MessageLevel::Error)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

#[napi]
pub fn dialog_show_question_box(title: String, message: String) -> Result<bool> {
    let result = rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&message)
        .set_level(rfd::MessageLevel::Info)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();

    Ok(matches!(result, rfd::MessageDialogResult::Yes))
}
