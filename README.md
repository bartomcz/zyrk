# Zyrk

Zyrk is a Tauri 2 + React + TypeScript + Konva.js canvas editor built with
Vite. Canvas objects live in a validated document model and are rendered
through a typed object registry.

Current editor features include text and rectangle objects, pan and zoom,
grouped undo/redo, validated JSON import/export, and automatic crash-recovery
snapshots.

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
- `cargo build --release --manifest-path src-cli/Cargo.toml` — build the standalone CLI

Desktop build artifacts are in `src-tauri/target/release/bundle/`. With the
desktop app running, query or add objects to its active canvas with:

```sh
cargo run --manifest-path src-cli/Cargo.toml -- canvas get
cargo run --manifest-path src-cli/Cargo.toml -- canvas object add text --x 100 --y 200 --text "Hello"
cargo run --manifest-path src-cli/Cargo.toml -- canvas object add rectangle --x 100 --y 200
cargo run --manifest-path src-cli/Cargo.toml -- canvas connection add --from <object-id> --from-edge right --to <object-id> --to-edge left
```

Object IDs are available from `canvas get`. Object coordinates specify the center
in canvas space, and connection edges are `top`, `right`, `bottom`, or `left`.
Rectangle text is optional; object styling and dimensions use the editor defaults.
CLI mutations participate in undo/redo and crash recovery like changes made directly
in the editor.

See [`overwiew.md`](overwiew.md) for the document model, object extension
points, history behavior, and persistence architecture.
