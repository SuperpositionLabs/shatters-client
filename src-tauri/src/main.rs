// Prevents the extra console window that Windows allocates for Console-
// subsystem binaries. Only applied in release builds — keep the console
// in `tauri dev` / `cargo run` so logs are visible during development.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shatters_client_lib::run();
}
