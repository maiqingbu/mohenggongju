mod crypto;
mod proxy_fetch;

use crypto::{keychain_set, keychain_get, keychain_delete};
use proxy_fetch::{proxy_abort_stream, proxy_fetch, proxy_fetch_stream, AbortFlags, HttpClient};
use tauri::Emitter;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(HttpClient::new())
        .manage(AbortFlags::new())
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete,
            proxy_fetch,
            proxy_fetch_stream,
            proxy_abort_stream,
        ])
        // R12: 关闭前通知前端（不阻止关闭，前端仅做提示）
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let label = window.label().to_string();
                let _ = window.emit("check-pending-close", label);
            }
        })
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
