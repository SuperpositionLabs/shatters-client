use serde::Serialize;
use shatters_bridge::{client::Contact, client::HistoryMessage, BridgeError, Client};
use tauri::{Emitter, State};

use crate::AppState;

/// Structured error sent to the frontend.
///
/// `kind` lets the UI distinguish SDK errors that have UX implications
/// (e.g. NoSession triggers the X3DH bootstrap flow on first send) without
/// substring-sniffing on the human-readable message.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CmdError {
    /// Bridge or SDK reported that the contact has no active ratchet
    /// session. The UI should attempt `fetch_bundle` + `start_conversation`.
    NoSession { message: String },
    /// Generic SDK error with the underlying code.
    Sdk { code: u32, message: String },
    /// Anything else — client not initialised, lock poisoned, FFI string
    /// conversion failures, etc.
    Other { message: String },
}

impl From<BridgeError> for CmdError {
    fn from(e: BridgeError) -> Self {
        match e {
            BridgeError::Sdk { code, message } => {
                let low = message.to_lowercase();
                if low.contains("no session") || low.contains("ratchet not loaded") {
                    CmdError::NoSession { message }
                } else {
                    CmdError::Sdk { code, message }
                }
            }
            BridgeError::Other(message) => CmdError::Other { message },
        }
    }
}

impl From<String> for CmdError {
    fn from(message: String) -> Self {
        CmdError::Other { message }
    }
}

impl From<&str> for CmdError {
    fn from(s: &str) -> Self {
        CmdError::Other { message: s.to_string() }
    }
}

type CmdResult<T> = Result<T, CmdError>;

fn with_client<F, T>(state: &State<AppState>, f: F) -> CmdResult<T>
where
    F: FnOnce(&Client) -> Result<T, BridgeError>,
{
    let guard = state
        .client
        .lock()
        .map_err(|e| CmdError::Other { message: e.to_string() })?;
    let client = guard
        .as_ref()
        .ok_or_else(|| CmdError::Other { message: "client not initialised".into() })?;
    f(client).map_err(CmdError::from)
}

#[derive(Serialize)]
pub struct ConnectResult {
    pub address: String,
}

#[derive(Clone, Serialize)]
struct IncomingMessage {
    contact_address: String,
    plaintext: Vec<u8>,
    timestamp_ms: i64,
    outgoing: bool,
}

#[tauri::command]
pub fn connect(
    app: tauri::AppHandle,
    state: State<AppState>,
    db_path: String,
    db_pass: String,
    server_host: String,
    server_port: u16,
) -> CmdResult<ConnectResult> {
    let client =
        Client::create(&db_path, &db_pass, &server_host, server_port, None, true)?;
    client.connect()?;

    let address = client.address()?;

    // Register incoming-message callback → emit Tauri event
    let app_handle = app.clone();
    client.on_message(move |contact, plaintext, timestamp_ms, outgoing| {
        let _ = app_handle.emit(
            "shatters://message",
            IncomingMessage {
                contact_address: contact,
                plaintext,
                timestamp_ms,
                outgoing,
            },
        );
    });

    *state
        .client
        .lock()
        .map_err(|e| CmdError::Other { message: e.to_string() })? = Some(client);

    Ok(ConnectResult { address })
}

#[tauri::command]
pub fn disconnect(state: State<AppState>) -> CmdResult<()> {
    let mut guard = state
        .client
        .lock()
        .map_err(|e| CmdError::Other { message: e.to_string() })?;
    if let Some(c) = guard.take() {
        c.disconnect();
    }
    Ok(())
}

#[tauri::command]
pub fn is_connected(state: State<AppState>) -> CmdResult<bool> {
    let guard = state
        .client
        .lock()
        .map_err(|e| CmdError::Other { message: e.to_string() })?;
    Ok(guard.as_ref().map(|c| c.is_connected()).unwrap_or(false))
}

#[tauri::command]
pub fn get_address(state: State<AppState>) -> CmdResult<String> {
    with_client(&state, |c| c.address())
}

#[tauri::command]
pub fn get_public_key(state: State<AppState>) -> CmdResult<Vec<u8>> {
    with_client(&state, |c| c.public_key())
}

#[tauri::command]
pub fn send_message(
    state: State<AppState>,
    contact: String,
    plaintext: Vec<u8>,
) -> CmdResult<()> {
    with_client(&state, |c| c.send_message(&contact, &plaintext))
}

#[tauri::command]
pub fn message_history(
    state: State<AppState>,
    contact: String,
    limit: usize,
    offset: usize,
) -> CmdResult<Vec<HistoryMessage>> {
    with_client(&state, |c| c.message_history(&contact, limit, offset))
}

#[tauri::command]
pub fn add_contact(
    state: State<AppState>,
    address: String,
    public_key: Vec<u8>,
    display_name: String,
) -> CmdResult<()> {
    with_client(&state, |c| {
        let pk: [u8; 32] = public_key
            .try_into()
            .map_err(|_| BridgeError::Other("public key must be 32 bytes".into()))?;
        c.add_contact(&address, &pk, &display_name)
    })
}

#[tauri::command]
pub fn remove_contact(state: State<AppState>, address: String) -> CmdResult<()> {
    with_client(&state, |c| c.remove_contact(&address))
}

#[tauri::command]
pub fn list_contacts(state: State<AppState>) -> CmdResult<Vec<Contact>> {
    with_client(&state, |c| c.list_contacts())
}

#[tauri::command]
pub fn upload_prekey_bundle(state: State<AppState>, num_one_time: u32) -> CmdResult<()> {
    with_client(&state, |c| c.upload_prekey_bundle(num_one_time))
}

#[tauri::command]
pub fn resume_conversations(state: State<AppState>) -> CmdResult<()> {
    with_client(&state, |c| c.resume_conversations())
}

#[tauri::command]
pub fn start_conversation(
    state: State<AppState>,
    contact: String,
    bundle_data: Vec<u8>,
    first_message: Vec<u8>,
) -> CmdResult<()> {
    with_client(&state, |c| {
        c.start_conversation(&contact, &bundle_data, &first_message)
    })
}

#[tauri::command]
pub fn fetch_bundle(
    state: State<AppState>,
    address: String,
    timeout_secs: u32,
) -> CmdResult<Vec<u8>> {
    with_client(&state, |c| c.fetch_bundle(&address, timeout_secs))
}
