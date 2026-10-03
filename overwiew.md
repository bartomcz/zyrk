# Zyrk architecture overview

Zyrk is a desktop canvas editor with a React/Konva frontend hosted by Tauri.
The editor is document-driven: Konva nodes are a rendering detail and never
become the source of truth.

## Directory map

```text
src/
├── App.tsx                         Editor coordinator
├── App.css                         Global canvas and toolbar styles
└── editor/
    ├── canvas/                     Konva stage and shared interactions
    ├── components/                 Non-canvas editor UI
    ├── model/                      Serializable document types and validation
    ├── objects/                    Object definitions and renderers
    ├── persistence/                JSON files and recovery repositories
    └── state/                      Commands and undo/redo history

src-tauri/
└── src/lib.rs                      Tauri startup and recovery-file commands
```

## Document model

`src/editor/model/document.ts` defines the serializable `CanvasDocument`:

- `schemaVersion` supports future migrations;
- `id`, timestamps, and a monotonically changing `revision` identify state;
- `objects` stores normalized objects by stable UUID;
- `order` controls object rendering and future layer ordering;
- `connections` stores directed references between object edges.

`src/editor/model/objects.ts` defines the discriminated `CanvasObject` union.
Shared data is composed from focused types such as `ObjectFrame` and
`TextContent`. The model contains JSON data only—never React components,
Konva nodes, callbacks, or class instances.

Selection, viewport, active editing sessions, and undo stacks are editor
session state. They are deliberately excluded from exported documents.

## Object definitions

`src/editor/objects/registry.ts` is an exhaustive, compile-time registry. Each
object definition supplies:

- a default factory;
- its Konva renderer;
- minimum dimensions and resize/rotation capabilities;
- a function that applies a normalized frame;
- optional text-editor behavior.

`CanvasObjectNode` owns behavior shared by all objects: selection, dragging,
cursor feedback, and change commits. Object renderers only draw their content.
This allows text and a future sticky note to reuse the same editor overlay
while retaining different rendering, sizing, and actions.

To add an object type:

1. Add its serializable variant to `model/objects.ts`.
2. Add validation for that variant to `model/schema.ts`.
3. Implement its factory, renderer, transform policy, and optional editor in
   `objects/<type>/`.
4. Register the definition in `objects/registry.ts`.
5. Add the corresponding creation tool to the toolbar.

Rectangle and circle objects can share fill/stroke data and transform helpers.
Connections remain separate document entities because their endpoints reference
object edges. A sticky note should be one object composed with `TextContent`,
not separately selectable rectangle and text objects.

## Commands and undo/redo

All document changes pass through `state/commands.ts`. The supported command
families already cover adding, updating, removing, reordering, and renaming.

`state/history.ts` wraps the document in `past`, `present`, and `future`
snapshots, capped at 100 undo entries. Documents are small JSON values, so
snapshot history is currently simpler than maintaining inverse patches.

History groups coalesce continuous logical edits. Text is written into the
current document on every keystroke for recovery, but the whole editing
session creates one undo step. Escape restores the state from before that
group. Dragging commits only on drag end, so it also creates one undo entry.

Viewport and selection changes do not enter document history. Undo and redo
create a new document revision, which ensures recovery persistence follows
what is currently visible.

## Rendering and interaction

`canvas/CanvasStage.tsx` owns pan, pointer-centered zoom, the unbounded grid,
connection drawing, and ordered object rendering. The grid keeps the existing
100-unit spacing and light stroke while drawing only the visible world bounds.

`canvas/CanvasObjectNode.tsx` is the shared interaction shell. Its normalized
`ObjectFrame` boundary is also where Konva Transformer resize output can later
be converted from temporary node scale into persisted width, height, and
rotation. Per-type transform policies can then handle arrows or constrained
shapes differently.

`canvas/EditorOverlay.tsx` hosts DOM-based text editing. Definitions decide
whether editing is single-line or multiline and provide the object-specific
text style and mutation behavior.

## JSON files

`model/schema.ts` validates every loaded document before it reaches editor
state. Unknown versions, unknown object types, invalid geometry, duplicate
ordering, and incomplete object maps are rejected. Migration routing is
centralized beside this validation for future schema versions.

`persistence/documentRepository.ts` exposes a repository rather than coupling
file operations to React. In Tauri, native dialogs open documents and choose a
destination for Save As. Save writes to the current document path, falling back
to Save As when no path is known. Browser development uses file input and
download fallbacks because browsers cannot overwrite local files by path.

## Crash recovery

Every document revision is immediately cached in WebView storage. In the
Tauri runtime it is also queued to native recovery commands in
`src-tauri/src/lib.rs`.

The native writer maintains two rotating files in the application's data
directory. It writes and flushes a temporary file before renaming it over the
older slot, leaving the other slot available if a process or machine failure
interrupts a write. At startup the frontend validates all available copies
and restores the newest valid snapshot.

Recovery stores the current document, its current file path, and the last
explicitly saved revision, not the in-memory undo stack. The path is recovery
metadata and is never included in exported document JSON. Rapid changes are
serialized and coalesced so an older asynchronous write cannot overwrite newer
work.

## Frontend/native boundary

The persistence repositories use `@tauri-apps/api` only to invoke narrowly
scoped document and recovery commands. In a normal browser they use WebView
storage, file input, and downloads instead.

Explicit document files remain independent of recovery files: saving a user
document updates the saved revision, while the recovery copy continues to
track the exact working state, including subsequent undo or redo operations.
