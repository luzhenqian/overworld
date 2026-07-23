#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // fs:createTauriFileStorage() 的文件存档(应用数据目录)
        .plugin(tauri_plugin_fs::init())
        // shell:bridge.openExternal() 用系统浏览器开外链
        .plugin(tauri_plugin_shell::init())
        // steam:createSteamBridge() 的成就/云存档/Rich Presence(非 Steam 环境自动降级为 no-op)
        .plugin(overworld_steam::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
