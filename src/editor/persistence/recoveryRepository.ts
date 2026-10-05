import { invoke, isTauri } from "@tauri-apps/api/core";
import type { CanvasDocument } from "../model/document";
import { parseCanvasDocumentValue } from "../model/schema";

const RECOVERY_KEY = "zyrk.editor.recovery.v1";

export type RecoverySnapshot = {
  formatVersion: 1;
  savedAt: string;
  lastExplicitlySavedRevision: number | null;
  documentPath: string | null;
  document: CanvasDocument;
};

function parseRecoverySnapshot(value: unknown): RecoverySnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid recovery snapshot");
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.formatVersion !== 1 ||
    typeof candidate.savedAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.savedAt))
  ) {
    throw new Error("Unsupported recovery snapshot");
  }
  if (
    candidate.lastExplicitlySavedRevision !== null &&
    (typeof candidate.lastExplicitlySavedRevision !== "number" ||
      !Number.isInteger(candidate.lastExplicitlySavedRevision) ||
      candidate.lastExplicitlySavedRevision < 0)
  ) {
    throw new Error("Invalid saved revision in recovery snapshot");
  }
  if (
    candidate.documentPath !== undefined &&
    candidate.documentPath !== null &&
    typeof candidate.documentPath !== "string"
  ) {
    throw new Error("Invalid document path in recovery snapshot");
  }

  return {
    formatVersion: 1,
    savedAt: candidate.savedAt,
    lastExplicitlySavedRevision: candidate.lastExplicitlySavedRevision,
    documentPath: candidate.documentPath ?? null,
    document: parseCanvasDocumentValue(candidate.document),
  };
}

function parseRecoveryJson(json: string): RecoverySnapshot | null {
  try {
    return parseRecoverySnapshot(JSON.parse(json));
  } catch {
    return null;
  }
}

function loadCachedRecovery(): RecoverySnapshot | null {
  try {
    const json = window.localStorage.getItem(RECOVERY_KEY);
    return json ? parseRecoveryJson(json) : null;
  } catch {
    return null;
  }
}

function cacheRecovery(snapshot: RecoverySnapshot): boolean {
  try {
    window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function newestSnapshot(
  snapshots: Array<RecoverySnapshot | null>,
): RecoverySnapshot | null {
  return snapshots.reduce<RecoverySnapshot | null>((newest, snapshot) => {
    if (!snapshot) return newest;
    if (!newest || Date.parse(snapshot.savedAt) > Date.parse(newest.savedAt)) {
      return snapshot;
    }
    return newest;
  }, null);
}

let pendingNativeSnapshot: RecoverySnapshot | null = null;
let nativeWriter: Promise<void> | null = null;

function queueNativeRecovery(snapshot: RecoverySnapshot): Promise<void> {
  pendingNativeSnapshot = snapshot;

  if (!nativeWriter) {
    nativeWriter = (async () => {
      while (pendingNativeSnapshot) {
        const latest = pendingNativeSnapshot;
        pendingNativeSnapshot = null;
        await invoke("save_recovery_snapshot", {
          snapshot: JSON.stringify(latest),
        });
      }
    })().finally(() => {
      nativeWriter = null;
      if (pendingNativeSnapshot) {
        void queueNativeRecovery(pendingNativeSnapshot);
      }
    });
  }

  return nativeWriter;
}

export const recoveryRepository = {
  loadCached: loadCachedRecovery,

  load: async () => {
    const cached = loadCachedRecovery();
    if (!isTauri()) return cached;

    try {
      const storedSnapshots = await invoke<string[]>(
        "load_recovery_snapshots",
      );
      return newestSnapshot([
        cached,
        ...storedSnapshots.map(parseRecoveryJson),
      ]);
    } catch {
      return cached;
    }
  },

  save: async (snapshot: RecoverySnapshot) => {
    const cached = cacheRecovery(snapshot);
    if (!isTauri()) return cached;

    try {
      await queueNativeRecovery(snapshot);
      return true;
    } catch {
      return cached;
    }
  },
};
