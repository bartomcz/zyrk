# Zyrk

Zyrk is a Tauri 2 + React + TypeScript + Konva.js canvas editor built with
Vite. Canvas objects live in a versioned document model and are rendered
through a typed object registry.

Current editor features include text objects, pan and zoom, grouped undo/redo,
validated JSON import/export, and automatic crash-recovery snapshots.

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

See [`overwiew.md`](overwiew.md) for the document model, object extension
points, history behavior, and persistence architecture.
