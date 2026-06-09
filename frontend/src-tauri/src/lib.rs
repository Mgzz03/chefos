use std::sync::Mutex;
use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Holds the running backend child so we can kill it when the window closes.
struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            // The database lives in AppData/Roaming/ChefOS so it survives
            // app updates and uninstalls.
            let data_dir = app
                .path()
                .data_dir()
                .expect("could not resolve data dir")
                .join("ChefOS");
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = data_dir.join("chefos.db");

            // Start the bundled FastAPI backend silently in the background.
            let sidecar = app
                .shell()
                .sidecar("chefos-backend")
                .expect("chefos-backend sidecar is missing — run build_sidecar.py first")
                .env("CHEFOS_LOCAL", "1")
                .env("CHEFOS_DB_PATH", db_path.to_string_lossy().to_string())
                // Bind to all interfaces so phones on the same WiFi can reach it.
                // Access from non-local IPs is refused unless the chef enables
                // Mobile Access in Settings (enforced in the backend).
                .env("CHEFOS_HOST", "0.0.0.0")
                .env("CHEFOS_PORT", "8000")
                // License server URL, baked in at build time:
                //   set CHEFOS_LICENSE_URL=https://chefos-license.<you>.workers.dev
                // before `npm run tauri build`.
                .env("CHEFOS_LICENSE_URL", option_env!("CHEFOS_LICENSE_URL").unwrap_or(""))
                // Google Drive OAuth client (baked at build time), for cloud backup:
                .env("CHEFOS_GOOGLE_CLIENT_ID", option_env!("CHEFOS_GOOGLE_CLIENT_ID").unwrap_or(""))
                .env("CHEFOS_GOOGLE_CLIENT_SECRET", option_env!("CHEFOS_GOOGLE_CLIENT_SECRET").unwrap_or(""));

            let (mut rx, child) = sidecar.spawn().expect("failed to start ChefOS backend");

            app.state::<BackendProcess>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            // Drain the backend's output so its pipe never blocks; also useful for logs.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            print!("[backend] {line}");
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // When the chef closes the window, shut the backend down cleanly.
            if let WindowEvent::Destroyed = event {
                if let Some(child) = window
                    .app_handle()
                    .state::<BackendProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running ChefOS");
}
