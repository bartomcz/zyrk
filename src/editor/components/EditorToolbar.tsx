import type { CanvasObjectType } from "../model/objects";

type EditorToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  activeObjectType: CanvasObjectType | null;
  onNew: () => void;
  onSelectText: () => void;
  onSelectRectangle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
};

export function EditorToolbar({
  canUndo,
  canRedo,
  isDirty,
  activeObjectType,
  onNew,
  onSelectText,
  onSelectRectangle,
  onUndo,
  onRedo,
  onOpen,
  onSave,
  onSaveAs,
}: EditorToolbarProps) {
  return (
    <aside className="tool-panel" aria-label="Canvas tools">
      <button
        className="tool-button"
        type="button"
        aria-label="Add text"
        aria-pressed={activeObjectType === "text"}
        title="Add text"
        onClick={onSelectText}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M5 5h14M12 5v14M8.5 19h7" />
        </svg>
      </button>

      <button
        className="tool-button"
        type="button"
        aria-label="Add rectangle"
        aria-pressed={activeObjectType === "rectangle"}
        title="Add rectangle"
        onClick={onSelectRectangle}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M4 6h16v12H4Z" />
        </svg>
      </button>

      <span className="tool-divider" aria-hidden="true" />

      <button
        className="tool-button"
        type="button"
        aria-label="Undo"
        title="Undo"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M9 8 5 12l4 4M6 12h7a5 5 0 0 1 5 5" />
        </svg>
      </button>

      <button
        className="tool-button"
        type="button"
        aria-label="Redo"
        title="Redo"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="m15 8 4 4-4 4M18 12h-7a5 5 0 0 0-5 5" />
        </svg>
      </button>

      <span className="tool-divider" aria-hidden="true" />

      <button
        className="tool-button"
        type="button"
        aria-label="New document"
        title="New document"
        onClick={onNew}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 14h6M12 11v6" />
        </svg>
      </button>

      <button
        className="tool-button"
        type="button"
        aria-label="Open JSON document"
        title="Open JSON document"
        onClick={onOpen}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M4 18.5 7.5 8h12L16 18.5H4Zm1-10V5h5l2 2h5" />
        </svg>
      </button>

      <button
        className="tool-button"
        type="button"
        aria-label="Save JSON document"
        title={
          isDirty
            ? "Save JSON document (unsaved changes)"
            : "Save JSON document"
        }
        data-dirty={isDirty || undefined}
        onClick={onSave}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M5 4h12l2 2v14H5V4Zm3 0v6h8V4M8 20v-6h8v6" />
        </svg>
      </button>

      <button
        className="tool-button"
        type="button"
        aria-label="Save JSON document as"
        title="Save JSON document as"
        onClick={onSaveAs}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M5 4h10l2 2v6M8 4v6h7V4M5 14v6h6M13 19l5.5-5.5 2 2L15 21h-2v-2Z" />
        </svg>
      </button>
    </aside>
  );
}
