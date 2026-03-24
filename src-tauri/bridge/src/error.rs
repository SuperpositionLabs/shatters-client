use std::ffi::CStr;

use crate::ffi;

#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("{message} (code {code})")]
    Sdk { code: u32, message: String },
    #[error("{0}")]
    Other(String),
}

// Required by Tauri command error handling
impl serde::Serialize for BridgeError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type BridgeResult<T> = Result<T, BridgeError>;

/// Convert a C `ShattersStatus` into a Rust `Result<()>`.
/// Consumes (frees) the status message.
pub(crate) fn check_status(mut status: ffi::ShattersStatus) -> BridgeResult<()> {
    if status.code == ffi::ShattersErrorCode_SHATTERS_OK {
        return Ok(());
    }

    let message = if !status.message.is_null() {
        let s = unsafe { CStr::from_ptr(status.message) }
            .to_string_lossy()
            .into_owned();
        unsafe { ffi::shatters_status_free(&mut status) };
        s
    } else {
        "unknown error".into()
    };

    Err(BridgeError::Sdk {
        code: status.code,
        message,
    })
}
