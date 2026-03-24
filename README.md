<p align="center">
  <strong>Shatters Desktop Client</strong>
</p>

<p align="center">
  Tauri v2 + SolidJS desktop client for end-to-end encrypted messaging.
</p>

<p align="center">
  <a href="#getting-started">Getting Started</a>
  <a href="#development">Development</a>
  <a href="#license">License</a>
</p>

---

Desktop client for [Shatters](https://github.com/SuperpositionLabs/shatters). Built with [Tauri v2](https://v2.tauri.app/) (Rust backend) and [SolidJS](https://www.solidjs.com/) (TypeScript frontend). Communicates with the C++ SDK via a Rust FFI bridge.

## Getting Started

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | >= 1.75 | [rustup.rs](https://rustup.rs/) |
| Node.js | >= 18 | [nodejs.org](https://nodejs.org/) or `apt install nodejs npm` |
| C++ compiler | GCC 13+ or Clang 17+ | For building shatters-sdk |
| CMake | >= 3.25 | `apt install cmake` |
| Ninja | any | `apt install ninja-build` |

### Build

#### 1. Build the SDK first

The client depends on the C++ SDK static library. Build it first:

```bash
cd shatters-sdk

# bootstrap vcpkg (one-time)
./vcpkg/bootstrap-vcpkg.sh

# build
cmake --preset linux-release
cmake --build build/linux-release
```

#### 2. Install frontend dependencies

```bash
cd shatters-client
npm install
```

#### 3. Install the Tauri CLI

```bash
cargo install tauri-cli --version "^2.0"
```

#### 4. Build the desktop app

Set environment variables pointing to the SDK:

```bash
export SHATTERS_SDK_INCLUDE="$(pwd)/../shatters-sdk/include"
export SHATTERS_SDK_LIB="$(pwd)/../shatters-sdk/build/linux-release"

# development mode (hot-reload)
cargo tauri dev

# production build
cargo tauri build
```

The production binary will be in `src-tauri/target/release/shatters-client`.

## Development

### Frontend dev server

```bash
npm run dev          # starts Vite on http://localhost:3000
```

### Tauri dev mode

```bash
cargo tauri dev      # launches app with hot-reload frontend
```

## License

GPLv3 - see [LICENSE](../shatters-sdk/LICENSE).
