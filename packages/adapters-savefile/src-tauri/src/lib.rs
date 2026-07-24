use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

/// Resolve a caller-supplied relative path against the app's `AppData`
/// directory, rejecting `..` components so this plugin can only ever touch
/// files inside that directory.
fn resolve_path<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<PathBuf, String> {
    if Path::new(path).components().any(|c| c == Component::ParentDir) {
        return Err(format!("path must not contain '..': {path}"));
    }
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join(path))
}

/// Each command below is one `std::fs` call. Splitting write/sync/rename
/// into separate commands (rather than one "do everything" command) is
/// intentional: `core`'s `commitSlot` orchestrates the exact call order
/// from the TypeScript side, and its crash-safety tests fault-inject at
/// each individual call boundary — see
/// `docs/superpowers/specs/2026-07-24-save-hardening-design.md` §5.
///
/// Calling `sync_all()` on a *freshly opened* handle still flushes data an
/// earlier `write()` call handed to the OS — fsync operates on the file's
/// dirty pages, not on the handle that dirtied them — so `savefile_write`
/// and `savefile_sync` being two separate opens is correct, not just
/// convenient.
#[tauri::command]
async fn savefile_write<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    bytes_base64: String,
) -> Result<(), String> {
    let full = resolve_path(&app, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = STANDARD.decode(&bytes_base64).map_err(|e| e.to_string())?;
    fs::write(&full, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn savefile_sync<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let full = resolve_path(&app, &path)?;
    let file = fs::File::open(&full).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())
}

#[tauri::command]
async fn savefile_rename<R: Runtime>(
    app: AppHandle<R>,
    from: String,
    to: String,
) -> Result<(), String> {
    let full_from = resolve_path(&app, &from)?;
    let full_to = resolve_path(&app, &to)?;
    fs::rename(&full_from, &full_to).map_err(|e| e.to_string())?;
    sync_parent_dir(&full_to);
    Ok(())
}

/// POSIX needs the containing directory fsynced too, or the rename's
/// directory-entry update can survive a process kill but not a real power
/// loss. Best-effort: a failure here isn't reported, since the rename
/// itself (the operation that matters for `current` never being a partial
/// file) already succeeded.
#[cfg(unix)]
fn sync_parent_dir(path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(dir) = fs::File::open(parent) {
            let _ = dir.sync_all();
        }
    }
}

/// NTFS durability for metadata/directory-entry updates is handled by its
/// own journal; there is no directory-fsync equivalent to call here.
#[cfg(not(unix))]
fn sync_parent_dir(_path: &Path) {}

#[tauri::command]
async fn savefile_read<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Option<String>, String> {
    let full = resolve_path(&app, &path)?;
    match fs::read(&full) {
        Ok(bytes) => Ok(Some(STANDARD.encode(bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn savefile_delete<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let full = resolve_path(&app, &path)?;
    match fs::remove_file(&full) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn savefile_exists<R: Runtime>(app: AppHandle<R>, path: String) -> Result<bool, String> {
    let full = resolve_path(&app, &path)?;
    Ok(full.exists())
}

/// Register the `overworld-savefile` Tauri plugin: six generic file
/// primitives (write/sync/rename/read/delete/exists) under
/// `plugin:overworld-savefile|<command>`. No setup state — every command is
/// a stateless `std::fs` call resolved against `AppData`.
///
/// The runtime namespace passed to `Builder::new` MUST match this crate's
/// Cargo package name (`overworld-savefile`) — Tauri derives the ACL
/// capability identifier from the package name, and a mismatch here
/// silently denies every command at runtime (see the fix in
/// `adapters-steam`, commit `5570047`).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("overworld-savefile")
        .invoke_handler(tauri::generate_handler![
            savefile_write,
            savefile_sync,
            savefile_rename,
            savefile_read,
            savefile_delete,
            savefile_exists,
        ])
        .build()
}
