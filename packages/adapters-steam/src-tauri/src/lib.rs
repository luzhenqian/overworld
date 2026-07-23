use std::io::{Read, Write};
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::Duration;

use steamworks::Client;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

/// Everything the command layer can ask the dedicated Steam thread to do.
/// One variant per Tauri command; each carries a `tokio::sync::oneshot`
/// reply channel so the (async) command handler can `.await` the result
/// without blocking the Steam thread itself, which stays fully synchronous.
enum SteamCommand {
    IsAvailable(tokio::sync::oneshot::Sender<bool>),
    UnlockAchievement(String, tokio::sync::oneshot::Sender<()>),
    ClearAchievement(String, tokio::sync::oneshot::Sender<()>),
    SetStat(String, f32, tokio::sync::oneshot::Sender<()>),
    CloudRead(String, tokio::sync::oneshot::Sender<Option<String>>),
    CloudWrite(String, String, tokio::sync::oneshot::Sender<()>),
    CloudDelete(String, tokio::sync::oneshot::Sender<()>),
    CloudList(tokio::sync::oneshot::Sender<Vec<String>>),
    SetRichPresence(String, String, tokio::sync::oneshot::Sender<()>),
    ClearRichPresence(tokio::sync::oneshot::Sender<()>),
}

/// Tauri-managed state. Cloning just clones the channel sender (`mpsc::Sender`
/// is `Send + Sync` since Rust 1.72, well under this crate's MSRV).
#[derive(Clone)]
struct SteamHandle {
    tx: Sender<SteamCommand>,
}

/// Steamworks calls must all happen on the thread that initialized the SDK
/// (the Steam API is not thread-safe). This spawns one dedicated OS thread
/// that owns the `Client` for the plugin's whole lifetime, drains
/// `SteamCommand`s from `rx`, and pumps `run_callbacks()` on every loop
/// tick — including on timeout, so callbacks keep flowing even when no
/// command is queued (Steam expects this roughly once per frame).
///
/// `Client::init()` reads the App ID from `steam_appid.txt` next to the
/// binary (or from Steam's own launch handshake in production) — see the
/// package README for local-dev setup. If it fails (not running under
/// Steam), `client` stays `None` for the thread's whole lifetime and every
/// command below replies with its "unavailable" default instead of
/// touching a nonexistent client.
fn spawn_steam_thread() -> Sender<SteamCommand> {
    let (tx, rx) = mpsc::channel::<SteamCommand>();
    thread::spawn(move || {
        let client = Client::init().ok();
        loop {
            match rx.recv_timeout(Duration::from_millis(33)) {
                Ok(cmd) => handle_command(&client, cmd),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if let Some(client) = &client {
                client.run_callbacks();
            }
        }
    });
    tx
}

fn handle_command(client: &Option<Client>, cmd: SteamCommand) {
    match cmd {
        SteamCommand::IsAvailable(reply) => {
            let _ = reply.send(client.is_some());
        }
        SteamCommand::UnlockAchievement(id, reply) => {
            if let Some(client) = client {
                let _ = client.user_stats().achievement(&id).set();
                let _ = client.user_stats().store_stats();
            }
            let _ = reply.send(());
        }
        SteamCommand::ClearAchievement(id, reply) => {
            if let Some(client) = client {
                let _ = client.user_stats().achievement(&id).clear();
                let _ = client.user_stats().store_stats();
            }
            let _ = reply.send(());
        }
        SteamCommand::SetStat(name, value, reply) => {
            if let Some(client) = client {
                let _ = client.user_stats().set_stat_f32(&name, value);
                let _ = client.user_stats().store_stats();
            }
            let _ = reply.send(());
        }
        SteamCommand::CloudRead(key, reply) => {
            let value = client.as_ref().and_then(|client| {
                let file = client.remote_storage().file(&key);
                if !file.exists() {
                    return None;
                }
                let mut buf = String::new();
                file.read().read_to_string(&mut buf).ok()?;
                Some(buf)
            });
            let _ = reply.send(value);
        }
        SteamCommand::CloudWrite(key, value, reply) => {
            if let Some(client) = client {
                let mut writer = client.remote_storage().file(&key).write();
                let _ = writer.write_all(value.as_bytes());
            }
            let _ = reply.send(());
        }
        SteamCommand::CloudDelete(key, reply) => {
            if let Some(client) = client {
                client.remote_storage().file(&key).delete();
            }
            let _ = reply.send(());
        }
        SteamCommand::CloudList(reply) => {
            let keys = client
                .as_ref()
                .map(|client| {
                    client
                        .remote_storage()
                        .files()
                        .into_iter()
                        .map(|f| f.name)
                        .collect()
                })
                .unwrap_or_default();
            let _ = reply.send(keys);
        }
        SteamCommand::SetRichPresence(key, value, reply) => {
            if let Some(client) = client {
                let _ = client.friends().set_rich_presence(&key, Some(&value));
            }
            let _ = reply.send(());
        }
        SteamCommand::ClearRichPresence(reply) => {
            if let Some(client) = client {
                client.friends().clear_rich_presence();
            }
            let _ = reply.send(());
        }
    }
}

#[tauri::command]
async fn steam_is_available(state: tauri::State<'_, SteamHandle>) -> Result<bool, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::IsAvailable(reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_unlock_achievement(
    state: tauri::State<'_, SteamHandle>,
    id: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::UnlockAchievement(id, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_clear_achievement(
    state: tauri::State<'_, SteamHandle>,
    id: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::ClearAchievement(id, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_set_stat(
    state: tauri::State<'_, SteamHandle>,
    name: String,
    value: f32,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::SetStat(name, value, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_read(
    state: tauri::State<'_, SteamHandle>,
    key: String,
) -> Result<Option<String>, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudRead(key, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_write(
    state: tauri::State<'_, SteamHandle>,
    key: String,
    value: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudWrite(key, value, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_delete(
    state: tauri::State<'_, SteamHandle>,
    key: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudDelete(key, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_cloud_list(state: tauri::State<'_, SteamHandle>) -> Result<Vec<String>, String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::CloudList(reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_set_rich_presence(
    state: tauri::State<'_, SteamHandle>,
    key: String,
    value: String,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::SetRichPresence(key, value, reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn steam_clear_rich_presence(state: tauri::State<'_, SteamHandle>) -> Result<(), String> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    state
        .tx
        .send(SteamCommand::ClearRichPresence(reply_tx))
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

/// Register the `overworld-steam` Tauri plugin: spawns the dedicated Steam
/// thread on setup and exposes the 10 commands above under
/// `plugin:overworld-steam|<command>`.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("overworld-steam")
        .setup(|app, _api| {
            let tx = spawn_steam_thread();
            app.manage(SteamHandle { tx });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            steam_is_available,
            steam_unlock_achievement,
            steam_clear_achievement,
            steam_set_stat,
            steam_cloud_read,
            steam_cloud_write,
            steam_cloud_delete,
            steam_cloud_list,
            steam_set_rich_presence,
            steam_clear_rich_presence,
        ])
        .build()
}
