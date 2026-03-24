use std::sync::Mutex;
use shatters_bridge::Client;

pub struct AppState {
    pub client: Mutex<Option<Client>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }
}
