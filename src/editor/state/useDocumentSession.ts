import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createCanvasDocument } from "../model/document";
import { documentFileRepository } from "../persistence/documentRepository";
import {
  recoveryRepository,
  type RecoverySnapshot,
} from "../persistence/recoveryRepository";
import { createAutomationService } from "./automation";
import type { DocumentCommand } from "./commands";
import {
  createDocumentHistory,
  documentHistoryReducer,
} from "./history";

function now(): string {
  return new Date().toISOString();
}

export function useDocumentSession() {
  const [initialRecovery] = useState(recoveryRepository.loadCached);
  const [history, dispatch] = useReducer(
    documentHistoryReducer,
    initialRecovery?.document ?? createCanvasDocument(),
    createDocumentHistory,
  );
  const [lastExplicitlySavedRevision, setLastExplicitlySavedRevision] =
    useState<number | null>(
      initialRecovery
        ? initialRecovery.lastExplicitlySavedRevision
        : 0,
    );
  const [documentPath, setDocumentPath] = useState<string | null>(
    initialRecovery?.documentPath ?? null,
  );
  const [recoveryHydrated, setRecoveryHydrated] = useState(false);
  const latestRecovery = useRef<RecoverySnapshot | null>(null);

  const document = history.present;
  const activeDocument = useRef(document);
  activeDocument.current = document;
  const [automationService] = useState(() =>
    createAutomationService(() => activeDocument.current),
  );

  useEffect(() => {
    let cancelled = false;

    void recoveryRepository.load().then((snapshot) => {
      if (cancelled) return;
      if (snapshot && snapshot.savedAt !== initialRecovery?.savedAt) {
        dispatch({ type: "history/replace", document: snapshot.document });
        setLastExplicitlySavedRevision(
          snapshot.lastExplicitlySavedRevision,
        );
        setDocumentPath(snapshot.documentPath);
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
      documentPath,
      document,
    };
    latestRecovery.current = snapshot;
    void recoveryRepository.save(snapshot);
  }, [document, documentPath, lastExplicitlySavedRevision, recoveryHydrated]);

  useEffect(() => {
    const flushRecovery = () => {
      if (latestRecovery.current) {
        void recoveryRepository.save(latestRecovery.current);
      }
    };

    window.addEventListener("pagehide", flushRecovery);
    return () => window.removeEventListener("pagehide", flushRecovery);
  }, []);

  const applyCommand = useCallback(
    (command: DocumentCommand, groupKey?: string) => {
      dispatch({
        type: "history/apply",
        command,
        occurredAt: now(),
        groupKey,
      });
    },
    [],
  );

  const newDocument = () => {
    const blankDocument = createCanvasDocument();
    dispatch({ type: "history/replace", document: blankDocument });
    setLastExplicitlySavedRevision(blankDocument.revision);
    setDocumentPath(null);
  };

  const openDocument = async () => {
    const opened = await documentFileRepository.open();
    if (!opened) return false;

    dispatch({ type: "history/replace", document: opened.document });
    setLastExplicitlySavedRevision(opened.document.revision);
    setDocumentPath(opened.path);
    return true;
  };

  const saveDocument = async (saveAs = false) => {
    const result = await documentFileRepository.save(
      document,
      saveAs ? null : documentPath,
    );
    if (!result.saved) return;

    setDocumentPath(result.path);
    setLastExplicitlySavedRevision(document.revision);
  };

  return {
    document,
    isDirty: lastExplicitlySavedRevision !== document.revision,
    recoveryHydrated,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    automationService,
    applyCommand,
    endCommandGroup: (groupKey: string) =>
      dispatch({ type: "history/end-group", groupKey }),
    cancelCommandGroup: (groupKey: string) =>
      dispatch({
        type: "history/cancel-group",
        groupKey,
        occurredAt: now(),
      }),
    undo: () => dispatch({ type: "history/undo", occurredAt: now() }),
    redo: () => dispatch({ type: "history/redo", occurredAt: now() }),
    newDocument,
    openDocument,
    saveDocument,
  };
}
