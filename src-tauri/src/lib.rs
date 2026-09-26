use std::{
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tauri::Manager;

const RECOVERY_FILENAMES: [&str; 2] = ["recovery-a.json", "recovery-b.json"];

fn recovery_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("recovery"))
        .map_err(|error| error.to_string())
}

fn modified_at(path: &Path) -> SystemTime {
    path.metadata()
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

#[tauri::command]
fn load_recovery_snapshots(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let directory = recovery_directory(&app)?;
    let snapshots = RECOVERY_FILENAMES
        .iter()
        .filter_map(|filename| fs::read_to_string(directory.join(filename)).ok())
        .collect();
    Ok(snapshots)
}

#[tauri::command]
fn save_recovery_snapshot(app: tauri::AppHandle, snapshot: String) -> Result<(), String> {
    let directory = recovery_directory(&app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let first = directory.join(RECOVERY_FILENAMES[0]);
    let second = directory.join(RECOVERY_FILENAMES[1]);
    let target = if !first.exists() {
        first
    } else if !second.exists() || modified_at(&second) < modified_at(&first) {
        second
    } else {
        first
    };
    let temporary = directory.join("recovery-next.tmp");

    let mut file = File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(snapshot.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;

    #[cfg(target_os = "windows")]
    if target.exists() {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }

    fs::rename(&temporary, &target).map_err(|error| error.to_string())?;

    #[cfg(unix)]
    File::open(&directory)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn clear_recovery_snapshots(app: tauri::AppHandle) -> Result<(), String> {
    let directory = recovery_directory(&app)?;
    for filename in RECOVERY_FILENAMES {
        let path = directory.join(filename);
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_recovery_snapshots,
            save_recovery_snapshot,
            clear_recovery_snapshots
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
