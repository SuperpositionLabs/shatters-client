use std::env;
use std::path::{Path, PathBuf};

fn header_path(include_root: &Path) -> PathBuf {
    include_root.join("shatters/shatters_c.h")
}

fn sdk_static_lib_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "shatters-sdk.lib"
    } else {
        "libshatters-sdk.a"
    }
}

fn cmake_preset_dir_name(profile: &str) -> &'static str {
    if cfg!(target_os = "windows") {
        match profile {
            "release" => "windows-x64-release",
            _ => "windows-x64-debug",
        }
    } else {
        match profile {
            "release" => "linux-release",
            _ => "linux-debug",
        }
    }
}

/// Subdirectories MSVC's multi-config generators emit into. CMake's default
/// generator on Windows is "Visual Studio", which puts artifacts at
/// `build/<preset>/<Config>/shatters-sdk.lib` rather than the single-config
/// `build/<preset>/shatters-sdk.lib` that Ninja (Linux) produces.
fn msvc_config_subdirs(profile: &str) -> &'static [&'static str] {
    match profile {
        "release" => &["Release", "RelWithDebInfo", "MinSizeRel", "Debug"],
        _ => &["Debug", "Release", "RelWithDebInfo"],
    }
}

/// Given a candidate `<preset>` build directory, return the subdir that
/// actually contains the static lib — either the preset dir itself
/// (Ninja / single-config) or one of the per-config children (MSVC).
fn locate_lib_in_preset(preset_dir: &Path) -> Option<PathBuf> {
    let libname = sdk_static_lib_filename();
    if preset_dir.join(libname).is_file() {
        return Some(preset_dir.to_path_buf());
    }
    if cfg!(target_os = "windows") {
        let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
        for sub in msvc_config_subdirs(&profile) {
            let cand = preset_dir.join(sub);
            if cand.join(libname).is_file() {
                return Some(cand);
            }
        }
    }
    None
}

fn default_sdk_build_dir(manifest_dir: &Path) -> PathBuf {
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let build_root = manifest_dir.join("../../../shatters-sdk/build");
    let preset = cmake_preset_dir_name(&profile);
    let preset_dir = build_root.join(preset);

    if let Some(p) = locate_lib_in_preset(&preset_dir) {
        return p;
    }

    // Profile mismatch (debug cargo build but only release SDK on disk, or
    // vice versa). The link will still be ABI-compatible — try the other.
    let alt_preset = if profile == "debug" {
        if cfg!(target_os = "windows") { "windows-x64-release" } else { "linux-release" }
    } else if cfg!(target_os = "windows") {
        "windows-x64-debug"
    } else {
        "linux-debug"
    };
    let alt_dir = build_root.join(alt_preset);
    if let Some(p) = locate_lib_in_preset(&alt_dir) {
        return p;
    }

    preset_dir
}

fn bundled_sdk_include(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../shatters-sdk/include")
}

fn sibling_sdk_include(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../../shatters-sdk/include")
}

/// Returns the SDK root directory if `SHATTERS_SDK_DIR` is set and looks
/// like a valid SDK checkout (has `include/shatters/shatters_c.h`).
fn sdk_dir_env() -> Option<PathBuf> {
    let p = PathBuf::from(env::var("SHATTERS_SDK_DIR").ok()?);
    if header_path(&p.join("include")).is_file() {
        Some(p)
    } else {
        None
    }
}

fn resolve_sdk_include(manifest_dir: &Path) -> PathBuf {
    if let Ok(p) = env::var("SHATTERS_SDK_INCLUDE") {
        let pb = PathBuf::from(&p);
        if header_path(&pb).is_file() {
            return pb;
        }
    }
    if let Some(root) = sdk_dir_env() {
        let inc = root.join("include");
        if header_path(&inc).is_file() {
            return inc;
        }
    }
    for candidate in [
        sibling_sdk_include(manifest_dir),
        bundled_sdk_include(manifest_dir),
    ] {
        if header_path(&candidate).is_file() {
            return candidate;
        }
    }
    sibling_sdk_include(manifest_dir)
}

fn resolve_sdk_lib(manifest_dir: &Path) -> PathBuf {
    let libname = sdk_static_lib_filename();
    if let Ok(p) = env::var("SHATTERS_SDK_LIB") {
        let pb = PathBuf::from(&p);
        if let Some(p) = locate_lib_in_preset(&pb) {
            return p;
        }
        if pb.join("vcpkg_installed").is_dir() {
            return pb;
        }
    }
    if let Some(root) = sdk_dir_env() {
        let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
        let preset_dir = root.join("build").join(cmake_preset_dir_name(&profile));
        if let Some(p) = locate_lib_in_preset(&preset_dir) {
            return p;
        }
    }
    let default = default_sdk_build_dir(manifest_dir);
    if default.join(libname).is_file() || default.join("vcpkg_installed").is_dir() {
        return default;
    }
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let legacy = manifest.join("../build");
    if let Some(p) = locate_lib_in_preset(&legacy) {
        return p;
    }
    if legacy.join("vcpkg_installed").is_dir() {
        return legacy;
    }
    default
}

/// Locate the vcpkg `<triplet>/lib` directory.
///
/// With Ninja (Linux) `sdk_lib` *is* the preset dir and `vcpkg_installed/`
/// sits beside the artifacts. With MSVC multi-config, `sdk_lib` is the
/// `Release/` (or `Debug/`) child — we have to walk up one level to find
/// the vcpkg drop.
fn vcpkg_installed_lib_dir(sdk_lib: &Path) -> PathBuf {
    let triplet = if cfg!(target_os = "windows") {
        "x64-windows"
    } else {
        "x64-linux"
    };
    let mut here = sdk_lib.to_path_buf();
    for _ in 0..3 {
        let cand = here.join("vcpkg_installed").join(triplet).join("lib");
        if cand.is_dir() {
            return cand;
        }
        if !here.pop() {
            break;
        }
    }
    sdk_lib.join("vcpkg_installed").join(triplet).join("lib")
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());

    println!("cargo:rerun-if-env-changed=SHATTERS_SDK_INCLUDE");
    println!("cargo:rerun-if-env-changed=SHATTERS_SDK_LIB");
    println!("cargo:rerun-if-env-changed=SHATTERS_SDK_DIR");

    let sdk_include = resolve_sdk_include(&manifest_dir);
    let sdk_lib = resolve_sdk_lib(&manifest_dir);

    println!("cargo:rustc-link-search=native={}", sdk_lib.display());
    println!("cargo:rustc-link-lib=static=shatters-sdk");

    // Re-link when the SDK static library changes
    let sdk_lib_file = sdk_lib.join(sdk_static_lib_filename());
    println!("cargo:rerun-if-changed={}", sdk_lib_file.display());

    let vcpkg_lib = vcpkg_installed_lib_dir(Path::new(&sdk_lib));
    println!("cargo:rustc-link-search=native={}", vcpkg_lib.display());

    // Export the vcpkg lib dir so the main bin's build.rs can embed it as rpath.
    println!("cargo:vcpkg-lib-dir={}", vcpkg_lib.display());

    // vcpkg's libsodium package ships as `libsodium.lib` on the
    // x64-windows triplet but `libsodium.a` (so `-l sodium` works) on
    // Linux. Conditional accordingly. crypto/stdc++ are non-Windows only:
    // the SDK's CMake gates `OpenSSL::Crypto` behind `NOT WIN32`, and
    // libstdc++ is gcc/clang-specific.
    if cfg!(target_os = "windows") {
        println!("cargo:rustc-link-lib=libsodium");
    } else {
        println!("cargo:rustc-link-lib=sodium");
    }
    println!("cargo:rustc-link-lib=sqlite3");
    println!("cargo:rustc-link-lib=dylib=msquic");
    println!("cargo:rustc-link-lib=static=spdlog");
    println!("cargo:rustc-link-lib=static=fmt");
    if !cfg!(target_os = "windows") {
        println!("cargo:rustc-link-lib=crypto");
        println!("cargo:rustc-link-lib=stdc++");
    }

    let header = header_path(&sdk_include);
    println!("cargo:rerun-if-changed={}", header.display());

    let bindings = bindgen::Builder::default()
        .header(header.to_string_lossy())
        .clang_arg(format!("-I{}", sdk_include.display()))
        .allowlist_function("shatters_.*")
        .allowlist_type("Shatters.*")
        .derive_debug(true)
        .derive_default(true)
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .generate()
        .unwrap_or_else(|e| {
            panic!(
                "unable to generate bindings for {} (include={}): {e}",
                header.display(),
                sdk_include.display()
            )
        });

    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out.join("bindings.rs"))
        .expect("unable to write bindings");
}
