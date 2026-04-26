use std::env;
use std::path::PathBuf;

fn main() {
    // Embed an rpath so the produced binary finds vcpkg dylibs (e.g. libmsquic.so.2)
    // without requiring LD_LIBRARY_PATH. This works only from the *bin* crate's
    // build.rs (cargo:rustc-link-arg is bin-scoped here), not from the bridge lib.
    if !cfg!(target_os = "windows") {
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
        let preset = if profile == "release" { "linux-release" } else { "linux-debug" };
        let mut vcpkg_lib = manifest_dir
            .join("../../shatters-sdk/build")
            .join(preset)
            .join("vcpkg_installed/x64-linux/lib");
        if !vcpkg_lib.exists() {
            // Fallback to the other preset if the expected one is absent.
            let alt_preset = if profile == "release" { "linux-debug" } else { "linux-release" };
            let alt = manifest_dir
                .join("../../shatters-sdk/build")
                .join(alt_preset)
                .join("vcpkg_installed/x64-linux/lib");
            if alt.exists() {
                vcpkg_lib = alt;
            }
        }
        if vcpkg_lib.exists() {
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", vcpkg_lib.display());
        }
        // Also look for dylibs sitting next to the binary (for distribution).
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
    }

    tauri_build::build();
}
