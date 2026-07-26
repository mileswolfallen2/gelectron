use napi_derive::napi;

mod app;
mod browser_window;
mod context_bridge;
mod dialog;
mod event_loop;
mod ipc;
mod menu;
mod native_image;
mod notification;
mod protocol;
mod safe_storage;
mod servo_host;
mod shell;
mod tray;
mod web_contents;

pub use app::*;
pub use browser_window::*;
pub use context_bridge::*;
pub use dialog::*;
pub use event_loop::*;
pub use ipc::*;
pub use menu::*;
pub use native_image::*;
pub use notification::*;
pub use protocol::*;
pub use safe_storage::*;
pub use servo_host::*;
pub use shell::*;
pub use tray::*;
pub use web_contents::*;

#[napi]
pub fn init() -> String {
    env_logger::init();
    log::info!("gelectron-core v{} initialized", env!("CARGO_PKG_VERSION"));
    format!("gelectron-core v{}", env!("CARGO_PKG_VERSION"))
}

#[napi]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[napi]
pub fn get_arch() -> String {
    std::env::consts::ARCH.to_string()
}
