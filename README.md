# Zyrk

Tauri 2 + React + TypeScript + Konva.js, built with Vite.
Displays “Hello world” on a Konva canvas.

## Setup

Install Node.js 22.12+ (or a newer supported LTS), Rust, and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev
```

## Commands

- `npm run dev` — browser-only development at http://localhost:1420
- `npm run build` — type-check and build the frontend
- `npm run tauri build` — build the desktop app and installers
- `cargo check --manifest-path src-tauri/Cargo.toml` — check the Rust backend

Desktop build artifacts are in `src-tauri/target/release/bundle/`.
