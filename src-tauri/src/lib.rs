mod commands;
mod state;

pub use state::AppState;

pub fn run() {
        /* work around webkit2gtk compositing failures on nvidia + debian 13.
       without this, the webview renders as a solid gray surface. */
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::connect,
            commands::disconnect,
            commands::is_connected,
            commands::get_address,
            commands::get_public_key,
            commands::send_message,
            commands::message_history,
            commands::add_contact,
            commands::remove_contact,
            commands::list_contacts,
            commands::upload_prekey_bundle,
            commands::resume_conversations,
            commands::start_conversation,
            commands::fetch_bundle,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run shatters");
}
