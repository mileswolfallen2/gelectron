//! Shared clipboard operations used by both the async bridge commands and the
//! synchronous FIFO IPC channel.
//!
//! The Electron clipboard API is synchronous, but the stdin/stdout bridge is
//! async. To satisfy sync reads we also expose a length-prefixed request/response
//! channel over two Unix FIFOs (`GELECTRON_SYNC_REQ` / `GELECTRON_SYNC_RES`),
//! driven by a background thread that dispatches to the same functions here.
//!
//! Image bytes are RGBA in and out (arboard's `ImageData`), and PNG encoding is
//! done here so both bridge paths stay consistent.

use serde_json::json;

pub fn read_text() -> String {
    arboard::Clipboard::new()
        .and_then(|mut c| c.get_text())
        .unwrap_or_default()
}

pub fn write_text(text: &str) {
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.set_text(text);
    }
}

pub fn read_html() -> String {
    arboard::Clipboard::new()
        .and_then(|mut c| c.get().html())
        .unwrap_or_default()
}

pub fn write_html(html: &str, alt_text: Option<&str>) {
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.set().html(html.to_string(), alt_text.map(|s| s.to_string()));
    }
}

pub fn read_rtf() -> String {
    platform::read_rtf()
}

pub fn write_rtf(text: &str) {
    platform::write_rtf(text)
}

pub fn read_bookmark() -> (String, String) {
    platform::read_bookmark()
}

pub fn write_bookmark(title: &str, url: &str) {
    platform::write_bookmark(title, url)
}

pub fn read_find_text() -> String {
    platform::read_find_text()
}

pub fn write_find_text(text: &str) {
    platform::write_find_text(text)
}

pub fn clear() {
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.clear();
    }
}

/// Returns the clipboard image as a base64-encoded PNG, or an empty string.
pub fn read_image() -> String {
    match arboard::Clipboard::new().and_then(|mut c| c.get_image()) {
        Ok(img) => {
            let mut buf = std::io::Cursor::new(Vec::new());
            {
                let mut encoder = png::Encoder::new(&mut buf, img.width as u32, img.height as u32);
                encoder.set_color(png::ColorType::Rgba);
                encoder.set_depth(png::BitDepth::Eight);
                if let Ok(mut writer) = encoder.write_header() {
                    if writer.write_image_data(&img.bytes).is_err() {
                        return String::new();
                    }
                }
            }
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(buf.into_inner())
        }
        Err(_) => String::new(),
    }
}

/// Writes a base64-encoded PNG to the clipboard. The image is decoded to RGBA
/// (normalizing palette/gray/16-bit variants) before being handed to arboard.
pub fn write_image(data_b64: &str) {
    use base64::Engine;
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data_b64) else {
        return;
    };
    let cursor = std::io::Cursor::new(&bytes[..]);
    let mut decoder = png::Decoder::new(cursor);
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let Ok(mut reader) = decoder.read_info() else {
        return;
    };
    let mut buf = vec![0; reader.output_buffer_size().unwrap_or(0)];
    let Ok(info) = reader.next_frame(&mut buf) else {
        return;
    };
    let (w, h) = (info.width, info.height);
    let rgba = match info.color_type {
        png::ColorType::Rgba => buf[..(w as usize * h as usize * 4)].to_vec(),
        png::ColorType::Rgb => {
            let mut out = Vec::with_capacity(w as usize * h as usize * 4);
            for px in buf[..(w as usize * h as usize * 3)].chunks_exact(3) {
                out.extend_from_slice(&[px[0], px[1], px[2], 255]);
            }
            out
        }
        png::ColorType::Grayscale => {
            let mut out = Vec::with_capacity(w as usize * h as usize * 4);
            for &g in buf.iter().take(w as usize * h as usize) {
                out.extend_from_slice(&[g, g, g, 255]);
            }
            out
        }
        png::ColorType::GrayscaleAlpha => {
            let mut out = Vec::with_capacity(w as usize * h as usize * 4);
            for px in buf[..(w as usize * h as usize * 2)].chunks_exact(2) {
                out.extend_from_slice(&[px[0], px[0], px[0], px[1]]);
            }
            out
        }
        _ => return,
    };
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.set_image(arboard::ImageData {
            width: w as usize,
            height: h as usize,
            bytes: rgba.into(),
        });
    }
}

pub fn available_formats() -> Vec<String> {
    platform::available_formats()
}

pub fn has(format: &str) -> bool {
    platform::has(format)
}

// ---------------------------------------------------------------------------
// Platform-specific pieces (macOS uses NSPasteboard for RTF / bookmarks /
// find text / format probing; other platforms fall back to arboard probes).
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod platform {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::NSString;

    // NSPasteboardType / NSPasteboardName values as plain strings. We build
    // NSStrings on demand instead of referencing the (unsafe) objc2 extern
    // statics that expose the same constants.
    const TYPE_STRING: &str = "public.utf8-plain-text";
    const TYPE_RTF: &str = "public.rtf";
    const TYPE_URL: &str = "public.url";
    const TYPE_FILE_URL: &str = "public.file-url";
    const TYPE_URL_NAME: &str = "public.url-name";
    const NAME_FIND: &str = "com.apple.find-panel";

    pub fn read_rtf() -> String {
        autoreleasepool(|_| {
            let type_rtf = NSString::from_str(TYPE_RTF);
            NSPasteboard::generalPasteboard()
                .dataForType(&type_rtf)
                .map(|d| unsafe {
                    let bytes = d.as_bytes_unchecked();
                    String::from_utf8_lossy(bytes).to_string()
                })
                .unwrap_or_default()
        })
    }

    pub fn write_rtf(text: &str) {
        autoreleasepool(|_| {
            let pb = NSPasteboard::generalPasteboard();
            let type_rtf = NSString::from_str(TYPE_RTF);
            let _ = pb.setString_forType(&NSString::from_str(text), &type_rtf);
        });
    }

    pub fn read_bookmark() -> (String, String) {
        autoreleasepool(|_| {
            let pb = NSPasteboard::generalPasteboard();
            let type_url = NSString::from_str(TYPE_URL);
            let type_file_url = NSString::from_str(TYPE_FILE_URL);
            let url = pb
                .stringForType(&type_url)
                .or_else(|| pb.stringForType(&type_file_url))
                .map(|s| s.to_string())
                .unwrap_or_default();
            let type_url_name = NSString::from_str(TYPE_URL_NAME);
            let title = pb
                .stringForType(&type_url_name)
                .map(|s| s.to_string())
                .unwrap_or_default();
            (title, url)
        })
    }

    pub fn write_bookmark(title: &str, url: &str) {
        autoreleasepool(|_| {
            let pb = NSPasteboard::generalPasteboard();
            let _ = pb.clearContents();
            let url_ns = NSString::from_str(url);
            let type_string = NSString::from_str(TYPE_STRING);
            let _ = pb.setString_forType(&url_ns, &type_string);
            let type_url = NSString::from_str(TYPE_URL);
            let _ = pb.setString_forType(&url_ns, &type_url);
            if url.starts_with("file://") {
                let type_file_url = NSString::from_str(TYPE_FILE_URL);
                let _ = pb.setString_forType(&url_ns, &type_file_url);
            }
            let type_url_name = NSString::from_str(TYPE_URL_NAME);
            let _ = pb.setString_forType(&NSString::from_str(title), &type_url_name);
        });
    }

    pub fn read_find_text() -> String {
        autoreleasepool(|_| {
            let name_find = NSString::from_str(NAME_FIND);
            let type_string = NSString::from_str(TYPE_STRING);
            NSPasteboard::pasteboardWithName(&name_find)
                .stringForType(&type_string)
                .map(|s| s.to_string())
                .unwrap_or_default()
        })
    }

    pub fn write_find_text(text: &str) {
        autoreleasepool(|_| {
            let name_find = NSString::from_str(NAME_FIND);
            let pb = NSPasteboard::pasteboardWithName(&name_find);
            let _ = pb.clearContents();
            let type_string = NSString::from_str(TYPE_STRING);
            let _ = pb.setString_forType(&NSString::from_str(text), &type_string);
        });
    }

    pub fn available_formats() -> Vec<String> {
        autoreleasepool(|_| {
            let pb = NSPasteboard::generalPasteboard();
            let mut out = Vec::new();
            if let Some(types) = pb.types() {
                for t in types.to_vec() {
                    if let Some(mime) = mime_for_pb_type(&t.to_string()) {
                        if !out.contains(&mime.to_string()) {
                            out.push(mime.to_string());
                        }
                    }
                }
            }
            out.sort();
            out
        })
    }

    pub fn has(format: &str) -> bool {
        autoreleasepool(|_| {
            let pb = NSPasteboard::generalPasteboard();
            let fmt = format.to_ascii_lowercase();
            if let Some(types) = pb.types() {
                for t in types.to_vec() {
                    let ts = t.to_string();
                    if ts.eq_ignore_ascii_case(&fmt) {
                        return true;
                    }
                    if let Some(mime) = mime_for_pb_type(&ts) {
                        if mime == fmt {
                            return true;
                        }
                    }
                }
            }
            false
        })
    }

    fn mime_for_pb_type(t: &str) -> Option<&'static str> {
        match t {
            "public.utf8-plain-text" | "public.plain-text" | "public.text" => Some("text/plain"),
            "public.html" => Some("text/html"),
            "public.rtf" => Some("text/rtf"),
            "public.png" => Some("image/png"),
            "public.tiff" => Some("image/tiff"),
            "public.url" | "public.file-url" => Some("text/uri-list"),
            _ => None,
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::*;

    pub fn read_rtf() -> String {
        String::new()
    }

    pub fn write_rtf(_text: &str) {}

    pub fn read_bookmark() -> (String, String) {
        let mut title = String::new();
        let mut url = String::new();
        if let Ok(mut c) = arboard::Clipboard::new() {
            if let Ok(files) = c.get().file_list() {
                if let Some(p) = files.first() {
                    url = p.display().to_string();
                    title = p
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                }
            }
        }
        (title, url)
    }

    pub fn write_bookmark(_title: &str, url: &str) {
        if let Ok(mut c) = arboard::Clipboard::new() {
            let _ = c.set().file_list(&[std::path::Path::new(url)]);
        }
    }

    pub fn read_find_text() -> String {
        String::new()
    }

    pub fn write_find_text(_text: &str) {}

    pub fn available_formats() -> Vec<String> {
        let mut out = Vec::new();
        if let Ok(mut c) = arboard::Clipboard::new() {
            if c.get_text().map(|s| !s.is_empty()).unwrap_or(false) {
                out.push("text/plain".to_string());
            }
            if c.get().html().map(|s| !s.is_empty()).unwrap_or(false) {
                out.push("text/html".to_string());
            }
            if c.get().file_list().map(|v| !v.is_empty()).unwrap_or(false) {
                out.push("text/uri-list".to_string());
            }
        }
        out
    }

    pub fn has(format: &str) -> bool {
        match format.to_ascii_lowercase().as_str() {
            "text/plain" => read_text() != "",
            "text/html" => read_html() != "",
            "text/uri-list" => available_formats().iter().any(|f| f == "text/uri-list"),
            _ => false,
        }
    }
}

// ---------------------------------------------------------------------------
// Synchronous IPC over Unix FIFOs.
// ---------------------------------------------------------------------------

#[cfg(unix)]
pub fn setup_sync_ipc() -> Option<(String, String)> {
    use std::os::unix::fs::FileTypeExt;

    sweep_stale_sync_dirs();

    let dir = std::env::temp_dir().join(format!("gelectron-sync-{}", std::process::id()));
    if std::fs::create_dir_all(&dir).is_err() {
        return None;
    }
    let req = dir.join("req.fifo");
    let res = dir.join("res.fifo");

    for p in [&req, &res] {
        if p.exists() {
            let is_fifo = p
                .metadata()
                .map(|m| m.file_type().is_fifo())
                .unwrap_or(false);
            if !is_fifo {
                return None;
            }
            let _ = std::fs::remove_file(p);
        }
        let cpath = std::ffi::CString::new(p.to_string_lossy().as_bytes()).ok()?;
        let rc = unsafe { libc::mkfifo(cpath.as_ptr(), 0o600) };
        if rc != 0 {
            return None;
        }
    }

    spawn_sync_thread(&req, &res);
    Some((
        req.to_string_lossy().to_string(),
        res.to_string_lossy().to_string(),
    ))
}

#[cfg(unix)]
fn sweep_stale_sync_dirs() {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Some(pid_str) = name.strip_prefix("gelectron-sync-") else {
            continue;
        };
        let Ok(pid) = pid_str.parse::<i32>() else {
            continue;
        };
        if pid == std::process::id() as i32 {
            continue;
        }
        let alive = unsafe {
            libc::kill(pid, 0) == 0
                || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
        };
        if !alive {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(unix)]
fn spawn_sync_thread(req_path: &std::path::Path, res_path: &std::path::Path) {
    let req_path = req_path.to_path_buf();
    let res_path = res_path.to_path_buf();
    std::thread::spawn(move || {
        // Opening a FIFO with O_RDWR never blocks, and keeps a writer alive so
        // our own writes can never block either. Reads block until a frame
        // arrives.
        let open = |p: &std::path::Path| {
            std::fs::OpenOptions::new().read(true).write(true).open(p)
        };
        let Ok(mut req) = open(&req_path) else { return };
        let Ok(mut res) = open(&res_path) else { return };

        loop {
            let frame = match read_frame(&mut req) {
                Ok(f) => f,
                Err(_) => break,
            };
            let response = handle_sync_request(&frame);
            if write_frame(&mut res, &response).is_err() {
                break;
            }
        }
    });
}

#[cfg(unix)]
fn read_frame(f: &mut impl std::io::Read) -> std::io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    f.read_exact(&mut len_buf)?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 64 * 1024 * 1024 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "sync frame too large",
        ));
    }
    let mut buf = vec![0u8; len];
    f.read_exact(&mut buf)?;
    Ok(buf)
}

#[cfg(unix)]
fn write_frame(f: &mut impl std::io::Write, data: &[u8]) -> std::io::Result<()> {
    f.write_all(&(data.len() as u32).to_le_bytes())?;
    f.write_all(data)?;
    f.flush()
}

#[cfg(unix)]
fn handle_sync_request(frame: &[u8]) -> Vec<u8> {
    let request: serde_json::Value = serde_json::from_slice(frame).unwrap_or_default();
    let op = request.get("op").and_then(|v| v.as_str()).unwrap_or("");
    let result: Result<serde_json::Value, String> = match op {
        "read-text" => Ok(json!(read_text())),
        "write-text" => {
            let text = request.get("text").and_then(|v| v.as_str()).unwrap_or("");
            write_text(text);
            Ok(json!({}))
        }
        "read-html" => Ok(json!(read_html())),
        "write-html" => {
            let html = request.get("html").and_then(|v| v.as_str()).unwrap_or("");
            let alt = request.get("alt").and_then(|v| v.as_str());
            write_html(html, alt);
            Ok(json!({}))
        }
        "read-rtf" => Ok(json!(read_rtf())),
        "write-rtf" => {
            let text = request.get("text").and_then(|v| v.as_str()).unwrap_or("");
            write_rtf(text);
            Ok(json!({}))
        }
        "read-bookmark" => {
            let (title, url) = read_bookmark();
            Ok(json!({ "title": title, "url": url }))
        }
        "write-bookmark" => {
            let title = request.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let url = request.get("url").and_then(|v| v.as_str()).unwrap_or("");
            write_bookmark(title, url);
            Ok(json!({}))
        }
        "read-find-text" => Ok(json!(read_find_text())),
        "write-find-text" => {
            let text = request.get("text").and_then(|v| v.as_str()).unwrap_or("");
            write_find_text(text);
            Ok(json!({}))
        }
        "clear" => {
            clear();
            Ok(json!({}))
        }
        "read-image" => Ok(json!(read_image())),
        "write-image" => {
            let data = request.get("data").and_then(|v| v.as_str()).unwrap_or("");
            write_image(data);
            Ok(json!({}))
        }
        "available-formats" => Ok(json!(available_formats())),
        "has" => {
            let format = request.get("format").and_then(|v| v.as_str()).unwrap_or("");
            Ok(json!(has(format)))
        }
        other => Err(format!("unknown clipboard op: {}", other)),
    };

    match result {
        Ok(result) => serde_json::to_vec(&json!({ "ok": true, "result": result })).unwrap_or_default(),
        Err(error) => serde_json::to_vec(&json!({ "ok": false, "error": error })).unwrap_or_default(),
    }
}
