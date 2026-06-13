use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command as StdCommand, Stdio};
use std::sync::Mutex;
use tauri::{Manager, WindowEvent};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Holds the running backend child so we can kill it when the window closes.
struct BackendProcess(Mutex<Option<Child>>);

/// Append a line to the sidecar log so backend-launch problems on a customer
/// machine are diagnosable.
fn log_line(path: &PathBuf, msg: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{msg}");
    }
}

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
            let log_path = data_dir.join("sidecar.log");
            let _ = std::fs::write(&log_path, b"=== ChefOS sidecar log ===\n");

            // The backend is a PyInstaller ONE-FOLDER build bundled as a Tauri
            // resource (backend-dist/chefos-backend/). One-folder doesn't unpack
            // to a temp dir on launch (which antivirus was blocking on the
            // customer machine) — it starts straight from the installed folder.
            let exe = app
                .path()
                .resource_dir()
                .map(|r| r.join("backend-dist").join("chefos-backend").join("chefos-backend.exe"))
                .unwrap_or_default();
            log_line(&log_path, &format!("[tauri] backend exe: {}", exe.display()));
            log_line(&log_path, &format!("[tauri] exe exists: {}", exe.exists()));

            let mut cmd = StdCommand::new(&exe);
            cmd.env("CHEFOS_LOCAL", "1")
                .env("CHEFOS_DB_PATH", db_path.to_string_lossy().to_string())
                // Bind to all interfaces so phones on the same WiFi can reach it.
                // Non-local access is refused unless Mobile Access is enabled.
                .env("CHEFOS_HOST", "0.0.0.0")
                .env("CHEFOS_PORT", "8000")
                .env("CHEFOS_LICENSE_URL", option_env!("CHEFOS_LICENSE_URL").unwrap_or(""))
                .env("CHEFOS_GOOGLE_CLIENT_ID", option_env!("CHEFOS_GOOGLE_CLIENT_ID").unwrap_or(""))
                .env("CHEFOS_GOOGLE_CLIENT_SECRET", option_env!("CHEFOS_GOOGLE_CLIENT_SECRET").unwrap_or(""));
            if let Some(dir) = exe.parent() {
                cmd.current_dir(dir);
            }
            // Send the backend's stdout/stderr to the log so any crash is captured.
            if let Ok(f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
                if let Ok(f2) = f.try_clone() {
                    cmd.stdout(Stdio::from(f)).stderr(Stdio::from(f2));
                }
            }
            // Don't flash a console window.
            #[cfg(windows)]
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

            match cmd.spawn() {
                Ok(child) => {
                    log_line(&log_path, "[tauri] backend process started (one-folder)");
                    app.state::<BackendProcess>().0.lock().unwrap().replace(child);
                }
                Err(e) => {
                    // Don't crash the window — the UI shows a clear 'couldn't start'
                    // screen and points the chef at this log file.
                    log_line(&log_path, &format!("[tauri] FAILED to start backend: {e}"));
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // When the chef closes the window, shut the backend down cleanly.
            if let WindowEvent::Destroyed = event {
                if let Some(mut child) = window
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
