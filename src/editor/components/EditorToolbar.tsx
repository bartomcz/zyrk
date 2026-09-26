type EditorToolbarProps = {
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onAddText: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpen: () => void;
  onSave: () => void;
};

export function EditorToolbar({
  canUndo,
  canRedo,
  isDirty,
  onAddText,
  onUndo,
  onRedo,
  onOpen,
  onSave,
}: EditorToolbarProps) {
  return (
    <aside className="tool-panel" aria-label="Canvas tools">
      <button
        className="tool-button"
        type="button"
        aria-label="Add text"
        title="Add text"
        onClick={onAddText}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
          <path d="M5 5h14M12 5v14M8.5 19h7" />
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
    </aside>
  );
}
