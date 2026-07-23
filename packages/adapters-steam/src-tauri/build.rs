const COMMANDS: &[&str] = &[
    "steam_is_available",
    "steam_unlock_achievement",
    "steam_clear_achievement",
    "steam_set_stat",
    "steam_cloud_read",
    "steam_cloud_write",
    "steam_cloud_delete",
    "steam_cloud_list",
    "steam_set_rich_presence",
    "steam_clear_rich_presence",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
