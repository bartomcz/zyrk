import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import "./App.css";
import { CanvasStage, type CanvasView } from "./editor/canvas/CanvasStage";
import { EditorOverlay } from "./editor/canvas/EditorOverlay";
import { EditorToolbar } from "./editor/components/EditorToolbar";
import {
  createObjectId,
  type CanvasObject,
  type CanvasObjectType,
  type ObjectId,
} from "./editor/model/objects";
import {
  createCanvasObject,
  getObjectDefinition,
} from "./editor/objects/registry";
import { useDocumentSession } from "./editor/state/useDocumentSession";

type EditingSession = {
  objectId: ObjectId;
  historyGroupKey: string;
};

export default function App() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [view, setView] = useState<CanvasView>(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
  }));
  const {
    document,
    isDirty,
    recoveryHydrated,
    canUndo,
    canRedo,
    applyCommand,
    endCommandGroup,
    cancelCommandGroup,
    undo,
    redo,
    newDocument: replaceWithNewDocument,
    openDocument: openDocumentFile,
    saveDocument: saveDocumentFile,
  } = useDocumentSession();
  const [selectedObjectId, setSelectedObjectId] = useState<ObjectId | null>(
    null,
  );
  const [editing, setEditing] = useState<EditingSession | null>(null);

  const editedObject = editing
    ? document.objects[editing.objectId]
    : undefined;

  useEffect(() => {
    const resize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (selectedObjectId && !document.objects[selectedObjectId]) {
      setSelectedObjectId(null);
    }
    if (editing && !document.objects[editing.objectId]) {
      setEditing(null);
    }
  }, [document.objects, editing, selectedObjectId]);

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      if (editing || !selectedObjectId) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        applyCommand({ type: "object/remove", ids: [selectedObjectId] });
        return;
      }

      if (
        event.key.toLowerCase() !== "d" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const selectedObject = document.objects[selectedObjectId];
      if (!selectedObject) return;

      event.preventDefault();
      const duplicate: CanvasObject = {
        ...selectedObject,
        id: createObjectId(),
        x: selectedObject.x + 12,
        y: selectedObject.y + 12,
      };
      applyCommand({
        type: "object/add",
        object: duplicate,
        index: document.order.indexOf(selectedObjectId) + 1,
      });
      setSelectedObjectId(duplicate.id);
    };

    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [
    applyCommand,
    document.objects,
    document.order,
    editing,
    selectedObjectId,
  ]);

  const newDocument = async () => {
    if (
      isDirty &&
      !(isTauri()
        ? await invoke<boolean>("confirm_discard_changes")
        : window.confirm("Discard unsaved changes and create a new document?"))
    ) {
      return;
    }

    replaceWithNewDocument();
    setSelectedObjectId(null);
    setEditing(null);
    setView({ x: size.width / 2, y: size.height / 2, scale: 1 });
  };

  const addObject = (type: CanvasObjectType) => {
    const offset = ((document.order.length - 1) % 6) * 12;
    const center = {
      x: (size.width / 2 - view.x) / view.scale,
      y: (size.height / 2 - view.y) / view.scale,
    };
    const object = createCanvasObject(type, {
      id: createObjectId(),
      center,
      offset,
    });

    applyCommand({ type: "object/add", object });
    setSelectedObjectId(object.id);
  };

  const updateObject = (object: CanvasObject) => {
    applyCommand({ type: "object/update", object });
  };

  const beginEditing = (objectId: ObjectId) => {
    const object = document.objects[objectId];
    if (!object || !getObjectDefinition(object).textEditor) return;

    setSelectedObjectId(objectId);
    setEditing({
      objectId,
      historyGroupKey: `text-edit:${objectId}:${createObjectId()}`,
    });
  };

  const updateEditedText = (value: string) => {
    if (!editing) return;
    const object = document.objects[editing.objectId];
    if (!object) return;
    const textEditor = getObjectDefinition(object).textEditor;
    if (!textEditor) return;

    applyCommand(
      {
        type: "object/update",
        object: textEditor.withValue(object, value),
      },
      editing.historyGroupKey,
    );
  };

  const finishEditing = () => {
    if (!editing) return;
    const object = document.objects[editing.objectId];
    if (object) {
      const textEditor = getObjectDefinition(object).textEditor;
      if (textEditor) {
        const value =
          textEditor.getValue(object).trim() || textEditor.emptyValue;
        applyCommand(
          {
            type: "object/update",
            object: textEditor.withValue(object, value),
          },
          editing.historyGroupKey,
        );
      }
    }

    endCommandGroup(editing.historyGroupKey);
    setEditing(null);
  };

  const cancelEditing = () => {
    if (!editing) return;
    cancelCommandGroup(editing.historyGroupKey);
    setEditing(null);
  };

  const openDocument = async () => {
    try {
      if (!(await openDocumentFile())) return;

      setSelectedObjectId(null);
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(`Could not open the document: ${message}`);
    }
  };

  const saveDocument = async (saveAs = false) => {
    try {
      await saveDocumentFile(saveAs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(`Could not save the document: ${message}`);
    }
  };

  if (!recoveryHydrated) {
    return <main aria-label="Loading canvas" aria-busy="true" />;
  }

  return (
    <main aria-label="Zoomable canvas">
      <CanvasStage
        size={size}
        view={view}
        document={document}
        selectedObjectId={selectedObjectId}
        editingObjectId={editing?.objectId ?? null}
        onViewChange={setView}
        onSelectObject={setSelectedObjectId}
        onBeginEditing={beginEditing}
        onChangeObject={updateObject}
      />

      {editedObject && (
        <EditorOverlay
          object={editedObject}
          view={view}
          onChange={updateEditedText}
          onFinish={finishEditing}
          onCancel={cancelEditing}
        />
      )}

      <EditorToolbar
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={isDirty}
        onNew={newDocument}
        onAddText={() => addObject("text")}
        onAddRectangle={() => addObject("rectangle")}
        onUndo={undo}
        onRedo={redo}
        onOpen={() => void openDocument()}
        onSave={() => void saveDocument()}
        onSaveAs={() => void saveDocument(true)}
      />
    </main>
  );
}
