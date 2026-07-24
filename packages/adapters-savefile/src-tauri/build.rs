const COMMANDS: &[&str] = &[
    "savefile_write",
    "savefile_sync",
    "savefile_rename",
    "savefile_read",
    "savefile_delete",
    "savefile_exists",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
