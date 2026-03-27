use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use std::ptr;
use std::sync::Mutex;

use serde::Serialize;

use crate::error::{check_status, BridgeError, BridgeResult};
use crate::ffi;

// ---- on_message callback trampolining ----

struct MsgCallbackCtx {
    f: Box<dyn Fn(String, Vec<u8>, i64, bool) + Send + Sync>,
}

unsafe extern "C" fn msg_trampoline(
    ctx: *mut c_void,
    contact_address: *const c_char,
    plaintext: *const u8,
    plaintext_len: usize,
    timestamp_ms: i64,
    outgoing: c_int,
) {
    if ctx.is_null() || contact_address.is_null() {
        return;
    }
    let ctx = &*(ctx as *const MsgCallbackCtx);
    let contact = CStr::from_ptr(contact_address)
        .to_string_lossy()
        .into_owned();
    let data = if plaintext.is_null() || plaintext_len == 0 {
        Vec::new()
    } else {
        std::slice::from_raw_parts(plaintext, plaintext_len).to_vec()
    };
    (ctx.f)(contact, data, timestamp_ms, outgoing != 0);
}

/// Thread-safe wrapper around the opaque C `ShattersClient`.
pub struct Client {
    inner: Mutex<*mut ffi::ShattersClient>,
}

// The C library guarantees thread-safety of the client handle.
unsafe impl Send for Client {}
unsafe impl Sync for Client {}

impl Drop for Client {
    fn drop(&mut self) {
        let ptr = self.inner.lock().unwrap();
        if !ptr.is_null() {
            unsafe { ffi::shatters_destroy(*ptr) };
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Contact {
    pub address: String,
    pub public_key: Vec<u8>,
    pub display_name: String,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryMessage {
    pub id: i64,
    pub contact_address: String,
    pub plaintext: Vec<u8>,
    pub timestamp_ms: i64,
    pub outgoing: bool,
}

impl Client {
    /// Create a new Shatters client.
    pub fn create(
        db_path: &str,
        db_pass: &str,
        server_host: &str,
        server_port: u16,
        tls_pin: Option<&[u8]>,
        auto_reconnect: bool,
    ) -> BridgeResult<Self> {
        let c_db_path = CString::new(db_path).map_err(|e| BridgeError::Other(e.to_string()))?;
        let c_db_pass = CString::new(db_pass).map_err(|e| BridgeError::Other(e.to_string()))?;
        let c_host = CString::new(server_host).map_err(|e| BridgeError::Other(e.to_string()))?;

        let (pin_ptr, pin_len) = match tls_pin {
            Some(p) => (p.as_ptr(), p.len()),
            None => (ptr::null(), 0),
        };

        let mut raw: *mut ffi::ShattersClient = ptr::null_mut();

        let status = unsafe {
            ffi::shatters_create(
                c_db_path.as_ptr(),
                c_db_pass.as_ptr(),
                c_host.as_ptr(),
                server_port,
                pin_ptr,
                pin_len,
                if auto_reconnect { 1 } else { 0 },
                &mut raw,
            )
        };
        check_status(status)?;

        Ok(Client {
            inner: Mutex::new(raw),
        })
    }

    fn ptr(&self) -> *mut ffi::ShattersClient {
        *self.inner.lock().unwrap()
    }

    pub fn connect(&self) -> BridgeResult<()> {
        check_status(unsafe { ffi::shatters_connect(self.ptr()) })
    }

    /// Register a callback for incoming messages.
    /// The callback context is leaked and lives for the lifetime of the C client.
    pub fn on_message(
        &self,
        callback: impl Fn(String, Vec<u8>, i64, bool) + Send + Sync + 'static,
    ) {
        let ctx = Box::into_raw(Box::new(MsgCallbackCtx {
            f: Box::new(callback),
        }));
        unsafe {
            ffi::shatters_on_message(self.ptr(), Some(msg_trampoline), ctx as *mut c_void);
        }
    }

    pub fn disconnect(&self) {
        unsafe { ffi::shatters_disconnect(self.ptr()) };
    }

    pub fn is_connected(&self) -> bool {
        unsafe { ffi::shatters_is_connected(self.ptr()) != 0 }
    }

    pub fn address(&self) -> BridgeResult<String> {
        let raw = unsafe { ffi::shatters_address(self.ptr()) };
        if raw.is_null() {
            return Err(BridgeError::Other("no address".into()));
        }
        let s = unsafe { CStr::from_ptr(raw) }
            .to_string_lossy()
            .into_owned();
        unsafe { ffi::shatters_string_free(raw) };
        Ok(s)
    }

    pub fn public_key(&self) -> BridgeResult<Vec<u8>> {
        let mut pk = [0u8; 32];
        check_status(unsafe { ffi::shatters_public_key(self.ptr(), pk.as_mut_ptr()) })?;
        Ok(pk.to_vec())
    }

    pub fn send_message(&self, contact: &str, plaintext: &[u8]) -> BridgeResult<()> {
        let c_addr = CString::new(contact).map_err(|e| BridgeError::Other(e.to_string()))?;
        check_status(unsafe {
            ffi::shatters_send_message(
                self.ptr(),
                c_addr.as_ptr(),
                plaintext.as_ptr(),
                plaintext.len(),
            )
        })
    }

    pub fn message_history(
        &self,
        contact: &str,
        limit: usize,
        offset: usize,
    ) -> BridgeResult<Vec<HistoryMessage>> {
        let c_addr = CString::new(contact).map_err(|e| BridgeError::Other(e.to_string()))?;
        let mut list = ffi::ShattersHistoryList {
            items: ptr::null_mut(),
            count: 0,
        };
        check_status(unsafe {
            ffi::shatters_message_history(self.ptr(), c_addr.as_ptr(), limit, offset, &mut list)
        })?;

        let mut result = Vec::with_capacity(list.count);
        if !list.items.is_null() {
            for i in 0..list.count {
                let item = unsafe { &*list.items.add(i) };
                result.push(HistoryMessage {
                    id: item.id,
                    contact_address: if item.contact_address.is_null() {
                        String::new()
                    } else {
                        unsafe { CStr::from_ptr(item.contact_address) }
                            .to_string_lossy()
                            .into_owned()
                    },
                    plaintext: if item.plaintext.is_null() || item.plaintext_len == 0 {
                        Vec::new()
                    } else {
                        unsafe {
                            std::slice::from_raw_parts(item.plaintext, item.plaintext_len)
                        }
                        .to_vec()
                    },
                    timestamp_ms: item.timestamp_ms,
                    outgoing: item.outgoing != 0,
                });
            }
        }
        unsafe { ffi::shatters_history_list_free(&mut list) };
        Ok(result)
    }

    pub fn upload_prekey_bundle(&self, num_one_time: u32) -> BridgeResult<()> {
        check_status(unsafe { ffi::shatters_upload_prekey_bundle(self.ptr(), num_one_time) })
    }

    pub fn resume_conversations(&self) -> BridgeResult<()> {
        check_status(unsafe { ffi::shatters_resume_conversations(self.ptr()) })
    }

    pub fn add_contact(
        &self,
        address: &str,
        public_key: &[u8; 32],
        display_name: &str,
    ) -> BridgeResult<()> {
        let c_addr = CString::new(address).map_err(|e| BridgeError::Other(e.to_string()))?;
        let c_name =
            CString::new(display_name).map_err(|e| BridgeError::Other(e.to_string()))?;
        check_status(unsafe {
            ffi::shatters_add_contact(
                self.ptr(),
                c_addr.as_ptr(),
                public_key.as_ptr(),
                c_name.as_ptr(),
            )
        })
    }

    pub fn remove_contact(&self, address: &str) -> BridgeResult<()> {
        let c_addr = CString::new(address).map_err(|e| BridgeError::Other(e.to_string()))?;
        check_status(unsafe { ffi::shatters_remove_contact(self.ptr(), c_addr.as_ptr()) })
    }

    pub fn list_contacts(&self) -> BridgeResult<Vec<Contact>> {
        let mut list = ffi::ShattersContactList {
            items: ptr::null_mut(),
            count: 0,
        };
        check_status(unsafe { ffi::shatters_list_contacts(self.ptr(), &mut list) })?;

        let mut result = Vec::with_capacity(list.count);
        if !list.items.is_null() {
            for i in 0..list.count {
                let item = unsafe { &*list.items.add(i) };
                result.push(Contact {
                    address: if item.address.is_null() {
                        String::new()
                    } else {
                        unsafe { CStr::from_ptr(item.address) }
                            .to_string_lossy()
                            .into_owned()
                    },
                    public_key: item.public_key.to_vec(),
                    display_name: if item.display_name.is_null() {
                        String::new()
                    } else {
                        unsafe { CStr::from_ptr(item.display_name) }
                            .to_string_lossy()
                            .into_owned()
                    },
                    added_at: item.added_at,
                });
            }
        }
        unsafe { ffi::shatters_contact_list_free(&mut list) };
        Ok(result)
    }

    pub fn start_conversation(
        &self,
        contact: &str,
        bundle_data: &[u8],
        first_message: &[u8],
    ) -> BridgeResult<()> {
        let c_addr = CString::new(contact).map_err(|e| BridgeError::Other(e.to_string()))?;
        check_status(unsafe {
            ffi::shatters_start_conversation(
                self.ptr(),
                c_addr.as_ptr(),
                bundle_data.as_ptr(),
                bundle_data.len(),
                first_message.as_ptr(),
                first_message.len(),
            )
        })
    }

    pub fn fetch_bundle(&self, address: &str, timeout_secs: u32) -> BridgeResult<Vec<u8>> {
        let c_addr = CString::new(address).map_err(|e| BridgeError::Other(e.to_string()))?;
        let mut buf = ffi::ShattersBytes {
            data: ptr::null_mut(),
            len: 0,
        };
        check_status(unsafe {
            ffi::shatters_fetch_bundle(self.ptr(), c_addr.as_ptr(), timeout_secs, &mut buf)
        })?;

        let result = if buf.data.is_null() || buf.len == 0 {
            Vec::new()
        } else {
            unsafe { std::slice::from_raw_parts(buf.data, buf.len) }.to_vec()
        };
        unsafe { ffi::shatters_bytes_free(&mut buf) };
        Ok(result)
    }
}
