#![allow(non_upper_case_globals, non_camel_case_types, non_snake_case)]

mod ffi {
    include!(concat!(env!("OUT_DIR"), "/bindings.rs"));
}

pub mod error;
pub mod client;

pub use client::Client;
pub use error::{BridgeError, BridgeResult};
