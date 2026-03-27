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

fn default_sdk_build_dir(manifest_dir: &Path) -> PathBuf {
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let build_root = manifest_dir.join("../../../shatters-sdk/build");
    let preset = cmake_preset_dir_name(&profile);
    let preset_dir = build_root.join(preset);
    let artifact = preset_dir.join(sdk_static_lib_filename());

    if profile == "debug" && !artifact.exists() {
        let alt = build_root.join(if cfg!(target_os = "windows") {
            "windows-x64-release"
        } else {
            "linux-release"
        });
        if alt.join(sdk_static_lib_filename()).exists() {
            return alt;
        }
    }
    if profile == "release" && !artifact.exists() {
        let alt = build_root.join(if cfg!(target_os = "windows") {
            "windows-x64-debug"
        } else {
            "linux-debug"
        });
        if alt.join(sdk_static_lib_filename()).exists() {
            return alt;
        }
    }

    preset_dir
}

fn bundled_sdk_include(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../shatters-sdk/include")
}

fn sibling_sdk_include(manifest_dir: &Path) -> PathBuf {
    manifest_dir.join("../../../shatters-sdk/include")
}

fn resolve_sdk_include(manifest_dir: &Path) -> PathBuf {
    if let Ok(p) = env::var("SHATTERS_SDK_INCLUDE") {
        let pb = PathBuf::from(&p);
        if header_path(&pb).is_file() {
            return pb;
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
    if let Ok(p) = env::var("SHATTERS_SDK_LIB") {
        let pb = PathBuf::from(&p);
        if pb.join(sdk_static_lib_filename()).is_file() || pb.join("vcpkg_installed").is_dir() {
            return pb;
        }
    }
    let default = default_sdk_build_dir(manifest_dir);
    if default.join(sdk_static_lib_filename()).is_file() || default.join("vcpkg_installed").is_dir() {
        return default;
    }
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let legacy = manifest.join("../build");
    if legacy.join(sdk_static_lib_filename()).is_file() || legacy.join("vcpkg_installed").is_dir() {
        return legacy;
    }
    default
}

fn vcpkg_installed_lib_dir(sdk_lib: &Path) -> PathBuf {
    let triplet = if cfg!(target_os = "windows") {
        "x64-windows"
    } else {
        "x64-linux"
    };
    sdk_lib.join("vcpkg_installed").join(triplet).join("lib")
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());

    println!("cargo:rerun-if-env-changed=SHATTERS_SDK_INCLUDE");
    println!("cargo:rerun-if-env-changed=SHATTERS_SDK_LIB");

    let sdk_include = resolve_sdk_include(&manifest_dir);
    let sdk_lib = resolve_sdk_lib(&manifest_dir);

    println!("cargo:rustc-link-search=native={}", sdk_lib.display());
    println!("cargo:rustc-link-lib=static=shatters-sdk");

    // Re-link when the SDK static library changes
    let sdk_lib_file = sdk_lib.join(sdk_static_lib_filename());
    println!("cargo:rerun-if-changed={}", sdk_lib_file.display());

    let vcpkg_lib = vcpkg_installed_lib_dir(Path::new(&sdk_lib));
    println!("cargo:rustc-link-search=native={}", vcpkg_lib.display());

    println!("cargo:rustc-link-lib=sodium");
    println!("cargo:rustc-link-lib=sqlite3");
    println!("cargo:rustc-link-lib=dylib=msquic");
    println!("cargo:rustc-link-lib=static=spdlog");
    println!("cargo:rustc-link-lib=static=fmt");
    println!("cargo:rustc-link-lib=stdc++");

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
