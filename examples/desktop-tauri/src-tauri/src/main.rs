// Windows 发行版不弹控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    overworld_desktop_lib::run()
}
