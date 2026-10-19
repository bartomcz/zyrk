import { createCanvasDocument, type CanvasDocument } from "../model/document";
import type { documentFileRepository } from "../persistence/documentRepository";
import type {
  recoveryRepository,
  RecoverySnapshot,
} from "../persistence/recoveryRepository";
import {
  AUTOMATION_API_VERSION,
  createAutomationService,
  type AutomationService,
} from "./automation";
import type { DocumentCommand } from "./commands";
import {
  createDocumentHistory,
  documentHistoryReducer,
  type HistoryAction,
} from "./history";

function now(): string {
  return new Date().toISOString();
}

export function createDocumentSession({
  documents,
  recovery,
}: {
  documents: typeof documentFileRepository;
  recovery: typeof recoveryRepository;
}) {
  const initialRecovery = recovery.loadCached();
  let history = createDocumentHistory(
    initialRecovery?.document ?? createCanvasDocument(),
  );
  let documentPath = initialRecovery?.documentPath ?? null;
  let lastExplicitlySavedRevision = initialRecovery
    ? initialRecovery.lastExplicitlySavedRevision
    : history.present.revision;
  let recoveryHydrated = false;
  let hydration: Promise<void> | undefined;
  let latestRecovery: RecoverySnapshot | null = null;
  let generation = 0;
  let openOperation = 0;
  let saveQueue = Promise.resolve();
  const listeners = new Set<() => void>();

  const createSnapshot = () => ({
    document: history.present,
    documentPath,
    lastExplicitlySavedRevision,
    recoveryHydrated,
    isDirty: lastExplicitlySavedRevision !== history.present.revision,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  });
  let snapshot = createSnapshot();

  const flushRecovery = () => {
    if (!latestRecovery) return;
    void recovery.save(latestRecovery).catch((error) => {
      console.error("Could not save recovery snapshot", error);
    });
  };

  const publish = () => {
    const previous = snapshot;
    snapshot = createSnapshot();
    if (
      recoveryHydrated &&
      (!previous.recoveryHydrated ||
        previous.document !== snapshot.document ||
        previous.documentPath !== documentPath ||
        previous.lastExplicitlySavedRevision !== lastExplicitlySavedRevision)
    ) {
      latestRecovery = {
        formatVersion: 1,
        savedAt: now(),
        document: history.present,
        documentPath,
        lastExplicitlySavedRevision,
      };
      flushRecovery();
    }
    listeners.forEach((listener) => listener());
  };

  const requireReady = () => {
    if (!recoveryHydrated) throw new Error("The document session is not ready");
  };

  const dispatch = (action: HistoryAction) => {
    requireReady();
    const next = documentHistoryReducer(history, action);
    if (next === history) return;
    history = next;
    publish();
  };

  const applyCommand = (command: DocumentCommand, groupKey?: string) => {
    dispatch({ type: "history/apply", command, occurredAt: now(), groupKey });
  };
  const automation = createAutomationService(
    () => history.present,
    applyCommand,
  );
  const automationService: AutomationService = {
    execute: (request) =>
      recoveryHydrated
        ? automation.execute(request)
        : {
            ok: false,
            apiVersion: AUTOMATION_API_VERSION,
            error: {
              code: "internal_error",
              message: "The document session is not ready; recovery is loading",
            },
          },
  };

  const replaceDocument = (document: CanvasDocument, path: string | null) => {
    generation += 1;
    history = createDocumentHistory(document);
    documentPath = path;
    lastExplicitlySavedRevision = document.revision;
    publish();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate: () => {
      hydration ??= recovery
        .load()
        .catch((error) => {
          console.error("Could not load recovery snapshot", error);
          return null;
        })
        .then((loaded) => {
          if (loaded && loaded.savedAt !== initialRecovery?.savedAt) {
            history = createDocumentHistory(loaded.document);
            documentPath = loaded.documentPath;
            lastExplicitlySavedRevision = loaded.lastExplicitlySavedRevision;
          }
          recoveryHydrated = true;
          publish();
        });
      return hydration;
    },
    flushRecovery,
    automationService,
    applyCommand,
    endCommandGroup: (groupKey: string) =>
      dispatch({ type: "history/end-group", groupKey }),
    cancelCommandGroup: (groupKey: string) =>
      dispatch({ type: "history/cancel-group", groupKey, occurredAt: now() }),
    undo: () => dispatch({ type: "history/undo", occurredAt: now() }),
    redo: () => dispatch({ type: "history/redo", occurredAt: now() }),
    newDocument: () => {
      requireReady();
      replaceDocument(createCanvasDocument(), null);
    },
    openDocument: async () => {
      requireReady();
      const startedGeneration = generation;
      const operation = ++openOperation;
      const opened = await documents.open();
      if (
        !opened ||
        generation !== startedGeneration ||
        operation !== openOperation
      ) {
        return false;
      }
      replaceDocument(opened.document, opened.path);
      return true;
    },
    saveDocument: async (saveAs = false) => {
      requireReady();
      const startedGeneration = generation;
      const document = history.present;
      // Serialize writes, not just metadata, to protect same-path saves.
      const saving = saveQueue.then(async () => {
        if (generation !== startedGeneration) return;
        const result = await documents.save(
          document,
          saveAs ? null : documentPath,
        );
        if (!result.saved || generation !== startedGeneration) return;
        documentPath = result.path;
        lastExplicitlySavedRevision = document.revision;
        publish();
      });
      // A failed save still rejects its caller without blocking subsequent saves.
      saveQueue = saving.catch(() => {});
      return saving;
    },
  };
}
