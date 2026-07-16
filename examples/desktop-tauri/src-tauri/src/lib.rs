#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // fs:createTauriFileStorage() 的文件存档(应用数据目录)
        .plugin(tauri_plugin_fs::init())
        // shell:bridge.openExternal() 用系统浏览器开外链
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
