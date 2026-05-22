use std::sync::{Arc, RwLock};
use shatters_bridge::Client;

/// The active SDK client, if any.
///
/// `RwLock` + `Arc` lets every command grab the client briefly, clone the
/// `Arc`, and release the lock before doing any actual SDK work. Previously
/// a single `Mutex` serialized every command — a slow `send_message` would
/// block `list_contacts`, `message_history`, etc., freezing the UI.
pub struct AppState {
    pub client: RwLock<Option<Arc<Client>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            client: RwLock::new(None),
        }
    }
}
