<p align="center">
  <img src="public/branding.svg" alt="shatters client" width="300"/>
</p>

<p align="center">
  <strong>Tauri v2 + SolidJS desktop client for end-to-end encrypted messaging.</strong>
</p>

<p align="center">
  <a href="#features">Features</a>
  <a href="#getting-started">Getting Started</a>
  <a href="#development">Development</a>
  <a href="#license">License</a>
</p>

---

Desktop client for [Shatters](https://github.com/SuperpositionLabs/shatters), built with [Tauri v2](https://v2.tauri.app/) (Rust backend) and [SolidJS](https://www.solidjs.com/) (TypeScript frontend). Integrates the C++ SDK through a Rust FFI bridge.

## Features

| Feature | Description |
|---|---|
| **Cross-platform Desktop** | Native shell with Tauri v2 for Linux/Windows/macOS builds |
| **Encrypted Messaging UI** | Contacts, chat, login, and settings views for secure messaging workflows |
| **SDK Bridge** | Rust bridge crate (`src-tauri/bridge/`) that links against `shatters-sdk` |
| **Fast Frontend Iteration** | Vite + SolidJS development workflow with instant rebuilds |

## Getting Started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Rust | >= 1.75 | Install with [rustup](https://rustup.rs/) |
| Node.js | >= 18 | Includes npm for frontend dependencies |
| C++ compiler | GCC 13+ or Clang 17+ | Needed to compile `shatters-sdk` |
| CMake | >= 3.25 | Build system for the SDK |
| Ninja | any | Recommended generator on Linux |

### 1. Build the SDK

```bash
cd shatters-sdk

# one-time bootstrap
./vcpkg/bootstrap-vcpkg.sh

# configure and build
cmake --preset linux-release
cmake --build build/linux-release
```

### 2. Install Client Dependencies

```bash
cd ..
npm install
```

### 3. Run in Development

```bash
# frontend-only dev server
npm run dev

# desktop app with Tauri
npm run tauri dev
```

### 4. Production Build

```bash
npm run tauri build
```

The app binary is generated under `src-tauri/target/release/`.

## Development

Set SDK paths when your environment does not auto-discover headers and libraries:

```bash
export SHATTERS_SDK_INCLUDE="$(pwd)/shatters-sdk/include"
export SHATTERS_SDK_LIB="$(pwd)/shatters-sdk/build/linux-release"
```

Useful commands:

```bash
npm run dev
npm run build
npm run tauri dev
npm run tauri build
```

## License

GPLv3 - see [shatters-sdk/LICENSE](shatters-sdk/LICENSE).
