import { useEffect, useReducer, useRef, useState } from "react";
import "./App.css";
import { CanvasStage, type CanvasView } from "./editor/canvas/CanvasStage";
import { EditorOverlay } from "./editor/canvas/EditorOverlay";
import { EditorToolbar } from "./editor/components/EditorToolbar";
import { createCanvasDocument } from "./editor/model/document";
import {
  createObjectId,
  type CanvasObject,
  type ObjectId,
} from "./editor/model/objects";
import {
  createCanvasObject,
  getObjectDefinition,
} from "./editor/objects/registry";
import { browserDocumentFileRepository } from "./editor/persistence/documentRepository";
import {
  recoveryRepository,
  type RecoverySnapshot,
} from "./editor/persistence/recoveryRepository";
import type { DocumentCommand } from "./editor/state/commands";
import {
  createDocumentHistory,
  documentHistoryReducer,
} from "./editor/state/history";

type EditingSession = {
  objectId: ObjectId;
  historyGroupKey: string;
};

function now(): string {
  return new Date().toISOString();
}

function createStarterDocument() {
  const text = createCanvasObject("text", {
    id: createObjectId(),
    center: { x: 0, y: 0 },
    offset: 0,
  });

  return createCanvasDocument([{ ...text, text: "Hello world" }]);
}

function getInitialRecovery(): RecoverySnapshot | null {
  return recoveryRepository.loadCached();
}

export default function App() {
  const [initialRecovery] = useState(getInitialRecovery);
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [view, setView] = useState<CanvasView>(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
  }));
  const [history, dispatch] = useReducer(
    documentHistoryReducer,
    initialRecovery?.document ?? createStarterDocument(),
    createDocumentHistory,
  );
  const [lastExplicitlySavedRevision, setLastExplicitlySavedRevision] =
    useState<number | null>(
      initialRecovery?.lastExplicitlySavedRevision ?? null,
    );
  const [selectedObjectId, setSelectedObjectId] = useState<ObjectId | null>(
    null,
  );
  const [editing, setEditing] = useState<EditingSession | null>(null);
  const [recoveryHydrated, setRecoveryHydrated] = useState(false);
  const latestRecovery = useRef<RecoverySnapshot | null>(null);

  const document = history.present;
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
    let cancelled = false;

    void recoveryRepository.load().then((snapshot) => {
      if (cancelled) return;
      if (snapshot && snapshot.savedAt !== initialRecovery?.savedAt) {
        dispatch({ type: "history/replace", document: snapshot.document });
        setLastExplicitlySavedRevision(
          snapshot.lastExplicitlySavedRevision,
        );
      }
      setRecoveryHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [initialRecovery?.savedAt]);

  useEffect(() => {
    if (!recoveryHydrated) return;

    const snapshot: RecoverySnapshot = {
      formatVersion: 1,
      savedAt: now(),
      lastExplicitlySavedRevision,
      document,
    };
    latestRecovery.current = snapshot;
    void recoveryRepository.save(snapshot);
  }, [document, lastExplicitlySavedRevision, recoveryHydrated]);

  useEffect(() => {
    const flushRecovery = () => {
      if (latestRecovery.current) {
        void recoveryRepository.save(latestRecovery.current);
      }
    };

    window.addEventListener("pagehide", flushRecovery);
    return () => window.removeEventListener("pagehide", flushRecovery);
  }, []);

  useEffect(() => {
    if (selectedObjectId && !document.objects[selectedObjectId]) {
      setSelectedObjectId(null);
    }
    if (editing && !document.objects[editing.objectId]) {
      setEditing(null);
    }
  }, [document.objects, editing, selectedObjectId]);

  const applyCommand = (command: DocumentCommand, groupKey?: string) => {
    dispatch({
      type: "history/apply",
      command,
      occurredAt: now(),
      groupKey,
    });
  };

  const addText = () => {
    const offset = ((document.order.length - 1) % 6) * 12;
    const center = {
      x: (size.width / 2 - view.x) / view.scale,
      y: (size.height / 2 - view.y) / view.scale,
    };
    const object = createCanvasObject("text", {
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

    dispatch({
      type: "history/end-group",
      groupKey: editing.historyGroupKey,
    });
    setEditing(null);
  };

  const cancelEditing = () => {
    if (!editing) return;
    dispatch({
      type: "history/cancel-group",
      groupKey: editing.historyGroupKey,
      occurredAt: now(),
    });
    setEditing(null);
  };

  const openDocument = async () => {
    try {
      const openedDocument = await browserDocumentFileRepository.open();
      if (!openedDocument) return;

      dispatch({ type: "history/replace", document: openedDocument });
      setLastExplicitlySavedRevision(openedDocument.revision);
      setSelectedObjectId(null);
      setEditing(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      window.alert(`Could not open the document: ${message}`);
    }
  };

  const saveDocument = async () => {
    try {
      await browserDocumentFileRepository.saveAs(document);
      setLastExplicitlySavedRevision(document.revision);
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
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        isDirty={lastExplicitlySavedRevision !== document.revision}
        onAddText={addText}
        onUndo={() => dispatch({ type: "history/undo", occurredAt: now() })}
        onRedo={() => dispatch({ type: "history/redo", occurredAt: now() })}
        onOpen={() => void openDocument()}
        onSave={() => void saveDocument()}
      />
    </main>
  );
}
