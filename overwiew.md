# Zyrk architecture overview

Zyrk is currently a small desktop canvas application. Its architecture has two parts:

1. **Web frontend** — React, TypeScript, and Konva render and control the canvas.
2. **Desktop shell** — Tauri and Rust open a native window containing that frontend.

There is no custom backend logic, persistence, network layer, or frontend-to-Rust command bridge yet. Almost all application behavior currently lives in `src/App.tsx`.

## Directory map

```text
zyrk/
├── .vscode/                 Editor recommendations
├── dist/                    Generated production frontend
│   └── assets/              Bundled JavaScript and CSS
├── node_modules/            Installed JavaScript dependencies
├── src/                     Frontend source code
└── src-tauri/               Native desktop application
    ├── capabilities/        Tauri permission declarations
    ├── gen/
    │   └── schemas/         Generated Tauri configuration schemas
    ├── icons/               Application and installer icons
    ├── src/                 Rust entry points
    └── target/              Generated Rust builds and desktop bundles
```

## Root directory (`/`)

The root is the JavaScript/TypeScript workspace and the integration point between Vite and Tauri.

Important files:

- `package.json` declares frontend dependencies and commands. Runtime dependencies are React, React DOM, Konva, and React Konva. Tauri CLI, Vite, and TypeScript are development/build tools.
- `package-lock.json` locks exact npm dependency versions so installations are reproducible.
- `index.html` is the frontend HTML shell. It provides `<div id="root">`, then loads `/src/main.tsx`.
- `vite.config.ts` configures React compilation and Tauri-friendly development behavior. Vite uses fixed port `1420`, optional `TAURI_DEV_HOST` networking/HMR settings, and ignores Rust files while watching.
- `tsconfig.json` applies strict browser and React TypeScript checks to `src/`. It type-checks but does not emit files; Vite handles bundling.
- `tsconfig.node.json` separately type-checks the Node-executed `vite.config.ts` file.
- `tsconfig.node.tsbuildinfo` is generated TypeScript incremental-build metadata. It is disposable and ignored by Git.
- `README.md` contains the short project description, prerequisites, and common commands.
- `.gitignore` excludes dependencies, generated builds, local files, logs, and most editor configuration.

## `.vscode/`

**Responsibility:** optional developer-editor setup.

`extensions.json` recommends the Tauri and Rust Analyzer VS Code extensions. This directory does not affect the application at runtime or during production builds. Other VS Code settings are intentionally ignored by `.gitignore`.

## `src/`

**Responsibility:** all browser/WebView user interface and interaction logic.

This directory is the source consumed by Vite. The same code runs either in a normal browser through `npm run dev` or inside Tauri's native WebView through `npm run tauri dev`.

### `src/main.tsx`

The frontend entry point. It:

1. Finds the `#root` element created by `index.html`.
2. Creates the React root.
3. Renders `App` inside `React.StrictMode`.

It should remain concerned with application startup and top-level providers rather than canvas behavior.

### `src/App.tsx`

The current application and feature layer. It owns:

- viewport width and height;
- canvas translation (`x`, `y`) and scale;
- window resize synchronization;
- drag-to-pan behavior;
- wheel-to-zoom behavior, clamped between `0.2x` and `5x`;
- visible world-bound calculations;
- Konva stage, grid, and “Hello world” text rendering.

The Konva `Stage` is centered initially. Dragging changes its translation. Wheel zoom converts the pointer from screen coordinates into world coordinates, changes the scale, and adjusts translation so the world point under the pointer stays fixed. The grid is drawn only across the currently visible world bounds instead of creating persistent line objects for an unbounded canvas.

There is currently no routing, shared state layer, component hierarchy, API client, or Rust command invocation. Splitting this file is unnecessary until independent features appear.

### `src/App.css`

Defines global, full-window layout and the canvas interaction cursor. It removes page scrolling, makes the React root and `<main>` fill the window, and disables browser touch gestures over the Konva canvas.

### `src/vite-env.d.ts`

Loads Vite's ambient TypeScript declarations, including types for Vite-specific browser features. It contains no runtime code.

## `dist/`

**Responsibility:** generated production frontend output.

`npm run build` type-checks the frontend and asks Vite to produce this directory. `dist/index.html` loads fingerprinted files from `dist/assets/`. Tauri's `frontendDist` setting points here during a desktop production build.

Do not edit this directory manually: its files are replaced on every frontend build and it is ignored by Git.

### `dist/assets/`

Contains optimized, fingerprinted JavaScript and CSS bundles. The hashes in filenames support cache-safe replacement. In this project the JavaScript bundle includes the React/Konva application and its required runtime dependencies.

## `node_modules/`

**Responsibility:** local installed npm packages.

This directory is reconstructed from `package.json` and `package-lock.json` by `npm install`; it is not project source and should not be edited or committed.

Notable internal directories include:

- `.bin/` — command shims used by npm scripts, such as `vite`, `tsc`, and `tauri`;
- `.vite/` — Vite's generated dependency and development caches;
- `@tauri-apps/` — the native Tauri CLI and its platform-specific executable;
- `@vitejs/` — Vite's React integration;
- React, React DOM, Konva, and React Konva packages — the frontend runtime;
- TypeScript and transitive packages — build tooling and implementation dependencies.

## `src-tauri/`

**Responsibility:** native desktop packaging, permissions, window configuration, and Rust process startup.

Tauri combines this directory with the frontend. During development it loads Vite's `http://localhost:1420`; during a production build it embeds the generated `../dist` frontend.

Important files:

- `Cargo.toml` defines the Rust package, Tauri dependencies, library outputs, and size/performance-oriented release settings.
- `Cargo.lock` locks exact Rust dependency versions.
- `build.rs` runs Tauri's build-time code generation and platform setup.
- `tauri.conf.json` is the main desktop configuration: product metadata, app identifier, development/build commands, frontend location, initial `800×600` window, bundling targets, and icons.
- `.gitignore` excludes Cargo output and generated Tauri schemas.

The Content Security Policy is currently set to `null` in `tauri.conf.json`, meaning the application does not define a CSP. That may be acceptable for this minimal local UI, but it should be revisited before loading remote or user-controlled content.

## `src-tauri/src/`

**Responsibility:** native Rust application entry points.

### `src-tauri/src/main.rs`

The desktop executable entry point. It suppresses an extra console window in Windows release builds and delegates startup to `zyrk_lib::run()`.

### `src-tauri/src/lib.rs`

Builds and runs the Tauri application using generated configuration. Keeping startup in a library supports Tauri's desktop/mobile build model.

No custom Tauri commands, plugins, managed state, or native services are registered. Consequently, Rust currently acts only as the native host for the WebView.

## `src-tauri/capabilities/`

**Responsibility:** Tauri's application permission boundary.

`default.json` applies the `core:default` permission set to the main window. Future filesystem, dialog, shell, or other plugin access should be explicitly granted here rather than assumed by frontend code.

## `src-tauri/gen/`

**Responsibility:** generated Tauri metadata.

### `src-tauri/gen/schemas/`

Contains generated JSON schemas and ACL manifests used to validate and autocomplete Tauri capability files. `capabilities/default.json` references the desktop schema from here.

These files describe available permissions; they do not implement application behavior. Tauri regenerates them, and `src-tauri/.gitignore` excludes them.

## `src-tauri/icons/`

**Responsibility:** source icons for native applications, stores, and installers.

It contains macOS `.icns`, Windows `.ico`, PNG sizes, and Windows Store tile variants. `tauri.conf.json` selects the primary icon files used when bundling. These are source assets, unlike `dist/` and `target/`, so changes here should be intentional and retained.

## `src-tauri/target/`

**Responsibility:** generated Cargo/Tauri build output.

Cargo recreates this directory; it should not be edited or committed.

- `debug/` contains unoptimized binaries, dependency artifacts, build-script output, and incremental compilation state used during development.
- `release/` contains optimized production binaries and build artifacts.
- `release/bundle/` contains distributable desktop packages. The current machine has generated a macOS `.app` and `.dmg`.
- `.fingerprint/`, `build/`, `deps/`, `examples/`, and `incremental/` are Cargo internals supporting dependency tracking and compilation.

## Runtime flow

### Browser-only development

```text
npm run dev
  → Vite reads index.html
  → /src/main.tsx starts React
  → App.tsx renders a Konva canvas in the browser
```

This mode does not start or exercise the Rust/Tauri layer.

### Desktop development

```text
npm run tauri dev
  → Tauri CLI runs `npm run dev`
  → Vite serves the frontend on port 1420
  → Cargo builds and starts the Rust application
  → Tauri opens a native window/WebView pointed at Vite
  → React and Konva run inside that WebView
```

### Production desktop build

```text
npm run tauri build
  → Tauri runs `npm run build`
  → TypeScript checks src/
  → Vite writes the frontend to dist/
  → Cargo compiles the native application
  → Tauri embeds dist/ and creates platform bundles
  → installers appear under src-tauri/target/release/bundle/
```

## Dependency direction

```text
index.html
  → src/main.tsx
    → src/App.tsx
      → App.css
      → React Konva
        → Konva

Tauri CLI/configuration
  → starts or embeds the Vite frontend
  → src-tauri/src/main.rs
    → src-tauri/src/lib.rs
      → Tauri runtime
```

The frontend does not currently depend on native Rust APIs. This is a useful boundary: canvas behavior can be developed in a browser, while Tauri remains a thin packaging shell. Native commands should only be added when the application needs capabilities that the WebView cannot or should not provide directly.
